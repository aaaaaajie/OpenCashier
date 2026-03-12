import { Global, Module } from "@nestjs/common";
import { PaymentStoreService } from "./payment-store.service";

@Global()
@Module({
  providers: [PaymentStoreService],
  exports: [PaymentStoreService]
})
export class PaymentModule {}

