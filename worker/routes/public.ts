import { Hono } from "hono";
import type { AppEnv } from "../env.ts";
import { callerIp } from "../env.ts";
import { ApiError, badRequest, notFound } from "../errors.ts";
import { nameKey, validateName } from "../../shared/names.ts";
import { codesMatch, generateCode } from "../../shared/codes.ts";
import { clearedSessionCookie, hashToken, isLockedOut, lockUntil, MAX_CLAIM_ATTEMPTS, newToken, sessionCookie } from "../auth.ts";
import { validatePicks } from "../../shared/picks.ts";
import { buildSeasonBoard, buildWeekBoard } from "../../shared/scoring.ts";
import { boardWeek, gameStatus, isLocked, pickWeek, weekSummaries, WEEKS } from "../../shared/week.ts";
import type { Game } from "../../shared/types.ts";
import type {
  BootstrapResponse,
  ClaimResponse,
  CreatePlayerResponse,
  GameDTO,
  PutPicksResponse,
  SeasonBoardResponse,
  WeekBoardResponse,
  WeekResponse,
} from "../../shared/api.ts";
import {
  addDevice,
  clearClaimFailures,
  countPasskeys,
  countDevices,
  countPlayers,
  createPlayer,
  deviceCounts,
  findPlayerByKey,
  getPlayer,
  noteClaimFailure,
  setClaimCode,
  listAllPicks,
  listGames,
  listPicks,
  listPlayers,
  listWeekGames,
  listWeekPicks,
  noteRateLimit,
  publicPlayer,
  rateLimit,
  replacePicks,
  touchPlayer,
} from "../db.ts";
import { SEASON } from "../ready.ts";
import { BUILD_ID } from "../index.ts";

export const toGameDTO = (g: Game, now: string): GameDTO => ({ ...g, locked: isLocked(g, now), status: gameStatus(g, now) });

export function parseWeek(raw: string | undefined): number {
  const week = Number(raw);
  if (!Number.isInteger(week) || week < 1 || week > WEEKS) throw badRequest("BAD_WEEK", `Week must be 1-${WEEKS}`);
  return week;
}

const MAX_PLAYERS = 200;
/** One account picking for its household, not a way to fill the roster from one phone. */
const MAX_ENTRIES = 12;
/**
 * The pool's link gets texted around and posted, so the signup form is open to anyone holding it.
 * The number sits between the two cases that matter: a room full of friends joining over one wifi
 * at kickoff, which must never be turned away, and a script filling all 200 seats before anyone
 * real arrives, which must. Cloudflare sets the address at the edge, so it is the caller's own.
 */
const SIGNUPS_PER_HOUR = 20;
const SIGNUP_WINDOW_MINUTES = 60;

/** Registers a new device for a player and returns the token only this response will carry. */
async function issueToken(db: D1Database, playerId: string, now: string): Promise<string> {
  const token = newToken();
  await addDevice(db, { id: crypto.randomUUID(), playerId, tokenHash: await hashToken(token), now });
  return token;
}

export const publicRoutes = new Hono<AppEnv>();

publicRoutes.get("/bootstrap", async (c) => {
  const now = c.get("now");
  const me = c.get("player");
  const account = c.get("account");
  const [games, players, devices, ownership] = await Promise.all([
    listGames(c.env.DB, SEASON),
    listPlayers(c.env.DB),
    deviceCounts(c.env.DB),
    c.env.DB.prepare("SELECT player_id, owner_id FROM entry_owners").all<{ player_id: string; owner_id: string }>(),
  ]);
  if (me) c.executionCtx.waitUntil(touchPlayer(c.env.DB, me.id, now));
  const mine = account ? players.find((p) => p.id === account.id) : null;
  const managedIds = new Set(ownership.results.map((r) => r.player_id));
  const ids = new Set([account?.id, ...ownership.results.filter((r) => r.owner_id === account?.id).map((r) => r.player_id)]);
  const passkeys = account ? await countPasskeys(c.env.DB, account.id, new URL(c.req.url).hostname) : 0;
  const body: BootstrapResponse = {
    now,
    build: BUILD_ID,
    season: SEASON,
    poolName: c.env.POOL_NAME || "High Five",
    currentWeek: pickWeek(games, now),
    boardWeek: boardWeek(games, now),
    weeks: weekSummaries(games, now),
    players: players.map((p) => ({ ...publicPlayer(p), claimed: (devices.get(p.id) ?? 0) > 0 || managedIds.has(p.id) })),
    me,
    account,
    myEntries: account ? players.filter((p) => ids.has(p.id)).map(publicPlayer) : [],
    ...(mine?.claimCode ? { myCode: mine.claimCode } : {}),
    myPasskeys: passkeys,
  };
  return c.json(body);
});

