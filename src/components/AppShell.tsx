import { useEffect, useRef, useState } from "react";
import { Link, Outlet, useLocation, useNavigate } from "react-router";
import { AnimatePresence, motion } from "motion/react";
import { useBootstrap, useClaimPlayer } from "../api/queries.ts";
import { usePlayer } from "../lib/player.tsx";
import { useChrome } from "./Chrome.tsx";
import { ChevronDown, ChevronLeft, ChevronRight, CircleHelp, Football, Swap, Trophy, X } from "./Icons.tsx";
import { useToast } from "./Toast.tsx";
import { useOnline } from "../lib/online.ts";
import { api } from "../api/client.ts";
import type { Identity } from "../lib/identity.ts";
import type { RosterPlayer } from "../../shared/api.ts";
import { formatCode } from "../../shared/codes.ts";
import { addPasskey, passkeysSupported, wasCancelled } from "../lib/passkey.ts";
import { useQueryClient } from "@tanstack/react-query";
import { Check } from "./Icons.tsx";

export function AppShell() {
  const { player, people, setPlayer, syncEntries, switchTo, forget } = usePlayer();
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
    document.title = `${poolName} · Tally`;
  }, [poolName]);

  // The cookie is the other half of staying signed in: if storage was cleared but the cookie
  // survived, the server still knows us, so adopt whoever it says we are.
  useEffect(() => {
    const me = boot.data?.me;
    if (!me) return;
    if (!player || (!player.token && player.id !== me.id)) setPlayer({ id: me.id, name: me.name });
  }, [boot.data, player, setPlayer]);

  useEffect(() => {
    if (!boot.data?.account || !boot.data.myEntries || !boot.data.me) return;
    syncEntries(boot.data.account.id, boot.data.myEntries, player?.token);
  }, [boot.data, player?.token, syncEntries]);

  // Devices that signed in before codes existed hold a name but no token, and no cookie either.
  // Claim one silently if the name is still free; otherwise send them to the code screen.
  const claim = useClaimPlayer();
  const upgrading = useRef(false);
  useEffect(() => {
    if (!player || player.token || upgrading.current) return;
    if (!boot.data || boot.data.me !== null) return;
    upgrading.current = true;
    claim
      .mutateAsync({ id: player.id })
      .then((r) => setPlayer({ ...r.player, token: r.token }))
      .catch(() => {
        const id = player.id;
        forget(id);
        toast(`${player.name} is already claimed. Enter the code to pick here.`, "error");
        nav(`/welcome?claim=${id}`, { replace: true });
      });
  }, [player, boot.data, claim, setPlayer, forget, toast, nav]);

  // A bootstrap that finished *before* this device adopted its token still says "me: null".
  // Only a fresher one means the token was really revoked.
  const tokenSeenAt = useRef(0);
  useEffect(() => {
    tokenSeenAt.current = Date.now();
  }, [player?.token]);
  useEffect(() => {
    if (player?.token && boot.data && boot.data.me === null && boot.dataUpdatedAt > tokenSeenAt.current) {
      const name = player.name;
      forget(player.id);
      toast(`${name} was signed out on this device. Tap the name chip to sign back in.`, "error");
      nav("/welcome", { replace: true });
    }
  }, [player, boot.data, boot.dataUpdatedAt, forget, toast, nav]);

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
        <div className="flex items-center gap-3 px-4 py-3 sm:px-6 sm:py-3.5 lg:px-8">
          <Link
            to="/"
            aria-label={`Tally — ${poolName}`}
            className="flex min-w-0 shrink-0 items-center gap-2.5"
          >
            <img src="/icon.svg" alt="" className="h-10 w-10 shrink-0 sm:h-11 sm:w-11" />
            <span className="flex min-w-0 flex-col leading-none">
              <span className="font-display truncate text-[1.55rem] font-extrabold tracking-tight sm:text-[1.8rem]">Tally</span>
              <span className="mt-1 truncate text-[0.68rem] font-bold uppercase tracking-[0.16em] text-ink-2 sm:text-[0.72rem]">{poolName}</span>
            </span>
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
            <AccountSheet
              player={player}
              people={people}
              roster={boot.data?.players ?? []}
              accountName={boot.data?.account?.name ?? player?.name ?? ""}
              myCode={boot.data?.myCode ?? null}
              hasPasskey={(boot.data?.myPasskeys ?? 0) > 0}
              onSwitch={(id) => {
                switchTo(id);
                setSwitching(false);
                nav("/");
              }}
              onAdded={(p) => {
                setPlayer(p);
                setSwitching(false);
                nav("/");
              }}
              onClaimElsewhere={(id) => {
                setSwitching(false);
                nav(`/welcome?claim=${id}`);
              }}
              onNew={() => {
                setSwitching(false);
                nav("/welcome?new=1");
              }}
            />
          </Sheet>
        )}
      </AnimatePresence>
    </div>
  );
}

