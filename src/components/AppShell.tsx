import { useEffect, useRef, useState } from "react";
import { Link, Outlet, useLocation, useNavigate } from "react-router";
import { AnimatePresence, motion } from "motion/react";
import { useBootstrap, useClaimPlayer } from "../api/queries.ts";
import { usePlayer } from "../lib/player.tsx";
import { useChrome } from "./Chrome.tsx";
import { ChevronDown, ChevronLeft, ChevronRight, Football, House, Megaphone, Swap, Trophy, X } from "./Icons.tsx";
import { useToast } from "./Toast.tsx";
import { useOnline } from "../lib/online.ts";
import { ThemePicker, ThemeToggle } from "./ThemeControl.tsx";
import { api, ApiClientError } from "../api/client.ts";
import type { Identity } from "../lib/identity.ts";
import { formatCode } from "../../shared/codes.ts";
import { poolUrl } from "../lib/basename.ts";
import { isVulgar, VULGAR_MESSAGE } from "../../shared/profanity.ts";
import { addPasskey, passkeysSupported, wasCancelled } from "../lib/passkey.ts";
import { useQueryClient } from "@tanstack/react-query";
import { Check } from "./Icons.tsx";
import { fallbackPoolWeeks } from "../lib/poolFallback.ts";
import { feedMessages, useMessagesFeed } from "../api/messages.ts";
import { useAnnouncementRead } from "../lib/announcementRead.ts";

