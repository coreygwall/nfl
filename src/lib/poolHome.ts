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

/** Which week the pool's home previews, and whether its result is settled. */
export interface PreviewWeek {
  week: number;
  /** Every game has a result. Only then may it wear a `Final` chip. */
  final: boolean;
}

/**
 * The week the home page shows the top three of: the one being *played*, not the last one that
 * finished.
 *
 * These are different for most of a season, and the difference is the whole point. On the Friday
 * of Week 2 the last finished week is Week 1, so a home page built on `latestCompletedWeek` spends
 * four days leading with a week nobody is thinking about any more — while Thursday's game, which
 * everybody watched, sits unmentioned. What people want is the week they are in as soon as it has
 * anything to say.
 *
 * "Has anything to say" is one kicked-off game (`lockedCount > 0`), because that is the moment
 * points exist. Before that the week is a schedule, and the previous week is still the news, which
 * is why this walks *down* from the newest week rather than jumping to the current one.
 *
 * `final` stays a separate fact rather than being folded in: a week with fifteen of sixteen games
 * settled is worth previewing and must not be called final, which is exactly the case
 * `latestCompletedWeek` was written to exclude and this one has to include.
 */
export function previewWeek(weeks: WeekSummary[]): PreviewWeek | null {
  const started = weeks.filter((w) => w.gameCount > 0 && w.lockedCount > 0);
  if (started.length === 0) return null;
  const latest = started.reduce((a, b) => (b.week > a.week ? b : a));
  return { week: latest.week, final: latest.finalCount === latest.gameCount };
}
