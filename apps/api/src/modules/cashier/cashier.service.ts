import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PaymentChannelRegistryService } from "../payment/channels/payment-channel-registry.service";
import { PaymentAttemptService } from "../payment/payment-attempt.service";
import { PaymentStoreService } from "../payment/payment-store.service";

@Injectable()
export class CashierService {
  constructor(
    private readonly paymentStoreService: PaymentStoreService,
    private readonly paymentChannelRegistryService: PaymentChannelRegistryService,
    private readonly paymentAttemptService: PaymentAttemptService,
    private readonly configService: ConfigService
  ) {}

  async getCashierSession(platformOrderNo: string) {
    const order =
      await this.paymentStoreService.getOrderByPlatformOrderNo(platformOrderNo);
    const latestAttempts = await this.paymentAttemptService.findLatestAttemptsForOrder(
      order.platformOrderNo
    );

    if (order.status !== "WAIT_PAY" && order.status !== "PAYING") {
      const channels = order.allowedChannels.map((channel) => {
        const latestAttempt = latestAttempts.find((item) => item.channel === channel);

        if (latestAttempt) {
          return this.paymentChannelRegistryService.restoreSessionFromAttempt({
            attemptNo: latestAttempt.attemptNo,
            channel: latestAttempt.channel,
            status: latestAttempt.status,
            channelRequestNo: latestAttempt.channelRequestNo,
            channelTradeNo: latestAttempt.channelTradeNo,
            qrContent: latestAttempt.qrContent,
            payUrl: latestAttempt.payUrl,
            expireTime: latestAttempt.expireTime?.toISOString(),
            failMessage: latestAttempt.failMessage
          });
        }

        return this.paymentChannelRegistryService.createFailedSession(
          { channel },
          `order status is ${order.status}`
        );
      });

      return {
        order,
        channels
      };
    }

    const appBaseUrl =
      this.configService.get<string>("APP_BASE_URL") ?? "http://localhost:3000";
    const channels = await Promise.all(
      order.allowedChannels.map(async (channel) => {
        const catalog =
          this.paymentChannelRegistryService.getCatalogByChannel(channel);

        if (!catalog?.enabled) {
          return this.paymentChannelRegistryService.createUnavailableSession({
            channel
          });
        }

        const reusableAttempt =
          await this.paymentAttemptService.findReusableAttempt(
            order.platformOrderNo,
            channel
          );

        if (reusableAttempt) {
          return this.paymentChannelRegistryService.restoreSessionFromAttempt({
            attemptNo: reusableAttempt.attemptNo,
            channel: reusableAttempt.channel,
            status: reusableAttempt.status,
            channelRequestNo: reusableAttempt.channelRequestNo,
            channelTradeNo: reusableAttempt.channelTradeNo,
            qrContent: reusableAttempt.qrContent,
            payUrl: reusableAttempt.payUrl,
            expireTime: reusableAttempt.expireTime?.toISOString(),
            failMessage: reusableAttempt.failMessage
          });
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
            notifyUrl:
              this.paymentChannelRegistryService.buildNotifyUrl(
                channel,
                appBaseUrl
              ) ?? order.notifyUrl,
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
      })
    );

    return {
      order,
      channels
    };
  }
}
