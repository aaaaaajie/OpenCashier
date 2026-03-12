import { Injectable } from "@nestjs/common";
import { PaymentStoreService } from "../payment/payment-store.service";

@Injectable()
export class MerchantService {
  constructor(private readonly paymentStoreService: PaymentStoreService) {}

  listMerchantApps() {
    return this.paymentStoreService.listMerchantApps();
  }
}

