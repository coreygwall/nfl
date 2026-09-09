import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

interface ChromeState {
  navHidden: boolean;
  setNavHidden: (v: boolean) => void;
}
const ChromeContext = createContext<ChromeState>({ navHidden: false, setNavHidden: () => {} });

export function ChromeProvider({ children }: { children: ReactNode }) {
  const [navHidden, setNavHidden] = useState(false);
  return <ChromeContext.Provider value={{ navHidden, setNavHidden }}>{children}</ChromeContext.Provider>;
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
