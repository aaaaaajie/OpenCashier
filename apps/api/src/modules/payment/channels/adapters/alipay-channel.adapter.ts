import { BadGatewayException, BadRequestException, Injectable } from "@nestjs/common";
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
  ProviderNotifyResult
} from "../payment-channel.types";

interface AlipayClientLike {
  exec(
    method: string,
    bizParams: Record<string, unknown>,
    options?: Record<string, unknown>
  ): Promise<unknown>;
  pageExecute(
    method: string,
    httpMethod: string,
    bizParams: Record<string, unknown>
  ): Promise<string> | string;
  checkNotifySignV2(postData: Record<string, unknown>): boolean;
}

type AlipayModuleLike = {
  AlipaySdk: new (config: Record<string, unknown>) => AlipayClientLike;
};

@Injectable()
export class AlipayChannelAdapter extends BasePaymentChannelAdapter {
  readonly providerCode = "ALIPAY" as const;
  readonly displayName = "支付宝";
  readonly integrationMode = "OFFICIAL_NODE_SDK" as const;
  readonly supportedChannels = ["alipay_qr", "alipay_wap"];
  readonly officialSdkPackage = "alipay-sdk";
  override readonly notifyPath = "/api/v1/notify/alipay";
  readonly note =
    "优先使用支付宝官方 Node SDK；当前已接入二维码预下单、WAP 拉起、查单、关单、退款和回调验签。";
  private clientPromise?: Promise<AlipayClientLike>;

  constructor(
    private readonly channelProviderConfigService: ChannelProviderConfigService
  ) {
    super();
  }

  isEnabled(): boolean {
    return this.channelProviderConfigService.hasAlipayConfig();
  }

  override async createSession(
    input: ChannelSessionPreviewInput
  ): Promise<ChannelSessionPreview> {
    if (!this.isEnabled()) {
      return this.buildUnavailableSession(input);
    }

    if (input.currency !== "CNY") {
      throw new BadRequestException("alipay currently only supports CNY");
    }

    if (input.channel === "alipay_qr") {
      return this.createQrSession(input);
    }

    if (input.channel === "alipay_wap") {
      return this.createWapSession(input);
    }

    return this.buildFailedSession(input, `unsupported alipay channel: ${input.channel}`);
  }

  override async queryOrder(
    input: ChannelOrderQueryInput
  ): Promise<ChannelOrderQueryResult | null> {
    if (!this.isEnabled()) {
      return null;
    }

    const client = await this.getClient();
    const response = await client.exec(
      "alipay.trade.query",
      {
        bizContent: {
          out_trade_no: input.platformOrderNo,
          trade_no: input.channelTradeNo ?? undefined
        }
      },
      {
        validateSign: Boolean(this.channelProviderConfigService.getAlipayConfig().publicKey)
      }
    );
    const payload = this.unwrapExecResponse("alipay.trade.query", response);

    if (payload.code === "40004") {
      return {
        tradeStatus: "WAIT_PAY",
        rawPayload: payload
      };
    }

    if (payload.code !== "10000") {
      throw new BadGatewayException(
        this.asOptionalString(payload.subMsg ?? payload.sub_msg ?? payload.msg) ??
          "alipay trade query failed"
      );
    }

    return {
      tradeStatus: this.mapTradeStatus(payload.tradeStatus ?? payload.trade_status),
      channelTradeNo: this.asOptionalString(payload.tradeNo ?? payload.trade_no),
      paidAmount: this.toAmountInFen(
        payload.receiptAmount ??
          payload.receipt_amount ??
          payload.buyerPayAmount ??
          payload.buyer_pay_amount ??
          payload.totalAmount ??
          payload.total_amount
      ),
      paidTime: this.normalizeAlipayTime(
        payload.sendPayDate ?? payload.send_pay_date ?? payload.gmtPayment
      ),
      rawPayload: payload
    };
  }

  override async closeOrder(
    input: ChannelOrderCloseInput
  ): Promise<ChannelOrderCloseResult | null> {
    if (!this.isEnabled()) {
      return null;
    }

    const client = await this.getClient();
    const response = await client.exec(
      "alipay.trade.close",
      {
        bizContent: {
          out_trade_no: input.platformOrderNo,
          trade_no: input.channelTradeNo ?? undefined
        }
      },
      {
        validateSign: Boolean(this.channelProviderConfigService.getAlipayConfig().publicKey)
      }
    );
    const payload = this.unwrapExecResponse("alipay.trade.close", response);

    if (payload.code === "10000") {
      return {
        tradeStatus: "CLOSED",
        channelTradeNo: this.asOptionalString(payload.tradeNo ?? payload.trade_no),
        rawPayload: payload
      };
    }

    if (payload.code === "40004") {
      return {
        tradeStatus: "UNCHANGED",
        reason:
          this.asOptionalString(payload.subMsg ?? payload.sub_msg ?? payload.msg) ??
          "alipay trade close returned unchanged",
        rawPayload: payload
      };
    }

    throw new BadGatewayException(
      this.asOptionalString(payload.subMsg ?? payload.sub_msg ?? payload.msg) ??
        "alipay trade close failed"
    );
  }

