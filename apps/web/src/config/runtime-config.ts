const DEFAULT_API_BASE_URL = "http://localhost:3000/api/v1";

export function getApiBaseUrl(): string {
  const runtimeValue =
    window.__OPENCASHIER_RUNTIME_CONFIG__?.API_BASE_URL?.trim();

  if (runtimeValue) {
    return runtimeValue;
  }

  const buildValue = import.meta.env.VITE_API_BASE_URL?.trim();

  if (buildValue) {
    return buildValue;
  }

  return DEFAULT_API_BASE_URL;
}
