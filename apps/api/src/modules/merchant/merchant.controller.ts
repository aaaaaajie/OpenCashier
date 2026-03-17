import { Body, Controller, Get, Post, UseGuards } from "@nestjs/common";
import {
  ApiBasicAuth,
  ApiCookieAuth,
  ApiOperation,
  ApiTags
} from "@nestjs/swagger";
import { AdminSessionGuard } from "../../common/guards/admin-session.guard";
import { MerchantService } from "./merchant.service";
import { CreateMerchantAppDto } from "./dto/create-merchant-app.dto";

@ApiTags("merchants")
@ApiBasicAuth("admin-basic")
@ApiCookieAuth("opencashier_admin_session")
@UseGuards(AdminSessionGuard)
@Controller("v1/admin/merchants")
export class MerchantController {
  constructor(private readonly merchantService: MerchantService) {}

  @Get()
  @ApiOperation({ summary: "List merchant apps" })
  listMerchantApps() {
    return this.merchantService.listMerchantApps();
  }

  @Get("onboarding")
  @ApiOperation({ summary: "Get merchant onboarding information" })
  getMerchantOnboarding() {
    return this.merchantService.getMerchantOnboarding();
  }

  @Post()
  @ApiOperation({ summary: "Create merchant app and return one-time app secret" })
  createMerchantApp(@Body() body: CreateMerchantAppDto) {
    return this.merchantService.createMerchantApp(body);
  }
}
