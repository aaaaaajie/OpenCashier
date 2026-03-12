import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards
} from "@nestjs/common";
import {
  ApiHeader,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags
} from "@nestjs/swagger";
import { CurrentAppId } from "../../common/decorators/current-app-id.decorator";
import { MerchantSignatureGuard } from "../../common/guards/merchant-signature.guard";
import type { RequestWithContext } from "../../common/interfaces/request-with-context.interface";
import { CloseOrderDto } from "./dto/close-order.dto";
import { CreateOrderDto } from "./dto/create-order.dto";
import { OrderService } from "./order.service";

@ApiTags("orders")
@ApiHeader({ name: "X-App-Id", required: true })
@ApiHeader({ name: "X-Timestamp", required: true })
@ApiHeader({ name: "X-Nonce", required: true })
@ApiHeader({ name: "X-Sign-Type", required: true, example: "HMAC-SHA256" })
@ApiHeader({ name: "X-Sign", required: true })
@UseGuards(MerchantSignatureGuard)
@Controller("v1/orders")
export class OrderController {
  constructor(private readonly orderService: OrderService) {}

  @Post()
  @ApiOperation({ summary: "Create payment order" })
  @ApiHeader({ name: "Idempotency-Key", required: true })
  createOrder(
    @CurrentAppId() appId: string,
    @Req() request: RequestWithContext,
    @Body() input: CreateOrderDto
  ) {
    return this.orderService.createOrder(appId, request, input);
  }

  @Get()
  @ApiOperation({ summary: "Query order by merchant order number" })
  @ApiQuery({ name: "merchantOrderNo", required: true })
  queryOrderByMerchantOrderNo(
    @CurrentAppId() appId: string,
    @Query("merchantOrderNo") merchantOrderNo: string
  ) {
    return this.orderService.getOrderByMerchantOrderNo(appId, merchantOrderNo);
  }

  @Get(":platformOrderNo")
  @ApiOperation({ summary: "Query order by platform order number" })
  @ApiParam({ name: "platformOrderNo" })
  getOrderByPlatformOrderNo(
    @CurrentAppId() appId: string,
    @Param("platformOrderNo") platformOrderNo: string
  ) {
    return this.orderService.getOrderByPlatformOrderNo(appId, platformOrderNo);
  }

  @Post(":platformOrderNo/close")
  @ApiOperation({ summary: "Close payment order" })
  @ApiHeader({ name: "Idempotency-Key", required: true })
  closeOrder(
    @CurrentAppId() appId: string,
    @Req() request: RequestWithContext,
    @Param("platformOrderNo") platformOrderNo: string,
    @Body() _input: CloseOrderDto
  ) {
    return this.orderService.closeOrder(appId, request, platformOrderNo);
  }
}
