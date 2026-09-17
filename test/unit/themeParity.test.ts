import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * The design system is one design system, written twice.
 *
 * `src/index.css` and `ios/TallyKit/Sources/TallyKit/Design/Palette.swift` hold the same palette in
 * two languages, and nothing but diligence kept them together — which is exactly how the dark theme
 * drifted: web refined five values and added `--color-card-border`, iOS kept the old ones for
 * weeks, and the apps quietly stopped looking alike in dark mode. Nobody noticed, because noticing
 * requires holding a phone next to a laptop in the dark.
 *
 * So the diligence is a test now. Change a colour on one surface and this fails until the other
 * one follows.
 *
 * It also guards the *shape* of the thing. The widget extension cannot see the app target, so when
 * the Live Activity needed these colours it grew its own private copy of seven of them as flat
 * light-theme hexes — which is why that surface shipped with no dark mode at all. The palette lives
 * in TallyKit now, where both targets link it, and the last two tests here fail if either target
 * starts keeping hexes of its own again.
 */

const css = readFileSync(new URL("../../src/index.css", import.meta.url), "utf8");
const swift = readFileSync(new URL("../../ios/TallyKit/Sources/TallyKit/Design/Palette.swift", import.meta.url), "utf8");
const appTheme = readFileSync(new URL("../../ios/Tally/Design/Theme.swift", import.meta.url), "utf8");
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/** Every Swift file under a directory, with its path — so a failure names the file. */
function swiftFiles(dir: string): { path: string; source: string }[] {
  const out: { path: string; source: string }[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...swiftFiles(full));
    else if (name.endsWith(".swift")) out.push({ path: full, source: readFileSync(full, "utf8") });
  }
  return out;
}
const appRoot = new URL("../../ios/Tally", import.meta.url).pathname;
const appSwift = swiftFiles(appRoot);

const widgets = ["WeekLiveActivity.swift", "RoundLiveActivity.swift", "TallyWidgetsBundle.swift"]
  .map((f) => {
    try {
      return readFileSync(new URL(`../../ios/TallyWidgets/${f}`, import.meta.url), "utf8");
    } catch {
      return "";
    }
  })
  .join("\n");

/** Web token → the `Color` constant that mirrors it on iOS. */
const MIRRORED: Record<string, string> = {
  paper: "paper",
  "paper-2": "paper2",
  "paper-3": "paper3",
  ink: "ink",
  "ink-2": "ink2",
  "ink-3": "ink3",
  line: "line",
  turf: "turf",
  "turf-2": "turf2",
  "turf-soft": "turfSoft",
  flag: "flag",
  "flag-soft": "flagSoft",
  danger: "danger",
  "danger-soft": "dangerSoft",
  sky: "sky",
  "sky-soft": "skySoft",
  bronze: "bronze",
  surface: "surface",
  shadow: "shadow",
  "card-border": "cardBorder",
  "rank-5": "rank5",
  "rank-4": "rank4",
  "rank-3": "rank3",
  "rank-2": "rank2",
  "rank-1": "rank1",
  // iOS calls this one after its job rather than after the green it started on: the label drawn on
  // any filled accent, which is what `--color-on-turf` became.
  "on-turf": "onFill",
};

/**
 * Deliberately unpaired, so an unmatched token is a failure rather than a shrug:
 * - `on-accent` is the same value in both themes, so iOS stores it as a single colour.
 * - `dot` is the web's paper texture; there is no dotted ground in the native app.
 */
const WEB_ONLY = new Set(["on-accent", "dot"]);

/** The value of `--color-<name>` inside a given block of CSS. */
function tokens(block: string): Record<string, string> {
  const found: Record<string, string> = {};
  for (const [, name, value] of block.matchAll(/--color-([a-z0-9-]+):\s*([^;]+);/g)) {
    if (name && value) found[name] = value.trim().toLowerCase();
  }
  return found;
}

function block(marker: string): string {
  const start = css.indexOf(marker);
  expect(start, `${marker} should exist in src/index.css`).toBeGreaterThan(-1);
  const end = css.indexOf("}", start);
  return css.slice(start, end);
}

// `@theme` carries the light palette; the explicit dark selector carries the dark one. The
// `prefers-color-scheme` copy is asserted separately, below, to be identical to it.
const light = tokens(block("@theme {"));
const dark = tokens(block(':root[data-theme="dark"] {'));

