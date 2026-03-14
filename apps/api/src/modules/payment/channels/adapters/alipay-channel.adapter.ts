import { BadGatewayException, BadRequestException, Injectable } from "@nestjs/common";
import { createHash } from "node:crypto";
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
  curl(
    httpMethod: string,
    path: string,
    options?: Record<string, unknown>
  ): Promise<unknown>;
  checkNotifySignV2(postData: Record<string, unknown>): boolean;
}

type AlipayModuleLike = {
  AlipaySdk: new (config: Record<string, unknown>) => AlipayClientLike;
};

const ALIPAY_SANDBOX_GUIDE_URL =
  "https://opendocs.alipay.com/open/00dn7o?pathHash=c1e36251";

@Injectable()
export class AlipayChannelAdapter extends BasePaymentChannelAdapter {
  readonly providerCode = "ALIPAY" as const;
  readonly displayName = "支付宝";
  readonly integrationMode = "OFFICIAL_NODE_SDK" as const;
  readonly supportedChannels = ["alipay_qr", "alipay_page", "alipay_wap"];
  readonly officialSdkPackage = "alipay-sdk";
  override readonly notifyPath = "/api/v1/notify/alipay";
  readonly note =
    "优先使用支付宝官方 Node SDK；当前已接入二维码预下单、电脑网站支付、WAP 拉起、查单、关单、退款和回调验签。";
  private clientPromise?: Promise<AlipayClientLike>;
  private clientCacheKey?: string;

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

