import { BadRequestException, Body, Controller, Post, Req, Res } from "@nestjs/common";
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

  @Post("wechatpay")
  async handleWechatPayNotify(
    @Req() request: RequestWithContext,
    @Res() response: Response
  ) {
    try {
      const rawBody = request.rawBody?.toString("utf8");

      if (!rawBody) {
        throw new BadRequestException("missing raw body for wechatpay notify");
      }

      await this.notifyService.handleWechatPayNotify({
        headers: request.headers,
        body: rawBody
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
}
