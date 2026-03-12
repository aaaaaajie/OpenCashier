import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

type OrderStatus =
  | "WAIT_PAY"
  | "PAYING"
  | "SUCCESS"
  | "CLOSED"
  | "EXPIRED"
  | "REFUND_PART"
  | "REFUND_ALL";

type RefundStatus = "CREATED" | "PROCESSING" | "SUCCESS" | "FAILED" | "CLOSED";

interface CreateOrderInput {
  appId: string;
  merchantOrderNo: string;
  amount: number;
  currency: string;
  subject: string;
  description?: string;
  notifyUrl: string;
  returnUrl?: string;
  expireInSeconds: number;
  allowedChannels: string[];
  metadata?: Record<string, unknown>;
}

interface CreateRefundInput {
  appId: string;
  platformOrderNo: string;
  merchantRefundNo: string;
  refundAmount: number;
  reason: string;
}

export interface OrderRecord {
  appId: string;
  platformOrderNo: string;
  merchantOrderNo: string;
  amount: number;
  paidAmount: number;
  currency: string;
  subject: string;
  description?: string;
  status: OrderStatus;
  channel: string | null;
  notifyUrl: string;
  returnUrl?: string;
  expireTime: string;
  createdAt: string;
  paidTime?: string | null;
  allowedChannels: string[];
  metadata?: Record<string, unknown>;
  cashierUrl: string;
}

export interface RefundRecord {
  appId: string;
  merchantRefundNo: string;
  platformRefundNo: string;
  platformOrderNo: string;
  refundAmount: number;
  status: RefundStatus;
  reason: string;
  createdAt: string;
  successTime: string | null;
}

@Injectable()
export class PaymentStoreService {
  private readonly orders = new Map<string, OrderRecord>();
  private readonly refunds = new Map<string, RefundRecord>();
  private readonly orderKeyIndex = new Map<string, string>();
  private readonly refundKeyIndex = new Map<string, string>();
  private readonly merchantApps = [
    {
      appId: "demo_app",
      appName: "演示商户应用",
      status: "ACTIVE",
      signType: "HMAC-SHA256",
      allowedChannels: ["wechat_qr", "alipay_qr"]
    },
    {
      appId: "partner_app",
      appName: "渠道联调应用",
      status: "ACTIVE",
      signType: "RSA2",
      allowedChannels: ["wechat_qr"]
    }
  ];

  constructor(private readonly configService: ConfigService) {
    const sampleOrder = this.createOrder({
      appId: "demo_app",
      merchantOrderNo: "ORDER_DEMO_10001",
      amount: 9900,
      currency: "CNY",
      subject: "VIP会员",
      description: "首个演示订单",
      notifyUrl: "https://merchant.example.com/pay/notify",
      returnUrl: "https://merchant.example.com/pay/result",
      expireInSeconds: 900,
      allowedChannels: ["wechat_qr", "alipay_qr"],
      metadata: {
        scene: "demo"
      }
    });

    sampleOrder.status = "SUCCESS";
    sampleOrder.paidAmount = sampleOrder.amount;
    sampleOrder.channel = "wechat_qr";
    sampleOrder.paidTime = new Date().toISOString();

    const sampleRefund = this.createRefund({
      appId: "demo_app",
      platformOrderNo: sampleOrder.platformOrderNo,
      merchantRefundNo: "REFUND_DEMO_10001",
      refundAmount: 3000,
      reason: "演示部分退款"
    });

    sampleRefund.status = "SUCCESS";
    sampleRefund.successTime = new Date().toISOString();
  }

  listMerchantApps(): Array<{
    appId: string;
    appName: string;
    status: string;
    signType: string;
    allowedChannels: string[];
  }> {
    return this.merchantApps;
  }

  createOrder(input: CreateOrderInput): OrderRecord {
    const merchantKey = `${input.appId}:${input.merchantOrderNo}`;
    const existingPlatformOrderNo = this.orderKeyIndex.get(merchantKey);

    if (existingPlatformOrderNo) {
      const existing = this.orders.get(existingPlatformOrderNo);

      if (!existing) {
        throw new NotFoundException("Existing order index is broken");
      }

      const isSameRequest =
        existing.amount === input.amount &&
        existing.currency === input.currency &&
        existing.subject === input.subject &&
        existing.notifyUrl === input.notifyUrl;

      if (!isSameRequest) {
        throw new ConflictException(
          "merchant_order_no already exists with different parameters"
        );
      }

      return existing;
    }

    const now = new Date();
    const expireTime = new Date(now.getTime() + input.expireInSeconds * 1000);
    const platformOrderNo = this.generateCode("P");
    const cashierUrl = `${this.configService.get<string>("WEB_BASE_URL") ?? "http://localhost:5173"}/cashier/${platformOrderNo}`;

    const record: OrderRecord = {
      appId: input.appId,
      platformOrderNo,
      merchantOrderNo: input.merchantOrderNo,
      amount: input.amount,
      paidAmount: 0,
      currency: input.currency,
      subject: input.subject,
      description: input.description,
      status: "WAIT_PAY",
      channel: null,
      notifyUrl: input.notifyUrl,
      returnUrl: input.returnUrl,
      expireTime: expireTime.toISOString(),
      createdAt: now.toISOString(),
      paidTime: null,
      allowedChannels: input.allowedChannels,
      metadata: input.metadata,
      cashierUrl
    };

    this.orderKeyIndex.set(merchantKey, platformOrderNo);
    this.orders.set(platformOrderNo, record);

    return record;
  }

