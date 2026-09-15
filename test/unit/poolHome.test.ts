import { describe, expect, it } from "vitest";
import { joinPromptOpen, latestCompletedWeek } from "../../src/lib/poolHome.ts";
import type { WeekSummary } from "../../shared/week.ts";

const week = (week: number, finalCount: number, gameCount = 16): WeekSummary => ({
  week,
  finalCount,
  gameCount,
  lockedCount: gameCount,
  firstKickoff: "2026-09-01T00:00:00.000Z",
  lastKickoff: "2026-09-02T00:00:00.000Z",
});

describe("pool home timing", () => {
  it("keeps the invite prominent until the Sunday Week 2 main slate", () => {
    expect(joinPromptOpen("2026-09-20T16:59:59.999Z")).toBe(true);
    expect(joinPromptOpen("2026-09-20T17:00:00.000Z")).toBe(false);
  });

  it("features the latest week with every result recorded", () => {
    expect(latestCompletedWeek([week(1, 16), week(2, 3), week(3, 16)])).toBe(3);
    expect(latestCompletedWeek([week(1, 15), week(2, 0)])).toBeNull();
  });
});
