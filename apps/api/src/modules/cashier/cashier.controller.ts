import { Controller, Get, Param } from "@nestjs/common";
import { ApiOperation, ApiParam, ApiTags } from "@nestjs/swagger";
import { CashierService } from "./cashier.service";

@ApiTags("cashier")
@Controller("v1/cashier")
export class CashierController {
  constructor(private readonly cashierService: CashierService) {}

  @Get(":platformOrderNo")
  @ApiOperation({
    summary:
      "Get cashier session and channel previews using official SDK first / API fallback strategy"
  })
  @ApiParam({ name: "platformOrderNo" })
  getCashierSession(@Param("platformOrderNo") platformOrderNo: string) {
    return this.cashierService.getCashierSession(platformOrderNo);
  }
}
