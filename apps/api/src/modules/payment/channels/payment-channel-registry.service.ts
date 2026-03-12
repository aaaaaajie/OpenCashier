import { BadRequestException, Injectable } from "@nestjs/common";
import { AlipayChannelAdapter } from "./adapters/alipay-channel.adapter";
import { PaypalChannelAdapter } from "./adapters/paypal-channel.adapter";
import { StripeChannelAdapter } from "./adapters/stripe-channel.adapter";
import { WechatPayChannelAdapter } from "./adapters/wechatpay-channel.adapter";
import { BasePaymentChannelAdapter } from "./base-payment-channel.adapter";
import {
  ChannelOrderCloseInput,
  ChannelOrderQueryInput,
  ChannelRefundInput,
  ChannelSessionPreviewInput,
  StoredChannelAttempt
} from "./payment-channel.types";

@Injectable()
export class PaymentChannelRegistryService {
  private readonly adapters: BasePaymentChannelAdapter[];

  constructor(
    wechatPayChannelAdapter: WechatPayChannelAdapter,
    alipayChannelAdapter: AlipayChannelAdapter,
    stripeChannelAdapter: StripeChannelAdapter,
    paypalChannelAdapter: PaypalChannelAdapter
  ) {
    this.adapters = [
      wechatPayChannelAdapter,
      alipayChannelAdapter,
      stripeChannelAdapter,
      paypalChannelAdapter
    ];
  }

  listCatalog() {
    return this.adapters.map((adapter) => adapter.getCatalog());
  }

  listCatalogByChannels(channels: string[]) {
    return channels
      .map((channel) => this.findByChannel(channel)?.getCatalog())
      .filter((item): item is NonNullable<typeof item> => Boolean(item));
  }

  validateChannels(channels: string[]): void {
    const unsupported = channels.filter((channel) => !this.findByChannel(channel));

    if (unsupported.length > 0) {
      throw new BadRequestException(
        `unsupported channels: ${unsupported.join(", ")}`
      );
    }
  }

  getCatalogByChannel(channel: string) {
    return this.findByChannel(channel)?.getCatalog();
  }

  buildNotifyUrl(channel: string, appBaseUrl: string): string | undefined {
    const adapter = this.findByChannel(channel);

    if (!adapter?.notifyPath) {
      return undefined;
    }

    return `${appBaseUrl.replace(/\/$/, "")}${adapter.notifyPath}`;
  }

  async createSession(input: ChannelSessionPreviewInput) {
    const adapter = this.findByChannel(input.channel);

    if (!adapter) {
      throw new BadRequestException(`unsupported channel: ${input.channel}`);
    }

    return adapter.createSession(input);
  }

  async queryOrder(input: ChannelOrderQueryInput) {
    const adapter = this.findByChannel(input.channel);

    if (!adapter) {
      throw new BadRequestException(`unsupported channel: ${input.channel}`);
    }

    return adapter.queryOrder(input);
  }

  async closeOrder(input: ChannelOrderCloseInput) {
    const adapter = this.findByChannel(input.channel);

    if (!adapter) {
      throw new BadRequestException(`unsupported channel: ${input.channel}`);
    }

    return adapter.closeOrder(input);
  }

  async refundOrder(input: ChannelRefundInput) {
    const adapter = this.findByChannel(input.channel);

    if (!adapter) {
      throw new BadRequestException(`unsupported channel: ${input.channel}`);
    }

    return adapter.refundOrder(input);
  }

  restoreSessionFromAttempt(input: StoredChannelAttempt) {
    const adapter = this.findByChannel(input.channel);

    if (!adapter) {
      throw new BadRequestException(`unsupported channel: ${input.channel}`);
    }

    return adapter.restoreSessionFromAttempt(input);
  }

  createUnavailableSession(
    input: Pick<ChannelSessionPreviewInput, "channel" | "attemptNo">
  ) {
    const adapter = this.findByChannel(input.channel);

    if (!adapter) {
      throw new BadRequestException(`unsupported channel: ${input.channel}`);
    }

    return adapter.buildUnavailableSession(input);
  }

  createFailedSession(
    input: Pick<ChannelSessionPreviewInput, "channel" | "attemptNo">,
    reason: string
  ) {
    const adapter = this.findByChannel(input.channel);

    if (!adapter) {
      throw new BadRequestException(`unsupported channel: ${input.channel}`);
    }

    return adapter.buildFailedSession(input, reason);
  }

  private findByChannel(channel: string): BasePaymentChannelAdapter | undefined {
    return this.adapters.find((adapter) => adapter.supportsChannel(channel));
  }
}