  getOrderByPlatformOrderNo(platformOrderNo: string): OrderRecord {
    const order = this.orders.get(platformOrderNo);

    if (!order) {
      throw new NotFoundException("Order not found");
    }

    return order;
  }

  getOrderByMerchantOrderNo(appId: string, merchantOrderNo: string): OrderRecord {
    const platformOrderNo = this.orderKeyIndex.get(`${appId}:${merchantOrderNo}`);

    if (!platformOrderNo) {
      throw new NotFoundException("Order not found");
    }

    return this.getOrderByPlatformOrderNo(platformOrderNo);
  }

  listOrders(): OrderRecord[] {
    return [...this.orders.values()].sort((left, right) =>
      right.createdAt.localeCompare(left.createdAt)
    );
  }

  closeOrder(platformOrderNo: string): OrderRecord {
    const order = this.getOrderByPlatformOrderNo(platformOrderNo);

    if (order.status === "SUCCESS" || order.status === "REFUND_PART" || order.status === "REFUND_ALL") {
      return order;
    }

    order.status = "CLOSED";

    return order;
  }

  createRefund(input: CreateRefundInput): RefundRecord {
    const order = this.getOrderByPlatformOrderNo(input.platformOrderNo);

    if (order.appId !== input.appId) {
      throw new NotFoundException("Order not found for app");
    }

    if (!["SUCCESS", "REFUND_PART", "REFUND_ALL"].includes(order.status)) {
      throw new BadRequestException("only paid orders can be refunded");
    }

    const refundKey = `${input.appId}:${input.merchantRefundNo}`;
    const existingRefundNo = this.refundKeyIndex.get(refundKey);

    if (existingRefundNo) {
      const existing = this.refunds.get(existingRefundNo);

      if (!existing) {
        throw new NotFoundException("Existing refund index is broken");
      }

      const isSameRequest =
        existing.platformOrderNo === input.platformOrderNo &&
        existing.refundAmount === input.refundAmount;

      if (!isSameRequest) {
        throw new ConflictException(
          "merchant_refund_no already exists with different parameters"
        );
      }

      return existing;
    }

    const refundedAmount = [...this.refunds.values()]
      .filter((item) => item.platformOrderNo === input.platformOrderNo)
      .reduce((sum, item) => sum + item.refundAmount, 0);

    const paidAmount = order.paidAmount || order.amount;

    if (input.refundAmount + refundedAmount > paidAmount) {
      throw new BadRequestException("refund amount exceeds paid amount");
    }

    const refund: RefundRecord = {
      appId: input.appId,
      merchantRefundNo: input.merchantRefundNo,
      platformRefundNo: this.generateCode("R"),
      platformOrderNo: input.platformOrderNo,
      refundAmount: input.refundAmount,
      status: "SUCCESS",
      reason: input.reason,
      createdAt: new Date().toISOString(),
      successTime: new Date().toISOString()
    };

    this.refundKeyIndex.set(refundKey, refund.merchantRefundNo);
    this.refunds.set(refund.merchantRefundNo, refund);

    const totalRefundedAmount = refundedAmount + input.refundAmount;
    order.status =
      totalRefundedAmount >= paidAmount ? "REFUND_ALL" : "REFUND_PART";

    return refund;
  }

  getRefund(appId: string, merchantRefundNo: string): RefundRecord {
    const refundNo = this.refundKeyIndex.get(`${appId}:${merchantRefundNo}`);

    if (!refundNo) {
      throw new NotFoundException("Refund not found");
    }

    const refund = this.refunds.get(refundNo);

    if (!refund) {
      throw new NotFoundException("Refund not found");
    }

    return refund;
  }

  listRefunds(): RefundRecord[] {
    return [...this.refunds.values()].sort((left, right) =>
      right.createdAt.localeCompare(left.createdAt)
    );
  }

  getDashboardSummary(): {
    metrics: Array<{ key: string; label: string; value: number }>;
    latestOrders: OrderRecord[];
    latestRefunds: RefundRecord[];
  } {
    return {
      metrics: [
        { key: "merchantApps", label: "商户应用数", value: this.merchantApps.length },
        { key: "orders", label: "订单数", value: this.orders.size },
        { key: "refunds", label: "退款单数", value: this.refunds.size },
        {
          key: "successOrders",
          label: "成功或已退款订单数",
          value: [...this.orders.values()].filter((item) =>
            ["SUCCESS", "REFUND_PART", "REFUND_ALL"].includes(item.status)
          ).length
        }
      ],
      latestOrders: this.listOrders().slice(0, 5),
      latestRefunds: this.listRefunds().slice(0, 5)
    };
  }

  private generateCode(prefix: "P" | "R"): string {
    const date = new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
    const random = Math.floor(Math.random() * 100000)
      .toString()
      .padStart(5, "0");

    return `${prefix}${date}${random}`;
  }
}
