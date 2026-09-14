import type { Player } from "../shared/types.ts";
import type { PoolRecord, Roles } from "./db.ts";

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
  /**
   * Push notifications. APNS_KEY is the contents of the .p8 file downloaded once from the Apple
   * developer portal and is the only secret here — set it with `wrangler secret put APNS_KEY`,
   * never in this repo. The other three are public identifiers and live in wrangler.jsonc. With
   * any of them missing the worker simply sends nothing, which is what a fresh checkout does.
   */
  APNS_KEY?: string;
  APNS_KEY_ID?: string;
  APPLE_TEAM_ID?: string;
  APPLE_BUNDLE_ID?: string;
}

export type AppEnv = {
  Bindings: Env;
  Variables: {
    now: string;
    player: Player | null;
    account: Player | null;
    /** Which device the request authenticated as, for the pick audit trail. */
    deviceId: string | null;
    /** The pool this request is about, resolved once per request by `currentPool`. */
    pool: PoolRecord | null;
    /** What the asking account may do here, filled in by the guards that needed to know. */
    roles: Roles | null;
  };
};

export const isDev = (env: Env): boolean => env.ENVIRONMENT === "dev";

/** Best-effort caller identity for rate limits. Cloudflare sets cf-connecting-ip at the edge. */
export function callerIp(headers: Headers): string {
  return headers.get("cf-connecting-ip") ?? headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}
