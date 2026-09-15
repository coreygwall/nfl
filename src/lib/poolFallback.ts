import schedule from "../../shared/schedule-2026.json";
import { nowIso } from "./clock.ts";

/**
 * Navigation cannot depend on bootstrap. A returning browser may have an old session or a slow
 * connection, but the schedule bundled into the web build still knows which week has open games
 * and which week has results. The server replaces these values as soon as it answers (and remains
 * authoritative for flexed kickoffs); this is only the dependable doorway while it reconnects.
 */
export function fallbackPoolWeeks(now = nowIso()): { pickWeek: number; boardWeek: number } {
  const at = Date.parse(now);
  const games = schedule.games;
  const weeks = [...new Set(games.map((game) => game.week))].sort((a, b) => a - b);
  const pickWeek = weeks.find((week) => games.some((game) => game.week === week && Date.parse(game.kickoff) > at));
  let boardWeek = 1;
  for (const game of games) {
    if (Date.parse(game.kickoff) <= at) boardWeek = Math.max(boardWeek, game.week);
  }
  return { pickWeek: pickWeek ?? weeks.at(-1) ?? 18, boardWeek };
}
