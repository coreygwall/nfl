import { Hono } from "hono";
import type { AppEnv } from "../env.ts";
import { badRequest } from "../errors.ts";
import { deletePushToken, endLiveActivity, getPushPrefs, saveLiveActivity, savePushPrefs, savePushToken } from "../db.ts";
import { parsePrefs } from "../../shared/notify-prefs.ts";

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
  await savePushToken(
    c.env.DB,
    {
      token,
      environment,
      accountId: account?.id ?? null,
      // With an account signed in, entries are resolved through it at send time, so that adding an
      // entry on the website starts notifying the phone without the app having to hear about it.
      playerId: account ? null : (player?.id ?? null),
      appVersion: typeof body.appVersion === "string" ? body.appVersion.slice(0, 40) : null,
    },
    c.get("now"),
  );
  // Registration says where to reach this install; it deliberately says nothing about what it
  // wants to hear, because it runs on every launch and would reset the switches every time.
  return c.json({ ok: true, prefs: (await getPushPrefs(c.env.DB, token)) ?? {} });
});

/**
 * The switches.
 *
 * Its own endpoint rather than a field on registration, for the reason above: this is written when
 * somebody moves a control, and never as a side effect of opening the app. The whole object is
 * replaced rather than merged — the settings screen holds the complete state and a merge would
 * make an unticked box indistinguishable from a field the client did not send.
 */
pushRoutes.patch("/prefs", async (c) => {
  const player = c.get("player");
  const account = c.get("account");
  if (!player && !account) throw badRequest("NO_PLAYER", "Sign in first.");
  const body = (await c.req.json().catch(() => ({}))) as { token?: unknown; prefs?: unknown };
  const token = typeof body.token === "string" ? body.token.trim() : "";
  if (!TOKEN.test(token)) throw badRequest("BAD_TOKEN", "That is not a device token.");

  const prefs = parsePrefs(body.prefs);
  const saved = await savePushPrefs(c.env.DB, token, prefs, c.get("now"));
  if (!saved) throw badRequest("UNKNOWN_TOKEN", "This device is not registered for notifications.");
  return c.json({ ok: true, prefs });
});

/** What this install has set, so a settings screen draws the truth rather than its own guess. */
pushRoutes.get("/prefs/:token", async (c) => {
  const player = c.get("player");
  const account = c.get("account");
  if (!player && !account) throw badRequest("NO_PLAYER", "Sign in first.");
  const token = c.req.param("token").trim();
  if (!TOKEN.test(token)) throw badRequest("BAD_TOKEN", "That is not a device token.");
  const prefs = await getPushPrefs(c.env.DB, token);
  if (!prefs) throw badRequest("UNKNOWN_TOKEN", "This device is not registered for notifications.");
  return c.json({ prefs });
});

/**
 * Turning notifications off, or signing out. The token is in the path rather than a body because a
 * DELETE with a body is awkward from most clients.
 *
 * It still needs a signed-in caller. An earlier version of this reasoned that a device token is
 * not a secret and stopped there — which is true about confidentiality and says nothing about who
 * is allowed to act on it. Anyone who learned a token could switch off that phone's notifications.
 */
pushRoutes.delete("/:token", async (c) => {
  const player = c.get("player");
  const account = c.get("account");
  if (!player && !account) throw badRequest("NO_PLAYER", "Sign in first.");
  const token = c.req.param("token").trim();
  if (!TOKEN.test(token)) throw badRequest("BAD_TOKEN", "That is not a device token.");
  await deletePushToken(c.env.DB, token);
  return c.json({ ok: true });
});

/**
 * Where the app says "there is a lock screen here, keep it current".
 *
 * ActivityKit hands the app a token some moments after the activity starts, and reissues it
 * without warning, so this is called whenever one arrives rather than once. The entry is taken
 * from the request body rather than from whoever is signed in: one install runs several entries,
 * and each of them has its own lock screen.
 */
pushRoutes.post("/activity", async (c) => {
  const player = c.get("player");
  const account = c.get("account");
  if (!player && !account) throw badRequest("NO_PLAYER", "Sign in first.");

  const body = (await c.req.json().catch(() => ({}))) as {
    token?: unknown;
    environment?: unknown;
    entryId?: unknown;
    week?: unknown;
  };
  const token = typeof body.token === "string" ? body.token.trim() : "";
  if (!TOKEN.test(token)) throw badRequest("BAD_TOKEN", "That is not an activity token.");
  const week = typeof body.week === "number" && Number.isInteger(body.week) ? body.week : 0;
  if (week < 1) throw badRequest("BAD_WEEK", "An activity belongs to a week.");

  // The entry has to be one this caller may speak for. Without the check, a token plus any signed
  // in device could point somebody else's lock screen at this one's week.
  const entryId = typeof body.entryId === "string" ? body.entryId : "";
  const allowed = await entriesFor(c.env.DB, player?.id ?? null, account?.id ?? null);
  if (!entryId || !allowed.has(entryId)) throw badRequest("BAD_ENTRY", "That is not one of your entries.");

  await saveLiveActivity(
    c.env.DB,
    {
      token,
      environment: body.environment === "sandbox" ? "sandbox" : "production",
      playerId: entryId,
      week,
    },
    c.get("now"),
  );
  return c.json({ ok: true });
});

/** The lock screen is gone — dismissed, or the week ended while the app was open. */
pushRoutes.delete("/activity/:token", async (c) => {
  const player = c.get("player");
  const account = c.get("account");
  if (!player && !account) throw badRequest("NO_PLAYER", "Sign in first.");
  const token = c.req.param("token").trim();
  if (!TOKEN.test(token)) throw badRequest("BAD_TOKEN", "That is not an activity token.");
  await endLiveActivity(c.env.DB, token, c.get("now"));
  return c.json({ ok: true });
});

/** The entries this caller may act for: their own row, plus anything their account manages. */
async function entriesFor(
  db: D1Database,
  playerId: string | null,
  accountId: string | null,
): Promise<Set<string>> {
  const ids = new Set<string>();
  if (playerId) ids.add(playerId);
  if (accountId) {
    ids.add(accountId);
    const { results } = await db
      .prepare("SELECT player_id FROM entry_owners WHERE owner_id = ?")
      .bind(accountId)
      .all<{ player_id: string }>();
    for (const r of results) ids.add(r.player_id);
  }
  return ids;
}
