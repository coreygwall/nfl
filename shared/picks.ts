import { isAbbr } from "./teams.ts";
import type { Game, Pick } from "./types.ts";
import { isLocked } from "./week.ts";

export const MAX_PICKS = 5;

export interface PickInput {
  gameId: string;
  team: string;
  rank: number;
}

export type PickErrorCode =
  | "VALIDATION"
  | "UNKNOWN_GAME"
  | "INVALID_TEAM"
  | "DUPLICATE_GAME"
  | "DUPLICATE_RANK"
  | "TOO_MANY"
  | "GAME_LOCKED"
  | "RANK_FROZEN";

export interface PickError {
  status: 400 | 409;
  code: PickErrorCode;
  message: string;
  details?: Record<string, unknown>;
}

export type PickValidation =
  | { ok: true; frozen: Pick[]; toWrite: Pick[]; final: Pick[] }
  | { ok: false; error: PickError };

const fail = (status: 400 | 409, code: PickErrorCode, message: string, details?: Record<string, unknown>): PickValidation => ({
  ok: false,
  error: { status, code, message, ...(details ? { details } : {}) },
});

/**
 * Validates a submitted set of picks for one week against the schedule, the player's saved picks
 * and the current time. Submitted picks describe the desired state of the player's *unlocked* picks:
 * - picks on games that have kicked off are frozen: they cannot be added, removed, re-teamed or re-ranked;
 * - an exact echo of a frozen pick is accepted and ignored;
 * - omitted unlocked picks are deleted (replace semantics).
 */
export function validatePicks(input: {
  submitted: unknown;
  games: Game[];
  existing: Pick[];
  now: string;
  ignoreLocks?: boolean;
}): PickValidation {
  const { games, existing, now, ignoreLocks = false } = input;
  const raw = input.submitted;
  if (!Array.isArray(raw)) return fail(400, "VALIDATION", "picks must be an array");
  if (raw.length > MAX_PICKS) return fail(400, "TOO_MANY", `Pick at most ${MAX_PICKS} games`);

  const gamesById = new Map(games.map((g) => [g.id, g]));
  const submitted: Pick[] = [];
  const seenGames = new Set<string>();
  const seenRanks = new Set<number>();
  for (const item of raw) {
    if (!item || typeof item !== "object") return fail(400, "VALIDATION", "Each pick must be an object");
    const { gameId, team, rank } = item as Record<string, unknown>;
    if (typeof gameId !== "string") return fail(400, "VALIDATION", "gameId must be a string", { field: "gameId" });
    if (typeof team !== "string") return fail(400, "VALIDATION", "team must be a string", { field: "team" });
    if (!Number.isInteger(rank) || (rank as number) < 1 || (rank as number) > MAX_PICKS) {
      return fail(400, "VALIDATION", `rank must be an integer from 1 to ${MAX_PICKS}`, { field: "rank" });
    }
    const game = gamesById.get(gameId);
    if (!game) return fail(400, "UNKNOWN_GAME", "That game isn't in this week", { gameId });
    if (!isAbbr(team) || (team !== game.away && team !== game.home)) {
      return fail(400, "INVALID_TEAM", "That team isn't playing in that game", { gameId, team });
    }
    if (seenGames.has(gameId)) return fail(400, "DUPLICATE_GAME", "Each game can only be picked once", { gameId });
    if (seenRanks.has(rank as number)) return fail(400, "DUPLICATE_RANK", "Each rank can only be used once", { rank });
    seenGames.add(gameId);
    seenRanks.add(rank as number);
    submitted.push({ gameId, team, rank: rank as number });
  }

  const lockedIds = new Set(ignoreLocks ? [] : games.filter((g) => isLocked(g, now)).map((g) => g.id));
  const frozen = existing.filter((p) => lockedIds.has(p.gameId)).sort((a, b) => a.rank - b.rank);
  const frozenByGame = new Map(frozen.map((p) => [p.gameId, p]));
  const frozenRanks = new Set(frozen.map((p) => p.rank));

  const toWrite: Pick[] = [];
  const lockedViolations: string[] = [];
  for (const p of submitted) {
    if (!lockedIds.has(p.gameId)) {
      toWrite.push(p);
      continue;
    }
    const f = frozenByGame.get(p.gameId);
    if (f && f.team === p.team && f.rank === p.rank) continue; // echo of a frozen pick
    lockedViolations.push(p.gameId);
  }
  if (lockedViolations.length) {
    return fail(409, "GAME_LOCKED", "That game has already kicked off", {
      gameIds: lockedViolations,
      kickoffs: Object.fromEntries(lockedViolations.map((id) => [id, gamesById.get(id)!.kickoffAt])),
    });
  }
  const rankClash = toWrite.filter((p) => frozenRanks.has(p.rank)).map((p) => p.rank);
  if (rankClash.length) {
    return fail(409, "RANK_FROZEN", "That rank belongs to a pick that's already locked", { ranks: rankClash });
  }

  const final = [...frozen, ...toWrite].sort((a, b) => a.rank - b.rank);
  if (final.length > MAX_PICKS) return fail(400, "TOO_MANY", `Pick at most ${MAX_PICKS} games`);
  return { ok: true, frozen, toWrite, final };
}
