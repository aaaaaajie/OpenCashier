import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  OnModuleInit
} from "@nestjs/common";
import {
  BusinessType,
  MerchantStatus as PrismaMerchantStatus,
  OrderStatus as PrismaOrderStatus,
  type PayOrder,
  Prisma,
  RefundStatus as PrismaRefundStatus,
  SignType as PrismaSignType
} from "@prisma/client";
import { createCashierToken } from "../../common/utils/cashier-token.util";
import { PrismaService } from "../../prisma/prisma.service";
import { PaymentChannelRegistryService } from "./channels/payment-channel-registry.service";
import { PaymentAttemptService } from "./payment-attempt.service";
import { PlatformConfigService } from "./platform-config.service";

type OrderStatusValue =
  | "WAIT_PAY"
  | "PAYING"
  | "SUCCESS"
  | "CLOSED"
  | "EXPIRED"
  | "REFUND_PART"
  | "REFUND_ALL";

type RefundStatusValue =
  | "CREATED"
  | "PROCESSING"
  | "SUCCESS"
  | "FAILED"
  | "CLOSED";

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
  allowedChannels?: string[];
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
  status: OrderStatusValue;
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
  status: RefundStatusValue;
  reason: string;
  createdAt: string;
  successTime: string | null;
}

const DEFAULT_ALLOWED_CHANNELS = [
  "wechat_qr",
  "alipay_qr",
  "alipay_page",
  "alipay_wap"
];
const MIN_STRIPE_ORDER_EXPIRE_SECONDS = 60 * 60;
const REFUNDABLE_ORDER_STATUSES: PrismaOrderStatus[] = [
  PrismaOrderStatus.SUCCESS,
  PrismaOrderStatus.REFUND_PART,
  PrismaOrderStatus.REFUND_ALL
];
const ACTIVE_REFUND_STATUSES: PrismaRefundStatus[] = [
  PrismaRefundStatus.CREATED,
  PrismaRefundStatus.PROCESSING,
  PrismaRefundStatus.SUCCESS
];

