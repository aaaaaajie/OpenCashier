import { Module } from "@nestjs/common";
import { PaymentModule } from "../payment/payment.module";
import { RefundController } from "./refund.controller";
import { RefundService } from "./refund.service";

@Module({
  imports: [PaymentModule],
  controllers: [RefundController],
  providers: [RefundService]
})
export class RefundModule {}

