import { Controller, Get } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { MerchantService } from "./merchant.service";

@ApiTags("merchants")
@Controller("v1/admin/merchants")
export class MerchantController {
  constructor(private readonly merchantService: MerchantService) {}

  @Get()
  @ApiOperation({ summary: "List scaffold merchant apps" })
  listMerchantApps() {
    return this.merchantService.listMerchantApps();
  }
}

