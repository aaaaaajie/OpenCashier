export type QuickstartConfig = {
  port: number;
  appBaseUrl: string;
  apiBaseUrl: string;
  appId: string;
  appSecret: string;
  notifyUrl: string;
  allowedChannels: string[];
};

export function loadConfig(): QuickstartConfig {
  const port = parsePort(process.env.PORT) ?? 4100;
  const appBaseUrl =
    process.env.APP_BASE_URL?.trim().replace(/\/$/, "") ??
    `http://127.0.0.1:${port}`;

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
    allowedChannels: parseAllowedChannels(
      process.env.OPENCASHIER_ALLOWED_CHANNELS
    )
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
