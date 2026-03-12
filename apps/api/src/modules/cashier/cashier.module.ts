import { Module } from "@nestjs/common";
import { PaymentModule } from "../payment/payment.module";
import { CashierController } from "./cashier.controller";
import { CashierService } from "./cashier.service";

@Module({
  imports: [PaymentModule],
  controllers: [CashierController],
  providers: [CashierService]
})
export class CashierModule {}
