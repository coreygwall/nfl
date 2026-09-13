import { browserSupportsWebAuthnAutofill, startAuthentication, startRegistration, WebAuthnAbortService } from "@simplewebauthn/browser";
import { api } from "../api/client.ts";
import type { PasskeyAuthResponse, PasskeyOptionsResponse } from "../../shared/api.ts";
import type { Identity } from "./identity.ts";

/** Whether this browser can do passkeys at all. Everything here is optional; no support, no prompts. */
export function passkeysSupported(): boolean {
  return typeof window !== "undefined" && typeof window.PublicKeyCredential === "function";
}

/** Whether this device can fulfill biometric-focused copy with a built-in authenticator. */
export async function platformBiometricsSupported(): Promise<boolean> {
  if (!passkeysSupported()) return false;
  const check = window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable;
  if (typeof check !== "function") return false;
  try {
    return await check.call(window.PublicKeyCredential);
  } catch {
    return false;
  }
}

const DISMISS_KEY = "nflpool.passkey-offer-dismissed";

export function offerDismissed(playerId: string): boolean {
  try {
    return (localStorage.getItem(DISMISS_KEY) ?? "").split(",").includes(playerId);
  } catch {
    return false;
  }
}

export function dismissOffer(playerId: string): void {
  try {
    const seen = new Set((localStorage.getItem(DISMISS_KEY) ?? "").split(",").filter(Boolean));
    seen.add(playerId);
    localStorage.setItem(DISMISS_KEY, [...seen].join(","));
  } catch {
    /* ignore */
  }
}

/** Adds Face ID / Touch ID to the identity this device is already signed in as. */
export async function addPasskey(): Promise<void> {
  const { challengeId, options } = await api<PasskeyOptionsResponse>("/passkeys/register/options", { body: {} });
  const response = await startRegistration({ optionsJSON: options as never });
  await api("/passkeys/register", { body: { challengeId, response } });
}

/** Signs in with a passkey. The credential says who you are, so there is no name to type. */
export async function signInWithPasskey(): Promise<Identity> {
  const { challengeId, options } = await api<PasskeyOptionsResponse>("/passkeys/auth/options", { body: {} });
  const response = await startAuthentication({ optionsJSON: options as never });
  const res = await api<PasskeyAuthResponse>("/passkeys/auth", { body: { challengeId, response } });
  return { ...res.player, token: res.token };
}

/** Whether this browser can offer a passkey from inside a field's autofill menu. */
export async function autofillSupported(): Promise<boolean> {
  if (!passkeysSupported()) return false;
  try {
    return await browserSupportsWebAuthnAutofill();
  } catch {
    return false;
  }
}

/**
 * The quiet half of signing in: a passkey request that waits in the background and puts the
 * account at the top of the name field's suggestions. Nothing is shown to someone who has no
 * passkey, and the promise only settles if they pick it — so a returning player signs in by
 * tapping their own name instead of finding the code they wrote down in August.
 *
 * The field it fills has to say `autocomplete="username webauthn"`, which is why the name input
 * on the welcome screen carries that rather than plain `name`.
 */
export async function signInWithAutofill(): Promise<Identity> {
  const { challengeId, options } = await api<PasskeyOptionsResponse>("/passkeys/auth/options", { body: {} });
  const response = await startAuthentication({ optionsJSON: options as never, useBrowserAutofill: true });
  const res = await api<PasskeyAuthResponse>("/passkeys/auth", { body: { challengeId, response } });
  return { ...res.player, token: res.token };
}

/**
 * Drops a waiting autofill request. Leaving the screen is the main reason; tapping the explicit
 * button is not, because starting a new ceremony cancels the old one on its own.
 */
export function cancelAutofill(): void {
  try {
    WebAuthnAbortService.cancelCeremony();
  } catch {
    /* nothing was pending */
  }
}

/** True when the person waved the prompt away rather than something going wrong. */
export function wasCancelled(err: unknown): boolean {
  return err instanceof Error && (err.name === "NotAllowedError" || err.name === "AbortError");
}
