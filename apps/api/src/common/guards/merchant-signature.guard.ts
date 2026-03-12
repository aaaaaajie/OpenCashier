import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException
} from "@nestjs/common";
import type { RequestWithContext } from "../interfaces/request-with-context.interface";

@Injectable()
export class MerchantSignatureGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<RequestWithContext>();
    const appIdHeader = request.header("X-App-Id") ?? request.header("x-app-id");

    if (!appIdHeader) {
      throw new UnauthorizedException("Missing X-App-Id header");
    }

    request.appId = appIdHeader;

    return true;
  }
}

