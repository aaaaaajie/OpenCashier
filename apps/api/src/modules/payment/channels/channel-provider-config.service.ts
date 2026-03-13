import { BadRequestException, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, resolve } from "node:path";

interface AlipayProviderConfig {
  appId?: string;
  privateKey?: string;
  publicKey?: string;
  gateway?: string;
}

@Injectable()
export class ChannelProviderConfigService {
  constructor(private readonly configService: ConfigService) {}

  hasAlipayConfig(): boolean {
    const config = this.getAlipayConfig();
    return Boolean(config.appId && config.privateKey);
  }

  getAlipayConfig(): AlipayProviderConfig {
    return {
      appId: this.configService.get<string>("ALIPAY_APP_ID") ?? undefined,
      privateKey: this.resolvePemEnv("ALIPAY_PRIVATE_KEY"),
      publicKey: this.resolvePemEnv("ALIPAY_PUBLIC_KEY"),
      gateway:
        this.configService.get<string>("ALIPAY_GATEWAY") ?? undefined
    };
  }

  hasStripeConfig(): boolean {
    return Boolean(this.configService.get<string>("STRIPE_SECRET_KEY"));
  }

  hasPaypalConfig(): boolean {
    return Boolean(
      this.configService.get<string>("PAYPAL_CLIENT_ID") &&
        this.configService.get<string>("PAYPAL_CLIENT_SECRET")
    );
  }

  hasWechatPayConfig(): boolean {
    return Boolean(
      this.configService.get<string>("WECHATPAY_APP_ID") &&
        this.configService.get<string>("WECHATPAY_MCH_ID") &&
        this.configService.get<string>("WECHATPAY_API_V3_KEY") &&
        this.configService.get<string>("WECHATPAY_PRIVATE_KEY")
    );
  }

  private resolvePemEnv(key: string): string | undefined {
    const rawValue = this.configService.get<string>(key);

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
