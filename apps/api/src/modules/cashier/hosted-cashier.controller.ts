import {
  Controller,
  Get,
  HttpException,
  Param,
  Query,
  Req,
  Res
} from "@nestjs/common";
import { ApiExcludeController } from "@nestjs/swagger";
import type { Request, Response } from "express";
import { SkipResponseEnvelope } from "../../common/decorators/skip-response-envelope.decorator";
import { CashierService } from "./cashier.service";

type CashierTerminal = "desktop" | "mobile";

@ApiExcludeController()
@Controller("cashier")
export class HostedCashierController {
  constructor(private readonly cashierService: CashierService) {}

  @Get(":cashierToken")
  @SkipResponseEnvelope()
  async openCashier(
    @Param("cashierToken") cashierToken: string,
    @Req() request: Request,
    @Res() response: Response,
    @Query("terminal") terminal?: string
  ) {
    try {
      const resolvedTerminal = this.resolveTerminal(request, terminal);
      const entry = await this.cashierService.resolveHostedCashierEntry(
        cashierToken,
        resolvedTerminal
      );

      response.setHeader("Cache-Control", "no-store");
      response.redirect(302, entry.url);
    } catch (error) {
      if (error instanceof HttpException) {
        response.setHeader("Cache-Control", "no-store");
        response
          .status(error.getStatus())
          .type("text/plain; charset=utf-8")
          .send(error.message);
        return;
      }

      throw error;
    }
  }

  private resolveTerminal(
    request: Request,
    terminal?: string
  ): CashierTerminal {
    if (terminal?.toLowerCase() === "mobile") {
      return "mobile";
    }

    if (terminal?.toLowerCase() === "desktop") {
      return "desktop";
    }

    const userAgent = request.get("user-agent")?.toLowerCase() ?? "";

    return /iphone|ipad|ipod|android|mobile|micromessenger/.test(userAgent)
      ? "mobile"
      : "desktop";
  }
}
