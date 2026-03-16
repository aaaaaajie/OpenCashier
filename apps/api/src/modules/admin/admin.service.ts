import { Injectable } from "@nestjs/common";
import { MerchantNotifyDispatcherService } from "../notify/merchant-notify-dispatcher.service";
import { PaymentChannelRegistryService } from "../payment/channels/payment-channel-registry.service";
import { PaymentProviderCode } from "../payment/channels/payment-channel.types";
import { PaymentStoreService } from "../payment/payment-store.service";
import { PlatformConfigService } from "../payment/platform-config.service";
import { UpsertPlatformConfigDto } from "./dto/upsert-platform-config.dto";

@Injectable()
export class AdminService {
  constructor(
    private readonly paymentStoreService: PaymentStoreService,
    private readonly paymentChannelRegistryService: PaymentChannelRegistryService,
    private readonly merchantNotifyDispatcherService: MerchantNotifyDispatcherService,
    private readonly platformConfigService: PlatformConfigService
  ) {}

  async getSummary() {
    return {
      ...(await this.paymentStoreService.getDashboardSummary()),
      paymentProviders: this.paymentChannelRegistryService.listCatalog()
    };
  }

  getPaymentProviders() {
    return this.paymentChannelRegistryService.listCatalog();
  }

  getPlatformConfigs() {
    return this.platformConfigService.listConfigs();
  }

  upsertPlatformConfigs(body: UpsertPlatformConfigDto) {
    return this.platformConfigService.upsertConfig(body);
  }

  activatePlatformConfig(configKey: string) {
    return this.platformConfigService.activateConfig(configKey);
  }

  clearPlatformConfig(configKey: string) {
    return this.platformConfigService.clearConfig(configKey);
  }

  listNotifyTasks() {
    return this.merchantNotifyDispatcherService.listTasks();
  }

  listOrders() {
    return this.paymentStoreService.listOrders();
  }

  listRefunds() {
    return this.paymentStoreService.listRefunds();
  }

  retryNotifyTask(notifyId: string) {
    return this.merchantNotifyDispatcherService.replayTask(notifyId);
  }

  async validatePlatformConfig(
    configKey: string,
    previewValue?: Record<string, unknown>
  ) {
    const providerCode = PROVIDER_CONFIG_GROUP_TO_CODE[configKey];

    if (!providerCode) {
      return {
        configKey,
        status: "UNSUPPORTED" as const,
        message: "当前配置组暂不支持在线验证。",
        checkedAt: new Date().toISOString()
      };
    }

    const result =
      previewValue !== undefined
        ? await this.platformConfigService.runWithPreview(configKey, previewValue, () =>
            this.paymentChannelRegistryService.validateProviderConfig(
              providerCode
            )
          )
        : await this.paymentChannelRegistryService.validateProviderConfig(
            providerCode
          );

    return {
      configKey,
      ...result
    };
  }
}

const PROVIDER_CONFIG_GROUP_TO_CODE: Partial<Record<string, PaymentProviderCode>> = {
  alipay: "ALIPAY",
  wechatpay: "WECHAT_PAY",
  paypal: "PAYPAL",
  stripe: "STRIPE"
};
