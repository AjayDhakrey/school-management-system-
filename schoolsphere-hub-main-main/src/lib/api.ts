// Falls back to the page's own hostname (not a hardcoded "localhost") so the app
// also works when loaded from a phone/other device over the LAN, where
// "localhost" would otherwise resolve to that device instead of the API host.
const API_BASE =
  import.meta.env["VITE_API_URL"] ??
  (import.meta.env.PROD ? "/api" : `http://${window.location.hostname}:4000/api`);

export class ApiError extends Error {
  status: number;
  /** Full JSON error body, when the caller needs more than just the message (e.g. a 409's duplicate-match list). */
  details?: unknown;
  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

let unauthorizedHandler: (() => void) | null = null;
export function onUnauthorized(handler: () => void) {
  unauthorizedHandler = handler;
  return () => {
    if (unauthorizedHandler === handler) unauthorizedHandler = null;
  };
}

function getToken(): string | null {
  const raw = localStorage.getItem("scholaris-auth");
  if (!raw) return null;
  try {
    return (JSON.parse(raw) as { token?: string }).token ?? null;
  } catch {
    localStorage.removeItem("scholaris-auth");
    return null;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getToken();
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
  } catch {
    // fetch() rejects (not an HTTP error) when the API is unreachable, e.g. the
    // backend process isn't running. Surface this as an ApiError so callers show
    // a real message instead of a generic "something went wrong".
    throw new ApiError(0, `Cannot reach the server at ${API_BASE}. Is the backend running?`);
  }

  if (res.status === 401 && token) {
    unauthorizedHandler?.();
    throw new ApiError(401, "Session expired, please sign in again");
  }

  const body = res.status === 204 ? null : await res.json().catch(() => null);

  if (!res.ok) {
    throw new ApiError(res.status, body?.error ?? `Request failed (${res.status})`, body);
  }

  return body as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, data?: unknown) =>
    request<T>(path, { method: "POST", body: JSON.stringify(data ?? {}) }),
  patch: <T>(path: string, data?: unknown) =>
    request<T>(path, { method: "PATCH", body: JSON.stringify(data ?? {}) }),
  put: <T>(path: string, data?: unknown) =>
    request<T>(path, { method: "PUT", body: JSON.stringify(data ?? {}) }),
  delete: <T>(path: string) => request<T>(path, { method: "DELETE" }),
};
