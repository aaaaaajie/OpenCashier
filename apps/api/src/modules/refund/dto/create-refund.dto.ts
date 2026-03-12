import { ApiProperty } from "@nestjs/swagger";
import { IsInt, IsNotEmpty, IsPositive, IsString } from "class-validator";

export class CreateRefundDto {
  @ApiProperty({ example: "P202603120001" })
  @IsString()
  @IsNotEmpty()
  platformOrderNo!: string;

  @ApiProperty({ example: "R202603120001" })
  @IsString()
  @IsNotEmpty()
  merchantRefundNo!: string;

  @ApiProperty({ example: 3000 })
  @IsInt()
  @IsPositive()
  refundAmount!: number;

  @ApiProperty({ example: "user_cancel" })
  @IsString()
  @IsNotEmpty()
  reason!: string;
}

