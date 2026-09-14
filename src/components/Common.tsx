import { AnimatePresence, animate, motion, useMotionValue, useReducedMotion, useTransform } from "motion/react";
import { TallyLoader } from "./TallyLoader.tsx";
import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { MoreHorizontal } from "./Icons.tsx";

/**
 * Kept as the name every screen already imports, so the app has one wait rather than two. What it
 * draws is the tally mark, not a ring — see `TallyLoader`.
 */
export function Spinner({ label = "Loading…" }: { label?: string }) {
  return <TallyLoader label={label} />;
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="card mx-auto my-8 max-w-sm p-6 text-center">
      <p className="font-display text-xl font-bold">Hmm, that didn't load.</p>
      <p className="mt-1 text-sm text-ink-2">{message}</p>
      {onRetry && (
        <button className="btn btn-sm mt-4" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  );
}

export function EmptyState({ title, body, action }: { title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="card-flat border-dashed bg-paper-2/60 px-5 py-8 text-center">
      <p className="font-display text-lg font-bold">{title}</p>
      {body && <p className="mt-1 text-sm text-ink-2">{body}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function RankBadge({ rank, size = "md", muted = false }: { rank: number; size?: "sm" | "md" | "lg"; muted?: boolean }) {
  const points = 6 - rank;
  const dims = size === "lg" ? "h-14 w-14 text-2xl" : size === "sm" ? "h-7 w-7 text-xs" : "h-10 w-10 text-base";
  return (
    <div
      className={`flex shrink-0 flex-col items-center justify-center rounded-xl border-2 border-ink font-display font-extrabold leading-none tabular ${dims} ${
        muted ? "bg-paper-2 text-ink-3" : rank === 1 ? "bg-flag" : "bg-surface"
      }`}
      aria-label={`Rank ${rank}, ${points} points`}
    >
      <span>{points}</span>
      {size !== "sm" && <span className="mt-0.5 text-[9px] font-bold uppercase tracking-wider text-ink-2">pts</span>}
    </div>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
  pillId = "segmented-pill",
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  label?: string;
  /** Distinct per control, so two on one screen don't animate into each other. */
  pillId?: string;
}) {
  return (
    <div className="card-flat relative flex w-full p-1" role="tablist" aria-label={label}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <motion.button
            key={o.value}
            role="tab"
            aria-selected={active}
            // Two of these sit side by side on a phone, so the text tightens rather than wraps.
            className={`relative z-10 min-w-0 flex-1 truncate rounded-2xl px-2 py-2 font-display text-[13px] font-bold transition-colors sm:px-3 sm:text-sm ${
              active ? "text-paper" : "text-ink-2"
            }`}
            whileTap={{ scale: 0.96 }}
            transition={{ type: "spring", stiffness: 600, damping: 30 }}
            onClick={() => {
              if (!active) navigator.vibrate?.(6);
              onChange(o.value);
            }}
          >
            {active && (
              <motion.span
                layoutId={pillId}
                className="absolute inset-0 -z-10 rounded-2xl bg-ink"
                transition={{ type: "spring", stiffness: 500, damping: 35 }}
              />
            )}
            {/* The label leans in as the pill arrives under it, so the eye follows the change. */}
            <motion.span
              className="block"
              animate={{ scale: active ? 1 : 0.97, opacity: active ? 1 : 0.82 }}
              transition={{ type: "spring", stiffness: 500, damping: 32 }}
            >
              {o.label}
            </motion.span>
          </motion.button>
        );
      })}
    </div>
  );
}

/**
 * A number that counts to its new value instead of snapping to it.
 *
 * Points on the board change while you are looking at them — a game finishes, the poll comes back,
 * and a 7 becomes a 12. Snapping tells you the number is different; counting tells you it went
 * *up*, which is the part worth knowing. Rounded on the way so it never shows a fraction of a
 * point, and pinned to the value outright when the reader has asked for less motion.
 */
export function CountUp({ value, className }: { value: number; className?: string }) {
  const motionValue = useMotionValue(value);
  const rounded = useTransform(motionValue, (v) => Math.round(v));
  const reduced = useReducedMotion();

  useEffect(() => {
    if (reduced) {
      motionValue.set(value);
      return;
    }
    const controls = animate(motionValue, value, { duration: 0.55, ease: [0.16, 1, 0.3, 1] });
    return () => controls.stop();
  }, [value, motionValue, reduced]);

  return (
    <motion.span className={className} aria-label={`${value}`}>
      {rounded}
    </motion.span>
  );
}

/**
 * The rare actions, folded away.
 *
 * A roster row used to carry five equally-weighted buttons, and thirteen rows carried sixty-five —
 * every one of them shouting at the same volume whether you use it every Sunday or once a season.
 * Rename, reset access and remove are once-a-season; they live in here, and what is left on the row
 * is the thing you actually came to do.
 */
export function Menu({
  label,
  items,
}: {
  label: string;
  items: { label: string; onSelect: () => void; danger?: boolean }[];
}) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      // Escape should leave you where you were, not adrift at the top of the page.
      trigger.current?.focus();
    };
    const onDown = (e: MouseEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onDown);
    };
  }, [open]);

  return (
    <div ref={wrap} className="relative shrink-0">
      <button
        ref={trigger}
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        className="btn btn-sm h-9 min-h-9 px-2"
        onClick={() => setOpen((v) => !v)}
      >
        <MoreHorizontal />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            role="menu"
            aria-label={label}
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.12 }}
            className="card absolute right-0 top-[calc(100%+6px)] z-30 w-52 overflow-hidden p-1"
          >
            {items.map((item) => (
              <button
                key={item.label}
                role="menuitem"
                className={`block w-full rounded-2xl px-3 py-2.5 text-left font-display text-sm font-bold hover:bg-paper-2 ${
                  item.danger ? "text-danger" : ""
                }`}
                onClick={() => {
                  setOpen(false);
                  item.onSelect();
                }}
              >
                {item.label}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
