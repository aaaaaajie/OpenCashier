import { Injectable } from "@nestjs/common";
import { BasePaymentChannelAdapter } from "../base-payment-channel.adapter";
import { ChannelProviderConfigService } from "../channel-provider-config.service";

@Injectable()
export class PaypalChannelAdapter extends BasePaymentChannelAdapter {
  readonly providerCode = "PAYPAL" as const;
  readonly displayName = "PayPal";
  readonly integrationMode = "OFFICIAL_NODE_SDK" as const;
  readonly supportedChannels = ["paypal_checkout"];
  readonly officialSdkPackage = "@paypal/paypal-server-sdk";
  readonly note =
    "优先使用 PayPal 官方 TypeScript/Node Server SDK；适合跨境 Checkout 场景。";

  constructor(
    private readonly channelProviderConfigService: ChannelProviderConfigService
  ) {
    super();
  }

  isEnabled(): boolean {
    return this.channelProviderConfigService.hasPaypalConfig();
  }
}

