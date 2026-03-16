import { Injectable } from "@nestjs/common";
import {
  PayAttemptStatus,
  Prisma,
  type PayAttempt
} from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";

interface CreateAttemptInput {
  platformOrderNo: string;
  channel: string;
  channelRequestNo: string;
  expireTime?: string;
}

interface MarkAttemptReadyInput {
  channelRequestNo?: string;
  channelTradeNo?: string;
  qrContent?: string;
  payUrl?: string;
  expireTime?: string;
  channelPayload?: Record<string, unknown>;
}

interface MarkAttemptFailedInput {
  failCode?: string;
  failMessage: string;
  channelPayload?: Record<string, unknown>;
}

interface MarkAttemptSuccessInput {
  channelRequestNo?: string;
  channelTradeNo?: string;
  successTime?: string;
  channelPayload?: Record<string, unknown>;
}

interface MarkAttemptCancelledInput {
  failMessage?: string;
}

@Injectable()
export class PaymentAttemptService {
  constructor(private readonly prismaService: PrismaService) {}

  async findReusableAttempt(
    platformOrderNo: string,
    channel: string
  ): Promise<PayAttempt | null> {
    return this.prismaService.payAttempt.findFirst({
      where: {
        platformOrderNo,
        channel,
        status: {
          in: [PayAttemptStatus.CHANNEL_REQUESTING, PayAttemptStatus.USER_PAYING]
        },
        OR: [{ expireTime: null }, { expireTime: { gt: new Date() } }]
      },
      orderBy: { createdAt: "desc" }
    });
  }

  async findLatestAttemptForOrder(
    platformOrderNo: string,
    channels?: string[]
  ): Promise<PayAttempt | null> {
    return this.prismaService.payAttempt.findFirst({
      where: {
        platformOrderNo,
        ...(channels?.length
          ? {
              channel: {
                in: channels
              }
            }
          : {})
      },
      orderBy: { createdAt: "desc" }
    });
  }

  async findLatestAttemptsForOrder(platformOrderNo: string): Promise<PayAttempt[]> {
    return this.prismaService.payAttempt.findMany({
      where: {
        platformOrderNo
      },
      orderBy: [{ channel: "asc" }, { createdAt: "desc" }]
    });
  }

  async findAttemptByAttemptNo(attemptNo: string): Promise<PayAttempt | null> {
    return this.prismaService.payAttempt.findUnique({
      where: { attemptNo }
    });
  }

  async findAttemptByChannelTradeNo(channelTradeNo: string): Promise<PayAttempt | null> {
    return this.prismaService.payAttempt.findFirst({
      where: {
        channelTradeNo
      },
      orderBy: { createdAt: "desc" }
    });
  }

  async findAttemptByChannelRequestNo(
    channelRequestNo: string
  ): Promise<PayAttempt | null> {
    return this.prismaService.payAttempt.findFirst({
      where: {
        channelRequestNo
      },
      orderBy: { createdAt: "desc" }
    });
  }

  async createAttempt(input: CreateAttemptInput): Promise<PayAttempt> {
    return this.prismaService.payAttempt.create({
      data: {
        attemptNo: this.generateAttemptNo(),
        platformOrderNo: input.platformOrderNo,
        channel: input.channel,
        status: PayAttemptStatus.CHANNEL_REQUESTING,
        channelRequestNo: input.channelRequestNo,
        expireTime: input.expireTime ? new Date(input.expireTime) : undefined
      }
    });
  }

  async markAttemptReady(
    attemptNo: string,
    input: MarkAttemptReadyInput
  ): Promise<PayAttempt> {
    return this.prismaService.payAttempt.update({
      where: { attemptNo },
      data: {
        status: PayAttemptStatus.USER_PAYING,
        channelRequestNo: input.channelRequestNo,
        channelTradeNo: input.channelTradeNo,
        qrContent: input.qrContent,
        payUrl: input.payUrl,
        channelPayload: input.channelPayload
          ? (input.channelPayload as Prisma.InputJsonValue)
          : undefined,
        expireTime: input.expireTime ? new Date(input.expireTime) : undefined
      }
    });
  }

  async markAttemptFailed(
    attemptNo: string,
    input: MarkAttemptFailedInput
  ): Promise<PayAttempt> {
    return this.prismaService.payAttempt.update({
      where: { attemptNo },
      data: {
        status: PayAttemptStatus.FAILED,
        failCode: input.failCode,
        failMessage: input.failMessage,
        channelPayload: input.channelPayload
          ? (input.channelPayload as Prisma.InputJsonValue)
          : undefined
      }
    });
  }

  async markAttemptSuccess(
    attemptNo: string,
    input: MarkAttemptSuccessInput
  ): Promise<PayAttempt> {
    return this.prismaService.payAttempt.update({
      where: { attemptNo },
      data: {
        status: PayAttemptStatus.SUCCESS,
        channelRequestNo: input.channelRequestNo,
        channelTradeNo: input.channelTradeNo,
        successTime: input.successTime ? new Date(input.successTime) : new Date(),
        channelPayload: input.channelPayload
          ? (input.channelPayload as Prisma.InputJsonValue)
          : undefined
      }
    });
  }

  async markAttemptCancelled(
    attemptNo: string,
    input: MarkAttemptCancelledInput = {}
  ): Promise<PayAttempt> {
    return this.prismaService.payAttempt.update({
      where: { attemptNo },
      data: {
        status: PayAttemptStatus.CANCELLED,
        failMessage: input.failMessage
      }
    });
  }

  private generateAttemptNo(): string {
    const date = new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
    const random = Math.floor(Math.random() * 100000)
      .toString()
      .padStart(5, "0");

    return `A${date}${random}`;
  }
}
