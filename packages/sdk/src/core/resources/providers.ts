import { OpenCashierApiError } from "../errors";
import {
  normalizeProviderSetupInput,
  serializeProviderConfig,
  type OpenCashierProviderConfigByGroup,
  type OpenCashierProviderSetupInput,
  type OpenCashierProviderSetupOptions,
  type OpenCashierProviderSetupResult,
  type OpenCashierProviderValidationResult,
  type ProviderGroupKey
} from "../providers";
import { OpenCashierRequester } from "../requester";

export class OpenCashierProvidersResource {
  constructor(
    private readonly getRequester: () => OpenCashierRequester,
    private readonly getDefaultAppId: () => string | undefined
  ) {}

  async setup(
    input: OpenCashierProviderSetupInput,
    options?: OpenCashierProviderSetupOptions
  ): Promise<OpenCashierProviderSetupResult[]> {
    const entries = normalizeProviderSetupInput(input);
    const results: OpenCashierProviderSetupResult[] = [];

    for (const entry of entries) {
      results.push(
        await this.setupProvider(entry.group, entry.config as never, options)
      );
    }

    return results;
  }

  async setupProvider<K extends ProviderGroupKey>(
    group: K,
    config: OpenCashierProviderConfigByGroup[K],
    options?: OpenCashierProviderSetupOptions
  ): Promise<OpenCashierProviderSetupResult<K>> {
    const requester = this.getRequester();
    const appId = this.resolveAppId(options?.appId);
    const valueRecord = serializeProviderConfig(group, config);
    const validate = options?.validate ?? true;
    const activate = options?.activate ?? true;
    const tolerateValidationFailure = options?.tolerateValidationFailure ?? false;

    await requester.execute<unknown>({
      method: "PUT",
      path: `/admin/merchants/${encodeURIComponent(appId)}/platform-configs`,
      body: {
        key: group,
        value: valueRecord
      }
    });

    let validation: OpenCashierProviderValidationResult | undefined;
    let validationError: string | undefined;

    if (validate) {
      try {
        validation = await requester.execute<OpenCashierProviderValidationResult>({
          method: "POST",
          path: `/admin/merchants/${encodeURIComponent(appId)}/platform-configs/${encodeURIComponent(group)}/validate`,
          body: {
            value: valueRecord
          }
        });

        if (validation.status === "FAILED") {
          validationError = validation.message;

          if (!tolerateValidationFailure) {
            throw new OpenCashierApiError({
              kind: "BUSINESS",
              message: validation.message,
              code: "PROVIDER_CONFIG_VALIDATE_FAILED"
            });
          }
        }
      } catch (error) {
        if (!tolerateValidationFailure) {
          throw error;
        }

        validationError = formatValidationError(error);
      }
    }

    let activated = false;

    if (activate) {
      await requester.execute<unknown>({
        method: "POST",
        path: `/admin/merchants/${encodeURIComponent(appId)}/platform-configs/${encodeURIComponent(group)}/activate`
      });
      activated = true;
    }

    return {
      groupKey: group,
      appId,
      valueRecord,
      ...(validation ? { validation } : {}),
      ...(validationError ? { validationError } : {}),
      activated
    };
  }

  private resolveAppId(appId: string | undefined): string {
    const resolved = appId ?? this.getDefaultAppId();

    if (!resolved) {
      throw new Error(
        "OpenCashier provider setup requires appId. Pass merchant credentials to the client or specify options.appId."
      );
    }

    return resolved;
  }
}

function formatValidationError(error: unknown): string {
  if (error instanceof OpenCashierApiError) {
    return error.message;
  }

  if (error instanceof Error && error.message) {
    return error.message;
  }

  return "provider validation failed";
}
