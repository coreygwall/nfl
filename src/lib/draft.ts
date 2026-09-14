import type { Abbr } from "../../shared/teams.ts";

export interface Draft {
  /** gameId -> picked team (unlocked games only). */
  selections: Record<string, Abbr>;
  /** Rank order of the selected gameIds (most confident first). */
  order: string[];
}

const key = (playerId: string, week: number) => `nflpool.draft.${playerId}.${week}`;

export const emptyDraft = (): Draft => ({ selections: {}, order: [] });

export function loadDraft(playerId: string, week: number): Draft | null {
  try {
    const raw = localStorage.getItem(key(playerId, week));
    if (!raw) return null;
    const d = JSON.parse(raw) as Draft;
    if (!d || typeof d !== "object" || !d.selections || !Array.isArray(d.order)) return null;
    return d;
  } catch {
    return null;
  }
}

/**
 * An empty draft is not a draft — it is the absence of one, so it clears rather than writes.
 *
 * The iOS app had a bug this closes: saving picks clears the store and then resets the draft to
 * empty, and that reset is itself a change, so an empty draft was written straight back over the
 * clear and preferred over the saved picks on the next load. The web seeds from the server rather
 * than from storage so it never showed the symptom, but the same rule belongs on both sides.
 */
export function saveDraft(playerId: string, week: number, draft: Draft): void {
  if (draft.order.length === 0) return clearDraft(playerId, week);
  try {
    localStorage.setItem(key(playerId, week), JSON.stringify(draft));
  } catch {
    /* ignore */
  }
}

export function clearDraft(playerId: string, week: number): void {
  try {
    localStorage.removeItem(key(playerId, week));
  } catch {
    /* ignore */
  }
}

export function toggleSelection(draft: Draft, gameId: string, team: Abbr): Draft {
  const current = draft.selections[gameId];
  const selections = { ...draft.selections };
  let order = draft.order.filter((id) => id !== gameId);
  if (current === team) {
    delete selections[gameId];
  } else {
    selections[gameId] = team;
    order = current ? insertAt(draft.order, gameId, draft.order.indexOf(gameId)) : [...order, gameId];
  }
  return { selections, order };
}

function insertAt(list: string[], id: string, index: number): string[] {
  const without = list.filter((x) => x !== id);
  without.splice(index < 0 ? without.length : index, 0, id);
  return without;
}

export function removeSelection(draft: Draft, gameId: string): Draft {
  const selections = { ...draft.selections };
  delete selections[gameId];
  return { selections, order: draft.order.filter((id) => id !== gameId) };
}

export function moveInOrder(order: string[], from: number, to: number): string[] {
  if (to < 0 || to >= order.length || from === to) return order;
  const next = [...order];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item!);
  return next;
}
