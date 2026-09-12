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

export function lockUntil(now: string): string {
  return new Date(Date.parse(now) + CLAIM_LOCK_MINUTES * 60_000).toISOString();
}

export function isLockedOut(lockedUntil: string | null, now: string): boolean {
  return lockedUntil !== null && Date.parse(lockedUntil) > Date.parse(now);
}
