import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import type { Player } from "../../shared/types.ts";
import { clearPlayer, loadPlayer, savePlayer } from "./identity.ts";

interface PlayerContextValue {
  player: Player | null;
  setPlayer: (p: Player) => void;
  signOut: () => void;
}

const PlayerContext = createContext<PlayerContextValue | null>(null);

export function PlayerProvider({ children }: { children: ReactNode }) {
  const [player, setPlayerState] = useState<Player | null>(loadPlayer);
  const setPlayer = useCallback((p: Player) => {
    savePlayer(p);
    setPlayerState(p);
  }, []);
  const signOut = useCallback(() => {
    clearPlayer();
    setPlayerState(null);
  }, []);
  const value = useMemo(() => ({ player, setPlayer, signOut }), [player, setPlayer, signOut]);
  return <PlayerContext.Provider value={value}>{children}</PlayerContext.Provider>;
}

export function usePlayer(): PlayerContextValue {
  const ctx = useContext(PlayerContext);
  if (!ctx) throw new Error("usePlayer outside PlayerProvider");
  return ctx;
}
