import type { Player } from "../../shared/types.ts";

const KEY = "nflpool.player.v1";

export function loadPlayer(): Player | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as Partial<Player>;
    return typeof p.id === "string" && typeof p.name === "string" ? { id: p.id, name: p.name } : null;
  } catch {
    return null;
  }
}

export function savePlayer(p: Player): void {
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
