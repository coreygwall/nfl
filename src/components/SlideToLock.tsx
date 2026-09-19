import { useRef, useState } from "react";
import { ChevronRight, Lock } from "./Icons.tsx";

/** Distance is forgiving; velocity only counts after a deliberate forward drag. */
export function shouldLock(distance: number, travel: number, velocity: number) {
  return travel > 0 && (distance >= travel * 0.55 || (distance >= travel * 0.25 && velocity >= 0.45));
}

export function slideProgress(offset: number, travel: number) {
  return travel > 0 ? Math.max(0, Math.min(1, offset / travel)) : 0;
}

/**
 * What the track says as the thumb crosses it.
 *
 * `words` is the golf card's door in: a hole is finished with the same deliberate gesture the pool
 * locks picks with, and the only thing that differs is the noun. Defaulted rather than required so
 * the pick flow — and this function's own tests — read exactly as they did.
 */
export interface SlideWords {
  /** At rest. */
  idle: string;
  /** Past a quarter. */
  keep: string;
  /** Past the commit line. */
  release: string;
  /** In flight. */
  pending: string;
  /** The tap-instead fallback under the track. */
  tap: string;
  /** The line above it. */
  help: string;
}

export const LOCK_WORDS: SlideWords = {
  idle: "Slide to lock in",
  keep: "Keep sliding →",
  release: "Release to lock it in",
  pending: "Locking in…",
  tap: "Or tap to lock it in",
  help: "Hold the arrow and slide right to lock in",
};

export function slideLabel(progress: number, pending: boolean, words: SlideWords = LOCK_WORDS) {
  if (pending) return words.pending;
  if (progress >= 0.55) return words.release;
  if (progress >= 0.28) return words.keep;
  return words.idle;
}

export function SlideToLock({
  disabled,
  pending,
  onSubmit,
  words = LOCK_WORDS,
}: {
  disabled: boolean;
  pending: boolean;
  onSubmit: () => void;
  words?: SlideWords;
}) {
  const track = useRef<HTMLDivElement>(null);
  const gesture = useRef<{ id: number; start: number; last: number; time: number; velocity: number; travel: number } | null>(null);
  const [offset, setOffset] = useState(0);
  const [travel, setTravel] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [locked, setLocked] = useState(false);
  const progress = locked ? 1 : slideProgress(offset, travel);
  const label = slideLabel(progress, pending, words);
  const reset = () => { gesture.current = null; setDragging(false); setLocked(false); setOffset(0); setTravel(0); };
  return (
    <div className="mobile-lock w-full">
      <p className="mb-2 text-center text-sm font-semibold text-ink-2" id="slide-lock-help">{words.help}</p>
      <div ref={track} className="relative h-16 overflow-hidden rounded-full border-2 border-ink bg-turf text-on-turf shadow-hard-sm" style={{ opacity: disabled && !pending ? 0.5 : 1 }}>
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 left-0 w-full origin-left bg-flag/30"
          style={{ transform: `scaleX(${progress})`, transition: dragging ? "none" : "transform 180ms ease-out" }}
        />
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 left-0 w-full origin-left bg-paper/15"
          style={{ transform: `scaleX(${Math.max(0, progress - 0.08)})`, transition: dragging ? "none" : "transform 180ms ease-out" }}
        />
        <span className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center gap-2 pl-12 font-display font-bold" aria-live="polite">
          {label} <Lock size={18} />
        </span>
        <button
          type="button" aria-label={`${words.idle}, ${Math.round(progress * 100)}% complete`} aria-describedby="slide-lock-help" disabled={disabled}
          className="absolute left-1 top-1 z-20 flex h-[52px] w-[52px] items-center justify-center rounded-full border-2 border-ink bg-flag text-ink shadow-hard-sm"
          style={{ touchAction: "none", transform: `translateX(${offset}px) scale(${dragging ? 1 + progress * 0.06 : 1})`, transition: dragging ? "none" : "transform 180ms ease-out" }}
          onClick={(event) => { if (event.detail === 0 && !disabled) onSubmit(); }}
          onPointerDown={(event) => {
            if (disabled || !event.isPrimary || event.button !== 0) return;
            const travel = Math.max(0, (track.current?.clientWidth ?? 0) - 60);
            gesture.current = { id: event.pointerId, start: event.clientX, last: event.clientX, time: event.timeStamp, velocity: 0, travel };
            event.currentTarget.setPointerCapture(event.pointerId);
            setTravel(travel); setOffset(0); setLocked(false); setDragging(true);
          }}
          onPointerMove={(event) => {
            const g = gesture.current;
            if (!g || g.id !== event.pointerId) return;
            const elapsed = event.timeStamp - g.time;
            if (elapsed > 0) g.velocity = (event.clientX - g.last) / elapsed;
            g.last = event.clientX; g.time = event.timeStamp;
            setOffset(Math.max(0, Math.min(g.travel, event.clientX - g.start)));
          }}
          onPointerUp={(event) => {
            const g = gesture.current;
            if (!g || g.id !== event.pointerId) return;
            const distance = Math.max(0, Math.min(g.travel, event.clientX - g.start));
            const velocity = event.timeStamp - g.time < 100 ? g.velocity : 0;
            const commit = !disabled && shouldLock(distance, g.travel, velocity);
            gesture.current = null;
            setDragging(false);
            if (commit) { setOffset(g.travel); setLocked(true); navigator.vibrate?.(25); onSubmit(); }
            else reset();
          }}
          onPointerCancel={reset} onLostPointerCapture={() => { if (gesture.current) reset(); }}
        ><ChevronRight size={28} style={{ transform: `scale(${1 + progress * 0.22})`, transition: dragging ? "none" : "transform 180ms ease-out" }} /></button>
      </div>
      <button type="button" className="mt-3 min-h-11 w-full text-sm font-semibold underline" disabled={disabled} onClick={onSubmit}>{words.tap}</button>
    </div>
  );
}
