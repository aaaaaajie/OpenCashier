import { Injectable } from "@nestjs/common";
import { createHash } from "node:crypto";
import Stripe from "stripe";
import { ChannelProviderConfigService } from "../channel-provider-config.service";

const STRIPE_API_VERSION = "2026-02-25.clover";

@Injectable()
export class StripeClientService {
  private client?: Stripe;
  private clientCacheKey?: string;

  constructor(
    private readonly channelProviderConfigService: ChannelProviderConfigService
  ) {}

  async createCheckoutSession(
    params: Stripe.Checkout.SessionCreateParams,
    idempotencyKey?: string
  ): Promise<Stripe.Checkout.Session> {
    const client = this.getClient();

    return client.checkout.sessions.create(
      params,
      idempotencyKey ? { idempotencyKey } : undefined
    );
  }

  async retrieveCheckoutSession(
    sessionId: string,
    params?: Stripe.Checkout.SessionRetrieveParams
  ): Promise<Stripe.Checkout.Session> {
    return this.getClient().checkout.sessions.retrieve(sessionId, params);
  }

  async expireCheckoutSession(
    sessionId: string
  ): Promise<Stripe.Checkout.Session> {
    return this.getClient().checkout.sessions.expire(sessionId);
  }

  async retrievePaymentIntent(
    paymentIntentId: string
  ): Promise<Stripe.PaymentIntent> {
    return this.getClient().paymentIntents.retrieve(paymentIntentId);
  }

  async createRefund(
    params: Stripe.RefundCreateParams,
    idempotencyKey?: string
  ): Promise<Stripe.Refund> {
    return this.getClient().refunds.create(
      params,
      idempotencyKey ? { idempotencyKey } : undefined
    );
  }

  constructWebhookEvent(input: {
    body: string;
    signature: string;
  }): Stripe.Event {
    const { webhookSecret } =
      this.channelProviderConfigService.getStripeClientConfig();

    return this.getClient().webhooks.constructEvent(
      input.body,
      input.signature,
      webhookSecret
    );
  }

  async validateCredentials(): Promise<Stripe.Balance> {
    return this.getClient().balance.retrieve();
  }

  private getClient(): Stripe {
    const clientConfig = this.channelProviderConfigService.getStripeClientConfig();
    const cacheKey = createHash("sha256")
      .update(JSON.stringify(clientConfig))
      .digest("hex");

    if (!this.client || this.clientCacheKey !== cacheKey) {
      this.clientCacheKey = cacheKey;
      this.client = new Stripe(clientConfig.secretKey, {
        apiVersion: STRIPE_API_VERSION,
        maxNetworkRetries: 2,
        typescript: true
      });
    }

    return this.client;
  }
}
