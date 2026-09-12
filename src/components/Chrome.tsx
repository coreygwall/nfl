import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { WEEKS } from "../../shared/week.ts";

export interface HeaderWeek {
  week: number;
  max: number;
}

interface ChromeState {
  navHidden: boolean;
  setNavHidden: (v: boolean) => void;
  /** Week the header stepper is showing, or null when the screen has no week. */
  headerWeek: HeaderWeek | null;
  setHeaderWeek: (v: HeaderWeek | null) => void;
  /** Stable handler that forwards to whichever screen registered the week. */
  changeWeek: (w: number) => void;
  weekHandler: RefObject<(w: number) => void>;
}

const noop = () => {};
const ChromeContext = createContext<ChromeState>({
  navHidden: false,
  setNavHidden: noop,
  headerWeek: null,
  setHeaderWeek: noop,
  changeWeek: noop,
  weekHandler: { current: noop },
});

export function ChromeProvider({ children }: { children: ReactNode }) {
  const [navHidden, setNavHidden] = useState(false);
  const [headerWeek, setHeaderWeekState] = useState<HeaderWeek | null>(null);
  const weekHandler = useRef<(w: number) => void>(noop);

  // Compare by value: screens re-register on every render, and a new object each time
  // would loop through state forever.
  const setHeaderWeek = useCallback((next: HeaderWeek | null) => {
    setHeaderWeekState((prev) => {
      if (prev === next) return prev;
      if (prev && next && prev.week === next.week && prev.max === next.max) return prev;
      return next;
    });
  }, []);
  const changeWeek = useCallback((w: number) => weekHandler.current(w), []);

  return (
    <ChromeContext.Provider value={{ navHidden, setNavHidden, headerWeek, setHeaderWeek, changeWeek, weekHandler }}>
      {children}
    </ChromeContext.Provider>
  );
}

export const useChrome = () => useContext(ChromeContext);

/** Hides the bottom nav while mounted with `hidden` true. */
export function useHideNav(hidden: boolean) {
  const { setNavHidden } = useChrome();
  useEffect(() => {
    setNavHidden(hidden);
    return () => setNavHidden(false);
  }, [hidden, setNavHidden]);
}

/** Puts this screen's week stepper in the app header while mounted. */
export function useHeaderWeek(week: number | null, onChange: (w: number) => void, max: number = WEEKS) {
  const { setHeaderWeek, weekHandler } = useChrome();
  useEffect(() => {
    weekHandler.current = onChange;
  });
  useEffect(() => {
    setHeaderWeek(week === null ? null : { week, max });
    return () => setHeaderWeek(null);
  }, [week, max, setHeaderWeek]);
}
