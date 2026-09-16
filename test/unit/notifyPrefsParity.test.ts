import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { KIND_LABELS, NOTIFICATION_KINDS } from "../../shared/notify-prefs.ts";

/**
 * The kinds are one list, written twice.
 *
 * The server decides what to send and the app draws a switch for each one, so a kind added on one
 * side and not the other is a message nobody can turn off, or a control that does nothing. Neither
 * shows up in a type error — the wire is JSON both ways — and neither shows up in a test of either
 * half on its own.
 *
 * The wording is checked too, because these strings are the whole explanation of what a switch
 * does; a kind whose copy drifts is a promise the two surfaces make differently.
 */
const swift = readFileSync(
  new URL("../../ios/TallyKit/Sources/TallyKit/Models/NotifyPrefs.swift", import.meta.url),
  "utf8",
);

/** `case picksDue` … inside the enum. */
function swiftKinds(): string[] {
  return [...swift.matchAll(/^    case (\w+)$/gm)].map(([, name]) => name!);
}

/** The bodies of `title` and `detail`, which are `case .kind: "string"` switches. */
function swiftStrings(property: "title" | "detail"): Record<string, string> {
  const start = swift.indexOf(`public var ${property}: String {`);
  expect(start, `NotifyPrefs.swift should define ${property}`).toBeGreaterThan(-1);
  const body = swift.slice(start, swift.indexOf("\n    }", start));
  const found: Record<string, string> = {};
  for (const [, kind, value] of body.matchAll(/case \.(\w+): "([^"]*)"/g)) {
    if (kind && value !== undefined) found[kind] = value;
  }
  return found;
}

describe("the notification kinds are the same on both surfaces", () => {
  it("found a Swift enum to compare against", () => {
    expect(swiftKinds().length).toBeGreaterThan(2);
  });

  it("lists the same kinds, in the same order", () => {
    expect(swiftKinds()).toEqual(NOTIFICATION_KINDS);
  });

  it("gives each kind the same title", () => {
    const titles = Object.fromEntries(NOTIFICATION_KINDS.map((k) => [k, KIND_LABELS[k].title]));
    expect(swiftStrings("title")).toEqual(titles);
  });

  it("gives each kind the same explanation", () => {
    const details = Object.fromEntries(NOTIFICATION_KINDS.map((k) => [k, KIND_LABELS[k].detail]));
    expect(swiftStrings("detail")).toEqual(details);
  });
});
