import { useSyncExternalStore } from "react";

/**
 * Light, dark, or whatever the device says.
 *
 * "Auto" is the user-facing default and is stored as the *absence* of a preference, so a phone that switches
 * at sunset carries the app with it without anyone having chosen anything. A real choice is written
 * to localStorage and re-applied before the first paint by the inline script in index.html — which
 * is the only reason there is no white flash on the way into a dark app.
 */
export type Theme = "system" | "light" | "dark";

const KEY = "tally.theme";
const LIGHT_CHROME = "#F6F1E8";
const DARK_CHROME = "#1A1713";

export function loadTheme(): Theme {
  if (typeof window === "undefined") return "system";
  try {
    const saved = localStorage.getItem(KEY);
    return saved === "light" || saved === "dark" ? saved : "system";
  } catch {
    return "system";
  }
}

function apply(theme: Theme): void {
  const root = document.documentElement;
  if (theme === "system") delete root.dataset.theme;
  else root.dataset.theme = theme;

  // In Auto, restore each tag's own media-specific colour and let the browser follow the device.
  // With an override, both media branches deliberately carry the same colour.
  for (const tag of document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) {
    tag.content = theme === "system"
      ? tag.media.includes("dark") ? DARK_CHROME : LIGHT_CHROME
      : theme === "dark" ? DARK_CHROME : LIGHT_CHROME;
  }
}

let currentTheme = loadTheme();
const subscribers = new Set<() => void>();

function notify(): void {
  for (const subscriber of subscribers) subscriber();
}

function setTheme(theme: Theme): void {
  if (theme === currentTheme) return;
  currentTheme = theme;
  apply(theme);
  try {
    if (theme === "system") localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, theme);
  } catch {
    /* Private mode, or storage turned off: the choice lasts this visit. */
  }
  notify();
}

function subscribe(subscriber: () => void): () => void {
  subscribers.add(subscriber);
  return () => subscribers.delete(subscriber);
}

if (typeof window !== "undefined") {
  // The inline head script handles first paint; this finishes the job for browser chrome and keeps
  // another open Tally tab in sync without one listener per component.
  apply(currentTheme);
  window.addEventListener("storage", (event) => {
    if (event.key !== KEY) return;
    currentTheme = loadTheme();
    apply(currentTheme);
    notify();
  });
}

export function useTheme(): [Theme, (theme: Theme) => void] {
  const theme = useSyncExternalStore(subscribe, () => currentTheme, (): Theme => "system");
  return [theme, setTheme];
}
