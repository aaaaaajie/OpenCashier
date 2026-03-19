import { OpenCashierApiError } from "./errors";
import { parseJson, stableStringify } from "./json";
import type { OpenCashierApiEnvelope, OpenCashierRequestOptions } from "./types";

export type OpenCashierHeadersBuilder = (input: {
  method: "GET" | "POST" | "PUT" | "DELETE";
  path: string;
  body?: unknown;
  options?: OpenCashierRequestOptions;
}) => Record<string, string>;

export class OpenCashierRequester {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;
  private readonly buildHeaders: OpenCashierHeadersBuilder;

  constructor(input: {
    config: {
      baseUrl: string;
      timeoutMs?: number;
      fetchImpl?: typeof fetch;
    };
    buildHeaders: OpenCashierHeadersBuilder;
  }) {
    this.baseUrl = input.config.baseUrl.replace(/\/$/, "");
    this.timeoutMs = input.config.timeoutMs ?? 10_000;
    this.fetchImpl = input.config.fetchImpl ?? fetch;
    this.buildHeaders = input.buildHeaders;
  }

  async execute<T>(input: {
    method: "GET" | "POST" | "PUT" | "DELETE";
    path: string;
    body?: unknown;
    options?: OpenCashierRequestOptions;
  }): Promise<T> {
    const requestUrl = `${this.baseUrl}${normalizePath(input.path)}`;
    const url = new URL(requestUrl);
    const bodyText =
      typeof input.body === "undefined" ? undefined : stableStringify(input.body);
    const abort = createRequestAbortController(
      this.timeoutMs,
      input.options?.signal
    );

    try {
      const response = await this.fetchImpl(requestUrl, {
        method: input.method,
        headers: this.buildHeaders({
          method: input.method,
          path: `${url.pathname}${url.search}`,
          body: input.body,
          options: input.options
        }),
        body: bodyText,
        signal: abort.controller.signal
      });
      const headers = headersToObject(response.headers);
      const text = await response.text();
      const envelope = parseJson<OpenCashierApiEnvelope<T>>(text);

      if (!response.ok) {
        throw new OpenCashierApiError({
          kind: "HTTP",
          message:
            envelope?.message ??
            `OpenCashier request failed with status ${response.status}`,
          status: response.status,
          code: envelope?.code,
          requestId: envelope?.requestId,
          headers,
          body: text
        });
      }

      if (!envelope) {
        throw new OpenCashierApiError({
          kind: "PROTOCOL",
          message: "OpenCashier returned a non-JSON response",
          status: response.status,
          headers,
          body: text
        });
      }

      if (envelope.code !== "SUCCESS") {
        throw new OpenCashierApiError({
          kind: "BUSINESS",
          message: envelope.message ?? "OpenCashier returned a non-success code",
          status: response.status,
          code: envelope.code,
          requestId: envelope.requestId,
          headers,
          body: text
        });
      }

      if (typeof envelope.data === "undefined" || envelope.data === null) {
        throw new OpenCashierApiError({
          kind: "PROTOCOL",
          message: "OpenCashier returned SUCCESS without data",
          status: response.status,
          code: envelope.code,
          requestId: envelope.requestId,
          headers,
          body: text
        });
      }

      return envelope.data;
    } catch (error) {
      if (error instanceof OpenCashierApiError) {
        throw error;
      }

      throw new OpenCashierApiError({
        kind: "NETWORK",
        message: abort.didTimeout
          ? `OpenCashier request timed out after ${this.timeoutMs}ms`
          : formatNetworkError(error),
        headers: {},
        cause: error
      });
    } finally {
      abort.cleanup();
    }
  }
}

function createRequestAbortController(
  timeoutMs: number,
  signal?: AbortSignal
): {
  controller: AbortController;
  didTimeout: boolean;
  cleanup: () => void;
} {
  const controller = new AbortController();
  let didTimeout = false;
  let onAbort: (() => void) | undefined;

  if (signal) {
    if (signal.aborted) {
      controller.abort(signal.reason);
    } else {
      onAbort = () => controller.abort(signal.reason);
      signal.addEventListener("abort", onAbort, { once: true });
    }
  }

  const timeout = setTimeout(() => {
    didTimeout = true;
    controller.abort(new Error(`timeout after ${timeoutMs}ms`));
  }, timeoutMs);

  return {
    controller,
    get didTimeout() {
      return didTimeout;
    },
    cleanup: () => {
      clearTimeout(timeout);

      if (signal && onAbort) {
        signal.removeEventListener("abort", onAbort);
      }
    }
  };
}

function headersToObject(headers: Headers): Record<string, string> {
  const result: Record<string, string> = {};

  headers.forEach((value, key) => {
    result[key.toLowerCase()] = value;
  });

  return result;
}

function normalizePath(path: string): string {
  return path.startsWith("/") ? path : `/${path}`;
}

function formatNetworkError(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return "OpenCashier request failed";
}
