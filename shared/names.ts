export const NAME_MIN = 2;
export const NAME_MAX = 24;

export function normalizeName(raw: string): string {
  return raw.normalize("NFKC").trim().replace(/\s+/g, " ");
}

/** Case-insensitive uniqueness key. */
export function nameKey(name: string): string {
  return normalizeName(name).toLowerCase();
}

export type NameCheck = { ok: true; name: string } | { ok: false; message: string };

export function validateName(raw: unknown): NameCheck {
  if (typeof raw !== "string") return { ok: false, message: "Enter a name." };
  const name = normalizeName(raw);
  if (name.length < NAME_MIN) return { ok: false, message: `Needs at least ${NAME_MIN} characters.` };
  if (name.length > NAME_MAX) return { ok: false, message: `Keep it under ${NAME_MAX} characters.` };
  if (!/^[\p{L}\p{N} .'’-]+$/u.test(name)) {
    return { ok: false, message: "Letters, numbers, spaces, and . ' - only." };
  }
  return { ok: true, name };
}
