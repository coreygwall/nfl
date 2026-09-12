import { Hono } from "hono";
import type { AppEnv } from "../env.ts";
import { ApiError, badRequest, notFound } from "../errors.ts";
import { nameKey, validateName } from "../../shared/names.ts";
import { validatePicks } from "../../shared/picks.ts";
import { isAbbr } from "../../shared/teams.ts";
import type { Winner } from "../../shared/types.ts";
import type { AdminPlayersResponse, AdminWeekResponse } from "../../shared/api.ts";
import {
  deletePlayer,
  findPlayerByKey,
  getGame,
  getMeta,
  getPlayer,
  listAllPicks,
  listGames,
  listPicks,
  listPlayers,
  listWeekGames,
  listWeekPicks,
  playerStats,
  publicPlayer,
  renamePlayer,
  replacePicks,
  setResult,
} from "../db.ts";
import { SCHEDULE_VERSION, SEASON, syncResultsFromSource, syncSchedule, syncScheduleFromSource } from "../ready.ts";
import { BUILD_ID } from "../index.ts";
import { parseWeek, toGameDTO } from "./public.ts";

export const adminRoutes = new Hono<AppEnv>();

adminRoutes.use("*", async (c, next) => {
  const expected = c.env.ADMIN_PIN;
  if (!expected) throw new ApiError(503, "ADMIN_DISABLED", "Set the ADMIN_PIN secret to enable admin");
  const given = c.req.header("x-admin-pin") ?? "";
  if (given !== expected) throw new ApiError(401, "BAD_PIN", "Wrong PIN");
  await next();
});

adminRoutes.post("/verify", (c) => c.json({ ok: true }));

adminRoutes.get("/weeks/:week", async (c) => {
  const week = parseWeek(c.req.param("week"));
  const now = c.get("now");
  const [games, picks, players] = await Promise.all([
    listWeekGames(c.env.DB, SEASON, week),
    listWeekPicks(c.env.DB, week),
    listPlayers(c.env.DB),
  ]);
  const names = new Map(players.map((p) => [p.id, p.name]));
  const body: AdminWeekResponse = {
    now,
    week,
    games: games.map((g) => ({
      ...toGameDTO(g, now),
      picks: picks
        .filter((p) => p.gameId === g.id)
        .map((p) => ({ playerId: p.playerId, name: names.get(p.playerId) ?? "?", team: p.team, rank: p.rank })),
    })),
    players: players.map(publicPlayer),
  };
  return c.json(body);
});

adminRoutes.put("/games/:id/result", async (c) => {
  const game = await getGame(c.env.DB, c.req.param("id"));
  if (!game) throw notFound("NO_GAME", "No such game");
  const body = (await c.req.json().catch(() => ({}))) as { winner?: unknown; awayScore?: unknown; homeScore?: unknown };
  let winner: Winner | null;
  if (body.winner === null || body.winner === undefined || body.winner === "") winner = null;
  else if (body.winner === "TIE") winner = "TIE";
  else if (isAbbr(body.winner) && (body.winner === game.away || body.winner === game.home)) winner = body.winner;
  else throw badRequest("INVALID_WINNER", "Winner must be one of the two teams, TIE, or null");
  const score = (v: unknown): number | null => (typeof v === "number" && Number.isInteger(v) && v >= 0 ? v : null);
  await setResult(c.env.DB, game.id, winner, score(body.awayScore), score(body.homeScore), c.get("now"));
  const updated = (await getGame(c.env.DB, game.id))!;
  return c.json(toGameDTO(updated, c.get("now")));
});

adminRoutes.put("/players/:id/weeks/:week/picks", async (c) => {
  const player = await getPlayer(c.env.DB, c.req.param("id"));
  if (!player) throw notFound("NO_PLAYER", "No such player");
  const week = parseWeek(c.req.param("week"));
  const now = c.get("now");
  const body = (await c.req.json().catch(() => ({}))) as { picks?: unknown };
  const [games, existing] = await Promise.all([listWeekGames(c.env.DB, SEASON, week), listPicks(c.env.DB, player.id, week)]);
  const result = validatePicks({ submitted: body.picks, games, existing, now, ignoreLocks: true });
  if (!result.ok) throw new ApiError(result.error.status, result.error.code, result.error.message, result.error.details);
  await replacePicks(c.env.DB, player.id, week, result.final, now, true);
  return c.json({ now, picks: result.final });
});

