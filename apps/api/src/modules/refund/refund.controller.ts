import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UseGuards
} from "@nestjs/common";
import { ApiHeader, ApiOperation, ApiParam, ApiTags } from "@nestjs/swagger";
import { CurrentAppId } from "../../common/decorators/current-app-id.decorator";
import { MerchantSignatureGuard } from "../../common/guards/merchant-signature.guard";
import type { RequestWithContext } from "../../common/interfaces/request-with-context.interface";
import { CreateRefundDto } from "./dto/create-refund.dto";
import { RefundService } from "./refund.service";

@ApiTags("refunds")
@ApiHeader({ name: "X-App-Id", required: true })
@ApiHeader({ name: "X-Timestamp", required: true })
@ApiHeader({ name: "X-Nonce", required: true })
@ApiHeader({ name: "X-Sign-Type", required: true, example: "HMAC-SHA256" })
@ApiHeader({ name: "X-Sign", required: true })
@UseGuards(MerchantSignatureGuard)
@Controller("v1/refunds")
export class RefundController {
  constructor(private readonly refundService: RefundService) {}

  @Post()
  @ApiOperation({ summary: "Create refund request" })
  @ApiHeader({ name: "Idempotency-Key", required: true })
  createRefund(
    @CurrentAppId() appId: string,
    @Req() request: RequestWithContext,
    @Body() input: CreateRefundDto
  ) {
    return this.refundService.createRefund(appId, request, input);
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
