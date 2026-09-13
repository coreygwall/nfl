/**
 * Device tokens. A device holds an opaque token; we store only its SHA-256, so the database
 * never contains anything that can be replayed as a login.
 */
const encoder = new TextEncoder();

export async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(token));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** 32 random bytes, base64url — long enough that guessing is not a threat model. */
export function newToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export const MAX_CLAIM_ATTEMPTS = 8;
export const CLAIM_LOCK_MINUTES = 15;

/** The admin PIN gets the same treatment, per caller. */
export const MAX_ADMIN_ATTEMPTS = 8;

/** Compares without giving away how much of the secret matched. */
export function secretEquals(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function lockUntil(now: string): string {
  return new Date(Date.parse(now) + CLAIM_LOCK_MINUTES * 60_000).toISOString();
}

export function isLockedOut(lockedUntil: string | null, now: string): boolean {
  return lockedUntil !== null && Date.parse(lockedUntil) > Date.parse(now);
}

/**
 * The device token also rides in a cookie. Browsers throw away localStorage far more readily
 * than a server-set cookie (Safari's storage eviction is the common one), and a pool you open
 * once a week should never ask who you are twice.
 */
export const SESSION_COOKIE = "hf_device";
const YEAR_ISH = 60 * 60 * 24 * 400;

export function sessionCookie(token: string, url: string): string {
  const secure = new URL(url).protocol === "https:" ? "; Secure" : "";
  return `${SESSION_COOKIE}=${token}; Path=/; Max-Age=${YEAR_ISH}; HttpOnly; SameSite=Lax${secure}`;
}

export function clearedSessionCookie(url: string): string {
  const secure = new URL(url).protocol === "https:" ? "; Secure" : "";
  return `${SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax${secure}`;
}

export function tokenFromCookie(header: string | null | undefined): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === SESSION_COOKIE) return rest.join("=") || null;
  }
  return null;
}
