import { Hono } from "hono";
import type { AppEnv } from "../env.ts";
import { ApiError, badRequest } from "../errors.ts";
import { nameKey, validateName } from "../../shared/names.ts";
import { validatePicks } from "../../shared/picks.ts";
import { buildSeasonBoard, buildWeekBoard } from "../../shared/scoring.ts";
import { boardWeek, gameStatus, isLocked, pickWeek, weekSummaries, WEEKS } from "../../shared/week.ts";
import type { Game } from "../../shared/types.ts";
import type {
  BootstrapResponse,
  CreatePlayerResponse,
  GameDTO,
  PutPicksResponse,
  SeasonBoardResponse,
  WeekBoardResponse,
  WeekResponse,
} from "../../shared/api.ts";
import {
  createPlayer,
  findPlayerByKey,
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

export const publicRoutes = new Hono<AppEnv>();

publicRoutes.get("/bootstrap", async (c) => {
  const now = c.get("now");
  const me = c.get("player");
  const [games, players] = await Promise.all([listGames(c.env.DB, SEASON), listPlayers(c.env.DB)]);
  if (me) c.executionCtx.waitUntil(touchPlayer(c.env.DB, me.id, now));
  const body: BootstrapResponse = {
    now,
    build: BUILD_ID,
    season: SEASON,
    poolName: c.env.POOL_NAME || "High Five",
    currentWeek: pickWeek(games, now),
    boardWeek: boardWeek(games, now),
    weeks: weekSummaries(games, now),
    players: players.map(publicPlayer),
    me,
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
  const player = { id: crypto.randomUUID(), name: check.name };
  try {
    await createPlayer(c.env.DB, { ...player, nameKey: key, now: c.get("now") });
  } catch (err) {
    // Lost a race with an identical name: hand back the winner.
    const winner = await findPlayerByKey(c.env.DB, key);
    if (!winner) throw err;
    const res: CreatePlayerResponse = { player: publicPlayer(winner), created: false };
    return c.json(res, 200);
  }
  const res: CreatePlayerResponse = { player, created: true };
  return c.json(res, 201);
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
  if (!me) throw new ApiError(401, "NO_PLAYER", "Pick a name first");
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
