import { OpenCashierProvidersResource } from "./core/resources/providers";
import { OpenCashierOrdersResource } from "./core/resources/orders";
import { OpenCashierRefundsResource } from "./core/resources/refunds";
import { OpenCashierRequester } from "./core/requester";
import type {
  OpenCashierAdminCredentials,
  OpenCashierClientConfig,
  OpenCashierClientCreateConfig,
  OpenCashierMerchantCredentials,
  OpenCashierRequestOptions
} from "./core/types";
import { OpenCashierNotifications } from "./node/notifications";
import { createOpenCashierSigner } from "./node/signer";

export class OpenCashierClient {
  readonly orders: OpenCashierOrdersResource;
  readonly refunds: OpenCashierRefundsResource;
  readonly notifications: OpenCashierNotifications;
  readonly providers: OpenCashierProvidersResource;

  private readonly merchantRequester?: OpenCashierRequester;
  private readonly adminRequester?: OpenCashierRequester;
  private readonly merchantCredentials?: OpenCashierMerchantCredentials;

  constructor(config: OpenCashierClientConfig) {
    this.merchantCredentials = resolveMerchantCredentials(config);

    if (this.merchantCredentials) {
      const signer = createOpenCashierSigner({
        appId: this.merchantCredentials.appId,
        appSecret: this.merchantCredentials.appSecret
      });

      this.merchantRequester = new OpenCashierRequester({
        config,
        buildHeaders: (input) =>
          signer.buildHeaders({
            method: input.method,
            path: input.path,
            body: input.body,
            idempotencyKey: input.options?.idempotencyKey,
            requestId: input.options?.requestId,
            headers: mergeHeaders(config.headers, input.options)
          })
      });
    }

    if (config.admin) {
      this.adminRequester = new OpenCashierRequester({
        config,
        buildHeaders: (input) =>
          buildAdminHeaders(config.admin!, {
            body: input.body,
            options: input.options,
            defaultHeaders: config.headers
          })
      });
    }

    this.orders = new OpenCashierOrdersResource(() =>
      this.requireMerchantRequester("orders")
    );
    this.refunds = new OpenCashierRefundsResource(() =>
      this.requireMerchantRequester("refunds")
    );
    this.notifications = new OpenCashierNotifications(() =>
      this.requireMerchantAppSecret()
    );
    this.providers = new OpenCashierProvidersResource(
      () => this.requireAdminRequester(),
      () => this.merchantCredentials?.appId
    );
  }

  static async create(
    config: OpenCashierClientCreateConfig
  ): Promise<OpenCashierClient> {
    const client = new OpenCashierClient(config);

    if (config.providers) {
      await client.providers.setup(config.providers, config.providerSetup);
    }

    return client;
  }

  private requireMerchantRequester(scope: string): OpenCashierRequester {
    if (!this.merchantRequester) {
      throw new Error(
        `OpenCashierClient.${scope} requires merchant credentials. Pass merchant.appId/appSecret or legacy appId/appSecret when creating the client.`
      );
    }

    return this.merchantRequester;
  }

  private requireAdminRequester(): OpenCashierRequester {
    if (!this.adminRequester) {
      throw new Error(
        "OpenCashier provider setup requires admin credentials. Pass admin.username/admin.password when creating the client."
      );
    }

    return this.adminRequester;
  }

  private requireMerchantAppSecret(): string {
    if (!this.merchantCredentials?.appSecret) {
      throw new Error(
        "OpenCashier notification verification requires merchant credentials. Pass merchant.appId/appSecret or legacy appId/appSecret when creating the client."
      );
    }

    return this.merchantCredentials.appSecret;
  }
}

function resolveMerchantCredentials(
  config: OpenCashierClientConfig
): OpenCashierMerchantCredentials | undefined {
  if (config.merchant) {
    return config.merchant;
  }

  if (config.appId && config.appSecret) {
    return {
      appId: config.appId,
      appSecret: config.appSecret
    };
  }

  return undefined;
}

function mergeHeaders(
  defaultHeaders: Record<string, string> | undefined,
  options: OpenCashierRequestOptions | undefined
): Record<string, string> {
  return {
    ...(defaultHeaders ?? {}),
    ...(options?.headers ?? {})
  };
}

function buildAdminHeaders(
  credentials: OpenCashierAdminCredentials,
  input: {
    body?: unknown;
    options?: OpenCashierRequestOptions;
    defaultHeaders?: Record<string, string>;
  }
): Record<string, string> {
  return {
    Accept: "application/json",
    ...(typeof input.body === "undefined"
      ? {}
      : { "Content-Type": "application/json" }),
    ...(input.defaultHeaders ?? {}),
    ...(input.options?.headers ?? {}),
    Authorization: `Basic ${Buffer.from(
      `${credentials.username}:${credentials.password}`
    ).toString("base64")}`,
    ...(input.options?.requestId
      ? { "X-Request-Id": input.options.requestId }
      : {})
  };
}
