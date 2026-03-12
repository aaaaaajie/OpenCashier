import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

interface AlipayProviderConfig {
  appId?: string;
  privateKey?: string;
  publicKey?: string;
  gateway?: string;
}

@Injectable()
export class ChannelProviderConfigService {
  constructor(private readonly configService: ConfigService) {}

  hasAlipayConfig(): boolean {
    return Boolean(
      this.configService.get<string>("ALIPAY_APP_ID") &&
        this.configService.get<string>("ALIPAY_PRIVATE_KEY")
    );
  }

  getAlipayConfig(): AlipayProviderConfig {
    return {
      appId: this.configService.get<string>("ALIPAY_APP_ID") ?? undefined,
      privateKey:
        this.configService.get<string>("ALIPAY_PRIVATE_KEY") ?? undefined,
      publicKey:
        this.configService.get<string>("ALIPAY_PUBLIC_KEY") ?? undefined,
      gateway:
        this.configService.get<string>("ALIPAY_GATEWAY") ?? undefined
    };
  }

  hasStripeConfig(): boolean {
    return Boolean(this.configService.get<string>("STRIPE_SECRET_KEY"));
  }

  hasPaypalConfig(): boolean {
    return Boolean(
      this.configService.get<string>("PAYPAL_CLIENT_ID") &&
        this.configService.get<string>("PAYPAL_CLIENT_SECRET")
    );
  }

  hasWechatPayConfig(): boolean {
    return Boolean(
      this.configService.get<string>("WECHATPAY_APP_ID") &&
        this.configService.get<string>("WECHATPAY_MCH_ID") &&
        this.configService.get<string>("WECHATPAY_API_V3_KEY") &&
        this.configService.get<string>("WECHATPAY_PRIVATE_KEY")
    );
  }
}
