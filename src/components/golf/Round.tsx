import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import { AnimatePresence, motion } from "motion/react";
import type { SharedCard } from "../../api/golf.ts";
import { SlideToLock } from "../SlideToLock.tsx";
import { Sheet } from "../AppShell.tsx";
import { Check, ChevronLeft, ChevronRight } from "../Icons.tsx";
import {
  awardContest,
  contestPrompt,
  contestTitle,
  contestTook,
  entryFor,
  finishHole,
  holeCount,
  holeLabel,
  holedBy,
  lastFinished,
  nameList,
  newStroke,
  nextUnfinishedHole,
  parOf,
  playerOf,
  plural,
  recordStroke,
  reassignStroke,
  removeStroke,
  setPar,
  standingOn,
  tallyRows,
  undoHole,
  type HoleEntry,
  type ScrambleCard,
  type StrokeKind,
} from "../../../shared/golf.ts";

/**
 * The tee you are standing on, in a browser.
 *
 * A straight port of the app's Round tab, and it has to be: the two surfaces are open on the same
 * card at the same moment, so a gesture that means one thing on a phone and another in a browser
 * is an argument in a cart. The names are the biggest things on the page, one tap each; the hole
 * ends on *Holed it* or *Tap-in*, which open a review rather than closing it; and the review is
 * signed off with a slide, because a slide is a decision and a tap is a reflex.
 *
 * The one thing that is genuinely the web's: **the hole lives in the query string**. On a phone
 * `currentHole` is a property of the card because there is one card and one screen. Here there are
 * three browsers and a phone, all on different holes, so syncing it would have them dragging each
 * other backwards — and a hole in the URL is also a hole you can send to somebody ("look at 7").
 */
