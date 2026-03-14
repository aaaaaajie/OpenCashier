import { PayAttemptStatus, type PayAttempt } from "@prisma/client";
import { Injectable, NotFoundException } from "@nestjs/common";
import { parseCashierToken } from "../../common/utils/cashier-token.util";
import {
  type AlipayProductCapability,
  ChannelProviderConfigService
} from "../payment/channels/channel-provider-config.service";
import { PaymentChannelRegistryService } from "../payment/channels/payment-channel-registry.service";
import { PaymentAttemptService } from "../payment/payment-attempt.service";
import { PaymentStoreService } from "../payment/payment-store.service";
import { PlatformConfigService } from "../payment/platform-config.service";

type CashierTerminal = "desktop" | "mobile";

const ALIPAY_CASHIER_CHANNELS = [
  "alipay_qr",
  "alipay_page",
  "alipay_wap"
] as const;

@Injectable()
export class CashierService {
  constructor(
    private readonly paymentStoreService: PaymentStoreService,
    private readonly paymentChannelRegistryService: PaymentChannelRegistryService,
    private readonly paymentAttemptService: PaymentAttemptService,
    private readonly platformConfigService: PlatformConfigService,
    private readonly channelProviderConfigService: ChannelProviderConfigService
  ) {}

  async getCashierSession(cashierToken: string, terminalValue?: string) {
    const appSecret =
      this.platformConfigService.get("APP_SECRET") ?? "local-dev-app-secret";
    const tokenPayload = parseCashierToken(appSecret, cashierToken);

    if (!tokenPayload) {
      throw new NotFoundException("Cashier session not found");
    }

    const order = await this.paymentStoreService.getOrderByPlatformOrderNo(
      tokenPayload.platformOrderNo
    );
    const terminal = this.normalizeTerminal(terminalValue);
    const latestAttempts = await this.paymentAttemptService.findLatestAttemptsForOrder(
      order.platformOrderNo
    );

    if (order.status !== "WAIT_PAY" && order.status !== "PAYING") {
      return {
        order,
        channels: this.restoreHistoricalChannels(
          order.allowedChannels,
          latestAttempts,
          terminal,
          `order status is ${order.status}`
        )
      };
    }

    const channels = await this.buildActiveChannels(order, latestAttempts, terminal);

    return {
      order,
      channels
    };
  }

  private resolveProviderNotifyUrl(
    channel: string,
    fallbackNotifyUrl: string
  ): string {
    const appBaseUrl =
      this.platformConfigService.get("APP_BASE_URL") ?? "http://localhost:3000";

    return (
      this.paymentChannelRegistryService.buildNotifyUrl(channel, appBaseUrl) ??
      fallbackNotifyUrl
    );
  }

  private toChannelPayload(
    value: unknown
  ): Record<string, unknown> | undefined {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return undefined;
    }

