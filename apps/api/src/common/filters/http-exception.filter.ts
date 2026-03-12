import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus
} from "@nestjs/common";
import type { Response } from "express";
import type { RequestWithContext } from "../interfaces/request-with-context.interface";

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const response = context.getResponse<Response>();
    const request = context.getRequest<RequestWithContext>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const payload =
      exception instanceof HttpException ? exception.getResponse() : undefined;

    const message =
      typeof payload === "string"
        ? payload
        : (payload as { message?: string | string[] } | undefined)?.message ??
          "Internal server error";

    response.status(status).json({
      code: this.mapCode(status),
      message: Array.isArray(message) ? message.join(", ") : message,
      requestId: request.requestId ?? "",
      data: null
    });
  }

  private mapCode(status: number): string {
    if (status === HttpStatus.UNAUTHORIZED) {
      return "AUTH_INVALID";
    }

    if (status === HttpStatus.CONFLICT) {
      return "IDEMPOTENT_CONFLICT";
    }

    if (status >= 400 && status < 500) {
      return "PARAM_INVALID";
    }

    return "SYSTEM_BUSY";
  }
}

