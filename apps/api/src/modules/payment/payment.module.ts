import { Global, Module } from "@nestjs/common";
import { AlipayChannelAdapter } from "./channels/adapters/alipay-channel.adapter";
import { PaypalChannelAdapter } from "./channels/adapters/paypal-channel.adapter";
import { StripeChannelAdapter } from "./channels/adapters/stripe-channel.adapter";
import { WechatPayChannelAdapter } from "./channels/adapters/wechatpay-channel.adapter";
import { StripeClientService } from "./channels/clients/stripe-client.service";
import { ChannelProviderConfigService } from "./channels/channel-provider-config.service";
import { PaymentChannelRegistryService } from "./channels/payment-channel-registry.service";
import { PaymentAttemptService } from "./payment-attempt.service";
import { PaymentStoreService } from "./payment-store.service";
import { PlatformConfigService } from "./platform-config.service";

@Global()
@Module({
  providers: [
    PaymentStoreService,
    PlatformConfigService,
    ChannelProviderConfigService,
    StripeClientService,
    WechatPayChannelAdapter,
    AlipayChannelAdapter,
    StripeChannelAdapter,
    PaypalChannelAdapter,
    PaymentChannelRegistryService,
    PaymentAttemptService
  ],
  exports: [
    PaymentStoreService,
    PlatformConfigService,
    ChannelProviderConfigService,
    PaymentChannelRegistryService,
    PaymentAttemptService,
    AlipayChannelAdapter,
    WechatPayChannelAdapter,
    StripeChannelAdapter
  ]
})
export class PaymentModule {}
