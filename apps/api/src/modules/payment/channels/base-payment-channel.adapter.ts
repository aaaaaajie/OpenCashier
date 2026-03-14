import {
  ChannelOrderCloseInput,
  ChannelOrderCloseResult,
  ChannelOrderQueryInput,
  ChannelOrderQueryResult,
  ChannelRefundInput,
  ChannelRefundResult,
  ChannelSessionPreview,
  ChannelSessionPreviewInput,
  PaymentChannelCatalogItem,
  PaymentProviderCode,
  ProviderConfigValidationResult,
  ProviderNotifyResult,
  StoredChannelAttempt
} from "./payment-channel.types";

export abstract class BasePaymentChannelAdapter {
  abstract readonly providerCode: PaymentProviderCode;
  abstract readonly displayName: string;
  abstract readonly integrationMode: PaymentChannelCatalogItem["integrationMode"];
  abstract readonly supportedChannels: string[];
  abstract readonly note: string;
  abstract readonly officialSdkPackage?: string;
  readonly notifyPath?: string;

  abstract isEnabled(): boolean;

  supportsChannel(channel: string): boolean {
    return this.supportedChannels.includes(channel);
  }

  getCatalog(): PaymentChannelCatalogItem {
    return {
      providerCode: this.providerCode,
      displayName: this.displayName,
      integrationMode: this.integrationMode,
      supportedChannels: this.supportedChannels,
      officialSdkPackage: this.officialSdkPackage,
      enabled: this.isEnabled(),
      note: this.note
    };
  }

  async createSession(
    input: ChannelSessionPreviewInput
  ): Promise<ChannelSessionPreview> {
    return this.buildPendingSession(input);
  }

  async queryOrder(
    _input: ChannelOrderQueryInput
  ): Promise<ChannelOrderQueryResult | null> {
    return null;
  }

  async closeOrder(
    _input: ChannelOrderCloseInput
  ): Promise<ChannelOrderCloseResult | null> {
    return null;
  }

  async refundOrder(
    _input: ChannelRefundInput
  ): Promise<ChannelRefundResult | null> {
    return null;
  }

  async verifyNotify(
    _payload: Record<string, unknown>
  ): Promise<ProviderNotifyResult> {
    throw new Error(`${this.providerCode} notify verification is not implemented`);
  }

  async validateConfig(): Promise<ProviderConfigValidationResult> {
    return this.buildValidationResult(
      "UNSUPPORTED",
      `${this.displayName} 暂未提供在线验证能力。`
    );
  }

  restoreSessionFromAttempt(
    input: StoredChannelAttempt
  ): ChannelSessionPreview {
    const actionType = input.qrContent
      ? "QR_CODE"
      : input.payUrl
        ? "REDIRECT_URL"
        : "NONE";

    return this.buildSession(input.channel, {
      sessionStatus: actionType === "NONE" ? "PENDING" : "READY",
      actionType,
      attemptNo: input.attemptNo,
      channelRequestNo: input.channelRequestNo ?? input.attemptNo,
      channelTradeNo: input.channelTradeNo ?? undefined,
      qrContent: input.qrContent ?? undefined,
      payUrl: input.payUrl ?? undefined,
      expireTime: input.expireTime ?? undefined,
      note: input.failMessage ?? this.note,
      providerPayload: input.channelPayload ?? undefined
    });
  }

  buildUnavailableSession(
    input: Pick<ChannelSessionPreviewInput, "channel" | "attemptNo">
  ): ChannelSessionPreview {
    return this.buildSession(input.channel, {
      sessionStatus: "PENDING",
      actionType: "NONE",
      attemptNo: input.attemptNo,
      channelRequestNo: input.attemptNo ?? `${this.providerCode}_${input.channel}`,
      note: `${this.displayName}尚未配置，当前返回占位会话。`,
      enabled: false
    });
  }

  buildFailedSession(
    input: Pick<ChannelSessionPreviewInput, "channel" | "attemptNo">,
    reason: string
  ): ChannelSessionPreview {
    return this.buildSession(input.channel, {
      sessionStatus: "FAILED",
      actionType: "NONE",
      attemptNo: input.attemptNo,
      channelRequestNo: input.attemptNo ?? `${this.providerCode}_${input.channel}`,
      note: reason
    });
  }

  protected buildPendingSession(
    input: ChannelSessionPreviewInput
  ): ChannelSessionPreview {
    return this.buildSession(input.channel, {
      sessionStatus: "PENDING",
      actionType: "NONE",
      attemptNo: input.attemptNo,
      channelRequestNo: input.attemptNo ?? `${this.providerCode}_${input.platformOrderNo}`
    });
  }

  protected buildSession(
    channel: string,
    overrides: Partial<ChannelSessionPreview>
  ): ChannelSessionPreview {
    return {
      providerCode: this.providerCode,
      channel,
      displayName: this.displayName,
      integrationMode: this.integrationMode,
      enabled: this.isEnabled(),
      sessionStatus: "PENDING",
      actionType: "NONE",
      channelRequestNo: `${this.providerCode}_${channel}`,
      note: this.note,
      sdkPackage: this.officialSdkPackage,
      ...overrides
    };
  }

  protected buildValidationResult(
    status: ProviderConfigValidationResult["status"],
    message: string,
    details?: Record<string, unknown>
  ): ProviderConfigValidationResult {
    return {
      providerCode: this.providerCode,
      displayName: this.displayName,
      status,
      message,
      checkedAt: new Date().toISOString(),
      details
    };
  }
}
