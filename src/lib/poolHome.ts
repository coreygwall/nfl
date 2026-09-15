import type { WeekSummary } from "../../shared/week.ts";

/** The invite gets prime placement through the main slate's Week 2 kickoff: Sunday, 1 p.m. ET. */
export const JOIN_PROMPT_UNTIL = "2026-09-20T17:00:00.000Z";

export function joinPromptOpen(now: string): boolean {
  return Date.parse(now) < Date.parse(JOIN_PROMPT_UNTIL);
}

/** A finished week has every result, not merely every game kicked off. */
export function latestCompletedWeek(weeks: WeekSummary[]): number | null {
  let latest: number | null = null;
  for (const week of weeks) {
    if (week.gameCount > 0 && week.finalCount === week.gameCount) latest = Math.max(latest ?? week.week, week.week);
  }
  return latest;
}
