import { AnimatePresence, motion } from "motion/react";
import { useSyncExternalStore, type ComponentType, type SVGProps } from "react";
import { ChevronDown, Device, Moon, Sun } from "./Icons.tsx";
import { useTheme, type Theme } from "../lib/theme.ts";

type ThemeOption = {
  value: Theme;
  label: string;
  Icon: ComponentType<SVGProps<SVGSVGElement> & { size?: number }>;
};

const AUTO_OPTION: ThemeOption = { value: "system", label: "Auto", Icon: Device };
const OPTIONS: ThemeOption[] = [
  AUTO_OPTION,
  { value: "light", label: "Light", Icon: Sun },
  { value: "dark", label: "Dark", Icon: Moon },
];

/** The full, explicit choice used in account settings. */
export function ThemePicker() {
  const [theme, setTheme] = useTheme();
  return (
    <div>
      <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Appearance">
        {OPTIONS.map(({ value, label, Icon }) => {
          const active = theme === value;
          return (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={active}
              className={`btn btn-sm gap-1.5 px-2 ${active ? "btn-primary" : ""}`}
              onClick={() => setTheme(value)}
            >
              <Icon size={16} />
              {label}
            </button>
          );
        })}
      </div>
      <p className="mt-2 text-xs text-ink-2">Auto matches your phone or computer. Your choice stays on this device.</p>
    </div>
  );
}

/** A quick native menu for headers, including the public site before anyone has an account. */
export function CompactThemeSelect({ showLabel = false }: { showLabel?: boolean }) {
  const [theme, setTheme] = useTheme();
  const selected = OPTIONS.find((option) => option.value === theme) ?? AUTO_OPTION;
  const Icon = selected.Icon;
  return (
    <label
      className={`chip relative min-h-10 cursor-pointer justify-center px-2.5 ${showLabel ? "sm:min-w-[92px]" : "w-10"}`}
      title={`Appearance: ${selected.label}`}
    >
      <Icon size={17} />
      {showLabel ? <span className="hidden sm:inline">{selected.label}</span> : null}
      {showLabel ? <ChevronDown className="hidden sm:block" size={14} /> : null}
      <select
        aria-label="Appearance quick setting"
        className="absolute inset-0 cursor-pointer opacity-0"
        value={theme}
        onChange={(event) => setTheme(event.target.value as Theme)}
      >
        {OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </label>
  );
}

function subscribeToSystemColorScheme(listener: () => void): () => void {
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  media.addEventListener("change", listener);
  return () => media.removeEventListener("change", listener);
}

function useSystemDark(): boolean {
  return useSyncExternalStore(
    subscribeToSystemColorScheme,
    () => window.matchMedia("(prefers-color-scheme: dark)").matches,
    () => false,
  );
}

/** A one-click, desktop-header shortcut. Auto remains available in the account menu. */
export function ThemeToggle({ className = "" }: { className?: string }) {
  const [theme, setTheme] = useTheme();
  const systemDark = useSystemDark();
  const dark = theme === "dark" || (theme === "system" && systemDark);
  const next = dark ? "light" : "dark";

  return (
    <button
      type="button"
      className={`relative inline-flex h-10 w-[76px] items-center rounded-full border-2 border-ink bg-surface p-1 transition-colors hover:bg-paper-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink ${className}`}
      aria-label={`Switch to ${next} mode`}
      aria-pressed={dark}
      onClick={() => setTheme(next)}
    >
      <span className="absolute left-2.5 text-ink-3" aria-hidden="true"><Sun size={16} /></span>
      <span className="absolute right-2.5 text-ink-3" aria-hidden="true"><Moon size={16} /></span>
      <motion.span
        className="relative z-10 flex h-7 w-7 items-center justify-center rounded-full bg-ink text-paper shadow-sm"
        animate={{ x: dark ? 36 : 0, rotate: dark ? 180 : 0 }}
        transition={{ type: "spring", stiffness: 500, damping: 32 }}
      >
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={dark ? "moon" : "sun"}
            initial={{ opacity: 0, scale: 0.6, rotate: -45 }}
            animate={{ opacity: 1, scale: 1, rotate: 0 }}
            exit={{ opacity: 0, scale: 0.6, rotate: 45 }}
            transition={{ duration: 0.14 }}
            aria-hidden="true"
          >
            {dark ? <Moon size={15} /> : <Sun size={15} />}
          </motion.span>
        </AnimatePresence>
      </motion.span>
    </button>
  );
}
