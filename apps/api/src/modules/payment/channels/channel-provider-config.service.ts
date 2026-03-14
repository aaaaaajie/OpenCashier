import { BadRequestException, Injectable } from "@nestjs/common";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, resolve } from "node:path";
import { PlatformConfigService } from "../platform-config.service";

export type AlipayAuthMode = "KEY" | "CERT";
export type AlipayProductCapability = "QR" | "PAGE" | "WAP";

interface AlipayProviderConfigBase {
  authMode: AlipayAuthMode;
  appId?: string;
  privateKey?: string;
  gateway?: string;
}

interface AlipayKeyProviderConfig extends AlipayProviderConfigBase {
  authMode: "KEY";
  publicKey?: string;
}

interface AlipayCertProviderConfig extends AlipayProviderConfigBase {
  authMode: "CERT";
  appCert?: string;
  alipayPublicCert?: string;
  alipayRootCert?: string;
}

type AlipayProviderConfig = AlipayKeyProviderConfig | AlipayCertProviderConfig;

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

const DEFAULT_ALIPAY_PRODUCT_CAPABILITIES: AlipayProductCapability[] = [
  "QR",
  "PAGE",
  "WAP"
];

@Injectable()
export class ChannelProviderConfigService {
  constructor(private readonly platformConfigService: PlatformConfigService) {}

  hasAlipayConfig(): boolean {
    const config = this.getAlipayConfig();
    if (!config.appId || !config.privateKey || !config.gateway) {
      return false;
    }

    if (config.authMode === "CERT") {
      return Boolean(
        config.appCert && config.alipayPublicCert && config.alipayRootCert
      );
    }

    return true;
  }

  hasAlipayVerifyConfig(): boolean {
    const config = this.getAlipayConfig();

    if (config.authMode === "CERT") {
      return Boolean(config.alipayPublicCert);
    }

    return Boolean(config.publicKey);
  }

  getAlipayProductCapabilities(): AlipayProductCapability[] {
    const configuredValue = this.resolveTextConfig("ALIPAY_PRODUCT_CAPABILITIES");

    if (!configuredValue) {
      return DEFAULT_ALIPAY_PRODUCT_CAPABILITIES;
    }

    const capabilities = configuredValue
      .split(",")
      .map((item) => item.trim().toUpperCase())
      .filter((item): item is AlipayProductCapability =>
        item === "QR" || item === "PAGE" || item === "WAP"
      );

    return capabilities.length > 0
      ? Array.from(new Set(capabilities))
      : DEFAULT_ALIPAY_PRODUCT_CAPABILITIES;
  }

  getAlipayConfig(): AlipayProviderConfig {
    const authMode = this.resolveAlipayAuthMode();

    if (authMode === "CERT") {
      return {
        authMode,
        appId: this.resolveTextConfig("ALIPAY_APP_ID"),
        privateKey: this.resolveMaterialConfig("ALIPAY_PRIVATE_KEY"),
        appCert: this.resolveMaterialConfig("ALIPAY_APP_CERT"),
        alipayPublicCert: this.resolveMaterialConfig("ALIPAY_PUBLIC_CERT"),
        alipayRootCert: this.resolveMaterialConfig("ALIPAY_ROOT_CERT"),
        gateway: this.resolveTextConfig("ALIPAY_GATEWAY")
      };
    }

    return {
      authMode,
      appId: this.resolveTextConfig("ALIPAY_APP_ID"),
      privateKey: this.resolveMaterialConfig("ALIPAY_PRIVATE_KEY"),
      publicKey: this.resolveMaterialConfig("ALIPAY_PUBLIC_KEY"),
      gateway: this.resolveTextConfig("ALIPAY_GATEWAY")
    };
  }

  getAlipaySdkConfig():
    | {
        authMode: "KEY";
        appId: string;
        privateKey: string;
        publicKey?: string;
        gateway: string;
      }
    | {
        authMode: "CERT";
        appId: string;
        privateKey: string;
        appCert: string;
        alipayPublicCert: string;
        alipayRootCert: string;
        gateway: string;
      } {
    const config = this.getAlipayConfig();
    const missingKeys = [
      !config.appId ? "ALIPAY_APP_ID" : undefined,
      !config.privateKey ? "ALIPAY_PRIVATE_KEY" : undefined,
      !config.gateway ? "ALIPAY_GATEWAY" : undefined
    ];

    if (config.authMode === "CERT") {
      missingKeys.push(
        !config.appCert ? "ALIPAY_APP_CERT" : undefined,
        !config.alipayPublicCert ? "ALIPAY_PUBLIC_CERT" : undefined,
        !config.alipayRootCert ? "ALIPAY_ROOT_CERT" : undefined
      );
    }

    const requiredKeys = missingKeys.filter(
      (item): item is string => Boolean(item)
    );

    if (requiredKeys.length > 0) {
      throw new BadRequestException(
        `missing alipay sdk configuration: ${requiredKeys.join(", ")}`
      );
    }

    if (config.authMode === "CERT") {
      return {
        authMode: "CERT",
        appId: config.appId!,
        privateKey: config.privateKey!,
        appCert: config.appCert!,
        alipayPublicCert: config.alipayPublicCert!,
        alipayRootCert: config.alipayRootCert!,
        gateway: config.gateway!
      };
    }

    return {
      authMode: "KEY",
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
      privateKey: this.resolveMaterialConfig("WECHATPAY_PRIVATE_KEY")
    };
  }

  private resolveAlipayAuthMode(): AlipayAuthMode {
    const configuredMode = this.resolveTextConfig("ALIPAY_AUTH_MODE")?.toUpperCase();

    if (configuredMode === "CERT") {
      return "CERT";
    }

    if (configuredMode === "KEY") {
      return "KEY";
    }

    if (
      this.resolveTextConfig("ALIPAY_APP_CERT") ||
      this.resolveTextConfig("ALIPAY_PUBLIC_CERT") ||
      this.resolveTextConfig("ALIPAY_ROOT_CERT")
    ) {
      return "CERT";
    }

    return "KEY";
  }

  private resolveMaterialConfig(
    key:
      | "ALIPAY_PRIVATE_KEY"
      | "ALIPAY_PUBLIC_KEY"
      | "ALIPAY_APP_CERT"
      | "ALIPAY_PUBLIC_CERT"
      | "ALIPAY_ROOT_CERT"
      | "WECHATPAY_PRIVATE_KEY"
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
