export type ProviderGroupKey = "alipay" | "stripe" | "wechatpay" | "paypal";

export type AlipayAuthMode = "KEY" | "CERT";
export type AlipayProductCapability = "QR" | "PAGE" | "WAP";
export type WechatPayVerifyMode = "PUBLIC_KEY" | "CERT";

interface OpenCashierAlipayProviderConfigBase {
  authMode?: AlipayAuthMode;
  productCapabilities?: AlipayProductCapability[];
  appId: string;
  privateKey: string;
  gateway: string;
}

export interface OpenCashierAlipayKeyProviderConfig
  extends OpenCashierAlipayProviderConfigBase {
  authMode?: "KEY";
  publicKey?: string;
}

export interface OpenCashierAlipayCertProviderConfig
  extends OpenCashierAlipayProviderConfigBase {
  authMode: "CERT";
  appCert: string;
  publicCert: string;
  rootCert: string;
}

export type OpenCashierAlipayProviderConfig =
  | OpenCashierAlipayKeyProviderConfig
  | OpenCashierAlipayCertProviderConfig;

export interface OpenCashierStripeProviderConfig {
  secretKey: string;
  webhookSecret: string;
}

interface OpenCashierWechatPayProviderConfigBase {
  verifyMode?: WechatPayVerifyMode;
  appId: string;
  mchId: string;
  mchSerialNo: string;
  apiV3Key: string;
  privateKey: string;
}

export interface OpenCashierWechatPayPublicKeyProviderConfig
  extends OpenCashierWechatPayProviderConfigBase {
  verifyMode?: "PUBLIC_KEY";
  publicKeyId: string;
  publicKey: string;
}

export interface OpenCashierWechatPayCertProviderConfig
  extends OpenCashierWechatPayProviderConfigBase {
  verifyMode: "CERT";
  platformCertSerialNo: string;
  platformCert: string;
}

export type OpenCashierWechatPayProviderConfig =
  | OpenCashierWechatPayPublicKeyProviderConfig
  | OpenCashierWechatPayCertProviderConfig;

export interface OpenCashierPaypalProviderConfig {
  clientId: string;
  clientSecret: string;
}

export interface OpenCashierProviderConfigByGroup {
  alipay: OpenCashierAlipayProviderConfig;
  stripe: OpenCashierStripeProviderConfig;
  wechatpay: OpenCashierWechatPayProviderConfig;
  paypal: OpenCashierPaypalProviderConfig;
}

export type OpenCashierProviderSetupMap =
  Partial<OpenCashierProviderConfigByGroup>;

export type OpenCashierProviderSetupEntry =
  | {
      group: "alipay";
      config: OpenCashierProviderConfigByGroup["alipay"];
    }
  | {
      group: "stripe";
      config: OpenCashierProviderConfigByGroup["stripe"];
    }
  | {
      group: "wechatpay";
      config: OpenCashierProviderConfigByGroup["wechatpay"];
    }
  | {
      group: "paypal";
      config: OpenCashierProviderConfigByGroup["paypal"];
    };

export type OpenCashierProviderSetupInput =
  | OpenCashierProviderSetupMap
  | OpenCashierProviderSetupEntry[];

export interface OpenCashierProviderValidationResult {
  configKey: string;
  appId: string;
  status: "SUCCESS" | "FAILED" | "UNSUPPORTED";
  message: string;
  checkedAt: string;
  details?: Record<string, unknown>;
}

export interface OpenCashierProviderSetupOptions {
  appId?: string;
  validate?: boolean;
  activate?: boolean;
  tolerateValidationFailure?: boolean;
}

export interface OpenCashierProviderSetupResult<
  K extends ProviderGroupKey = ProviderGroupKey
> {
  groupKey: K;
  appId: string;
  valueRecord: Record<string, string>;
  validation?: OpenCashierProviderValidationResult;
  validationError?: string;
  activated: boolean;
}

