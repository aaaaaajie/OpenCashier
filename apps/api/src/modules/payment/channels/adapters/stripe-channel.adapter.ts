import {
  BadGatewayException,
  BadRequestException,
  Injectable
} from "@nestjs/common";
import type Stripe from "stripe";
import { StripeClientService } from "../clients/stripe-client.service";
import { BasePaymentChannelAdapter } from "../base-payment-channel.adapter";
import { ChannelProviderConfigService } from "../channel-provider-config.service";
import {
  ChannelOrderCloseInput,
  ChannelOrderCloseResult,
  ChannelOrderQueryInput,
  ChannelOrderQueryResult,
  ChannelRefundInput,
  ChannelRefundResult,
  ChannelSessionPreview,
  ChannelSessionPreviewInput,
  ProviderConfigValidationResult,
  ProviderNotifyResult
} from "../payment-channel.types";

const STRIPE_API_ENDPOINT = "https://api.stripe.com";
const STRIPE_SUPPORTED_EVENTS = new Set([
  "checkout.session.completed",
  "checkout.session.expired"
]);

@Injectable()
export class StripeChannelAdapter extends BasePaymentChannelAdapter {
  readonly providerCode = "STRIPE" as const;
  readonly displayName = "Stripe";
  readonly integrationMode = "OFFICIAL_NODE_SDK" as const;
  readonly supportedChannels = ["stripe_checkout"];
  readonly officialSdkPackage = "stripe";
  override readonly notifyPath = "/api/v1/notify/stripe";
  readonly note =
    "首期已接入 Stripe Hosted Checkout、查单、会话失效、退款和 webhook 验签；当前仅开放 card。";

  constructor(
    private readonly channelProviderConfigService: ChannelProviderConfigService,
    private readonly stripeClientService: StripeClientService
  ) {
    super();
  }

  isEnabled(): boolean {
    return this.channelProviderConfigService.hasStripeConfig();
  }

  override buildNotifyUrl(appBaseUrl: string, appId?: string): string | undefined {
    const baseUrl = appBaseUrl.replace(/\/$/, "");

    if (!this.notifyPath) {
      return undefined;
    }

    return appId
      ? `${baseUrl}${this.notifyPath}/${encodeURIComponent(appId)}`
      : `${baseUrl}${this.notifyPath}`;
  }

  override async createSession(
    input: ChannelSessionPreviewInput
  ): Promise<ChannelSessionPreview> {
    if (!this.isEnabled()) {
      return this.buildUnavailableSession(input);
    }

    const successUrl = input.returnUrl ?? input.cancelUrl;
    const cancelUrl = input.cancelUrl ?? input.returnUrl;

    if (!successUrl || !cancelUrl) {
      throw new BadRequestException(
        "stripe checkout requires both success and cancel return URLs"
      );
    }

    const expiresAt = this.resolveCheckoutSessionExpiry(input.expireTime);

    if (!expiresAt) {
      return this.buildFailedSession(
        input,
        "Stripe Checkout 要求会话过期时间至少比当前时间晚 30 分钟。请延长订单有效期后重试。"
      );
    }

    try {
      const session = await this.stripeClientService.createCheckoutSession(
        {
          mode: "payment",
          payment_method_types: ["card"],
          success_url: successUrl,
          cancel_url: cancelUrl,
          client_reference_id: input.platformOrderNo,
          expires_at: expiresAt,
          line_items: [
            {
              quantity: 1,
              price_data: {
                currency: input.currency.toLowerCase(),
                unit_amount: input.amount,
                product_data: {
                  name: input.subject,
                  description: input.description ?? undefined
                }
              }
            }
          ],
          metadata: this.buildSessionMetadata(input)
        },
        `checkout_session:${input.attemptNo ?? input.platformOrderNo}`
      );

      if (!session.url) {
        throw new BadGatewayException(
          "stripe checkout session did not return a redirect URL"
        );
      }

      return this.buildSession(input.channel, {
        sessionStatus: "READY",
        actionType: "REDIRECT_URL",
        attemptNo: input.attemptNo,
        channelRequestNo: session.id,
        channelTradeNo: this.extractPaymentIntentId(session.payment_intent),
        payUrl: session.url,
        expireTime: this.toIsoTime(session.expires_at) ?? input.expireTime,
        providerPayload: this.buildSessionPayload(session)
      });
    } catch (error) {
      throw this.toGatewayException(error, "stripe checkout session create failed");
    }
  }

