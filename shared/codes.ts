/**
 * Device claim codes: the short string you type on a second device to prove the name is yours.
 * The alphabet drops the characters people misread out loud (I, L, O, 0, 1), so a code can be
 * read across a room or over the phone without a spelling argument.
 */
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const CODE_LENGTH = 8;

export function generateCode(random: (n: number) => Uint8Array = randomBytes): string {
  const bytes = random(CODE_LENGTH);
  let out = "";
  for (let i = 0; i < CODE_LENGTH; i++) out += ALPHABET[bytes[i]! % ALPHABET.length];
  return out;
}

function randomBytes(n: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(n));
}

/** Strips the dash, spaces and case so "q7mn-4pk2" matches "Q7MN4PK2". */
export function normalizeCode(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function isCodeShaped(raw: unknown): boolean {
  const code = normalizeCode(raw);
  return code.length === CODE_LENGTH && [...code].every((ch) => ALPHABET.includes(ch));
}

/** Display form: QRT4-9MKP. */
export function formatCode(code: string): string {
  const c = normalizeCode(code);
  return c.length === CODE_LENGTH ? `${c.slice(0, 4)}-${c.slice(4)}` : c;
}

/** Constant-time-ish compare so a wrong code leaks nothing through timing. */
export function codesMatch(a: string, b: string): boolean {
  const x = normalizeCode(a);
  const y = normalizeCode(b);
  if (x.length !== y.length || x.length === 0) return false;
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x.charCodeAt(i) ^ y.charCodeAt(i);
  return diff === 0;
}
