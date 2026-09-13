import { Hono } from "hono";
import type { AppEnv } from "../env.ts";
import { badRequest } from "../errors.ts";
import { deletePushToken, savePushToken } from "../db.ts";

/**
 * Where the app says "you can reach me here".
 *
 * Registration is deliberately idempotent and cheap: the app calls it on every launch, because an
 * APNs token can change without warning and a stale one is a silently missing notification. The
 * token is scoped to whoever the request is authenticated as, so signing out and back in as
 * someone else moves the phone's notifications with it.
 */
export const pushRoutes = new Hono<AppEnv>();

/** APNs device tokens are 32 bytes of hex today, but Apple has changed the length before. */
const TOKEN = /^[0-9a-fA-F]{32,200}$/;

interface RegisterBody {
  token?: unknown;
  environment?: unknown;
  prefs?: unknown;
  appVersion?: unknown;
}

pushRoutes.post("/", async (c) => {
  const player = c.get("player");
  const account = c.get("account");
  if (!player && !account) throw badRequest("NO_PLAYER", "Sign in before turning on notifications.");

  const body = (await c.req.json().catch(() => ({}))) as RegisterBody;
  const token = typeof body.token === "string" ? body.token.trim() : "";
  if (!TOKEN.test(token)) throw badRequest("BAD_TOKEN", "That is not a device token.");
  // A build signed for development can only be reached on Apple's sandbox host and a release build
  // only on the production one. The app knows which it is; we cannot tell from here.
  const environment = body.environment === "sandbox" ? "sandbox" : "production";
  const prefs =
    body.prefs && typeof body.prefs === "object" && !Array.isArray(body.prefs)
      ? Object.fromEntries(Object.entries(body.prefs as Record<string, unknown>).map(([k, v]) => [k, v !== false]))
      : {};

  await savePushToken(
    c.env.DB,
    {
      token,
      environment,
      accountId: account?.id ?? null,
      // With an account signed in, entries are resolved through it at send time, so that adding an
      // entry on the website starts notifying the phone without the app having to hear about it.
      playerId: account ? null : (player?.id ?? null),
      prefs,
      appVersion: typeof body.appVersion === "string" ? body.appVersion.slice(0, 40) : null,
    },
    c.get("now"),
  );
  return c.json({ ok: true });
});

/** Turning notifications off, or signing out. Unknown tokens are not an error. */
pushRoutes.delete("/", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as RegisterBody;
  const token = typeof body.token === "string" ? body.token.trim() : "";
  if (!TOKEN.test(token)) throw badRequest("BAD_TOKEN", "That is not a device token.");
  await deletePushToken(c.env.DB, token);
  return c.json({ ok: true });
});
