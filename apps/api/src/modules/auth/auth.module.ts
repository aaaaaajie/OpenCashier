import { Global, Module } from "@nestjs/common";
import { AdminSessionGuard } from "../../common/guards/admin-session.guard";
import { AdminAuthService } from "./admin-auth.service";
import { AdminSessionController } from "./admin-session.controller";
import { MerchantSignatureGuard } from "../../common/guards/merchant-signature.guard";
import { IdempotencyMaintenanceService } from "./idempotency-maintenance.service";
import { IdempotencyService } from "./idempotency.service";
import { MerchantAuthService } from "./merchant-auth.service";

@Global()
@Module({
  controllers: [AdminSessionController],
  providers: [
    AdminAuthService,
    AdminSessionGuard,
    MerchantAuthService,
    IdempotencyService,
    IdempotencyMaintenanceService,
    MerchantSignatureGuard
  ],
  exports: [
    AdminAuthService,
    AdminSessionGuard,
    MerchantAuthService,
    IdempotencyService,
    MerchantSignatureGuard
  ]
})
export class AuthModule {}
