import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

@Injectable()
export class HealthService {
  constructor(private readonly configService: ConfigService) {}

  getHealth() {
    return {
      status: "ok",
      service: this.configService.get<string>("APP_NAME") ?? "OpenCashier",
      timestamp: new Date().toISOString(),
      version: "0.1.0"
    };
  }
}
