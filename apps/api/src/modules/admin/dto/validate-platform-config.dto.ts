import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsObject, IsOptional } from "class-validator";

export class ValidatePlatformConfigDto {
  @ApiPropertyOptional({
    example: {
      ALIPAY_AUTH_MODE: "CERT",
      ALIPAY_APP_ID: "2021000000000000",
      ALIPAY_GATEWAY: "https://openapi.alipay.com/gateway.do"
    }
  })
  @IsOptional()
  @IsObject()
  value?: Record<string, unknown>;
}
