import { Injectable } from "@nestjs/common";
import { MerchantNotifyDispatcherService } from "../notify/merchant-notify-dispatcher.service";
import { PaymentChannelRegistryService } from "../payment/channels/payment-channel-registry.service";
import { PaymentStoreService } from "../payment/payment-store.service";

@Injectable()
export class AdminService {
  constructor(
    private readonly paymentStoreService: PaymentStoreService,
    private readonly paymentChannelRegistryService: PaymentChannelRegistryService,
    private readonly merchantNotifyDispatcherService: MerchantNotifyDispatcherService
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

  listNotifyTasks() {
    return this.merchantNotifyDispatcherService.listTasks();
  }

  retryNotifyTask(notifyId: string) {
    return this.merchantNotifyDispatcherService.replayTask(notifyId);
  }
}
