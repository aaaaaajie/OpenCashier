import { Injectable } from "@nestjs/common";
import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { AlipayChannelAdapter } from "../payment/channels/adapters/alipay-channel.adapter";
import type { ProviderNotifyResult } from "../payment/channels/payment-channel.types";
import { PaymentAttemptService } from "../payment/payment-attempt.service";
import { PaymentStoreService } from "../payment/payment-store.service";

const ALIPAY_NOTIFY_CHANNEL = "alipay_notify";
const ALIPAY_NOTIFY_EVENT_TYPE = "TRADE_NOTIFY";

@Injectable()
export class NotifyService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly alipayChannelAdapter: AlipayChannelAdapter,
    private readonly paymentStoreService: PaymentStoreService,
    private readonly paymentAttemptService: PaymentAttemptService
  ) {}

  async handleAlipayNotify(payload: Record<string, unknown>): Promise<"success"> {
    const channelEventId = this.resolveChannelEventId(payload);
    const eventLog = await this.upsertChannelEventLog(channelEventId, payload);

    if (this.hasProcessedSuccessfully(eventLog.processedResult)) {
      return "success";
    }

    let event: ProviderNotifyResult;

    try {
      event = await this.alipayChannelAdapter.verifyNotify(payload);
    } catch (error) {
      await this.updateChannelEventLog(eventLog.id, {
        processedResult: {
          status: "VERIFY_FAILED",
          error: this.toErrorMessage(error, "alipay notify verification failed"),
          failedAt: new Date().toISOString()
        }
      });
      throw error;
    }

    let orderStatus = "UNCHANGED";
    let attemptNo: string | undefined;

    try {
      const attempt = event.channelTradeNo
        ? await this.paymentAttemptService.findAttemptByChannelTradeNo(
            event.channelTradeNo
          )
        : await this.paymentAttemptService.findLatestAttemptForOrder(
            event.platformOrderNo,
            ["alipay_qr", "alipay_page", "alipay_wap"]
          );

      if (attempt) {
        attemptNo = attempt.attemptNo;
      }

      if (event.tradeStatus === "SUCCESS") {
        if (attemptNo) {
          await this.paymentAttemptService.markAttemptSuccess(attemptNo, {
            channelTradeNo: event.channelTradeNo,
            successTime: event.paidTime
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

      await this.updateChannelEventLog(eventLog.id, {
        resourceNo: event.platformOrderNo,
        verifyResult: true,
        processedResult: {
          status: "PROCESSED",
          tradeStatus: event.tradeStatus,
          orderStatus,
          attemptNo: attemptNo ?? null,
          processedAt: new Date().toISOString()
        }
      });
    } catch (error) {
      await this.updateChannelEventLog(eventLog.id, {
        resourceNo: event.platformOrderNo,
        verifyResult: true,
        processedResult: {
          status: "PROCESS_FAILED",
          tradeStatus: event.tradeStatus,
          attemptNo: attemptNo ?? null,
          error: this.toErrorMessage(error, "alipay notify processing failed"),
          failedAt: new Date().toISOString()
        }
      });
      throw error;
    }

    return "success";
  }

  private async upsertChannelEventLog(
    channelEventId: string,
    payload: Record<string, unknown>
  ) {
    return this.prismaService.channelEventLog.upsert({
      where: {
        channel_channelEventId: {
          channel: ALIPAY_NOTIFY_CHANNEL,
          channelEventId
        }
      },
      create: {
        channel: ALIPAY_NOTIFY_CHANNEL,
        channelEventId,
        eventType: ALIPAY_NOTIFY_EVENT_TYPE,
        resourceNo: this.asOptionalString(payload.out_trade_no ?? payload.outTradeNo),
        rawPayload: payload as Prisma.InputJsonValue
      },
      update: {
        resourceNo:
          this.asOptionalString(payload.out_trade_no ?? payload.outTradeNo) ?? undefined,
        rawPayload: payload as Prisma.InputJsonValue
      }
    });
  }

  private async updateChannelEventLog(
    eventLogId: string,
    input: {
      resourceNo?: string;
      verifyResult?: boolean;
      processedResult: Record<string, unknown>;
    }
  ) {
    await this.prismaService.channelEventLog.update({
      where: { id: eventLogId },
      data: {
        resourceNo: input.resourceNo,
        verifyResult: input.verifyResult,
        processedResult: input.processedResult as Prisma.InputJsonValue
      }
    });
  }

  private hasProcessedSuccessfully(processedResult: Prisma.JsonValue | null): boolean {
    return this.readProcessedStatus(processedResult) === "PROCESSED";
  }

  private readProcessedStatus(
    processedResult: Prisma.JsonValue | null
  ): string | undefined {
    if (
      !processedResult ||
      typeof processedResult !== "object" ||
      Array.isArray(processedResult)
    ) {
      return undefined;
    }

    const status = (processedResult as Record<string, unknown>).status;
    return typeof status === "string" ? status : undefined;
  }

  private resolveChannelEventId(payload: Record<string, unknown>): string {
    const eventId = this.asOptionalString(payload.notify_id ?? payload.notifyId);

    if (eventId) {
      return eventId;
    }

    const payloadDigest = createHash("sha256")
      .update(JSON.stringify(payload))
      .digest("hex")
      .slice(0, 24);

    return `missing:${payloadDigest}`;
  }

  private asOptionalString(value: unknown): string | undefined {
    return typeof value === "string" && value.trim().length > 0 ? value : undefined;
  }

  private toErrorMessage(error: unknown, fallback: string): string {
    return error instanceof Error && error.message ? error.message : fallback;
  }
}
