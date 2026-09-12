import { Hono } from "hono";
import type { Context } from "hono";
import type { AppEnv, Env } from "./env.ts";
import { isDev } from "./env.ts";
import { ApiError } from "./errors.ts";
import { playerForToken, publicPlayer } from "./db.ts";
import { hashToken } from "./auth.ts";
import { ensureReady, SCHEDULE_VERSION, syncScheduleFromSource } from "./ready.ts";
import { publicRoutes } from "./routes/public.ts";
import { adminRoutes } from "./routes/admin.ts";

/** Injected by Vite at build time (git sha); "dev" when running under the test runner. */
export const BUILD_ID: string = typeof __BUILD_ID__ === "string" ? __BUILD_ID__ : "dev";

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
  // Identity is the device token alone: a player id is public (it is on the board), a token is not.
  const token = c.req.header("x-player-token");
  const player = token ? await playerForToken(c.env.DB, await hashToken(token), c.get("now")) : null;
  c.set("player", player ? publicPlayer(player) : null);
  await next();
});

app.get("/api/health", (c) => c.json({ ok: true, now: c.get("now"), schedule: SCHEDULE_VERSION, build: BUILD_ID }));
app.route("/api", publicRoutes);
app.route("/api/admin", adminRoutes);

app.notFound(async (c) => {
  if (c.req.path.startsWith("/api/")) {
    return c.json({ error: { code: "NOT_FOUND", message: "No such endpoint" } }, 404);
  }
  if (!c.env.ASSETS) return c.text("Not found", 404);
  const res = await c.env.ASSETS.fetch(c.req.raw);
  if (!(res.headers.get("content-type") ?? "").includes("text/html")) return res;
  // Chat apps need absolute URLs to unfurl a link, and we only learn the host at request time.
  const origin = new URL(c.req.url).origin;
  const poolName = c.env.POOL_NAME || "High Five";
  const title = `${poolName} — NFL pool`;
  const absolute = (attr: string) => ({
    element(el: Element) {
      const v = el.getAttribute(attr);
      if (v && v.startsWith("/")) el.setAttribute(attr, origin + v);
    },
  });
  const setContent = (value: string) => ({
    element(el: Element) {
      el.setAttribute("content", value);
    },
  });
  return new HTMLRewriter()
    .on("title", {
      element(el) {
        el.setInnerContent(poolName);
      },
    })
    .on('meta[property="og:site_name"]', setContent(poolName))
    .on('meta[property="og:title"]', setContent(title))
    .on('meta[name="twitter:title"]', setContent(title))
    .on('meta[property="og:url"]', absolute("content"))
    .on('meta[property="og:image"]', absolute("content"))
    .on('meta[name="twitter:image"]', absolute("content"))
    .transform(res);
});

app.onError((err, c) => {
  if (err instanceof ApiError) {
    return c.json({ error: { code: err.code, message: err.message, ...(err.details !== undefined ? { details: err.details } : {}) } }, err.status as 400);
  }
  const text = err instanceof Error ? err.message : String(err);
  // Two submissions racing for the same player, or a name registered a beat earlier: the
  // database refused to double-write. Tell the client to refresh rather than reporting a crash.
  if (/constraint failed|SQLITE_CONSTRAINT/i.test(text)) {
    return c.json({ error: { code: "CONFLICT", message: "That changed a moment ago. Refresh and try again." } }, 409);
  }
  console.error(err);
  return c.json({ error: { code: "INTERNAL", message: "Something went wrong" } }, 500);
});

const handler: ExportedHandler<Env> = {
  fetch: app.fetch,
  // Daily: pull flexed kickoff times from nflverse so locks stay accurate all season.
  scheduled(_event, env, ctx) {
    ctx.waitUntil(
      (async () => {
        await ensureReady(env);
        const result = await syncScheduleFromSource(env.DB);
        console.log("schedule sync", JSON.stringify(result));
      })(),
    );
  },
};

export default handler;
