import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import { ApiHeader, ApiOperation, ApiParam, ApiTags } from "@nestjs/swagger";
import { CurrentAppId } from "../../common/decorators/current-app-id.decorator";
import { MerchantSignatureGuard } from "../../common/guards/merchant-signature.guard";
import { CreateRefundDto } from "./dto/create-refund.dto";
import { RefundService } from "./refund.service";

@ApiTags("refunds")
@ApiHeader({ name: "X-App-Id", required: true })
@UseGuards(MerchantSignatureGuard)
@Controller("v1/refunds")
export class RefundController {
  constructor(private readonly refundService: RefundService) {}

  @Post()
  @ApiOperation({ summary: "Create refund request" })
  createRefund(
    @CurrentAppId() appId: string,
    @Body() input: CreateRefundDto
  ) {
    return this.refundService.createRefund(appId, input);
  }

  @Get("all")
  @ApiOperation({ summary: "List seeded refunds for scaffold stage" })
  listRefunds() {
    return this.refundService.listRefunds();
  }

  @Get(":merchantRefundNo")
  @ApiOperation({ summary: "Query refund by merchant refund number" })
  @ApiParam({ name: "merchantRefundNo" })
  getRefund(
    @CurrentAppId() appId: string,
    @Param("merchantRefundNo") merchantRefundNo: string
  ) {
    return this.refundService.getRefund(appId, merchantRefundNo);
  }
}

