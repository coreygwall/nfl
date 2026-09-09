// Client clock: server-offset corrected, with a dev-only `?now=` override that is also
// forwarded to the API (the Worker only honours it when ENVIRONMENT=dev).
const OVERRIDE_KEY = "nflpool.now";

function readOverride(): string | null {
  try {
    const fromUrl = new URLSearchParams(window.location.search).get("now");
    if (fromUrl) {
      const t = Date.parse(fromUrl);
      if (!Number.isNaN(t)) {
        const iso = new Date(t).toISOString();
        sessionStorage.setItem(OVERRIDE_KEY, iso);
        return iso;
      }
    }
    return sessionStorage.getItem(OVERRIDE_KEY);
  } catch {
    return null;
  }
}

const override = typeof window === "undefined" ? null : readOverride();
let offsetMs = 0;

export const nowOverride = (): string | null => override;

export function noteServerNow(iso: string): void {
  if (override) return;
  const t = Date.parse(iso);
  if (!Number.isNaN(t)) offsetMs = t - Date.now();
}

export function nowMs(): number {
  return override ? Date.parse(override) : Date.now() + offsetMs;
}

export function nowIso(): string {
  return new Date(nowMs()).toISOString();
}
