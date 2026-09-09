import { useEffect, useState } from "react";
import { Link, Outlet, useLocation, useNavigate } from "react-router";
import { AnimatePresence, motion } from "motion/react";
import { useBootstrap } from "../api/queries.ts";
import { usePlayer } from "../lib/player.tsx";
import { useChrome } from "./Chrome.tsx";
import { Football, Swap, Trophy, X } from "./Icons.tsx";
import { useToast } from "./Toast.tsx";

export function AppShell() {
  const { player, setPlayer, signOut } = usePlayer();
  const boot = useBootstrap();
  const loc = useLocation();
  const nav = useNavigate();
  const toast = useToast();
  const { navHidden } = useChrome();
  const [switching, setSwitching] = useState(false);
  const poolName = boot.data?.poolName ?? "High Five";

  useEffect(() => {
    document.title = poolName;
  }, [poolName]);

  useEffect(() => {
    if (player && boot.data && boot.data.me === null) {
      signOut();
      toast("That name isn't in the pool anymore. Pick your name again.", "error");
      nav("/welcome", { replace: true });
    }
  }, [player, boot.data, signOut, toast, nav]);

  const onWelcome = loc.pathname.startsWith("/welcome");
  const currentWeek = boot.data?.currentWeek ?? 1;
  const tabs = [
    { to: `/week/${currentWeek}`, match: "/week", label: "Picks", icon: <Football /> },
    { to: "/board", match: "/board", label: "Board", icon: <Trophy /> },
  ];

  return (
    <div className="relative mx-auto flex min-h-dvh w-full max-w-[720px] flex-col">
      <header className="sticky top-0 z-30 border-b-2 border-ink bg-paper/90 backdrop-blur">
        <div className="flex items-center justify-between gap-3 px-4 py-2.5">
          <Link to="/" className="font-display text-[1.65rem] font-extrabold leading-none tracking-tight">
            {poolName}
          </Link>
          {player && !onWelcome && (
            <button className="chip max-w-[55%]" onClick={() => setSwitching(true)} aria-label="Switch player">
              <span className="truncate">{player.name}</span>
              <Swap className="shrink-0 text-ink-2" />
            </button>
          )}
        </div>
      </header>

      <main className={`flex-1 px-4 pt-4 ${navHidden ? "pb-40" : "pb-28"}`}>
        <Outlet />
      </main>

      {!onWelcome && !navHidden && (
        <nav className="fixed inset-x-0 bottom-0 z-30">
          <div className="mx-auto max-w-[720px] px-4 pb-[max(env(safe-area-inset-bottom),12px)]">
            <div className="card flex p-1.5">
              {tabs.map((t) => {
                const active = loc.pathname.startsWith(t.match);
                return (
                  <Link
                    key={t.match}
                    to={t.to}
                    className={`relative flex flex-1 items-center justify-center gap-2 rounded-2xl py-2.5 font-display text-base font-bold ${
                      active ? "text-paper" : "text-ink-2"
                    }`}
                  >
                    {active && (
                      <motion.span
                        layoutId="nav-pill"
                        className="absolute inset-0 -z-10 rounded-2xl bg-ink"
                        transition={{ type: "spring", stiffness: 500, damping: 35 }}
                      />
                    )}
                    {t.icon}
                    {t.label}
                  </Link>
                );
              })}
            </div>
          </div>
        </nav>
      )}

      <AnimatePresence>
        {switching && (
          <Sheet title="Who's picking?" onClose={() => setSwitching(false)}>
            <div className="flex flex-wrap gap-2">
              {(boot.data?.players ?? []).map((p) => (
                <button
                  key={p.id}
                  className={`chip px-3 py-1.5 text-sm ${p.id === player?.id ? "bg-flag" : ""}`}
                  onClick={() => {
                    setPlayer(p);
                    setSwitching(false);
                    nav("/");
                  }}
                >
                  {p.name}
                </button>
              ))}
            </div>
            <button
              className="btn btn-sm mt-4"
              onClick={() => {
                setSwitching(false);
                nav("/welcome?new=1");
              }}
            >
              I'm someone new
            </button>
          </Sheet>
        )}
      </AnimatePresence>
    </div>
  );
}

export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 sm:items-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        role="dialog"
        aria-label={title}
        className="card w-full max-w-[520px] rounded-b-none p-5 pb-[max(env(safe-area-inset-bottom),20px)] sm:rounded-b-card"
        initial={{ y: 60 }}
        animate={{ y: 0 }}
        exit={{ y: 60 }}
        transition={{ type: "spring", stiffness: 400, damping: 32 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-display text-xl font-extrabold">{title}</h2>
          <button className="btn btn-ghost btn-sm px-2" onClick={onClose} aria-label="Close">
            <X />
          </button>
        </div>
        {children}
      </motion.div>
    </motion.div>
  );
}
