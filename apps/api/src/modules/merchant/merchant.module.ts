import { Module } from "@nestjs/common";
import { PaymentModule } from "../payment/payment.module";
import { MerchantController } from "./merchant.controller";
import { MerchantService } from "./merchant.service";

@Module({
  imports: [PaymentModule],
  controllers: [MerchantController],
  providers: [MerchantService]
})
export class MerchantModule {}