    if (input.channel === "alipay_page") {
      return this.createPageSession(input);
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
        validateSign: this.channelProviderConfigService.hasAlipayVerifyConfig()
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
        validateSign: this.channelProviderConfigService.hasAlipayVerifyConfig()
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
        validateSign: this.channelProviderConfigService.hasAlipayVerifyConfig()
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

  override async validateConfig(): Promise<ProviderConfigValidationResult> {
    const config = this.channelProviderConfigService.getAlipayConfig();
    const capabilities =
      this.channelProviderConfigService.getAlipayProductCapabilities();
    const details = {
      authMode: config.authMode,
      gateway: config.gateway,
      capabilities,
      endpoint: config.gateway
        ? this.resolveEndpointFromGateway(config.gateway)
        : undefined
    };

    if (!this.isEnabled()) {
      return this.buildValidationResult(
        "FAILED",
        "支付宝配置不完整，无法执行在线验证。",
        details
      );
    }

    try {
      const client = await this.getClient();
      const probeOrderNo = this.buildValidationProbeOrderNo("QUERY");
      const response = await client.exec(
        "alipay.trade.query",
        {
          bizContent: {
            out_trade_no: probeOrderNo
          }
        },
        {
          validateSign: this.channelProviderConfigService.hasAlipayVerifyConfig()
        }
      );
      const payload = this.unwrapExecResponse("alipay.trade.query", response);
      const responseCode = this.asOptionalString(payload.code);
      const responseSubCode = this.asOptionalString(
        payload.subCode ?? payload.sub_code
      );
      const responseMessage = this.asOptionalString(
        payload.subMsg ?? payload.sub_msg ?? payload.msg
      );

      if (responseCode !== "10000" && responseCode !== "40004") {
        return this.buildValidationResult("FAILED", responseMessage ?? "支付宝配置验证未通过。", {
          ...details,
          responseCode,
          responseSubCode,
          probeMethod: "alipay.trade.query",
          probeOrderNo
        });
      }

      const capabilityChecks = await this.validateConfiguredCapabilities(
        client,
        capabilities
      );

      return this.buildValidationResult(
        "SUCCESS",
        this.buildValidationSuccessMessage(capabilities, capabilityChecks),
        {
          ...details,
          responseCode,
          responseSubCode,
          probeMethod: "alipay.trade.query",
          probeOrderNo,
          capabilityChecks
        }
      );
    } catch (error) {
      return this.buildValidationResult(
        "FAILED",
        error instanceof Error ? error.message : "支付宝配置验证失败",
        details
      );
    }
  }

  private async validateConfiguredCapabilities(
    client: AlipayClientLike,
    capabilities: string[]
  ): Promise<Record<string, string>> {
    const checks: Record<string, string> = {};

    if (capabilities.includes("PAGE")) {
      const payUrl = await this.pageExecuteCompat(
        client,
        "alipay.trade.page.pay",
        {
          notify_url: "https://example.com/api/v1/notify/alipay",
          return_url: "https://example.com/payment/return",
          bizContent: {
            out_trade_no: this.buildValidationProbeOrderNo("PAGE"),
            total_amount: "0.01",
            subject: "平台配置验证",
            product_code: "FAST_INSTANT_TRADE_PAY",
            timeout_express: "5m"
          }
        }
      );

      checks.PAGE = this.validateGeneratedPayUrl(payUrl, "alipay.trade.page.pay");
    }

    if (capabilities.includes("WAP")) {
      const payUrl = await this.pageExecuteCompat(
        client,
        "alipay.trade.wap.pay",
        {
          notify_url: "https://example.com/api/v1/notify/alipay",
          return_url: "https://example.com/payment/return",
          bizContent: {
            out_trade_no: this.buildValidationProbeOrderNo("WAP"),
            total_amount: "0.01",
            subject: "平台配置验证",
            product_code: "QUICK_WAP_WAY",
            quit_url: "https://example.com/payment/cancel",
            timeout_express: "5m"
          }
        }
      );

      checks.WAP = this.validateGeneratedPayUrl(payUrl, "alipay.trade.wap.pay");
    }

    if (capabilities.includes("QR")) {
      checks.QR = "SKIPPED_REAL_PROBE_REQUIRED";
    }

    return checks;
  }

  private validateGeneratedPayUrl(payUrl: string, method: string): string {
    const normalizedUrl = payUrl.trim();

    if (!normalizedUrl.startsWith("http")) {
      throw new BadGatewayException(`${method} did not return a valid pay url`);
    }

    const url = new URL(normalizedUrl);

    if (!url.searchParams.get("sign")) {
      throw new BadGatewayException(`${method} did not include sign in pay url`);
    }

    return "URL_SIGNED";
  }

  private buildValidationSuccessMessage(
    capabilities: string[],
    capabilityChecks: Record<string, string>
  ): string {
    const validatedCapabilities = capabilities
      .map((capability) => {
        const check = capabilityChecks[capability];

        if (!check) {
          return undefined;
        }

        if (check === "SKIPPED_REAL_PROBE_REQUIRED") {
          return `${capability} 已声明，未执行真实交易探测`;
        }

        return `${capability} 已完成签名校验`;
      })
      .filter((item): item is string => Boolean(item));

    if (validatedCapabilities.length === 0) {
      return "支付宝配置验证通过。";
    }

    return `支付宝配置验证通过。${validatedCapabilities.join("；")}。`;
  }

  private buildValidationProbeOrderNo(prefix: string): string {
    return `CFG${prefix}${Date.now()}${Math.random().toString(36).slice(2, 8)}`
      .toUpperCase()
      .slice(0, 64);
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
        validateSign: this.channelProviderConfigService.hasAlipayVerifyConfig()
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
      providerPayload: {
        ...payload,
        ...this.buildCashierMetadata("SCAN_QR")
      }
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
        method: "alipay.trade.wap.pay",
        ...this.buildCashierMetadata("OPEN_WAP")
      }
    });
  }

  private async createPageSession(
    input: ChannelSessionPreviewInput
  ): Promise<ChannelSessionPreview> {
    const client = await this.getClient();
    const payUrl = await this.pageExecuteCompat(client, "alipay.trade.page.pay", {
      notify_url: input.notifyUrl,
      return_url: input.returnUrl,
      bizContent: {
        out_trade_no: input.platformOrderNo,
        total_amount: this.formatAmount(input.amount),
        subject: input.subject,
        body: input.description,
        product_code: "FAST_INSTANT_TRADE_PAY",
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
        method: "alipay.trade.page.pay",
        ...this.buildCashierMetadata("OPEN_PAGE")
      }
    });
  }

  private buildCashierMetadata(
    recommendedAction: "SCAN_QR" | "OPEN_PAGE" | "OPEN_WAP"
  ) {
    const gateway = this.channelProviderConfigService.getAlipayConfig().gateway;
    const sandbox = this.isSandboxGateway(gateway);

    return {
      __cashierEnv: {
        provider: "ALIPAY",
        mode: sandbox ? "SANDBOX" : "LIVE",
        gateway,
        guideUrl: ALIPAY_SANDBOX_GUIDE_URL,
        hint: sandbox
          ? "当前为支付宝沙箱环境，请使用支付宝沙箱版 App 和沙箱买家账号测试。"
          : undefined,
        recommendedAction
      }
    };
  }

  private isSandboxGateway(gateway: string | undefined): boolean {
    if (!gateway) {
      return false;
    }

    return /sandbox|alipaydev\.com/i.test(gateway);
  }

  private async getClient(): Promise<AlipayClientLike> {
    const sdkConfig = this.channelProviderConfigService.getAlipaySdkConfig();
    const cacheKey = createHash("sha256")
      .update(JSON.stringify(sdkConfig))
      .digest("hex");

    if (!this.clientPromise || this.clientCacheKey !== cacheKey) {
      this.clientCacheKey = cacheKey;
      this.clientPromise = this.createClient(sdkConfig);
    }

    return this.clientPromise;
  }

  private async createClient(
    config: ReturnType<ChannelProviderConfigService["getAlipaySdkConfig"]>
  ): Promise<AlipayClientLike> {
    // Preserve native dynamic import so the ESM-only SDK can be loaded from this CJS Nest app.
    const loadModule = new Function(
      "modulePath",
      "return import(modulePath);"
    ) as (modulePath: string) => Promise<AlipayModuleLike>;
    const { AlipaySdk } = await loadModule("alipay-sdk");

    const baseConfig = {
      appId: config.appId,
      privateKey: this.normalizeMultilineContent(config.privateKey),
      gateway: config.gateway,
      endpoint: this.resolveEndpointFromGateway(config.gateway),
      signType: "RSA2",
      camelcase: true,
      keyType: this.detectKeyType(config.privateKey)
    };

    if (config.authMode === "CERT") {
      return new AlipaySdk({
        ...baseConfig,
        appCertContent: this.normalizeMultilineContent(config.appCert),
        alipayPublicCertContent: this.normalizeMultilineContent(
          config.alipayPublicCert
        ),
        alipayRootCertContent: this.normalizeMultilineContent(
          config.alipayRootCert
        )
      }) as unknown as AlipayClientLike;
    }

    return new AlipaySdk({
      ...baseConfig,
      alipayPublicKey: config.publicKey
        ? this.normalizeMultilineContent(config.publicKey)
        : undefined
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

  private normalizeMultilineContent(content: string): string {
    return content.replace(/\\n/g, "\n").trim();
  }

  private resolveEndpointFromGateway(gateway: string): string {
    return gateway.replace(/\/gateway\.do(?:\?.*)?$/, "");
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
