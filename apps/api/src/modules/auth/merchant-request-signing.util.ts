import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export function buildCanonicalPath(originalUrl: string): string {
  const url = new URL(originalUrl, "http://localhost");
  const entries = [...url.searchParams.entries()].sort(([leftKey, leftValue], [rightKey, rightValue]) => {
    if (leftKey === rightKey) {
      return leftValue.localeCompare(rightValue);
    }

    return leftKey.localeCompare(rightKey);
  });
  const query = new URLSearchParams(entries).toString();

  return query ? `${url.pathname}?${query}` : url.pathname;
}

export function getCanonicalBody(body: unknown): string {
  if (typeof body === "undefined") {
    return "";
  }

  return stableStringify(body);
}

export function buildMerchantRequestSigningContent(input: {
  method: string;
  originalUrl: string;
  appId: string;
  timestamp: string;
  nonce: string;
  body: unknown;
}): string {
  const bodyHash = sha256Hex(getCanonicalBody(input.body));

  return [
    input.method.toUpperCase(),
    buildCanonicalPath(input.originalUrl),
    input.appId,
    input.timestamp,
    input.nonce,
    bodyHash
  ].join("\n");
}

export function buildMerchantIdempotencyFingerprint(input: {
  method: string;
  originalUrl: string;
  appId: string;
  body: unknown;
}): string {
  return [
    input.method.toUpperCase(),
    buildCanonicalPath(input.originalUrl),
    input.appId,
    sha256Hex(getCanonicalBody(input.body))
  ].join("\n");
}

export function signMerchantRequest(secret: string, content: string): string {
  return createHmac("sha256", secret).update(content).digest("hex");
}

export function verifyMerchantRequestSignature(
  secret: string,
  content: string,
  signature: string
): boolean {
  const expected = signMerchantRequest(secret, content);

  if (expected.length !== signature.length) {
    return false;
  }

  try {
    return timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch {
    return false;
  }
}

export function sha256Hex(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

function stableStringify(value: unknown): string {
  return JSON.stringify(sortJsonValue(value));
}

function sortJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => sortJsonValue(item));
  }

  if (
    value &&
    typeof value === "object" &&
    Object.getPrototypeOf(value) === Object.prototype
  ) {
    return Object.keys(value as Record<string, unknown>)
      .sort()
      .reduce<Record<string, unknown>>((result, key) => {
        result[key] = sortJsonValue((value as Record<string, unknown>)[key]);

        return result;
      }, {});
  }

  return value;
}