publicRoutes.post("/entries", async (c) => {
  const account = c.get("account");
  if (!account) throw new ApiError(401, "NO_PLAYER", "Sign in to add an entry.");
  const body = (await c.req.json().catch(() => ({}))) as { name?: unknown };
  const check = validateName(body.name);
  if (!check.ok) throw badRequest("INVALID_NAME", check.message);
  if (await findPlayerByKey(c.env.DB, nameKey(check.name))) {
    throw new ApiError(409, "NAME_TAKEN", "That name is already in the pool. Use a different entry name.");
  }
  if (await countPlayers(c.env.DB) >= MAX_PLAYERS) throw new ApiError(403, "POOL_FULL", "The pool is full.");
  const owned = await c.env.DB.prepare("SELECT count(*) AS n FROM entry_owners WHERE owner_id = ?")
    .bind(account.id)
    .first<{ n: number }>();
  if ((owned?.n ?? 0) >= MAX_ENTRIES) {
    throw new ApiError(403, "TOO_MANY_ENTRIES", `One account can manage ${MAX_ENTRIES} entries. Ask the commissioner if you need more.`);
  }
  const player = { id: crypto.randomUUID(), name: check.name };
  await c.env.DB.batch([
    c.env.DB.prepare("INSERT INTO players (id, name, name_key, created_at, last_seen_at) VALUES (?, ?, ?, ?, ?)")
      .bind(player.id, player.name, nameKey(player.name), c.get("now"), c.get("now")),
    c.env.DB.prepare("INSERT INTO entry_owners (player_id, owner_id) VALUES (?, ?)").bind(player.id, account.id),
  ]);
  return c.json({ player }, 201);
});

publicRoutes.post("/players", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as { name?: unknown };
  const check = validateName(body.name);
  if (!check.ok) throw badRequest("INVALID_NAME", check.message);
  const key = nameKey(check.name);
  const existing = await findPlayerByKey(c.env.DB, key);
  if (existing) {
    const res: CreatePlayerResponse = { player: publicPlayer(existing), created: false };
    return c.json(res, 200);
  }
  if ((await countPlayers(c.env.DB)) >= MAX_PLAYERS) {
    throw new ApiError(403, "POOL_FULL", "The pool is full. Ask the commissioner to make room.");
  }
  const now = c.get("now");
  const limitKey = `signup:${callerIp(c.req.raw.headers)}`;
  const seen = await rateLimit(c.env.DB, limitKey, now);
  if (seen.count >= SIGNUPS_PER_HOUR) {
    throw new ApiError(429, "TOO_MANY_SIGNUPS", "That's a lot of new names from one place. Try again in a bit.");
  }
  const player = { id: crypto.randomUUID(), name: check.name };
  const code = generateCode();
  try {
    await createPlayer(c.env.DB, { ...player, nameKey: key, now: c.get("now"), claimCode: code });
  } catch (err) {
    // Lost a race with an identical name: hand back the winner.
    const winner = await findPlayerByKey(c.env.DB, key);
    if (!winner) throw err;
    const res: CreatePlayerResponse = { player: publicPlayer(winner), created: false };
    return c.json(res, 200);
  }
  await noteRateLimit(
    c.env.DB,
    limitKey,
    seen.count + 1,
    seen.resetAt ?? new Date(Date.parse(now) + SIGNUP_WINDOW_MINUTES * 60_000).toISOString(),
    now,
  );
  const token = await issueToken(c.env.DB, player.id, c.get("now"));
  const res: CreatePlayerResponse = { player, created: true, token, code };
  c.header("set-cookie", sessionCookie(token, c.req.url));
  return c.json(res, 201);
});

/**
 * Claims a name for this device. A name nobody holds yet is claimed on sight — that is how
 * everyone who joined before codes existed, and every new signup, gets their first device —
 * and after that the code is required.
 */
