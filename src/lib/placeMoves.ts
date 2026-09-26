import { useEffect, useRef, useState } from "react";

interface Placed {
  playerId: string;
  place: number;
}

/**
 * Who moved between two looks at the same board: positive is up the table.
 *
 * The board refetches itself through a Sunday, and the rows already glide to their new places
 * (`layout` on each row). This is the other half: for a few seconds each row that moved wears how
 * far — ▲2, ▼1 — which is the difference between a table and a scoreboard. Only a player on both
 * boards can have moved. TallyKit's `PlaceMoves` is the same rule.
 */
export function placeMoves(before: readonly Placed[], after: readonly Placed[]): Record<string, number> {
  const was = new Map(before.map((r) => [r.playerId, r.place]));
  const moved: Record<string, number> = {};
  for (const row of after) {
    const old = was.get(row.playerId);
    if (old !== undefined && old !== row.place) moved[row.playerId] = old - row.place;
  }
  return moved;
}

/**
 * The moves on the latest change to `rows`, cleared after `ms`. `key` names which board this is —
 * a different week is a different table, not a reshuffle of this one, so changing it resets.
 */
export function usePlaceMoves(rows: readonly Placed[] | undefined, key: unknown, ms = 6000): Record<string, number> {
  const last = useRef<{ key: unknown; rows: readonly Placed[] } | null>(null);
  const [moves, setMoves] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!rows) return;
    const prev = last.current;
    last.current = { key, rows };
    if (!prev || prev.key !== key) {
      setMoves({});
      return;
    }
    const moved = placeMoves(prev.rows, rows);
    if (Object.keys(moved).length > 0) setMoves(moved);
  }, [rows, key]);

  // Its own effect, so a refetch that moves nobody neither wipes the chips early nor strands them.
  useEffect(() => {
    if (Object.keys(moves).length === 0) return;
    const t = setTimeout(() => setMoves({}), ms);
    return () => clearTimeout(t);
  }, [moves, ms]);

  return moves;
}
