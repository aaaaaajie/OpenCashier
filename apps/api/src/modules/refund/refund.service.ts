import { Injectable } from "@nestjs/common";
import type { RequestWithContext } from "../../common/interfaces/request-with-context.interface";
import { IdempotencyService } from "../auth/idempotency.service";
import { PaymentStoreService } from "../payment/payment-store.service";
import { CreateRefundDto } from "./dto/create-refund.dto";

@Injectable()
export class RefundService {
  constructor(
    private readonly paymentStoreService: PaymentStoreService,
    private readonly idempotencyService: IdempotencyService
  ) {}

  createRefund(
    appId: string,
    request: RequestWithContext,
    input: CreateRefundDto
  ) {
    const idempotencyKey = this.idempotencyService.requireIdempotencyKey(
      request.header("Idempotency-Key") ?? request.header("idempotency-key")
    );

    return this.idempotencyService.execute({
      appId,
      action: "CREATE_REFUND",
      idempotencyKey,
      requestFingerprint: request.idempotencyFingerprint!,
      resolveResourceNo: (result) => result.platformRefundNo,
      execute: () =>
        this.paymentStoreService.createRefund({
          appId,
          platformOrderNo: input.platformOrderNo,
          merchantRefundNo: input.merchantRefundNo,
          refundAmount: input.refundAmount,
          reason: input.reason
        })
    });
  }

  getRefund(appId: string, merchantRefundNo: string) {
    return this.paymentStoreService.getRefund(appId, merchantRefundNo);
  }
}
