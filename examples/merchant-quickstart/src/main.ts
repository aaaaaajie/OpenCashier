import { loadConfig, type QuickstartConfig } from "./config";
import { OpenCashierApiError, OpenCashierClient } from "./opencashier-client";
import { startServer } from "./server";

async function main(): Promise<void> {
  const config = loadConfig();

  await bootstrapProviderConfig(config);
  startServer(config);
}

async function bootstrapProviderConfig(
  config: QuickstartConfig
): Promise<void> {
  if (!config.providerSetup.enabled) {
    console.log(
      "Provider bootstrap skipped because OPENCASHIER_BOOTSTRAP_PROVIDER_CONFIG=0."
    );
    return;
  }

  if (!config.providerSetup.groupKey) {
    throw new Error(
      "Missing OPENCASHIER_PROVIDER_GROUP. The quickstart cannot choose a provider config group."
    );
  }

  if (!config.adminUsername || !config.adminPassword) {
    throw new Error(
      "Missing OPENCASHIER_ADMIN_USERNAME or OPENCASHIER_ADMIN_PASSWORD for admin API bootstrap."
    );
  }

  if (Object.keys(config.providerSetup.value).length === 0) {
    throw new Error(
      "No provider config values were loaded. Add field values in .env or OPENCASHIER_PROVIDER_CONFIG_FILE."
    );
  }

  const opencashier = new OpenCashierClient({
    apiBaseUrl: config.apiBaseUrl,
    adminUsername: config.adminUsername,
    adminPassword: config.adminPassword
  });
  const validation = await opencashier.setupMerchantProviderConfig({
    appId: config.appId,
    groupKey: config.providerSetup.groupKey,
    value: config.providerSetup.value
  });
  const sourceLabel = config.providerSetup.configFile
    ? ` from ${config.providerSetup.configFile}`
    : "";

  console.log(
    `Provider config ready for ${config.appId}/${config.providerSetup.groupKey}${sourceLabel}: ${validation.message}`
  );
}

function formatBootstrapError(error: unknown): string {
  if (error instanceof OpenCashierApiError) {
    const parts = [error.message];

    if (error.code) {
      parts.push(`code=${error.code}`);
    }

    if (error.requestId) {
      parts.push(`requestId=${error.requestId}`);
    }

    return parts.join(" | ");
  }

  if (error instanceof Error && error.message) {
    return error.message;
  }

  return "provider bootstrap failed";
}

void main().catch((error) => {
  console.error(formatBootstrapError(error));
  process.exit(1);
});
