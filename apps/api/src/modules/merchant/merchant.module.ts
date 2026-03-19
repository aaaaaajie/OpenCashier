import { Module } from "@nestjs/common";
import { PaymentModule } from "../payment/payment.module";
import { MerchantPlatformConfigService } from "./merchant-platform-config.service";
import { MerchantController } from "./merchant.controller";
import { MerchantService } from "./merchant.service";

@Module({
  imports: [PaymentModule],
  controllers: [MerchantController],
  providers: [MerchantService, MerchantPlatformConfigService]
})
export class MerchantModule {}
