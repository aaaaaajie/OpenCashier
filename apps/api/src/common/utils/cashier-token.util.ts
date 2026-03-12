import { createHmac, timingSafeEqual } from "node:crypto";

interface CashierTokenPayload {
  platformOrderNo: string;
  expireTime: string;
}

export function createCashierToken(
  secret: string,
  payload: CashierTokenPayload
): string {
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = signCashierToken(secret, encodedPayload);

  return `${encodedPayload}.${signature}`;
}

export function parseCashierToken(
  secret: string,
  token: string
): CashierTokenPayload | null {
  const [encodedPayload, signature] = token.split(".");

  if (!encodedPayload || !signature) {
    return null;
  }

  const expectedSignature = signCashierToken(secret, encodedPayload);

  if (expectedSignature.length !== signature.length) {
    return null;
  }

  try {
    if (
      !timingSafeEqual(Buffer.from(expectedSignature), Buffer.from(signature))
    ) {
      return null;
    }

    const payload = JSON.parse(
      Buffer.from(encodedPayload, "base64url").toString("utf8")
    ) as CashierTokenPayload;

    if (
      !payload.platformOrderNo ||
      !payload.expireTime ||
      Number.isNaN(new Date(payload.expireTime).getTime())
    ) {
      return null;
    }

    if (new Date(payload.expireTime).getTime() <= Date.now()) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

function signCashierToken(secret: string, encodedPayload: string): string {
  return createHmac("sha256", secret).update(encodedPayload).digest("base64url");
}
