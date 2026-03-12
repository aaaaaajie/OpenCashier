import { Injectable } from "@nestjs/common";
import { BasePaymentChannelAdapter } from "../base-payment-channel.adapter";
import { ChannelProviderConfigService } from "../channel-provider-config.service";

@Injectable()
export class WechatPayChannelAdapter extends BasePaymentChannelAdapter {
  readonly providerCode = "WECHAT_PAY" as const;
  readonly displayName = "微信支付";
  readonly integrationMode = "DIRECT_API" as const;
  readonly supportedChannels = ["wechat_qr", "wechat_jsapi"];
  readonly note =
    "当前按直连 API 方式预留。若未来出现稳定的官方 Node SDK，再切回 SDK 优先策略。";
  readonly officialSdkPackage = undefined;

  constructor(
    private readonly channelProviderConfigService: ChannelProviderConfigService
  ) {
    super();
  }

  isEnabled(): boolean {
    return this.channelProviderConfigService.hasWechatPayConfig();
  }
}

