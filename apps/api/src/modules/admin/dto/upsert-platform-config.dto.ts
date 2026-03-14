import { ApiProperty } from "@nestjs/swagger";
import { IsObject, IsString } from "class-validator";

export class UpsertPlatformConfigDto {
  @ApiProperty({ example: "alipay" })
  @IsString()
  key!: string;

  @ApiProperty({
    example: {
      ALIPAY_AUTH_MODE: "CERT",
      ALIPAY_PRODUCT_CAPABILITIES: "QR,PAGE,WAP",
      ALIPAY_APP_ID: "2021000000000000",
      ALIPAY_APP_CERT: "-----BEGIN CERTIFICATE-----\\n...\\n-----END CERTIFICATE-----",
      ALIPAY_PUBLIC_CERT: "-----BEGIN CERTIFICATE-----\\n...\\n-----END CERTIFICATE-----",
      ALIPAY_ROOT_CERT: "-----BEGIN CERTIFICATE-----\\n...\\n-----END CERTIFICATE-----",
      ALIPAY_GATEWAY: "https://openapi.alipay.com/gateway.do"
    }
  })
  @IsObject()
  value!: Record<string, unknown>;
}
