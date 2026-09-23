import { motion } from "motion/react";
import { labelIsDark, TEAMS, type Abbr } from "../../shared/teams.ts";
import { Check } from "./Icons.tsx";

export function tiltFor(abbr: string): number {
  let h = 0;
  for (const ch of abbr) h = (h * 31 + ch.charCodeAt(0)) % 997;
  return (h % 9) - 4; // -4..4 degrees
}

interface Props {
  abbr: Abbr;
  size?: number;
  selected?: boolean;
  /** Not chosen — the other side of a matchup while you are picking. Pushed right back. */
  dimmed?: boolean;
  /**
   * Beaten. Held back, but nothing like as far as `dimmed`: the surrounding pill has already gone
   * red, and a logo at a fifth of its colour on a pink ground reads as washed out rather than as
   * lost. It also keeps its size, so a row of finished picks stays level.
   */
  lost?: boolean;
  /** Straight (no tilt) — used in lists. */
  flat?: boolean;
  badge?: React.ReactNode;
  className?: string;
}

export function TeamSticker({ abbr, size = 72, selected = false, dimmed = false, lost = false, flat = false, badge, className = "" }: Props) {
  const team = TEAMS[abbr];
  const tilt = flat ? 0 : tiltFor(abbr);
  return (
    <motion.div
      className={`relative shrink-0 ${className}`}
      style={{ width: size, height: size }}
      initial={false}
      animate={{
        scale: selected ? 1.1 : dimmed ? 0.9 : 1,
        rotate: selected ? 0 : tilt,
        opacity: dimmed ? 0.4 : lost ? 0.65 : 1,
        filter: dimmed ? "grayscale(0.7)" : lost ? "grayscale(0.55)" : "grayscale(0)",
      }}
      transition={{ type: "spring", stiffness: 520, damping: 24 }}
    >
      <div
        role="img"
        aria-label={`${team.city} ${team.nickname}`}
        className={`relative flex h-full w-full items-center justify-center font-display font-extrabold ${selected ? "sticker-shadow" : ""}`}
        style={{ background: team.primary, borderRadius: size * 0.26, color: labelIsDark(team.primary) ? "#000" : "#fff" }}
      >
        <span
          aria-hidden
          className="absolute"
          style={{ inset: size * 0.07, border: `${Math.max(1.5, size * 0.045)}px solid ${team.secondary}`, borderRadius: size * 0.26 * 0.8 }}
        />
        <span className="relative leading-none" style={{ fontSize: size * (team.display.length > 2 ? 0.3 : 0.36) }}>
          {team.display}
        </span>
      </div>
      {selected && (
        <motion.span
          initial={{ scale: 0, rotate: -30 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: "spring", stiffness: 600, damping: 20 }}
          className="absolute -right-1 -top-1 flex h-6 w-6 items-center justify-center rounded-full border-2 border-white text-white shadow-hard-sm"
          style={{ background: team.primary }}
        >
          <Check size={14} strokeWidth={3.2} />
        </motion.span>
      )}
      {badge}
    </motion.div>
  );
}
