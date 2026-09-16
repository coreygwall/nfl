import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * A Sunday afternoon is one situation, and it gets one set of words.
 *
 * The lock screen and the picks tab describe the same five phases at the same moment, off the same
 * numbers — so "2 games on now · 9 still to play for" has to be that sentence on both, or a person
 * glancing from their phone's lock screen to the app in their hand is told two different things
 * about the same afternoon. The rule lives twice because the surfaces do: `shared/live-activity.ts`
 * for the Worker and the web, `WeekActivity.swift` for the app and its widgets.
 *
 * This is the diligence, as a test. Reword a phase on one side and it fails until the other
 * follows — the same guard `themeParity.test.ts` puts on the palette, and for the same reason: the
 * drift is invisible until two screens are held side by side.
 */

const ts = readFileSync(new URL("../../shared/live-activity.ts", import.meta.url), "utf8");
const swift = readFileSync(
  new URL("../../ios/TallyKit/Sources/TallyKit/LiveActivity/WeekActivity.swift", import.meta.url),
  "utf8",
);

/** Comments talk *about* the sentences and quote them; only the code says them. */
function code(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");
}

/**
 * The fixed parts of every string in a region, with the interpolated parts cut out.
 *
 * `"Back at \(clock(k)) · \(games(n)) left, worth \(p)."` and its TypeScript twin share no whole
 * literal — one interpolates with a backslash and the other with a dollar — but they share every
 * word between the holes, which is the part a reader sees. Anything shorter than six characters is
 * punctuation or a join like " of ", and pinning those would only make the test brittle.
 */
function fragments(region: string, open: string): string[] {
  const out: string[] = [];
  const literals = region.match(/"[^"\n]*"|`[^`]*`/g) ?? [];
  for (const literal of literals) {
    const body = literal.slice(1, -1);
    let current = "";
    for (let i = 0; i < body.length; i++) {
      if (body.startsWith(open, i)) {
        // Skip to the interpolation's matching close paren or brace — `\(clock(kickoff))` and
        // `${points(state.points)}` both nest, so counting is the only way out of them.
        const closer = open.endsWith("(") ? ")" : "}";
        let depth = 1;
        i += open.length;
        while (i < body.length && depth > 0) {
          if (body[i] === open[open.length - 1]) depth++;
          else if (body[i] === closer) depth--;
          i++;
        }
        i--;
        out.push(current);
        current = "";
        continue;
      }
      current += body[i];
    }
    out.push(current);
  }
  return out.filter((f) => f.trim().length >= 6 && /[a-z]/i.test(f));
}

/** Just the wording: the status line and the two helpers it counts with, in each language. Bounded
 *  at both ends, because the payload builder further down each file talks to ActivityKit rather
 *  than to a person, and its strings are keys rather than sentences. */
function between(source: string, from: string, to: string): string {
  const start = source.indexOf(from);
  const end = source.indexOf(to, start);
  if (start < 0 || end < start) throw new Error(`the wording moved: could not find ${start < 0 ? from : to}`);
  return code(source.slice(start, end));
}

const swiftRegion = between(swift, "public func statusLine", "extension WeekActivityAttributes.ContentState");
const tsRegion = between(ts, "const games = (n: number)", "export function activityPayload");

describe("the lock screen and the picks tab say the same thing", () => {
  it("every phase the app knows, the web knows", () => {
    for (const phase of ["locked", "live", "between", "watching", "final"]) {
      expect(ts, `TypeScript is missing the "${phase}" phase`).toContain(`"${phase}"`);
      expect(swift, `Swift is missing the .${phase} phase`).toContain(`case ${phase}`);
    }
  });

  it("every phrase the app says, the web says", () => {
    for (const fragment of fragments(swiftRegion, "\\(")) {
      expect(tsRegion, `the app says "${fragment}" and the web does not`).toContain(fragment);
    }
  });

  it("every phrase the web says, the app says", () => {
    for (const fragment of fragments(tsRegion, "${")) {
      expect(swiftRegion, `the web says "${fragment}" and the app does not`).toContain(fragment);
    }
  });

  it("finds the wording at all, so a rename cannot quietly empty this test", () => {
    expect(fragments(swiftRegion, "\\(").length).toBeGreaterThan(8);
    expect(fragments(tsRegion, "${").length).toBeGreaterThan(8);
  });
});
