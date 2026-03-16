import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsPositive,
  IsString,
  IsUrl,
  Max,
  Min
} from "class-validator";

export class CreateOrderDto {
  @ApiProperty({ example: "ORDER_10001" })
  @IsString()
  @IsNotEmpty()
  merchantOrderNo!: string;

  @ApiProperty({ example: 9900, description: "Amount in fen" })
  @IsInt()
  @IsPositive()
  amount!: number;

  @ApiProperty({ example: "CNY" })
  @IsString()
  @IsNotEmpty()
  currency!: string;

  @ApiProperty({ example: "VIP会员" })
  @IsString()
  @IsNotEmpty()
  subject!: string;

  @ApiPropertyOptional({ example: "年费会员" })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ example: "https://merchant.example.com/pay/notify" })
  @IsUrl()
  notifyUrl!: string;

  @ApiPropertyOptional({ example: "https://merchant.example.com/pay/result" })
  @IsOptional()
  @IsUrl()
  returnUrl?: string;

  @ApiPropertyOptional({ example: 3600, minimum: 60, maximum: 86400 })
  @IsOptional()
  @IsInt()
  @Min(60)
  @Max(86400)
  expireInSeconds?: number;

  @ApiPropertyOptional({
    example: ["wechat_qr", "alipay_qr", "alipay_page"],
    type: [String]
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5)
  @IsString({ each: true })
  allowedChannels?: string[];

  @ApiPropertyOptional({
    example: {
      scene: "web_checkout"
    }
  })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
