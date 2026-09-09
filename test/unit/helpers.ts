import type { Abbr } from "../../shared/teams.ts";
import type { Game, Winner } from "../../shared/types.ts";

export function mkGame(
  id: string,
  week: number,
  kickoffAt: string,
  away: Abbr,
  home: Abbr,
  winner: Winner | null = null,
): Game {
  return { id, season: 2026, week, kickoffAt, away, home, neutral: false, venue: null, winner, awayScore: null, homeScore: null };
}

/** Week 1: two started games, three upcoming. NOW sits between them. */
export const NOW = "2026-09-13T18:00:00.000Z";
export const WEEK1: Game[] = [
  mkGame("g1", 1, "2026-09-10T00:20:00.000Z", "NE", "SEA"),
  mkGame("g2", 1, "2026-09-13T17:00:00.000Z", "BUF", "HOU"),
  mkGame("g3", 1, "2026-09-13T20:25:00.000Z", "KC", "DEN"),
  mkGame("g4", 1, "2026-09-14T00:20:00.000Z", "DAL", "PHI"),
  mkGame("g5", 1, "2026-09-15T00:15:00.000Z", "GB", "MIN"),
  mkGame("g6", 1, "2026-09-15T00:15:00.000Z", "LA", "SF"),
];
export const WEEK2: Game[] = [
  mkGame("h1", 2, "2026-09-18T00:15:00.000Z", "MIA", "NYJ"),
  mkGame("h2", 2, "2026-09-20T17:00:00.000Z", "CHI", "DET"),
  mkGame("h3", 2, "2026-09-22T00:15:00.000Z", "TB", "ATL"),
];
