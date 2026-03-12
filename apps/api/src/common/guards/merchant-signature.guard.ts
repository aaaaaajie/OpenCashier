import {
  CanActivate,
  ExecutionContext,
  Injectable
} from "@nestjs/common";
import type { RequestWithContext } from "../interfaces/request-with-context.interface";
import { IdempotencyService } from "../../modules/auth/idempotency.service";
import { MerchantAuthService } from "../../modules/auth/merchant-auth.service";

@Injectable()
export class MerchantSignatureGuard implements CanActivate {
  constructor(
    private readonly merchantAuthService: MerchantAuthService,
    private readonly idempotencyService: IdempotencyService
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithContext>();

    await this.merchantAuthService.authenticateRequest(request);
    await this.idempotencyService.registerNonce({
      appId: request.appId!,
      nonce: request.nonce!,
      requestFingerprint: request.canonicalRequest!
    });

    return true;
  }
}
