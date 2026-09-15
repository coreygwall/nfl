import { noteServerNow, nowOverride } from "../lib/clock.ts";
import { loadPlayer } from "../lib/identity.ts";

/** A request the server has not answered in this long is not going to be answered. */
// A pool doorway that fails clearly after twelve seconds is recoverable. Forty seconds of loader
// (the old 20-second deadline plus a retry) looks indistinguishable from a broken shared link.
const REQUEST_TIMEOUT_MS = 12_000;

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

/**
 * Who this request is from. Shared with the handful of fetches that want a file rather than JSON,
 * so a download carries exactly the identity every other call does.
 */
export function authHeaders(init: Pick<ApiInit, "pin" | "token"> = {}): Record<string, string> {
  const headers: Record<string, string> = { accept: "application/json" };
  const token = init.token ?? loadPlayer()?.token;
  if (token) headers["x-player-token"] = token;
  const active = loadPlayer();
  if (active?.accountId && (!init.token || init.token === active.token)) headers["x-entry-id"] = active.id;
  if (init.pin) headers["x-admin-pin"] = init.pin;
  return headers;
}

export async function api<T>(path: string, init: ApiInit = {}): Promise<T> {
  const url = new URL(`/api${path}`, window.location.origin);
  const override = nowOverride();
  if (override) url.searchParams.set("now", override);
  const headers = authHeaders(init);
  if (init.body !== undefined) headers["content-type"] = "application/json";
  // Nothing here is worth waiting on forever. Without a deadline a hung request leaves the lock
  // button disabled and "Saving…" on screen with no way out but a reload — and the request can
  // still land afterwards, writing picks the person believed abandoned. The app already tells a
  // timeout and a dead network apart in its copy; now it can tell them apart in fact.
  const signal = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(url, {
      method: init.method ?? (init.body !== undefined ? "POST" : "GET"),
      headers,
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      signal,
    });
  } catch (err) {
    const timedOut = err instanceof DOMException && err.name === "TimeoutError";
    throw timedOut
      ? new ApiClientError(0, "TIMEOUT", "That took too long. Check your connection and try again.")
      : new ApiClientError(0, "NETWORK", "Can't reach the pool right now. Check your connection.");
  }
  const data = (await res.json().catch(() => ({}))) as { now?: string; error?: { code?: string; message?: string; details?: unknown } };
  if (!res.ok) {
    throw new ApiClientError(res.status, data.error?.code ?? "HTTP", data.error?.message ?? res.statusText, data.error?.details);
  }
  if (typeof data.now === "string") noteServerNow(data.now);
  return data as T;
}
