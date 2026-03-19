import type {
  OpenCashierProviderSetupInput,
  OpenCashierProviderSetupOptions
} from "./providers";

export type OpenCashierOrderStatus =
  | "WAIT_PAY"
  | "PAYING"
  | "SUCCESS"
  | "CLOSED"
  | "EXPIRED"
  | "REFUND_PART"
  | "REFUND_ALL";

export type OpenCashierRefundStatus =
  | "CREATED"
  | "PROCESSING"
  | "SUCCESS"
  | "FAILED"
  | "CLOSED";

export interface OpenCashierApiEnvelope<T> {
  code: string;
  message: string;
  requestId: string;
  data: T;
}

export interface OpenCashierMerchantCredentials {
  appId: string;
  appSecret: string;
}

export interface OpenCashierAdminCredentials {
  username: string;
  password: string;
}

export interface OpenCashierClientConfig {
  baseUrl: string;
  appId?: string;
  appSecret?: string;
  merchant?: OpenCashierMerchantCredentials;
  admin?: OpenCashierAdminCredentials;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  headers?: Record<string, string>;
}

export interface OpenCashierClientCreateConfig
  extends OpenCashierClientConfig {
  providers?: OpenCashierProviderSetupInput;
  providerSetup?: OpenCashierProviderSetupOptions;
}

export interface OpenCashierRequestOptions {
  idempotencyKey?: string;
  requestId?: string;
  headers?: Record<string, string>;
  signal?: AbortSignal;
}

export interface OpenCashierSignerConfig {
  appId: string;
  appSecret: string;
  now?: () => number;
  nonce?: () => string;
}

export interface OpenCashierBuildHeadersInput {
  method: string;
  path: string;
  body?: unknown;
  idempotencyKey?: string;
  requestId?: string;
  headers?: Record<string, string>;
  timestamp?: string;
  nonce?: string;
}

export type OpenCashierHeadersLike =
  | Headers
  | Record<string, string | string[] | undefined>;

export interface OpenCashierVerifyNotificationInput {
  headers: OpenCashierHeadersLike;
  rawBody: string;
}

export interface OpenCashierChannelCatalogItem {
  providerCode: string;
  displayName: string;
  integrationMode: string;
  supportedChannels: string[];
  officialSdkPackage?: string;
  enabled: boolean;
  note?: string;
}

export interface OpenCashierOrder {
  platformOrderNo: string;
  merchantOrderNo: string;
  amount: number;
  paidAmount: number;
  currency: string;
  subject: string;
  description?: string;
  status: OpenCashierOrderStatus;
  channel?: string | null;
  notifyUrl: string;
  returnUrl?: string | null;
  expireTime: string;
  createdAt: string;
  paidTime?: string | null;
  allowedChannels: string[];
  metadata?: Record<string, unknown>;
  cashierUrl: string;
}

export interface OpenCashierCreateOrderInput {
  merchantOrderNo: string;
  amount: number;
  currency: string;
  subject: string;
  description?: string;
  notifyUrl: string;
  returnUrl?: string;
  expireInSeconds?: number;
  allowedChannels?: string[];
  metadata?: Record<string, unknown>;
}

export interface OpenCashierCreateOrderResult {
  platformOrderNo: string;
  merchantOrderNo: string;
  status: OpenCashierOrderStatus;
  cashierUrl: string;
  expireTime: string;
  channels?: OpenCashierChannelCatalogItem[];
}

export interface OpenCashierCreateRefundInput {
  platformOrderNo: string;
  merchantRefundNo: string;
  refundAmount: number;
  reason: string;
}

export interface OpenCashierRefund {
  merchantRefundNo: string;
  platformRefundNo: string;
  platformOrderNo: string;
  refundAmount: number;
  status: OpenCashierRefundStatus;
  reason: string;
  createdAt: string;
  successTime: string | null;
}
