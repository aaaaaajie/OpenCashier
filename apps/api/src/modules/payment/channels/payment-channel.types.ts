export type PaymentProviderCode =
  | "WECHAT_PAY"
  | "ALIPAY"
  | "STRIPE"
  | "PAYPAL";

export type IntegrationMode = "OFFICIAL_NODE_SDK" | "DIRECT_API";
export type ChannelSessionStatus = "PENDING" | "READY" | "FAILED";
export type ChannelActionType = "NONE" | "QR_CODE" | "REDIRECT_URL";
export type ChannelTradeStatus = "WAIT_PAY" | "SUCCESS" | "CLOSED";

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
  platformOrderNo: string;
  merchantOrderNo: string;
  amount: number;
  currency: string;
  subject: string;
  description?: string;
  notifyUrl: string;
  returnUrl?: string;
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
}

export interface ChannelOrderQueryInput {
  platformOrderNo: string;
  channel: string;
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
  platformOrderNo: string;
  channel: string;
  channelTradeNo?: string | null;
}

export interface ChannelOrderCloseResult {
  tradeStatus: "CLOSED" | "UNCHANGED";
  channelTradeNo?: string;
  reason?: string;
  rawPayload?: Record<string, unknown>;
}

export interface ChannelRefundInput {
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
