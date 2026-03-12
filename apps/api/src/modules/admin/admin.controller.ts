import { Controller, Get, Param, Post } from "@nestjs/common";
import { ApiOperation, ApiParam, ApiTags } from "@nestjs/swagger";
import { AdminService } from "./admin.service";

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
