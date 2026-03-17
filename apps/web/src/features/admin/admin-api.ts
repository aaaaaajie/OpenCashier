import { getApiBaseUrl } from "../../config/runtime-config";

export const ADMIN_SESSION_INVALID_EVENT = "opencashier:admin-session-invalid";

interface ApiEnvelope<T> {
  code: string;
  message: string;
  requestId: string;
  data: T;
}

export class AdminApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "AdminApiError";
    this.status = status;
  }
}

export async function fetchAdminJson<T>(
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const headers = new Headers(init.headers);

  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(`${getApiBaseUrl()}${path}`, {
    ...init,
    headers,
    credentials: "include"
  });

  const payload = (await readEnvelope<T>(response)) ?? {
    message: `Request failed with status ${response.status}`,
    data: null as T
  };

  if (response.status === 401) {
    window.dispatchEvent(new Event(ADMIN_SESSION_INVALID_EVENT));
  }

  if (!response.ok) {
    throw new AdminApiError(payload.message, response.status);
  }

  return payload.data;
}

async function readEnvelope<T>(
  response: Response
): Promise<ApiEnvelope<T> | null> {
  try {
    return (await response.json()) as ApiEnvelope<T>;
  } catch {
    return null;
  }
}
