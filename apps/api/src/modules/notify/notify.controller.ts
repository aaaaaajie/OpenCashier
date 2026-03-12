import { Body, Controller, Post, Res } from "@nestjs/common";
import { ApiExcludeController } from "@nestjs/swagger";
import type { Response } from "express";
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
}
