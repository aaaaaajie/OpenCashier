import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor
} from "@nestjs/common";
import { map, Observable } from "rxjs";
import { SKIP_RESPONSE_ENVELOPE } from "../decorators/skip-response-envelope.decorator";
import type { RequestWithContext } from "../interfaces/request-with-context.interface";

@Injectable()
export class ResponseEnvelopeInterceptor implements NestInterceptor {
  intercept(
    context: ExecutionContext,
    next: CallHandler
  ): Observable<unknown> {
    const skipEnvelope =
      Reflect.getMetadata(SKIP_RESPONSE_ENVELOPE, context.getHandler()) ||
      Reflect.getMetadata(SKIP_RESPONSE_ENVELOPE, context.getClass());

    if (skipEnvelope) {
      return next.handle();
    }

    const request = context.switchToHttp().getRequest<RequestWithContext>();

    return next.handle().pipe(
      map((data) => ({
        code: "SUCCESS",
        message: "OK",
        requestId: request.requestId ?? "",
        data: data ?? null
      }))
    );
  }
}