  override async queryOrder(
    input: ChannelOrderQueryInput
  ): Promise<ChannelOrderQueryResult | null> {
    if (!this.isEnabled()) {
      return null;
    }

    if (input.channelRequestNo) {
      try {
        const session = await this.stripeClientService.retrieveCheckoutSession(
          input.channelRequestNo,
          {
            expand: ["payment_intent"]
          }
        );

        return {
          tradeStatus: this.mapCheckoutTradeStatus(session),
          channelTradeNo: this.extractPaymentIntentId(session.payment_intent),
          paidAmount: session.amount_total ?? undefined,
          rawPayload: this.buildSessionPayload(session)
        };
      } catch (error) {
        throw this.toGatewayException(error, "stripe checkout session query failed");
      }
    }

    if (!input.channelTradeNo) {
      return {
        tradeStatus: "WAIT_PAY",
        rawPayload: {
          reason: "missing stripe checkout session id"
        }
      };
    }

    try {
      const paymentIntent = await this.stripeClientService.retrievePaymentIntent(
        input.channelTradeNo
      );

      return {
        tradeStatus: this.mapPaymentIntentTradeStatus(paymentIntent.status),
        channelTradeNo: paymentIntent.id,
        paidAmount: paymentIntent.amount_received || paymentIntent.amount,
        rawPayload: {
          paymentIntent
        }
      };
    } catch (error) {
      throw this.toGatewayException(error, "stripe payment intent query failed");
    }
  }

  override async closeOrder(
    input: ChannelOrderCloseInput
  ): Promise<ChannelOrderCloseResult | null> {
    if (!this.isEnabled()) {
      return null;
    }

    if (!input.channelRequestNo) {
      return {
        tradeStatus: "UNCHANGED",
        channelTradeNo: input.channelTradeNo ?? undefined,
        reason: "missing stripe checkout session id"
      };
    }

    try {
      const session = await this.stripeClientService.retrieveCheckoutSession(
        input.channelRequestNo
      );

      if (this.mapCheckoutTradeStatus(session) !== "WAIT_PAY") {
        return {
          tradeStatus: "UNCHANGED",
          channelTradeNo: this.extractPaymentIntentId(session.payment_intent),
          reason:
            session.payment_status === "paid"
              ? "stripe checkout session is already paid"
              : "stripe checkout session is already closed",
          rawPayload: this.buildSessionPayload(session)
        };
      }

      const expiredSession = await this.stripeClientService.expireCheckoutSession(
        input.channelRequestNo
      );

      return {
        tradeStatus: "CLOSED",
        channelTradeNo: this.extractPaymentIntentId(expiredSession.payment_intent),
        rawPayload: this.buildSessionPayload(expiredSession)
      };
    } catch (error) {
      throw this.toGatewayException(error, "stripe checkout session close failed");
    }
  }

  override async refundOrder(
    input: ChannelRefundInput
  ): Promise<ChannelRefundResult | null> {
    if (!this.isEnabled()) {
      return null;
    }

    if (!input.channelTradeNo) {
      throw new BadRequestException("stripe refund requires payment_intent id");
    }

    try {
      const refund = await this.stripeClientService.createRefund(
        {
          payment_intent: input.channelTradeNo,
          amount: input.refundAmount,
          metadata: {
            platformOrderNo: input.platformOrderNo,
            platformRefundNo: input.platformRefundNo,
            merchantRefundNo: input.merchantRefundNo,
            reason: input.reason
          }
        },
        `refund:${input.platformRefundNo}`
      );

      if (refund.status === "failed" || refund.status === "canceled") {
        throw new BadGatewayException(
          refund.failure_reason ?? "stripe refund request failed"
        );
      }

      return {
        refundStatus: refund.status === "succeeded" ? "SUCCESS" : "PROCESSING",
        channelRefundNo: refund.id,
        channelTradeNo: this.extractPaymentIntentId(refund.payment_intent),
        successTime:
          refund.status === "succeeded" ? this.toIsoTime(refund.created) : undefined,
        rawPayload: {
          refund
        }
      };
    } catch (error) {
      throw this.toGatewayException(error, "stripe refund failed");
    }
  }

  override async validateConfig(): Promise<ProviderConfigValidationResult> {
    const config = this.channelProviderConfigService.getStripeConfig();
    const details = {
      endpoint: STRIPE_API_ENDPOINT,
      secretKeyPrefix: config.secretKey?.slice(0, 8) ?? null,
      webhookSecretPrefix: config.webhookSecret?.slice(0, 8) ?? null
    };

    if (!this.isEnabled()) {
      return this.buildValidationResult(
        "FAILED",
        "Stripe 配置不完整，至少需要 Secret Key 和 Webhook Signing Secret。",
        details
      );
    }

    if (!config.secretKey?.startsWith("sk_")) {
      return this.buildValidationResult(
        "FAILED",
        "STRIPE_SECRET_KEY 格式无效，应以 sk_ 开头。",
        details
      );
    }

    if (!config.webhookSecret?.startsWith("whsec_")) {
      return this.buildValidationResult(
        "FAILED",
        "STRIPE_WEBHOOK_SECRET 格式无效，应以 whsec_ 开头。",
        details
      );
    }

    try {
      const balance = await this.stripeClientService.validateCredentials();

      return this.buildValidationResult("SUCCESS", "Stripe 配置验证通过。", {
        ...details,
        livemode: balance.livemode,
        availableCurrencies: balance.available.map((item) => item.currency)
      });
    } catch (error) {
      return this.buildValidationResult(
        "FAILED",
        error instanceof Error ? error.message : "Stripe 配置验证失败",
        details
      );
    }
  }

