import { Injectable } from "@nestjs/common";
import { PaymentStoreService } from "../payment/payment-store.service";
import { CreateRefundDto } from "./dto/create-refund.dto";

@Injectable()
export class RefundService {
  constructor(private readonly paymentStoreService: PaymentStoreService) {}

  createRefund(appId: string, input: CreateRefundDto) {
    return this.paymentStoreService.createRefund({
      appId,
      platformOrderNo: input.platformOrderNo,
      merchantRefundNo: input.merchantRefundNo,
      refundAmount: input.refundAmount,
      reason: input.reason
    });
  }

  getRefund(appId: string, merchantRefundNo: string) {
    return this.paymentStoreService.getRefund(appId, merchantRefundNo);
  }

  listRefunds() {
    return this.paymentStoreService.listRefunds();
  }
}

