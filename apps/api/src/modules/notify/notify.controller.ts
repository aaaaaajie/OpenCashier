import {
  BadRequestException,
  Body,
  Controller,
  Param,
  Post,
  Req,
  Res
} from "@nestjs/common";
import { ApiExcludeController } from "@nestjs/swagger";
import type { Response } from "express";
import type { RequestWithContext } from "../../common/interfaces/request-with-context.interface";
import { NotifyService } from "./notify.service";

@ApiExcludeController()
@Controller("v1/notify")
export class NotifyController {
  constructor(private readonly notifyService: NotifyService) {}

  @Post("alipay")
  async handleAlipayNotify(
    @Body() body: Record<string, unknown>,
    @Res() response: Response
  ) {
    try {
      await this.notifyService.handleAlipayNotify(body);
      response.type("text/plain").send("success");
    } catch {
      response.status(400).type("text/plain").send("failure");
    }
  }

  @Post("alipay/:appId")
  async handleScopedAlipayNotify(
    @Param("appId") appId: string,
    @Body() body: Record<string, unknown>,
    @Res() response: Response
  ) {
    try {
      await this.notifyService.handleAlipayNotify(body, appId);
      response.type("text/plain").send("success");
    } catch {
      response.status(400).type("text/plain").send("failure");
    }
  }

  @Post("wechatpay")
  async handleWechatPayNotify(
    @Req() request: RequestWithContext,
    @Res() response: Response
  ) {
    return this.handleWechatPayNotifyInternal(request, response);
  }

  @Post("wechatpay/:appId")
  async handleScopedWechatPayNotify(
    @Param("appId") appId: string,
    @Req() request: RequestWithContext,
    @Res() response: Response
  ) {
    return this.handleWechatPayNotifyInternal(request, response, appId);
  }

  @Post("stripe")
  async handleStripeNotify(
    @Req() request: RequestWithContext,
    @Res() response: Response
  ) {
    return this.handleStripeNotifyInternal(request, response);
  }

  @Post("stripe/:appId")
  async handleScopedStripeNotify(
    @Param("appId") appId: string,
    @Req() request: RequestWithContext,
    @Res() response: Response
  ) {
    return this.handleStripeNotifyInternal(request, response, appId);
  }

  private async handleWechatPayNotifyInternal(
    request: RequestWithContext,
    response: Response,
    appId?: string
  ) {
    try {
      const rawBody = request.rawBody?.toString("utf8");

      if (!rawBody) {
        throw new BadRequestException("missing raw body for wechatpay notify");
      }

      await this.notifyService.handleWechatPayNotify({
        headers: request.headers,
        body: rawBody,
        appId
      });
      response.status(204).send();
    } catch (error) {
      const isBadRequest = error instanceof BadRequestException;

      response.status(isBadRequest ? 400 : 500).json({
        code: "FAIL",
        message:
          error instanceof Error && error.message
            ? error.message
            : "wechatpay notify failed"
      });
    }
  }

  private async handleStripeNotifyInternal(
    request: RequestWithContext,
    response: Response,
    appId?: string
  ) {
    try {
      const rawBody = request.rawBody?.toString("utf8");

      if (!rawBody) {
        throw new BadRequestException("missing raw body for stripe notify");
      }

      await this.notifyService.handleStripeNotify({
        headers: request.headers,
        body: rawBody,
        appId
      });
      response.status(200).json({
        received: true
      });
    } catch (error) {
      const isBadRequest = error instanceof BadRequestException;

      response.status(isBadRequest ? 400 : 500).json({
        code: "FAIL",
        message:
          error instanceof Error && error.message ? error.message : "stripe notify failed"
      });
    }
  }
}
