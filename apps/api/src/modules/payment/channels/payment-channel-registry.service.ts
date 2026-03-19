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
  PaymentProviderCode,
  ProviderConfigValidationResult,
  StoredChannelAttempt
} from "./payment-channel.types";
import { PlatformConfigService } from "../platform-config.service";

@Injectable()
export class PaymentChannelRegistryService {
  private readonly adapters: BasePaymentChannelAdapter[];

  constructor(
    wechatPayChannelAdapter: WechatPayChannelAdapter,
    alipayChannelAdapter: AlipayChannelAdapter,
    stripeChannelAdapter: StripeChannelAdapter,
    paypalChannelAdapter: PaypalChannelAdapter,
    private readonly platformConfigService: PlatformConfigService
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
    const seenProviders = new Set<PaymentProviderCode>();

    return channels
      .map((channel) => this.findByChannel(channel)?.getCatalog())
      .filter((item): item is NonNullable<typeof item> => Boolean(item))
      .filter((item) => {
        if (seenProviders.has(item.providerCode)) {
          return false;
        }

        seenProviders.add(item.providerCode);
        return true;
      });
  }

  validateChannels(channels: string[]): void {
    const unsupported = channels.filter((channel) => !this.findByChannel(channel));

    if (unsupported.length > 0) {
      throw new BadRequestException(
        `unsupported channels: ${unsupported.join(", ")}`
      );
    }
  }

  getCatalogByChannel(channel: string, options?: { appId?: string }) {
    const adapter = this.findByChannel(channel);

    if (!adapter) {
      return undefined;
    }

    return this.platformConfigService.runWithScope(options?.appId, () =>
      adapter.getCatalog()
    );
  }

  buildNotifyUrl(
    channel: string,
    appBaseUrl: string,
    appId?: string
  ): string | undefined {
    const adapter = this.findByChannel(channel);

    if (!adapter) {
      return undefined;
    }

    return adapter.buildNotifyUrl(appBaseUrl, appId);
  }

  async createSession(input: ChannelSessionPreviewInput) {
    const adapter = this.findByChannel(input.channel);

    if (!adapter) {
      throw new BadRequestException(`unsupported channel: ${input.channel}`);
    }

    return this.platformConfigService.runWithScope(input.appId, () =>
      adapter.createSession(input)
    );
  }

  async queryOrder(input: ChannelOrderQueryInput) {
    const adapter = this.findByChannel(input.channel);

    if (!adapter) {
      throw new BadRequestException(`unsupported channel: ${input.channel}`);
    }

    return this.platformConfigService.runWithScope(input.appId, () =>
      adapter.queryOrder(input)
    );
  }

  async closeOrder(input: ChannelOrderCloseInput) {
    const adapter = this.findByChannel(input.channel);

    if (!adapter) {
      throw new BadRequestException(`unsupported channel: ${input.channel}`);
    }

    return this.platformConfigService.runWithScope(input.appId, () =>
      adapter.closeOrder(input)
    );
  }

  async refundOrder(input: ChannelRefundInput) {
    const adapter = this.findByChannel(input.channel);

    if (!adapter) {
      throw new BadRequestException(`unsupported channel: ${input.channel}`);
    }

    return this.platformConfigService.runWithScope(input.appId, () =>
      adapter.refundOrder(input)
    );
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

  validateProviderConfig(
    providerCode: PaymentProviderCode,
    options?: { appId?: string }
  ): Promise<ProviderConfigValidationResult> {
    const adapter = this.findByProviderCode(providerCode);

    if (!adapter) {
      throw new BadRequestException(`unsupported provider: ${providerCode}`);
    }

    return this.platformConfigService.runWithScope(options?.appId, () =>
      adapter.validateConfig()
    );
  }

  private findByChannel(channel: string): BasePaymentChannelAdapter | undefined {
    return this.adapters.find((adapter) => adapter.supportsChannel(channel));
  }

  private findByProviderCode(
    providerCode: PaymentProviderCode
  ): BasePaymentChannelAdapter | undefined {
    return this.adapters.find((adapter) => adapter.providerCode === providerCode);
  }
}