adminRoutes.get("/players", async (c) => {
  const [players, stats] = await Promise.all([listPlayers(c.env.DB), playerStats(c.env.DB)]);
  const body: AdminPlayersResponse = {
    players: players.map((p) => ({
      id: p.id,
      name: p.name,
      createdAt: p.createdAt,
      lastSeenAt: p.lastSeenAt,
      picksCount: stats.get(p.id)?.picksCount ?? 0,
      weeksPlayed: stats.get(p.id)?.weeksPlayed ?? 0,
    })),
  };
  return c.json(body);
});

adminRoutes.patch("/players/:id", async (c) => {
  const player = await getPlayer(c.env.DB, c.req.param("id"));
  if (!player) throw notFound("NO_PLAYER", "No such player");
  const body = (await c.req.json().catch(() => ({}))) as { name?: unknown };
  const check = validateName(body.name);
  if (!check.ok) throw badRequest("INVALID_NAME", check.message);
  const key = nameKey(check.name);
  const clash = await findPlayerByKey(c.env.DB, key);
  if (clash && clash.id !== player.id) throw new ApiError(409, "NAME_TAKEN", "Another player already has that name");
  await renamePlayer(c.env.DB, player.id, check.name, key);
  return c.json({ player: { id: player.id, name: check.name } });
});

adminRoutes.delete("/players/:id", async (c) => {
  const player = await getPlayer(c.env.DB, c.req.param("id"));
  if (!player) throw notFound("NO_PLAYER", "No such player");
  await deletePlayer(c.env.DB, player.id);
  return c.json({ ok: true });
});

adminRoutes.post("/sync-schedule", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as { source?: unknown };
  // Only reach out to nflverse when explicitly asked; the bundled copy is the safe default.
  if (body.source === "remote") return c.json(await syncScheduleFromSource(c.env.DB));
  return c.json(await syncSchedule(c.env.DB, true));
});

/** Fills in finals from nflverse for games that have already been played. Never overwrites. */
adminRoutes.post("/pull-results", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as { week?: unknown };
  const week = body.week === undefined ? undefined : parseWeek(String(body.week));
  return c.json(await syncResultsFromSource(c.env.DB, c.get("now"), { week }));
});

adminRoutes.get("/status", async (c) => {
  const db = c.env.DB;
  const [syncedAt, lastChanges, syncError, resultsSyncedAt, resultsError] = await Promise.all([
    getMeta(db, "schedule_synced_at"),
    getMeta(db, "schedule_last_changes"),
    getMeta(db, "schedule_sync_error"),
    getMeta(db, "results_synced_at"),
    getMeta(db, "results_sync_error"),
  ]);
  return c.json({
    now: c.get("now"),
    build: BUILD_ID,
    scheduleVersion: SCHEDULE_VERSION,
    scheduleSyncedAt: syncedAt,
    scheduleLastChanges: lastChanges ? Number(lastChanges) : null,
    scheduleSyncError: syncError || null,
    resultsSyncedAt: resultsSyncedAt || null,
    resultsSyncError: resultsError || null,
  });
});

/** Every pick with its game and result — the commissioner's backup and the tiebreak referee. */
adminRoutes.get("/export.csv", async (c) => {
  const [games, players, picks] = await Promise.all([listGames(c.env.DB, SEASON), listPlayers(c.env.DB), listAllPicks(c.env.DB)]);
  const gamesById = new Map(games.map((g) => [g.id, g]));
  const names = new Map(players.map((p) => [p.id, p.name]));
  const esc = (v: unknown) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = ["week,game_id,kickoff_utc,away,home,winner,player,pick,rank,points"];
  for (const p of picks) {
    const g = gamesById.get(p.gameId);
    if (!g) continue;
    const points = g.winner && g.winner === p.team ? 6 - p.rank : 0;
    lines.push([g.week, g.id, g.kickoffAt, g.away, g.home, g.winner ?? "", names.get(p.playerId) ?? p.playerId, p.team, p.rank, g.winner ? points : ""].map(esc).join(","));
  }
  return new Response(lines.join("\n") + "\n", {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="high-five-picks-${SEASON}.csv"`,
    },
  });
});
