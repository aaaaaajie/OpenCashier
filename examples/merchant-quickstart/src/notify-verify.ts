import { createHmac, timingSafeEqual } from "node:crypto";
import { sha256Hex } from "./signing";

export function verifyPlatformNotify(input: {
  headers: Record<string, string | string[] | undefined>;
  rawBody: string;
  appSecret: string;
}): boolean {
  const notifyId = readHeader(input.headers, "x-notify-id");
  const timestamp = readHeader(input.headers, "x-timestamp");
  const nonce = readHeader(input.headers, "x-nonce");
  const signature = readHeader(input.headers, "x-sign");
  const signType = readHeader(input.headers, "x-sign-type");

  if (
    !notifyId ||
    !timestamp ||
    !nonce ||
    !signature ||
    signType !== "HMAC-SHA256"
  ) {
    return false;
  }

  const content = [notifyId, timestamp, nonce, sha256Hex(input.rawBody)].join("\n");
  const expected = createHmac("sha256", input.appSecret)
    .update(content)
    .digest("hex");

  if (expected.length !== signature.length) {
    return false;
  }

  try {
    return timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch {
    return false;
  }
}

function readHeader(
  headers: Record<string, string | string[] | undefined>,
  key: string
): string | undefined {
  const directValue = headers[key];

  if (typeof directValue === "string") {
    return directValue;
  }

  if (Array.isArray(directValue)) {
    return directValue[0];
  }

  const matchedKey = Object.keys(headers).find(
    (headerKey) => headerKey.toLowerCase() === key.toLowerCase()
  );

  if (!matchedKey) {
    return undefined;
  }

  const matchedValue = headers[matchedKey];

  if (typeof matchedValue === "string") {
    return matchedValue;
  }

  return Array.isArray(matchedValue) ? matchedValue[0] : undefined;
}
