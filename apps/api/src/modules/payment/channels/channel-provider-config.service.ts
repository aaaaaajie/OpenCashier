import { BadRequestException, Injectable } from "@nestjs/common";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, resolve } from "node:path";
import { PlatformConfigService } from "../platform-config.service";

export type AlipayAuthMode = "KEY" | "CERT";
export type AlipayProductCapability = "QR" | "PAGE" | "WAP";
export type WechatPayVerifyMode = "PUBLIC_KEY" | "CERT";

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
  webhookSecret?: string;
}

export interface ResolvedStripeProviderConfig extends Required<StripeProviderConfig> {
  appId?: string;
}

interface PaypalProviderConfig {
  clientId?: string;
  clientSecret?: string;
}

interface WechatPayProviderConfigBase {
  verifyMode: WechatPayVerifyMode;
  appId?: string;
  mchId?: string;
  mchSerialNo?: string;
  apiV3Key?: string;
  privateKey?: string;
}

interface WechatPayPublicKeyProviderConfig extends WechatPayProviderConfigBase {
  verifyMode: "PUBLIC_KEY";
  publicKeyId?: string;
  publicKey?: string;
}

interface WechatPayCertProviderConfig extends WechatPayProviderConfigBase {
  verifyMode: "CERT";
  platformCertSerialNo?: string;
  platformCert?: string;
}

