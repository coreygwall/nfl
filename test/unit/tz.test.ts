import { describe, expect, it } from "vitest";
import { zonedTimeToUtc } from "../../shared/tz.ts";

describe("zonedTimeToUtc (America/New_York)", () => {
  it("handles EDT, EST, and the DST boundaries", () => {
    expect(zonedTimeToUtc(2026, 9, 13, 13, 0, "America/New_York")).toBe("2026-09-13T17:00:00.000Z"); // EDT
    expect(zonedTimeToUtc(2026, 12, 13, 13, 0, "America/New_York")).toBe("2026-12-13T18:00:00.000Z"); // EST
    expect(zonedTimeToUtc(2026, 11, 1, 13, 0, "America/New_York")).toBe("2026-11-01T18:00:00.000Z"); // DST ended 2am
    expect(zonedTimeToUtc(2026, 11, 1, 0, 30, "America/New_York")).toBe("2026-11-01T04:30:00.000Z"); // still EDT
    expect(zonedTimeToUtc(2027, 3, 14, 13, 0, "America/New_York")).toBe("2027-03-14T17:00:00.000Z"); // DST starts
    expect(zonedTimeToUtc(2026, 9, 9, 20, 20, "America/New_York")).toBe("2026-09-10T00:20:00.000Z"); // crosses midnight
  });
});
