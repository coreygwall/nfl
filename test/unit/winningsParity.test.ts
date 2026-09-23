import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { moneyLabel, NO_MONEY_NOTE, SEASON_POT, WEEKLY_POT } from "../../shared/winnings.ts";

/**
 * `shared/winnings.ts` computes the whole winnings board server-side, so the app never
 * re-implements the split or the tiebreak — but the two pot amounts and the label they are drawn
 * with are typed out twice regardless, once per language, because `Winnings.swift` has to speak
 * for itself the moment a request fails and the app is showing a number it already has. This is
 * the third pairing in the repo to settle money — after golf's stakes and its settle-up — so the
 * same rule applies: a Swift build cannot see this file, and disagreement here is somebody's
 * actual payout being wrong.
 */
const swift = readFileSync(new URL("../../ios/TallyKit/Sources/TallyKit/Rules/Winnings.swift", import.meta.url), "utf8").replace(
  /\/\*[\s\S]*?\*\//g,
  "",
);

describe("the two implementations agree about the pots", () => {
  it("found the Swift to compare against", () => {
    expect(swift).toContain("public enum Winnings");
  });

  it("prices both pots the same", () => {
    const weekly = swift.match(/static let weeklyPot = ([\d.]+)/);
    const season = swift.match(/static let seasonPot = ([\d.]+)/);
    expect(weekly, "Winnings should declare weeklyPot").not.toBeNull();
    expect(season, "Winnings should declare seasonPot").not.toBeNull();
    expect(Number(weekly![1])).toBe(WEEKLY_POT);
    expect(Number(season![1])).toBe(SEASON_POT);
  });

  it("says the same sentence about who holds the money", () => {
    // The one line that stands between a dollar sign and a reviewer reading gambling into it; a
    // reworded half on one surface would leave the other saying something the app no longer means.
    const note = swift.match(/static let noMoneyNote = "([^"]+)"/);
    expect(note, "Winnings should declare noMoneyNote").not.toBeNull();
    expect(note![1]).toBe(NO_MONEY_NOTE);
  });

  it("labels a dollar amount the same way", () => {
    // Not run against the Swift — these pin the TS side's own three shapes (a whole number, a
    // clean half, a split that lands on two decimals), which is what `Winnings.label` in Swift is
    // written to match: the currency mark always, at most two decimals, never a trailing zero.
    expect(moneyLabel(18)).toBe("$18");
    expect(moneyLabel(4.5)).toBe("$4.50");
    expect(moneyLabel(12.75)).toBe("$12.75");
    expect(moneyLabel(0)).toBe("$0");
  });
});
