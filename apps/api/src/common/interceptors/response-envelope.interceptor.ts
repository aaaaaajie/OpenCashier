import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor
} from "@nestjs/common";
import { map, Observable } from "rxjs";
import type { RequestWithContext } from "../interfaces/request-with-context.interface";

@Injectable()
export class ResponseEnvelopeInterceptor implements NestInterceptor {
  intercept(
    context: ExecutionContext,
    next: CallHandler
  ): Observable<unknown> {
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

