import { ApiProperty } from "@nestjs/swagger";
import { IsObject, IsString } from "class-validator";

export class UpsertPlatformConfigDto {
  @ApiProperty({ example: "alipay" })
  @IsString()
  key!: string;

  @ApiProperty({
    example: {
      ALIPAY_APP_ID: "2021000000000000",
      ALIPAY_GATEWAY: "https://openapi-sandbox.dl.alipaydev.com/gateway.do"
    }
  })
  @IsObject()
  value!: Record<string, unknown>;
}
