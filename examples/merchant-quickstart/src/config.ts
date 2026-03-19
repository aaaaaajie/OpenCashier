import type {
  OpenCashierAlipayProviderConfig,
  OpenCashierStripeProviderConfig
} from "@opencashier/sdk";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { config as loadEnv } from "dotenv";

loadEnv({ path: resolve(process.cwd(), ".env"), quiet: true });
loadEnv({ path: resolve(process.cwd(), ".env.local"), override: true, quiet: true });

type QuickstartProviderGroupKey = "alipay" | "stripe";

type QuickstartProviderConfigByGroup = {
  alipay: OpenCashierAlipayProviderConfig;
  stripe: OpenCashierStripeProviderConfig;
};

type QuickstartProviderSetupEntry =
  | {
      group: "alipay";
      config: QuickstartProviderConfigByGroup["alipay"];
    }
  | {
      group: "stripe";
      config: QuickstartProviderConfigByGroup["stripe"];
    };

export type ProviderSetupConfig =
  | {
      enabled: false;
    }
  | ({
      enabled: true;
      configFile?: string;
    } & QuickstartProviderSetupEntry);

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
  const port = Number(process.env.PORT ?? "4100");

  if (!Number.isInteger(port) || port <= 0) {
    throw new Error("PORT must be a positive integer");
  }

  const appBaseUrl = process.env.APP_BASE_URL ?? `http://127.0.0.1:${port}`;

  return {
    port,
    appBaseUrl,
    apiBaseUrl:
      process.env.OPENCASHIER_API_BASE_URL ?? "http://127.0.0.1:3000/api/v1",
    appId: process.env.OPENCASHIER_APP_ID ?? "demo_app",
    appSecret: process.env.OPENCASHIER_APP_SECRET ?? "demo_app_secret",
    notifyUrl:
      process.env.OPENCASHIER_NOTIFY_URL ?? `${appBaseUrl}/notify/opencashier`,
    allowedChannels: (process.env.OPENCASHIER_ALLOWED_CHANNELS ?? "alipay_page").split(
      ","
    ),
    adminUsername: process.env.OPENCASHIER_ADMIN_USERNAME,
    adminPassword: process.env.OPENCASHIER_ADMIN_PASSWORD,
    providerSetup: loadProviderSetupConfig()
  };
}

function loadProviderSetupConfig(): ProviderSetupConfig {
  if (process.env.OPENCASHIER_BOOTSTRAP_PROVIDER_CONFIG !== "1") {
    return {
      enabled: false
    };
  }

  const fileConfig = readProviderConfigFile(process.env.OPENCASHIER_PROVIDER_CONFIG_FILE);
  const group = assertProviderGroupKey(requireEnv("OPENCASHIER_PROVIDER_GROUP"));
  const providerValue = {
    ...(fileConfig?.value ?? {}),
    ...readGroupValueFromEnv(group)
  };
  const base = {
    enabled: true as const,
    ...(fileConfig?.path ? { configFile: fileConfig.path } : {})
  };

  switch (group) {
    case "alipay":
      return {
        ...base,
        group,
        config: toAlipayProviderConfig(providerValue)
      };
    case "stripe":
      return {
        ...base,
        group,
        config: {
          secretKey: requireValue(providerValue, "STRIPE_SECRET_KEY"),
          webhookSecret: requireValue(providerValue, "STRIPE_WEBHOOK_SECRET")
        }
      };
    default:
      throw new Error(`Unsupported provider group: ${String(group)}`);
  }
}

function readProviderConfigFile(
  filename: string | undefined
):
  | {
      path: string;
      value: Record<string, string>;
    }
  | undefined {
  if (!filename) {
    return undefined;
  }

  const path = resolve(process.cwd(), filename);
  const value = JSON.parse(readFileSync(path, "utf8")) as Record<string, string>;

  return {
    path,
    value
  };
}

function readGroupValueFromEnv(
  groupKey: QuickstartProviderGroupKey
): Record<string, string> {
  return PROVIDER_FIELD_KEYS[groupKey].reduce<Record<string, string>>(
    (result, fieldKey) => {
      const value = process.env[fieldKey];

      if (value !== undefined) {
        result[fieldKey] = value;
      }

      return result;
    },
    {}
  );
}

function assertProviderGroupKey(value: string): QuickstartProviderGroupKey {
  if (value === "alipay" || value === "stripe") {
    return value;
  }

  throw new Error(
    `Unsupported OPENCASHIER_PROVIDER_GROUP: ${value}. Use one of alipay, stripe.`
  );
}

function toAlipayProviderConfig(
  value: Record<string, string>
): QuickstartProviderConfigByGroup["alipay"] {
  const productCapabilities = value.ALIPAY_PRODUCT_CAPABILITIES?.split(",") as
    | ("QR" | "PAGE" | "WAP")[]
    | undefined;

  if (value.ALIPAY_AUTH_MODE === "CERT") {
    return {
      appId: requireValue(value, "ALIPAY_APP_ID"),
      privateKey: requireValue(value, "ALIPAY_PRIVATE_KEY"),
      gateway: requireValue(value, "ALIPAY_GATEWAY"),
      authMode: "CERT",
      ...(productCapabilities ? { productCapabilities } : {}),
      appCert: requireValue(value, "ALIPAY_APP_CERT"),
      publicCert: requireValue(value, "ALIPAY_PUBLIC_CERT"),
      rootCert: requireValue(value, "ALIPAY_ROOT_CERT")
    };
  }

  return {
    appId: requireValue(value, "ALIPAY_APP_ID"),
    privateKey: requireValue(value, "ALIPAY_PRIVATE_KEY"),
    gateway: requireValue(value, "ALIPAY_GATEWAY"),
    ...(value.ALIPAY_AUTH_MODE === "KEY" ? { authMode: "KEY" as const } : {}),
    ...(productCapabilities ? { productCapabilities } : {}),
    ...(value.ALIPAY_PUBLIC_KEY ? { publicKey: value.ALIPAY_PUBLIC_KEY } : {})
  };
}

function requireEnv(key: string): string {
  const value = process.env[key];

  if (!value) {
    throw new Error(`Missing ${key}`);
  }

  return value;
}

function requireValue(value: Record<string, string>, key: string): string {
  if (!value[key]) {
    throw new Error(`Missing provider config field: ${key}`);
  }

  return value[key];
}

const PROVIDER_FIELD_KEYS: Record<QuickstartProviderGroupKey, string[]> = {
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
  stripe: ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"]
};
