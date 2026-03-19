import { createHmac, randomBytes } from "node:crypto";
import { buildCanonicalPath, sha256Hex, stableStringify } from "../core/json";
import type {
  OpenCashierBuildHeadersInput,
  OpenCashierSignerConfig
} from "../core/types";

export interface OpenCashierSigner {
  buildHeaders(input: OpenCashierBuildHeadersInput): Record<string, string>;
}

export function createOpenCashierSigner(
  config: OpenCashierSignerConfig
): OpenCashierSigner {
  return {
    buildHeaders(input: OpenCashierBuildHeadersInput): Record<string, string> {
      const timestamp = input.timestamp ?? String(config.now?.() ?? Date.now());
      const nonce = input.nonce ?? (config.nonce?.() ?? createNonce());
      const content = buildMerchantRequestSigningContent({
        method: input.method,
        path: input.path,
        appId: config.appId,
        timestamp,
        nonce,
        body: input.body
      });

      return {
        Accept: "application/json",
        ...(typeof input.body === "undefined"
          ? {}
          : { "Content-Type": "application/json" }),
        ...input.headers,
        "X-App-Id": config.appId,
        "X-Timestamp": timestamp,
        "X-Nonce": nonce,
        "X-Sign-Type": "HMAC-SHA256",
        "X-Sign": signMerchantRequest(config.appSecret, content),
        ...(input.requestId ? { "X-Request-Id": input.requestId } : {}),
        ...(input.idempotencyKey
          ? { "Idempotency-Key": input.idempotencyKey }
          : {})
      };
    }
  };
}

function buildMerchantRequestSigningContent(input: {
  method: string;
  path: string;
  appId: string;
  timestamp: string;
  nonce: string;
  body: unknown;
}): string {
  const canonicalBody =
    typeof input.body === "undefined" ? "" : stableStringify(input.body);

  return [
    input.method.toUpperCase(),
    buildCanonicalPath(input.path),
    input.appId,
    input.timestamp,
    input.nonce,
    sha256Hex(canonicalBody)
  ].join("\n");
}

function signMerchantRequest(secret: string, content: string): string {
  return createHmac("sha256", secret).update(content).digest("hex");
}

function createNonce(): string {
  return randomBytes(16).toString("hex");
}
