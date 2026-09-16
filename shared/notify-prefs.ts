import type { NotificationKind } from "./notify.ts";

/**
 * What this phone wants to be told about.
 *
 * The column has existed since push landed and nothing has ever read it: `prefs` was stored on the
 * token, parsed back out, and then every message went to every device anyway. So a switch built
 * against it would have looked like it worked and done nothing — which is worse than not having
 * one. This is the shape, and `allows` is the single place that decides.
 *
 * Two levels, because a household needs both. A device says which *kinds* it cares about — plenty
 * of people want the Sunday results and not the Thursday nudge — and then, separately, which
 * *entries* it is hearing about at all. A parent running four entries does not want four phones
 * buzzing four times; they want their own, and the reminder for whoever has not picked.
 *
 * **Absent always means on.** A new kind ships enabled for everybody who never touched a switch,
 * an unknown key from an older build is ignored rather than muting something, and an empty object
 * is the default rather than silence. Getting that backwards would mean a Worker deploy silently
 * switching off a notification somebody was relying on.
 */

export interface EntryPrefs {
  /** Mutes this entry on this device entirely, whatever the kinds say. */
  muted?: boolean;
  /** Per-kind overrides for this one entry. Absent falls through to the device default. */
  kinds?: Partial<Record<NotificationKind, boolean>>;
}

export interface NotifyPrefs {
  /** The device's default per kind. Absent means on. */
  kinds?: Partial<Record<NotificationKind, boolean>>;
  /** Overrides for particular entries, keyed by player id. */
  entries?: Record<string, EntryPrefs>;
}

export const NOTIFICATION_KINDS: NotificationKind[] = ["picksDue", "segment", "weekDone"];

/** What each switch says on the screen, so the wording lives with the model rather than in a view. */
export const KIND_LABELS: Record<NotificationKind, { title: string; detail: string }> = {
  picksDue: {
    title: "Pick reminders",
    detail: "Before the first game, and again before Sunday, if your five are not in.",
  },
  segment: {
    title: "When your games finish",
    detail: "One message per slate you had a pick in — not one per game.",
  },
  weekDone: {
    title: "The week's result",
    detail: "Where you finished, and where that leaves your season.",
  },
};

function isKind(value: string): value is NotificationKind {
  return (NOTIFICATION_KINDS as string[]).includes(value);
}

/**
 * Reads whatever is in the column, including what older builds wrote.
 *
 * Push shipped storing a flat `{ picksDue: false }` and this takes that to mean the device
 * default, which is what it meant. Anything unrecognised is dropped rather than guessed at: a
 * malformed blob has to mean "everything on", because the alternative is a phone that has gone
 * quiet and no way for its owner to find out why.
 */
export function parsePrefs(raw: unknown): NotifyPrefs {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const source = raw as Record<string, unknown>;
  const prefs: NotifyPrefs = {};

  const kinds = readKinds(source.kinds);
  // The flat shape the first version wrote, read as the device default it always was.
  const flat = readKinds(source);
  const merged = { ...flat, ...kinds };
  if (Object.keys(merged).length) prefs.kinds = merged;

  if (source.entries && typeof source.entries === "object" && !Array.isArray(source.entries)) {
    const entries: Record<string, EntryPrefs> = {};
    for (const [id, value] of Object.entries(source.entries as Record<string, unknown>)) {
      if (!value || typeof value !== "object" || Array.isArray(value)) continue;
      const entry = value as Record<string, unknown>;
      const own: EntryPrefs = {};
      if (entry.muted === true) own.muted = true;
      const entryKinds = readKinds(entry.kinds);
      if (Object.keys(entryKinds).length) own.kinds = entryKinds;
      if (own.muted || own.kinds) entries[id] = own;
    }
    if (Object.keys(entries).length) prefs.entries = entries;
  }

  return prefs;
}

/** Only booleans, only known kinds, and only `false` is worth storing — absent means on. */
function readKinds(raw: unknown): Partial<Record<NotificationKind, boolean>> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Partial<Record<NotificationKind, boolean>> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value === "boolean" && isKind(key)) out[key] = value;
  }
  return out;
}

/**
 * Should this device hear this message about this entry?
 *
 * The order is most specific first: an entry that is muted hears nothing, then that entry's own
 * answer for this kind, then the device's default for the kind, then yes.
 */
export function allows(prefs: NotifyPrefs, kind: NotificationKind, entryId: string): boolean {
  const entry = prefs.entries?.[entryId];
  if (entry?.muted) return false;
  const own = entry?.kinds?.[kind];
  if (own !== undefined) return own;
  const device = prefs.kinds?.[kind];
  if (device !== undefined) return device;
  return true;
}

/** Everything that is switched off, for a settings screen to draw without reimplementing the rule. */
export function isMuted(prefs: NotifyPrefs, entryId: string): boolean {
  return prefs.entries?.[entryId]?.muted === true;
}
