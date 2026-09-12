import { motion } from "motion/react";
import type { ReactNode } from "react";

export function Spinner({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-ink-3">
      <motion.div
        className="h-9 w-9 rounded-full border-4 border-ink border-t-flag"
        animate={{ rotate: 360 }}
        transition={{ repeat: Infinity, duration: 0.9, ease: "linear" }}
      />
      <span className="text-sm font-semibold">{label}</span>
    </div>
  );
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
        muted ? "bg-paper-2 text-ink-3" : rank === 1 ? "bg-flag" : "bg-white"
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
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="card-flat relative flex p-1 sm:max-w-[420px]" role="tablist">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.value)}
            className={`relative z-10 flex-1 rounded-2xl px-3 py-2 font-display text-sm font-bold transition-colors ${
              active ? "text-paper" : "text-ink-2"
            }`}
          >
            {active && (
              <motion.span
                layoutId="segmented-pill"
                className="absolute inset-0 -z-10 rounded-2xl bg-ink"
                transition={{ type: "spring", stiffness: 500, damping: 35 }}
              />
            )}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
