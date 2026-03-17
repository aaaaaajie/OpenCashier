import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  ArrayMaxSize,
  IsArray,
  IsOptional,
  IsString,
  Matches,
  MinLength
} from "class-validator";

export class CreateMerchantAppDto {
  @ApiProperty({ example: "示例商户" })
  @IsString()
  @MinLength(2)
  merchantName!: string;

  @ApiProperty({ example: "官网支付应用" })
  @IsString()
  @MinLength(2)
  appName!: string;

  @ApiPropertyOptional({
    example: "merchant_web",
    description: "可选；不传时平台自动生成"
  })
  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z0-9_-]{4,64}$/, {
    message: "appId must be 4-64 chars of letters, numbers, _ or -"
  })
  appId?: string;

  @ApiPropertyOptional({
    example: "ocs_7S3aY6d0qV_qn4X6j4V74kmY2W3mXjQy",
    description: "可选；不传时平台自动生成"
  })
  @IsOptional()
  @IsString()
  @MinLength(16)
  appSecret?: string;

  @ApiProperty({
    example: ["alipay_qr", "alipay_page", "alipay_wap"],
    type: [String]
  })
  @IsArray()
  @ArrayMaxSize(8)
  @IsString({ each: true })
  allowedChannels!: string[];
}
