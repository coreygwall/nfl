import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  SHARED_CARD_PREFIX,
  STAKE_MAX,
  STAKE_MIN,
  STANDARD_PARS,
  contestInitials,
  contestPar,
  contestTitle,
  contestTook,
  holeLabel,
  netText,
  parseCard,
  standardPoints,
  toParText,
  wagerUnit,
  winningsLine,
} from "../../shared/golf.ts";

/**
 * One scramble, two languages.
 *
 * `shared/golf.ts` exists because a browser cannot import a Swift package, and a card shared to a
 * link has to be the same round on both. That makes this the third pairing in the repo after the
 * live activity and the pool code, and the most dangerous of them: the others describe a week or
 * check a string, while these two settle **money** between four people who have just spent an
 * afternoon arguing about it. A board on the phone that does not match the board in the browser
 * is not a cosmetic bug — it is a disagreement about who owes what.
 *
 * So this compares the things that would go wrong quietly: which par hosts which contest, what a
 * stake may be, what the defaults are, the words a score is called, and the sentences that do the
 * pot's arithmetic out loud. It reads the Swift as text, because a Swift build cannot see this
 * file and these tests cannot run Swift.
 */
const root = new URL("../../ios/TallyKit/Sources/TallyKit/Golf/", import.meta.url);
const sideContests = readFileSync(new URL("SideContests.swift", root), "utf8");
const tally = readFileSync(new URL("ScrambleTally.swift", root), "utf8");
const scrambleCard = readFileSync(new URL("ScrambleCard.swift", root), "utf8");
const service = readFileSync(new URL("GolfService.swift", root), "utf8");
const setupSheet = readFileSync(new URL("../../ios/Tally/Features/Golf/CardSetupSheet.swift", import.meta.url), "utf8");

/** Comments quote the sentences they explain, so they are stripped before anything is matched. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

const swift = {
  sideContests: stripComments(sideContests),
  tally: stripComments(tally),
  card: stripComments(scrambleCard),
  service: stripComments(service),
  setup: stripComments(setupSheet),
};

/** Every `case x: return "literal"` in the body of one computed property. */
function swiftCases(source: string, property: string): Record<string, string> {
  const start = source.indexOf(`var ${property}: String {`);
  expect(start, `expected a ${property} property in the Swift`).toBeGreaterThan(-1);
  const body = source.slice(start, source.indexOf("\n    }", start));
  const out: Record<string, string> = {};
  for (const match of body.matchAll(/case \.(\w+): return "([^"]*)"/g)) out[match[1]!] = match[2]!;
  return out;
}

