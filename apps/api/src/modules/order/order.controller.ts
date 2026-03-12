import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
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
import { CloseOrderDto } from "./dto/close-order.dto";
import { CreateOrderDto } from "./dto/create-order.dto";
import { OrderService } from "./order.service";

@ApiTags("orders")
@ApiHeader({ name: "X-App-Id", required: true })
@UseGuards(MerchantSignatureGuard)
@Controller("v1/orders")
export class OrderController {
  constructor(private readonly orderService: OrderService) {}

  @Post()
  @ApiOperation({ summary: "Create payment order" })
  createOrder(
    @CurrentAppId() appId: string,
    @Body() input: CreateOrderDto
  ) {
    return this.orderService.createOrder(appId, input);
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

  @Get("all")
  @ApiOperation({ summary: "List seeded orders for scaffold stage" })
  listOrders() {
    return this.orderService.listOrders();
  }

  @Get(":platformOrderNo")
  @ApiOperation({ summary: "Query order by platform order number" })
  @ApiParam({ name: "platformOrderNo" })
  getOrderByPlatformOrderNo(@Param("platformOrderNo") platformOrderNo: string) {
    return this.orderService.getOrderByPlatformOrderNo(platformOrderNo);
  }

  @Post(":platformOrderNo/close")
  @ApiOperation({ summary: "Close payment order" })
  closeOrder(
    @Param("platformOrderNo") platformOrderNo: string,
    @Body() _input: CloseOrderDto
  ) {
    return this.orderService.closeOrder(platformOrderNo);
  }
}

