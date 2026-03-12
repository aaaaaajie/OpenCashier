import { Global, Module } from "@nestjs/common";
import { MerchantSignatureGuard } from "../../common/guards/merchant-signature.guard";
import { IdempotencyMaintenanceService } from "./idempotency-maintenance.service";
import { IdempotencyService } from "./idempotency.service";
import { MerchantAuthService } from "./merchant-auth.service";

@Global()
@Module({
  providers: [
    MerchantAuthService,
    IdempotencyService,
    IdempotencyMaintenanceService,
    MerchantSignatureGuard
  ],
  exports: [MerchantAuthService, IdempotencyService, MerchantSignatureGuard]
})
export class AuthModule {}
