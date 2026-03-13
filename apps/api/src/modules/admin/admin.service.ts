import { Injectable } from "@nestjs/common";
import { MerchantNotifyDispatcherService } from "../notify/merchant-notify-dispatcher.service";
import { PaymentChannelRegistryService } from "../payment/channels/payment-channel-registry.service";
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

  clearPlatformConfig(configKey: string) {
    return this.platformConfigService.clearConfig(configKey);
  }

  listNotifyTasks() {
    return this.merchantNotifyDispatcherService.listTasks();
  }

  retryNotifyTask(notifyId: string) {
    return this.merchantNotifyDispatcherService.replayTask(notifyId);
  }
}
