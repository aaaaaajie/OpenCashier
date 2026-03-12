import { Injectable } from "@nestjs/common";
import type { RequestWithContext } from "../../common/interfaces/request-with-context.interface";
import { IdempotencyService } from "../auth/idempotency.service";
import { PaymentChannelRegistryService } from "../payment/channels/payment-channel-registry.service";
import { PaymentStoreService } from "../payment/payment-store.service";
import { CreateOrderDto } from "./dto/create-order.dto";

@Injectable()
export class OrderService {
  constructor(
    private readonly paymentStoreService: PaymentStoreService,
    private readonly paymentChannelRegistryService: PaymentChannelRegistryService,
    private readonly idempotencyService: IdempotencyService
  ) {}

  async createOrder(
    appId: string,
    request: RequestWithContext,
    input: CreateOrderDto
  ) {
    if (input.allowedChannels?.length) {
      this.paymentChannelRegistryService.validateChannels(input.allowedChannels);
    }

    const idempotencyKey = this.idempotencyService.requireIdempotencyKey(
      request.header("Idempotency-Key") ?? request.header("idempotency-key")
    );

    return this.idempotencyService.execute({
      appId,
      action: "CREATE_ORDER",
      idempotencyKey,
      requestFingerprint: request.idempotencyFingerprint!,
      resolveResourceNo: (result) => result.platformOrderNo,
      execute: async () => {
        const record = await this.paymentStoreService.createOrder({
          appId,
          merchantOrderNo: input.merchantOrderNo,
          amount: input.amount,
          currency: input.currency,
          subject: input.subject,
          description: input.description,
          notifyUrl: input.notifyUrl,
          returnUrl: input.returnUrl,
          expireInSeconds: input.expireInSeconds ?? 900,
          allowedChannels: input.allowedChannels,
          metadata: input.metadata
        });

        return {
          platformOrderNo: record.platformOrderNo,
          merchantOrderNo: record.merchantOrderNo,
          status: record.status,
          cashierUrl: record.cashierUrl,
          expireTime: record.expireTime,
          channels: this.paymentChannelRegistryService.listCatalogByChannels(
            record.allowedChannels
          )
        };
      }
    });
  }

  getOrderByPlatformOrderNo(appId: string, platformOrderNo: string) {
    return this.paymentStoreService.getOrderByPlatformOrderNoForApp(
      appId,
      platformOrderNo
    );
  }

  getOrderByMerchantOrderNo(appId: string, merchantOrderNo: string) {
    return this.paymentStoreService.getOrderByMerchantOrderNo(
      appId,
      merchantOrderNo
    );
  }

  closeOrder(
    appId: string,
    request: RequestWithContext,
    platformOrderNo: string
  ) {
    const idempotencyKey = this.idempotencyService.requireIdempotencyKey(
      request.header("Idempotency-Key") ?? request.header("idempotency-key")
    );

    return this.idempotencyService.execute({
      appId,
      action: "CLOSE_ORDER",
      idempotencyKey,
      requestFingerprint: request.idempotencyFingerprint!,
      resolveResourceNo: (result) => result.platformOrderNo,
      execute: () =>
        this.paymentStoreService.closeOrderForApp(appId, platformOrderNo)
    });
  }
}
