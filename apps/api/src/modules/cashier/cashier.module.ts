import { Module } from "@nestjs/common";
import { PaymentModule } from "../payment/payment.module";
import { CashierController } from "./cashier.controller";
import { CashierService } from "./cashier.service";
import { HostedCashierController } from "./hosted-cashier.controller";

@Module({
  imports: [PaymentModule],
  controllers: [CashierController, HostedCashierController],
  providers: [CashierService]
})
export class CashierModule {}
