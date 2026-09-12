import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import {
  clearPlayer,
  loadStore,
  savePlayer,
  setActivePlayer,
  syncAccountEntries,
  type Identity,
} from "./identity.ts";
import { api } from "../api/client.ts";

interface PlayerContextValue {
  player: Identity | null;
  /** Every name this device can pick as — usually one, more when a parent picks for the family. */
  people: Identity[];
  setPlayer: (p: Identity) => void;
  syncEntries: (accountId: string, entries: Identity[], token?: string) => void;
  switchTo: (id: string) => void;
  forget: (id: string) => void;
  signOut: () => void;
}

const PlayerContext = createContext<PlayerContextValue | null>(null);

/** Moves the session cookie to whoever we are picking as now. Best effort: the header still rules. */
function syncSession(p: Identity | null): void {
  if (!p?.token) return;
  void api("/session", { method: "POST", body: {}, token: p.token }).catch(() => {});
}

export function PlayerProvider({ children }: { children: ReactNode }) {
  const [store, setStore] = useState(loadStore);
  const player = useMemo(
    () => store.people.find((p) => p.id === store.activeId) ?? store.people[0] ?? null,
    [store],
  );

  const setPlayer = useCallback((p: Identity) => {
    setStore(savePlayer(p));
    syncSession(p);
  }, []);

  const syncEntries = useCallback((accountId: string, entries: Identity[], token?: string) => {
    const next = syncAccountEntries(accountId, entries, token);
    setStore((previous) => JSON.stringify(previous) === JSON.stringify(next) ? previous : next);
  }, []);

  const switchTo = useCallback((id: string) => {
    const next = setActivePlayer(id);
    setStore(next);
    syncSession(next.people.find((p) => p.id === next.activeId) ?? null);
  }, []);

  const forget = useCallback((id: string) => {
    const next = clearPlayer(id);
    setStore(next);
    syncSession(next.people.find((p) => p.id === next.activeId) ?? null);
  }, []);

  const signOut = useCallback(() => {
    setStore(clearPlayer());
    void api("/session", { method: "DELETE" }).catch(() => {});
  }, []);

  const value = useMemo(
    () => ({ player, people: store.people, setPlayer, syncEntries, switchTo, forget, signOut }),
    [player, store.people, setPlayer, syncEntries, switchTo, forget, signOut],
  );
  return <PlayerContext.Provider value={value}>{children}</PlayerContext.Provider>;
}

export function usePlayer(): PlayerContextValue {
  const ctx = useContext(PlayerContext);
  if (!ctx) throw new Error("usePlayer outside PlayerProvider");
  return ctx;
}
