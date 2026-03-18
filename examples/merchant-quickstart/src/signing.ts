import { createHash, createHmac, randomBytes } from "node:crypto";

export function buildCanonicalPath(inputPath: string): string {
  const url = new URL(inputPath, "http://localhost");
  const entries = [...url.searchParams.entries()].sort(([leftKey, leftValue], [rightKey, rightValue]) => {
    if (leftKey === rightKey) {
      return leftValue.localeCompare(rightValue);
    }

    return leftKey.localeCompare(rightKey);
  });
  const query = new URLSearchParams(entries).toString();

  return query ? `${url.pathname}?${query}` : url.pathname;
}

export function stableStringify(value: unknown): string {
  return JSON.stringify(sortJsonValue(value));
}

export function sha256Hex(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

export function createNonce(): string {
  return randomBytes(16).toString("hex");
}

export function buildMerchantRequestSigningContent(input: {
  method: string;
  path: string;
  appId: string;
  timestamp: string;
  nonce: string;
  body: unknown;
}): string {
  const canonicalBody = typeof input.body === "undefined" ? "" : stableStringify(input.body);

  return [
    input.method.toUpperCase(),
    buildCanonicalPath(input.path),
    input.appId,
    input.timestamp,
    input.nonce,
    sha256Hex(canonicalBody)
  ].join("\n");
}

export function signMerchantRequest(secret: string, content: string): string {
  return createHmac("sha256", secret).update(content).digest("hex");
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
