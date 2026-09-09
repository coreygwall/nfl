import { Hono } from "hono";
import type { Context } from "hono";
import type { AppEnv } from "./env.ts";
import { isDev } from "./env.ts";
import { ApiError } from "./errors.ts";
import { getPlayer, publicPlayer } from "./db.ts";
import { ensureReady, SCHEDULE_VERSION } from "./ready.ts";
import { publicRoutes } from "./routes/public.ts";
import { adminRoutes } from "./routes/admin.ts";

function resolveNow(c: Context<AppEnv>): string {
  if (isDev(c.env)) {
    const override = c.req.query("now");
    if (override) {
      const t = Date.parse(override);
      if (!Number.isNaN(t)) return new Date(t).toISOString();
    }
  }
  return new Date().toISOString();
}

const app = new Hono<AppEnv>();

app.use("/api/*", async (c, next) => {
  await ensureReady(c.env);
  c.set("now", resolveNow(c));
  const playerId = c.req.header("x-player-id");
  const player = playerId ? await getPlayer(c.env.DB, playerId) : null;
  c.set("player", player ? publicPlayer(player) : null);
  await next();
});

app.get("/api/health", (c) => c.json({ ok: true, now: c.get("now"), schedule: SCHEDULE_VERSION }));
app.route("/api", publicRoutes);
app.route("/api/admin", adminRoutes);

app.notFound(async (c) => {
  if (c.req.path.startsWith("/api/")) {
    return c.json({ error: { code: "NOT_FOUND", message: "No such endpoint" } }, 404);
  }
  if (c.env.ASSETS) return c.env.ASSETS.fetch(c.req.raw);
  return c.text("Not found", 404);
});

app.onError((err, c) => {
  if (err instanceof ApiError) {
    return c.json({ error: { code: err.code, message: err.message, ...(err.details !== undefined ? { details: err.details } : {}) } }, err.status as 400);
  }
  console.error(err);
  return c.json({ error: { code: "INTERNAL", message: "Something went wrong" } }, 500);
});

export default app;
