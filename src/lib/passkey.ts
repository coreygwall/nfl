import { startAuthentication, startRegistration } from "@simplewebauthn/browser";
import { api } from "../api/client.ts";
import type { PasskeyAuthResponse, PasskeyOptionsResponse } from "../../shared/api.ts";
import type { Identity } from "./identity.ts";

/** Whether this browser can do passkeys at all. Everything here is optional; no support, no prompts. */
export function passkeysSupported(): boolean {
  return typeof window !== "undefined" && typeof window.PublicKeyCredential === "function";
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

/** True when the person waved the prompt away rather than something going wrong. */
export function wasCancelled(err: unknown): boolean {
  return err instanceof Error && (err.name === "NotAllowedError" || err.name === "AbortError");
}
