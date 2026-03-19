import {
  buildMerchantRequestSigningContent,
  createNonce,
  signMerchantRequest,
  stableStringify
} from "./signing";

type ApiEnvelope<T> = {
  code?: string;
  message?: string;
  requestId?: string;
  data?: T;
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

type OpenCashierValidationResult = {
  status: "SUCCESS" | "FAILED" | "UNSUPPORTED";
  message: string;
  checkedAt: string;
  details?: Record<string, unknown>;
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

// One client for all quickstart API calls. Merchant routes use app signing,
// while provider setup uses the same OpenCashier API server with Basic auth.
export class OpenCashierClient {
  private readonly apiBaseUrl: string;
  private readonly appId?: string;
  private readonly appSecret?: string;
  private readonly adminAuthorization?: string;

  constructor(config: {
    apiBaseUrl: string;
    appId?: string;
    appSecret?: string;
    adminUsername?: string;
    adminPassword?: string;
  }) {
    this.apiBaseUrl = config.apiBaseUrl.replace(/\/$/, "");
    this.appId = config.appId;
    this.appSecret = config.appSecret;

    if (config.adminUsername && config.adminPassword) {
      this.adminAuthorization = `Basic ${Buffer.from(
        `${config.adminUsername}:${config.adminPassword}`
      ).toString("base64")}`;
    }
  }

  async createOrder(
    input: OpenCashierCreateOrderInput
  ): Promise<OpenCashierCreateOrderResult> {
    return this.merchantRequest<OpenCashierCreateOrderResult>(
      "POST",
      "/orders",
      input,
      {
        idempotencyKey: `order:${input.merchantOrderNo}:create`
      }
    );
  }

  async getOrderByMerchantOrderNo(
    merchantOrderNo: string
  ): Promise<OpenCashierOrder> {
    return this.merchantRequest<OpenCashierOrder>(
      "GET",
      `/orders?merchantOrderNo=${encodeURIComponent(merchantOrderNo)}`
    );
  }

  async setupMerchantProviderConfig(input: {
    appId: string;
    groupKey: string;
    value: Record<string, string>;
  }): Promise<OpenCashierValidationResult> {
    this.assertAdminCredentials();

    await this.managementRequest(
      "PUT",
      `/admin/merchants/${encodeURIComponent(input.appId)}/platform-configs`,
      {
        key: input.groupKey,
        value: input.value
      }
    );

    let validation: OpenCashierValidationResult | undefined;
    let validationError: unknown;

    try {
      validation = await this.managementRequest<OpenCashierValidationResult>(
        "POST",
        `/admin/merchants/${encodeURIComponent(input.appId)}/platform-configs/${encodeURIComponent(input.groupKey)}/validate`,
        {
          value: input.value
        }
      );

      if (validation && ["SUCCESS", "UNSUPPORTED"].includes(validation.status)) {
        await this.managementRequest(
          "POST",
          `/admin/merchants/${encodeURIComponent(input.appId)}/platform-configs/${encodeURIComponent(input.groupKey)}/activate`
        );

        return validation;
      }

      validationError = new OpenCashierApiError({
        message: validation?.message ?? "provider config validation failed",
        status: 400
      });
    } catch (error) {
      validationError = error;
    }

    await this.managementRequest(
      "POST",
      `/admin/merchants/${encodeURIComponent(input.appId)}/platform-configs/${encodeURIComponent(input.groupKey)}/activate`
    );

    return {
      status: "SUCCESS",
      message: `Validation probe failed, but the draft was activated for local checkout: ${formatError(validationError)}`,
      checkedAt: new Date().toISOString(),
      details: validation
        ? {
            validationStatus: validation.status
          }
        : undefined
    };
  }

  private async merchantRequest<T>(
    method: string,
    path: string,
    body?: unknown,
    options?: { idempotencyKey?: string }
  ): Promise<T> {
    this.assertMerchantCredentials();

    const requestUrl = `${this.apiBaseUrl}${path}`;
    const url = new URL(requestUrl);
    const timestamp = Date.now().toString();
    const nonce = createNonce();
    const payload = typeof body === "undefined" ? undefined : stableStringify(body);
    const signingContent = buildMerchantRequestSigningContent({
      method,
      path: `${url.pathname}${url.search}`,
      appId: this.appId!,
      timestamp,
      nonce,
      body
    });
    const signature = signMerchantRequest(this.appSecret!, signingContent);

    const response = await fetch(requestUrl, {
      method,
      headers: {
        "Content-Type": "application/json",
        "X-App-Id": this.appId!,
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
        message: envelope.message ?? "OpenCashier returned a non-success response",
        status: response.status,
        code: envelope.code,
        requestId: envelope.requestId
      });
    }

    if (typeof envelope.data === "undefined") {
      throw new OpenCashierApiError({
        message: "OpenCashier returned a SUCCESS response without data",
        status: response.status,
        code: envelope.code,
        requestId: envelope.requestId
      });
    }

    return envelope.data;
  }

  private async managementRequest<T>(
    method: string,
    path: string,
    body?: unknown
  ): Promise<T> {
    this.assertAdminCredentials();

    const requestUrl = `${this.apiBaseUrl}${path}`;
    const response = await fetch(requestUrl, {
      method,
      headers: {
        "Content-Type": "application/json",
        Authorization: this.adminAuthorization!
      },
      body: typeof body === "undefined" ? undefined : JSON.stringify(body)
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

    if (!text) {
      return undefined as T;
    }

    if (envelope && typeof envelope.data !== "undefined") {
      return envelope.data;
    }

    try {
      return JSON.parse(text) as T;
    } catch {
      throw new OpenCashierApiError({
        message: "OpenCashier returned a non-JSON response",
        status: response.status
      });
    }
  }

  private assertMerchantCredentials(): void {
    if (!this.appId || !this.appSecret) {
      throw new Error(
        "OpenCashierClient requires appId and appSecret for merchant API requests."
      );
    }
  }

  private assertAdminCredentials(): void {
    if (!this.adminAuthorization) {
      throw new Error(
        "OpenCashierClient requires adminUsername and adminPassword for admin API requests."
      );
    }
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

function formatError(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return "unknown validation error";
}