describe("the two implementations agree about the round", () => {
  it("found the Swift to compare against", () => {
    expect(swift.sideContests).toContain("public enum SideContest");
    expect(swift.sideContests).toContain("public struct Stake");
    expect(swift.sideContests).toContain("public struct PointValues");
    expect(swift.tally).toContain("public static func points(");
    expect(swift.card).toContain("public enum StrokeKind");
  });

  /**
   * Par is the only thing that decides where a contest runs, on either surface. Swap these two and
   * a browser would be claiming the closest to the pin on the par fives.
   */
  it("runs each contest on the same par", () => {
    const pars: Record<string, number> = {};
    const body = swift.sideContests.slice(swift.sideContests.indexOf("public var par: Int {"));
    for (const match of body.matchAll(/case \.(\w+): return (\d)/g)) {
      if (!(match[1]! in pars)) pars[match[1]!] = Number(match[2]);
    }
    expect(pars.longestDrive).toBe(contestPar("longestDrive"));
    expect(pars.closestToPin).toBe(contestPar("closestToPin"));
  });

  it("calls each contest the same thing", () => {
    const titles = swiftCases(swift.sideContests, "title");
    expect(titles.longestDrive).toBe(contestTitle("longestDrive"));
    expect(titles.closestToPin).toBe(contestTitle("closestToPin"));

    const initials = swiftCases(swift.sideContests, "initials");
    expect(initials.longestDrive).toBe(contestInitials("longestDrive"));
    expect(initials.closestToPin).toBe(contestInitials("closestToPin"));

    const took = swiftCases(swift.sideContests, "took");
    expect(took.longestDrive).toBe(contestTook("longestDrive"));
    expect(took.closestToPin).toBe(contestTook("closestToPin"));
  });

  /** The noun a stake is priced against, which the setup sheet and the points line both read out. */
  it("prices a stake against the same noun", () => {
    const units = swiftCases(swift.sideContests, "unit");
    expect(units.shotKept).toBe(wagerUnit("shotKept"));
    expect(units.longestDrive).toBe(wagerUnit("longestDrive"));
    expect(units.closestToPin).toBe(wagerUnit("closestToPin"));
  });

  /** A stepper that offers more than the other side will store is a number that vanishes on sync. */
  it("allows the same stakes", () => {
    const range = swift.sideContests.match(/static let range = (\d+)\.\.\.(\d+)/);
    expect(range, "Stake should declare its range").not.toBeNull();
    expect(Number(range![1])).toBe(STAKE_MIN);
    expect(Number(range![2])).toBe(STAKE_MAX);
  });

  /**
   * The defaults are the bet a group is offered before anybody has thought about it, so the two
   * surfaces proposing different ones would be two different games on one card.
   */
  it("proposes the same bet by default", () => {
    const defaults: Record<string, { on: boolean; each: number }> = {};
    for (const match of swift.sideContests.matchAll(/(\w+): Stake = Stake\(on: (true|false), each: (\d+)\)/g)) {
      defaults[match[1]!] = { on: match[2] === "true", each: Number(match[3]) };
    }
    const standard = standardPoints();
    expect(defaults.shotKept, "PointValues should default its stakes in one memberwise init").toEqual(standard.shotKept);
    expect(defaults.longestDrive).toEqual(standard.longestDrive);
    expect(defaults.closestToPin).toEqual(standard.closestToPin);
    // Points off until somebody asks for them, on both: a second leaderboard nobody wanted is a
    // second answer to "who won", and two answers is none.
    expect(swift.sideContests).toContain("enabled: Bool = false");
    expect(standard.enabled).toBe(false);
  });

  /**
   * The word for a score. A browser calling a 3 on a par 5 an "eagle" while the phone says
   * "albatross" is the sort of disagreement that gets screenshotted.
   */
  it("calls a score the same word", () => {
    const body = swift.tally.slice(swift.tally.indexOf("public static func label(score: Int, par: Int)"));
    const words = [...body.matchAll(/return (?:score == 1 \? "ace" : )?"(\w+)"/g)].map((m) => m[1]);
    expect(words).toContain("albatross");
    expect(words).toContain("eagle");
    expect(words).toContain("birdie");
    expect(words).toContain("par");
    expect(words).toContain("bogey");
    expect(words).toContain("double");
    // And the rule itself, case by case, on a par four and a par five.
    expect(holeLabel(1, 4)).toBe("ace");
    expect(holeLabel(2, 5)).toBe("albatross");
    expect(holeLabel(3, 5)).toBe("eagle");
    expect(holeLabel(3, 4)).toBe("birdie");
    expect(holeLabel(4, 4)).toBe("par");
    expect(holeLabel(5, 4)).toBe("bogey");
    expect(holeLabel(6, 4)).toBe("double");
    expect(holeLabel(7, 4)).toBe("+3");
  });

  /** A real minus sign, not a hyphen, on both — the same character or the columns do not line up. */
  it("writes a number with the same sign", () => {
    expect(swift.tally).toContain('return n < 0 ? "−\\(-n)" : "+\\(n)"');
    expect(swift.tally).toContain('if n == 0 { return "E" }');
    expect(toParText(0)).toBe("E");
    expect(toParText(-2)).toBe("−2");
    expect(netText(30)).toBe("+30");
    expect(netText(-10)).toBe("−10");
    expect(netText(0)).toBe("0");
  });

  /**
   * The sentence that settles the argument on the first tee. It is the whole feature — "10 to the
   * winner" and "10 from everybody" are different bets — so the two say it word for word.
   */
  it("does the pot's arithmetic out loud in the same words", () => {
    // Matched as a skeleton with the interpolations blanked out, because `\(stake.winnings(…))`
    // carries its own brackets and a regex that tried to read them would be checking Swift's
    // syntax rather than the sentence.
    const sentence = swift.tally
      .slice(swift.tally.indexOf("public static func winningsLine"))
      .match(/return "([^"]*)"\n/);
    expect(sentence, "winningsLine should be one sentence in the Swift").not.toBeNull();
    expect(sentence![1]!.replace(/\\\([^"]*?\)(?= |\.|,)/g, "#")).toBe(
      "Worth # to whoever takes it, # from each of the other #.",
    );
    expect(swift.tally).toContain('return "Nobody else to play it with yet."');
    expect(winningsLine({ on: true, each: 10 }, 4)).toBe("Worth 30 to whoever takes it, 10 from each of the other 3.");
    expect(winningsLine({ on: true, each: 10 }, 1)).toBe("Nobody else to play it with yet.");
  });

  it("says each, on both, where the stake is named", () => {
    expect(swift.tally).toContain('each) each on \\($0.unit)');
    expect(swift.tally).toContain('return "Nothing is being played for yet."');
  });

  /** Par 72 laid out the usual way. A different guess is a different set of contest holes. */
  it("guesses the same card", () => {
    const pars = swift.setup.match(/static let standardPars = \[([^\]]*)\]/);
    expect(pars, "CardSetupSheet should declare standardPars").not.toBeNull();
    expect(pars![1]!.split(",").map((n) => Number(n.trim()))).toEqual(STANDARD_PARS);
  });

  /** Four kinds of stroke, and only one of them earns a mark. */
  it("knows the same four kinds of stroke", () => {
    const body = swift.card.slice(swift.card.indexOf("public enum StrokeKind"), swift.card.indexOf("public struct Stroke"));
    const kinds = [...body.matchAll(/^\s*case (\w+)$/gm)].map((m) => m[1]);
    expect(kinds).toEqual(["shot", "tapIn", "penalty", "unclaimed"]);
  });

  /** Clamped identically, or a par corrected on one surface is a different hole on the other. */
  it("clamps par to the same range", () => {
    expect(swift.card).toContain("pars[hole - 1] = min(max(par, 3), 6)");
  });

  /**
   * The merge is the most dangerous pairing of the lot.
   *
   * The server runs the TypeScript on every write, so a phone that merged differently would draw a
   * round the server does not have and then push it back over the one it does. What is checked is
   * the *shape* of the rule rather than its output, because only one of the two can be run here:
   * the hole is the unit, the settings move on their own clock, and the two local-only fields
   * never cross. Each of those is a line of Swift that can be deleted without anything failing to
   * compile.
   */
  it("reconciles two copies of a card by the same rule", () => {
    const merging = swift.card.slice(swift.card.indexOf("public func merging("));
    expect(merging, "ScrambleCard should have a merging(_:)").toContain("func merging(");
    // Settings move as one unit, newest wins.
    expect(merging).toContain("other.settingsUpdatedAt > settingsUpdatedAt ? other : self");
    // The hole is the unit, and the newer of the two takes it whole.
    expect(merging).toMatch(/mine\.updatedAt >= hole\.updatedAt/);
    // And the two things that are this device's own business never cross.
    expect(merging).toContain("merged.currentHole = currentHole");
    expect(merging).toContain("merged.shareToken = shareToken");
    expect(merging).toContain("merged.id = id");
  });

  /**
   * The address a card is shared at, which three separate things have to agree about: the Worker
   * (which requests get the noindex header), `robots.txt` (which a crawler may fetch), and the app
   * (the link that goes in the QR code). A card reachable at a prefix one of them has not heard of
   * is a card that gets indexed.
   */
  it("shares a card at the same address", () => {
    const prefix = swift.service.match(/public static let prefix = "([^"]*)"/);
    expect(prefix, "GolfShare should declare its prefix").not.toBeNull();
    expect(prefix![1]).toBe(SHARED_CARD_PREFIX);
  });

  /**
   * The two fields the wire does not carry. `currentHole` is a fact about a device — syncing it
   * would have two people dragging each other backwards all afternoon — and `shareToken` is the
   * server's to know. The app strips both before sending; the TypeScript never reads them.
   */
  it("keeps the same two fields off the wire", () => {
    const wire = swift.service.slice(swift.service.indexOf("private func wire("));
    expect(wire).toContain("out.shareToken = nil");
    expect(wire).toContain("out.currentHole = 1");
    // And the parser on the other end has no idea they exist.
    const parsed = parseCard({
      id: "x",
      players: [{ id: "c", name: "Corey" }],
      pars: [4],
      currentHole: 12,
      shareToken: "LEAKED",
    })!;
    expect(parsed).not.toHaveProperty("currentHole");
    expect(parsed).not.toHaveProperty("shareToken");
  });
});
