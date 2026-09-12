import type { Player } from "../../shared/types.ts";

const KEY = "nflpool.player.v1";

/** What this device holds: who it is, and the token that proves it. */
export interface Identity extends Player {
  /** Absent for devices that signed in before tokens existed; they claim one on next boot. */
  token?: string;
}

export function loadPlayer(): Identity | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as Partial<Identity>;
    if (typeof p.id !== "string" || typeof p.name !== "string") return null;
    return { id: p.id, name: p.name, ...(typeof p.token === "string" ? { token: p.token } : {}) };
  } catch {
    return null;
  }
}

export function savePlayer(p: Identity): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* private mode etc. */
  }
}

export function clearPlayer(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