type WechatPayProviderConfig =
  | WechatPayPublicKeyProviderConfig
  | WechatPayCertProviderConfig;

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
    const config = this.getStripeConfig();
    return Boolean(config.secretKey && config.webhookSecret);
  }

  getStripeConfig(): StripeProviderConfig {
    return {
      secretKey: this.resolveTextConfig("STRIPE_SECRET_KEY"),
      webhookSecret: this.resolveTextConfig("STRIPE_WEBHOOK_SECRET")
    };
  }

  getStripeClientConfig(): { secretKey: string; webhookSecret: string } {
    const config = this.getStripeConfig();
    const requiredKeys = [
      !config.secretKey ? "STRIPE_SECRET_KEY" : undefined,
      !config.webhookSecret ? "STRIPE_WEBHOOK_SECRET" : undefined
    ].filter((item): item is string => Boolean(item));

    if (requiredKeys.length > 0) {
      throw new BadRequestException(
        `missing stripe configuration: ${requiredKeys.join(", ")}`
      );
    }

    return {
      secretKey: config.secretKey!,
      webhookSecret: config.webhookSecret!
    };
  }

  listStripeClientConfigs(): ResolvedStripeProviderConfig[] {
    const preferredAppId = this.platformConfigService.getCurrentScopeAppId();

    return this.platformConfigService
      .listResolvedActiveConfigGroups("stripe", { preferAppId: preferredAppId })
      .map((record) => ({
        ...(record.appId ? { appId: record.appId } : {}),
        secretKey: record.value.STRIPE_SECRET_KEY,
        webhookSecret: record.value.STRIPE_WEBHOOK_SECRET
      }))
      .filter(
        (item): item is ResolvedStripeProviderConfig =>
          Boolean(item.secretKey && item.webhookSecret)
      );
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
    if (
      !config.appId ||
      !config.mchId ||
      !config.mchSerialNo ||
      !config.apiV3Key ||
      !config.privateKey
    ) {
      return false;
    }

    if (config.verifyMode === "CERT") {
      return Boolean(config.platformCertSerialNo && config.platformCert);
    }

    return Boolean(config.publicKeyId && config.publicKey);
  }

  getWechatPayConfig(): WechatPayProviderConfig {
    const verifyMode = this.resolveWechatPayVerifyMode();

    if (verifyMode === "CERT") {
      return {
        verifyMode,
        appId: this.resolveTextConfig("WECHATPAY_APP_ID"),
        mchId: this.resolveTextConfig("WECHATPAY_MCH_ID"),
        mchSerialNo: this.resolveTextConfig("WECHATPAY_MCH_SERIAL_NO"),
        apiV3Key: this.resolveTextConfig("WECHATPAY_API_V3_KEY"),
        privateKey: this.resolveMaterialConfig("WECHATPAY_PRIVATE_KEY"),
        platformCertSerialNo: this.resolveTextConfig(
          "WECHATPAY_PLATFORM_CERT_SERIAL_NO"
        ),
        platformCert: this.resolveMaterialConfig("WECHATPAY_PLATFORM_CERT")
      };
    }

    return {
      verifyMode,
      appId: this.resolveTextConfig("WECHATPAY_APP_ID"),
      mchId: this.resolveTextConfig("WECHATPAY_MCH_ID"),
      mchSerialNo: this.resolveTextConfig("WECHATPAY_MCH_SERIAL_NO"),
      apiV3Key: this.resolveTextConfig("WECHATPAY_API_V3_KEY"),
      privateKey: this.resolveMaterialConfig("WECHATPAY_PRIVATE_KEY"),
      publicKeyId: this.resolveTextConfig("WECHATPAY_PUBLIC_KEY_ID"),
      publicKey: this.resolveMaterialConfig("WECHATPAY_PUBLIC_KEY")
    };
  }

  getWechatPayClientConfig():
    | {
        verifyMode: "PUBLIC_KEY";
        appId: string;
        mchId: string;
        mchSerialNo: string;
        apiV3Key: string;
        privateKey: string;
        publicKeyId: string;
        publicKey: string;
      }
    | {
        verifyMode: "CERT";
        appId: string;
        mchId: string;
        mchSerialNo: string;
        apiV3Key: string;
        privateKey: string;
        platformCertSerialNo: string;
        platformCert: string;
      } {
    const config = this.getWechatPayConfig();
    const missingKeys = [
      !config.appId ? "WECHATPAY_APP_ID" : undefined,
      !config.mchId ? "WECHATPAY_MCH_ID" : undefined,
      !config.mchSerialNo ? "WECHATPAY_MCH_SERIAL_NO" : undefined,
      !config.apiV3Key ? "WECHATPAY_API_V3_KEY" : undefined,
      !config.privateKey ? "WECHATPAY_PRIVATE_KEY" : undefined
    ];

    if (config.verifyMode === "CERT") {
      missingKeys.push(
        !config.platformCertSerialNo
          ? "WECHATPAY_PLATFORM_CERT_SERIAL_NO"
          : undefined,
        !config.platformCert ? "WECHATPAY_PLATFORM_CERT" : undefined
      );
    } else {
      missingKeys.push(
        !config.publicKeyId ? "WECHATPAY_PUBLIC_KEY_ID" : undefined,
        !config.publicKey ? "WECHATPAY_PUBLIC_KEY" : undefined
      );
    }

    const requiredKeys = missingKeys.filter(
      (item): item is string => Boolean(item)
    );

    if (requiredKeys.length > 0) {
      throw new BadRequestException(
        `missing wechatpay configuration: ${requiredKeys.join(", ")}`
      );
    }

    if (config.verifyMode === "CERT") {
      return {
        verifyMode: "CERT",
        appId: config.appId!,
        mchId: config.mchId!,
        mchSerialNo: config.mchSerialNo!,
        apiV3Key: config.apiV3Key!,
        privateKey: config.privateKey!,
        platformCertSerialNo: config.platformCertSerialNo!,
        platformCert: config.platformCert!
      };
    }

    return {
      verifyMode: "PUBLIC_KEY",
      appId: config.appId!,
      mchId: config.mchId!,
      mchSerialNo: config.mchSerialNo!,
      apiV3Key: config.apiV3Key!,
      privateKey: config.privateKey!,
      publicKeyId: config.publicKeyId!,
      publicKey: config.publicKey!
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

  private resolveWechatPayVerifyMode(): WechatPayVerifyMode {
    const configuredMode = this.resolveTextConfig("WECHATPAY_VERIFY_MODE")
      ?.toUpperCase();

    if (configuredMode === "CERT") {
      return "CERT";
    }

    if (configuredMode === "PUBLIC_KEY") {
      return "PUBLIC_KEY";
    }

    if (
      this.resolveTextConfig("WECHATPAY_PLATFORM_CERT_SERIAL_NO") ||
      this.resolveTextConfig("WECHATPAY_PLATFORM_CERT")
    ) {
      return "CERT";
    }

    return "PUBLIC_KEY";
  }

  private resolveMaterialConfig(
    key:
      | "ALIPAY_PRIVATE_KEY"
      | "ALIPAY_PUBLIC_KEY"
      | "ALIPAY_APP_CERT"
      | "ALIPAY_PUBLIC_CERT"
      | "ALIPAY_ROOT_CERT"
      | "WECHATPAY_PRIVATE_KEY"
      | "WECHATPAY_PUBLIC_KEY"
      | "WECHATPAY_PLATFORM_CERT"
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
