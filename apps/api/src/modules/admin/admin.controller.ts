import { Controller, Get } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
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
}

