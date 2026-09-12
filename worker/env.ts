import type { Player } from "../shared/types.ts";

export interface Env {
  DB: D1Database;
  ASSETS?: Fetcher;
  ADMIN_PIN?: string;
  ENVIRONMENT?: string;
  POOL_NAME?: string;
}

export type AppEnv = {
  Bindings: Env;
  Variables: {
    now: string;
    player: Player | null;
    /** Which device the request authenticated as, for the pick audit trail. */
    deviceId: string | null;
  };
};

export const isDev = (env: Env): boolean => env.ENVIRONMENT === "dev";
