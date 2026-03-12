import { Injectable } from "@nestjs/common";
import { PaymentStoreService } from "../payment/payment-store.service";
import { CreateOrderDto } from "./dto/create-order.dto";

@Injectable()
export class OrderService {
  constructor(private readonly paymentStoreService: PaymentStoreService) {}

  createOrder(appId: string, input: CreateOrderDto) {
    const record = this.paymentStoreService.createOrder({
      appId,
      merchantOrderNo: input.merchantOrderNo,
      amount: input.amount,
      currency: input.currency,
      subject: input.subject,
      description: input.description,
      notifyUrl: input.notifyUrl,
      returnUrl: input.returnUrl,
      expireInSeconds: input.expireInSeconds ?? 900,
      allowedChannels: input.allowedChannels ?? ["wechat_qr", "alipay_qr"],
      metadata: input.metadata
    });

    return {
      platformOrderNo: record.platformOrderNo,
      merchantOrderNo: record.merchantOrderNo,
      status: record.status,
      cashierUrl: record.cashierUrl,
      expireTime: record.expireTime
    };
  }

  getOrderByPlatformOrderNo(platformOrderNo: string) {
    return this.paymentStoreService.getOrderByPlatformOrderNo(platformOrderNo);
  }

  getOrderByMerchantOrderNo(appId: string, merchantOrderNo: string) {
    return this.paymentStoreService.getOrderByMerchantOrderNo(
      appId,
      merchantOrderNo
    );
  }

  listOrders() {
    return this.paymentStoreService.listOrders();
  }

  closeOrder(platformOrderNo: string) {
    return this.paymentStoreService.closeOrder(platformOrderNo);
  }
}

