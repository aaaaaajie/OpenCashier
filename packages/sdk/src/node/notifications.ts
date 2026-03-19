import { createHmac, timingSafeEqual } from "node:crypto";
import { OpenCashierSignatureError } from "../core/errors";
import { parseJson, sha256Hex } from "../core/json";
import type {
  OpenCashierHeadersLike,
  OpenCashierVerifyNotificationInput
} from "../core/types";

export class OpenCashierNotifications {
  constructor(private readonly getAppSecret: () => string) {}

  verify<T = Record<string, unknown>>(
    input: OpenCashierVerifyNotificationInput
  ): T {
    const headers = normalizeHeaders(input.headers);
    const notifyId = getRequiredHeader(headers, "x-notify-id");
    const timestamp = getRequiredHeader(headers, "x-timestamp");
    const nonce = getRequiredHeader(headers, "x-nonce");
    const signType = getRequiredHeader(headers, "x-sign-type");
    const signature = getRequiredHeader(headers, "x-sign");

    if (signType !== "HMAC-SHA256") {
      throw new OpenCashierSignatureError(
        "unsupported OpenCashier notification sign type",
        "INVALID_SIGN_TYPE"
      );
    }

    const content = [notifyId, timestamp, nonce, sha256Hex(input.rawBody)].join(
      "\n"
    );
    const expected = createHmac("sha256", this.getAppSecret())
      .update(content)
      .digest("hex");

    if (!safeEqual(expected, signature)) {
      throw new OpenCashierSignatureError(
        "invalid OpenCashier notification signature",
        "INVALID_SIGNATURE"
      );
    }

    const payload = parseJson<T>(input.rawBody);

    if (!payload) {
      throw new OpenCashierSignatureError(
        "invalid OpenCashier notification payload",
        "INVALID_PAYLOAD"
      );
    }

    return payload;
  }
}

function normalizeHeaders(input: OpenCashierHeadersLike): Record<string, string> {
  if (input instanceof Headers) {
    const result: Record<string, string> = {};

    input.forEach((value, key) => {
      result[key.toLowerCase()] = value;
    });

    return result;
  }

  return Object.entries(input).reduce<Record<string, string>>(
    (result, [key, value]) => {
      if (typeof value === "string") {
        result[key.toLowerCase()] = value;
        return result;
      }

      if (Array.isArray(value) && value[0]) {
        result[key.toLowerCase()] = value[0];
      }

      return result;
    },
    {}
  );
}

function getRequiredHeader(
  headers: Record<string, string>,
  key: string
): string {
  const value = headers[key];

  if (!value) {
    throw new OpenCashierSignatureError(
      `missing OpenCashier notification header: ${key}`,
      "MISSING_HEADER"
    );
  }

  return value;
}

function safeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) {
    return false;
  }

  try {
    return timingSafeEqual(Buffer.from(left), Buffer.from(right));
  } catch {
    return false;
  }
}
