import type { Game, GameStatus } from "./types.ts";

export const WEEKS = 18;
export const HOUR_MS = 60 * 60 * 1000;
/** How long after kickoff a game is presented as "live" if no result was entered. */
export const GAME_LIVE_MS = 4 * HOUR_MS;
/** Grace period after a week's last kickoff before the default week rolls forward. */
export const WEEK_GRACE_MS = 24 * HOUR_MS;

export const ms = (iso: string): number => Date.parse(iso);

export function isLocked(game: { kickoffAt: string }, now: string): boolean {
  return ms(game.kickoffAt) <= ms(now);
}

export function gameStatus(game: Game, now: string): GameStatus {
  if (game.winner) return "final";
  return isLocked(game, now) ? "live" : "upcoming";
}

export interface WeekSummary {
  week: number;
  firstKickoff: string;
  lastKickoff: string;
  gameCount: number;
  lockedCount: number;
  finalCount: number;
}

export function weekSummaries(games: Game[], now: string): WeekSummary[] {
  const byWeek = new Map<number, Game[]>();
  for (const g of games) {
    const list = byWeek.get(g.week) ?? [];
    list.push(g);
    byWeek.set(g.week, list);
  }
  return [...byWeek.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([week, list]) => {
      const kicks = list.map((g) => g.kickoffAt).sort();
      return {
        week,
        firstKickoff: kicks[0]!,
        lastKickoff: kicks[kicks.length - 1]!,
        gameCount: list.length,
        lockedCount: list.filter((g) => isLocked(g, now)).length,
        finalCount: list.filter((g) => g.winner !== null).length,
      };
    });
}

/** Earliest week that still has an unstarted game — where picking should happen. Falls back to the last week. */
export function pickWeek(games: Game[], now: string): number {
  const weeks = [...new Set(games.map((g) => g.week))].sort((a, b) => a - b);
  for (const w of weeks) {
    if (games.some((g) => g.week === w && !isLocked(g, now))) return w;
  }
  return weeks[weeks.length - 1] ?? WEEKS;
}

/** Latest week with at least one started game — where results live. Falls back to week 1. */
export function boardWeek(games: Game[], now: string): number {
  const weeks = [...new Set(games.map((g) => g.week))].sort((a, b) => b - a);
  for (const w of weeks) {
    if (games.some((g) => g.week === w && isLocked(g, now))) return w;
  }
  return weeks[weeks.length - 1] ?? 1;
}

/** Earliest week whose last kickoff + grace is still in the future. Used for "what week is it". */
export function currentWeek(games: Game[], now: string): number {
  const t = ms(now);
  for (const s of weekSummaries(games, now)) {
    if (t < ms(s.lastKickoff) + WEEK_GRACE_MS) return s.week;
  }
  return WEEKS;
}

export function nextKickoff(games: Game[], now: string): string | null {
  const t = ms(now);
  const future = games.map((g) => g.kickoffAt).filter((k) => ms(k) > t).sort();
  return future[0] ?? null;
}
