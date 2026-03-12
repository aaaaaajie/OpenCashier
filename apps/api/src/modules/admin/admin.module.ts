import { Module } from "@nestjs/common";
import { PaymentModule } from "../payment/payment.module";
import { AdminController } from "./admin.controller";
import { AdminService } from "./admin.service";

@Module({
  imports: [PaymentModule],
  controllers: [AdminController],
  providers: [AdminService]
})
export class AdminModule {}

