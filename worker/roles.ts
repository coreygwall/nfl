import type { MiddlewareHandler } from "hono";
import type { AppEnv } from "./env.ts";
import { callerIp } from "./env.ts";
import { ApiError } from "./errors.ts";
import { clearRateLimit, ensurePool, noteRateLimit, rateLimit, rolesFor, NO_ROLES, type PoolRecord, type Roles } from "./db.ts";
import { isLockedOut, lockUntil, MAX_ADMIN_ATTEMPTS, secretEquals } from "./auth.ts";
import { SEASON } from "./ready.ts";

/**
 * There is one pool per deployment today, so it is resolved from the deployment's own settings.
 * The rest of the Worker only ever sees the row, which is the whole point: when pools are created
 * in the app this function reads a slug off the request and nothing downstream changes.
 */
export async function currentPool(c: Parameters<MiddlewareHandler<AppEnv>>[0]): Promise<PoolRecord> {
  const cached = c.get("pool");
  if (cached) return cached;
  const pool = await ensurePool(c.env.DB, {
    slug: c.env.POOL_SLUG || "high-five",
    name: c.env.POOL_NAME || c.env.POOL_TYPE || "High Five",
    type: c.env.POOL_TYPE || "High Five",
    season: SEASON,
    now: c.get("now"),
  });
  c.set("pool", pool);
  return pool;
}

/** The roles of whoever is asking. Always the account: a managed entry inherits nothing. */
export async function rolesOf(c: Parameters<MiddlewareHandler<AppEnv>>[0]): Promise<Roles> {
  const account = c.get("account");
  if (!account) return NO_ROLES;
  const pool = await currentPool(c);
  return rolesFor(c.env.DB, pool.id, account.id);
}

/**
 * The owner's PIN. It is no longer how the commissioner works day to day — that is their account —
 * but it is how the first account gets its roles, and how anyone locked out of theirs gets back
 * in. Guessing is limited per caller, so nobody can lock the owner out by hammering the endpoint.
 */
export async function checkPin(c: Parameters<MiddlewareHandler<AppEnv>>[0]): Promise<boolean> {
  const expected = c.env.ADMIN_PIN;
  const given = c.req.header("x-admin-pin");
  if (!expected || !given) return false;
  const now = c.get("now");
  const key = `admin:${callerIp(c.req.raw.headers)}`;
  const seen = await rateLimit(c.env.DB, key, now);
  if (isLockedOut(seen.resetAt, now)) {
    throw new ApiError(429, "PIN_LOCKED", "Too many wrong PINs. Try again in a few minutes.");
  }
  if (!secretEquals(given, expected)) {
    const fails = seen.count + 1;
    const locked = fails >= MAX_ADMIN_ATTEMPTS ? lockUntil(now) : null;
    await noteRateLimit(c.env.DB, key, locked ? 0 : fails, locked, now);
    throw new ApiError(401, "BAD_PIN", locked ? "Too many wrong PINs. Try again in a few minutes." : "Wrong PIN");
  }
  if (seen.count > 0) await clearRateLimit(c.env.DB, key);
  return true;
}

const NOT_COMMISSIONER = "Only this pool's commissioner can do that.";
const NOT_PLATFORM = "Results are set by the league office, not by a pool.";

/**
 * A commissioner runs their own pool. A platform admin can stand in — somebody has to be able to
 * help when the commissioner is locked out — and the owner's PIN is the last resort.
 */
export const requireCommissioner: MiddlewareHandler<AppEnv> = async (c, next) => {
  const roles = await rolesOf(c);
  c.set("roles", roles);
  if (!roles.commissioner && !roles.platformAdmin && !(await checkPin(c))) {
    throw new ApiError(c.get("account") ? 403 : 401, "NOT_COMMISSIONER", NOT_COMMISSIONER);
  }
  await next();
};

/** The league office. One authority on who won, above every pool rather than inside one. */
export const requirePlatformAdmin: MiddlewareHandler<AppEnv> = async (c, next) => {
  const roles = await rolesOf(c);
  c.set("roles", roles);
  if (!roles.platformAdmin && !(await checkPin(c))) {
    throw new ApiError(c.get("account") ? 403 : 401, "NOT_PLATFORM_ADMIN", NOT_PLATFORM);
  }
  await next();
};