const swiftPairs: Record<string, { light: string; dark: string }> = {};
for (const [, name, l, d] of swift.matchAll(/static let (\w+) = Color\(light: "(#[0-9A-Fa-f]{6})", dark: "(#[0-9A-Fa-f]{6})"\)/g)) {
  if (name && l && d) swiftPairs[name] = { light: l.toLowerCase(), dark: d.toLowerCase() };
}

describe("the palette is the same on both surfaces", () => {
  it("found a palette to compare at all", () => {
    expect(Object.keys(light).length).toBeGreaterThan(15);
    expect(Object.keys(swiftPairs).length).toBeGreaterThan(15);
  });

  for (const [token, constant] of Object.entries(MIRRORED)) {
    it(`--color-${token} matches Color.${constant}`, () => {
      expect(swiftPairs[constant], `Theme.swift should define ${constant}`).toBeDefined();
      expect(swiftPairs[constant]?.light).toBe(light[token]);
      expect(swiftPairs[constant]?.dark).toBe(dark[token]);
    });
  }

  it("every web token is either mirrored on iOS or listed as web-only", () => {
    const unaccounted = Object.keys(light).filter((t) => !(t in MIRRORED) && !WEB_ONLY.has(t));
    expect(unaccounted).toEqual([]);
  });

  /**
   * The dark palette is written twice on the web — once for the device preference and once for the
   * explicit choice — and they have to agree, or the app looks different depending on how the
   * reader arrived at dark mode. iOS resolves one pair for both, so this only needs saying here.
   */
  it("the two dark blocks on the web agree with each other", () => {
    const preference = tokens(block('@media (prefers-color-scheme: dark) {\n  :root:not([data-theme="light"]) {'));
    expect(preference).toEqual(dark);
  });

  /**
   * Both iOS targets read the shared palette rather than keeping values of their own. A literal
   * hex in either of them is how the drift starts, so it is a failure here — team colours are the
   * one exception, and those come from the sport's data rather than being written down.
   */
  it("the app target defines no colours of its own", () => {
    const hexes = appTheme.match(/"#[0-9A-Fa-f]{6}"/g) ?? [];
    expect(hexes, "Theme.swift should alias TallyPalette, not hold hexes").toEqual([]);
  });

  it("the widget extension defines no colours of its own", () => {
    const hexes = widgets.match(/"#[0-9A-Fa-f]{6}"/g) ?? [];
    expect(hexes, "the widgets should draw from TallyPalette, not a private copy").toEqual([]);
  });
});

/**
 * Yellow under text is the one pairing the two themes disagree about.
 *
 * The flag is the same yellow in both, and `ink` — the default text colour — is near-white in the
 * dark one. So anything that fills with the flag and lets its text inherit ships white-on-yellow
 * in dark mode, and four screens did exactly that before anyone held a phone up in the dark. Two
 * rules make it structural rather than a thing to remember:
 */
describe("yellow never carries inherited text", () => {
  const designSystem = join(appRoot, "Design", "Components.swift");

  /** A raw `.fill(Color.flag)` belongs only in `FlagMark`, which sets the label colour itself. */
  it("nothing outside the design system fills with the flag directly", () => {
    const offenders = appSwift
      .filter((f) => f.path !== designSystem)
      .filter((f) => /\.fill\(\s*(Color|TallyPalette)\.flag\s*\)/.test(f.source))
      .map((f) => f.path.replace(appRoot, "ios/Tally"));
    expect(offenders, "draw a yellow mark with FlagMark, which knows its text is black").toEqual([]);
  });

  /** A yellow chip has to say so: `Chip(..., fill: .flag, ..., label: .onAccent)`. */
  it("every yellow chip names its label colour", () => {
    const offenders: string[] = [];
    for (const f of appSwift) {
      for (const [i, line] of f.source.split("\n").entries()) {
        if (/Chip\(/.test(line) && /fill:\s*\.flag\b/.test(line) && !/label:\s*\.onAccent\b/.test(line)) {
          offenders.push(`${f.path.replace(appRoot, "ios/Tally")}:${i + 1}`);
        }
      }
    }
    expect(offenders, "a Chip filled with .flag must pass label: .onAccent").toEqual([]);
  });
});
