import { Controller, Get, Param, Query } from "@nestjs/common";
import { ApiOperation, ApiParam, ApiTags } from "@nestjs/swagger";
import { CashierService } from "./cashier.service";

@ApiTags("cashier")
@Controller("v1/cashier")
export class CashierController {
  constructor(private readonly cashierService: CashierService) {}

  @Get(":cashierToken")
  @ApiOperation({
    summary:
      "Get cashier session and channel previews using official SDK first / API fallback strategy"
  })
  @ApiParam({ name: "cashierToken" })
  getCashierSession(
    @Param("cashierToken") cashierToken: string,
    @Query("terminal") terminal?: string
  ) {
    return this.cashierService.getCashierSession(cashierToken, terminal);
  }
}
