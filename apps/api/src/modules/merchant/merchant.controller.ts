import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  UseGuards
} from "@nestjs/common";
import {
  ApiBasicAuth,
  ApiCookieAuth,
  ApiOperation,
  ApiParam,
  ApiTags
} from "@nestjs/swagger";
import { AdminSessionGuard } from "../../common/guards/admin-session.guard";
import { ValidatePlatformConfigDto } from "../admin/dto/validate-platform-config.dto";
import { UpsertPlatformConfigDto } from "../admin/dto/upsert-platform-config.dto";
import { MerchantService } from "./merchant.service";
import { CreateMerchantAppDto } from "./dto/create-merchant-app.dto";
import { MerchantPlatformConfigService } from "./merchant-platform-config.service";

@ApiTags("merchants")
@ApiBasicAuth("admin-basic")
@ApiCookieAuth("opencashier_admin_session")
@UseGuards(AdminSessionGuard)
@Controller("v1/admin/merchants")
export class MerchantController {
  constructor(
    private readonly merchantService: MerchantService,
    private readonly merchantPlatformConfigService: MerchantPlatformConfigService
  ) {}

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

  @Get(":appId/platform-configs")
  @ApiOperation({ summary: "List app-scoped platform config rows" })
  @ApiParam({ name: "appId" })
  listMerchantPlatformConfigs(@Param("appId") appId: string) {
    return this.merchantPlatformConfigService.listMerchantPlatformConfigs(appId);
  }

  @Put(":appId/platform-configs")
  @ApiOperation({
    summary: "Save an app-scoped platform config group as draft into database"
  })
  @ApiParam({ name: "appId" })
  upsertMerchantPlatformConfigs(
    @Param("appId") appId: string,
    @Body() body: UpsertPlatformConfigDto
  ) {
    return this.merchantPlatformConfigService.upsertMerchantPlatformConfigs(
      appId,
      body
    );
  }

  @Post(":appId/platform-configs/:configKey/activate")
  @ApiOperation({ summary: "Activate an app-scoped draft platform config group" })
  @ApiParam({ name: "appId" })
  @ApiParam({ name: "configKey" })
  activateMerchantPlatformConfig(
    @Param("appId") appId: string,
    @Param("configKey") configKey: string
  ) {
    return this.merchantPlatformConfigService.activateMerchantPlatformConfig(
      appId,
      configKey
    );
  }

  @Delete(":appId/platform-configs/:configKey")
  @ApiOperation({ summary: "Delete an app-scoped platform config group" })
  @ApiParam({ name: "appId" })
  @ApiParam({ name: "configKey" })
  clearMerchantPlatformConfig(
    @Param("appId") appId: string,
    @Param("configKey") configKey: string
  ) {
    return this.merchantPlatformConfigService.clearMerchantPlatformConfig(
      appId,
      configKey
    );
  }

  @Post(":appId/platform-configs/:configKey/validate")
  @ApiOperation({
    summary: "Validate whether an app-scoped platform config is effective"
  })
  @ApiParam({ name: "appId" })
  @ApiParam({ name: "configKey" })
  validateMerchantPlatformConfig(
    @Param("appId") appId: string,
    @Param("configKey") configKey: string,
    @Body() body?: ValidatePlatformConfigDto
  ) {
    return this.merchantPlatformConfigService.validateMerchantPlatformConfig(
      appId,
      configKey,
      body
    );
  }
}