export function AppShell() {
  const { player, people, setPlayer, syncEntries, switchTo, forget } = usePlayer();
  const boot = useBootstrap();
  const loc = useLocation();
  const nav = useNavigate();
  const toast = useToast();
  const { navHidden, headerWeek, changeWeek } = useChrome();
  const [switching, setSwitching] = useState(false);
  const [poolSheet, setPoolSheet] = useState(false);
  const poolName = boot.data?.poolName ?? "High Five";
  const online = useOnline();
  const updateReady = !!boot.data && boot.data.build !== __BUILD_ID__ && __BUILD_ID__ !== "test";
  const messageFeed = useMessagesFeed();
  const messages = feedMessages(messageFeed.data);
  const { unread: rawUnread } = useAnnouncementRead(messages);
  const announcementsAvailable = !!messageFeed.data?.pages[0] && (messageFeed.data.pages[0].enabled || messageFeed.data.pages[0].canManage);
  const unread = messageFeed.data?.pages[0]?.enabled ? rawUnread : 0;

  useEffect(() => {
    document.title = `${poolName} · Tally`;
  }, [poolName]);

  // The header wears its rule only once there is something above it to separate from. Passive and
  // coarse on purpose: this reads one boolean, so it never runs layout on a scroll frame.
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 4);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

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

  // An entry only exists while the account that owns it still does. If the commissioner removes
  // it, every request from this device 403s — so drop it and fall back to the account rather than
  // leaving the app stuck behind an error that retrying can never clear.
  // An account carries its own id here, so this is specifically "a name my account picks for".
  const isManagedEntry = !!player?.accountId && player.accountId !== player.id;
  useEffect(() => {
    const err = boot.error;
    if (!(err instanceof ApiClientError) || err.code !== "ENTRY_FORBIDDEN" || !player || !isManagedEntry) return;
    const name = player.name;
    forget(player.id);
    toast(`${name}'s entry isn't on this account any more.`, "error");
  }, [boot.error, player, isManagedEntry, forget, toast]);

  // Devices that signed in before codes existed hold a name but no token, and no cookie either.
  // Claim one silently if the name is still free; otherwise send them to the code screen.
  const claim = useClaimPlayer();
  const upgrading = useRef(false);
  useEffect(() => {
    if (!player || player.token || upgrading.current) return;
    // A managed entry has no code of its own to claim with; its account is the way back in.
    if (isManagedEntry) return;
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
  const currentWeek = boot.data?.currentWeek ?? fallbackPoolWeeks().pickWeek;
  // Home is first and is the only screen that can say *which* pool and *what needs doing* before
  // you have picked a tab. Rules left the bar: a document you read once was holding a third of it.
  const tabs = [
    { to: "/", match: "/", exact: true, label: "Home", icon: <House /> },
    { to: `/week/${currentWeek}`, match: "/week", label: "Picks", icon: <Football /> },
    { to: "/board", match: "/board", label: "Board", icon: <Trophy /> },
  ];
  const isActive = (t: { match: string; exact?: boolean }) =>
    t.exact ? loc.pathname === "/" : loc.pathname.startsWith(t.match);

  const openAnnouncements = () => {
    if (loc.pathname !== "/") {
      nav("/#announcements");
      return;
    }
    document.getElementById("announcements")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const announcementButton = announcementsAvailable && !onWelcome ? (
    <button
      type="button"
      className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 border-ink bg-surface hover:bg-paper-2"
      aria-label={`Announcements${unread ? `, ${unread} new` : ""}`}
      onClick={openAnnouncements}
    >
      <Megaphone size={19} />
      {unread > 0 ? (
        <span className="font-display absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full border-2 border-ink bg-flag px-1 text-[10px] font-extrabold leading-none" aria-hidden="true">
          {unread > 9 ? "9+" : unread}
        </span>
      ) : null}
    </button>
  ) : null;

  return (
    <div className="relative mx-auto flex min-h-dvh w-full max-w-[1180px] flex-col">
      <header data-scrolled={scrolled} className="app-header sticky top-0 z-30 bg-paper/90 backdrop-blur">
        <div className="flex items-center gap-3 px-4 py-3 sm:px-6 sm:py-3.5 lg:px-8">
          <button
            type="button"
            aria-label={`${poolName}. Switch pool`}
            className="flex min-w-0 shrink-0 items-center gap-2.5 text-left"
            onClick={() => setPoolSheet(true)}
          >
            <img src="/icon.svg" alt="" className="h-10 w-10 shrink-0 sm:h-11 sm:w-11" />
            <span className="flex min-w-0 flex-col leading-none">
              <span className="font-display truncate text-[1.55rem] font-extrabold tracking-tight sm:text-[1.8rem]">Tally</span>
              <span className="mt-1 flex items-center gap-1 truncate text-[0.68rem] font-bold uppercase tracking-[0.16em] text-ink-2 sm:text-[0.72rem]">
                {poolName}
                <Swap className="shrink-0 text-ink-3" size={11} />
              </span>
            </span>
          </button>
          {player && !onWelcome && (
            <>
              <nav className="ml-4 hidden items-center gap-1 md:flex" aria-label="Primary navigation">
                {tabs.map((t) => {
                  const active = isActive(t);
                  return (
                    <Link
                      key={t.label}
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
                {announcementButton}
                <ThemeToggle className="hidden md:flex" />
                <button className="chip min-w-0 max-w-[12ch] sm:max-w-[22ch]" onClick={() => setSwitching(true)} aria-label="Switch player">
                  <span className="truncate">{player.name}</span>
                  <Swap className="shrink-0 text-ink-2" />
                </button>
              </div>
            </>
          )}
          {(!player || onWelcome) && <div className="ml-auto flex items-center gap-2">{announcementButton}<ThemeToggle className="hidden md:flex" /></div>}
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
                const active = isActive(t);
                return (
                  <Link
                    key={t.label}
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
        {poolSheet && <PoolSheet poolName={poolName} poolType={boot.data?.pool?.type} onClose={() => setPoolSheet(false)} />}
      </AnimatePresence>

      <AnimatePresence>
        {switching && (
          <Sheet title="Your account" onClose={() => setSwitching(false)}>
            <AccountSheet
              player={player}
              people={people}
              accountName={boot.data?.account?.name ?? player?.name ?? ""}
              accountId={boot.data?.account?.id ?? null}
              myCode={boot.data?.myCode ?? null}
              hasPasskey={(boot.data?.myPasskeys ?? 0) > 0}
              // Switching entries leaves you on the same screen — you are usually comparing two
              // cards on the same week, and being thrown elsewhere loses your place. Only one piece
              // of route state goes stale: the pick flow keeps its step in the query, and "you just
              // locked in" is emphatically not true of the entry you switched to. Everything else
              // in the query describes the *screen* rather than the player — the board's sort, for
              // one — so it stays.
              onSwitch={(id) => {
                switchTo(id);
                setSwitching(false);
                if (new URLSearchParams(loc.search).has("step")) {
                  const next = new URLSearchParams(loc.search);
                  next.delete("step");
                  const query = next.toString();
                  nav(`${loc.pathname}${query ? `?${query}` : ""}`, { replace: true });
                }
              }}
              // Adding one does move you — the button says "and make picks".
              onAdded={(p) => {
                setPlayer(p);
                setSwitching(false);
                nav(`/week/${currentWeek}`);
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
  myCode,
  accountName,
  accountId,
  hasPasskey,
  onSwitch,
  onAdded,
  onNew,
}: {
  player: Identity | null;
  people: Identity[];
  myCode: string | null;
  accountName: string;
  accountId: string | null;
  hasPasskey: boolean;
  onSwitch: (id: string) => void;
  onAdded: (p: Identity) => void;
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
      <ThemeRow />

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
            <DeviceCode code={myCode} name={accountName} accountId={accountId} />
          ) : (
            <button className="text-sm font-bold underline" onClick={() => setShowCode(true)} disabled={!myCode}>
              Play on another device →
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
        </div>
      )}
    </div>
  );
}

/**
 * Light, dark, or the device's own mind. "Auto" is the default and is the absence of a choice,
 * so a phone that turns dark at sunset takes the app with it.
 */
function ThemeRow() {
  return (
    <div className="mt-4 border-t-2 border-dashed border-line pt-4">
      <h3 className="font-display mb-2 text-sm font-extrabold uppercase tracking-wider text-ink-3">Appearance</h3>
      <ThemePicker />
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
      if (isVulgar(name)) {
        setError(VULGAR_MESSAGE);
        setBusy(false);
        return;
      }
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
        <Check size={16} className="text-turf" /> Face ID or fingerprint is on — it signs you in here and in the Tally app.
      </p>
    );
  }
  const turnOn = async () => {
    setBusy(true);
    try {
      await addPasskey();
      setDone(true);
      toast("Face ID or fingerprint is ready for your account.", "success");
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
        {busy ? "Waiting…" : "Set up Face ID or fingerprint"}
      </button>
      <p className="mt-1.5 text-xs text-ink-2">
        Optional. Opens your account on a new phone, a laptop, or the Tally iOS app without a code.
      </p>
    </div>
  );
}

/**
 * Getting onto a second device. The link is the easy path — one tap signs that device in, and on
 * an iPhone with the app installed it opens the app rather than the browser. The code stays
 * underneath for anyone reading it to someone across the room.
 */
function DeviceCode({ code, name, accountId }: { code: string; name: string; accountId: string | null }) {
  const [copied, setCopied] = useState(false);
  const toast = useToast();
  const link = accountId ? poolUrl(`/welcome?claim=${accountId}&code=${code}`) : null;

  const copy = async (text: string, done: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast(done, "success");
    } catch {
      toast("Couldn't copy — write it down instead.", "error");
    }
  };

  const send = async () => {
    if (!link) return;
    try {
      if (navigator.share) {
        await navigator.share({ url: link });
        return;
      }
      await copy(link, "Sign-in link copied. Open it on your other device.");
    } catch {
      /* share sheet dismissed */
    }
  };

  return (
    <div className="card-flat bg-flag-soft p-3">
      <h3 className="font-display text-sm font-extrabold uppercase tracking-wider text-ink-3">Play on another device</h3>
      {link && (
        <>
          <button className="btn btn-sm btn-primary mt-2 w-full" onClick={() => void send()}>
            Send myself a sign-in link
          </button>
          <p className="mt-1.5 text-xs text-ink-2">
            Text or AirDrop it to yourself. One tap signs that device in as <b>{name}</b> — and opens the Tally app if you
            have it. Treat it like a password.
          </p>
        </>
      )}
      <div className="mt-3 border-t-2 border-dashed border-line pt-2">
        <span className="text-[11px] font-bold uppercase tracking-wider text-ink-3">Or type this code</span>
        <div className="mt-1 flex items-center gap-2">
          <span className="font-display flex-1 text-2xl font-extrabold tracking-[0.12em]">{formatCode(code)}</span>
          <button className="btn btn-sm shrink-0" onClick={() => void copy(formatCode(code), "Code copied.")}>
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
      </div>
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
        <div className="sticky top-0 -mx-5 mb-3 flex items-center justify-between bg-surface px-5 pb-3">
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


/**
 * The pool switcher. One pool today, so it mostly answers "where am I" — which is the job the
 * lockup was already doing silently. Joining is a link someone sends you; every pool lives at its
 * own address, which is why there is nothing to type here.
 */
function PoolSheet({ poolName, poolType, onClose }: { poolName: string; poolType?: string; onClose: () => void }) {
  return (
    <Sheet title="Pools" onClose={onClose}>
      <h3 className="font-display mb-2 text-sm font-extrabold uppercase tracking-wider text-ink-3">Your pool</h3>
      <Link to="/" onClick={onClose} className="card-flat flex items-center gap-3 bg-surface p-3 transition-colors hover:bg-paper-2">
        <div className="min-w-0">
          <div className="font-display truncate font-extrabold">{poolName}</div>
          <div className="truncate text-xs text-ink-2">{poolType ?? "High Five"}</div>
        </div>
        <span className="chip ml-auto shrink-0 bg-flag py-0.5 text-[11px]">Pool home <ChevronRight size={13} /></span>
      </Link>
      <p className="mt-2 text-xs text-ink-2">Open the pool to see standings, past weeks, and how it works.</p>
      <p className="mt-4 border-t-2 border-dashed border-line pt-4 text-sm text-ink-2">
        Every pool lives at its own address, so a commissioner's link is the way into another one.
        Opening it signs you in there; this one stays exactly as it is.
      </p>
      <p className="mt-3 text-sm text-ink-2">
        <b className="font-display text-ink">Start a pool</b>{" "}
        <span className="chip bg-paper-2 py-0 text-[10px]">coming soon</span>
      </p>
    </Sheet>
  );
}
