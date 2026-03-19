import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { config as loadEnv } from "dotenv";

loadEnvFile(".env");
loadEnvFile(".env.local", true);

export type ProviderGroupKey = "alipay" | "stripe" | "wechatpay" | "paypal";

export type ProviderSetupConfig = {
  enabled: boolean;
  groupKey?: ProviderGroupKey;
  configFile?: string;
  value: Record<string, string>;
};

export type QuickstartConfig = {
  port: number;
  appBaseUrl: string;
  apiBaseUrl: string;
  appId: string;
  appSecret: string;
  notifyUrl: string;
  allowedChannels: string[];
  adminUsername?: string;
  adminPassword?: string;
  providerSetup: ProviderSetupConfig;
};

export function loadConfig(): QuickstartConfig {
  const port = parsePort(process.env.PORT) ?? 4100;
  const appBaseUrl =
    process.env.APP_BASE_URL?.trim().replace(/\/$/, "") ??
    `http://127.0.0.1:${port}`;
  const allowedChannels = parseAllowedChannels(process.env.OPENCASHIER_ALLOWED_CHANNELS);

  return {
    port,
    appBaseUrl,
    apiBaseUrl:
      process.env.OPENCASHIER_API_BASE_URL?.trim().replace(/\/$/, "") ??
      "http://127.0.0.1:3000/api/v1",
    appId: process.env.OPENCASHIER_APP_ID?.trim() || "demo_app",
    appSecret: process.env.OPENCASHIER_APP_SECRET?.trim() || "demo_app_secret",
    notifyUrl:
      process.env.OPENCASHIER_NOTIFY_URL?.trim().replace(/\/$/, "") ??
      `${appBaseUrl}/notify/opencashier`,
    allowedChannels,
    adminUsername: process.env.OPENCASHIER_ADMIN_USERNAME?.trim() || undefined,
    adminPassword: process.env.OPENCASHIER_ADMIN_PASSWORD?.trim() || undefined,
    providerSetup: loadProviderSetupConfig({
      env: process.env,
      allowedChannels
    })
  };
}

function parsePort(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }

  const port = Number(value);

  return Number.isInteger(port) && port > 0 ? port : undefined;
}

function parseAllowedChannels(value: string | undefined): string[] {
  const normalized = (value ?? "alipay_page")
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);

  return normalized.length > 0 ? normalized : ["alipay_page"];
}

function loadEnvFile(filename: string, override = false): void {
  const path = resolve(process.cwd(), filename);

  if (!existsSync(path)) {
    return;
  }

  loadEnv({ path, override, quiet: true });
}

function loadProviderSetupConfig(input: {
  env: NodeJS.ProcessEnv;
  allowedChannels: string[];
}): ProviderSetupConfig {
  const enabled = isTruthy(input.env.OPENCASHIER_BOOTSTRAP_PROVIDER_CONFIG);

  if (!enabled) {
    return {
      enabled: false,
      value: {}
    };
  }

  const envGroup =
    normalizeProviderGroup(input.env.OPENCASHIER_PROVIDER_GROUP) ??
    inferProviderGroupFromChannels(input.allowedChannels);
  const fileConfig = readProviderConfigFile(input.env.OPENCASHIER_PROVIDER_CONFIG_FILE);
  const groupKey = fileConfig?.groupKey ?? envGroup;

  if (!groupKey) {
    return {
      enabled: true,
      value: {}
    };
  }

  const fileValue = filterGroupValue(fileConfig?.value ?? {}, groupKey);
  const envValue = readGroupValueFromEnv(input.env, groupKey);
  const value = applyInferredDefaults(
    groupKey,
    input.allowedChannels,
    normalizeRecord({
      ...fileValue,
      ...envValue
    })
  );

  return {
    enabled: true,
    groupKey,
    ...(fileConfig?.path ? { configFile: fileConfig.path } : {}),
    value
  };
}

function inferProviderGroupFromChannels(
  allowedChannels: string[]
): ProviderGroupKey | undefined {
  const firstChannel = allowedChannels[0];

  if (!firstChannel) {
    return undefined;
  }

  if (firstChannel.startsWith("alipay_")) {
    return "alipay";
  }

  if (firstChannel.startsWith("wechat")) {
    return "wechatpay";
  }

  if (firstChannel.startsWith("stripe")) {
    return "stripe";
  }

  if (firstChannel.startsWith("paypal")) {
    return "paypal";
  }

  return undefined;
}

