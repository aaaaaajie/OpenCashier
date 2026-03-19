export type OpenCashierApiErrorKind =
  | "HTTP"
  | "BUSINESS"
  | "PROTOCOL"
  | "NETWORK";

export class OpenCashierApiError extends Error {
  readonly kind: OpenCashierApiErrorKind;
  readonly status?: number;
  readonly code?: string;
  readonly requestId?: string;
  readonly headers: Record<string, string>;
  readonly body?: string;

  constructor(input: {
    kind: OpenCashierApiErrorKind;
    message: string;
    status?: number;
    code?: string;
    requestId?: string;
    headers?: Record<string, string>;
    body?: string;
    cause?: unknown;
  }) {
    super(input.message);
    this.name = "OpenCashierApiError";
    this.kind = input.kind;
    this.status = input.status;
    this.code = input.code;
    this.requestId = input.requestId;
    this.headers = input.headers ?? {};
    this.body = input.body;

    if (input.cause !== undefined) {
      (this as Error & { cause?: unknown }).cause = input.cause;
    }
  }
}

export class OpenCashierSignatureError extends Error {
  readonly reason:
    | "MISSING_HEADER"
    | "INVALID_SIGN_TYPE"
    | "INVALID_SIGNATURE"
    | "INVALID_PAYLOAD";

  constructor(
    message: string,
    reason:
      | "MISSING_HEADER"
      | "INVALID_SIGN_TYPE"
      | "INVALID_SIGNATURE"
      | "INVALID_PAYLOAD"
  ) {
    super(message);
    this.name = "OpenCashierSignatureError";
    this.reason = reason;
  }
}
