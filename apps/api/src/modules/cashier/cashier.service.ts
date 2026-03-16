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
type HostedCashierEntry =
  | {
      action: "REDIRECT";
      url: string;
    }
  | {
      action: "WEB";
      url: string;
    };

const ALIPAY_CASHIER_CHANNELS = [
  "alipay_qr",
  "alipay_page",
  "alipay_wap"
] as const;

const ALIPAY_CHANNEL_CAPABILITY_MAP: Record<
  (typeof ALIPAY_CASHIER_CHANNELS)[number],
  AlipayProductCapability
> = {
  alipay_qr: "QR",
  alipay_page: "PAGE",
  alipay_wap: "WAP"
};

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

  async resolveHostedCashierEntry(
    cashierToken: string,
    terminalValue?: string
  ): Promise<HostedCashierEntry> {
    const terminal = this.normalizeTerminal(terminalValue);
    const session = await this.getCashierSession(cashierToken, terminal);
    const providerCount = this.countDistinctProviders(session.channels);
    const preferredChannel = this.selectHostedPreferredChannel(
      session.channels,
      terminal
    );

    if (
      providerCount === 1 &&
      preferredChannel?.sessionStatus === "READY" &&
      preferredChannel.actionType === "REDIRECT_URL" &&
      preferredChannel.payUrl
    ) {
      return {
        action: "REDIRECT",
        url: preferredChannel.payUrl
      };
    }

    return {
      action: "WEB",
      url: this.buildCashierWebUrl(cashierToken)
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
        await this.buildPreferredAlipaySession(
          order,
          order.allowedChannels,
          latestAttempts,
          terminal
        )
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
    const requestedAlipayChannels = this.resolveRequestedAlipayChannels(
      allowedChannels,
      terminal
    );

    if (this.hasRequestedAlipay(allowedChannels)) {
      const latestAlipayAttempt = this.findLatestAttemptForChannels(
        latestAttempts,
        requestedAlipayChannels
      );

      if (latestAlipayAttempt) {
        channels.push(this.restoreAttempt(latestAlipayAttempt));
      } else {
        channels.push(
          this.paymentChannelRegistryService.createFailedSession(
            {
              channel:
                requestedAlipayChannels[0] ??
                this.resolveAlipayPreferredOrder(terminal)[0] ??
                "alipay_qr"
            },
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
    allowedChannels: string[],
    latestAttempts: PayAttempt[],
    terminal: CashierTerminal
  ) {
    const requestedChannels = this.resolveRequestedAlipayChannels(
      allowedChannels,
      terminal
    );
    const candidateChannels = this.resolveAlipayCandidateChannels(
      allowedChannels,
      terminal
    );
    const fallbackChannel =
      requestedChannels[0] ??
      this.resolveAlipayPreferredOrder(terminal)[0] ??
      "alipay_qr";

    if (candidateChannels.length === 0) {
      return this.paymentChannelRegistryService.createFailedSession(
        { channel: fallbackChannel },
        this.buildAlipayCapabilityMismatchReason(requestedChannels)
      );
    }

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
        channel: fallbackChannel
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
        returnUrl: this.resolveChannelReturnUrl(order, channel, "success"),
        cancelUrl: this.resolveChannelReturnUrl(order, channel, "cancel"),
        expireTime: order.expireTime,
        channel,
        attemptNo: attempt.attemptNo
      });

      if (session.sessionStatus === "READY") {
        await this.paymentAttemptService.markAttemptReady(attempt.attemptNo, {
          channelRequestNo: session.channelRequestNo,
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

  private resolveAlipayCandidateChannels(
    allowedChannels: string[],
    terminal: CashierTerminal
  ) {
    const requestedChannels = new Set(
      this.resolveRequestedAlipayChannels(allowedChannels, terminal)
    );
    const configuredCapabilities = new Set(
      this.channelProviderConfigService.getAlipayProductCapabilities()
    );

    return this.resolveAlipayPreferredOrder(terminal).filter(
      (channel) =>
        requestedChannels.has(channel) &&
        configuredCapabilities.has(ALIPAY_CHANNEL_CAPABILITY_MAP[channel])
    );
  }

  private resolveRequestedAlipayChannels(
    allowedChannels: string[],
    terminal: CashierTerminal
  ) {
    const requestedChannels = new Set(
      allowedChannels.filter((channel) => this.isAlipayChannel(channel)) as Array<
        (typeof ALIPAY_CASHIER_CHANNELS)[number]
      >
    );

    return this.resolveAlipayPreferredOrder(terminal).filter((channel) =>
      requestedChannels.has(channel)
    );
  }

  private resolveAlipayPreferredOrder(terminal: CashierTerminal) {
    return terminal === "mobile"
      ? (["alipay_wap", "alipay_page", "alipay_qr"] as const)
      : (["alipay_qr", "alipay_page", "alipay_wap"] as const);
  }

  private buildAlipayCapabilityMismatchReason(
    requestedChannels: readonly string[]
  ): string {
    const configuredCapabilities =
      this.channelProviderConfigService.getAlipayProductCapabilities();

    return `支付宝未开通与本单匹配的产品能力，请检查 allowedChannels=${requestedChannels.join(
      ", "
    )} 与 ALIPAY_PRODUCT_CAPABILITIES=${configuredCapabilities.join(", ")}。`;
  }

  private normalizeTerminal(value?: string): CashierTerminal {
    return value?.toLowerCase() === "mobile" ? "mobile" : "desktop";
  }

  private buildCashierWebUrl(cashierToken: string): string {
    const webBaseUrl =
      this.platformConfigService.get("WEB_BASE_URL") ?? "http://localhost:5173";

    return `${webBaseUrl.replace(/\/$/, "")}/cashier/${cashierToken}`;
  }

  private resolveChannelReturnUrl(
    order: Awaited<ReturnType<PaymentStoreService["getOrderByPlatformOrderNo"]>>,
    channel: string,
    result: "success" | "cancel"
  ): string | undefined {
    if (result === "success" && order.returnUrl?.trim()) {
      return order.returnUrl.trim();
    }

    const cashierToken = this.extractCashierToken(order.cashierUrl);

    if (!cashierToken) {
      return order.returnUrl?.trim() || order.cashierUrl;
    }

    const providerCode =
      this.paymentChannelRegistryService.getCatalogByChannel(channel)?.providerCode ??
      channel;
    const webUrl = new URL(this.buildCashierWebUrl(cashierToken));

    webUrl.searchParams.set("selectedProvider", providerCode);
    webUrl.searchParams.set("providerReturn", result);

    return webUrl.toString();
  }

  private extractCashierToken(cashierUrl: string): string | undefined {
    try {
      const pathname = new URL(cashierUrl).pathname;

      return pathname.split("/").filter(Boolean).at(-1);
    } catch {
      return cashierUrl.split("?")[0]?.split("/").filter(Boolean).at(-1);
    }
  }

  private countDistinctProviders(
    channels: Array<{ providerCode?: string; channel: string }>
  ): number {
    return new Set(channels.map((channel) => channel.providerCode ?? channel.channel))
      .size;
  }

  private selectHostedPreferredChannel(
    channels: Array<{
      providerCode?: string;
      channel: string;
      sessionStatus: string;
      actionType: string;
      payUrl?: string;
    }>,
    terminal: CashierTerminal
  ) {
    return [...channels].sort((left, right) => {
      return (
        this.getHostedChannelPriority(right, terminal) -
        this.getHostedChannelPriority(left, terminal)
      );
    })[0];
  }

  private getHostedChannelPriority(
    channel: {
      providerCode?: string;
      channel: string;
      sessionStatus: string;
      actionType: string;
      payUrl?: string;
    },
    terminal: CashierTerminal
  ): number {
    const statusWeight =
      channel.sessionStatus === "READY"
        ? 200
        : channel.sessionStatus === "PENDING"
          ? 100
          : 0;
    const actionWeight =
      channel.actionType === "REDIRECT_URL"
        ? 40
        : channel.actionType === "QR_CODE"
          ? 30
          : 0;

    if (channel.providerCode === "ALIPAY") {
      if (terminal === "mobile") {
        if (channel.channel === "alipay_wap") {
          return statusWeight + actionWeight + 30;
        }

        return statusWeight + actionWeight + (channel.channel === "alipay_page" ? 20 : 10);
      }

      if (channel.channel === "alipay_qr") {
        return statusWeight + actionWeight + 30;
      }

      return statusWeight + actionWeight + (channel.channel === "alipay_page" ? 20 : 10);
    }

    if (channel.providerCode === "WECHAT_PAY") {
      if (terminal === "mobile") {
        return statusWeight + actionWeight + (channel.channel === "wechat_jsapi" ? 30 : 20);
      }

      return statusWeight + actionWeight + (channel.channel === "wechat_qr" ? 30 : 10);
    }

    return statusWeight + actionWeight;
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
