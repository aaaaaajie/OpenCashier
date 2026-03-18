import {
  buildMerchantRequestSigningContent,
  createNonce,
  signMerchantRequest,
  stableStringify
} from "./signing";

type ApiEnvelope<T> = {
  code: string;
  message: string;
  requestId: string;
  data: T;
};

export type OpenCashierOrder = {
  platformOrderNo: string;
  merchantOrderNo: string;
  amount: number;
  currency: string;
  subject: string;
  status: string;
  channel?: string | null;
  cashierUrl?: string;
  createdAt?: string;
  expireTime?: string;
  paidTime?: string | null;
  notifyUrl?: string;
  returnUrl?: string | null;
};

export type OpenCashierCreateOrderResult = {
  platformOrderNo: string;
  merchantOrderNo: string;
  status: string;
  cashierUrl: string;
  expireTime: string;
};

export type OpenCashierCreateOrderInput = {
  merchantOrderNo: string;
  amount: number;
  currency: string;
  subject: string;
  description?: string;
  notifyUrl: string;
  returnUrl: string;
  expireInSeconds?: number;
  allowedChannels?: string[];
  metadata?: Record<string, unknown>;
};

export class OpenCashierApiError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly requestId?: string;

  constructor(input: {
    message: string;
    status: number;
    code?: string;
    requestId?: string;
  }) {
    super(input.message);
    this.name = "OpenCashierApiError";
    this.status = input.status;
    this.code = input.code;
    this.requestId = input.requestId;
  }
}

export class OpenCashierClient {
  private readonly apiBaseUrl: string;
  private readonly appId: string;
  private readonly appSecret: string;

  constructor(config: {
    apiBaseUrl: string;
    appId: string;
    appSecret: string;
  }) {
    this.apiBaseUrl = config.apiBaseUrl.replace(/\/$/, "");
    this.appId = config.appId;
    this.appSecret = config.appSecret;
  }

  async createOrder(
    input: OpenCashierCreateOrderInput
  ): Promise<OpenCashierCreateOrderResult> {
    return this.request<OpenCashierCreateOrderResult>("POST", "/orders", input, {
      idempotencyKey: `order:${input.merchantOrderNo}:create`
    });
  }

  async getOrderByMerchantOrderNo(
    merchantOrderNo: string
  ): Promise<OpenCashierOrder> {
    return this.request<OpenCashierOrder>(
      "GET",
      `/orders?merchantOrderNo=${encodeURIComponent(merchantOrderNo)}`
    );
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    options?: { idempotencyKey?: string }
  ): Promise<T> {
    const requestUrl = `${this.apiBaseUrl}${path}`;
    const url = new URL(requestUrl);
    const timestamp = Date.now().toString();
    const nonce = createNonce();
    const payload = typeof body === "undefined" ? undefined : stableStringify(body);
    const signingContent = buildMerchantRequestSigningContent({
      method,
      path: `${url.pathname}${url.search}`,
      appId: this.appId,
      timestamp,
      nonce,
      body
    });
    const signature = signMerchantRequest(this.appSecret, signingContent);

    const response = await fetch(requestUrl, {
      method,
      headers: {
        "Content-Type": "application/json",
        "X-App-Id": this.appId,
        "X-Timestamp": timestamp,
        "X-Nonce": nonce,
        "X-Sign-Type": "HMAC-SHA256",
        "X-Sign": signature,
        ...(options?.idempotencyKey
          ? { "Idempotency-Key": options.idempotencyKey }
          : {})
      },
      body: payload
    });
    const text = await response.text();
    const envelope = parseEnvelope<T>(text);

    if (!response.ok) {
      throw new OpenCashierApiError({
        message:
          envelope?.message ??
          `OpenCashier request failed with status ${response.status}`,
        status: response.status,
        code: envelope?.code,
        requestId: envelope?.requestId
      });
    }

    if (!envelope) {
      throw new OpenCashierApiError({
        message: "OpenCashier returned a non-JSON response",
        status: response.status
      });
    }

    if (envelope.code !== "SUCCESS") {
      throw new OpenCashierApiError({
        message: envelope.message,
        status: response.status,
        code: envelope.code,
        requestId: envelope.requestId
      });
    }

    return envelope.data;
  }
}

function parseEnvelope<T>(text: string): ApiEnvelope<T> | null {
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text) as ApiEnvelope<T>;
  } catch {
    return null;
  }
}