@Injectable()
export class PaymentStoreService implements OnModuleInit {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly platformConfigService: PlatformConfigService,
    private readonly paymentChannelRegistryService: PaymentChannelRegistryService,
    private readonly paymentAttemptService: PaymentAttemptService
  ) {}

  async onModuleInit(): Promise<void> {
    await this.ensureDemoData();
  }

  async listMerchantApps(): Promise<Array<{
    appId: string;
    appName: string;
    status: string;
    signType: string;
    allowedChannels: string[];
  }>> {
    const merchantApps = await this.prismaService.merchantApp.findMany({
      orderBy: { createdAt: "desc" }
    });

    return merchantApps.map((app) => ({
      appId: app.appId,
      appName: app.appName,
      status: app.status,
      signType: this.toApiSignType(app.signType),
      allowedChannels: app.allowedChannels
    }));
  }

  async createOrder(input: CreateOrderInput): Promise<OrderRecord> {
    const merchantApp = await this.getActiveMerchantApp(input.appId);
    const allowedChannels = this.resolveAllowedChannels(
      merchantApp.allowedChannels,
      input.allowedChannels
    );
    const expireInSeconds = this.resolveEffectiveExpireInSeconds(
      input.expireInSeconds,
      allowedChannels
    );

    this.paymentChannelRegistryService.validateChannels(allowedChannels);
    const orderUniqueWhere = {
      appId_merchantOrderNo: {
        appId: input.appId,
        merchantOrderNo: input.merchantOrderNo
      }
    } as const;
    const existing = await this.prismaService.payOrder.findUnique({
      where: orderUniqueWhere
    });

    if (existing) {
      this.assertSameOrderRequest(existing, {
        ...input,
        allowedChannels
      });

      return this.toOrderRecord(existing);
    }

    const now = new Date();
    const expireTime = new Date(now.getTime() + expireInSeconds * 1000);

    try {
      const created = await this.prismaService.payOrder.create({
        data: {
          merchantId: merchantApp.merchantId,
          appId: input.appId,
          platformOrderNo: this.generateCode("P"),
          merchantOrderNo: input.merchantOrderNo,
          amount: input.amount,
          currency: input.currency,
          subject: input.subject,
          description: input.description,
          status: PrismaOrderStatus.WAIT_PAY,
          notifyUrl: input.notifyUrl,
          returnUrl: input.returnUrl,
          allowedChannels,
          expireTime,
          metadata: input.metadata
            ? (input.metadata as Prisma.InputJsonValue)
            : undefined
        }
      });

      return this.toOrderRecord(created);
    } catch (error) {
      if (!this.isUniqueConstraintError(error)) {
        throw error;
      }

      const conflicted = await this.prismaService.payOrder.findUnique({
        where: orderUniqueWhere
      });

      if (!conflicted) {
        throw error;
      }

      this.assertSameOrderRequest(conflicted, {
        ...input,
        allowedChannels
      });

      return this.toOrderRecord(conflicted);
    }
  }

  async getOrderByPlatformOrderNo(platformOrderNo: string): Promise<OrderRecord> {
    await this.markExpiredOrders();

    const existingOrder = await this.prismaService.payOrder.findUnique({
      where: { platformOrderNo }
    });

    if (!existingOrder) {
      throw new NotFoundException({
        code: "ORDER_NOT_FOUND",
        message: "Order not found"
      });
    }

    let order: PayOrder = existingOrder;
    order = await this.syncOrderIfNeeded(order);

    return this.toOrderRecord(order);
  }

  async getOrderByPlatformOrderNoForApp(
    appId: string,
    platformOrderNo: string
  ): Promise<OrderRecord> {
    await this.markExpiredOrders();

    let order = await this.getOwnedOrderEntityOrThrow(appId, platformOrderNo);
    order = await this.syncOrderIfNeeded(order);

    return this.toOrderRecord(order);
  }

  async getOrderByMerchantOrderNo(
    appId: string,
    merchantOrderNo: string
  ): Promise<OrderRecord> {
    await this.markExpiredOrders();

    const existingOrder = await this.prismaService.payOrder.findUnique({
      where: {
        appId_merchantOrderNo: {
          appId,
          merchantOrderNo
        }
      }
    });

    if (!existingOrder) {
      throw new NotFoundException({
        code: "ORDER_NOT_FOUND",
        message: "Order not found"
      });
    }

    let order: PayOrder = existingOrder;
    order = await this.syncOrderIfNeeded(order);

    return this.toOrderRecord(order);
  }

  async listOrders(): Promise<OrderRecord[]> {
    await this.markExpiredOrders();

    const orders = await this.prismaService.payOrder.findMany({
      orderBy: { createdAt: "desc" }
    });

    return orders.map((order) => this.toOrderRecord(order));
  }

  async closeOrder(platformOrderNo: string): Promise<OrderRecord> {
    await this.markExpiredOrders();

    const existingOrder = await this.prismaService.payOrder.findUnique({
      where: { platformOrderNo }
    });

    if (!existingOrder) {
      throw new NotFoundException({
        code: "ORDER_NOT_FOUND",
        message: "Order not found"
      });
    }

    let order: PayOrder = existingOrder;
    order = await this.syncOrderIfNeeded(order);

    if (
      order.status === PrismaOrderStatus.SUCCESS ||
      order.status === PrismaOrderStatus.REFUND_PART ||
      order.status === PrismaOrderStatus.REFUND_ALL ||
      order.status === PrismaOrderStatus.CLOSED ||
      order.status === PrismaOrderStatus.EXPIRED
    ) {
      return this.toOrderRecord(order);
    }

    const latestAttempt = await this.paymentAttemptService.findLatestAttemptForOrder(
      platformOrderNo,
      order.allowedChannels
    );

    if (latestAttempt) {
      const closeResult = await this.paymentChannelRegistryService.closeOrder({
        platformOrderNo,
        channel: latestAttempt.channel,
        channelRequestNo: latestAttempt.channelRequestNo,
        channelTradeNo: latestAttempt.channelTradeNo
      });

      if (closeResult?.tradeStatus === "UNCHANGED") {
        order = await this.syncOrderIfNeeded(order);

        if (order.status !== PrismaOrderStatus.WAIT_PAY && order.status !== PrismaOrderStatus.PAYING) {
          return this.toOrderRecord(order);
        }
      }

      await this.paymentAttemptService.markAttemptCancelled(latestAttempt.attemptNo, {
        failMessage: "order closed by platform"
      });
    }

    const updated = await this.markOrderClosedEntity(platformOrderNo, "MANUAL_CLOSE");

    return this.toOrderRecord(updated);
  }

  async closeOrderForApp(
    appId: string,
    platformOrderNo: string
  ): Promise<OrderRecord> {
    await this.getOwnedOrderEntityOrThrow(appId, platformOrderNo);

    return this.closeOrder(platformOrderNo);
  }

  async markOrderPaidFromChannel(input: {
    platformOrderNo: string;
    paidAmount?: number;
    successChannel?: string;
    paidTime?: string;
  }): Promise<OrderRecord> {
    const updatedOrder = await this.prismaService.$transaction(async (tx) => {
      const order = await tx.payOrder.findUnique({
        where: { platformOrderNo: input.platformOrderNo }
      });

      if (!order) {
        throw new NotFoundException({
          code: "ORDER_NOT_FOUND",
          message: "Order not found"
        });
      }

      if (
        order.status === PrismaOrderStatus.SUCCESS ||
        order.status === PrismaOrderStatus.REFUND_PART ||
        order.status === PrismaOrderStatus.REFUND_ALL
      ) {
        return order;
      }

      const updateResult = await tx.payOrder.updateMany({
        where: {
          platformOrderNo: input.platformOrderNo,
          status: {
            notIn: [
              PrismaOrderStatus.SUCCESS,
              PrismaOrderStatus.REFUND_PART,
              PrismaOrderStatus.REFUND_ALL
            ]
          }
        },
        data: {
          status: PrismaOrderStatus.SUCCESS,
          paidAmount: input.paidAmount ?? order.amount,
          successChannel: input.successChannel ?? order.successChannel,
          paidTime: input.paidTime ? new Date(input.paidTime) : new Date()
        }
      });

      const updated = await tx.payOrder.findUniqueOrThrow({
        where: { platformOrderNo: input.platformOrderNo }
      });

      if (updateResult.count > 0) {
        await this.createNotifyTask(tx, {
          businessType: BusinessType.PAY_ORDER,
          businessNo: updated.platformOrderNo,
          merchantId: updated.merchantId,
          notifyUrl: updated.notifyUrl,
          payload: {
            eventType: "PAY_SUCCESS",
            platformOrderNo: updated.platformOrderNo,
            merchantOrderNo: updated.merchantOrderNo,
            appId: updated.appId,
            amount: updated.amount,
            paidAmount: updated.paidAmount,
            status: updated.status,
            currency: updated.currency,
            channel: updated.successChannel,
            paidTime: updated.paidTime?.toISOString() ?? null
          }
        });
      }

      return updated;
    });

    return this.toOrderRecord(updatedOrder);
  }

  async markOrderClosedFromChannel(input: {
    platformOrderNo: string;
    closeReason: string;
  }): Promise<OrderRecord> {
    const updated = await this.markOrderClosedEntity(
      input.platformOrderNo,
      input.closeReason
    );

    return this.toOrderRecord(updated);
  }

  async createRefund(input: CreateRefundInput): Promise<RefundRecord> {
    await this.markExpiredOrders();

    const refundUniqueWhere = {
      appId_merchantRefundNo: {
        appId: input.appId,
        merchantRefundNo: input.merchantRefundNo
      }
    } as const;
    const existing = await this.prismaService.refundOrder.findUnique({
      where: refundUniqueWhere
    });

    if (existing) {
      this.assertSameRefundRequest(existing, input);

      return this.toRefundRecord(existing);
    }

    try {
      const preparedRefund = await this.prismaService.$transaction(async (tx) => {
        const order = await tx.payOrder.findUnique({
          where: { platformOrderNo: input.platformOrderNo }
        });

        if (!order || order.appId !== input.appId) {
          throw new NotFoundException({
            code: "ORDER_NOT_FOUND",
            message: "Order not found for app"
          });
        }

        if (!REFUNDABLE_ORDER_STATUSES.includes(order.status)) {
          throw new BadRequestException({
            code: "ORDER_STATUS_INVALID",
            message: "Only paid orders can be refunded"
          });
        }

        if (!order.successChannel) {
          throw new BadRequestException({
            code: "CHANNEL_UNAVAILABLE",
            message: "Order has no refundable success channel"
          });
        }

        const channelCatalog = this.paymentChannelRegistryService.getCatalogByChannel(
          order.successChannel
        );

        if (!channelCatalog?.enabled) {
          throw new BadRequestException({
            code: "CHANNEL_UNAVAILABLE",
            message: `${order.successChannel} is not configured for refund`
          });
        }

        const refundedAmountResult = await tx.refundOrder.aggregate({
          where: {
            platformOrderNo: input.platformOrderNo,
            status: {
              in: ACTIVE_REFUND_STATUSES
            }
          },
          _sum: {
            refundAmount: true
          }
        });
        const refundedAmount = refundedAmountResult._sum.refundAmount ?? 0;
        const paidAmount = order.paidAmount || order.amount;

        if (input.refundAmount + refundedAmount > paidAmount) {
          throw new BadRequestException({
            code: "REFUND_OVER_LIMIT",
            message: "Refund amount exceeds paid amount"
          });
        }

        const createdRefund = await tx.refundOrder.create({
          data: {
            appId: input.appId,
            platformRefundNo: this.generateCode("R"),
            merchantRefundNo: input.merchantRefundNo,
            platformOrderNo: input.platformOrderNo,
            refundAmount: input.refundAmount,
            status: PrismaRefundStatus.CREATED,
            reason: input.reason
          }
        });

        return {
          refundId: createdRefund.id,
          platformRefundNo: createdRefund.platformRefundNo,
          totalRefundedAmount: refundedAmount + input.refundAmount,
          paidAmount,
          successChannel: order.successChannel,
          channelTradeNo: await this.getLatestChannelTradeNo(tx, input.platformOrderNo),
          merchantId: order.merchantId,
          notifyUrl: order.notifyUrl
        };
      });
      const refundResult = await this.paymentChannelRegistryService.refundOrder({
        platformOrderNo: input.platformOrderNo,
        platformRefundNo: preparedRefund.platformRefundNo,
        merchantRefundNo: input.merchantRefundNo,
        refundAmount: input.refundAmount,
        reason: input.reason,
        channel: preparedRefund.successChannel,
        channelTradeNo: preparedRefund.channelTradeNo
      });

      if (!refundResult) {
        throw new BadRequestException({
          code: "CHANNEL_UNAVAILABLE",
          message: `${preparedRefund.successChannel} refund is not available`
        });
      }

      const refund = await this.prismaService.$transaction(async (tx) => {
        const updatedRefund = await tx.refundOrder.update({
          where: { id: preparedRefund.refundId },
          data: {
            status:
              refundResult.refundStatus === "SUCCESS"
                ? PrismaRefundStatus.SUCCESS
                : PrismaRefundStatus.PROCESSING,
            channelRefundNo: refundResult.channelRefundNo,
            channelPayload: refundResult.rawPayload
              ? (refundResult.rawPayload as Prisma.InputJsonValue)
              : undefined,
            successTime:
              refundResult.refundStatus === "SUCCESS"
                ? refundResult.successTime
                  ? new Date(refundResult.successTime)
                  : new Date()
                : null
          }
        });

        if (refundResult.refundStatus === "SUCCESS") {
          await tx.payOrder.update({
            where: { platformOrderNo: input.platformOrderNo },
            data: {
              status:
                preparedRefund.totalRefundedAmount >= preparedRefund.paidAmount
                  ? PrismaOrderStatus.REFUND_ALL
                  : PrismaOrderStatus.REFUND_PART
            }
          });

          await this.createNotifyTask(tx, {
            businessType: BusinessType.REFUND_ORDER,
            businessNo: updatedRefund.platformRefundNo,
            merchantId: preparedRefund.merchantId,
            notifyUrl: preparedRefund.notifyUrl,
            payload: {
              eventType: "REFUND_SUCCESS",
              platformRefundNo: updatedRefund.platformRefundNo,
              merchantRefundNo: updatedRefund.merchantRefundNo,
              platformOrderNo: updatedRefund.platformOrderNo,
              appId: updatedRefund.appId,
              refundAmount: updatedRefund.refundAmount,
              status: updatedRefund.status,
              reason: updatedRefund.reason,
              successTime: updatedRefund.successTime?.toISOString() ?? null
            }
          });
        }

        return updatedRefund;
      });

      return this.toRefundRecord(refund);
    } catch (error) {
      if (this.isUniqueConstraintError(error)) {
        const conflicted = await this.prismaService.refundOrder.findUnique({
          where: refundUniqueWhere
        });

        if (!conflicted) {
          throw error;
        }

        this.assertSameRefundRequest(conflicted, input);

        return this.toRefundRecord(conflicted);
      }

      const existingFailedRefund = await this.prismaService.refundOrder.findUnique({
        where: refundUniqueWhere
      });

      if (existingFailedRefund?.status === PrismaRefundStatus.CREATED) {
        await this.prismaService.refundOrder.update({
          where: { id: existingFailedRefund.id },
          data: {
            status: PrismaRefundStatus.FAILED,
            channelPayload: {
              error:
                error instanceof Error ? error.message : "refund request failed"
            } as Prisma.InputJsonValue
          }
        });
      }

      throw error;
    }
  }

  private async getLatestChannelTradeNo(
    tx: Prisma.TransactionClient,
    platformOrderNo: string
  ): Promise<string | null> {
    const latestAttempt = await tx.payAttempt.findFirst({
      where: {
        platformOrderNo,
        channelTradeNo: {
          not: null
        }
      },
      orderBy: { createdAt: "desc" }
    });

    return latestAttempt?.channelTradeNo ?? null;
  }

  async getRefund(appId: string, merchantRefundNo: string): Promise<RefundRecord> {
    const refund = await this.prismaService.refundOrder.findUnique({
      where: {
        appId_merchantRefundNo: {
          appId,
          merchantRefundNo
        }
      }
    });

    if (!refund) {
      throw new NotFoundException({
        code: "REFUND_NOT_FOUND",
        message: "Refund not found"
      });
    }

    return this.toRefundRecord(refund);
  }

  async listRefunds(): Promise<RefundRecord[]> {
    const refunds = await this.prismaService.refundOrder.findMany({
      orderBy: { createdAt: "desc" }
    });

    return refunds.map((refund) => this.toRefundRecord(refund));
  }

  async getDashboardSummary(): Promise<{
    metrics: Array<{ key: string; label: string; value: number }>;
    latestOrders: OrderRecord[];
    latestRefunds: RefundRecord[];
  }> {
    await this.markExpiredOrders();

    const [
      merchantAppCount,
      orderCount,
      refundCount,
      successOrderCount,
      latestOrders,
      latestRefunds
    ] = await Promise.all([
      this.prismaService.merchantApp.count(),
      this.prismaService.payOrder.count(),
      this.prismaService.refundOrder.count(),
      this.prismaService.payOrder.count({
        where: {
          status: {
            in: [
              PrismaOrderStatus.SUCCESS,
              PrismaOrderStatus.REFUND_PART,
              PrismaOrderStatus.REFUND_ALL
            ]
          }
        }
      }),
      this.prismaService.payOrder.findMany({
        orderBy: { createdAt: "desc" },
        take: 5
      }),
      this.prismaService.refundOrder.findMany({
        orderBy: { createdAt: "desc" },
        take: 5
      })
    ]);

    return {
      metrics: [
        { key: "merchantApps", label: "商户应用数", value: merchantAppCount },
        { key: "orders", label: "订单数", value: orderCount },
        { key: "refunds", label: "退款单数", value: refundCount },
        {
          key: "successOrders",
          label: "成功或已退款订单数",
          value: successOrderCount
        }
      ],
      latestOrders: latestOrders.map((order) => this.toOrderRecord(order)),
      latestRefunds: latestRefunds.map((refund) => this.toRefundRecord(refund))
    };
  }

  private generateCode(prefix: "P" | "R" | "N"): string {
    const date = new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
    const random = Math.floor(Math.random() * 100000)
      .toString()
      .padStart(5, "0");

    return `${prefix}${date}${random}`;
  }

  private async createNotifyTask(
    tx: Prisma.TransactionClient,
    input: {
      businessType: BusinessType;
      businessNo: string;
      merchantId: string;
      notifyUrl: string;
      payload: Record<string, unknown>;
    }
  ): Promise<void> {
    const notifyId = this.generateCode("N");

    await tx.notifyTask.create({
      data: {
        notifyId,
        businessType: input.businessType,
        businessNo: input.businessNo,
        merchantId: input.merchantId,
        notifyUrl: input.notifyUrl,
        payload: {
          notifyId,
          ...input.payload
        } as Prisma.InputJsonValue
      }
    });
  }

  private async syncOrderIfNeeded(order: PayOrder): Promise<PayOrder> {
    if (
      order.status !== PrismaOrderStatus.WAIT_PAY &&
      order.status !== PrismaOrderStatus.PAYING
    ) {
      return order;
    }

    const latestAttempt = await this.paymentAttemptService.findLatestAttemptForOrder(
      order.platformOrderNo,
      order.allowedChannels
    );

    if (!latestAttempt) {
      return order;
    }

    const queryResult = await this.paymentChannelRegistryService.queryOrder({
      platformOrderNo: order.platformOrderNo,
      channel: latestAttempt.channel,
      channelRequestNo: latestAttempt.channelRequestNo,
      channelTradeNo: latestAttempt.channelTradeNo
    });

    if (!queryResult) {
      return order;
    }

    if (queryResult.tradeStatus === "SUCCESS") {
      await this.paymentAttemptService.markAttemptSuccess(latestAttempt.attemptNo, {
        channelTradeNo: queryResult.channelTradeNo,
        successTime: queryResult.paidTime,
        channelPayload: queryResult.rawPayload
      });

      const updated = await this.markOrderPaidFromChannel({
        platformOrderNo: order.platformOrderNo,
        paidAmount: queryResult.paidAmount ?? order.amount,
        successChannel: latestAttempt.channel,
        paidTime: queryResult.paidTime
      });

      return this.prismaService.payOrder.findUniqueOrThrow({
        where: {
          platformOrderNo: updated.platformOrderNo
        }
      });
    }

    if (queryResult.tradeStatus === "CLOSED") {
      await this.paymentAttemptService.markAttemptCancelled(latestAttempt.attemptNo, {
        failMessage: "trade closed by channel"
      });

      return this.markOrderClosedEntity(order.platformOrderNo, "CHANNEL_CLOSED");
    }

    return order;
  }

  private async ensureDemoData(): Promise<void> {
    const now = new Date();
    const expireTime = new Date(now.getTime() + 15 * 60 * 1000);

    await this.prismaService.$transaction(async (tx) => {
      const merchant = await tx.merchant.upsert({
        where: { merchantNo: "M202603120001" },
        update: {
          merchantName: "演示商户",
          status: PrismaMerchantStatus.ACTIVE
        },
        create: {
          merchantNo: "M202603120001",
          merchantName: "演示商户",
          status: PrismaMerchantStatus.ACTIVE
        }
      });

      await tx.merchantApp.upsert({
        where: { appId: "demo_app" },
        update: {
          merchantId: merchant.id,
          appName: "演示商户应用",
          status: PrismaMerchantStatus.ACTIVE,
          signType: PrismaSignType.HMAC_SHA256,
          secretCiphertext: "demo_app_secret",
          allowedChannels: [
            "wechat_qr",
            "alipay_qr",
            "alipay_page",
            "alipay_wap",
            "stripe_checkout"
          ]
        },
        create: {
          merchantId: merchant.id,
          appId: "demo_app",
          appName: "演示商户应用",
          status: PrismaMerchantStatus.ACTIVE,
          signType: PrismaSignType.HMAC_SHA256,
          secretCiphertext: "demo_app_secret",
          allowedChannels: [
            "wechat_qr",
            "alipay_qr",
            "alipay_page",
            "alipay_wap",
            "stripe_checkout"
          ]
        }
      });

      await tx.merchantApp.upsert({
        where: { appId: "partner_app" },
        update: {
          merchantId: merchant.id,
          appName: "渠道联调应用",
          status: PrismaMerchantStatus.ACTIVE,
          signType: PrismaSignType.RSA2,
          secretCiphertext: "partner_app_secret",
          allowedChannels: ["wechat_qr"]
        },
        create: {
          merchantId: merchant.id,
          appId: "partner_app",
          appName: "渠道联调应用",
          status: PrismaMerchantStatus.ACTIVE,
          signType: PrismaSignType.RSA2,
          secretCiphertext: "partner_app_secret",
          allowedChannels: ["wechat_qr"]
        }
      });

      await tx.merchantApp.upsert({
        where: { appId: "demo_app_other" },
        update: {
          merchantId: merchant.id,
          appName: "第二演示商户应用",
          status: PrismaMerchantStatus.ACTIVE,
          signType: PrismaSignType.HMAC_SHA256,
          secretCiphertext: "demo_app_other_secret",
          allowedChannels: ["wechat_qr", "alipay_qr", "alipay_page"]
        },
        create: {
          merchantId: merchant.id,
          appId: "demo_app_other",
          appName: "第二演示商户应用",
          status: PrismaMerchantStatus.ACTIVE,
          signType: PrismaSignType.HMAC_SHA256,
          secretCiphertext: "demo_app_other_secret",
          allowedChannels: ["wechat_qr", "alipay_qr", "alipay_page"]
        }
      });

      const sampleOrder = await tx.payOrder.upsert({
        where: {
          appId_merchantOrderNo: {
            appId: "demo_app",
            merchantOrderNo: "ORDER_DEMO_10001"
          }
        },
        update: {
          merchantId: merchant.id,
          amount: 9900,
          currency: "CNY",
          subject: "VIP会员",
          description: "首个演示订单",
          status: PrismaOrderStatus.REFUND_PART,
          paidAmount: 9900,
          successChannel: "wechat_qr",
          notifyUrl: "https://merchant.example.com/pay/notify",
          returnUrl: "https://merchant.example.com/pay/result",
          allowedChannels: ["wechat_qr", "alipay_qr", "alipay_page", "alipay_wap"],
          expireTime,
          paidTime: now,
          metadata: {
            scene: "demo"
          } as Prisma.InputJsonValue
        },
        create: {
          merchantId: merchant.id,
          appId: "demo_app",
          platformOrderNo: this.generateCode("P"),
          merchantOrderNo: "ORDER_DEMO_10001",
          amount: 9900,
          currency: "CNY",
          subject: "VIP会员",
          description: "首个演示订单",
          status: PrismaOrderStatus.REFUND_PART,
          paidAmount: 9900,
          successChannel: "wechat_qr",
          notifyUrl: "https://merchant.example.com/pay/notify",
          returnUrl: "https://merchant.example.com/pay/result",
          allowedChannels: ["wechat_qr", "alipay_qr", "alipay_page", "alipay_wap"],
          expireTime,
          paidTime: now,
          metadata: {
            scene: "demo"
          } as Prisma.InputJsonValue
        }
      });

      await tx.refundOrder.upsert({
        where: {
          appId_merchantRefundNo: {
            appId: "demo_app",
            merchantRefundNo: "REFUND_DEMO_10001"
          }
        },
        update: {
          platformOrderNo: sampleOrder.platformOrderNo,
          refundAmount: 3000,
          status: PrismaRefundStatus.SUCCESS,
          reason: "演示部分退款",
          successTime: now
        },
        create: {
          appId: "demo_app",
          platformRefundNo: this.generateCode("R"),
          merchantRefundNo: "REFUND_DEMO_10001",
          platformOrderNo: sampleOrder.platformOrderNo,
          refundAmount: 3000,
          status: PrismaRefundStatus.SUCCESS,
          reason: "演示部分退款",
          successTime: now
        }
      });
    });
  }

  private async markExpiredOrders(): Promise<void> {
    await this.prismaService.payOrder.updateMany({
      where: {
        status: {
          in: [PrismaOrderStatus.WAIT_PAY, PrismaOrderStatus.PAYING]
        },
        expireTime: {
          lt: new Date()
        }
      },
      data: {
        status: PrismaOrderStatus.EXPIRED,
        closeReason: "ORDER_TIMEOUT"
      }
    });
  }

  private async markOrderClosedEntity(
    platformOrderNo: string,
    closeReason: string
  ) {
    const order = await this.prismaService.payOrder.findUnique({
      where: { platformOrderNo }
    });

    if (!order) {
      throw new NotFoundException({
        code: "ORDER_NOT_FOUND",
        message: "Order not found"
      });
    }

    if (
      order.status === PrismaOrderStatus.SUCCESS ||
      order.status === PrismaOrderStatus.REFUND_PART ||
      order.status === PrismaOrderStatus.REFUND_ALL
    ) {
      return order;
    }

    if (
      order.status === PrismaOrderStatus.CLOSED ||
      order.status === PrismaOrderStatus.EXPIRED
    ) {
      return order;
    }

    return this.prismaService.payOrder.update({
      where: { platformOrderNo },
      data: {
        status: PrismaOrderStatus.CLOSED,
        closeReason
      }
    });
  }

  private async getActiveMerchantApp(appId: string) {
    const merchantApp = await this.prismaService.merchantApp.findUnique({
      where: { appId },
      include: { merchant: true }
    });

    if (!merchantApp) {
      throw new NotFoundException({
        code: "AUTH_INVALID",
        message: "Merchant app not found"
      });
    }

    if (
      merchantApp.status !== PrismaMerchantStatus.ACTIVE ||
      merchantApp.merchant.status !== PrismaMerchantStatus.ACTIVE
    ) {
      throw new BadRequestException({
        code: "AUTH_INVALID",
        message: "Merchant app is inactive"
      });
    }

    return merchantApp;
  }

  private async getOwnedOrderEntityOrThrow(
    appId: string,
    platformOrderNo: string
  ): Promise<PayOrder> {
    const order = await this.prismaService.payOrder.findUnique({
      where: { platformOrderNo }
    });

    if (!order || order.appId !== appId) {
      throw new NotFoundException({
        code: "ORDER_NOT_FOUND",
        message: "Order not found"
      });
    }

    return order;
  }

  private resolveAllowedChannels(
    appAllowedChannels: string[],
    requestedChannels?: string[]
  ): string[] {
    const appChannels =
      appAllowedChannels.length > 0 ? appAllowedChannels : DEFAULT_ALLOWED_CHANNELS;
    const normalizedRequested =
      requestedChannels && requestedChannels.length > 0
        ? [...new Set(requestedChannels)]
        : appChannels;
    const disallowedChannels = normalizedRequested.filter(
      (channel) => !appChannels.includes(channel)
    );

    if (disallowedChannels.length > 0) {
      throw new BadRequestException(
        `channels not enabled for app: ${disallowedChannels.join(", ")}`
      );
    }

    return normalizedRequested;
  }

  private assertSameOrderRequest(
    existing: {
      amount: number;
      currency: string;
      subject: string;
      description: string | null;
      notifyUrl: string;
      returnUrl: string | null;
      allowedChannels: string[];
      metadata: Prisma.JsonValue | null;
    },
    input: CreateOrderInput & { allowedChannels: string[] }
  ): void {
    const isSameRequest =
      existing.amount === input.amount &&
      existing.currency === input.currency &&
      existing.subject === input.subject &&
      (existing.description ?? null) === (input.description ?? null) &&
      existing.notifyUrl === input.notifyUrl &&
      (existing.returnUrl ?? null) === (input.returnUrl ?? null) &&
      this.sameStringArray(existing.allowedChannels, input.allowedChannels) &&
      this.sameJson(existing.metadata, input.metadata ?? null);

    if (!isSameRequest) {
      throw new ConflictException(
        "merchant_order_no already exists with different parameters"
      );
    }
  }

  private resolveEffectiveExpireInSeconds(
    requestedExpireInSeconds: number,
    allowedChannels: string[]
  ): number {
    if (!allowedChannels.includes("stripe_checkout")) {
      return requestedExpireInSeconds;
    }

    // Stripe Checkout sessions require at least a 30-minute remaining lifetime.
    // Keep a larger platform-side buffer so users can still open the cashier after
    // order creation without immediately failing to create the Stripe session.
    return Math.max(requestedExpireInSeconds, MIN_STRIPE_ORDER_EXPIRE_SECONDS);
  }

  private assertSameRefundRequest(
    existing: {
      platformOrderNo: string;
      refundAmount: number;
      reason: string;
    },
    input: CreateRefundInput
  ): void {
    const isSameRequest =
      existing.platformOrderNo === input.platformOrderNo &&
      existing.refundAmount === input.refundAmount &&
      existing.reason === input.reason;

    if (!isSameRequest) {
      throw new ConflictException(
        "merchant_refund_no already exists with different parameters"
      );
    }
  }

  private toOrderRecord(order: {
    appId: string;
    platformOrderNo: string;
    merchantOrderNo: string;
    amount: number;
    paidAmount: number;
    currency: string;
    subject: string;
    description: string | null;
    status: PrismaOrderStatus;
    successChannel: string | null;
    notifyUrl: string;
    returnUrl: string | null;
    expireTime: Date;
    createdAt: Date;
    paidTime: Date | null;
    allowedChannels: string[];
    metadata: Prisma.JsonValue | null;
  }): OrderRecord {
    return {
      appId: order.appId,
      platformOrderNo: order.platformOrderNo,
      merchantOrderNo: order.merchantOrderNo,
      amount: order.amount,
      paidAmount: order.paidAmount,
      currency: order.currency,
      subject: order.subject,
      description: order.description ?? undefined,
      status: order.status,
      channel: order.successChannel,
      notifyUrl: order.notifyUrl,
      returnUrl: order.returnUrl ?? undefined,
      expireTime: order.expireTime.toISOString(),
      createdAt: order.createdAt.toISOString(),
      paidTime: order.paidTime?.toISOString() ?? null,
      allowedChannels: order.allowedChannels,
      metadata: this.toMetadataRecord(order.metadata),
      cashierUrl: this.getCashierUrl(order.platformOrderNo, order.expireTime)
    };
  }

  private toRefundRecord(refund: {
    appId: string;
    merchantRefundNo: string;
    platformRefundNo: string;
    platformOrderNo: string;
    refundAmount: number;
    status: PrismaRefundStatus;
    reason: string;
    createdAt: Date;
    successTime: Date | null;
  }): RefundRecord {
    return {
      appId: refund.appId,
      merchantRefundNo: refund.merchantRefundNo,
      platformRefundNo: refund.platformRefundNo,
      platformOrderNo: refund.platformOrderNo,
      refundAmount: refund.refundAmount,
      status: refund.status,
      reason: refund.reason,
      createdAt: refund.createdAt.toISOString(),
      successTime: refund.successTime?.toISOString() ?? null
    };
  }

  private getCashierUrl(platformOrderNo: string, expireTime: Date): string {
    const secret =
      this.platformConfigService.get("APP_SECRET") ?? "local-dev-app-secret";
    const cashierToken = createCashierToken(secret, {
      platformOrderNo,
      expireTime: expireTime.toISOString()
    });

    const appBaseUrl =
      this.platformConfigService.get("APP_BASE_URL") ?? "http://localhost:3000";

    return `${appBaseUrl.replace(/\/$/, "")}/api/cashier/${cashierToken}`;
  }

  private toApiSignType(signType: PrismaSignType): string {
    return signType === PrismaSignType.HMAC_SHA256 ? "HMAC-SHA256" : signType;
  }

  private toMetadataRecord(
    value: Prisma.JsonValue | null
  ): Record<string, unknown> | undefined {
    if (!value || Array.isArray(value) || typeof value !== "object") {
      return undefined;
    }

    return value as Record<string, unknown>;
  }

  private sameStringArray(left: string[], right: string[]): boolean {
    return this.stableStringify([...left].sort()) === this.stableStringify([...right].sort());
  }

  private sameJson(left: Prisma.JsonValue | null, right: unknown): boolean {
    return this.stableStringify(left) === this.stableStringify(right);
  }

  private stableStringify(value: unknown): string {
    return JSON.stringify(this.sortJsonValue(value) ?? null);
  }

  private sortJsonValue(value: unknown): unknown {
    if (Array.isArray(value)) {
      return value.map((item) => this.sortJsonValue(item));
    }

    if (value && typeof value === "object") {
      return Object.keys(value as Record<string, unknown>)
        .sort()
        .reduce<Record<string, unknown>>((result, key) => {
          result[key] = this.sortJsonValue(
            (value as Record<string, unknown>)[key]
          );

          return result;
        }, {});
    }

    return value;
  }

  private isUniqueConstraintError(error: unknown): boolean {
    return (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "P2002"
    );
  }
}