export function RoundTab({ shared, card }: { shared: SharedCard; card: ScrambleCard }) {
  const [params, setParams] = useSearchParams();
  const count = holeCount(card);
  const requested = Number(params.get("hole"));
  const [fallback, setFallback] = useState(() => firstUnplayed(card));
  const hole = Number.isInteger(requested) && requested >= 1 && requested <= count ? requested : fallback;

  const go = (next: number) => {
    if (next < 1 || next > count) return;
    setFallback(next);
    const query = new URLSearchParams(params);
    query.set("hole", String(next));
    setParams(query, { replace: true });
  };

  const entry = entryFor(card, hole) ?? { hole, strokes: [], finished: false, updatedAt: card.createdAt, awards: [] };
  const par = parOf(card, hole);
  const side = standingOn(card, hole);
  const last = lastFinished(card);

  /** The word for the hole that just went in, over the page for a beat before the next tee. */
  const [stamp, setStamp] = useState<{ text: string; under: boolean } | null>(null);
  useEffect(() => {
    if (!stamp) return;
    const id = setTimeout(() => setStamp(null), 1150);
    return () => clearTimeout(id);
  }, [stamp]);

  const finish = (tapIn: boolean) => {
    const score = entry.strokes.length + (tapIn ? 1 : 0);
    shared.apply((c) => finishHole(c, hole, tapIn, new Date().toISOString()));
    setStamp({ text: holeLabel(score, par), under: score < par });
    navigator.vibrate?.(score < par ? [18, 40, 18] : 25);
    const next = nextUnfinishedHole({ ...card, holes: [...card.holes.filter((h) => h.hole !== hole), { ...entry, finished: true }] }, hole);
    if (next) setTimeout(() => go(next), 1150);
  };

  return (
    <div className="relative space-y-3.5">
      {card.holes.length > 0 && entry.strokes.length === 0 && last && last.hole !== hole && (
        <LastHoleStrip card={card} entry={last} onOpen={() => go(last.hole)} />
      )}

      <HoleHeader card={card} hole={hole} onGo={go} onPar={(p) => shared.apply((c) => setPar(c, hole, p, new Date().toISOString()))} />

      {side && (
        <ContestStrip
          card={card}
          hole={hole}
          contest={side.contest}
          winnerId={side.winner?.id ?? null}
          onClaim={(playerId) => shared.apply((c) => awardContest(c, side.contest, hole, playerId, new Date().toISOString()))}
        />
      )}

      <StrokeStrip card={card} entry={entry} shared={shared} hole={hole} />

      {entry.finished ? (
        <FinishedHole card={card} entry={entry} onReopen={() => shared.apply((c) => undoHole(c, hole, new Date().toISOString()))} onGo={go} />
      ) : (
        <HoleControls card={card} entry={entry} hole={hole} shared={shared} onFinish={finish} />
      )}

      <AnimatePresence>
        {stamp && (
          <motion.div
            className="pointer-events-none fixed inset-0 z-40 flex items-center justify-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.p
              role="status"
              initial={{ scale: 2.4, rotate: -6, opacity: 0 }}
              animate={{ scale: 1, rotate: -6, opacity: 1 }}
              exit={{ scale: 1.1, opacity: 0 }}
              transition={{ type: "spring", stiffness: 420, damping: 18 }}
              className={`card font-display px-6 py-3 text-3xl font-extrabold uppercase tracking-[0.12em] ${
                stamp.under ? "text-turf" : "text-ink"
              }`}
            >
              {stamp.text}
            </motion.p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** Where a browser opening the link cold should land: the first hole still to play. */
function firstUnplayed(card: ScrambleCard): number {
  return nextUnfinishedHole(card, 0) ?? 1;
}

// MARK: The hole

function HoleHeader({
  card,
  hole,
  onGo,
  onPar,
}: {
  card: ScrambleCard;
  hole: number;
  onGo: (hole: number) => void;
  onPar: (par: number) => void;
}) {
  const par = parOf(card, hole);
  const entry = entryFor(card, hole);
  const count = holeCount(card);
  return (
    <div className="card flex items-center gap-2 p-3">
      <StepButton direction="prev" disabled={hole <= 1} onClick={() => onGo(hole - 1)} />
      <div className="min-w-0 flex-1">
        <p className="font-display text-2xl font-extrabold leading-none">Hole {hole}</p>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          {/*
            Par is corrected from the tee you are standing on, because nobody fills in eighteen
            numbers before the first drive — and it is the only thing that decides which hole hosts
            which side game, so a par fixed here moves the contest with it, immediately.
          */}
          <button
            type="button"
            className="chip cursor-pointer text-xs hover:bg-paper-2"
            onClick={() => onPar(par >= 5 ? 3 : par + 1)}
            aria-label={`Par ${par}. Change it`}
            title="Tap to cycle par 3, 4, 5"
          >
            Par {par}
            <span aria-hidden="true" className="text-ink-3">
              ⌃⌄
            </span>
          </button>
          {entry?.finished && (
            <span className="chip border-turf bg-turf-soft text-xs">{holeLabel(entry.strokes.length, par)}</span>
          )}
        </div>
      </div>
      <StepButton direction="next" disabled={hole >= count} onClick={() => onGo(hole + 1)} />
    </div>
  );
}

function StepButton({ direction, disabled, onClick }: { direction: "prev" | "next"; disabled: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      aria-label={direction === "prev" ? "Previous hole" : "Next hole"}
      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-2 border-ink bg-surface disabled:pointer-events-none disabled:opacity-30"
    >
      {direction === "prev" ? <ChevronLeft /> : <ChevronRight />}
    </button>
  );
}

/**
 * What the hole you just left came to, and the way back into it.
 *
 * Finishing moves the screen on, which is right in a cart and wrong for the three seconds
 * afterwards when somebody says that last one was Dan's.
 */
function LastHoleStrip({ card, entry, onOpen }: { card: ScrambleCard; entry: HoleEntry; onOpen: () => void }) {
  const word = holeLabel(entry.strokes.length, parOf(card, entry.hole));
  const who = playerOf(card, holedBy(entry))?.name;
  return (
    <button
      type="button"
      onClick={onOpen}
      className="card-flat flex w-full items-center gap-3 bg-paper-2 px-3 py-2.5 text-left hover:bg-paper-2/70"
    >
      <span className="min-w-0 flex-1">
        <span className="font-display block text-sm font-bold">Hole {entry.hole} is in</span>
        <span className="block truncate text-xs text-ink-2">
          {entry.strokes.length}, {word}
          {who ? ` · ${who} holed it` : ""}
        </span>
      </span>
      <span className="font-display shrink-0 text-xs font-bold text-ink-2">Fix</span>
      <ChevronRight size={16} className="shrink-0 text-ink-3" />
    </button>
  );
}

/**
 * The hole's side bet, claimed in one tap.
 *
 * Above the strokes, because it is settled *before* the team decides whose ball to play: everybody
 * tees off, you walk up, and one drive is furthest. Tapping the name already on it takes it back,
 * so claiming, changing and undoing are one gesture with no mode to be in. Yellow while it is
 * open and green once it is settled — the app's whole vocabulary for *wants you* and *done*.
 */
function ContestStrip({
  card,
  hole,
  contest,
  winnerId,
  onClaim,
}: {
  card: ScrambleCard;
  hole: number;
  contest: "longestDrive" | "closestToPin";
  winnerId: string | null;
  onClaim: (playerId: string | null) => void;
}) {
  const winner = playerOf(card, winnerId);
  return (
    <section
      className={`card-flat p-3 ${winnerId ? "bg-turf-soft" : "bg-flag-soft"}`}
      aria-label={contestTitle(contest)}
    >
      <div className="flex items-center gap-2">
        <h2 className="font-display text-xs font-extrabold uppercase tracking-[0.12em] text-ink-2">{contestTitle(contest)}</h2>
        {winnerId && (
          <button type="button" className="btn btn-ghost btn-sm ml-auto px-2 text-xs" onClick={() => onClaim(null)}>
            Clear
          </button>
        )}
      </div>
      <p className={`mt-1 text-sm ${winner ? "text-ink-2" : "font-semibold"}`}>
        {winner ? `${winner.name} ${contestTook(contest)}.` : contestPrompt(contest)}
      </p>
      <div className="mt-2.5 flex flex-wrap gap-1.5">
        {card.players.map((p) => {
          const taken = p.id === winnerId;
          return (
            <button
              key={p.id}
              type="button"
              aria-pressed={taken}
              onClick={() => {
                navigator.vibrate?.(8);
                onClaim(taken ? null : p.id);
              }}
              className={`font-display inline-flex min-h-11 items-center gap-1.5 rounded-full border-2 border-ink px-3.5 text-sm font-bold ${
                taken ? "bg-turf text-on-turf" : "bg-surface text-ink"
              }`}
            >
              {taken && <Check size={14} />}
              {p.name}
            </button>
          );
        })}
      </div>
      <p className="mt-2 text-xs text-ink-3">Hole {hole} hosts this because it's a par {parOf(card, hole)}.</p>
    </section>
  );
}

// MARK: The strokes on this hole

function StrokeStrip({
  card,
  entry,
  shared,
  hole,
}: {
  card: ScrambleCard;
  entry: HoleEntry;
  shared: SharedCard;
  hole: number;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const stroke = entry.strokes.find((s) => s.id === editing);
  const index = entry.strokes.findIndex((s) => s.id === editing);

  const text = (kind: StrokeKind, playerId?: string | null) => {
    if (kind === "shot") return playerOf(card, playerId)?.name ?? "?";
    if (kind === "tapIn") return "Tap-in";
    if (kind === "penalty") return "Penalty";
    return "Nobody's";
  };

  return (
    <section aria-label="Strokes on this hole">
      <h2 className="font-display text-xs font-extrabold uppercase tracking-[0.12em] text-ink-3">
        {entry.strokes.length === 0 ? "This hole" : `This hole · ${entry.strokes.length}`}
      </h2>
      {entry.strokes.length === 0 ? (
        <p className="mt-1.5 text-sm text-ink-2">Tap whoever's drive the team took. Then whoever's shot, until the ball is in.</p>
      ) : (
        <>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {entry.strokes.map((s, i) => {
              const credited = entry.finished && i === entry.strokes.length - 1 && s.kind === "shot";
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setEditing(s.id)}
                  aria-label={`Stroke ${i + 1}, ${text(s.kind, s.playerId)}. Change it`}
                  className={`font-display inline-flex min-h-10 items-center gap-1.5 rounded-full border-2 border-ink px-3 text-sm font-bold ${
                    credited ? "bg-turf text-on-turf" : s.kind === "shot" ? "bg-surface text-ink" : "bg-paper-2 text-ink"
                  }`}
                >
                  <span className={credited ? "text-on-turf/80" : "text-ink-3"}>{i + 1}</span>
                  {text(s.kind, s.playerId)}
                </button>
              );
            })}
          </div>
          <p className="mt-1.5 text-xs text-ink-3">
            {entry.finished ? "Tap a stroke to change whose it was." : "Tap a stroke to change whose it was, or take it off."}
          </p>
        </>
      )}

      {/*
        A sheet rather than a dropdown, because this is used standing up in a cart: the names are
        full-width targets instead of 24px menu rows. Reassigning is allowed on a finished hole —
        the count does not change, so the score cannot — and removing is not, for the same reason
        recording is not: reopen it first.
      */}
      {stroke && (
        <Sheet title={`Stroke ${index + 1}`} onClose={() => setEditing(null)}>
          <p className="text-sm text-ink-2">Whose was it?</p>
          <div className="mt-3 grid gap-2">
            {card.players.map((p) => (
              <button
                key={p.id}
                type="button"
                className={`btn w-full justify-start ${stroke.kind === "shot" && stroke.playerId === p.id ? "btn-turf" : ""}`}
                onClick={() => {
                  shared.apply((c) => reassignStroke(c, hole, stroke.id, "shot", p.id, new Date().toISOString()));
                  setEditing(null);
                }}
              >
                {stroke.kind === "shot" && stroke.playerId === p.id && <Check size={16} />}
                {p.name}
              </button>
            ))}
          </div>
          <p className="mt-4 text-sm text-ink-2">Or nobody's:</p>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            <button
              type="button"
              className={`btn w-full ${stroke.kind === "penalty" ? "btn-primary" : ""}`}
              onClick={() => {
                shared.apply((c) => reassignStroke(c, hole, stroke.id, "penalty", null, new Date().toISOString()));
                setEditing(null);
              }}
            >
              Penalty stroke
            </button>
            <button
              type="button"
              className={`btn w-full ${stroke.kind === "unclaimed" ? "btn-primary" : ""}`}
              onClick={() => {
                shared.apply((c) => reassignStroke(c, hole, stroke.id, "unclaimed", null, new Date().toISOString()));
                setEditing(null);
              }}
            >
              Nobody's ball
            </button>
          </div>
          {!entry.finished && (
            <button
              type="button"
              className="mt-5 min-h-11 w-full text-sm font-semibold text-danger underline"
              onClick={() => {
                shared.apply((c) => removeStroke(c, hole, stroke.id, new Date().toISOString()));
                setEditing(null);
              }}
            >
              Take this stroke off the hole
            </button>
          )}
        </Sheet>
      )}
    </section>
  );
}

// MARK: Taking the next one

function HoleControls({
  card,
  entry,
  hole,
  shared,
  onFinish,
}: {
  card: ScrambleCard;
  entry: HoleEntry;
  hole: number;
  shared: SharedCard;
  onFinish: (tapIn: boolean) => void;
}) {
  const [closing, setClosing] = useState<"holed" | "tapIn" | null>(null);
  const kept = useMemo(() => new Map(tallyRows(card).map((r) => [r.player.id, r.kept])), [card]);
  const lastShot = entry.strokes[entry.strokes.length - 1];
  const lastShotName = lastShot?.kind === "shot" ? playerOf(card, lastShot.playerId)?.name : undefined;

  // A stroke taken off while reviewing can empty the hole, and there is nothing to review then.
  if (closing && entry.strokes.length > 0) {
    return (
      <HoleReview
        card={card}
        entry={entry}
        hole={hole}
        tapIn={closing === "tapIn"}
        onBack={() => setClosing(null)}
        onConfirm={() => {
          setClosing(null);
          onFinish(closing === "tapIn");
        }}
      />
    );
  }

  return (
    <section className="space-y-3" aria-label="Log a stroke">
      <h2 className="font-display text-xs font-extrabold uppercase tracking-[0.12em] text-ink-3">
        {entry.strokes.length === 0 ? "Whose drive?" : "Whose shot?"}
      </h2>
      <div className="grid grid-cols-2 gap-2.5">
        {card.players.map((p) => (
          <button
            key={p.id}
            type="button"
            className="card flex min-h-[72px] flex-col items-center justify-center gap-0.5 px-2 py-3 active:translate-x-[2px] active:translate-y-[2px]"
            onClick={() => {
              navigator.vibrate?.(10);
              shared.apply((c) => recordStroke(c, hole, newStroke("shot", p.id), new Date().toISOString()));
            }}
          >
            <span className="font-display truncate text-lg font-extrabold">{p.name}</span>
            <span className="text-xs font-semibold text-ink-2">{kept.get(p.id) ?? 0} kept</span>
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2.5">
        <button
          type="button"
          className="btn btn-turf w-full"
          disabled={entry.strokes.length === 0}
          onClick={() => setClosing("holed")}
        >
          {lastShotName ? `${lastShotName} holed it` : "Holed it"}
        </button>
        <button type="button" className="btn w-full" disabled={entry.strokes.length === 0} onClick={() => setClosing("tapIn")}>
          Tap-in
        </button>
      </div>
      <p className="text-xs text-ink-3">
        {lastShotName
          ? `${lastShotName} holed it: that last shot went in, and it counts for ${lastShotName}. Tap-in: one more stroke on the card, nobody's. Either way you check the hole before it closes.`
          : "Holed it: the last shot went in, and it counts for whoever hit it. Tap-in: one more stroke on the card, nobody's. Either way you check the hole before it closes."}
      </p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="btn btn-ghost btn-sm underline"
          disabled={entry.strokes.length === 0}
          onClick={() => shared.apply((c) => undoHole(c, hole, new Date().toISOString()))}
        >
          Undo
        </button>
        <span className="ml-auto flex gap-2">
          {/*
            Split from the penalty deliberately: when a penalty was the only nameless stroke on
            offer it became the thing people reached for when a shot had simply gone unlogged,
            which put the word *penalty* on the card for strokes that were nothing of the sort.
          */}
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => shared.apply((c) => recordStroke(c, hole, newStroke("penalty"), new Date().toISOString()))}
          >
            +1 penalty
          </button>
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => shared.apply((c) => recordStroke(c, hole, newStroke("unclaimed"), new Date().toISOString()))}
          >
            +1 nobody's
          </button>
        </span>
      </div>
    </section>
  );
}

/**
 * The hole, read back before it closes.
 *
 * Everything the group is about to agree to, in the order they argue about it: the score and what
 * it is called, whose shots the team played and how many each, how the ball went in, and the side
 * game if this hole runs one. The strokes above are still tappable, so "that was Dan's" is fixed
 * here rather than after. An unclaimed side game does not block the slide — a hole can close with
 * the argument still open — but it is said in yellow, because a closest to the pin forgotten on
 * the tee is a fight on the eighteenth.
 */
function HoleReview({
  card,
  entry,
  hole,
  tapIn,
  onBack,
  onConfirm,
}: {
  card: ScrambleCard;
  entry: HoleEntry;
  hole: number;
  tapIn: boolean;
  onBack: () => void;
  onConfirm: () => void;
}) {
  const par = parOf(card, hole);
  const score = entry.strokes.length + (tapIn ? 1 : 0);
  const last = entry.strokes[entry.strokes.length - 1];
  const holedByName = !tapIn && last?.kind === "shot" ? playerOf(card, last.playerId)?.name : undefined;
  const side = standingOn(card, hole);

  const nameless: string[] = [];
  if (tapIn) nameless.push("a tap-in");
  const penalties = entry.strokes.filter((s) => s.kind === "penalty").length;
  const unclaimed = entry.strokes.filter((s) => s.kind === "unclaimed").length;
  if (penalties > 0) nameless.push(penalties === 1 ? "a penalty" : `${penalties} penalties`);
  if (unclaimed > 0) nameless.push(unclaimed === 1 ? "a nobody's ball" : `${unclaimed} nobody's balls`);

  return (
    <motion.section
      className="card space-y-3 p-4"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 400, damping: 32 }}
      aria-label={`Finish hole ${hole}`}
    >
      <div className="flex items-baseline gap-2">
        <h2 className="font-display text-xl font-extrabold">Hole {hole}</h2>
        <span className="text-xs font-bold uppercase tracking-wider text-ink-3">par {par}</span>
        <span className="font-display ml-auto text-3xl font-extrabold tabular">{score}</span>
        <span className={`chip text-xs ${score < par ? "border-turf bg-turf-soft" : "bg-paper-2"}`}>{holeLabel(score, par)}</span>
      </div>

      <ul className="card-flat divide-y-2 divide-line px-3">
        {card.players.map((p) => {
          const mine = entry.strokes.filter((s) => s.kind === "shot" && s.playerId === p.id).length;
          return (
            <li key={p.id} className="flex items-center gap-2 py-2">
              <span className={`font-display truncate text-[15px] font-bold ${mine ? "" : "text-ink-3"}`}>{p.name}</span>
              <span className={`ml-auto shrink-0 text-sm font-bold tabular ${mine ? "" : "text-ink-3"}`}>
                {mine === 0 ? "—" : plural(mine, "shot")}
              </span>
            </li>
          );
        })}
      </ul>

      <div>
        <p className="text-sm font-semibold">
          {holedByName ? `${holedByName} holed it.` : tapIn ? "Finished with a tap-in." : "The last stroke was nobody's, so nobody is credited with holing it."}
        </p>
        {nameless.length > 0 && <p className="mt-0.5 text-xs text-ink-2">{nameList(nameless)} on the card, credited to nobody.</p>}
      </div>

      {side && (
        <p className={`card-flat px-3 py-2 text-sm ${side.winner ? "bg-turf-soft" : "bg-flag-soft font-semibold"}`}>
          {side.winner
            ? `${contestTitle(side.contest)}: ${side.winner.name}.`
            : `${contestTitle(side.contest)}: nobody named yet. Tap a name up top, or settle it later from the Tally tab.`}
        </p>
      )}

      <SlideToLock
        disabled={false}
        pending={false}
        onSubmit={onConfirm}
        words={{
          idle: "Slide to finish the hole",
          keep: "Keep sliding →",
          release: "Release to finish it",
          pending: "Finishing…",
          tap: "Or tap to finish the hole",
          help: "Hold the arrow and slide right to finish this hole",
        }}
      />
      <button type="button" className="min-h-11 w-full text-sm font-semibold underline" onClick={onBack}>
        Back to the strokes
      </button>
    </motion.section>
  );
}

// MARK: A hole that is in

function FinishedHole({
  card,
  entry,
  onReopen,
  onGo,
}: {
  card: ScrambleCard;
  entry: HoleEntry;
  onReopen: () => void;
  onGo: (hole: number) => void;
}) {
  const par = parOf(card, entry.hole);
  const who = playerOf(card, holedBy(entry))?.name;
  const next = nextUnfinishedHole(card, entry.hole);
  return (
    <section className="card-flat bg-turf-soft p-4" aria-label={`Hole ${entry.hole} is finished`}>
      <div className="flex items-baseline gap-2">
        <span className="font-display text-4xl font-extrabold tabular">{entry.strokes.length}</span>
        <span className="font-display text-lg font-extrabold">{holeLabel(entry.strokes.length, par)}</span>
      </div>
      <p className="mt-1 text-sm text-ink-2">
        {who ? `${who} holed it. ` : entry.strokes[entry.strokes.length - 1]?.kind === "tapIn" ? "Finished with a tap-in. " : ""}
        Reopen the hole to change anything.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {next && (
          <button type="button" className="btn btn-primary btn-sm" onClick={() => onGo(next)}>
            On to hole {next}
          </button>
        )}
        <button type="button" className="btn btn-sm" onClick={onReopen}>
          Reopen
        </button>
      </div>
    </section>
  );
}