function readProviderConfigFile(
  filename: string | undefined
):
  | {
      path: string;
      groupKey?: ProviderGroupKey;
      value: Record<string, string>;
    }
  | undefined {
  const normalizedFilename = filename?.trim();

  if (!normalizedFilename) {
    return undefined;
  }

  const path = resolve(process.cwd(), normalizedFilename);

  if (!existsSync(path)) {
    throw new Error(`provider config file not found: ${normalizedFilename}`);
  }

  const rawFile = readFileSync(path, "utf8");
  const parsed = JSON.parse(rawFile) as unknown;

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("provider config file must be a JSON object");
  }

  const typed = parsed as Record<string, unknown>;
  const groupKey = normalizeProviderGroup(typed.group);
  const valueSource =
    typed.value && typeof typed.value === "object" && !Array.isArray(typed.value)
      ? (typed.value as Record<string, unknown>)
      : typed;

  return {
    path,
    ...(groupKey ? { groupKey } : {}),
    value: normalizeRecord(valueSource)
  };
}

function readGroupValueFromEnv(
  env: NodeJS.ProcessEnv,
  groupKey: ProviderGroupKey
): Record<string, string> {
  return PROVIDER_FIELD_KEYS[groupKey].reduce<Record<string, string>>(
    (result, fieldKey) => {
      const value = env[fieldKey]?.trim();

      if (!value) {
        return result;
      }

      result[fieldKey] = value;
      return result;
    },
    {}
  );
}

function filterGroupValue(
  value: Record<string, string>,
  groupKey: ProviderGroupKey
): Record<string, string> {
  const allowedKeys = new Set(PROVIDER_FIELD_KEYS[groupKey]);

  return Object.entries(value).reduce<Record<string, string>>(
    (result, [key, fieldValue]) => {
      if (!allowedKeys.has(key)) {
        return result;
      }

      result[key] = fieldValue;
      return result;
    },
    {}
  );
}

function applyInferredDefaults(
  groupKey: ProviderGroupKey,
  allowedChannels: string[],
  value: Record<string, string>
): Record<string, string> {
  if (groupKey !== "alipay") {
    return value;
  }

  const nextValue = { ...value };

  if (!nextValue.ALIPAY_AUTH_MODE) {
    nextValue.ALIPAY_AUTH_MODE = "KEY";
  }

  if (!nextValue.ALIPAY_PRODUCT_CAPABILITIES) {
    const capabilities = allowedChannels
      .flatMap((channel) => {
        if (channel === "alipay_qr") {
          return ["QR"];
        }

        if (channel === "alipay_page") {
          return ["PAGE"];
        }

        if (channel === "alipay_wap") {
          return ["WAP"];
        }

        return [];
      })
      .filter((item, index, items) => items.indexOf(item) === index);

    if (capabilities.length > 0) {
      nextValue.ALIPAY_PRODUCT_CAPABILITIES = capabilities.join(",");
    }
  }

  return nextValue;
}

function normalizeRecord(value: Record<string, unknown>): Record<string, string> {
  return Object.entries(value).reduce<Record<string, string>>(
    (result, [key, rawValue]) => {
      if (typeof rawValue !== "string") {
        return result;
      }

      const normalizedValue = rawValue.trim();

      if (!normalizedValue) {
        return result;
      }

      result[key] = normalizedValue;
      return result;
    },
    {}
  );
}

function normalizeProviderGroup(value: unknown): ProviderGroupKey | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const normalizedValue = value.trim().toLowerCase();

  if (
    normalizedValue === "alipay" ||
    normalizedValue === "stripe" ||
    normalizedValue === "wechatpay" ||
    normalizedValue === "paypal"
  ) {
    return normalizedValue;
  }

  return undefined;
}

function isTruthy(value: string | undefined): boolean {
  return value?.trim() === "1" || value?.trim()?.toLowerCase() === "true";
}

const PROVIDER_FIELD_KEYS: Record<ProviderGroupKey, string[]> = {
  alipay: [
    "ALIPAY_AUTH_MODE",
    "ALIPAY_PRODUCT_CAPABILITIES",
    "ALIPAY_APP_ID",
    "ALIPAY_PRIVATE_KEY",
    "ALIPAY_PUBLIC_KEY",
    "ALIPAY_APP_CERT",
    "ALIPAY_PUBLIC_CERT",
    "ALIPAY_ROOT_CERT",
    "ALIPAY_GATEWAY"
  ],
  stripe: ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"],
  wechatpay: [
    "WECHATPAY_VERIFY_MODE",
    "WECHATPAY_APP_ID",
    "WECHATPAY_MCH_ID",
    "WECHATPAY_MCH_SERIAL_NO",
    "WECHATPAY_API_V3_KEY",
    "WECHATPAY_PRIVATE_KEY",
    "WECHATPAY_PUBLIC_KEY_ID",
    "WECHATPAY_PUBLIC_KEY",
    "WECHATPAY_PLATFORM_CERT_SERIAL_NO",
    "WECHATPAY_PLATFORM_CERT"
  ],
  paypal: ["PAYPAL_CLIENT_ID", "PAYPAL_CLIENT_SECRET"]
};
