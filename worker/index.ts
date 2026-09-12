import { Hono } from "hono";
import type { Context } from "hono";
import type { AppEnv, Env } from "./env.ts";
import { isDev } from "./env.ts";
import { ApiError } from "./errors.ts";
import { playerForToken, publicPlayer } from "./db.ts";
import { hashToken, tokenFromCookie } from "./auth.ts";
import { withAbsoluteUrls, withUnfurlTags } from "./unfurl.ts";
import { ensureReady, SCHEDULE_VERSION, syncScheduleFromSource } from "./ready.ts";
import { publicRoutes } from "./routes/public.ts";
import { adminRoutes } from "./routes/admin.ts";
import { passkeyRoutes } from "./routes/passkeys.ts";

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
  // The header is the app; the cookie is the safety net for a browser that cleared its storage.
  const token = c.req.header("x-player-token") ?? tokenFromCookie(c.req.header("cookie"));
  const found = token ? await playerForToken(c.env.DB, await hashToken(token), c.get("now")) : null;
  c.set("player", found ? publicPlayer(found.player) : null);
  c.set("deviceId", found?.deviceId ?? null);
  await next();
});

app.get("/api/health", (c) => c.json({ ok: true, now: c.get("now"), schedule: SCHEDULE_VERSION, build: BUILD_ID }));
app.route("/api", publicRoutes);
app.route("/api/passkeys", passkeyRoutes);
app.route("/api/admin", adminRoutes);

/** Page routes that used to live at the root, before the pool moved under /p/<slug>. */
const MOVED = ["/welcome", "/rules", "/admin", "/board", "/week"];

app.notFound(async (c) => {
  const path = c.req.path;
  if (path.startsWith("/api/")) {
    return c.json({ error: { code: "NOT_FOUND", message: "No such endpoint" } }, 404);
  }
  const slug = c.env.POOL_SLUG || "high-five";
  const appName = c.env.APP_NAME || "Tally";
  const poolName = c.env.POOL_NAME || "High Five";
  const url = new URL(c.req.url);

  // Old links — texted, bookmarked, still in someone's history — land where the pool lives now.
  if (MOVED.some((p) => path === p || path.startsWith(`${p}/`))) {
    url.pathname = `/p/${slug}${path}`;
    return c.redirect(url.toString(), 301);
  }

  if (!c.env.ASSETS) return c.text("Not found", 404);

  // Everything under /p/ is the pool app; / is the Tally landing page.
  const isPool = path === "/p" || path.startsWith("/p/");
  if (isPool) {
    const assetUrl = new URL("/index.html", url.origin);
    const res = await c.env.ASSETS.fetch(new Request(assetUrl, { headers: c.req.raw.headers }));
    if (!res.ok) return res;
    return withUnfurlTags(new Response(res.body, res), url.origin, poolName, appName);
  }

  // The Tally landing page: its own file, its own copy, only the URLs need absolving.
  if (path === "/") {
    const landing = await c.env.ASSETS.fetch(new Request(new URL("/landing.html", url.origin), { headers: c.req.raw.headers }));
    return landing.ok ? withAbsoluteUrls(new Response(landing.body, landing), url.origin) : landing;
  }
  const res = await c.env.ASSETS.fetch(c.req.raw);
  if (!(res.headers.get("content-type") ?? "").includes("text/html")) return res;
  return withAbsoluteUrls(res, url.origin);
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
