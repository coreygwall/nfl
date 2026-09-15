import { Hono } from "hono";
import type { Context } from "hono";
import type { AppEnv, Env } from "./env.ts";
import { isDev } from "./env.ts";
import { ApiError } from "./errors.ts";
import { getPlayer, getPoolBySlug, playerForToken, publicPlayer } from "./db.ts";
import { hashToken, tokenFromCookie } from "./auth.ts";
import { withAbsoluteUrls, withAppBanner, withUnfurlTags } from "./unfurl.ts";
import { appleAppSiteAssociation } from "./apple.ts";
import { ensureReady, SCHEDULE_VERSION, SEASON, syncResultsFromSource, syncScheduleFromSource } from "./ready.ts";
import { publicRoutes } from "./routes/public.ts";
import { commissionerRoutes } from "./routes/commissioner.ts";
import { leagueRoutes } from "./routes/league.ts";
import { roleRoutes } from "./routes/roles.ts";
import { passkeyRoutes } from "./routes/passkeys.ts";
import { pushRoutes } from "./routes/push.ts";
import { messageRoutes } from "./routes/messages.ts";
import { configFrom } from "./apns.ts";
import { dispatchNotifications } from "./notify.ts";

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
  // Every API response is personal: the board masks picks by who is asking, and bootstrap carries
  // a claim code. None of it carried a cache directive, which leaves an intermediary free to apply
  // its own heuristics and serve one player's board to another. Say no once, here, rather than
  // remembering to on each route.
  c.header("cache-control", "private, no-store");
  c.header("vary", "x-player-token, x-entry-id, cookie");
  c.set("now", resolveNow(c));
  // Identity is the device token alone: a player id is public (it is on the board), a token is not.
  // The header is the app; the cookie is the safety net for a browser that cleared its storage.
  const token = c.req.header("x-player-token") ?? tokenFromCookie(c.req.header("cookie"));
  const found = token ? await playerForToken(c.env.DB, await hashToken(token), c.get("now")) : null;
  c.set("player", found ? publicPlayer(found.player) : null);
  c.set("account", found ? publicPlayer(found.player) : null);
  const entryId = c.req.header("x-entry-id");
  if (found && entryId && entryId !== found.player.id) {
    const owned = await c.env.DB.prepare("SELECT player_id FROM entry_owners WHERE owner_id = ? AND player_id = ?")
      .bind(found.player.id, entryId).first();
    if (!owned) throw new ApiError(403, "ENTRY_FORBIDDEN", "This entry isn't managed by your account.");
    const entry = await getPlayer(c.env.DB, entryId);
    c.set("player", entry ? publicPlayer(entry) : null);
  }
  c.set("deviceId", found?.deviceId ?? null);
  c.set("pool", null);
  c.set("roles", null);
  await next();
});

app.get("/api/health", (c) => c.json({ ok: true, now: c.get("now"), schedule: SCHEDULE_VERSION, build: BUILD_ID }));
app.route("/api", publicRoutes);
app.route("/api/passkeys", passkeyRoutes);
app.route("/api/roles", roleRoutes);
app.route("/api/commissioner", commissionerRoutes);
app.route("/api/league", leagueRoutes);
app.route("/api/push", pushRoutes);
app.route("/api/messages", messageRoutes);

/**
 * A pool installs to a home screen as itself — its name, scoped to its own path — while the bare
 * domain installs as Tally (public/manifest.webmanifest). Generated rather than a second file, so
 * a pool that is renamed or moved does not leave a stale one behind.
 */
