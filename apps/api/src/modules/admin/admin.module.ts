import { Module } from "@nestjs/common";
import { NotifyModule } from "../notify/notify.module";
import { PaymentModule } from "../payment/payment.module";
import { AdminController } from "./admin.controller";
import { AdminService } from "./admin.service";

@Module({
  imports: [PaymentModule, NotifyModule],
  controllers: [AdminController],
  providers: [AdminService]
})
export class AdminModule {}
