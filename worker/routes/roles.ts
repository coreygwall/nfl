import { Hono } from "hono";
import type { AppEnv } from "../env.ts";
import { ApiError } from "../errors.ts";
import { grantCommissioner, grantPlatformAdmin, listCommissioners } from "../db.ts";
import { checkPin, currentPool, rolesOf } from "../roles.ts";

export const roleRoutes = new Hono<AppEnv>();

roleRoutes.get("/", async (c) => {
  const pool = await currentPool(c);
  return c.json({ pool: { id: pool.id, slug: pool.slug, name: pool.name }, roles: await rolesOf(c) });
});

/**
 * How the first account gets the keys, and how any account gets them back.
 *
 * The PIN used to *be* the commissioner — typed on every visit, worth as much as every account in
 * the pool, and shared by anyone who needed to help. Now it does one thing once: it attaches both
 * offices to the account that typed it, and that account is the commissioner from then on. Losing
 * your account is still recoverable, because typing it again attaches them to the new one.
 */
roleRoutes.post("/claim", async (c) => {
  const account = c.get("account");
  if (!account) throw new ApiError(401, "NO_PLAYER", "Sign in first, then enter the owner PIN.");
  if (!c.env.ADMIN_PIN) throw new ApiError(503, "ADMIN_DISABLED", "Set the ADMIN_PIN secret to hand out the first set of keys.");
  if (!(await checkPin(c))) throw new ApiError(401, "BAD_PIN", "Wrong PIN");
  const pool = await currentPool(c);
  const now = c.get("now");
  await grantCommissioner(c.env.DB, pool.id, account.id, now, account.id);
  await grantPlatformAdmin(c.env.DB, account.id, now, account.id);
  // The pool has a creator from here on, which is what a pool created in the app would have had.
  if (!pool.createdBy) {
    await c.env.DB.prepare("UPDATE pools SET created_by = ? WHERE id = ? AND created_by IS NULL").bind(account.id, pool.id).run();
  }
  return c.json({
    roles: { commissioner: true, platformAdmin: true },
    pool: { id: pool.id, slug: pool.slug, name: pool.name },
    commissioners: await listCommissioners(c.env.DB, pool.id),
  });
});