app.get("/p/:slug/manifest.webmanifest", async (c) => {
  const slug = c.req.param("slug");
  const poolName = (await poolNameFor(c.env, slug)) ?? c.env.POOL_TYPE ?? "High Five";
  return c.json({
    name: `${poolName} — a ${c.env.APP_NAME || "Tally"} pool`,
    short_name: poolName,
    start_url: `/p/${slug}`,
    scope: `/p/${slug}`,
    display: "standalone",
    background_color: "#F6F1E8",
    theme_color: "#F6F1E8",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
      { src: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
  });
});

/**
 * Apple fetches this from the domain to let the iOS app share the site's passkeys and open pool
 * links. It has to be real JSON at exactly this path with no redirect, which is why it is a route
 * rather than a static file: the assets handler would otherwise answer it with the app's HTML.
 */
const AASA_PATHS = ["/.well-known/apple-app-site-association", "/apple-app-site-association"];
for (const path of AASA_PATHS) {
  app.get(path, (c) => {
    c.header("cache-control", "public, max-age=3600");
    return c.json(appleAppSiteAssociation(c.env.APPLE_APP_IDS));
  });
}

/**
 * The name the commissioner gave the pool, which is the one the share card, the tab and the home
 * screen icon should all say. It is a primary-key read on a page load rather than an API poll, so
 * it costs a row once per visit; a deployment whose database has not been touched yet falls back
 * to its configured name.
 */
async function poolNameFor(env: Env, slug: string): Promise<string | null> {
  try {
    const pool = await getPoolBySlug(env.DB, slug);
    return pool?.name ?? env.POOL_NAME ?? null;
  } catch {
    return env.POOL_NAME ?? null;
  }
}

/** Page routes that used to live at the root, before the pool moved under /p/<slug>. */
const MOVED = ["/welcome", "/rules", "/admin", "/commissioner", "/league", "/board", "/week"];

app.notFound(async (c) => {
  const path = c.req.path;
  if (path.startsWith("/api/")) {
    return c.json({ error: { code: "NOT_FOUND", message: "No such endpoint" } }, 404);
  }
  const slug = c.env.POOL_SLUG || "high-five";
  const appName = c.env.APP_NAME || "Tally";
  const poolType = c.env.POOL_TYPE || "High Five";
  const url = new URL(c.req.url);

  // Old links — texted, bookmarked, still in someone's history — land where the pool lives now.
  if (MOVED.some((p) => path === p || path.startsWith(`${p}/`))) {
    url.pathname = `/p/${slug}${path}`;
    return c.redirect(url.toString(), 301);
  }

  if (!c.env.ASSETS) return c.text("Not found", 404);

  // One document, two faces: / is Tally's landing page, /p/<slug> is a pool, and the app reads
  // which it is from the path. Only the tags differ.
  const isPool = path === "/p" || path.startsWith("/p/");
  if (isPool || path === "/") {
    const poolName = (isPool ? await poolNameFor(c.env, path.split("/")[2] ?? slug) : null) ?? poolType;
    const doc = await c.env.ASSETS.fetch(new Request(new URL("/index.html", url.origin), { headers: c.req.raw.headers }));
    if (!doc.ok) return doc;
    const page = new Response(doc.body, doc);
    const tagged = isPool
      ? withUnfurlTags(page, url.origin, { appName, poolName, poolType, slug })
      : withAbsoluteUrls(page, url.origin);
    return withAppBanner(tagged, c.env.APPLE_APP_STORE_ID, url.toString());
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

/** Games are only accepted this long after kickoff when nobody is watching the run. */
const UNATTENDED_MIN_ELAPSED_HOURS = 3.5;

/** The daily schedule sync; every other firing is looking for finished games. */
const SCHEDULE_CRON = "0 10 * * *";

const handler: ExportedHandler<Env> = {
  fetch: app.fetch,
  scheduled(event, env, ctx) {
    ctx.waitUntil(
      (async () => {
        await ensureReady(env);
        // Once a day: flexed kickoff times, so the locks stay honest all season.
        if (event.cron === SCHEDULE_CRON) {
          const schedule = await syncScheduleFromSource(env.DB);
          console.log("schedule sync", JSON.stringify(schedule));
        }
        // Through the game windows: fill in results the commissioner has not entered. It costs
        // nothing to run often — with nothing finished and unrecorded it never leaves the database.
        const now = new Date().toISOString();
        const results = await syncResultsFromSource(env.DB, now, {
          minElapsedHours: UNATTENDED_MIN_ELAPSED_HOURS,
        });
        console.log("results sync", JSON.stringify(results));
        // Straight after, so a result that has just landed is already in the database when we work
        // out whether a slate is over. Every message is claimed before it is sent, so a firing that
        // finds nothing new says nothing.
        const pushed = await dispatchNotifications(env, SEASON, now, configFrom(env));
        if (pushed.sent || pushed.retired || pushed.skipped) console.log("notifications", JSON.stringify(pushed));
      })(),
    );
  },
};

export default handler;
