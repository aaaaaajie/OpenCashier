import {
  BadGatewayException,
  BadRequestException,
  Injectable
} from "@nestjs/common";
import { createHash } from "node:crypto";
import {
  WechatPayApiError,
  WechatPayClient,
  type WechatPayNotificationEnvelope,
  type WechatPayPaymentNotificationResource
} from "@payment-platform/wechatpay-sdk";
import { BasePaymentChannelAdapter } from "../base-payment-channel.adapter";
import { ChannelProviderConfigService } from "../channel-provider-config.service";
import {
  ChannelOrderCloseInput,
  ChannelOrderCloseResult,
  ChannelOrderQueryInput,
  ChannelOrderQueryResult,
  ChannelSessionPreview,
  ChannelSessionPreviewInput,
  ProviderConfigValidationResult,
  ProviderNotifyResult
} from "../payment-channel.types";

@Injectable()
export class WechatPayChannelAdapter extends BasePaymentChannelAdapter {
  readonly providerCode = "WECHAT_PAY" as const;
  readonly displayName = "微信支付";
  readonly integrationMode = "DIRECT_API" as const;
  readonly supportedChannels = ["wechat_qr"];
  readonly note =
    "当前已接入微信支付 Native 二维码下单、查单、关单和支付回调验签；JSAPI 作为第二阶段能力另行补齐。";
  readonly officialSdkPackage = undefined;
  override readonly notifyPath = "/api/v1/notify/wechatpay";
  private clientPromise?: Promise<WechatPayClient>;
  private clientCacheKey?: string;

  constructor(
    private readonly channelProviderConfigService: ChannelProviderConfigService
  ) {
    super();
  }

  isEnabled(): boolean {
    return this.channelProviderConfigService.hasWechatPayConfig();
  }

  override async createSession(
    input: ChannelSessionPreviewInput
  ): Promise<ChannelSessionPreview> {
    if (!this.isEnabled()) {
      return this.buildUnavailableSession(input);
    }

    if (input.currency !== "CNY") {
      throw new BadRequestException("wechatpay currently only supports CNY");
    }

    if (input.channel !== "wechat_qr") {
      return this.buildFailedSession(
        input,
        `unsupported wechatpay channel: ${input.channel}`
      );
    }

    const client = await this.getClient();
    const payload = await client.createNativeTransaction({
      description: input.subject,
      out_trade_no: input.platformOrderNo,
      notify_url: input.notifyUrl,
      time_expire: input.expireTime,
      amount: {
        total: input.amount,
        currency: input.currency
      },
      attach: input.description
    });

    if (!payload.code_url) {
      throw new BadGatewayException("wechatpay native transaction did not return code_url");
    }

    return this.buildSession(input.channel, {
      sessionStatus: "READY",
      actionType: "QR_CODE",
      attemptNo: input.attemptNo,
      channelRequestNo: input.platformOrderNo,
      qrContent: payload.code_url,
      expireTime: input.expireTime,
      providerPayload: {
        ...payload,
        __cashierEnv: {
          provider: "WECHAT_PAY",
          mode: "LIVE",
          recommendedAction: "SCAN_QR"
        }
      }
    });
  }

  override async queryOrder(
    input: ChannelOrderQueryInput
  ): Promise<ChannelOrderQueryResult | null> {
    if (!this.isEnabled()) {
      return null;
    }

    try {
      const client = await this.getClient();
      const payload = await client.queryTransactionByOutTradeNo(input.platformOrderNo);

      return {
        tradeStatus: this.mapTradeStatus(payload.trade_state),
        channelTradeNo: this.asOptionalString(payload.transaction_id),
        paidAmount: this.resolvePaidAmount(payload.amount),
        paidTime: this.normalizeTime(payload.success_time),
        rawPayload: payload as unknown as Record<string, unknown>
      };
    } catch (error) {
      if (
        error instanceof WechatPayApiError &&
        error.statusCode === 404 &&
        error.code === "ORDER_NOT_EXIST"
      ) {
        return {
          tradeStatus: "WAIT_PAY",
          rawPayload: {
            code: error.code,
            message: error.message
          }
        };
      }

      throw this.toGatewayException(error, "wechatpay order query failed");
    }
  }

  override async closeOrder(
    input: ChannelOrderCloseInput
  ): Promise<ChannelOrderCloseResult | null> {
    if (!this.isEnabled()) {
      return null;
    }

    try {
      const client = await this.getClient();
      await client.closeTransactionByOutTradeNo(input.platformOrderNo);

      return {
        tradeStatus: "CLOSED",
        channelTradeNo: input.channelTradeNo ?? undefined
      };
    } catch (error) {
      if (
        error instanceof WechatPayApiError &&
        this.isCloseUnchangedError(error.code)
      ) {
        return {
          tradeStatus: "UNCHANGED",
          reason: error.message,
          rawPayload: {
            code: error.code,
            message: error.message
          }
        };
      }

      throw this.toGatewayException(error, "wechatpay order close failed");
    }
  }

