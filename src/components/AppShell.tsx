import { useEffect, useRef, useState } from "react";
import { Link, Outlet, useLocation, useNavigate } from "react-router";
import { AnimatePresence, motion } from "motion/react";
import { useBootstrap, useClaimPlayer } from "../api/queries.ts";
import { usePlayer } from "../lib/player.tsx";
import { useChrome } from "./Chrome.tsx";
import { ChevronDown, ChevronLeft, ChevronRight, CircleHelp, Football, Swap, Trophy, X } from "./Icons.tsx";
import { useToast } from "./Toast.tsx";
import { useOnline } from "../lib/online.ts";
import { formatCode } from "../../shared/codes.ts";

export function AppShell() {
  const { player, setPlayer, signOut } = usePlayer();
  const boot = useBootstrap();
  const loc = useLocation();
  const nav = useNavigate();
  const toast = useToast();
  const { navHidden, headerWeek, changeWeek } = useChrome();
  const [switching, setSwitching] = useState(false);
  const poolName = boot.data?.poolName ?? "High Five";
  const online = useOnline();
  const updateReady = !!boot.data && boot.data.build !== __BUILD_ID__ && __BUILD_ID__ !== "test";

  useEffect(() => {
    document.title = poolName;
  }, [poolName]);

  // Devices that signed in before codes existed hold a name but no token. Claim one silently
  // if the name is still free; otherwise send them to the code screen.
  const claim = useClaimPlayer();
  const upgrading = useRef(false);
  useEffect(() => {
    if (!player || player.token || upgrading.current) return;
    upgrading.current = true;
    claim
      .mutateAsync({ id: player.id })
      .then((r) => setPlayer({ ...r.player, token: r.token }))
      .catch(() => {
        const id = player.id;
        signOut();
        toast(`${player.name} is already claimed. Enter the code to pick here.`, "error");
        nav(`/welcome?claim=${id}`, { replace: true });
      });
  }, [player, claim, setPlayer, signOut, toast, nav]);

  // A bootstrap that finished *before* this device adopted its token still says "me: null".
  // Only a fresher one means the token was really revoked.
  const tokenSeenAt = useRef(0);
  useEffect(() => {
    tokenSeenAt.current = Date.now();
  }, [player?.token]);
  useEffect(() => {
    if (player?.token && boot.data && boot.data.me === null && boot.dataUpdatedAt > tokenSeenAt.current) {
      signOut();
      toast("This device was signed out. Tap your name and enter your code.", "error");
      nav("/welcome", { replace: true });
    }
  }, [player, boot.data, boot.dataUpdatedAt, signOut, toast, nav]);

  const onWelcome = loc.pathname.startsWith("/welcome");
  const currentWeek = boot.data?.currentWeek ?? 1;
  const tabs = [
    { to: `/week/${currentWeek}`, match: "/week", label: "Picks", icon: <Football /> },
    { to: "/board", match: "/board", label: "Board", icon: <Trophy /> },
    { to: "/rules", match: "/rules", label: "Rules", icon: <CircleHelp /> },
  ];

  return (
    <div className="relative mx-auto flex min-h-dvh w-full max-w-[1180px] flex-col">
      <header className="sticky top-0 z-30 border-b-2 border-ink bg-paper/90 backdrop-blur">
        <div className="flex items-center gap-3 px-4 py-2.5 sm:px-6 lg:px-8">
          <Link
            to="/"
            className="font-display flex shrink-0 items-center gap-2 whitespace-nowrap text-[1.35rem] font-extrabold leading-none tracking-tight sm:text-[1.65rem]"
          >
            <img src="/icon.svg" alt="" className="h-8 w-8 shrink-0 sm:h-9 sm:w-9" />
            <span>{poolName}</span>
          </Link>
          {player && !onWelcome && (
            <>
              <nav className="ml-4 hidden items-center gap-1 md:flex" aria-label="Primary navigation">
                {tabs.map((t) => {
                  const active = loc.pathname.startsWith(t.match);
                  return (
                    <Link
                      key={t.match}
                      to={t.to}
                      aria-current={active ? "page" : undefined}
                      className={`relative isolate z-0 flex items-center gap-2 rounded-full px-4 py-1.5 font-display text-[15px] font-bold ${
                        active ? "text-paper" : "text-ink-2 hover:text-ink"
                      }`}
                    >
                      {active && (
                        <motion.span
                          layoutId="top-nav-pill"
                          className="absolute inset-0 -z-10 rounded-full bg-ink"
                          transition={{ type: "spring", stiffness: 500, damping: 35 }}
                        />
                      )}
                      {t.icon}
                      {t.label}
                    </Link>
                  );
                })}
              </nav>
              <div className="ml-auto flex min-w-0 items-center gap-1.5 sm:gap-2">
                {headerWeek && <HeaderWeekNav week={headerWeek.week} max={headerWeek.max} onChange={changeWeek} />}
                <button className="chip min-w-0 max-w-[12ch] sm:max-w-[22ch]" onClick={() => setSwitching(true)} aria-label="Switch player">
                  <span className="truncate">{player.name}</span>
                  <Swap className="shrink-0 text-ink-2" />
                </button>
              </div>
            </>
          )}
        </div>
        {!online && (
          <div className="bg-ink px-4 py-1.5 text-center text-xs font-bold text-paper">
            You're offline. You can browse, but picks won't save until you're back.
          </div>
        )}
        {online && updateReady && (
          <button
            className="flex w-full items-center justify-center gap-2 bg-flag px-4 py-1.5 text-xs font-bold text-ink"
            onClick={() => window.location.reload()}
          >
            A new version is ready · tap to refresh
          </button>
        )}
      </header>

      <main className={`flex-1 px-4 pt-4 sm:px-6 lg:px-8 ${navHidden ? "pb-40" : "pb-28 md:pb-12"}`}>
        <Outlet />
      </main>

      {!onWelcome && !navHidden && (
        <nav className="fixed inset-x-0 bottom-0 z-30 md:hidden" aria-label="Primary navigation">
          <div className="mx-auto max-w-[560px] px-4 pb-[max(env(safe-area-inset-bottom),12px)]">
            <div className="card flex p-1.5">
              {tabs.map((t) => {
                const active = loc.pathname.startsWith(t.match);
                return (
                  <Link
                    key={t.match}
                    to={t.to}
                    aria-current={active ? "page" : undefined}
                    className={`relative isolate z-0 flex flex-1 items-center justify-center gap-1.5 rounded-2xl py-2.5 font-display text-[15px] font-bold transition-colors ${
                      active ? "text-paper" : "text-ink hover:bg-paper-2"
                    }`}
                  >
                    {active && (
                      <motion.span
                        layoutId="nav-pill"
                        className="pointer-events-none absolute inset-0 -z-10 rounded-2xl bg-ink"
                        transition={{ type: "spring", stiffness: 500, damping: 35 }}
                        aria-hidden="true"
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
          <Sheet title="Your account" onClose={() => setSwitching(false)}>
            {boot.data?.myCode && <DeviceCode code={boot.data.myCode} name={player?.name ?? ""} />}
            <h3 className="font-display mb-2 mt-5 text-sm font-extrabold uppercase tracking-wider text-ink-3">
              Someone else picking?
            </h3>
            <div className="flex flex-wrap gap-2">
              {(boot.data?.players ?? [])
                .filter((p) => p.id !== player?.id)
                .map((p) => (
                  <button
                    key={p.id}
                    className="chip px-3 py-1.5 text-sm"
                    onClick={() => {
                      setSwitching(false);
                      nav(`/welcome?claim=${p.id}`);
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

/** Your claim code, for putting this name on another device. */
function DeviceCode({ code, name }: { code: string; name: string }) {
  const [copied, setCopied] = useState(false);
  const toast = useToast();
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(formatCode(code));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast("Couldn't copy — write it down instead.", "error");
    }
  };
  return (
    <div className="card-flat bg-flag-soft p-3">
      <h3 className="font-display text-sm font-extrabold uppercase tracking-wider text-ink-3">Your device code</h3>
      <div className="mt-1 flex items-center gap-2">
        <span className="font-display flex-1 text-2xl font-extrabold tracking-[0.12em]">{formatCode(code)}</span>
        <button className="btn btn-sm shrink-0" onClick={() => void copy()}>
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <p className="mt-1.5 text-xs text-ink-2">
        Enter this on another phone or laptop to pick as <b>{name}</b> there. Anyone with it can pick as you, so keep it to
        yourself.
      </p>
    </div>
  );
}

/** Week stepper that lives in the app header; the arrows fold away on phones, the label always picks. */
function HeaderWeekNav({ week, max, onChange }: { week: number; max: number; onChange: (w: number) => void }) {
  return (
    <div className="flex shrink-0 items-center gap-1">
      {/* .btn sets display, so the arrows hide from a wrapper rather than a utility class. */}
      <span className="hidden sm:block">
        <button className="btn btn-sm px-1.5" aria-label="Previous week" disabled={week <= 1} onClick={() => onChange(week - 1)}>
          <ChevronLeft />
        </button>
      </span>
      <label className="chip relative cursor-pointer gap-1 px-2.5">
        <span className="font-display font-extrabold">Week {week}</span>
        <ChevronDown size={16} className="text-ink-2" />
        <select
          aria-label="Choose week"
          className="absolute inset-0 cursor-pointer opacity-0"
          value={week}
          onChange={(e) => onChange(Number(e.target.value))}
        >
          {Array.from({ length: max }, (_, i) => i + 1).map((w) => (
            <option key={w} value={w}>
              Week {w}
            </option>
          ))}
        </select>
      </label>
      <span className="hidden sm:block">
        <button className="btn btn-sm px-1.5" aria-label="Next week" disabled={week >= max} onClick={() => onChange(week + 1)}>
          <ChevronRight />
        </button>
      </span>
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
