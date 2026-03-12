import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { AlipayChannelAdapter } from "../payment/channels/adapters/alipay-channel.adapter";
import { PaymentAttemptService } from "../payment/payment-attempt.service";
import { PaymentStoreService } from "../payment/payment-store.service";

@Injectable()
export class NotifyService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly alipayChannelAdapter: AlipayChannelAdapter,
    private readonly paymentStoreService: PaymentStoreService,
    private readonly paymentAttemptService: PaymentAttemptService
  ) {}

  async handleAlipayNotify(payload: Record<string, unknown>): Promise<"success"> {
    const event = await this.alipayChannelAdapter.verifyNotify(payload);
    const eventLog = await this.createChannelEventLog(event.eventId, payload);

    if (!eventLog) {
      return "success";
    }

    let orderStatus = "UNCHANGED";
    let attemptNo: string | undefined;

    const attempt = event.channelTradeNo
      ? await this.paymentAttemptService.findAttemptByChannelTradeNo(
          event.channelTradeNo
        )
      : await this.paymentAttemptService.findLatestAttemptForOrder(
          event.platformOrderNo,
          ["alipay_qr", "alipay_wap"]
        );

    if (attempt) {
      attemptNo = attempt.attemptNo;
    }

    if (event.tradeStatus === "SUCCESS") {
      if (attemptNo) {
        await this.paymentAttemptService.markAttemptSuccess(attemptNo, {
          channelTradeNo: event.channelTradeNo,
          successTime: event.paidTime,
          channelPayload: event.rawPayload
        });
      }

      const order = await this.paymentStoreService.markOrderPaidFromChannel({
        platformOrderNo: event.platformOrderNo,
        paidAmount: event.paidAmount,
        successChannel: attempt?.channel,
        paidTime: event.paidTime
      });

      orderStatus = order.status;
    } else if (event.tradeStatus === "CLOSED") {
      if (attemptNo) {
        await this.paymentAttemptService.markAttemptCancelled(attemptNo, {
          failMessage: "closed by alipay notify"
        });
      }

      const order = await this.paymentStoreService.markOrderClosedFromChannel({
        platformOrderNo: event.platformOrderNo,
        closeReason: "ALIPAY_NOTIFY_CLOSED"
      });

      orderStatus = order.status;
    }

    await this.prismaService.channelEventLog.update({
      where: {
        channel_channelEventId: {
          channel: "alipay_notify",
          channelEventId: event.eventId
        }
      },
      data: {
        processedResult: {
          tradeStatus: event.tradeStatus,
          orderStatus,
          attemptNo: attemptNo ?? null,
          processedAt: new Date().toISOString()
        } as Prisma.InputJsonValue
      }
    });

    return "success";
  }

  private async createChannelEventLog(
    eventId: string,
    payload: Record<string, unknown>
  ) {
    try {
      return await this.prismaService.channelEventLog.create({
        data: {
          channel: "alipay_notify",
          channelEventId: eventId,
          eventType: "TRADE_NOTIFY",
          resourceNo: String(payload.out_trade_no ?? ""),
          verifyResult: true,
          rawPayload: payload as Prisma.InputJsonValue
        }
      });
    } catch (error) {
      if (this.isUniqueConstraintError(error)) {
        return null;
      }

      throw error;
    }
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
