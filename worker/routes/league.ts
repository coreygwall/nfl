import { Hono } from "hono";
import type { AppEnv } from "../env.ts";
import { badRequest, notFound } from "../errors.ts";
import { isAbbr } from "../../shared/teams.ts";
import type { Winner } from "../../shared/types.ts";
import type { LeagueWeekResponse } from "../../shared/api.ts";
import { getGame, getMeta, listPlatformAdmins, listWeekGames, setResult } from "../db.ts";
import { SCHEDULE_VERSION, SEASON, syncResultsFromSource, syncSchedule, syncScheduleFromSource } from "../ready.ts";
import { BUILD_ID } from "../index.ts";
import { requirePlatformAdmin } from "../roles.ts";
import { parseWeek, toGameDTO } from "./public.ts";

/**
 * The league office. Every pool in Tally scores the same NFL games, so there is exactly one
 * authority on who won them and it is not a commissioner — a pool that could set its own results
 * is a pool that can disagree with the one next door. Today that authority is a person with a
 * super-admin grant and a feed to pull from; the shape does not change when it is fully automated.
 */
export const leagueRoutes = new Hono<AppEnv>();

leagueRoutes.use("*", requirePlatformAdmin);

/** Games and results for a week. No picks: the office does not need to see anyone's card. */
leagueRoutes.get("/weeks/:week", async (c) => {
  const week = parseWeek(c.req.param("week"));
  const now = c.get("now");
  const games = await listWeekGames(c.env.DB, SEASON, week);
  const body: LeagueWeekResponse = { now, week, games: games.map((g) => toGameDTO(g, now)) };
  return c.json(body);
});

leagueRoutes.put("/games/:id/result", async (c) => {
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

/** Fills in finals from nflverse for games that have already been played. Never overwrites. */
leagueRoutes.post("/pull-results", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as { week?: unknown };
  const week = body.week === undefined ? undefined : parseWeek(String(body.week));
  return c.json(await syncResultsFromSource(c.env.DB, c.get("now"), { week }));
});

leagueRoutes.post("/sync-schedule", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as { source?: unknown };
  // Only reach out to nflverse when explicitly asked; the bundled copy is the safe default.
  if (body.source === "remote") return c.json(await syncScheduleFromSource(c.env.DB));
  return c.json(await syncSchedule(c.env.DB, true));
});

leagueRoutes.get("/status", async (c) => {
  const db = c.env.DB;
  const [syncedAt, lastChanges, syncError, resultsSyncedAt, resultsError, admins] = await Promise.all([
    getMeta(db, "schedule_synced_at"),
    getMeta(db, "schedule_last_changes"),
    getMeta(db, "schedule_sync_error"),
    getMeta(db, "results_synced_at"),
    getMeta(db, "results_sync_error"),
    listPlatformAdmins(db),
  ]);
  return c.json({
    now: c.get("now"),
    build: BUILD_ID,
    season: SEASON,
    scheduleVersion: SCHEDULE_VERSION,
    scheduleSyncedAt: syncedAt,
    scheduleLastChanges: lastChanges ? Number(lastChanges) : null,
    scheduleSyncError: syncError || null,
    resultsSyncedAt: resultsSyncedAt || null,
    resultsSyncError: resultsError || null,
    admins,
  });
});
