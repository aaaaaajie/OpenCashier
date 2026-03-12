import { Injectable } from "@nestjs/common";
import { PaymentStoreService } from "../payment/payment-store.service";

@Injectable()
export class AdminService {
  constructor(private readonly paymentStoreService: PaymentStoreService) {}

  getSummary() {
    return this.paymentStoreService.getDashboardSummary();
  }
}

