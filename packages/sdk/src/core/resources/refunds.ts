import { resolveDefaultIdempotencyKey } from "../idempotency";
import type {
  OpenCashierCreateRefundInput,
  OpenCashierRefund,
  OpenCashierRequestOptions
} from "../types";
import { OpenCashierRequester } from "../requester";

export class OpenCashierRefundsResource {
  constructor(private readonly getRequester: () => OpenCashierRequester) {}

  create(
    input: OpenCashierCreateRefundInput,
    options?: OpenCashierRequestOptions
  ): Promise<OpenCashierRefund> {
    return this.getRequester().execute({
      method: "POST",
      path: "/refunds",
      body: input,
      options: {
        ...options,
        idempotencyKey:
          options?.idempotencyKey ??
          resolveDefaultIdempotencyKey({
            action: "CREATE_REFUND",
            merchantRefundNo: input.merchantRefundNo
          })
      }
    });
  }

  getByMerchantRefundNo(
    merchantRefundNo: string,
    options?: OpenCashierRequestOptions
  ): Promise<OpenCashierRefund> {
    return this.getRequester().execute({
      method: "GET",
      path: `/refunds/${encodeURIComponent(merchantRefundNo)}`,
      options
    });
  }
}
