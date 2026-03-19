import { resolveDefaultIdempotencyKey } from "../idempotency";
import type {
  OpenCashierCreateOrderInput,
  OpenCashierCreateOrderResult,
  OpenCashierOrder,
  OpenCashierRequestOptions
} from "../types";
import { OpenCashierRequester } from "../requester";

export class OpenCashierOrdersResource {
  constructor(private readonly getRequester: () => OpenCashierRequester) {}

  create(
    input: OpenCashierCreateOrderInput,
    options?: OpenCashierRequestOptions
  ): Promise<OpenCashierCreateOrderResult> {
    return this.getRequester().execute({
      method: "POST",
      path: "/orders",
      body: input,
      options: {
        ...options,
        idempotencyKey:
          options?.idempotencyKey ??
          resolveDefaultIdempotencyKey({
            action: "CREATE_ORDER",
            merchantOrderNo: input.merchantOrderNo
          })
      }
    });
  }

  getByMerchantOrderNo(
    merchantOrderNo: string,
    options?: OpenCashierRequestOptions
  ): Promise<OpenCashierOrder> {
    return this.getRequester().execute({
      method: "GET",
      path: `/orders?merchantOrderNo=${encodeURIComponent(merchantOrderNo)}`,
      options
    });
  }

  getByPlatformOrderNo(
    platformOrderNo: string,
    options?: OpenCashierRequestOptions
  ): Promise<OpenCashierOrder> {
    return this.getRequester().execute({
      method: "GET",
      path: `/orders/${encodeURIComponent(platformOrderNo)}`,
      options
    });
  }

  close(
    platformOrderNo: string,
    options?: OpenCashierRequestOptions
  ): Promise<OpenCashierOrder> {
    return this.getRequester().execute({
      method: "POST",
      path: `/orders/${encodeURIComponent(platformOrderNo)}/close`,
      body: {},
      options: {
        ...options,
        idempotencyKey:
          options?.idempotencyKey ??
          resolveDefaultIdempotencyKey({
            action: "CLOSE_ORDER",
            platformOrderNo
          })
      }
    });
  }
}
