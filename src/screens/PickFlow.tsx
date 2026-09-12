import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate, useNavigate, useParams, useSearchParams } from "react-router";
import { AnimatePresence, motion, Reorder, useDragControls } from "motion/react";
import confetti from "canvas-confetti";
import { useBootstrap, usePutPicks, useWeek } from "../api/queries.ts";
import { ApiClientError } from "../api/client.ts";
import { usePlayer } from "../lib/player.tsx";
import { useOnline } from "../lib/online.ts";
import { useNow, formatCountdown, formatSlot, formatTime } from "../lib/time.ts";
import { clearDraft, emptyDraft, loadDraft, moveInOrder, removeSelection, saveDraft, toggleSelection, type Draft } from "../lib/draft.ts";
import { TEAMS, type Abbr } from "../../shared/teams.ts";
import type { GameDTO } from "../../shared/api.ts";
import type { Pick } from "../../shared/types.ts";
import { MAX_PICKS } from "../../shared/picks.ts";
import { isLocked, WEEKS } from "../../shared/week.ts";
import { ErrorState, RankBadge, Spinner } from "../components/Common.tsx";
import { useHeaderWeek, useHideNav } from "../components/Chrome.tsx";
import { ChevronDown, ChevronUp, Grip, Lock, Share } from "../components/Icons.tsx";
import { TeamSticker } from "../components/TeamSticker.tsx";
import { useToast } from "../components/Toast.tsx";

type Step = "select" | "rank" | "done";
const ALL_RANKS = Array.from({ length: MAX_PICKS }, (_, i) => i + 1);

export function PickFlow() {
  const { week: weekParam } = useParams();
  const week = Number(weekParam);
  if (!Number.isInteger(week) || week < 1 || week > WEEKS) return <Navigate to="/" replace />;
  return <PickFlowInner key={week} week={week} />;
}

