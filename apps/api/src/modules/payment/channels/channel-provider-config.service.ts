import { BadRequestException, Injectable } from "@nestjs/common";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, resolve } from "node:path";
import { PlatformConfigService } from "../platform-config.service";

interface AlipayProviderConfig {
  appId?: string;
  privateKey?: string;
  publicKey?: string;
  gateway?: string;
}

@Injectable()
export class ChannelProviderConfigService {
  constructor(private readonly platformConfigService: PlatformConfigService) {}

  hasAlipayConfig(): boolean {
    const config = this.getAlipayConfig();
    return Boolean(config.appId && config.privateKey);
  }

  getAlipayConfig(): AlipayProviderConfig {
    return {
      appId: this.platformConfigService.get("ALIPAY_APP_ID"),
      privateKey: this.resolvePemEnv("ALIPAY_PRIVATE_KEY"),
      publicKey: this.resolvePemEnv("ALIPAY_PUBLIC_KEY"),
      gateway: this.platformConfigService.get("ALIPAY_GATEWAY")
    };
  }

  hasStripeConfig(): boolean {
    return Boolean(this.platformConfigService.get("STRIPE_SECRET_KEY"));
  }

  hasPaypalConfig(): boolean {
    return Boolean(
      this.platformConfigService.get("PAYPAL_CLIENT_ID") &&
        this.platformConfigService.get("PAYPAL_CLIENT_SECRET")
    );
  }

  hasWechatPayConfig(): boolean {
    return Boolean(
      this.platformConfigService.get("WECHATPAY_APP_ID") &&
        this.platformConfigService.get("WECHATPAY_MCH_ID") &&
        this.platformConfigService.get("WECHATPAY_API_V3_KEY") &&
        this.platformConfigService.get("WECHATPAY_PRIVATE_KEY")
    );
  }

  private resolvePemEnv(
    key: "ALIPAY_PRIVATE_KEY" | "ALIPAY_PUBLIC_KEY" | "WECHATPAY_PRIVATE_KEY"
  ): string | undefined {
    const rawValue = this.platformConfigService.get(key);

    if (!rawValue) {
      return undefined;
    }

    const value = rawValue.trim();

    if (!value) {
      return undefined;
    }

    if (value.includes("-----BEGIN")) {
      return value;
    }

    const existingPath = this.resolveExistingPath(value);

    if (existingPath) {
      return readFileSync(existingPath, "utf8").trim();
    }

    if (this.looksLikeFilePath(value)) {
      throw new BadRequestException(
        `${key} points to a missing file: ${value}`
      );
    }

    return value;
  }

  private resolveExistingPath(value: string): string | undefined {
    const candidates = isAbsolute(value)
      ? [value]
      : [
          value.startsWith("~/")
            ? resolve(homedir(), value.slice(2))
            : undefined,
          resolve(process.cwd(), value)
        ].filter((candidate): candidate is string => Boolean(candidate));

    return candidates.find((candidate) => existsSync(candidate));
  }

  private looksLikeFilePath(value: string): boolean {
    return (
      value.startsWith("/") ||
      value.startsWith("./") ||
      value.startsWith("../") ||
      value.startsWith("~/") ||
      /\.(pem|key|crt|cer|pub)$/i.test(value)
    );
  }
}
