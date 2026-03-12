import { Injectable } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { PrismaService } from "../../prisma/prisma.service";

@Injectable()
export class IdempotencyMaintenanceService {
  constructor(private readonly prismaService: PrismaService) {}

  @Cron(CronExpression.EVERY_HOUR)
  async clearExpiredRecords(): Promise<void> {
    await this.prismaService.idempotencyRecord.deleteMany({
      where: {
        expireTime: {
          lt: new Date()
        }
      }
    });
  }
}
