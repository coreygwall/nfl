import { describe, expect, it } from "vitest";
import { joinPromptOpen, latestCompletedWeek, previewWeek } from "../../src/lib/poolHome.ts";
import type { WeekSummary } from "../../shared/week.ts";

const week = (week: number, finalCount: number, gameCount = 16, lockedCount = gameCount): WeekSummary => ({
  week,
  finalCount,
  gameCount,
  lockedCount,
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

  it("features the latest week with every result recorded", () => {
    expect(latestCompletedWeek([week(1, 16), week(2, 3), week(3, 16)])).toBe(3);
    expect(latestCompletedWeek([week(1, 15), week(2, 0)])).toBeNull();
  });
});

describe("the week the home page previews", () => {
  it("is the week being played, not the last one that finished", () => {
    // The Friday of Week 2: Week 1 is settled, Thursday's game is in the books, Sunday is not.
    const weeks = [week(1, 16), week(2, 1, 16, 1)];
    expect(previewWeek(weeks)).toEqual({ week: 2, final: false });
    // The rule this replaces would have led with Week 1 until Sunday afternoon.
    expect(latestCompletedWeek(weeks)).toBe(1);
  });

  it("stays on the finished week until the next one has kicked off", () => {
    // Tuesday: Week 2 exists on the schedule and has started nothing, so Week 1 is still the news.
    expect(previewWeek([week(1, 16), week(2, 0, 16, 0)])).toEqual({ week: 1, final: true });
  });

  it("calls a week final only when every result is in", () => {
    // Sunday night, one game left: worth previewing, and emphatically not final.
    expect(previewWeek([week(1, 16), week(2, 15, 16, 16)])).toEqual({ week: 2, final: false });
    expect(previewWeek([week(1, 16), week(2, 16)])).toEqual({ week: 2, final: true });
  });

  it("has nothing to preview before the season starts", () => {
    expect(previewWeek([week(1, 0, 16, 0), week(2, 0, 16, 0)])).toBeNull();
    expect(previewWeek([])).toBeNull();
  });

  it("ignores a future week that has no games on the schedule yet", () => {
    // An empty week must never outrank a real one, however high its number.
    expect(previewWeek([week(2, 4, 16, 8), week(3, 0, 0, 0)])).toEqual({ week: 2, final: false });
  });
});
