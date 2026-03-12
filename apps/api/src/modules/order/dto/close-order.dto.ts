import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsOptional, IsString } from "class-validator";

export class CloseOrderDto {
  @ApiPropertyOptional({ example: "merchant_cancel" })
  @IsOptional()
  @IsString()
  reason?: string;
}

