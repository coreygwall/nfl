import { describe, expect, it } from "vitest";
import { allows, isMuted, NOTIFICATION_KINDS, parsePrefs } from "../../shared/notify-prefs.ts";

/**
 * The switches, and the one rule that reads them.
 *
 * This column existed for weeks and nothing consulted it, so every preference anybody set was
 * decoration. The risk in fixing that is the opposite failure: a rule that reads absence as "off"
 * turns a deploy into a phone that has silently gone quiet, with nothing on screen to say why.
 * Most of what is below is that invariant, from several directions.
 */

const ME = "player-me";
const KID = "player-kid";

describe("what a device has asked for", () => {
  it("says yes to everything when nothing has been set", () => {
    for (const kind of NOTIFICATION_KINDS) {
      expect(allows({}, kind, ME)).toBe(true);
    }
  });

  it("lets a device switch off one kind for everybody it covers", () => {
    const prefs = parsePrefs({ kinds: { picksDue: false } });
    expect(allows(prefs, "picksDue", ME)).toBe(false);
    expect(allows(prefs, "segment", ME)).toBe(true);
    expect(allows(prefs, "weekDone", KID)).toBe(true);
  });

  /// A parent running four entries wants their own week, not four phones' worth of it.
  it("lets one entry be muted without touching the others", () => {
    const prefs = parsePrefs({ entries: { [KID]: { muted: true } } });
    expect(allows(prefs, "segment", KID)).toBe(false);
    expect(allows(prefs, "picksDue", KID)).toBe(false);
    expect(allows(prefs, "segment", ME)).toBe(true);
    expect(isMuted(prefs, KID)).toBe(true);
    expect(isMuted(prefs, ME)).toBe(false);
  });

  it("lets an entry keep a kind the device switched off", () => {
    // Off for me everywhere, except I still want the nudge for the child who forgets.
    const prefs = parsePrefs({
      kinds: { picksDue: false },
      entries: { [KID]: { kinds: { picksDue: true } } },
    });
    expect(allows(prefs, "picksDue", ME)).toBe(false);
    expect(allows(prefs, "picksDue", KID)).toBe(true);
  });

  it("lets muting an entry beat that entry's own kind switch", () => {
    const prefs = parsePrefs({ entries: { [KID]: { muted: true, kinds: { weekDone: true } } } });
    expect(allows(prefs, "weekDone", KID)).toBe(false);
  });
});

describe("reading what is in the column", () => {
  /// Push shipped writing a flat map. Those rows exist; they meant the device default.
  it("reads the flat shape an older build wrote", () => {
    const prefs = parsePrefs({ picksDue: false, segment: true });
    expect(prefs.kinds).toEqual({ picksDue: false, segment: true });
    expect(allows(prefs, "picksDue", ME)).toBe(false);
    expect(allows(prefs, "segment", ME)).toBe(true);
  });

  it("prefers the explicit shape when a row carries both", () => {
    const prefs = parsePrefs({ picksDue: true, kinds: { picksDue: false } });
    expect(allows(prefs, "picksDue", ME)).toBe(false);
  });

  /**
   * Everything here is the same answer said five ways: garbage means on. A phone that has gone
   * quiet because a blob failed to parse is a support conversation nobody can win, and the person
   * on the other end has no way to tell it from the app being broken.
   */
  it.each([null, undefined, 42, "nope", [], { kinds: "yes" }, { entries: [] }, { entries: { [ME]: 7 } }])(
    "treats %j as everything on",
    (raw) => {
      const prefs = parsePrefs(raw);
      for (const kind of NOTIFICATION_KINDS) {
        expect(allows(prefs, kind, ME)).toBe(true);
      }
    },
  );

  it("drops keys that are not kinds rather than storing them", () => {
    const prefs = parsePrefs({ kinds: { picksDue: false, somethingElse: false } });
    expect(prefs.kinds).toEqual({ picksDue: false });
  });

  it("ignores a non-boolean where a switch should be", () => {
    const prefs = parsePrefs({ kinds: { picksDue: "off" } });
    expect(allows(prefs, "picksDue", ME)).toBe(true);
  });

  it("keeps an entry that only mutes, and drops one that says nothing", () => {
    const prefs = parsePrefs({ entries: { [KID]: { muted: true }, [ME]: {} } });
    expect(prefs.entries).toEqual({ [KID]: { muted: true } });
  });

  it("survives a round trip through the column", () => {
    const original = parsePrefs({
      kinds: { picksDue: false },
      entries: { [KID]: { muted: true }, [ME]: { kinds: { weekDone: false } } },
    });
    expect(parsePrefs(JSON.parse(JSON.stringify(original)))).toEqual(original);
  });
});
