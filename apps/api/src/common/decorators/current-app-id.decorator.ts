import {
  UnauthorizedException,
  createParamDecorator,
  ExecutionContext
} from "@nestjs/common";
import type { RequestWithContext } from "../interfaces/request-with-context.interface";

export const CurrentAppId = createParamDecorator(
  (_data: unknown, context: ExecutionContext) => {
    const request = context.switchToHttp().getRequest<RequestWithContext>();

    if (!request.appId) {
      throw new UnauthorizedException({
        code: "AUTH_INVALID",
        message: "Missing authenticated app context"
      });
    }

    return request.appId;
  }
);