publicRoutes.post("/players/:id/claim", async (c) => {
  const now = c.get("now");
  const player = await getPlayer(c.env.DB, c.req.param("id"));
  if (!player) throw notFound("NO_PLAYER", "That name is not in the pool.");
  if (await c.env.DB.prepare("SELECT player_id FROM entry_owners WHERE player_id = ?").bind(player.id).first()) {
    throw new ApiError(403, "MANAGED_ENTRY", "This entry is managed through its owner's account. Sign in to that account.");
  }
  const body = (await c.req.json().catch(() => ({}))) as { code?: unknown };

  const held = await countDevices(c.env.DB, player.id);
  if (held === 0) {
    // Unclaimed: first device in wins, and gets a code for the next one.
    const code = player.claimCode ?? generateCode();
    if (!player.claimCode) await setClaimCode(c.env.DB, player.id, code);
    const token = await issueToken(c.env.DB, player.id, now);
    const res: ClaimResponse = { player: publicPlayer(player), token, code };
    c.header("set-cookie", sessionCookie(token, c.req.url));
    return c.json(res);
  }

  if (isLockedOut(player.claimLockedUntil, now)) {
    throw new ApiError(429, "CLAIM_LOCKED", "Too many tries. Wait a few minutes or ask the commissioner for a new code.");
  }
  if (!player.claimCode) {
    throw new ApiError(409, "NO_CODE", `${player.name} has no code yet. Ask the commissioner to reset it.`);
  }
  if (!codesMatch(String(body.code ?? ""), player.claimCode)) {
    const attempts = player.claimAttempts + 1;
    const locked = attempts >= MAX_CLAIM_ATTEMPTS ? lockUntil(now) : null;
    await noteClaimFailure(c.env.DB, player.id, locked ? 0 : attempts, locked);
    throw new ApiError(401, "BAD_CODE", "That code doesn't match.");
  }
  await clearClaimFailures(c.env.DB, player.id);
  const token = await issueToken(c.env.DB, player.id, now);
  const res: ClaimResponse = { player: publicPlayer(player), token, code: player.claimCode };
  c.header("set-cookie", sessionCookie(token, c.req.url));
  return c.json(res);
});

/**
 * Points the session cookie at whichever identity this device is currently picking as. One
 * phone can hold several (a parent picking for the family), and the cookie follows the switch.
 */
publicRoutes.post("/session", async (c) => {
  const me = c.get("player");
  if (!me) throw new ApiError(401, "NO_PLAYER", "That sign-in is no longer valid.");
  const token = c.req.header("x-player-token");
  if (token) c.header("set-cookie", sessionCookie(token, c.req.url));
  return c.json({ player: me });
});

publicRoutes.delete("/session", (c) => {
  c.header("set-cookie", clearedSessionCookie(c.req.url));
  return c.json({ ok: true });
});

publicRoutes.get("/weeks/:week", async (c) => {
  const week = parseWeek(c.req.param("week"));
  const now = c.get("now");
  const me = c.get("player");
  const [games, allPicks, myPicks] = await Promise.all([
    listWeekGames(c.env.DB, SEASON, week),
    listWeekPicks(c.env.DB, week),
    me ? listPicks(c.env.DB, me.id, week) : Promise.resolve([]),
  ]);
  const pickCounts: WeekResponse["pickCounts"] = {};
  for (const g of games) {
    if (!isLocked(g, now)) continue;
    const away = allPicks.filter((p) => p.gameId === g.id && p.team === g.away).length;
    const home = allPicks.filter((p) => p.gameId === g.id && p.team === g.home).length;
    pickCounts[g.id] = { away, home };
  }
  const body: WeekResponse = {
    now,
    week,
    games: games.map((g) => toGameDTO(g, now)),
    myPicks,
    pickCounts,
    submitted: new Set(allPicks.map((p) => p.playerId)).size,
  };
  return c.json(body);
});

publicRoutes.put("/weeks/:week/picks", async (c) => {
  const week = parseWeek(c.req.param("week"));
  const now = c.get("now");
  const me = c.get("player");
  if (!me) throw new ApiError(401, "NO_PLAYER", "This device isn't signed in to a name yet.");
  const body = (await c.req.json().catch(() => ({}))) as { picks?: unknown };
  const [games, existing] = await Promise.all([listWeekGames(c.env.DB, SEASON, week), listPicks(c.env.DB, me.id, week)]);
  const result = validatePicks({ submitted: body.picks, games, existing, now });
  if (!result.ok) throw new ApiError(result.error.status, result.error.code, result.error.message, result.error.details);
  await replacePicks(c.env.DB, me.id, week, result.toWrite, now, false, c.get("deviceId"));
  c.executionCtx.waitUntil(touchPlayer(c.env.DB, me.id, now));
  const res: PutPicksResponse = { now, picks: result.final };
  return c.json(res);
});

publicRoutes.get("/board/week/:week", async (c) => {
  const week = parseWeek(c.req.param("week"));
  const now = c.get("now");
  const [games, players, picks] = await Promise.all([
    listWeekGames(c.env.DB, SEASON, week),
    listPlayers(c.env.DB),
    listWeekPicks(c.env.DB, week),
  ]);
  const board = buildWeekBoard({ week, players: players.map(publicPlayer), picks, games, now, requesterId: c.get("player")?.id });
  const res: WeekBoardResponse = { now, ...board };
  return c.json(res);
});

publicRoutes.get("/board/season", async (c) => {
  const now = c.get("now");
  const [games, players, picks] = await Promise.all([listGames(c.env.DB, SEASON), listPlayers(c.env.DB), listAllPicks(c.env.DB)]);
  const board = buildSeasonBoard({ season: SEASON, players: players.map(publicPlayer), picks, games, now, requesterId: c.get("player")?.id });
  const res: SeasonBoardResponse = { now, ...board };
  return c.json(res);
});