  override async validateConfig(): Promise<ProviderConfigValidationResult> {
    const config = this.channelProviderConfigService.getWechatPayConfig();
    const details = {
      verifyMode: config.verifyMode,
      mchId: config.mchId,
      appId: config.appId,
      mchSerialNo: config.mchSerialNo,
      verifierSerial:
        config.verifyMode === "CERT"
          ? config.platformCertSerialNo
          : config.publicKeyId,
      endpoint: "https://api.mch.weixin.qq.com"
    };

    if (!this.isEnabled()) {
      return this.buildValidationResult(
        "FAILED",
        "微信支付配置不完整，无法执行在线验证。",
        details
      );
    }

    const probeOrderNo = `CFGWX${Date.now()}${Math.random()
      .toString(36)
      .slice(2, 8)}`
      .toUpperCase()
      .slice(0, 32);

    try {
      const client = await this.getClient();
      await client.queryTransactionByOutTradeNo(probeOrderNo);

      return this.buildValidationResult(
        "SUCCESS",
        "微信支付配置验证通过。",
        {
          ...details,
          probeMethod: "GET /v3/pay/transactions/out-trade-no/{out_trade_no}",
          probeOrderNo,
          probeResult: "SUCCESS_RESPONSE"
        }
      );
    } catch (error) {
      if (
        error instanceof WechatPayApiError &&
        error.statusCode === 404 &&
        error.code === "ORDER_NOT_EXIST"
      ) {
        return this.buildValidationResult(
          "SUCCESS",
          "微信支付配置验证通过，已完成 API v3 请求签名与应答验签探针。",
          {
            ...details,
            probeMethod: "GET /v3/pay/transactions/out-trade-no/{out_trade_no}",
            probeOrderNo,
            probeResult: error.code
          }
        );
      }

      return this.buildValidationResult(
        "FAILED",
        error instanceof Error ? error.message : "微信支付配置验证失败",
        {
          ...details,
          probeMethod: "GET /v3/pay/transactions/out-trade-no/{out_trade_no}",
          probeOrderNo
        }
      );
    }
  }

  async verifyPaymentNotify(input: {
    headers: Record<string, string | string[] | undefined>;
    body: string;
  }): Promise<ProviderNotifyResult & { eventType: string }> {
    const client = await this.getClient();
    const { notification, resource } =
      client.verifyAndDecryptNotification<WechatPayPaymentNotificationResource>({
        headers: input.headers,
        body: input.body
      });

    const platformOrderNo = this.asOptionalString(resource.out_trade_no);
    const eventId = this.asOptionalString(notification.id);

    if (!platformOrderNo || !eventId) {
      throw new BadRequestException("wechatpay notify payload is incomplete");
    }

    return {
      eventId,
      eventType: notification.event_type,
      platformOrderNo,
      channelTradeNo: this.asOptionalString(resource.transaction_id),
      tradeStatus: this.mapTradeStatus(resource.trade_state),
      paidAmount: this.resolvePaidAmount(resource.amount),
      paidTime: this.normalizeTime(resource.success_time),
      rawPayload: this.buildNotifyPayload(notification, resource)
    };
  }

  private buildNotifyPayload(
    notification: WechatPayNotificationEnvelope,
    resource: WechatPayPaymentNotificationResource
  ): Record<string, unknown> {
    return {
      notification,
      resource
    };
  }

  private async getClient(): Promise<WechatPayClient> {
    const clientConfig = this.channelProviderConfigService.getWechatPayClientConfig();
    const cacheKey = createHash("sha256")
      .update(JSON.stringify(clientConfig))
      .digest("hex");

    if (!this.clientPromise || this.clientCacheKey !== cacheKey) {
      this.clientCacheKey = cacheKey;
      this.clientPromise = Promise.resolve(
        new WechatPayClient({
          appId: clientConfig.appId,
          mchId: clientConfig.mchId,
          mchSerialNo: clientConfig.mchSerialNo,
          apiV3Key: clientConfig.apiV3Key,
          privateKey: clientConfig.privateKey,
          ...(clientConfig.verifyMode === "CERT"
            ? {
                wechatPayPlatformCertSerialNo: clientConfig.platformCertSerialNo,
                wechatPayPlatformCert: clientConfig.platformCert
              }
            : {
                wechatPayPublicKeyId: clientConfig.publicKeyId,
                wechatPayPublicKey: clientConfig.publicKey
              })
        })
      );
    }

    return this.clientPromise;
  }

  private mapTradeStatus(value: string | undefined): "WAIT_PAY" | "SUCCESS" | "CLOSED" {
    if (value === "SUCCESS" || value === "REFUND") {
      return "SUCCESS";
    }

    if (value === "CLOSED" || value === "REVOKED" || value === "PAYERROR") {
      return "CLOSED";
    }

    return "WAIT_PAY";
  }

  private resolvePaidAmount(
    amount:
      | {
          payer_total?: number;
          total?: number;
        }
      | undefined
  ): number | undefined {
    if (!amount) {
      return undefined;
    }

    return amount.payer_total ?? amount.total;
  }

  private normalizeTime(value: string | undefined): string | undefined {
    if (!value) {
      return undefined;
    }

    const time = new Date(value);
    return Number.isNaN(time.getTime()) ? undefined : time.toISOString();
  }

  private asOptionalString(value: unknown): string | undefined {
    return typeof value === "string" && value.trim().length > 0 ? value : undefined;
  }

  private isCloseUnchangedError(code: string | undefined): boolean {
    return (
      code === "ORDER_NOT_EXIST" ||
      code === "INVALID_REQUEST" ||
      code === "TRADE_ERROR" ||
      code === "RULE_LIMIT" ||
      code === "FREQUENCY_LIMITED"
    );
  }

  private toGatewayException(error: unknown, fallback: string): BadGatewayException {
    if (error instanceof WechatPayApiError) {
      return new BadGatewayException(error.message || fallback);
    }

    return new BadGatewayException(error instanceof Error ? error.message : fallback);
  }
}
