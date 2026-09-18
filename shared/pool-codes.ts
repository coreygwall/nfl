/**
 * The code you say out loud to get somebody into a pool.
 *
 * Deliberately not the same shape as a device claim code (`shared/codes.ts`, eight characters
 * from one mixed alphabet), because they are not the same kind of thing. A claim code is a
 * secret: it proves a name is yours, so it is long and it is guessed at behind a lockout. A join
 * code is a *handle*: it is printed on a group chat, read across a table, and typed by whoever
 * wants in. Its job is to be short and to survive being spoken.
 *
 * Three letters, then three digits — `KDP-472`. The fixed shape is the useful part:
 *
 * - **Spoken, it needs no spelling.** "K, D, P, four seven two" has a rhythm; eight characters of
 *   mixed letters and digits does not, which is why nobody reads a claim code aloud twice.
 * - **One field can tell three things apart.** A join box takes a pasted link, a join code, or
 *   nothing useful, and the shapes never collide: a link has a scheme, a join code is 3+3, a
 *   claim code is eight of anything. No round trip is needed to work out which one arrived.
 * - **The alphabets drop what people misread** — no I, L or O among the letters, no 0 or 1 among
 *   the digits — the same reasoning as the claim code, for the same reason: this gets said over a
 *   phone in a noisy room.
 *
 * That is 23³ × 8³ ≈ 6.2 million codes, which is not a number that needs a plan. A code is not a
 * secret and is never the only thing standing between somebody and a pool — the pool decides who
 * may enter it — so the space only has to make an accidental collision unlikely, and the unique
 * index on the column is what actually guarantees it.
 */

/** No I, L or O: the three that a handwritten or spoken letter loses. */
const LETTERS = "ABCDEFGHJKMNPQRSTUVWXYZ";
/** No 0 or 1: the two that are the letters above. */
const DIGITS = "23456789";

export const POOL_CODE_LETTERS = 3;
export const POOL_CODE_DIGITS = 3;
export const POOL_CODE_LENGTH = POOL_CODE_LETTERS + POOL_CODE_DIGITS;

/**
 * Three-letter runs never minted. A doormat, not a censor, the same as `shared/profanity.ts`:
 * this is not a filter over something a person chose, it is a short list of the codes that must
 * not be *handed* to a pool full of somebody's family. Entries that the letter alphabet cannot
 * spell (anything with an I, L or O) are already impossible and are left out.
 */
const UNMINTABLE = new Set(["ASS", "CUM", "DCK", "FAG", "FCK", "FUK", "JAP", "KKK", "NAZ", "SEX", "SHT", "TWT", "VAG", "WTF"]);

/**
 * A new code. Not a secret, but minted from the same source of randomness as one, because the
 * cost is nothing and the alternative is a counter that tells everybody how many pools exist.
 */
export function generatePoolCode(random: (n: number) => Uint8Array = randomBytes): string {
  for (;;) {
    const bytes = random(POOL_CODE_LENGTH);
    let letters = "";
    for (let i = 0; i < POOL_CODE_LETTERS; i++) letters += LETTERS[bytes[i]! % LETTERS.length];
    if (UNMINTABLE.has(letters)) continue;
    let digits = "";
    for (let i = 0; i < POOL_CODE_DIGITS; i++) digits += DIGITS[bytes[POOL_CODE_LETTERS + i]! % DIGITS.length];
    return letters + digits;
  }
}

function randomBytes(n: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(n));
}

/** Strips the dash, the spaces and the case, so "kdp 472" matches "KDP472". */
export function normalizePoolCode(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/**
 * Whether this is a join code at all. Shape only — whether a pool answers to it is the server's
 * to say — which is what lets a client refuse a typo without spending a request on it.
 */
export function isPoolCodeShaped(raw: unknown): boolean {
  const code = normalizePoolCode(raw);
  if (code.length !== POOL_CODE_LENGTH) return false;
  return (
    [...code.slice(0, POOL_CODE_LETTERS)].every((ch) => LETTERS.includes(ch)) &&
    [...code.slice(POOL_CODE_LETTERS)].every((ch) => DIGITS.includes(ch))
  );
}

/** Display form: KDP-472. The dash is never stored and never sent. */
export function formatPoolCode(code: string): string {
  const c = normalizePoolCode(code);
  return c.length === POOL_CODE_LENGTH ? `${c.slice(0, POOL_CODE_LETTERS)}-${c.slice(POOL_CODE_LETTERS)}` : c;
}

/** What to show as somebody types: uppercase, a dash after three, never more than six. */
export function formatPoolCodeWhileTyping(raw: string): string {
  const c = normalizePoolCode(raw).slice(0, POOL_CODE_LENGTH);
  return c.length > POOL_CODE_LETTERS ? `${c.slice(0, POOL_CODE_LETTERS)}-${c.slice(POOL_CODE_LETTERS)}` : c;
}
