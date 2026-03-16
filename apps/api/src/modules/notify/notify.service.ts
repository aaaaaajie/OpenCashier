import { Injectable } from "@nestjs/common";
import { createHash } from "node:crypto";
import { Prisma, type PayAttempt } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { AlipayChannelAdapter } from "../payment/channels/adapters/alipay-channel.adapter";
import { StripeChannelAdapter } from "../payment/channels/adapters/stripe-channel.adapter";
import { WechatPayChannelAdapter } from "../payment/channels/adapters/wechatpay-channel.adapter";
import type { ProviderNotifyResult } from "../payment/channels/payment-channel.types";
import { PaymentAttemptService } from "../payment/payment-attempt.service";
import { PaymentStoreService } from "../payment/payment-store.service";

const ALIPAY_NOTIFY_CHANNEL = "alipay_notify";
const ALIPAY_NOTIFY_EVENT_TYPE = "TRADE_NOTIFY";
const WECHATPAY_NOTIFY_CHANNEL = "wechatpay_notify";
const WECHATPAY_NOTIFY_EVENT_TYPE = "PAYMENT_NOTIFY";
const STRIPE_NOTIFY_CHANNEL = "stripe_notify";
const STRIPE_NOTIFY_EVENT_TYPE = "STRIPE_EVENT";

