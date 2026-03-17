import { Body, Controller, Get, Post, Req, Res } from "@nestjs/common";
import {
  ApiBody,
  ApiCookieAuth,
  ApiOperation,
  ApiTags
} from "@nestjs/swagger";
import type { Request, Response } from "express";
import { AdminAuthService } from "./admin-auth.service";
import { AdminLoginDto } from "./dto/admin-login.dto";

@ApiTags("admin-session")
@Controller("v1/admin/session")
export class AdminSessionController {
  constructor(private readonly adminAuthService: AdminAuthService) {}

  @Get()
  @ApiOperation({ summary: "Get admin session status" })
  @ApiCookieAuth("opencashier_admin_session")
  getSession(@Req() request: Request) {
    return this.adminAuthService.getSessionStatus(request);
  }

  @Post("login")
  @ApiOperation({ summary: "Login admin session and set session cookie" })
  @ApiBody({ type: AdminLoginDto })
  login(
    @Body() body: AdminLoginDto,
    @Res({ passthrough: true }) response: Response
  ) {
    return this.adminAuthService.login(response, body.username, body.password);
  }

  @Post("logout")
  @ApiOperation({ summary: "Logout admin session and clear session cookie" })
  logout(@Res({ passthrough: true }) response: Response) {
    return this.adminAuthService.logout(response);
  }
}
