import { useState } from "react";
import { motion } from "motion/react";
import { TEAMS, type Abbr } from "../../shared/teams.ts";
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
  dimmed?: boolean;
  /** Straight (no tilt) — used in lists. */
  flat?: boolean;
  badge?: React.ReactNode;
  className?: string;
}

export function TeamSticker({ abbr, size = 72, selected = false, dimmed = false, flat = false, badge, className = "" }: Props) {
  const team = TEAMS[abbr];
  const raster = team.logo.endsWith(".png");
  const tilt = flat ? 0 : tiltFor(abbr);
  const [failed, setFailed] = useState(false);
  return (
    <motion.div
      className={`relative shrink-0 ${className}`}
      style={{ width: size, height: size }}
      initial={false}
      animate={{
        scale: selected ? 1.1 : dimmed ? 0.9 : 1,
        rotate: selected ? 0 : tilt,
        opacity: dimmed ? 0.4 : 1,
        filter: dimmed ? "grayscale(0.7)" : "grayscale(0)",
      }}
      transition={{ type: "spring", stiffness: 520, damping: 24 }}
    >
      {failed ? (
        <div
          role="img"
          aria-label={`${team.city} ${team.nickname}`}
          className="flex h-full w-full items-center justify-center rounded-2xl border-2 border-white font-display font-extrabold text-white shadow-hard-sm"
          style={{ background: team.primary, fontSize: size * 0.34 }}
        >
          {team.display}
        </div>
      ) : (
        <img
          src={team.logo}
          alt={`${team.city} ${team.nickname}`}
          draggable={false}
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
          className={`sticker-img ${raster ? "sticker-raster" : ""} ${selected ? "sticker-shadow" : ""}`}
        />
      )}
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
