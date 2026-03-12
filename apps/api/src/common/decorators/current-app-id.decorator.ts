import { createParamDecorator, ExecutionContext } from "@nestjs/common";
import type { RequestWithContext } from "../interfaces/request-with-context.interface";

export const CurrentAppId = createParamDecorator(
  (_data: unknown, context: ExecutionContext) => {
    const request = context.switchToHttp().getRequest<RequestWithContext>();

    return request.appId ?? "demo_app";
  }
);

