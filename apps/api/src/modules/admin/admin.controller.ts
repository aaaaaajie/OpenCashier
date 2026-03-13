import { Body, Controller, Delete, Get, Param, Post, Put } from "@nestjs/common";
import { ApiOperation, ApiParam, ApiTags } from "@nestjs/swagger";
import { AdminService } from "./admin.service";
import { UpsertPlatformConfigDto } from "./dto/upsert-platform-config.dto";

@ApiTags("admin")
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
  @ApiOperation({ summary: "Save a platform config group into database" })
  upsertPlatformConfigs(@Body() body: UpsertPlatformConfigDto) {
    return this.adminService.upsertPlatformConfigs(body);
  }

  @Delete("platform-configs/:configKey")
  @ApiOperation({ summary: "Delete a database-backed platform config group" })
  @ApiParam({ name: "configKey" })
  clearPlatformConfig(@Param("configKey") configKey: string) {
    return this.adminService.clearPlatformConfig(configKey);
  }

  @Get("notifications")
  @ApiOperation({ summary: "List merchant notify tasks" })
  getNotifyTasks() {
    return this.adminService.listNotifyTasks();
  }

  @Post("notifications/:notifyId/retry")
  @ApiOperation({ summary: "Replay merchant notify task" })
  @ApiParam({ name: "notifyId" })
  retryNotifyTask(@Param("notifyId") notifyId: string) {
    return this.adminService.retryNotifyTask(notifyId);
  }
}
