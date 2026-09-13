import type { Player } from "../shared/types.ts";

export interface Env {
  DB: D1Database;
  ASSETS?: Fetcher;
  ADMIN_PIN?: string;
  ENVIRONMENT?: string;
  APP_NAME?: string;
  POOL_TYPE?: string;
  POOL_SLUG?: string;
  POOL_NAME?: string;
  /** Apple app ids (TEAMID.bundle.id, comma-separated) allowed to share passkeys and open pool links. */
  APPLE_APP_IDS?: string;
  /** App Store listing id, which turns on Safari's "Open in the app" banner. */
  APPLE_APP_STORE_ID?: string;
}

export type AppEnv = {
  Bindings: Env;
  Variables: {
    now: string;
    player: Player | null;
    account: Player | null;
    /** Which device the request authenticated as, for the pick audit trail. */
    deviceId: string | null;
  };
};

export const isDev = (env: Env): boolean => env.ENVIRONMENT === "dev";

/** Best-effort caller identity for rate limits. Cloudflare sets cf-connecting-ip at the edge. */
export function callerIp(headers: Headers): string {
  return headers.get("cf-connecting-ip") ?? headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}