  override async refundOrder(
    input: ChannelRefundInput
  ): Promise<ChannelRefundResult | null> {
    if (!this.isEnabled()) {
      return null;
    }

    const client = await this.getClient();
    const response = await client.exec(
      "alipay.trade.refund",
      {
        bizContent: {
          out_trade_no: input.platformOrderNo,
          trade_no: input.channelTradeNo ?? undefined,
          refund_amount: this.formatAmount(input.refundAmount),
          refund_reason: input.reason,
          out_request_no: input.merchantRefundNo
        }
      },
      {
        validateSign: Boolean(this.channelProviderConfigService.getAlipayConfig().publicKey)
      }
    );
    const payload = this.unwrapExecResponse("alipay.trade.refund", response);

    if (payload.code !== "10000") {
      throw new BadGatewayException(
        this.asOptionalString(payload.subMsg ?? payload.sub_msg ?? payload.msg) ??
          "alipay trade refund failed"
      );
    }

    const refundSuccess =
      payload.fundChange === "Y" ||
      payload.fund_change === "Y" ||
      typeof this.toAmountInFen(payload.refundFee ?? payload.refund_fee) === "number";

    return {
      refundStatus: refundSuccess ? "SUCCESS" : "PROCESSING",
      channelRefundNo:
        this.asOptionalString(payload.tradeNo ?? payload.trade_no) ??
        input.platformRefundNo,
      channelTradeNo: this.asOptionalString(payload.tradeNo ?? payload.trade_no),
      successTime: this.normalizeAlipayTime(
        payload.gmtRefundPay ?? payload.gmt_refund_pay
      ),
      rawPayload: payload
    };
  }

  override async verifyNotify(
    payload: Record<string, unknown>
  ): Promise<ProviderNotifyResult> {
    const client = await this.getClient();

    if (!client.checkNotifySignV2(payload)) {
      throw new BadRequestException("invalid alipay notify signature");
    }

    const platformOrderNo = this.asOptionalString(
      payload.out_trade_no ?? payload.outTradeNo
    );
    const eventId = this.asOptionalString(payload.notify_id ?? payload.notifyId);

    if (!platformOrderNo || !eventId) {
      throw new BadRequestException("alipay notify payload is incomplete");
    }

    return {
      eventId,
      platformOrderNo,
      channelTradeNo: this.asOptionalString(payload.trade_no ?? payload.tradeNo),
      tradeStatus: this.mapTradeStatus(payload.trade_status ?? payload.tradeStatus),
      paidAmount: this.toAmountInFen(
        payload.receipt_amount ??
          payload.receiptAmount ??
          payload.total_amount ??
          payload.totalAmount
      ),
      paidTime: this.normalizeAlipayTime(
        payload.gmt_payment ?? payload.gmtPayment ?? payload.notify_time
      ),
      rawPayload: payload
    };
  }

  private async createQrSession(
    input: ChannelSessionPreviewInput
  ): Promise<ChannelSessionPreview> {
    const client = await this.getClient();
    const response = await client.exec(
      "alipay.trade.precreate",
      {
        notify_url: input.notifyUrl,
        bizContent: {
          out_trade_no: input.platformOrderNo,
          total_amount: this.formatAmount(input.amount),
          subject: input.subject,
          body: input.description,
          timeout_express: this.toTimeoutExpress(input.expireTime)
        }
      },
      {
        validateSign: Boolean(this.channelProviderConfigService.getAlipayConfig().publicKey)
      }
    );
    const payload = this.unwrapExecResponse(
      "alipay.trade.precreate",
      response
    );
    const qrContent = this.asOptionalString(payload.qrCode ?? payload.qr_code);

    if (payload.code !== "10000" || !qrContent) {
      throw new BadGatewayException(
        payload.subMsg ??
          payload.sub_msg ??
          payload.msg ??
          "alipay trade precreate failed"
      );
    }

    return this.buildSession(input.channel, {
      sessionStatus: "READY",
      actionType: "QR_CODE",
      attemptNo: input.attemptNo,
      channelRequestNo:
        this.asOptionalString(payload.outTradeNo ?? payload.out_trade_no) ??
        input.platformOrderNo,
      qrContent,
      expireTime: input.expireTime,
      providerPayload: payload
    });
  }

