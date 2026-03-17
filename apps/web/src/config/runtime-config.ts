const DEFAULT_API_BASE_URL = "http://localhost:3000/api/v1";
const LOCAL_DEV_API_BASE_URL = "/api/v1";
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0"]);

export function getApiBaseUrl(): string {
  const runtimeValue = normalizeApiBaseUrl(
    window.__OPENCASHIER_RUNTIME_CONFIG__?.API_BASE_URL
  );

  if (runtimeValue) {
    return runtimeValue;
  }

  const buildValue = normalizeApiBaseUrl(import.meta.env.VITE_API_BASE_URL);

  if (buildValue) {
    return buildValue;
  }

  return normalizeApiBaseUrl(DEFAULT_API_BASE_URL) ?? DEFAULT_API_BASE_URL;
}

function normalizeApiBaseUrl(value: string | undefined): string | null {
  const normalized = value?.trim().replace(/\/$/, "");

  if (!normalized) {
    return null;
  }

  if (shouldUseLocalApiProxy(normalized)) {
    return getLocalApiProxyPath(normalized);
  }

  return normalized;
}

function shouldUseLocalApiProxy(apiBaseUrl: string): boolean {
  if (!import.meta.env.DEV || typeof window === "undefined") {
    return false;
  }

  if (apiBaseUrl.startsWith("/")) {
    return true;
  }

  try {
    const currentUrl = new URL(window.location.href);
    const targetUrl = new URL(apiBaseUrl);

    return (
      isLocalHost(currentUrl.hostname) &&
      isLocalHost(targetUrl.hostname) &&
      currentUrl.origin !== targetUrl.origin
    );
  } catch {
    return false;
  }
}

function getLocalApiProxyPath(apiBaseUrl: string): string {
  if (apiBaseUrl.startsWith("/")) {
    return apiBaseUrl;
  }

  try {
    const targetUrl = new URL(apiBaseUrl);
    return targetUrl.pathname.replace(/\/$/, "") || LOCAL_DEV_API_BASE_URL;
  } catch {
    return LOCAL_DEV_API_BASE_URL;
  }
}

function isLocalHost(hostname: string): boolean {
  return LOCAL_HOSTS.has(hostname.toLowerCase());
}
