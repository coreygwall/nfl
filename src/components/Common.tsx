import { AnimatePresence, animate, motion, useMotionValue, useReducedMotion, useTransform } from "motion/react";
import { TallyLoader } from "./TallyLoader.tsx";
import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from "react";
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

/**
 * How sure you are, as one green in five steps: the five-pointer solid, the rest fading towards
 * paper. Gold used to mark rank 1 and is deliberately gone from here — it is reserved for *place*,
 * the winner of a week or the leader of the season, so a confident pick and a result never read
 * as the same thing.
 *
 * Written out as full class names rather than built from the rank, because Tailwind finds classes
 * by scanning source text and would never emit `bg-rank-${n}`. The "pts" label takes the same
 * colour as the number: a second, dimmer colour is a second contrast pair to keep legal on every
 * step of the ramp, and size and weight already carry the hierarchy.
 */
const RANK_FILL: Record<number, string> = {
  1: "bg-rank-5 text-on-turf",
  2: "bg-rank-4 text-ink",
  3: "bg-rank-3 text-ink",
  4: "bg-rank-2 text-ink",
  5: "bg-rank-1 text-ink",
};

export function RankBadge({ rank, size = "md", muted = false }: { rank: number; size?: "sm" | "md" | "lg"; muted?: boolean }) {
  const points = 6 - rank;
  const dims = size === "lg" ? "h-14 w-14 text-2xl" : size === "sm" ? "h-7 w-7 text-xs" : "h-10 w-10 text-base";
  return (
    <div
      className={`flex shrink-0 flex-col items-center justify-center rounded-xl border-2 border-ink font-display font-extrabold leading-none tabular ${dims} ${
        muted ? "bg-paper-2 text-ink-3" : (RANK_FILL[rank] ?? "bg-surface text-ink")
      }`}
      aria-label={`Rank ${rank}, ${points} points`}
    >
      <span>{points}</span>
      {size !== "sm" && <span className="mt-0.5 text-[9px] font-bold uppercase tracking-wider">pts</span>}
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
 *
 * The `menu` role is a promise about the keyboard, not just a label: a menu takes focus when it
 * opens and arrow keys walk it, which is why the trigger hands focus to the first item and the
 * popover owns Up, Down, Home, End, Escape and Tab. Anything less and a keyboard user gets a
 * widget that announces itself as a menu and then behaves like a stray button.
 */
export function Menu({
  label,
  items,
}: {
  label: string;
  items: { label: string; onSelect: () => void; danger?: boolean; disabled?: boolean }[];
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const wrap = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const enabled = items.reduce<number[]>((acc, item, i) => (item.disabled ? acc : [...acc, i]), []);

  const close = (returnFocus: boolean) => {
    setOpen(false);
    // Escape and a chosen item should leave you where you were, not adrift at the top of the page.
    if (returnFocus) trigger.current?.focus();
  };

  /** The nth item that can actually be focused, or nothing if every item is busy. */
  const nth = (n: number) => enabled[Math.max(0, Math.min(n, enabled.length - 1))];

  const openAt = (edge: "first" | "last") => {
    const at = nth(edge === "first" ? 0 : enabled.length - 1);
    if (at === undefined) return;
    setActive(at);
    setOpen(true);
  };

  const step = (delta: number) => {
    if (enabled.length === 0) return;
    const at = enabled.indexOf(active);
    const next = nth(at < 0 ? 0 : (at + delta + enabled.length) % enabled.length);
    if (next !== undefined) setActive(next);
  };

  // Focus follows the active item, so the arrow keys move the caret and not just a highlight.
  useEffect(() => {
    if (!open) return;
    itemRefs.current[active]?.focus();
  }, [open, active]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [open]);

  const onMenuKey = (e: ReactKeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      close(true);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      step(1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      step(-1);
    } else if (e.key === "Home" || e.key === "End") {
      e.preventDefault();
      const at = nth(e.key === "Home" ? 0 : enabled.length - 1);
      if (at !== undefined) setActive(at);
    } else if (e.key === "Tab") {
      // Let Tab do what Tab does; the menu just gets out of the way.
      setOpen(false);
    }
  };

  return (
    <div ref={wrap} className="relative shrink-0">
      <button
        ref={trigger}
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        className="btn btn-sm h-9 min-h-9 px-2"
        onClick={() => (open ? close(false) : openAt("first"))}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            openAt("first");
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            openAt("last");
          }
        }}
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
            onKeyDown={onMenuKey}
            className="card absolute right-0 top-[calc(100%+6px)] z-30 w-52 overflow-hidden p-1"
          >
            {items.map((item, i) => (
              <button
                key={item.label}
                ref={(el) => {
                  itemRefs.current[i] = el;
                }}
                role="menuitem"
                type="button"
                tabIndex={i === active ? 0 : -1}
                disabled={item.disabled}
                aria-disabled={item.disabled || undefined}
                className={`block w-full rounded-2xl px-3 py-2.5 text-left font-display text-sm font-bold hover:bg-paper-2 disabled:cursor-not-allowed disabled:opacity-40 ${
                  item.danger ? "text-danger" : ""
                }`}
                onClick={() => {
                  close(true);
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
