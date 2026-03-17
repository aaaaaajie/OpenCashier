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
import { AdminService } from "./admin.service";
import { UpsertPlatformConfigDto } from "./dto/upsert-platform-config.dto";
import { ValidatePlatformConfigDto } from "./dto/validate-platform-config.dto";

@ApiTags("admin")
@ApiBasicAuth("admin-basic")
@ApiCookieAuth("opencashier_admin_session")
@UseGuards(AdminSessionGuard)
@Controller("v1/admin")
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get("summary")
  @ApiOperation({ summary: "Get scaffold dashboard summary" })
  getSummary() {
    return this.adminService.getSummary();
  }

  @Get("channels")
  @ApiOperation({
    summary:
      "List supported payment providers and whether they use official Node SDKs"
  })
  getPaymentProviders() {
    return this.adminService.getPaymentProviders();
  }

  @Get("platform-configs")
  @ApiOperation({ summary: "List platform config rows" })
  getPlatformConfigs() {
    return this.adminService.getPlatformConfigs();
  }

  @Put("platform-configs")
  @ApiOperation({ summary: "Save a platform config group as draft into database" })
  upsertPlatformConfigs(@Body() body: UpsertPlatformConfigDto) {
    return this.adminService.upsertPlatformConfigs(body);
  }

  @Post("platform-configs/:configKey/activate")
  @ApiOperation({ summary: "Activate a draft platform config group" })
  @ApiParam({ name: "configKey" })
  activatePlatformConfig(@Param("configKey") configKey: string) {
    return this.adminService.activatePlatformConfig(configKey);
  }

  @Delete("platform-configs/:configKey")
  @ApiOperation({ summary: "Delete a database-backed platform config group" })
  @ApiParam({ name: "configKey" })
  clearPlatformConfig(@Param("configKey") configKey: string) {
    return this.adminService.clearPlatformConfig(configKey);
  }

  @Post("platform-configs/:configKey/validate")
  @ApiOperation({ summary: "Validate whether a platform config is effective" })
  @ApiParam({ name: "configKey" })
  validatePlatformConfig(
    @Param("configKey") configKey: string,
    @Body() body?: ValidatePlatformConfigDto
  ) {
    return this.adminService.validatePlatformConfig(configKey, body?.value);
  }

  @Get("notifications")
  @ApiOperation({ summary: "List merchant notify tasks" })
  getNotifyTasks() {
    return this.adminService.listNotifyTasks();
  }

  @Get("orders")
  @ApiOperation({ summary: "List pay orders" })
  getOrders() {
    return this.adminService.listOrders();
  }

  @Get("refunds")
  @ApiOperation({ summary: "List refund orders" })
  getRefunds() {
    return this.adminService.listRefunds();
  }

  @Post("notifications/:notifyId/retry")
  @ApiOperation({ summary: "Replay merchant notify task" })
  @ApiParam({ name: "notifyId" })
  retryNotifyTask(@Param("notifyId") notifyId: string) {
    return this.adminService.retryNotifyTask(notifyId);
  }
}
