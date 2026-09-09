import { useEffect, useState } from "react";
import { nowIso, nowMs } from "./clock.ts";

/** Re-renders on an interval so countdowns and lock states stay fresh. */
export function useNow(tickMs = 30_000): string {
  const [now, setNow] = useState(nowIso);
  useEffect(() => {
    const id = setInterval(() => setNow(nowIso()), tickMs);
    return () => clearInterval(id);
  }, [tickMs]);
  return now;
}

const dayFmt = new Intl.DateTimeFormat(undefined, { weekday: "long", month: "short", day: "numeric" });
const shortDayFmt = new Intl.DateTimeFormat(undefined, { weekday: "short", month: "short", day: "numeric" });
const timeFmt = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" });
const timeTzFmt = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit", timeZoneName: "short" });

export const formatDay = (iso: string): string => dayFmt.format(new Date(iso));
export const formatShortDay = (iso: string): string => shortDayFmt.format(new Date(iso));
export const formatTime = (iso: string): string => timeFmt.format(new Date(iso));
export const formatTimeTz = (iso: string): string => timeTzFmt.format(new Date(iso));
const slotFmt = new Intl.DateTimeFormat(undefined, { weekday: "short" });
/** Compact kickoff for dense cards: "Sun 10:00 AM". */
export const formatSlot = (iso: string): string => `${slotFmt.format(new Date(iso))} ${timeFmt.format(new Date(iso))}`;

export const formatKickoff = (iso: string): string => `${shortDayFmt.format(new Date(iso))} · ${timeFmt.format(new Date(iso))}`;

/** Local calendar day key for grouping. */
export function dayKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

export function formatCountdown(targetIso: string, from: number = nowMs()): string {
  const diff = Date.parse(targetIso) - from;
  if (diff <= 0) return "now";
  const m = Math.floor(diff / 60_000);
  const h = Math.floor(m / 60);
  const d = Math.floor(h / 24);
  if (d >= 2) return `${d}d ${h % 24}h`;
  if (h >= 1) return `${h}h ${m % 60}m`;
  return `${Math.max(m, 1)}m`;
}