  async verifyCheckoutNotify(input: {
    headers: Record<string, string | string[] | undefined>;
    body: string;
    appId?: string;
  }): Promise<ProviderNotifyResult & { eventType: string }> {
    const signature = this.resolveSignature(input.headers);

    if (!signature) {
      throw new BadRequestException("missing stripe-signature header");
    }

    const event = this.stripeClientService.constructWebhookEvent({
      body: input.body,
      signature,
      appId: input.appId
    });

    if (!STRIPE_SUPPORTED_EVENTS.has(event.type)) {
      throw new BadRequestException(`unsupported stripe event type: ${event.type}`);
    }

    const session = this.asCheckoutSession(event.data.object);
    const platformOrderNo =
      this.asOptionalString(session.metadata?.platformOrderNo) ??
      this.asOptionalString(session.client_reference_id);

    if (!platformOrderNo) {
      throw new BadRequestException("stripe checkout session is missing platformOrderNo");
    }

    return {
      eventId: event.id,
      eventType: event.type,
      attemptNo: this.asOptionalString(session.metadata?.attemptNo),
      platformOrderNo,
      channelRequestNo: session.id,
      channelTradeNo: this.extractPaymentIntentId(session.payment_intent),
      tradeStatus: this.mapCheckoutTradeStatus(session, event.type),
      paidAmount: session.amount_total ?? undefined,
      rawPayload: {
        event,
        session
      }
    };
  }

  private buildSessionMetadata(
    input: ChannelSessionPreviewInput
  ): Record<string, string> {
    return {
      platformOrderNo: input.platformOrderNo,
      merchantOrderNo: input.merchantOrderNo,
      channel: input.channel,
      ...(input.attemptNo ? { attemptNo: input.attemptNo } : {})
    };
  }

  private buildSessionPayload(
    session: Stripe.Checkout.Session
  ): Record<string, unknown> {
    return {
      checkoutSessionId: session.id,
      checkoutUrl: session.url,
      status: session.status,
      paymentStatus: session.payment_status,
      paymentIntentId: this.extractPaymentIntentId(session.payment_intent),
      customerEmail: session.customer_details?.email ?? undefined
    };
  }

  private mapCheckoutTradeStatus(
    session: Stripe.Checkout.Session,
    eventType?: string
  ): "WAIT_PAY" | "SUCCESS" | "CLOSED" {
    if (session.payment_status === "paid") {
      return "SUCCESS";
    }

    if (eventType === "checkout.session.expired" || session.status === "expired") {
      return "CLOSED";
    }

    return "WAIT_PAY";
  }

  private mapPaymentIntentTradeStatus(
    status: Stripe.PaymentIntent.Status
  ): "WAIT_PAY" | "SUCCESS" | "CLOSED" {
    if (status === "succeeded") {
      return "SUCCESS";
    }

    if (status === "canceled") {
      return "CLOSED";
    }

    return "WAIT_PAY";
  }

  private asCheckoutSession(
    value: Stripe.Event.Data.Object
  ): Stripe.Checkout.Session {
    if (!this.isCheckoutSessionObject(value)) {
      throw new BadRequestException("stripe webhook payload is not a checkout.session");
    }

    return value;
  }

  private resolveSignature(
    headers: Record<string, string | string[] | undefined>
  ): string | undefined {
    const value = headers["stripe-signature"];

    if (typeof value === "string") {
      return value.trim() || undefined;
    }

    if (Array.isArray(value)) {
      return value.find(
        (item): item is string => typeof item === "string" && item.trim().length > 0
      );
    }

    return undefined;
  }

  private extractPaymentIntentId(
    value:
      | string
      | Stripe.PaymentIntent
      | null
      | undefined
  ): string | undefined {
    if (!value) {
      return undefined;
    }

    return typeof value === "string" ? value : value.id;
  }

  private isCheckoutSessionObject(
    value: Stripe.Event.Data.Object
  ): value is Stripe.Checkout.Session {
    if (!value || typeof value !== "object") {
      return false;
    }

    const candidate = value as { object?: unknown };
    return candidate.object === "checkout.session";
  }

  private toIsoTime(value: number | null | undefined): string | undefined {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      return undefined;
    }

    return new Date(value * 1000).toISOString();
  }

  private resolveCheckoutSessionExpiry(value: string): number | null {
    const timestamp = Math.floor(new Date(value).getTime() / 1000);
    const now = Math.floor(Date.now() / 1000);

    if (!Number.isFinite(timestamp) || timestamp <= 0) {
      throw new BadRequestException("invalid stripe checkout expireTime");
    }

    if (timestamp - now < 30 * 60) {
      return null;
    }

    if (timestamp - now > 24 * 60 * 60) {
      throw new BadRequestException(
        "stripe checkout expireTime must be within 24 hours"
      );
    }

    return timestamp;
  }

  private asOptionalString(value: unknown): string | undefined {
    return typeof value === "string" && value.trim().length > 0 ? value : undefined;
  }

  private toGatewayException(error: unknown, fallback: string): BadGatewayException {
    return new BadGatewayException(
      error instanceof Error && error.message ? error.message : fallback
    );
  }
}