    return value as Record<string, unknown>;
  }

  private async buildActiveChannels(
    order: Awaited<ReturnType<PaymentStoreService["getOrderByPlatformOrderNo"]>>,
    latestAttempts: PayAttempt[],
    terminal: CashierTerminal
  ) {
    const channels = [];

    if (this.hasRequestedAlipay(order.allowedChannels)) {
      channels.push(
        await this.buildPreferredAlipaySession(order, latestAttempts, terminal)
      );
    }

    for (const channel of order.allowedChannels.filter(
      (item) => !this.isAlipayChannel(item)
    )) {
      channels.push(await this.createOrRestoreChannelSession(order, channel, latestAttempts));
    }

    return channels;
  }

  private restoreHistoricalChannels(
    allowedChannels: string[],
    latestAttempts: PayAttempt[],
    terminal: CashierTerminal,
    fallbackReason: string
  ) {
    const channels = [];

    if (this.hasRequestedAlipay(allowedChannels)) {
      const latestAlipayAttempt = this.findLatestAttemptForChannels(
        latestAttempts,
        ALIPAY_CASHIER_CHANNELS
      );

      if (latestAlipayAttempt) {
        channels.push(this.restoreAttempt(latestAlipayAttempt));
      } else {
        channels.push(
          this.paymentChannelRegistryService.createFailedSession(
            { channel: this.resolveAlipayCandidateChannels(terminal)[0] ?? "alipay_qr" },
            fallbackReason
          )
        );
      }
    }

    for (const channel of allowedChannels.filter((item) => !this.isAlipayChannel(item))) {
      const latestAttempt = latestAttempts.find((item) => item.channel === channel);

      if (latestAttempt) {
        channels.push(this.restoreAttempt(latestAttempt));
        continue;
      }

      channels.push(
        this.paymentChannelRegistryService.createFailedSession(
          { channel },
          fallbackReason
        )
      );
    }

    return channels;
  }

  private async buildPreferredAlipaySession(
    order: Awaited<ReturnType<PaymentStoreService["getOrderByPlatformOrderNo"]>>,
    latestAttempts: PayAttempt[],
    terminal: CashierTerminal
  ) {
    const candidateChannels = this.resolveAlipayCandidateChannels(terminal);

    for (const channel of candidateChannels) {
      const reusableAttempt = this.findReusableAttempt(latestAttempts, channel);

      if (reusableAttempt) {
        return this.restoreAttempt(reusableAttempt);
      }
    }

    let latestFailure;

    for (const channel of candidateChannels) {
      const session = await this.createOrRestoreChannelSession(
        order,
        channel,
        latestAttempts
      );

      if (session.sessionStatus !== "FAILED") {
        return session;
      }

      latestFailure = session;
    }

    return (
      latestFailure ??
      this.paymentChannelRegistryService.createUnavailableSession({
        channel: candidateChannels[0] ?? "alipay_qr"
      })
    );
  }

  private async createOrRestoreChannelSession(
    order: Awaited<ReturnType<PaymentStoreService["getOrderByPlatformOrderNo"]>>,
    channel: string,
    latestAttempts: PayAttempt[]
  ) {
    const catalog = this.paymentChannelRegistryService.getCatalogByChannel(channel);

    if (!catalog?.enabled) {
      return this.paymentChannelRegistryService.createUnavailableSession({
        channel
      });
    }

    const reusableAttempt = this.findReusableAttempt(latestAttempts, channel);

    if (reusableAttempt) {
      return this.restoreAttempt(reusableAttempt);
    }

    const attempt = await this.paymentAttemptService.createAttempt({
      platformOrderNo: order.platformOrderNo,
      channel,
      channelRequestNo: order.platformOrderNo,
      expireTime: order.expireTime
    });

    try {
      const session = await this.paymentChannelRegistryService.createSession({
        platformOrderNo: order.platformOrderNo,
        merchantOrderNo: order.merchantOrderNo,
        amount: order.amount,
        currency: order.currency,
        subject: order.subject,
        description: order.description,
        notifyUrl: this.resolveProviderNotifyUrl(channel, order.notifyUrl),
        returnUrl: order.returnUrl,
        expireTime: order.expireTime,
        channel,
        attemptNo: attempt.attemptNo
      });

      if (session.sessionStatus === "READY") {
        await this.paymentAttemptService.markAttemptReady(attempt.attemptNo, {
          channelTradeNo: session.channelTradeNo,
          qrContent: session.qrContent,
          payUrl: session.payUrl,
          expireTime: session.expireTime,
          channelPayload: session.providerPayload
        });
      } else if (session.sessionStatus === "FAILED") {
        await this.paymentAttemptService.markAttemptFailed(attempt.attemptNo, {
          failMessage: session.note,
          channelPayload: {
            channel,
            platformOrderNo: order.platformOrderNo
          }
        });
      }

      return session;
    } catch (error) {
      const failMessage =
        error instanceof Error ? error.message : "failed to create session";

      await this.paymentAttemptService.markAttemptFailed(attempt.attemptNo, {
        failMessage,
        channelPayload: {
          channel,
          platformOrderNo: order.platformOrderNo
        }
      });

      return this.paymentChannelRegistryService.createFailedSession(
        {
          channel,
          attemptNo: attempt.attemptNo
        },
        failMessage
      );
    }
  }

  private restoreAttempt(attempt: PayAttempt) {
    return this.paymentChannelRegistryService.restoreSessionFromAttempt({
      attemptNo: attempt.attemptNo,
      channel: attempt.channel,
      status: attempt.status,
      channelRequestNo: attempt.channelRequestNo,
      channelTradeNo: attempt.channelTradeNo,
      qrContent: attempt.qrContent,
      payUrl: attempt.payUrl,
      expireTime: attempt.expireTime?.toISOString(),
      failMessage: attempt.failMessage,
      channelPayload: this.toChannelPayload(attempt.channelPayload)
    });
  }

  private findReusableAttempt(
    attempts: PayAttempt[],
    channel: string
  ): PayAttempt | undefined {
    return attempts.find(
      (attempt) =>
        attempt.channel === channel &&
        (attempt.status === PayAttemptStatus.CHANNEL_REQUESTING ||
          attempt.status === PayAttemptStatus.USER_PAYING) &&
        (!attempt.expireTime || attempt.expireTime > new Date())
    );
  }

  private findLatestAttemptForChannels(
    attempts: PayAttempt[],
    channels: readonly string[]
  ): PayAttempt | undefined {
    const matched = attempts.filter((attempt) => channels.includes(attempt.channel));

    return matched.sort(
      (left, right) => right.createdAt.getTime() - left.createdAt.getTime()
    )[0];
  }

  private resolveAlipayCandidateChannels(terminal: CashierTerminal) {
    const capabilities = this.channelProviderConfigService.getAlipayProductCapabilities();
    const preferredCapabilities: readonly AlipayProductCapability[] =
      terminal === "mobile"
        ? ["WAP", "PAGE", "QR"]
        : ["QR", "PAGE", "WAP"];

    return preferredCapabilities
      .filter((capability) => capabilities.includes(capability))
      .map((capability) => {
        if (capability === "PAGE") {
          return "alipay_page";
        }

        return capability === "WAP" ? "alipay_wap" : "alipay_qr";
      });
  }

  private normalizeTerminal(value?: string): CashierTerminal {
    return value?.toLowerCase() === "mobile" ? "mobile" : "desktop";
  }

  private hasRequestedAlipay(channels: string[]): boolean {
    return channels.some((channel) => this.isAlipayChannel(channel));
  }

  private isAlipayChannel(channel: string): boolean {
    return ALIPAY_CASHIER_CHANNELS.includes(
      channel as (typeof ALIPAY_CASHIER_CHANNELS)[number]
    );
  }
}
