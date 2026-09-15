import { describe, expect, it } from "vitest";
import { fallbackPoolWeeks } from "../../src/lib/poolFallback.ts";

describe("fallbackPoolWeeks", () => {
  it("opens week one before the season", () => {
    expect(fallbackPoolWeeks("2026-09-09T12:00:00Z")).toEqual({ pickWeek: 1, boardWeek: 1 });
  });

  it("points a returning player at the upcoming week and last active board", () => {
    expect(fallbackPoolWeeks("2026-09-15T12:00:00Z")).toEqual({ pickWeek: 2, boardWeek: 1 });
  });

  it("advances results as games begin", () => {
    expect(fallbackPoolWeeks("2026-09-18T03:00:00Z")).toEqual({ pickWeek: 2, boardWeek: 2 });
  });
});
