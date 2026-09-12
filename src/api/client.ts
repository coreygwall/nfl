import { noteServerNow, nowOverride } from "../lib/clock.ts";
import { loadPlayer } from "../lib/identity.ts";

export class ApiClientError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export interface ApiInit {
  method?: string;
  body?: unknown;
  pin?: string;
  /** Act as a specific identity rather than the active one (switching, or right after claiming). */
  token?: string;
}

export async function api<T>(path: string, init: ApiInit = {}): Promise<T> {
  const url = new URL(`/api${path}`, window.location.origin);
  const override = nowOverride();
  if (override) url.searchParams.set("now", override);
  const headers: Record<string, string> = { accept: "application/json" };
  if (init.body !== undefined) headers["content-type"] = "application/json";
  const token = init.token ?? loadPlayer()?.token;
  if (token) headers["x-player-token"] = token;
  const active = loadPlayer();
  if (active?.accountId && (!init.token || init.token === active.token)) headers["x-entry-id"] = active.id;
  if (init.pin) headers["x-admin-pin"] = init.pin;
  let res: Response;
  try {
    res = await fetch(url, {
      method: init.method ?? (init.body !== undefined ? "POST" : "GET"),
      headers,
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    });
  } catch {
    throw new ApiClientError(0, "NETWORK", "Can't reach the pool right now. Check your connection.");
  }
  const data = (await res.json().catch(() => ({}))) as { now?: string; error?: { code?: string; message?: string; details?: unknown } };
  if (!res.ok) {
    throw new ApiClientError(res.status, data.error?.code ?? "HTTP", data.error?.message ?? res.statusText, data.error?.details);
  }
  if (typeof data.now === "string") noteServerNow(data.now);
  return data as T;
}
