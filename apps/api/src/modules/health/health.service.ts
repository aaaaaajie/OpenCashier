import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { APP_VERSION } from "../../version";

@Injectable()
export class HealthService {
  constructor(private readonly configService: ConfigService) {}

  getHealth() {
    return {
      status: "ok",
      service: this.configService.get<string>("APP_NAME") ?? "OpenCashier",
      timestamp: new Date().toISOString(),
      version: APP_VERSION
    };
  }
}
