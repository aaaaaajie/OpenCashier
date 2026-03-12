import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { ScheduleModule } from "@nestjs/schedule";
import { resolve } from "node:path";
import { AdminModule } from "./modules/admin/admin.module";
import { AuthModule } from "./modules/auth/auth.module";
import { CashierModule } from "./modules/cashier/cashier.module";
import { HealthModule } from "./modules/health/health.module";
import { MerchantModule } from "./modules/merchant/merchant.module";
import { NotifyModule } from "./modules/notify/notify.module";
import { OrderModule } from "./modules/order/order.module";
import { PaymentModule } from "./modules/payment/payment.module";
import { ReconcileModule } from "./modules/reconcile/reconcile.module";
import { RefundModule } from "./modules/refund/refund.module";
import { PrismaModule } from "./prisma/prisma.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [
        resolve(process.cwd(), ".env"),
        resolve(process.cwd(), "../../.env")
      ]
    }),
    ScheduleModule.forRoot(),
    PrismaModule,
    PaymentModule,
    HealthModule,
    AuthModule,
    MerchantModule,
    OrderModule,
    RefundModule,
    CashierModule,
    NotifyModule,
    ReconcileModule,
    AdminModule
  ]
})
export class AppModule {}