  private async createWapSession(
    input: ChannelSessionPreviewInput
  ): Promise<ChannelSessionPreview> {
    const client = await this.getClient();
    const payUrl = await this.pageExecuteCompat(client, "alipay.trade.wap.pay", {
      notify_url: input.notifyUrl,
      return_url: input.returnUrl,
      bizContent: {
        out_trade_no: input.platformOrderNo,
        total_amount: this.formatAmount(input.amount),
        subject: input.subject,
        body: input.description,
        product_code: "QUICK_WAP_WAY",
        quit_url: input.returnUrl,
        timeout_express: this.toTimeoutExpress(input.expireTime)
      }
    });

    return this.buildSession(input.channel, {
      sessionStatus: "READY",
      actionType: "REDIRECT_URL",
      attemptNo: input.attemptNo,
      channelRequestNo: input.platformOrderNo,
      payUrl,
      expireTime: input.expireTime,
      providerPayload: {
        method: "alipay.trade.wap.pay"
      }
    });
  }

  private async getClient(): Promise<AlipayClientLike> {
    if (!this.clientPromise) {
      this.clientPromise = this.createClient();
    }

    return this.clientPromise;
  }

  private async createClient(): Promise<AlipayClientLike> {
    const config = this.channelProviderConfigService.getAlipaySdkConfig();

    // Preserve native dynamic import so the ESM-only SDK can be loaded from this CJS Nest app.
    const loadModule = new Function(
      "modulePath",
      "return import(modulePath);"
    ) as (modulePath: string) => Promise<AlipayModuleLike>;
    const { AlipaySdk } = await loadModule("alipay-sdk");

    return new AlipaySdk({
      appId: config.appId,
      privateKey: this.normalizePem(config.privateKey),
      alipayPublicKey: config.publicKey
        ? this.normalizePem(config.publicKey)
        : undefined,
      gateway: config.gateway,
      signType: "RSA2",
      camelcase: true,
      keyType: this.detectKeyType(config.privateKey)
    }) as unknown as AlipayClientLike;
  }

  private async pageExecuteCompat(
    client: AlipayClientLike,
    method: string,
    bizParams: Record<string, unknown>
  ): Promise<string> {
    try {
      const result = await client.pageExecute(method, "GET", bizParams);

      if (typeof result === "string") {
        return result;
      }
    } catch {}

    const fallback = await (
      client.pageExecute as unknown as (
        method: string,
        bizParams: Record<string, unknown>,
        httpMethod: string
      ) => Promise<string> | string
    )(method, bizParams, "GET");

    if (typeof fallback !== "string") {
      throw new BadGatewayException("alipay pageExecute returned invalid payload");
    }

    return fallback;
  }

  private unwrapExecResponse(
    method: string,
    payload: unknown
  ): Record<string, unknown> {
    if (!payload || typeof payload !== "object") {
      return {};
    }

    const responseKey = `${method.replace(/\./g, "_")}_response`;
    const typedPayload = payload as Record<string, unknown>;

    if (typedPayload[responseKey] && typeof typedPayload[responseKey] === "object") {
      return typedPayload[responseKey] as Record<string, unknown>;
    }

    return typedPayload;
  }

  private normalizePem(content: string): string {
    return content.replace(/\\n/g, "\n").trim();
  }

  private detectKeyType(content: string): "PKCS1" | "PKCS8" {
    return content.includes("BEGIN PRIVATE KEY") ? "PKCS8" : "PKCS1";
  }

  private formatAmount(amount: number): string {
    return (amount / 100).toFixed(2);
  }

  private toAmountInFen(value: unknown): number | undefined {
    if (typeof value !== "string" && typeof value !== "number") {
      return undefined;
    }

    const amount = Number.parseFloat(String(value));

    if (Number.isNaN(amount)) {
      return undefined;
    }

    return Math.round(amount * 100);
  }

  private mapTradeStatus(value: unknown): "WAIT_PAY" | "SUCCESS" | "CLOSED" {
    if (value === "TRADE_SUCCESS" || value === "TRADE_FINISHED") {
      return "SUCCESS";
    }

    if (value === "TRADE_CLOSED") {
      return "CLOSED";
    }

    return "WAIT_PAY";
  }

  private normalizeAlipayTime(value: unknown): string | undefined {
    if (typeof value !== "string" || value.length === 0) {
      return undefined;
    }

    const normalized = value.includes("T")
      ? value
      : `${value.replace(" ", "T")}+08:00`;
    const date = new Date(normalized);

    return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
  }

  private toTimeoutExpress(expireTime: string): string {
    const milliseconds = Date.parse(expireTime) - Date.now();
    const minutes = Math.max(1, Math.ceil(milliseconds / 60_000));

    return `${minutes}m`;
  }

  private asOptionalString(value: unknown): string | undefined {
    return typeof value === "string" && value.length > 0 ? value : undefined;
  }
}