export function serializeProviderConfig<K extends ProviderGroupKey>(
  group: K,
  config: OpenCashierProviderConfigByGroup[K]
): Record<string, string> {
  switch (group) {
    case "alipay":
      return serializeAlipayProviderConfig(
        config as OpenCashierProviderConfigByGroup["alipay"]
      );
    case "stripe":
      return {
        STRIPE_SECRET_KEY: (
          config as OpenCashierProviderConfigByGroup["stripe"]
        ).secretKey,
        STRIPE_WEBHOOK_SECRET: (
          config as OpenCashierProviderConfigByGroup["stripe"]
        ).webhookSecret
      };
    case "wechatpay":
      return serializeWechatPayProviderConfig(
        config as OpenCashierProviderConfigByGroup["wechatpay"]
      );
    case "paypal":
      return {
        PAYPAL_CLIENT_ID: (
          config as OpenCashierProviderConfigByGroup["paypal"]
        ).clientId,
        PAYPAL_CLIENT_SECRET: (
          config as OpenCashierProviderConfigByGroup["paypal"]
        ).clientSecret
      };
    default:
      return assertNever(group);
  }
}

export function normalizeProviderSetupInput(
  input: OpenCashierProviderSetupInput
): OpenCashierProviderSetupEntry[] {
  if (Array.isArray(input)) {
    return input;
  }

  const entries: OpenCashierProviderSetupEntry[] = [];

  if (input.alipay) {
    entries.push({
      group: "alipay",
      config: input.alipay
    });
  }

  if (input.stripe) {
    entries.push({
      group: "stripe",
      config: input.stripe
    });
  }

  if (input.wechatpay) {
    entries.push({
      group: "wechatpay",
      config: input.wechatpay
    });
  }

  if (input.paypal) {
    entries.push({
      group: "paypal",
      config: input.paypal
    });
  }

  return entries;
}

function serializeAlipayProviderConfig(
  config: OpenCashierAlipayProviderConfig
): Record<string, string> {
  const authMode = config.authMode ?? "KEY";
  const value: Record<string, string> = {
    ALIPAY_AUTH_MODE: authMode,
    ALIPAY_APP_ID: config.appId,
    ALIPAY_PRIVATE_KEY: config.privateKey,
    ALIPAY_GATEWAY: config.gateway
  };

  if (config.productCapabilities?.length) {
    value.ALIPAY_PRODUCT_CAPABILITIES = config.productCapabilities.join(",");
  }

  if (authMode === "CERT") {
    const certConfig = config as OpenCashierAlipayCertProviderConfig;

    value.ALIPAY_APP_CERT = certConfig.appCert;
    value.ALIPAY_PUBLIC_CERT = certConfig.publicCert;
    value.ALIPAY_ROOT_CERT = certConfig.rootCert;
    return value;
  }

  const keyConfig = config as OpenCashierAlipayKeyProviderConfig;

  if (keyConfig.publicKey) {
    value.ALIPAY_PUBLIC_KEY = keyConfig.publicKey;
  }

  return value;
}

function serializeWechatPayProviderConfig(
  config: OpenCashierWechatPayProviderConfig
): Record<string, string> {
  const verifyMode = config.verifyMode ?? "PUBLIC_KEY";
  const value: Record<string, string> = {
    WECHATPAY_VERIFY_MODE: verifyMode,
    WECHATPAY_APP_ID: config.appId,
    WECHATPAY_MCH_ID: config.mchId,
    WECHATPAY_MCH_SERIAL_NO: config.mchSerialNo,
    WECHATPAY_API_V3_KEY: config.apiV3Key,
    WECHATPAY_PRIVATE_KEY: config.privateKey
  };

  if (verifyMode === "CERT") {
    const certConfig = config as OpenCashierWechatPayCertProviderConfig;

    value.WECHATPAY_PLATFORM_CERT_SERIAL_NO = certConfig.platformCertSerialNo;
    value.WECHATPAY_PLATFORM_CERT = certConfig.platformCert;
    return value;
  }

  const publicKeyConfig = config as OpenCashierWechatPayPublicKeyProviderConfig;

  value.WECHATPAY_PUBLIC_KEY_ID = publicKeyConfig.publicKeyId;
  value.WECHATPAY_PUBLIC_KEY = publicKeyConfig.publicKey;
  return value;
}

function assertNever(value: never): never {
  throw new Error(`unsupported provider group: ${String(value)}`);
}
