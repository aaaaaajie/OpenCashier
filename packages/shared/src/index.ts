export const ORDER_STATUSES = [
  "WAIT_PAY",
  "PAYING",
  "SUCCESS",
  "CLOSED",
  "EXPIRED",
  "REFUND_PART",
  "REFUND_ALL"
] as const;

export const REFUND_STATUSES = [
  "CREATED",
  "PROCESSING",
  "SUCCESS",
  "FAILED",
  "CLOSED"
] as const;

export const NOTIFY_STATUSES = [
  "PENDING",
  "RETRYING",
  "SUCCESS",
  "DEAD"
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];
export type RefundStatus = (typeof REFUND_STATUSES)[number];
export type NotifyStatus = (typeof NOTIFY_STATUSES)[number];

export interface ApiEnvelope<T> {
  code: string;
  message: string;
  requestId: string;
  data: T;
}

export interface DashboardMetric {
  key: string;
  label: string;
  value: number;
}

export interface MerchantAppSummary {
  appId: string;
  appName: string;
  status: "ACTIVE" | "INACTIVE" | "BLOCKED";
  signType: "HMAC-SHA256" | "RSA2";
  allowedChannels: string[];
}

export interface OrderSummary {
  platformOrderNo: string;
  merchantOrderNo: string;
  amount: number;
  currency: string;
  status: OrderStatus;
  channel?: string | null;
  createdAt: string;
  expireTime: string;
}

export interface RefundSummary {
  merchantRefundNo: string;
  platformOrderNo: string;
  refundAmount: number;
  status: RefundStatus;
  reason: string;
  createdAt: string;
}

export interface NotificationSummary {
  notifyId: string;
  businessType: "PAY_ORDER" | "REFUND_ORDER";
  businessNo: string;
  status: NotifyStatus;
  retryCount: number;
  nextRetryTime?: string | null;
}
