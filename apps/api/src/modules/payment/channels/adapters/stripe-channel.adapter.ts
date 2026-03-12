import { Injectable } from "@nestjs/common";
import { BasePaymentChannelAdapter } from "../base-payment-channel.adapter";
import { ChannelProviderConfigService } from "../channel-provider-config.service";

@Injectable()
export class StripeChannelAdapter extends BasePaymentChannelAdapter {
  readonly providerCode = "STRIPE" as const;
  readonly displayName = "Stripe";
  readonly integrationMode = "OFFICIAL_NODE_SDK" as const;
  readonly supportedChannels = ["stripe_checkout"];
  readonly officialSdkPackage = "stripe";
  readonly note =
    "优先使用 Stripe 官方 Node SDK；适合海外卡支付或 Checkout 场景。";

  constructor(
    private readonly channelProviderConfigService: ChannelProviderConfigService
  ) {
    super();
  }

  isEnabled(): boolean {
    return this.channelProviderConfigService.hasStripeConfig();
  }
}

