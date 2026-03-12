import { Global, Module } from "@nestjs/common";
import { AlipayChannelAdapter } from "./channels/adapters/alipay-channel.adapter";
import { PaypalChannelAdapter } from "./channels/adapters/paypal-channel.adapter";
import { StripeChannelAdapter } from "./channels/adapters/stripe-channel.adapter";
import { WechatPayChannelAdapter } from "./channels/adapters/wechatpay-channel.adapter";
import { ChannelProviderConfigService } from "./channels/channel-provider-config.service";
import { PaymentChannelRegistryService } from "./channels/payment-channel-registry.service";
import { PaymentAttemptService } from "./payment-attempt.service";
import { PaymentStoreService } from "./payment-store.service";

@Global()
@Module({
  providers: [
    PaymentStoreService,
    ChannelProviderConfigService,
    WechatPayChannelAdapter,
    AlipayChannelAdapter,
    StripeChannelAdapter,
    PaypalChannelAdapter,
    PaymentChannelRegistryService,
    PaymentAttemptService
  ],
  exports: [
    PaymentStoreService,
    PaymentChannelRegistryService,
    PaymentAttemptService,
    AlipayChannelAdapter
  ]
})
export class PaymentModule {}
