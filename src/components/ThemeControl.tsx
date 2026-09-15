import type { ComponentType, SVGProps } from "react";
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
