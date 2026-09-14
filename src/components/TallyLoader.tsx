import { TEAMS } from "../../shared/teams.ts";
import type { Abbr } from "../../shared/teams.ts";

/**
 * The loading animation.
 *
 * A spinning ring is what every app uses while it waits. This one draws a tally mark — four
 * strokes and the diagonal — because that is what the app is called, and because five is the
 * number the whole pool is built on. It draws, holds, and rubs out, which is also roughly what a
 * week does.
 *
 * Pure CSS: no JavaScript ticking at sixty frames a second behind a request that is already the
 * slow part. `prefers-reduced-motion` gets the finished mark, sitting still.
 */
export function TallyLoader({ label = "Loading…", size = 64 }: { label?: string | null; size?: number }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-ink-3" role="status" aria-live="polite">
      <TallyMark size={size} />
      {label && <span className="text-sm font-semibold">{label}</span>}
      <span className="sr-only">{label ?? "Loading"}</span>
    </div>
  );
}

/**
 * The mark itself, without the furniture — small enough to sit inside a button or a card while
 * one part of a page catches up.
 */
export function TallyMark({ size = 64 }: { size?: number }) {
  // Four uprights and the slash across them, in a 56x40 box. The slash is gold so the fifth
  // stroke reads as the one that completes the set, which is the whole point of a tally.
  const uprights = [7, 18, 29, 40];
  return (
    <svg
      width={size}
      height={(size * 40) / 56}
      viewBox="0 0 56 40"
      fill="none"
      aria-hidden="true"
      className="tally-mark overflow-visible"
    >
      {uprights.map((x, i) => (
        <line
          key={x}
          x1={x}
          y1={7}
          x2={x}
          y2={33}
          pathLength={1}
          stroke="var(--color-ink)"
          strokeWidth={4}
          strokeLinecap="round"
          className="tally-stroke"
          style={{ "--i": i } as React.CSSProperties}
        />
      ))}
      <line
        x1={2}
        y1={33}
        x2={48}
        y2={7}
        pathLength={1}
        stroke="var(--color-flag)"
        strokeWidth={4.5}
        strokeLinecap="round"
        className="tally-stroke"
        style={{ "--i": 4 } as React.CSSProperties}
      />
    </svg>
  );
}

/**
 * The board, before the board arrives.
 *
 * The board is the screen people open most, and it has a shape they already know: five rows, a
 * place badge, a name, a number on the right. Drawing that shape while it loads says "your board
 * is coming" where a spinner in the middle of an empty page says "something is happening
 * somewhere". It also stops the page jumping when the real rows land.
 */
export function BoardSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div aria-hidden="true" className="space-y-2">
      {Array.from({ length: rows }, (_, i) => (
        <div
          key={i}
          className="card-flat flex items-center gap-3 p-3 shimmer"
          style={{ animationDelay: `${i * 90}ms`, opacity: 1 - i * 0.12 }}
        >
          <div className="h-9 w-9 shrink-0 rounded-full bg-paper-2" />
          <div className="min-w-0 flex-1 space-y-1.5">
            <div className="h-4 rounded bg-paper-2" style={{ width: `${45 + ((i * 13) % 30)}%` }} />
            <div className="h-3 w-2/5 rounded bg-paper-2/70" />
          </div>
          <div className="h-7 w-10 shrink-0 rounded bg-paper-2" />
        </div>
      ))}
    </div>
  );
}

/**
 * While a week's games load. Same idea as the board: the shape of a matchup, so the page does not
 * reflow under someone's thumb the moment it arrives.
 */
export function GamesSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div aria-hidden="true" className="space-y-3">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="card-flat p-3 shimmer" style={{ animationDelay: `${i * 90}ms`, opacity: 1 - i * 0.14 }}>
          <div className="mb-3 h-3 w-24 rounded bg-paper-2" />
          <div className="flex items-center gap-3">
            <div className="h-12 flex-1 rounded-2xl bg-paper-2" />
            <div className="h-3 w-6 rounded bg-paper-2/70" />
            <div className="h-12 flex-1 rounded-2xl bg-paper-2" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** A sticker fanning through a few teams — used where a small, lighter wait reads better. */
export function StickerShuffle({ size = 44 }: { size?: number }) {
  const deck: Abbr[] = ["BUF", "KC", "PHI", "SF", "DAL"];
  return (
    <span className="sticker-shuffle relative inline-block" style={{ width: size, height: size }} aria-hidden="true">
      {deck.map((abbr, i) => (
        <img
          key={abbr}
          src={TEAMS[abbr].logo}
          alt=""
          className="absolute inset-0 h-full w-full object-contain"
          style={{ "--i": i, "--n": deck.length } as React.CSSProperties}
        />
      ))}
    </span>
  );
}
