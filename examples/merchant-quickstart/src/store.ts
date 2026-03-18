import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { OpenCashierOrder } from "./opencashier-client";

export type QuickstartOrder = {
  merchantOrderNo: string;
  platformOrderNo: string;
  amount: number;
  currency: string;
  subject: string;
  status: string;
  cashierUrl?: string;
  channel?: string | null;
  notifyUrl?: string;
  returnUrl?: string | null;
  paidTime?: string | null;
  createdAt: string;
  updatedAt: string;
  lastSource: "create" | "notify" | "query";
  lastEventType?: string;
  lastNotifyId?: string;
  lastQueryAt?: string;
};

type StoredPayload = {
  orders: QuickstartOrder[];
};

type NotifyPayload = {
  notifyId?: string;
  eventType?: string;
  platformOrderNo?: string;
  merchantOrderNo?: string;
  status?: string;
  channel?: string;
  paidTime?: string;
  amount?: number;
  paidAmount?: number;
  currency?: string;
};

const DEFAULT_STORE_PATH = path.resolve(__dirname, "..", "data", "orders.json");

export class QuickstartStore {
  private readonly filePath: string;
  private readonly orders = new Map<string, QuickstartOrder>();

  constructor(filePath = DEFAULT_STORE_PATH) {
    this.filePath = filePath;
    this.load();
  }

  list(): QuickstartOrder[] {
    return [...this.orders.values()].sort((left, right) =>
      right.updatedAt.localeCompare(left.updatedAt)
    );
  }

  get(merchantOrderNo: string): QuickstartOrder | undefined {
    return this.orders.get(merchantOrderNo);
  }

  recordCreatedOrder(input: {
    merchantOrderNo: string;
    platformOrderNo: string;
    amount: number;
    currency: string;
    subject: string;
    status: string;
    cashierUrl: string;
    notifyUrl: string;
    returnUrl: string;
  }): QuickstartOrder {
    const now = new Date().toISOString();
    const order: QuickstartOrder = {
      merchantOrderNo: input.merchantOrderNo,
      platformOrderNo: input.platformOrderNo,
      amount: input.amount,
      currency: input.currency,
      subject: input.subject,
      status: input.status,
      cashierUrl: input.cashierUrl,
      notifyUrl: input.notifyUrl,
      returnUrl: input.returnUrl,
      createdAt: now,
      updatedAt: now,
      lastSource: "create"
    };

    this.orders.set(order.merchantOrderNo, order);
    this.persist();

    return order;
  }

  recordQueryResult(order: OpenCashierOrder): QuickstartOrder {
    const now = new Date().toISOString();
    const existing = this.orders.get(order.merchantOrderNo);
    const merged: QuickstartOrder = {
      merchantOrderNo: order.merchantOrderNo,
      platformOrderNo: order.platformOrderNo,
      amount: order.amount,
      currency: order.currency,
      subject: order.subject,
      status: order.status,
      cashierUrl: order.cashierUrl ?? existing?.cashierUrl,
      channel: order.channel ?? existing?.channel,
      notifyUrl: order.notifyUrl ?? existing?.notifyUrl,
      returnUrl: order.returnUrl ?? existing?.returnUrl,
      paidTime: order.paidTime ?? existing?.paidTime,
      createdAt: existing?.createdAt ?? order.createdAt ?? now,
      updatedAt: now,
      lastSource: "query",
      lastEventType: existing?.lastEventType,
      lastNotifyId: existing?.lastNotifyId,
      lastQueryAt: now
    };

    this.orders.set(merged.merchantOrderNo, merged);
    this.persist();

    return merged;
  }

  recordNotify(payload: NotifyPayload): QuickstartOrder | undefined {
    if (!payload.merchantOrderNo || !payload.platformOrderNo || !payload.status) {
      return undefined;
    }

    const now = new Date().toISOString();
    const existing = this.orders.get(payload.merchantOrderNo);
    const merged: QuickstartOrder = {
      merchantOrderNo: payload.merchantOrderNo,
      platformOrderNo: payload.platformOrderNo,
      amount: existing?.amount ?? payload.paidAmount ?? payload.amount ?? 0,
      currency: existing?.currency ?? payload.currency ?? "CNY",
      subject: existing?.subject ?? "OpenCashier Quickstart Order",
      status: payload.status,
      cashierUrl: existing?.cashierUrl,
      channel: payload.channel ?? existing?.channel,
      notifyUrl: existing?.notifyUrl,
      returnUrl: existing?.returnUrl,
      paidTime: payload.paidTime ?? existing?.paidTime,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      lastSource: "notify",
      lastEventType: payload.eventType,
      lastNotifyId: payload.notifyId,
      lastQueryAt: existing?.lastQueryAt
    };

    this.orders.set(merged.merchantOrderNo, merged);
    this.persist();

    return merged;
  }

  private load(): void {
    if (!existsSync(this.filePath)) {
      return;
    }

    try {
      const raw = readFileSync(this.filePath, "utf8");
      const parsed = JSON.parse(raw) as StoredPayload;

      for (const order of parsed.orders ?? []) {
        this.orders.set(order.merchantOrderNo, order);
      }
    } catch {
      this.orders.clear();
    }
  }

  private persist(): void {
    mkdirSync(path.dirname(this.filePath), { recursive: true });
    const payload: StoredPayload = { orders: this.list() };

    writeFileSync(this.filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  }
}
