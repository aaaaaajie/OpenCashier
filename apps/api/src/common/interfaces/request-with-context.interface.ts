import type { Request } from "express";

export interface RequestWithContext extends Request {
  requestId?: string;
  appId?: string;
  canonicalPath?: string;
  canonicalRequest?: string;
  idempotencyFingerprint?: string;
  timestamp?: string;
  nonce?: string;
  rawBody?: Buffer;
}
