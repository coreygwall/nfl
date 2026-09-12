import { Hono } from "hono";
import type { AppEnv } from "../env.ts";
import { ApiError, badRequest, notFound } from "../errors.ts";
import { nameKey, validateName } from "../../shared/names.ts";
import { codesMatch, generateCode } from "../../shared/codes.ts";
import { hashToken, isLockedOut, lockUntil, MAX_CLAIM_ATTEMPTS, newToken } from "../auth.ts";
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
  publicPlayer,
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
  const [games, players, devices] = await Promise.all([
    listGames(c.env.DB, SEASON),
    listPlayers(c.env.DB),
    deviceCounts(c.env.DB),
  ]);
  if (me) c.executionCtx.waitUntil(touchPlayer(c.env.DB, me.id, now));
  const mine = me ? players.find((p) => p.id === me.id) : null;
  const body: BootstrapResponse = {
    now,
    build: BUILD_ID,
    season: SEASON,
    poolName: c.env.POOL_NAME || "High Five",
    currentWeek: pickWeek(games, now),
    boardWeek: boardWeek(games, now),
    weeks: weekSummaries(games, now),
    players: players.map((p) => ({ ...publicPlayer(p), claimed: (devices.get(p.id) ?? 0) > 0 })),
    me,
    ...(mine?.claimCode ? { myCode: mine.claimCode } : {}),
  };
  return c.json(body);
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
  const token = await issueToken(c.env.DB, player.id, c.get("now"));
  const res: CreatePlayerResponse = { player, created: true, token, code };
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
  const body = (await c.req.json().catch(() => ({}))) as { code?: unknown };

  const held = await countDevices(c.env.DB, player.id);
  if (held === 0) {
    // Unclaimed: first device in wins, and gets a code for the next one.
    const code = player.claimCode ?? generateCode();
    if (!player.claimCode) await setClaimCode(c.env.DB, player.id, code);
    const token = await issueToken(c.env.DB, player.id, now);
    const res: ClaimResponse = { player: publicPlayer(player), token, code };
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
  return c.json(res);
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
  await replacePicks(c.env.DB, me.id, week, result.toWrite, now);
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
