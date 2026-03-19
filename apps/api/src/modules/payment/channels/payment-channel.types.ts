export type PaymentProviderCode =
  | "WECHAT_PAY"
  | "ALIPAY"
  | "STRIPE"
  | "PAYPAL";

export type IntegrationMode = "OFFICIAL_NODE_SDK" | "DIRECT_API";
export type ChannelSessionStatus = "PENDING" | "READY" | "FAILED";
export type ChannelActionType = "NONE" | "QR_CODE" | "REDIRECT_URL";
export type ChannelTradeStatus = "WAIT_PAY" | "SUCCESS" | "CLOSED";
export type ProviderConfigValidationStatus =
  | "SUCCESS"
  | "FAILED"
  | "UNSUPPORTED";

export interface PaymentChannelCatalogItem {
  providerCode: PaymentProviderCode;
  displayName: string;
  integrationMode: IntegrationMode;
  supportedChannels: string[];
  officialSdkPackage?: string;
  enabled: boolean;
  note: string;
}

export interface ChannelSessionPreviewInput {
  appId?: string;
  platformOrderNo: string;
  merchantOrderNo: string;
  amount: number;
  currency: string;
  subject: string;
  description?: string;
  notifyUrl: string;
  returnUrl?: string;
  cancelUrl?: string;
  expireTime: string;
  channel: string;
  attemptNo?: string;
}

export interface StoredChannelAttempt {
  attemptNo: string;
  channel: string;
  status?: string;
  channelRequestNo?: string | null;
  channelTradeNo?: string | null;
  qrContent?: string | null;
  payUrl?: string | null;
  expireTime?: string | null;
  failMessage?: string | null;
  channelPayload?: Record<string, unknown> | null;
}

export interface ChannelOrderQueryInput {
  appId?: string;
  platformOrderNo: string;
  channel: string;
  channelRequestNo?: string | null;
  channelTradeNo?: string | null;
}

export interface ChannelOrderQueryResult {
  tradeStatus: ChannelTradeStatus;
  channelTradeNo?: string;
  paidAmount?: number;
  paidTime?: string;
  rawPayload?: Record<string, unknown>;
}

export interface ChannelOrderCloseInput {
  appId?: string;
  platformOrderNo: string;
  channel: string;
  channelRequestNo?: string | null;
  channelTradeNo?: string | null;
}

export interface ChannelOrderCloseResult {
  tradeStatus: "CLOSED" | "UNCHANGED";
  channelTradeNo?: string;
  reason?: string;
  rawPayload?: Record<string, unknown>;
}

export interface ChannelRefundInput {
  appId?: string;
  platformOrderNo: string;
  platformRefundNo: string;
  merchantRefundNo: string;
  refundAmount: number;
  reason: string;
  channel: string;
  channelTradeNo?: string | null;
}

export interface ChannelRefundResult {
  refundStatus: "SUCCESS" | "PROCESSING";
  channelRefundNo?: string;
  channelTradeNo?: string;
  successTime?: string;
  rawPayload?: Record<string, unknown>;
}

export interface ProviderNotifyResult {
  eventId: string;
  platformOrderNo: string;
  attemptNo?: string;
  channelRequestNo?: string;
  channelTradeNo?: string;
  tradeStatus: ChannelTradeStatus;
  paidAmount?: number;
  paidTime?: string;
  rawPayload: Record<string, unknown>;
}

export interface ChannelSessionPreview {
  providerCode: PaymentProviderCode;
  channel: string;
  displayName: string;
  integrationMode: IntegrationMode;
  enabled: boolean;
  sessionStatus: ChannelSessionStatus;
  actionType: ChannelActionType;
  attemptNo?: string;
  channelRequestNo: string;
  channelTradeNo?: string;
  note: string;
  sdkPackage?: string;
  qrContent?: string;
  payUrl?: string;
  expireTime?: string;
  providerPayload?: Record<string, unknown>;
}

export interface ProviderConfigValidationResult {
  providerCode: PaymentProviderCode;
  displayName: string;
  status: ProviderConfigValidationStatus;
  message: string;
  checkedAt: string;
  details?: Record<string, unknown>;
}
