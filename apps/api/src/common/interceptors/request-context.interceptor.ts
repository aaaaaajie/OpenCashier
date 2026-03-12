import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { Observable } from "rxjs";
import type { Response } from "express";
import type { RequestWithContext } from "../interfaces/request-with-context.interface";

@Injectable()
export class RequestContextInterceptor implements NestInterceptor {
  intercept(
    context: ExecutionContext,
    next: CallHandler
  ): Observable<unknown> {
    const request = context.switchToHttp().getRequest<RequestWithContext>();
    const response = context.switchToHttp().getResponse<Response>();
    const requestId =
      request.header("X-Request-Id") ??
      request.header("x-request-id") ??
      randomUUID();

    request.requestId = requestId;
    response.setHeader("X-Request-Id", requestId);

    return next.handle();
  }
}