/**
 * The account sheet. Most people see one line here and never touch it. The code stays hidden
 * until someone actually needs another device. Account-owned entries follow the account
 * across devices and passkey sign-ins, with separate picks and standings.
 */
function AccountSheet({
  player,
  people,
  roster,
  myCode,
  accountName,
  hasPasskey,
  onSwitch,
  onAdded,
  onClaimElsewhere,
  onNew,
}: {
  player: Identity | null;
  people: Identity[];
  roster: RosterPlayer[];
  myCode: string | null;
  accountName: string;
  hasPasskey: boolean;
  onSwitch: (id: string) => void;
  onAdded: (p: Identity) => void;
  onClaimElsewhere: (id: string) => void;
  onNew: () => void;
}) {
  const [showCode, setShowCode] = useState(false);
  const [adding, setAdding] = useState(false);
  const others = people.filter((p) => p.id !== player?.id);

  return (
    <div>
      <p className="text-sm text-ink-2">
        Picking as <b className="text-ink">{player?.name}</b>
      </p>

      {others.length > 0 && (
        <>
          <h3 className="font-display mb-2 mt-4 text-sm font-extrabold uppercase tracking-wider text-ink-3">
            Your other entries
          </h3>
          <div className="flex flex-wrap gap-2">
            {others.map((p) => (
              <button key={p.id} className="chip min-h-11 px-3 py-1.5 text-sm" onClick={() => onSwitch(p.id)}>
                {p.name}
                {p.managed && <span className="ml-1 text-[10px] font-bold uppercase text-ink-3">yours</span>}
              </button>
            ))}
          </div>
        </>
      )}

      <p className="mt-2 text-sm text-ink-2">Add entries for your kids, family, or friends. Each gets their own picks and score, all managed by your account.</p>
      <PasskeyRow key={player?.accountId ?? player?.id} hasPasskey={hasPasskey} />

      {adding ? (
        <AddPerson
          player={player}
          onDone={(p) => {
            setAdding(false);
            onAdded(p);
          }}
          onCancel={() => setAdding(false)}
        />
      ) : (
        <div className="mt-5 space-y-2 border-t-2 border-dashed border-line pt-4">
          {showCode && myCode ? (
            <DeviceCode code={myCode} name={accountName} />
          ) : (
            <button className="text-sm font-bold underline" onClick={() => setShowCode(true)} disabled={!myCode}>
              Pick on another device →
            </button>
          )}
          <div className="flex flex-wrap gap-2 pt-1">
            <button className="btn btn-sm" onClick={() => setAdding(true)}>
              Add an entry
            </button>
            <button className="btn btn-sm" onClick={onNew}>
              I'm someone new
            </button>
          </div>
          {roster.length > people.length && (
            <p className="pt-1 text-xs text-ink-3">
              Someone else's turn on this device?{" "}
              {roster
                .filter((p) => !people.some((x) => x.id === p.id))
                .slice(0, 6)
                .map((p, i) => (
                  <span key={p.id}>
                    {i > 0 && " · "}
                    <button className="font-bold text-ink-2 underline" onClick={() => onClaimElsewhere(p.id)}>
                      {p.name}
                    </button>
                  </span>
                ))}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/** Every signed-in account can create a named entry it owns. */
function AddPerson({
  player,
  onDone,
  onCancel,
}: {
  player: Identity | null;
  onDone: (p: Identity) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();
  const qc = useQueryClient();

  return (
    <form className="mt-5 border-t-2 border-dashed border-line pt-4" onSubmit={async (event) => {
      event.preventDefault();
      if (busy || !player) return;
      setBusy(true);
      setError(null);
      try {
        const r = await api<{ player: Identity }>("/entries", { body: { name } });
        void qc.invalidateQueries({ queryKey: ["bootstrap"] });
        toast(`${r.player.name}'s entry is ready. Let's make their picks!`, "success");
        onDone({ ...r.player, accountId: player.accountId ?? player.id, token: player.token });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Couldn't add the entry.");
        setBusy(false);
      }
    }}>
      <h3 className="font-display text-sm font-extrabold">Add an entry</h3>
      <p className="mb-3 mt-1 text-sm text-ink-2">
        Choose the name everyone will see on the board. No separate sign-in needed.
      </p>
      <label htmlFor="entry-name" className="text-sm font-bold">Entry name</label>
      <input id="entry-name" autoFocus autoComplete="off" maxLength={24}
        value={name} onChange={(e) => setName(e.target.value)}
        placeholder="e.g. Parker" disabled={busy}
        aria-describedby={error ? "entry-error" : undefined}
        className="card-flat mb-3 mt-1 w-full px-3 py-3 outline-none focus:shadow-hard" />
      {error && <p id="entry-error" role="alert" className="mb-3 text-sm font-semibold text-danger">{error}</p>}
      <div className="flex flex-wrap gap-3">
        <button type="submit" className="btn btn-primary min-h-11" disabled={busy || !name.trim()}>
          {busy ? "Adding…" : "Add entry & make picks"}
        </button>
        <button type="button" className="btn min-h-11" disabled={busy} onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}

/** Face ID / Touch ID: an offer, never a requirement. */
function PasskeyRow({ hasPasskey }: { hasPasskey: boolean }) {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const toast = useToast();
  const qc = useQueryClient();
  if (!passkeysSupported()) return null;
  if (done || hasPasskey) {
    return (
      <p className="mt-4 flex items-center gap-2 border-t-2 border-dashed border-line pt-4 text-sm text-ink-2">
        <Check size={16} className="text-turf" /> Face ID is on for this account.
      </p>
    );
  }
  const turnOn = async () => {
    setBusy(true);
    try {
      await addPasskey();
      setDone(true);
      toast("Face ID is on. Next device just needs your face.", "success");
      void qc.invalidateQueries({ queryKey: ["bootstrap"] });
    } catch (err) {
      if (!wasCancelled(err)) toast(err instanceof Error ? err.message : "Couldn't set that up.", "error");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="mt-4 border-t-2 border-dashed border-line pt-4">
      <button className="btn btn-sm" disabled={busy} onClick={() => void turnOn()}>
        {busy ? "Waiting…" : "Turn on Face ID"}
      </button>
      <p className="mt-1.5 text-xs text-ink-2">Optional. Signs you in on a new phone without a code.</p>
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

export function Sheet({
  title,
  onClose,
  children,
  size = "md",
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  size?: "md" | "lg";
}) {
  // Escape closes it, like every other dialog on the web.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
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
        className={`card max-h-[88dvh] w-full overflow-y-auto rounded-b-none p-5 pb-[max(env(safe-area-inset-bottom),20px)] sm:rounded-b-card ${
          size === "lg" ? "max-w-[860px]" : "max-w-[520px]"
        }`}
        initial={{ y: 60 }}
        animate={{ y: 0 }}
        exit={{ y: 60 }}
        transition={{ type: "spring", stiffness: 400, damping: 32 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 -mx-5 mb-3 flex items-center justify-between bg-white px-5 pb-3">
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
