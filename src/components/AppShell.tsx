import { useEffect, useRef, useState } from "react";
import { Link, Outlet, useLocation, useNavigate } from "react-router";
import { AnimatePresence, motion } from "motion/react";
import { useBootstrap, useClaimPlayer } from "../api/queries.ts";
import { usePlayer } from "../lib/player.tsx";
import { useChrome } from "./Chrome.tsx";
import { PoolPlays } from "./PoolPlays.tsx";
import { ChevronDown, ChevronLeft, ChevronRight, Football, House, Megaphone, Swap, Trophy, User, X } from "./Icons.tsx";
import { useToast } from "./Toast.tsx";
import { useOnline } from "../lib/online.ts";
import { ThemeToggle } from "./ThemeControl.tsx";
import { ApiClientError } from "../api/client.ts";
import { fallbackPoolWeeks } from "../lib/poolFallback.ts";
import { feedMessages, useMessagesFeed } from "../api/messages.ts";
import { useAnnouncementRead } from "../lib/announcementRead.ts";
import { formatShortDay } from "../lib/time.ts";
import type { PoolMessage } from "../../shared/messages.ts";

export function AppShell() {
  const { player, setPlayer, syncEntries, forget } = usePlayer();
  const boot = useBootstrap();
  const loc = useLocation();
  const nav = useNavigate();
  const toast = useToast();
  const { navHidden, headerWeek, changeWeek } = useChrome();
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
  // Account arrived on it, because the offices behind it — a commissioner's and the league's —
  // were routes with nothing in the app linking to them, and because the name chip that used to
  // open this as a sheet was also the entry switcher, which now lives on the page it affects.
  const tabs = [
    { to: "/", match: "/", exact: true, label: "Home", icon: <House /> },
    { to: `/week/${currentWeek}`, match: "/week", label: "Picks", icon: <Football /> },
    { to: "/board", match: "/board", label: "Board", icon: <Trophy /> },
    { to: "/account", match: "/account", label: "Account", icon: <User /> },
  ];
  const isActive = (t: { match: string; exact?: boolean }) =>
    t.exact ? loc.pathname === "/" : loc.pathname.startsWith(t.match);

  const announcementButton =
    announcementsAvailable && !onWelcome ? (
      <AnnouncementMenu messages={messages} unread={unread} onHome={loc.pathname === "/"} />
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
                    // Four tabs on a 390px phone: the label tightens rather than wraps, the way
                    // the segmented controls do, so the bar stays one line at every width.
                    className={`relative isolate z-0 flex flex-1 items-center justify-center gap-1 whitespace-nowrap rounded-2xl py-2.5 font-display text-[13px] font-bold transition-colors sm:gap-1.5 sm:text-[15px] ${
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

    </div>
  );
}

/** Week stepper that lives in the app header; the arrows fold away on phones, the label always picks. */
/** A borderless, h-10 icon button — the arrows step through a choice the dropdown already
 * states, so they read as an accessory to it rather than a second control with its own weight. */
function WeekStepButton({ direction, disabled, onClick }: { direction: "prev" | "next"; disabled: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      className="flex h-10 w-8 shrink-0 items-center justify-center rounded-full text-ink-2 transition-colors hover:bg-paper-2 hover:text-ink disabled:pointer-events-none disabled:opacity-30"
      aria-label={direction === "prev" ? "Previous week" : "Next week"}
      disabled={disabled}
      onClick={onClick}
    >
      {direction === "prev" ? <ChevronLeft size={18} /> : <ChevronRight size={18} />}
    </button>
  );
}

function HeaderWeekNav({ week, max, onChange }: { week: number; max: number; onChange: (w: number) => void }) {
  return (
    <div className="flex shrink-0 items-center gap-0.5">
      <span className="hidden sm:block">
        <WeekStepButton direction="prev" disabled={week <= 1} onClick={() => onChange(week - 1)} />
      </span>
      {/* min-h-10 matches every other control in this row — chip's own padding falls well short
          of that on its own, which is what made the row read as three different heights. */}
      <label className="chip relative min-h-10 cursor-pointer gap-1 px-2.5">
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
        <WeekStepButton direction="next" disabled={week >= max} onClick={() => onChange(week + 1)} />
      </span>
    </div>
  );
}

/**
 * On Home the megaphone can just point down the page — the announcements are already there.
 * Anywhere else, clicking it used to leave whatever you were doing to go read them; now it opens a
 * short preview in place instead, so seeing what's new doesn't cost you your spot in the pick flow
 * or the board. "View all announcements" is still one tap away for when a preview isn't enough.
 */
function AnnouncementMenu({ messages, unread, onHome }: { messages: PoolMessage[]; unread: number; onHome: boolean }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  // The megaphone isn't always the rightmost thing in the header — the theme toggle and, signed
  // in, the player chip sit to its right. A popover pinned `right-0` to the button's own tiny
  // wrapper inherits that: it hangs off the button's edge and, on a narrow phone, that's often
  // enough to push its own left edge past the screen's. Pinning it to the viewport instead, offset
  // from the button but clamped so it can never run past either margin, keeps it fully on screen
  // regardless of where in the row the button lands.
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);

  useEffect(() => {
    if (!open) return;
    const place = () => {
      const rect = trigger.current?.getBoundingClientRect();
      if (!rect) return;
      const margin = 16;
      const width = Math.min(336, window.innerWidth - margin * 2);
      const natural = window.innerWidth - rect.right;
      const right = Math.min(Math.max(natural, margin), window.innerWidth - width - margin);
      setPos({ top: rect.bottom + 8, right });
    };
    place();
    window.addEventListener("resize", place);
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      trigger.current?.focus();
    };
    const onDown = (e: MouseEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onDown);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onDown);
    };
  }, [open]);

  // A pool that goes quiet for a few weeks comes back to a stack of unread posts, not two or
  // three — capped here, with the list itself scrollable too, so neither a long stack nor a short
  // viewport can push "View all announcements" out of reach.
  const preview = messages.slice(0, unread);
  const shown = preview.slice(0, 3);
  const moreCount = preview.length - shown.length;

  return (
    <div ref={wrap} className="relative shrink-0">
      <button
        ref={trigger}
        type="button"
        className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 border-ink bg-surface hover:bg-paper-2"
        aria-label={`Announcements${unread ? `, ${unread} new` : ""}`}
        aria-haspopup={onHome ? undefined : "dialog"}
        aria-expanded={onHome ? undefined : open}
        onClick={() =>
          onHome
            ? document.getElementById("announcements")?.scrollIntoView({ behavior: "smooth", block: "start" })
            : setOpen((v) => !v)
        }
      >
        <Megaphone size={19} />
        {unread > 0 ? (
          <span className="font-display absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full border-2 border-ink bg-flag px-1 text-[10px] font-extrabold leading-none" aria-hidden="true">
            {unread > 9 ? "9+" : unread}
          </span>
        ) : null}
      </button>
      <AnimatePresence>
        {open && !onHome && pos && (
          <motion.div
            role="dialog"
            aria-label="Announcements"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.12 }}
            style={{ top: pos.top, right: pos.right }}
            // Fixed to the viewport, not the button's own tiny wrapper: the megaphone isn't always
            // the rightmost thing in the row, and a popover pinned to its edge could hang its own
            // left edge off a narrow screen. `pos` is pre-clamped so this never runs past either
            // margin. Below md the tab bar is also fixed to the bottom of the viewport rather than
            // scrolled away with the page, so the shorter cap on this side of that breakpoint
            // leaves it clear; md: drops the cap once that bar is gone.
            className="card fixed z-30 flex max-h-[min(22rem,calc(100dvh-13rem))] w-[min(21rem,calc(100vw-2rem))] flex-col overflow-hidden p-3 md:max-h-[min(28rem,calc(100dvh-6rem))]"
          >
            <p className="font-display shrink-0 text-sm font-extrabold">
              {preview.length ? `${preview.length} new announcement${preview.length === 1 ? "" : "s"}` : "You're all caught up"}
            </p>
            {shown.length > 0 && (
              <ul className="mt-2 min-h-0 space-y-2 overflow-y-auto">
                {shown.map((m) => (
                  <li key={m.id}>
                    <Link
                      to={`/announcements#message-${m.id}`}
                      className="block rounded-xl border-2 border-line p-2.5 hover:bg-paper-2"
                      onClick={() => setOpen(false)}
                    >
                      <p className="truncate text-xs font-bold text-ink-2">
                        {m.authorName} · {formatShortDay(m.createdAt)}
                      </p>
                      <p className="mt-0.5 line-clamp-2 text-sm">{m.body}</p>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            {moreCount > 0 && <p className="mt-2 shrink-0 text-xs text-ink-2">+{moreCount} more unread</p>}
            <Link to="/announcements" className="btn btn-sm mt-3 w-full shrink-0" onClick={() => setOpen(false)}>
              View all announcements
            </Link>
          </motion.div>
        )}
      </AnimatePresence>
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
 * What the lockup opens.
 *
 * It is not a switcher and stopped pretending to be one: on the web a pool *is* an address, so
 * the only pool this page can show you is the one you are standing in, and another pool is
 * another link. What is useful here is the rest of it — how to get into one, and what else Tally
 * plays — which is the same panel Home and the account page show, written once in `PoolPlays`.
 *
 * The iOS app does have a switcher, because it keeps a catalogue of pools on the device and can
 * talk to each host in turn. A browser tab cannot: storage is per origin, so a second pool's app
 * is a stranger to this one.
 */
function PoolSheet({ poolName, poolType, onClose }: { poolName: string; poolType?: string; onClose: () => void }) {
  return (
    <Sheet title="Pools" onClose={onClose}>
      <h3 className="font-display mb-2 text-sm font-extrabold uppercase tracking-wider text-ink-3">You're in</h3>
      <div className="card-flat bg-surface p-3">
        <div className="font-display truncate font-extrabold">{poolName}</div>
        <div className="truncate text-xs text-ink-2">{poolType ?? "High Five"}</div>
      </div>
      <h3 className="font-display mb-2 mt-5 text-sm font-extrabold uppercase tracking-wider text-ink-3">
        Join or start a pool
      </h3>
      <PoolPlays />
    </Sheet>
  );
}
