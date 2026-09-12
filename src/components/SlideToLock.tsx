import { useRef, useState } from "react";
import { ChevronRight, Lock } from "./Icons.tsx";

/** Distance is forgiving; velocity only counts after a deliberate forward drag. */
export function shouldLock(distance: number, travel: number, velocity: number) {
  return travel > 0 && (distance >= travel * 0.55 || (distance >= travel * 0.25 && velocity >= 0.45));
}

export function SlideToLock({ disabled, pending, onSubmit }: { disabled: boolean; pending: boolean; onSubmit: () => void }) {
  const track = useRef<HTMLDivElement>(null);
  const gesture = useRef<{ id: number; start: number; last: number; time: number; velocity: number; travel: number } | null>(null);
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const reset = () => { gesture.current = null; setDragging(false); setOffset(0); };
  return (
    <div className="mobile-lock w-full">
      <p className="mb-2 text-center text-sm font-semibold text-ink-2" id="slide-lock-help">Hold the arrow and slide right to lock in</p>
      <div ref={track} className="relative h-16 overflow-hidden rounded-full border-2 border-ink bg-turf text-white shadow-hard-sm" style={{ opacity: disabled && !pending ? 0.5 : 1 }}>
        <span className="pointer-events-none absolute inset-0 flex items-center justify-center gap-2 pl-12 font-display font-bold" aria-live="polite">
          {pending ? "Saving…" : "Slide to lock in"} <Lock size={18} />
        </span>
        <button
          type="button" aria-label="Lock it in" aria-describedby="slide-lock-help" disabled={disabled}
          className="absolute left-1 top-1 flex h-[52px] w-[52px] items-center justify-center rounded-full border-2 border-ink bg-flag text-ink"
          style={{ touchAction: "none", transform: `translateX(${offset}px)`, transition: dragging ? "none" : "transform 180ms ease-out" }}
          onClick={(event) => { if (event.detail === 0 && !disabled) onSubmit(); }}
          onPointerDown={(event) => {
            if (disabled || !event.isPrimary || event.button !== 0) return;
            const travel = Math.max(0, (track.current?.clientWidth ?? 0) - 60);
            gesture.current = { id: event.pointerId, start: event.clientX, last: event.clientX, time: event.timeStamp, velocity: 0, travel };
            event.currentTarget.setPointerCapture(event.pointerId);
            setDragging(true);
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
            reset();
            if (commit) { navigator.vibrate?.(25); onSubmit(); }
          }}
          onPointerCancel={reset} onLostPointerCapture={reset}
        ><ChevronRight size={28} /></button>
      </div>
      <button type="button" className="mt-3 min-h-11 w-full text-sm font-semibold underline" disabled={disabled} onClick={onSubmit}>Or tap to lock it in</button>
    </div>
  );
}
