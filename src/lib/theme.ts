import { useEffect, useState } from "react";

/**
 * Light, dark, or whatever the device says.
 *
 * "System" is the default and is stored as the *absence* of a preference, so a phone that switches
 * at sunset carries the app with it without anyone having chosen anything. A real choice is written
 * to localStorage and re-applied before the first paint by the inline script in index.html — which
 * is the only reason there is no white flash on the way into a dark app.
 */
export type Theme = "system" | "light" | "dark";

const KEY = "tally.theme";

export function loadTheme(): Theme {
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
  // The browser chrome — the address bar on Android, the status bar area on iOS — follows the
  // page rather than the system once a preference is set.
  const dark = theme === "dark" || (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  for (const tag of document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) {
    tag.content = dark ? "#1A1713" : "#F6F1E8";
  }
}

export function useTheme(): [Theme, (t: Theme) => void] {
  const [theme, setTheme] = useState<Theme>(loadTheme);

  useEffect(() => {
    apply(theme);
    try {
      if (theme === "system") localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, theme);
    } catch {
      /* Private mode, or storage turned off: the choice lasts this visit. */
    }
  }, [theme]);

  // On "system", follow the device if it changes while the tab is open.
  useEffect(() => {
    if (theme !== "system") return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => apply("system");
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [theme]);

  return [theme, setTheme];
}
