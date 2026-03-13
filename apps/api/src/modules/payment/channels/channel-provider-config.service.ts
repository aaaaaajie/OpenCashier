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

interface StripeProviderConfig {
  secretKey?: string;
}

interface PaypalProviderConfig {
  clientId?: string;
  clientSecret?: string;
}

interface WechatPayProviderConfig {
  appId?: string;
  mchId?: string;
  apiV3Key?: string;
  privateKey?: string;
}

@Injectable()
export class ChannelProviderConfigService {
  constructor(private readonly platformConfigService: PlatformConfigService) {}

  hasAlipayConfig(): boolean {
    const config = this.getAlipayConfig();
    return Boolean(config.appId && config.privateKey && config.gateway);
  }

  getAlipayConfig(): AlipayProviderConfig {
    return {
      appId: this.resolveTextConfig("ALIPAY_APP_ID"),
      privateKey: this.resolvePemEnv("ALIPAY_PRIVATE_KEY"),
      publicKey: this.resolvePemEnv("ALIPAY_PUBLIC_KEY"),
      gateway: this.resolveTextConfig("ALIPAY_GATEWAY")
    };
  }

  getAlipaySdkConfig(): {
    appId: string;
    privateKey: string;
    publicKey?: string;
    gateway: string;
  } {
    const config = this.getAlipayConfig();
    console.log(config, 1111);
    const missingKeys = [
      !config.appId ? "ALIPAY_APP_ID" : undefined,
      !config.privateKey ? "ALIPAY_PRIVATE_KEY" : undefined,
      !config.gateway ? "ALIPAY_GATEWAY" : undefined
    ].filter((item): item is string => Boolean(item));

    if (missingKeys.length > 0) {
      throw new BadRequestException(
        `missing alipay sdk configuration: ${missingKeys.join(", ")}`
      );
    }

    return {
      appId: config.appId!,
      privateKey: config.privateKey!,
      publicKey: config.publicKey,
      gateway: config.gateway!
    };
  }

  hasStripeConfig(): boolean {
    return Boolean(this.getStripeConfig().secretKey);
  }

  getStripeConfig(): StripeProviderConfig {
    return {
      secretKey: this.resolveTextConfig("STRIPE_SECRET_KEY")
    };
  }

  hasPaypalConfig(): boolean {
    const config = this.getPaypalConfig();
    return Boolean(config.clientId && config.clientSecret);
  }

  getPaypalConfig(): PaypalProviderConfig {
    return {
      clientId: this.resolveTextConfig("PAYPAL_CLIENT_ID"),
      clientSecret: this.resolveTextConfig("PAYPAL_CLIENT_SECRET")
    };
  }

  hasWechatPayConfig(): boolean {
    const config = this.getWechatPayConfig();
    return Boolean(
      config.appId &&
        config.mchId &&
        config.apiV3Key &&
        config.privateKey
    );
  }

  getWechatPayConfig(): WechatPayProviderConfig {
    return {
      appId: this.resolveTextConfig("WECHATPAY_APP_ID"),
      mchId: this.resolveTextConfig("WECHATPAY_MCH_ID"),
      apiV3Key: this.resolveTextConfig("WECHATPAY_API_V3_KEY"),
      privateKey: this.resolvePemEnv("WECHATPAY_PRIVATE_KEY")
    };
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

  private resolveTextConfig(key: string): string | undefined {
    const value = this.platformConfigService.get(key);
    return value?.trim() || undefined;
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