function PickFlowInner({ week }: { week: number }) {
  const { player } = usePlayer();
  const playerId = player!.id;
  const nav = useNavigate();
  const toast = useToast();
  const boot = useBootstrap();
  const wk = useWeek(week);
  const put = usePutPicks(week);
  const now = useNow(15_000);
  const [params, setParams] = useSearchParams();
  const raw = params.get("step");
  // "confirm" was its own screen once; ranking is the confirmation now.
  const stepParam = (raw === "confirm" ? "rank" : raw) as Step | null;

  const online = useOnline();
  const [saveError, setSaveError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(() => loadDraft(playerId, week) ?? emptyDraft());
  const seeded = useRef(loadDraft(playerId, week) !== null);
  const [shakeTray, setShakeTray] = useState(0);

  const games = useMemo(() => wk.data?.games ?? [], [wk.data]);
  const gamesById = useMemo(() => new Map(games.map((g) => [g.id, g])), [games]);
  const myPicks = useMemo(() => wk.data?.myPicks ?? [], [wk.data]);
  const lockedNow = useCallback((g: GameDTO) => g.locked || isLocked(g, now), [now]);

  // Seed the draft from saved picks the first time the week loads.
  useEffect(() => {
    if (!wk.data || seeded.current) return;
    seeded.current = true;
    const unlocked = myPicks.filter((p) => {
      const g = gamesById.get(p.gameId);
      return g && !lockedNow(g);
    });
    if (unlocked.length) {
      setDraft({
        selections: Object.fromEntries(unlocked.map((p) => [p.gameId, p.team])),
        order: [...unlocked].sort((a, b) => a.rank - b.rank).map((p) => p.gameId),
      });
    }
  }, [wk.data, myPicks, gamesById, lockedNow]);

  useEffect(() => saveDraft(playerId, week, draft), [draft, playerId, week]);

  // Drop draft selections whose games have since kicked off and weren't saved.
  useEffect(() => {
    if (!wk.data) return;
    const savedLocked = new Set(myPicks.map((p) => p.gameId));
    const stale = draft.order.filter((id) => {
      const g = gamesById.get(id);
      return !g || (lockedNow(g) && !savedLocked.has(id));
    });
    if (stale.length) {
      setDraft((d) => stale.reduce((acc, id) => removeSelection(acc, id), d));
      toast("A game you'd picked just kicked off, so it's out. Swap in another.", "error");
    }
  }, [wk.data, draft.order, gamesById, lockedNow, myPicks, toast]);

  const frozen = useMemo(
    () =>
      myPicks
        .filter((p) => {
          const g = gamesById.get(p.gameId);
          return g && lockedNow(g);
        })
        .sort((a, b) => a.rank - b.rank),
    [myPicks, gamesById, lockedNow],
  );
  const frozenRanks = useMemo(() => new Set(frozen.map((p) => p.rank)), [frozen]);
  const availableRanks = useMemo(() => ALL_RANKS.filter((r) => !frozenRanks.has(r)), [frozenRanks]);
  const draftOrder = useMemo(() => draft.order.filter((id) => gamesById.has(id) && !lockedNow(gamesById.get(id)!)), [draft.order, gamesById, lockedNow]);
  const unlockedPicks = useMemo<Pick[]>(
    () =>
      draftOrder.slice(0, availableRanks.length).map((gameId, i) => ({ gameId, team: draft.selections[gameId]!, rank: availableRanks[i]! })),
    [draftOrder, draft.selections, availableRanks],
  );
  const merged = useMemo(() => [...frozen, ...unlockedPicks].sort((a, b) => a.rank - b.rank), [frozen, unlockedPicks]);
  const total = merged.length;
  const hasSaved = myPicks.length > 0;
  const savedUnlocked = useMemo(() => myPicks.filter((p) => !frozenRanks.has(p.rank)), [myPicks, frozenRanks]);
  const dirty = useMemo(() => {
    const key = (p: Pick) => `${p.gameId}:${p.team}:${p.rank}`;
    const a = new Set(savedUnlocked.map(key));
    const b = new Set(unlockedPicks.map(key));
    return a.size !== b.size || [...a].some((k) => !b.has(k));
  }, [savedUnlocked, unlockedPicks]);
  const anyUnlocked = games.some((g) => !lockedNow(g));
  const allLocked = games.length > 0 && !anyUnlocked;

  const step: Step | "review" = stepParam ?? (hasSaved && !dirty ? "review" : "select");
  useHideNav(step === "select" || step === "rank");
  useHeaderWeek(week, (w) => nav(`/week/${w}`));

  const setStep = (s: Step | null) => {
    setParams(s ? { step: s } : {}, { replace: s === "done" ? false : true });
    window.scrollTo({ top: 0 });
  };

  const onPick = (game: GameDTO, team: Abbr) => {
    if (lockedNow(game)) return;
    const already = draft.selections[game.id];
    if (!already && frozen.length + draftOrder.length >= MAX_PICKS) {
      setShakeTray((s) => s + 1);
      toast("That's five already — tap one in the tray to swap it out.");
      return;
    }
    navigator.vibrate?.(8);
    setDraft((d) => toggleSelection(d, game.id, team));
  };

  const share = async () => {
    const url = window.location.origin;
    const title = boot.data?.poolName ?? "High Five";
    try {
      if (navigator.share) {
        await navigator.share({ title, text: `Join our NFL pool — pick five games a week and rank them.`, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      toast("Link copied — send it to the group.", "success");
    } catch {
      /* user dismissed the share sheet */
    }
  };

  const submit = async () => {
    setSaveError(null);
    try {
      const res = await put.mutateAsync({ picks: merged });
      clearDraft(playerId, week);
      seeded.current = false;
      setDraft(emptyDraft());
      setStep("done");
      const lead = res.picks.find((p) => p.rank === Math.min(...res.picks.map((x) => x.rank)));
      fireConfetti(lead ? TEAMS[lead.team] : undefined);
    } catch (err) {
      if (err instanceof ApiClientError && err.status === 409) {
        const ids = (err.details as { gameIds?: string[] } | undefined)?.gameIds ?? [];
        setDraft((d) => ids.reduce((acc, id) => removeSelection(acc, id), d));
        toast(ids.length ? "One of those games just kicked off. Swap it for another." : err.message, "error");
        await wk.refetch();
        setStep("select");
      } else {
        setSaveError(
          !navigator.onLine
            ? "You're offline. Your picks are saved on this phone — try again when you're back."
            : err instanceof Error
              ? err.message
              : "Couldn't save your picks.",
        );
      }
    }
  };

  if (wk.isPending || boot.isPending) return <Spinner label="Loading the slate…" />;
  if (wk.error) return <ErrorState message={wk.error.message} onRetry={() => wk.refetch()} />;

  const openGames = games.filter((g) => !lockedNow(g));
  // Slots only go as high as this player can actually still fill — a late joiner with two
  // games left sees two slots, not five empty ones.
  const slotCount = Math.min(MAX_PICKS, frozen.length + openGames.length);
  const status = allLocked
    ? hasSaved
      ? { label: "Locked", tone: "bg-paper-2" }
      : { label: "No picks", tone: "bg-paper-2" }
    : hasSaved && !dirty
      ? { label: "Picks in ✓", tone: "bg-turf-soft" }
      : { label: "", tone: "" };

  // The review screen spreads into two columns once there is a "who picked whom" panel to show.
  const reviewWide = step === "review" && games.some(lockedNow);
  const wideStep = step === "select" || reviewWide;

  return (
    <div>
      <AnimatePresence mode="wait" initial={false}>
        {step === "review" ? (
          <StepWrap key="review" wide={reviewWide}>
            <ReviewStep week={week} games={games} myPicks={myPicks} pickCounts={wk.data!.pickCounts} lockedNow={lockedNow} anyUnlocked={anyUnlocked} onEdit={() => setStep("select")} submitted={wk.data!.submitted} status={status} />
          </StepWrap>
        ) : step === "select" ? (
          <StepWrap key="select" wide>
            <SelectStep games={games} draft={draft} frozen={frozen} lockedNow={lockedNow} onPick={onPick} pickCounts={wk.data!.pickCounts} allLocked={allLocked} hasSaved={hasSaved} currentWeek={boot.data!.currentWeek} week={week} now={now} openCount={openGames.length} picked={merged.length} slotCount={slotCount} status={status} onNext={() => setStep("rank")} canRank={anyUnlocked && unlockedPicks.length > 0} />
            <PickTray merged={merged} frozen={frozen} shake={shakeTray} slots={slotCount} onRemove={(gameId) => setDraft((d) => removeSelection(d, gameId))} onNext={() => setStep("rank")} disabled={!anyUnlocked} />
          </StepWrap>
        ) : step === "rank" ? (
          <StepWrap key="rank">
            <RankStep
              frozen={frozen}
              order={draftOrder}
              availableRanks={availableRanks}
              selections={draft.selections}
              gamesById={gamesById}
              merged={merged}
              pending={put.isPending}
              error={saveError}
              offline={!online}
              onOrder={(order) => setDraft((d) => ({ ...d, order }))}
              onBack={() => setStep("select")}
              onSubmit={submit}
            />
          </StepWrap>
        ) : (
          <StepWrap key="done">
            <DoneStep name={player!.name} week={week} picks={myPicks.length ? myPicks : merged} gamesById={gamesById} onReview={() => setStep(null)} onShare={share} />
          </StepWrap>
        )}
      </AnimatePresence>
    </div>
  );
}

function StepWrap({ children, wide = false }: { children: React.ReactNode; wide?: boolean }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={{ duration: 0.18 }}
      className={`mt-4 ${wide ? "" : "mx-auto w-full max-w-[760px]"}`}
    >
      {children}
    </motion.div>
  );
}

// ---------- Select ----------

function SelectStep({
  games, draft, frozen, lockedNow, onPick, pickCounts, allLocked, hasSaved, currentWeek, week, now, openCount, picked, slotCount, status, onNext, canRank,
}: {
  games: GameDTO[];
  draft: Draft;
  frozen: Pick[];
  lockedNow: (g: GameDTO) => boolean;
  onPick: (g: GameDTO, team: Abbr) => void;
  pickCounts: Record<string, { away: number; home: number }>;
  allLocked: boolean;
  hasSaved: boolean;
  currentWeek: number;
  week: number;
  now: string;
  openCount: number;
  picked: number;
  slotCount: number;
  status: { label: string; tone: string };
  onNext: () => void;
  canRank: boolean;
}) {
  const full = picked >= slotCount && slotCount > 0;
  const frozenByGame = new Map(frozen.map((p) => [p.gameId, p]));
  const open = games.filter((g) => !lockedNow(g));
  const started = games.filter((g) => lockedNow(g));
  const [showStarted, setShowStarted] = useState(frozen.length > 0);

  const card = (g: GameDTO) => (
    <GameCard
      key={g.id}
      game={g}
      locked={lockedNow(g)}
      now={now}
      selection={draft.selections[g.id] ?? frozenByGame.get(g.id)?.team}
      frozenPick={frozenByGame.get(g.id)}
      counts={pickCounts[g.id]}
      muted={full && !draft.selections[g.id] && !frozenByGame.has(g.id)}
      onPick={(team) => onPick(g, team)}
    />
  );

  return (
    <div>
      {allLocked ? (
        <div className="card-flat mb-4 max-w-[760px] bg-paper-2 px-4 py-3 text-sm">
          <b>Every Week {week} game has kicked off.</b> {hasSaved ? "Your picks are in the books." : "No picks this week."}{" "}
          {currentWeek !== week && (
            <Link className="font-bold underline" to={`/week/${currentWeek}`}>
              Pick Week {currentWeek} →
            </Link>
          )}
        </div>
      ) : (
        <header className="mb-4 flex max-w-[900px] flex-wrap items-start justify-between gap-4">
          <div className="max-w-[560px]">
            <h2 className="font-display text-[1.9rem] font-extrabold leading-none tracking-tight">
              Pick {slotCount} winner{slotCount === 1 ? "" : "s"}
              {picked > 0 && (
                <span className="ml-2 align-middle text-base font-bold text-ink-3">
                  {picked}/{slotCount} in
                </span>
              )}
              {status.label && <span className={`chip ml-2 align-middle text-sm ${status.tone}`}>{status.label}</span>}
            </h2>
            <p className="mt-1.5 text-[14px] leading-snug text-ink-2">
              {full
                ? "That's your five. Rank them next — surest pick 5 pts, least sure 1."
                : "Tap who you think wins. You'll rank them next — surest pick 5 pts, least sure 1."}
            </p>
            <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-ink-3">
              <span className="chip bg-white py-0 text-[10px] font-bold">
                <Lock size={10} /> No weekly deadline
              </span>
              <span>Games lock one by one at kickoff · {openCount} open</span>
            </p>
          </div>
          {/* Phones get the sticky tray instead; .btn sets display, so hide from a wrapper. */}
          <span className="hidden sm:block">
            <AnimatePresence>
              {full && (
                <motion.button
                  initial={{ opacity: 0, scale: 0.9, y: -4 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  transition={{ type: "spring", stiffness: 500, damping: 26 }}
                  className="btn btn-turf text-lg"
                  onClick={onNext}
                  disabled={!canRank}
                >
                  Rank them →
                </motion.button>
              )}
            </AnimatePresence>
          </span>
        </header>
      )}

      <ul className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-3">{open.map(card)}</ul>

      {started.length > 0 && (
        <section className="mt-8">
          <button
            className="flex w-full select-none items-center gap-2 border-t-2 border-dashed border-line pt-4 text-left"
            onClick={() => setShowStarted((v) => !v)}
            aria-expanded={showStarted}
          >
            <span className="font-display text-sm font-extrabold uppercase tracking-wider text-ink-3">
              Already kicked off ({started.length})
            </span>
            <ChevronDown className={`ml-auto text-ink-3 transition-transform ${showStarted ? "rotate-180" : ""}`} />
          </button>
          {showStarted && (
            <ul className="mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-3">{started.map(card)}</ul>
          )}
        </section>
      )}
    </div>
  );
}

function GameCard({
  game, locked, now, selection, frozenPick, counts, muted = false, onPick,
}: {
  game: GameDTO;
  locked: boolean;
  now: string;
  selection?: Abbr;
  frozenPick?: Pick;
  counts?: { away: number; home: number };
  /** Five are already picked and this one is not among them. Still tappable, just quieter. */
  muted?: boolean;
  onPick: (team: Abbr) => void;
}) {
  const chosen = selection ?? null;
  const msToKick = Date.parse(game.kickoffAt) - Date.parse(now);
  const imminent = !locked && msToKick > 0 && msToKick < 60 * 60 * 1000;

  const side = (abbr: Abbr, label: "away" | "home") => {
    const t = TEAMS[abbr];
    const sel = chosen === abbr;
    const dim = chosen !== null && !sel;
    const won = game.winner === abbr;
    return (
      <motion.button
        type="button"
        disabled={locked}
        onClick={() => onPick(abbr)}
        whileTap={locked ? undefined : { scale: 0.96 }}
        aria-pressed={sel}
        aria-label={`Pick ${t.city} ${t.nickname}`}
        className={`relative flex flex-1 select-none flex-col items-center gap-1 rounded-2xl px-1.5 py-2.5 text-center transition-colors ${
          locked ? "cursor-default" : "cursor-pointer"
        }`}
        style={sel ? { background: `${t.primary}14` } : undefined}
      >
        <TeamSticker abbr={abbr} size={50} selected={sel} dimmed={dim} />
        <span className={`font-display text-[13.5px] font-extrabold leading-tight ${dim ? "text-ink-3" : ""}`}>
          {t.nickname}
        </span>
        {won ? (
          <span className="text-[10px] font-bold uppercase tracking-wider text-turf">Won</span>
        ) : counts ? (
          <span className="text-[10px] font-semibold text-ink-2">{label === "away" ? counts.away : counts.home} picked</span>
        ) : null}
        {sel && frozenPick && (
          <span className="absolute left-1 top-1">
            <RankBadge rank={frozenPick.rank} size="sm" />
          </span>
        )}
      </motion.button>
    );
  };

  return (
    <motion.li
      layout
      className={`card-flat relative select-none overflow-hidden transition-opacity duration-200 ${
        locked ? "bg-paper-2/70" : "bg-white"
      } ${muted ? "opacity-45 hover:opacity-100 focus-within:opacity-100" : ""}`}
      animate={chosen && !locked ? { boxShadow: "4px 4px 0 0 #14120f", y: -1 } : { boxShadow: "0px 0px 0 0 #14120f", y: 0 }}
      transition={{ type: "spring", stiffness: 500, damping: 30 }}
    >
      <div className="flex items-stretch">
        {side(game.away, "away")}
        <div className="flex w-[78px] shrink-0 flex-col items-center justify-center gap-0.5 px-0.5 text-center">
          <span className="font-display text-base font-extrabold leading-none text-ink-3">{game.neutral ? "vs" : "@"}</span>
          {locked ? (
            <span className="flex items-center gap-0.5 text-[10px] font-bold leading-tight text-ink-3">
              <Lock size={10} />
              {game.status === "final" ? "Final" : "Live"}
            </span>
          ) : (
            <span className={`text-[10px] font-semibold leading-tight ${imminent ? "text-danger" : "text-ink-3"}`}>
              {imminent ? `locks in ${formatCountdown(game.kickoffAt, Date.parse(now))}` : formatSlot(game.kickoffAt)}
            </span>
          )}
        </div>
        {side(game.home, "home")}
      </div>
    </motion.li>
  );
}

function PickTray({
  merged, frozen, shake, slots, onRemove, onNext, disabled,
}: {
  merged: Pick[];
  frozen: Pick[];
  shake: number;
  slots: number;
  onRemove: (gameId: string) => void;
  onNext: () => void;
  disabled: boolean;
}) {
  const frozenIds = new Set(frozen.map((p) => p.gameId));
  const count = merged.length;
  const editable = merged.filter((p) => !frozenIds.has(p.gameId)).length;
  const full = count >= slots;
  const label = count === 0 ? `Pick ${slots}` : full ? "Rank them →" : `Rank ${count} →`;
  return (
    <div className="fixed inset-x-0 bottom-0 z-40">
      <div className="mx-auto max-w-[560px] px-4 pb-[max(env(safe-area-inset-bottom),12px)]">
        <motion.div
          key={shake}
          animate={shake ? { x: [-8, 8, -6, 6, 0] } : { x: 0 }}
          transition={{ duration: 0.4 }}
          className="card flex items-center gap-2 p-2"
        >
          <div className="flex flex-1 items-center gap-1.5">
            {Array.from({ length: slots }, (_, i) => i + 1).map((i) => {
              const p = merged[i - 1];
              const isFrozen = p ? frozenIds.has(p.gameId) : false;
              return (
                <div
                  key={i}
                  className="flex h-10 w-10 items-center justify-center rounded-xl border-2 border-dashed border-line bg-paper-2/60"
                >
                  <AnimatePresence>
                    {p && (
                      <motion.button
                        key={p.gameId}
                        type="button"
                        aria-label={isFrozen ? `${TEAMS[p.team].nickname} (locked)` : `Remove ${TEAMS[p.team].nickname}`}
                        initial={{ scale: 0, rotate: -20 }}
                        animate={{ scale: 1, rotate: 0 }}
                        exit={{ scale: 0, rotate: 20 }}
                        transition={{ type: "spring", stiffness: 600, damping: 22 }}
                        onClick={() => !isFrozen && onRemove(p.gameId)}
                        className="relative h-9 w-9"
                      >
                        <TeamSticker abbr={p.team} size={36} flat />
                        {isFrozen && (
                          <span className="absolute -bottom-1 -right-1 rounded-full bg-ink p-0.5 text-paper">
                            <Lock size={10} />
                          </span>
                        )}
                      </motion.button>
                    )}
                  </AnimatePresence>
                </div>
              );
            })}
          </div>
          <motion.button
            className={`btn shrink-0 whitespace-nowrap ${full ? "btn-turf px-4 text-base" : "btn-sm btn-primary px-3"}`}
            disabled={count === 0 || disabled || editable === 0}
            onClick={onNext}
            animate={full ? { scale: [1, 1.08, 1, 1.05, 1] } : { scale: 1 }}
            transition={{ duration: 0.7, times: [0, 0.25, 0.5, 0.75, 1] }}
          >
            {label}
          </motion.button>
        </motion.div>
      </div>
    </div>
  );
}

// ---------- Rank ----------

function RankStep({
  frozen, order, availableRanks, selections, gamesById, merged, pending, error, offline, onOrder, onBack, onSubmit,
}: {
  frozen: Pick[];
  order: string[];
  availableRanks: number[];
  selections: Record<string, Abbr>;
  gamesById: Map<string, GameDTO>;
  merged: Pick[];
  pending: boolean;
  error: string | null;
  offline: boolean;
  onOrder: (order: string[]) => void;
  onBack: () => void;
  onSubmit: () => void;
}) {
  const possible = merged.reduce((sum, p) => sum + (6 - p.rank), 0);
  return (
    <div>
      <h2 className="font-display text-2xl font-extrabold tracking-tight">How sure are you?</h2>
      <p className="mb-4 text-sm text-ink-2">
        Drag to reorder — top pick <b>5 points</b>, bottom one <b>1</b>. Up to <b>{possible}</b> this week.
      </p>
      {frozen.length > 0 && (
        <div className="mb-4">
          <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-ink-3">Locked in</h3>
          <ul className="space-y-2">
            {frozen.map((p) => (
              <li key={p.gameId} className="card-flat flex select-none items-center gap-3 bg-paper-2/70 p-2.5">
                <RankBadge rank={p.rank} muted />
                <TeamSticker abbr={p.team} size={44} flat />
                <MatchupText pick={p} game={gamesById.get(p.gameId)} compact />
                <Lock className="ml-auto text-ink-3" />
              </li>
            ))}
          </ul>
        </div>
      )}
      <Reorder.Group axis="y" values={order} onReorder={onOrder} className="space-y-2">
        {order.map((gameId, i) => (
          <RankRow
            key={gameId}
            gameId={gameId}
            team={selections[gameId]!}
            rank={availableRanks[i] ?? MAX_PICKS}
            game={gamesById.get(gameId)}
            canUp={i > 0}
            canDown={i < order.length - 1}
            onUp={() => onOrder(moveInOrder(order, i, i - 1))}
            onDown={() => onOrder(moveInOrder(order, i, i + 1))}
          />
        ))}
      </Reorder.Group>
      <p className="mt-4 text-xs text-ink-3">You can still change a pick until that game kicks off.</p>
      {(error || offline) && (
        <div role="alert" className="card-flat mt-4 flex items-start gap-3 border-danger bg-danger-soft px-4 py-3 text-sm">
          <span className="min-w-0 flex-1 font-semibold">
            {offline ? "You're offline. Your picks are saved on this phone — lock them in once you're back." : error}
          </span>
          {!offline && (
            <button className="btn btn-sm shrink-0" onClick={onSubmit} disabled={pending}>
              Try again
            </button>
          )}
        </div>
      )}
      <div className="mt-4 flex gap-2">
        <button className="btn" onClick={onBack} disabled={pending}>
          Back
        </button>
        <motion.button
          className="btn btn-turf flex-1 text-lg"
          onClick={onSubmit}
          disabled={pending || offline || (order.length === 0 && frozen.length === 0)}
          whileTap={{ scale: 0.97 }}
        >
          {pending ? (
            "Saving…"
          ) : (
            <>
              Lock it in <Lock size={20} />
            </>
          )}
        </motion.button>
      </div>
    </div>
  );
}

function RankRow({
  gameId, team, rank, game, canUp, canDown, onUp, onDown,
}: {
  gameId: string;
  team: Abbr;
  rank: number;
  game?: GameDTO;
  canUp: boolean;
  canDown: boolean;
  onUp: () => void;
  onDown: () => void;
}) {
  const controls = useDragControls();
  return (
    <Reorder.Item
      value={gameId}
      dragListener={false}
      dragControls={controls}
      layout
      whileDrag={{ scale: 1.03, boxShadow: "6px 6px 0 0 #14120f", zIndex: 10 }}
      className="card-flat relative flex touch-pan-y select-none items-center gap-3 bg-white p-2.5"
    >
      <motion.div key={rank} initial={{ scale: 0.7 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 600, damping: 20 }}>
        <RankBadge rank={rank} />
      </motion.div>
      <TeamSticker abbr={team} size={48} flat />
      <MatchupText pick={{ gameId, team, rank }} game={game} compact />
      <div className="ml-auto flex items-center gap-1">
        <div className="flex flex-col">
          <button className="rounded-lg p-1 text-ink-2 disabled:opacity-30" aria-label="Move up" disabled={!canUp} onClick={onUp}>
            <ChevronUp />
          </button>
          <button className="rounded-lg p-1 text-ink-2 disabled:opacity-30" aria-label="Move down" disabled={!canDown} onClick={onDown}>
            <ChevronDown />
          </button>
        </div>
        <div
          className="-m-1 cursor-grab touch-none rounded-lg p-3 text-ink-3 active:cursor-grabbing"
          onPointerDown={(e) => controls.start(e)}
          aria-label="Drag to reorder"
          role="button"
        >
          <Grip />
        </div>
      </div>
    </Reorder.Item>
  );
}

function MatchupText({ pick, game, compact = false }: { pick: Pick; game?: GameDTO; compact?: boolean }) {
  const t = TEAMS[pick.team];
  const opp = game ? TEAMS[game.away === pick.team ? game.home : game.away] : null;
  return (
    <div className="min-w-0">
      <div className="font-display truncate text-[15px] font-extrabold leading-tight">{t.nickname}</div>
      <div className="truncate text-xs text-ink-2">
        {opp ? (compact ? `over ${opp.display}` : `over the ${opp.nickname}`) : ""}
        {game ? ` · ${formatTime(game.kickoffAt)}` : ""}
      </div>
    </div>
  );
}

/** Home team colour for side-by-side bars; falls back to the secondary colour when both teams share a primary. */
function contrastColor(home: Abbr, away: Abbr): string {
  const h = TEAMS[home];
  return h.primary.toLowerCase() === TEAMS[away].primary.toLowerCase() ? h.secondary : h.primary;
}

function fireConfetti(team?: { primary: string; secondary: string }) {
  const colors = team ? [team.primary, team.secondary, "#FFD23F", "#ffffff"] : ["#0B7A3B", "#FFD23F", "#14120F", "#ffffff"];
  const opts = { spread: 70, ticks: 200, gravity: 1.1, scalar: 1.1, colors, disableForReducedMotion: true };
  confetti({ ...opts, particleCount: 90, origin: { x: 0.5, y: 0.7 } });
  setTimeout(() => confetti({ ...opts, particleCount: 50, angle: 60, origin: { x: 0, y: 0.8 } }), 180);
  setTimeout(() => confetti({ ...opts, particleCount: 50, angle: 120, origin: { x: 1, y: 0.8 } }), 300);
}

function DoneStep({
  name, week, picks, gamesById, onReview, onShare,
}: {
  name: string;
  week: number;
  picks: Pick[];
  gamesById: Map<string, GameDTO>;
  onReview: () => void;
  onShare: () => void;
}) {
  const sorted = [...picks].sort((a, b) => a.rank - b.rank);
  return (
    <div className="text-center">
      <motion.div
        initial={{ scale: 3, rotate: -18, opacity: 0 }}
        animate={{ scale: 1, rotate: -6, opacity: 1 }}
        transition={{ type: "spring", stiffness: 260, damping: 18, delay: 0.05 }}
        className="stamp mt-6 text-3xl text-turf"
      >
        Locked in
      </motion.div>
      <h2 className="font-display mt-6 text-2xl font-extrabold tracking-tight">Nice, {name}.</h2>
      <p className="text-sm text-ink-2">Your five are in for Week {week}.</p>
      <ul className="mx-auto mt-5 flex max-w-sm flex-col gap-2 text-left">
        {sorted.map((p, i) => (
          <motion.li
            key={p.gameId}
            initial={{ opacity: 0, x: -12 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.25 + i * 0.07 }}
            className="card-flat flex items-center gap-3 bg-white p-2"
          >
            <RankBadge rank={p.rank} size="sm" />
            <TeamSticker abbr={p.team} size={36} flat />
            <MatchupText pick={p} game={gamesById.get(p.gameId)} />
          </motion.li>
        ))}
      </ul>
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        <button className="btn" onClick={onReview}>
          Done
        </button>
        <Link className="btn btn-primary" to={`/board/week/${week}`}>
          See the board
        </Link>
      </div>
      <button className="btn btn-ghost btn-sm mt-3 text-ink-2" onClick={onShare}>
        <Share /> Invite someone to join
      </button>
    </div>
  );
}

// ---------- Review (picks are in) ----------

function ReviewStep({
  week, games, myPicks, pickCounts, lockedNow, anyUnlocked, onEdit, submitted, status,
}: {
  week: number;
  games: GameDTO[];
  myPicks: Pick[];
  pickCounts: Record<string, { away: number; home: number }>;
  lockedNow: (g: GameDTO) => boolean;
  anyUnlocked: boolean;
  onEdit: () => void;
  submitted: number;
  status: { label: string; tone: string };
}) {
  const gamesById = new Map(games.map((g) => [g.id, g]));
  const sorted = [...myPicks].sort((a, b) => a.rank - b.rank);
  let points = 0;
  let correct = 0;
  const rows = sorted.map((p) => {
    const g = gamesById.get(p.gameId);
    const outcome = !g || g.winner === null ? (g && lockedNow(g) ? "live" : "pending") : g.winner === "TIE" ? "tie" : g.winner === p.team ? "win" : "loss";
    const pts = outcome === "win" ? 6 - p.rank : 0;
    points += pts;
    if (outcome === "win") correct++;
    return { p, g, outcome, pts };
  });
  const finals = rows.filter((r) => r.outcome === "win" || r.outcome === "loss" || r.outcome === "tie").length;
  const started = games.filter(lockedNow);
  const nextKick = games.filter((g) => !lockedNow(g)).map((g) => g.kickoffAt).sort()[0];
  const twoCol = started.length > 0;
  return (
    <div className={twoCol ? "lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,380px)] lg:items-start lg:gap-6" : ""}>
      <div className="card p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-display text-2xl font-extrabold tracking-tight">Your five</h2>
              {status.label && <span className={`chip text-sm ${status.tone}`}>{status.label}</span>}
            </div>
            <p className="text-sm text-ink-2">
              {finals === 0 ? `${sorted.length} pick${sorted.length === 1 ? "" : "s"} in · ${submitted} player${submitted === 1 ? "" : "s"} submitted` : `${correct} of ${finals} right so far`}
            </p>
            {nextKick && (
              <p className="mt-0.5 flex items-center gap-1 text-xs text-ink-3">
                <Lock size={11} /> Next game locks {formatSlot(nextKick)}
              </p>
            )}
          </div>
          <div className="text-right">
            <div className="font-display text-4xl font-extrabold leading-none tabular">{points}</div>
            <div className="text-[11px] font-bold uppercase tracking-wider text-ink-3">points</div>
          </div>
        </div>
        <ul className="mt-4 space-y-2">
          {rows.map(({ p, g, outcome, pts }) => (
            <li key={p.gameId} className={`flex items-center gap-3 rounded-2xl border-2 p-2 ${outcomeStyle(outcome)}`}>
              <RankBadge rank={p.rank} size="sm" />
              <TeamSticker abbr={p.team} size={40} flat dimmed={outcome === "loss" || outcome === "tie"} />
              <MatchupText pick={p} game={g} />
              <span className="ml-auto shrink-0 text-right">
                <OutcomeTag outcome={outcome} pts={pts} />
              </span>
            </li>
          ))}
        </ul>
        <div className="mt-4 flex flex-wrap gap-2">
          {anyUnlocked && (
            <button className="btn btn-sm" onClick={onEdit}>
              Edit picks
            </button>
          )}
          <Link className="btn btn-sm btn-primary" to={`/board/week/${week}`}>
            See the board
          </Link>
        </div>
      </div>

      {twoCol && (
        <section className="mt-6 lg:mt-0">
          <h3 className="font-display mb-2 text-lg font-extrabold">Who picked whom</h3>
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
            {started.map((g) => {
              const c = pickCounts[g.id] ?? { away: 0, home: 0 };
              const total = c.away + c.home;
              const mine = myPicks.find((p) => p.gameId === g.id)?.team;
              const pct = (n: number) => (total ? Math.round((n / total) * 100) : 0);
              return (
                <li key={g.id} className="card-flat bg-white p-3">
                  <div className="flex items-center gap-2 text-sm">
                    <TeamSticker abbr={g.away} size={28} flat />
                    <span className={`font-bold ${mine === g.away ? "text-turf" : ""}`}>{TEAMS[g.away].display}</span>
                    <span className="ml-auto text-xs text-ink-3">{g.winner ? (g.winner === "TIE" ? "Tie" : `${TEAMS[g.winner].display} won`) : "In progress"}</span>
                    <span className={`font-bold ${mine === g.home ? "text-turf" : ""}`}>{TEAMS[g.home].display}</span>
                    <TeamSticker abbr={g.home} size={28} flat />
                  </div>
                  <div className="mt-2 flex h-3 overflow-hidden rounded-full border-2 border-ink bg-paper-2">
                    <motion.div initial={{ width: 0 }} animate={{ width: `${pct(c.away)}%` }} style={{ background: TEAMS[g.away].primary }} />
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${pct(c.home)}%` }}
                      style={{ background: contrastColor(g.home, g.away) }}
                      className="ml-auto border-l-2 border-white"
                    />
                  </div>
                  <div className="mt-1 flex justify-between text-[11px] font-semibold text-ink-2">
                    <span>{c.away} picked</span>
                    <span>{c.home} picked</span>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}

export function outcomeStyle(outcome: string): string {
  switch (outcome) {
    case "win":
      return "border-turf bg-turf-soft";
    case "loss":
      return "border-danger/60 bg-danger-soft/60";
    case "tie":
      return "border-line bg-paper-2";
    case "live":
      return "border-flag bg-flag-soft";
    default:
      return "border-line bg-white";
  }
}

export function OutcomeTag({ outcome, pts }: { outcome: string; pts: number }) {
  if (outcome === "win") return <span className="font-display text-lg font-extrabold text-turf">+{pts}</span>;
  if (outcome === "loss") return <span className="font-display text-lg font-extrabold text-danger">0</span>;
  if (outcome === "tie") return <span className="text-xs font-bold text-ink-2">Tie</span>;
  if (outcome === "live") return <span className="text-xs font-bold text-ink-2">Live</span>;
  return <span className="text-xs font-bold text-ink-3">Not yet</span>;
}
