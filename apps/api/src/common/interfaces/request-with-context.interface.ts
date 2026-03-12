import type { Request } from "express";

export interface RequestWithContext extends Request {
  requestId?: string;
  appId?: string;
}

