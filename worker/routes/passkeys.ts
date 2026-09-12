import { Hono } from "hono";
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type RegistrationResponseJSON,
} from "@simplewebauthn/server";
import type { AppEnv } from "../env.ts";
import { ApiError } from "../errors.ts";
import {
  addDevice,
  addPasskey,
  countPasskeys,
  getPasskey,
  getPlayer,
  listPasskeys,
  notePasskeyUse,
  publicPlayer,
  saveChallenge,
  takeChallenge,
} from "../db.ts";
import { hashToken, newToken, sessionCookie } from "../auth.ts";
import type { PasskeyAuthResponse, PasskeyOptionsResponse } from "../../shared/api.ts";

/**
 * Face ID / Touch ID, entirely optional. A passkey is bound to the domain it was made on, so the
 * relying party is taken from the request rather than configured — the same code works on
 * playtally.app, on workers.dev, and on localhost, and a credential from one is never offered on
 * another. Anyone without biometrics (or who would rather not) keeps using their name and code.
 */
export const passkeyRoutes = new Hono<AppEnv>();

const CHALLENGE_MINUTES = 5;

/** Relying party = the host being served. */
function rp(c: { req: { url: string } }, appName: string) {
  const url = new URL(c.req.url);
  return { id: url.hostname, origin: url.origin, name: appName };
}

const base64url = (b: Uint8Array) => {
  let s = "";
  for (const byte of b) s += String.fromCharCode(byte);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

async function issueToken(db: D1Database, playerId: string, now: string): Promise<string> {
  const token = newToken();
  await addDevice(db, { id: crypto.randomUUID(), playerId, tokenHash: await hashToken(token), now });
  return token;
}

/** Step one of adding a passkey: only a signed-in device can put one on an account. */
passkeyRoutes.post("/register/options", async (c) => {
  const me = c.get("account");
  if (!me) throw new ApiError(401, "NO_PLAYER", "Sign in first, then add Face ID.");
  const { id: rpID, name } = rp(c, c.env.APP_NAME || "Tally");
  const existing = await listPasskeys(c.env.DB, me.id, rpID);

  const options = await generateRegistrationOptions({
    rpName: name,
    rpID,
    userID: Uint8Array.from(me.id, (ch) => ch.charCodeAt(0)),
    userName: me.name,
    userDisplayName: me.name,
    attestationType: "none",
    // Discoverable, so a new device can offer the account without anyone typing a name.
    authenticatorSelection: { residentKey: "required", userVerification: "preferred" },
    excludeCredentials: existing.map((p) => ({ id: p.id, transports: p.transports as never })),
  });

  const challengeId = crypto.randomUUID();
  await saveChallenge(c.env.DB, {
    id: challengeId,
    playerId: me.id,
    challenge: options.challenge,
    expiresAt: new Date(Date.parse(c.get("now")) + CHALLENGE_MINUTES * 60_000).toISOString(),
  });
  const res: PasskeyOptionsResponse = { challengeId, options: options as unknown as Record<string, unknown> };
  return c.json(res);
});

passkeyRoutes.post("/register", async (c) => {
  const me = c.get("account");
  if (!me) throw new ApiError(401, "NO_PLAYER", "Sign in first, then add Face ID.");
  const body = (await c.req.json().catch(() => ({}))) as { challengeId?: string; response?: RegistrationResponseJSON };
  if (!body.challengeId || !body.response) throw new ApiError(400, "VALIDATION", "Missing the passkey response.");

  const pending = await takeChallenge(c.env.DB, body.challengeId, c.get("now"));
  if (!pending || pending.playerId !== me.id) throw new ApiError(400, "STALE_CHALLENGE", "That took too long — try again.");

  const { id: rpID, origin } = rp(c, c.env.APP_NAME || "Tally");
  let verification;
  try {
    verification = await verifyRegistrationResponse({
      response: body.response,
      expectedChallenge: pending.challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      requireUserVerification: false,
    });
  } catch {
    throw new ApiError(400, "PASSKEY_REJECTED", "That passkey couldn't be verified.");
  }
  if (!verification.verified || !verification.registrationInfo) {
    throw new ApiError(400, "PASSKEY_REJECTED", "That passkey couldn't be verified.");
  }

  const { credential } = verification.registrationInfo;
  await addPasskey(c.env.DB, {
    id: credential.id,
    playerId: me.id,
    publicKey: base64url(credential.publicKey),
    counter: credential.counter,
    transports: (credential.transports as string[] | undefined) ?? null,
    rpId: rpID,
    now: c.get("now"),
  });
  return c.json({ ok: true, passkeys: await countPasskeys(c.env.DB, me.id, rpID) });
});

/** Step one of signing in with a passkey. No identity yet: the credential names the player. */
passkeyRoutes.post("/auth/options", async (c) => {
  const { id: rpID } = rp(c, c.env.APP_NAME || "Tally");
  const options = await generateAuthenticationOptions({ rpID, userVerification: "preferred" });
  const challengeId = crypto.randomUUID();
  await saveChallenge(c.env.DB, {
    id: challengeId,
    playerId: null,
    challenge: options.challenge,
    expiresAt: new Date(Date.parse(c.get("now")) + CHALLENGE_MINUTES * 60_000).toISOString(),
  });
  const res: PasskeyOptionsResponse = { challengeId, options: options as unknown as Record<string, unknown> };
  return c.json(res);
});

passkeyRoutes.post("/auth", async (c) => {
  const now = c.get("now");
  const body = (await c.req.json().catch(() => ({}))) as { challengeId?: string; response?: AuthenticationResponseJSON };
  if (!body.challengeId || !body.response) throw new ApiError(400, "VALIDATION", "Missing the passkey response.");

  const pending = await takeChallenge(c.env.DB, body.challengeId, now);
  if (!pending) throw new ApiError(400, "STALE_CHALLENGE", "That took too long — try again.");

  const { id: rpID, origin } = rp(c, c.env.APP_NAME || "Tally");
  const stored = await getPasskey(c.env.DB, body.response.id, rpID);
  if (!stored) throw new ApiError(401, "UNKNOWN_PASSKEY", "That passkey isn't registered here.");
  const player = await getPlayer(c.env.DB, stored.playerId);
  if (!player) throw new ApiError(401, "UNKNOWN_PASSKEY", "That name is no longer in the pool.");

  let verification;
  try {
    verification = await verifyAuthenticationResponse({
      response: body.response,
      expectedChallenge: pending.challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      requireUserVerification: false,
      credential: {
        id: stored.id,
        publicKey: Uint8Array.from(atob(stored.publicKey.replace(/-/g, "+").replace(/_/g, "/")), (ch) => ch.charCodeAt(0)),
        counter: stored.counter,
        transports: stored.transports as never,
      },
    });
  } catch {
    throw new ApiError(401, "PASSKEY_REJECTED", "That passkey couldn't be verified.");
  }
  if (!verification.verified) throw new ApiError(401, "PASSKEY_REJECTED", "That passkey couldn't be verified.");

  await notePasskeyUse(c.env.DB, stored.id, verification.authenticationInfo.newCounter, now);
  const token = await issueToken(c.env.DB, player.id, now);
  c.header("set-cookie", sessionCookie(token, c.req.url));
  const res: PasskeyAuthResponse = { player: publicPlayer(player), token };
  return c.json(res);
});