@Injectable()
export class NotifyService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly alipayChannelAdapter: AlipayChannelAdapter,
    private readonly stripeChannelAdapter: StripeChannelAdapter,
    private readonly wechatPayChannelAdapter: WechatPayChannelAdapter,
    private readonly paymentStoreService: PaymentStoreService,
    private readonly paymentAttemptService: PaymentAttemptService
  ) {}

  async handleAlipayNotify(payload: Record<string, unknown>): Promise<"success"> {
    const channelEventId = this.resolveAlipayChannelEventId(payload);
    const eventLog = await this.upsertChannelEventLog({
      channel: ALIPAY_NOTIFY_CHANNEL,
      channelEventId,
      eventType: ALIPAY_NOTIFY_EVENT_TYPE,
      resourceNo: this.asOptionalString(payload.out_trade_no ?? payload.outTradeNo),
      rawPayload: payload as Prisma.InputJsonValue
    });

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
        ? await this.findAttemptForNotify(
            event.platformOrderNo,
            event.channelTradeNo,
            ["alipay_qr", "alipay_page", "alipay_wap"]
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

  async handleWechatPayNotify(input: {
    headers: Record<string, string | string[] | undefined>;
    body: string;
  }): Promise<void> {
    const parsedBody = this.tryParseJson(input.body);
    const channelEventId = this.resolveWechatPayChannelEventId(parsedBody, input.body);
    const eventLog = await this.upsertChannelEventLog({
      channel: WECHATPAY_NOTIFY_CHANNEL,
      channelEventId,
      eventType:
        this.asOptionalString(parsedBody?.event_type) ?? WECHATPAY_NOTIFY_EVENT_TYPE,
      rawPayload: {
        headers: this.normalizeHeaders(input.headers),
        body: input.body,
        parsedBody: (parsedBody ?? null) as Prisma.InputJsonValue | null
      } as Prisma.InputJsonValue
    });

    if (this.hasProcessedSuccessfully(eventLog.processedResult)) {
      return;
    }

    let event: ProviderNotifyResult & { eventType: string };

    try {
      event = await this.wechatPayChannelAdapter.verifyPaymentNotify(input);
    } catch (error) {
      await this.updateChannelEventLog(eventLog.id, {
        processedResult: {
          status: "VERIFY_FAILED",
          error: this.toErrorMessage(error, "wechatpay notify verification failed"),
          failedAt: new Date().toISOString()
        }
      });
      throw error;
    }

    let orderStatus = "UNCHANGED";
    let attemptNo: string | undefined;

    try {
      const attempt = await this.findAttemptForNotify(
        event.platformOrderNo,
        event.channelTradeNo,
        ["wechat_qr"]
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
          successChannel: attempt?.channel ?? "wechat_qr",
          paidTime: event.paidTime
        });

        orderStatus = order.status;
      } else if (event.tradeStatus === "CLOSED") {
        if (attemptNo) {
          await this.paymentAttemptService.markAttemptCancelled(attemptNo, {
            failMessage: "closed by wechatpay notify"
          });
        }

        const order = await this.paymentStoreService.markOrderClosedFromChannel({
          platformOrderNo: event.platformOrderNo,
          closeReason: "WECHATPAY_NOTIFY_CLOSED"
        });

        orderStatus = order.status;
      }

      await this.updateChannelEventLog(eventLog.id, {
        resourceNo: event.platformOrderNo,
        verifyResult: true,
        processedResult: {
          status: "PROCESSED",
          eventType: event.eventType,
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
          eventType: event.eventType,
          tradeStatus: event.tradeStatus,
          attemptNo: attemptNo ?? null,
          error: this.toErrorMessage(error, "wechatpay notify processing failed"),
          failedAt: new Date().toISOString()
        }
      });
      throw error;
    }
  }

  async handleStripeNotify(input: {
    headers: Record<string, string | string[] | undefined>;
    body: string;
  }): Promise<void> {
    const parsedBody = this.tryParseJson(input.body);
    const channelEventId = this.resolveStripeChannelEventId(parsedBody, input.body);
    const eventLog = await this.upsertChannelEventLog({
      channel: STRIPE_NOTIFY_CHANNEL,
      channelEventId,
      eventType: this.asOptionalString(parsedBody?.type) ?? STRIPE_NOTIFY_EVENT_TYPE,
      rawPayload: {
        headers: this.normalizeHeaders(input.headers),
        body: input.body,
        parsedBody: (parsedBody ?? null) as Prisma.InputJsonValue | null
      } as Prisma.InputJsonValue
    });

    if (this.hasProcessedSuccessfully(eventLog.processedResult)) {
      return;
    }

    let event: ProviderNotifyResult & { eventType: string };

    try {
      event = await this.stripeChannelAdapter.verifyCheckoutNotify(input);
    } catch (error) {
      await this.updateChannelEventLog(eventLog.id, {
        processedResult: {
          status: "VERIFY_FAILED",
          error: this.toErrorMessage(error, "stripe notify verification failed"),
          failedAt: new Date().toISOString()
        }
      });
      throw error;
    }

    let orderStatus = "UNCHANGED";
    let attemptNo: string | undefined;

    try {
      const attempt = await this.findStripeAttemptForNotify(event);

      if (attempt) {
        attemptNo = attempt.attemptNo;
      }

      if (event.tradeStatus === "SUCCESS") {
        if (attemptNo) {
          await this.paymentAttemptService.markAttemptSuccess(attemptNo, {
            channelRequestNo: event.channelRequestNo,
            channelTradeNo: event.channelTradeNo,
            successTime: event.paidTime,
            channelPayload: event.rawPayload
          });
        }

        const order = await this.paymentStoreService.markOrderPaidFromChannel({
          platformOrderNo: event.platformOrderNo,
          paidAmount: event.paidAmount,
          successChannel: attempt?.channel ?? "stripe_checkout",
          paidTime: event.paidTime
        });

        orderStatus = order.status;
      } else if (event.tradeStatus === "CLOSED") {
        if (attemptNo) {
          await this.paymentAttemptService.markAttemptCancelled(attemptNo, {
            failMessage: "stripe checkout session expired"
          });
        }
      }

      await this.updateChannelEventLog(eventLog.id, {
        resourceNo: event.platformOrderNo,
        verifyResult: true,
        processedResult: {
          status: "PROCESSED",
          eventType: event.eventType,
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
          eventType: event.eventType,
          tradeStatus: event.tradeStatus,
          attemptNo: attemptNo ?? null,
          error: this.toErrorMessage(error, "stripe notify processing failed"),
          failedAt: new Date().toISOString()
        }
      });
      throw error;
    }
  }

  private async upsertChannelEventLog(
    input: {
      channel: string;
      channelEventId: string;
      eventType: string;
      resourceNo?: string;
      rawPayload: Prisma.InputJsonValue;
    }
  ) {
    return this.prismaService.channelEventLog.upsert({
      where: {
        channel_channelEventId: {
          channel: input.channel,
          channelEventId: input.channelEventId
        }
      },
      create: {
        channel: input.channel,
        channelEventId: input.channelEventId,
        eventType: input.eventType,
        resourceNo: input.resourceNo,
        rawPayload: input.rawPayload
      },
      update: {
        eventType: input.eventType,
        resourceNo: input.resourceNo ?? undefined,
        rawPayload: input.rawPayload
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

  private async findAttemptForNotify(
    platformOrderNo: string,
    channelTradeNo: string | undefined,
    channels: string[]
  ): Promise<PayAttempt | null> {
    if (channelTradeNo) {
      const attempt =
        await this.paymentAttemptService.findAttemptByChannelTradeNo(channelTradeNo);

      if (attempt) {
        return attempt;
      }
    }

    return this.paymentAttemptService.findLatestAttemptForOrder(
      platformOrderNo,
      channels
    );
  }

  private async findStripeAttemptForNotify(
    event: ProviderNotifyResult
  ): Promise<PayAttempt | null> {
    if (event.attemptNo) {
      const attempt = await this.paymentAttemptService.findAttemptByAttemptNo(
        event.attemptNo
      );

      if (attempt && attempt.platformOrderNo === event.platformOrderNo) {
        return attempt;
      }
    }

    if (event.channelRequestNo) {
      const attempt = await this.paymentAttemptService.findAttemptByChannelRequestNo(
        event.channelRequestNo
      );

      if (attempt && attempt.platformOrderNo === event.platformOrderNo) {
        return attempt;
      }
    }

    return this.findAttemptForNotify(
      event.platformOrderNo,
      event.channelTradeNo,
      ["stripe_checkout"]
    );
  }

  private resolveAlipayChannelEventId(payload: Record<string, unknown>): string {
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

  private resolveWechatPayChannelEventId(
    payload: Record<string, unknown> | null,
    rawBody: string
  ): string {
    const eventId = this.asOptionalString(payload?.id);

    if (eventId) {
      return eventId;
    }

    const payloadDigest = createHash("sha256")
      .update(rawBody)
      .digest("hex")
      .slice(0, 24);

    return `missing:${payloadDigest}`;
  }

  private resolveStripeChannelEventId(
    payload: Record<string, unknown> | null,
    rawBody: string
  ): string {
    const eventId = this.asOptionalString(payload?.id);

    if (eventId) {
      return eventId;
    }

    const payloadDigest = createHash("sha256")
      .update(rawBody)
      .digest("hex")
      .slice(0, 24);

    return `missing:${payloadDigest}`;
  }

  private normalizeHeaders(
    headers: Record<string, string | string[] | undefined>
  ): Record<string, string | string[]> {
    const normalized: Record<string, string | string[]> = {};

    for (const [key, value] of Object.entries(headers)) {
      if (typeof value === "string") {
        normalized[key] = value;
        continue;
      }

      if (Array.isArray(value)) {
        normalized[key] = value.filter(
          (item): item is string => typeof item === "string"
        );
      }
    }

    return normalized;
  }

  private tryParseJson(value: string): Record<string, unknown> | null {
    try {
      const parsed = JSON.parse(value);

      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        return null;
      }

      return parsed as Record<string, unknown>;
    } catch {
      return null;
    }
  }

  private asOptionalString(value: unknown): string | undefined {
    return typeof value === "string" && value.trim().length > 0 ? value : undefined;
  }

  private toErrorMessage(error: unknown, fallback: string): string {
    return error instanceof Error && error.message ? error.message : fallback;
  }
}
