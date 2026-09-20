import { useState } from "react";
import { Link } from "react-router";
import { Segmented } from "../Common.tsx";
import { EmptyState, RankBadge } from "../Common.tsx";
import {
  anyContest,
  contestCounted,
  contestResults,
  contestTitle,
  nameList,
  netText,
  playingContests,
  playingWagers,
  plural,
  pointsBoard,
  pointsLine,
  ridingPots,
  settleUp,
  strokesTaken,
  tallyRows,
  wagerContest,
  contestInitials,
  winsOf,
  type PointsRow,
  type ScrambleCard,
  type SideContest,
  type TallyRow,
} from "../../../shared/golf.ts";

/**
 * The two leaderboards the round is about, and the bets beside it.
 *
 * **Shots kept** is the card's own currency: whose shots the team played from, with where they
 * were kept underneath, because "six kept" and "six kept, five of them drives" are different
 * afternoons. **Points** only exists when a group has priced something — and when it does it is
 * the board shown *first*, because a group that sat down and put ten on a closest to the pin did
 * it to decide something, and the board that decides should not be the one you have to tap to
 * reach.
 *
 * **Side games** is its own card under both rather than a column on either: the boards answer "who
 * is winning", this answers "which holes are still unclaimed", and only one of those has a hole
 * number in the answer. Every tile is a way back to that tee.
 */
export function TallyTab({ card, base }: { card: ScrambleCard; base: string }) {
  const [board, setBoard] = useState<"points" | "kept">("points");
  const shown = card.points.enabled ? board : "kept";
  return (
    <div className="space-y-4">
      {card.points.enabled && (
        <Segmented
          value={board}
          label="Which board"
          pillId="golf-board"
          options={[
            { value: "points", label: "Points" },
            { value: "kept", label: "Shots kept" },
          ]}
          onChange={setBoard}
        />
      )}
      {/* Above the boards, always: the one thing here about a hole still in front of them. */}
      <Riding card={card} base={base} />
      {shown === "points" ? (
        <>
          <PointsBoard card={card} />
          <SettleUp card={card} />
        </>
      ) : (
        <KeptBoard card={card} />
      )}
      {anyContest(card.contests) && <SideGames card={card} base={base} />}
      <DriveNote rows={tallyRows(card)} />
    </div>
  );
}

/**
 * What is on the table that nobody has taken yet.
 *
 * Drawn from the moment a hole goes begging rather than revealed in the settlement, because the
 * carry's whole appeal is knowing about it *before* the tee shot. A group told on the fourth tee
 * that it is playing for a hundred and sixty is having the best part of the bet; a group that
 * finds out afterwards is having an argument.
 *
 * The hole number is a link, the way every tile in Side games is: the answer to "what's riding"
 * is always followed by "which hole", and on a phone in a cart that should not be a scroll.
 */
function Riding({ card, base }: { card: ScrambleCard; base: string }) {
  const pots = ridingPots(card);
  if (!pots.length) return null;
  return (
    <div className="space-y-2">
      {pots.map((pot) => (
        <div key={pot.contest} className="card-flat bg-flag-soft p-3" aria-label={`${contestTitle(pot.contest)} riding`}>
          <p className="font-display text-[15px] font-extrabold">
            {contestTitle(pot.contest)}: {plural(pot.carried, "hole")} riding
          </p>
          <p className="text-xs text-ink-2">
            {pot.nextHole === null ? (
              "Nobody took it and there's no hole left to. Nothing changes hands."
            ) : pot.worth > 0 ? (
              <>
                <Link className="underline underline-offset-2" to={`${base}?hole=${pot.nextHole}`}>
                  Hole {pot.nextHole}
                </Link>{" "}
                is worth {pot.worth} to whoever takes it.
              </>
            ) : (
              <>
                It all rides on{" "}
                <Link className="underline underline-offset-2" to={`${base}?hole=${pot.nextHole}`}>
                  hole {pot.nextHole}
                </Link>
                .
              </>
            )}
          </p>
        </div>
      ))}
    </div>
  );
}

/**
 * The board, turned into the two or three payments that clear it.
 *
 * A signed column adding to zero is the honest record and it is still a puzzle somebody has to
 * solve at the bar while four people hold up four screens. This is the same fact as an
 * instruction, and it sits underneath the board rather than instead of it: the column is how you
 * check the app is right, this is what you do about it.
 */
function SettleUp({ card }: { card: ScrambleCard }) {
  const payments = settleUp(card);
  if (!payments.length) return null;
  return (
    <section className="card p-4" aria-label="Settling up">
      <h2 className="font-display mb-2 text-xs font-extrabold uppercase tracking-[0.12em] text-ink-3">Settling up</h2>
      <ul className="divide-y-2 divide-line">
        {payments.map((payment) => (
          <li key={`${payment.from.id}-${payment.to.id}`} className="flex items-center gap-2 py-2">
            <span className="font-display min-w-0 truncate text-base font-extrabold">{payment.from.name}</span>
            <span aria-hidden className="text-ink-3">→</span>
            <span className="font-display min-w-0 truncate text-base font-extrabold">{payment.to.name}</span>
            <span className="font-display tabular ml-auto text-xl font-extrabold">{payment.amount}</span>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-ink-3">
        {plural(payments.length, "payment")} and everybody&rsquo;s square.
      </p>
    </section>
  );
}

// MARK: Shots kept

function KeptBoard({ card }: { card: ScrambleCard }) {
  const rows = tallyRows(card);
  const empty = strokesTaken(card) === 0 && rows.every((r) => r.kept === 0);
  return (
    <section aria-label="Shots kept">
      <h2 className="font-display mb-2 text-xs font-extrabold uppercase tracking-[0.12em] text-ink-3">Shots kept</h2>
      {empty ? (
        <EmptyState
          title="Nothing kept yet"
          body="Tap a name on the Round tab each time the team plays somebody's ball. This fills in as you go."
        />
      ) : (
        <ul className="space-y-2">
          {rows.map((row) => (
            <li key={row.player.id}>
              <KeptRow row={row} leader={row.place === 1 && row.kept > 0} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function KeptRow({ row, leader }: { row: TallyRow; leader: boolean }) {
  const parts: string[] = [];
  if (row.drives > 0) parts.push(plural(row.drives, "drive"));
  if (row.holed > 0) parts.push(`${row.holed} holed`);
  if (row.between > 0) parts.push(`${row.between} in between`);
  const breakdown = parts.length ? parts.join(" · ") : "nothing kept yet";
  return (
    <div className={`flex items-center gap-3 p-3 ${leader ? "card bg-flag-soft" : "card-flat"}`}>
      <RankBadge rank={Math.min(row.place, 5)} size="sm" muted={row.kept === 0} />
      <div className="min-w-0 flex-1">
        <p className="font-display flex items-center gap-2 text-[17px] font-extrabold">
          <span className="truncate">{row.player.name}</span>
          {leader && <span className="chip shrink-0 bg-flag text-[10px]">most kept</span>}
        </p>
        <p className="truncate text-xs text-ink-2">{breakdown}</p>
      </div>
      <div className="shrink-0 text-right">
        <p className="font-display text-2xl font-extrabold leading-none tabular">{row.kept}</p>
        <p className="mt-0.5 text-[10px] font-bold uppercase tracking-wider text-ink-3">kept</p>
      </div>
    </div>
  );
}

// MARK: Points

/**
 * The board a group priced for itself, settled as a pot.
 *
 * Every line is a **net**, so the column adds to nothing and half of it is usually negative. That
 * is the point: a prize board makes everybody a winner by some amount, and this one says who is
 * buying. A negative row carries one thing the positive rows do not need — what it won and what it
 * put in — because "−40" on its own reads like a bug until you can see it is 0 won and 40 in.
 */
function PointsBoard({ card }: { card: ScrambleCard }) {
  const rows = pointsBoard(card);
  const live = playingWagers(card.points, card.contests);
  return (
    <section aria-label="Points">
      <h2 className="font-display mb-2 text-xs font-extrabold uppercase tracking-[0.12em] text-ink-3">Points</h2>
      {live.length === 0 ? (
        <EmptyState
          title="Nothing is being played for"
          body="Open the pencil at the top and put a stake on a shot kept, a longest drive or a closest to the pin."
        />
      ) : rows.every((r) => r.points === 0) ? (
        <EmptyState
          title="Nobody is up or down yet"
          body="Keep a shot on the Round tab, or hand somebody a hole's side game, and the pot starts moving."
        />
      ) : (
        <ul className="space-y-2">
          {rows.map((row) => (
            <li key={row.player.id}>
              <PointsRowCard row={row} card={card} leader={row.place === 1 && row.points > 0} />
            </li>
          ))}
        </ul>
      )}
      <p className="mt-2.5 text-xs text-ink-3">{pointsLine(card)}</p>
      {live.length > 0 && (
        <p className="mt-0.5 text-xs text-ink-3">
          Everybody puts that in each time. It adds up to nothing overall — what one person is up, the rest are down.
        </p>
      )}
    </section>
  );
}

function PointsRowCard({ row, card, leader }: { row: PointsRow; card: ScrambleCard; leader: boolean }) {
  const parts: string[] = [];
  for (const item of playingWagers(card.points, card.contests)) {
    const wins = winsOf(row, item);
    if (wins <= 0) continue;
    const contest = wagerContest(item);
    parts.push(contest ? `${wins}× ${contestInitials(contest)}` : `${row.kept} kept`);
  }
  const breakdown = parts.length ? parts.join(" · ") : row.paid > 0 ? "nothing taken yet" : "nothing yet";
  const tone = row.points > 0 ? "text-turf" : row.points < 0 ? "text-danger" : "text-ink-3";
  return (
    <div className={`flex items-center gap-3 p-3 ${leader ? "card bg-flag-soft" : "card-flat"}`}>
      <RankBadge rank={Math.min(row.place, 5)} size="sm" muted={row.points <= 0} />
      <div className="min-w-0 flex-1">
        <p className="font-display flex items-center gap-2 text-[17px] font-extrabold">
          <span className="truncate">{row.player.name}</span>
          {leader && <span className="chip shrink-0 bg-flag text-[10px]">up most</span>}
        </p>
        <p className="truncate text-xs text-ink-2">{breakdown}</p>
        {row.points < 0 && (
          <p className="truncate text-[11px] text-ink-3">
            {row.won} won · {row.paid} in
          </p>
        )}
      </div>
      <div className="shrink-0 text-right">
        <p className={`font-display text-2xl font-extrabold leading-none tabular ${tone}`}>{netText(row.points)}</p>
        <p className="mt-0.5 text-[10px] font-bold uppercase tracking-wider text-ink-3">points</p>
      </div>
    </div>
  );
}

// MARK: The bets beside the round

/**
 * Every contest hole on the card, and who has it.
 *
 * One tile per hole rather than one row per winner, because the useful question is *which ones are
 * still up for grabs* — and an unclaimed hole has no winner to be a row about. A dashed tile is
 * the one thing on this screen asking for something.
 */
function SideGames({ card, base }: { card: ScrambleCard; base: string }) {
  const results = contestResults(card);
  return (
    <section className="card p-4" aria-label="Side games">
      <h2 className="font-display mb-2 text-xs font-extrabold uppercase tracking-[0.12em] text-ink-3">Side games</h2>
      {results.length === 0 && (
        <p className="text-sm text-ink-2">
          No hole on this card hosts one yet. A longest drive wants a par 5 and a closest to the pin wants a par 3 — set
          the pars from the tee and they appear.
        </p>
      )}
      <div className="space-y-4">
        {playingContests(card.contests).map((contest) => {
          const mine = results.filter((r) => r.contest === contest);
          if (!mine.length) return null;
          return <ContestSection key={contest} card={card} contest={contest} results={mine} base={base} />;
        })}
      </div>
    </section>
  );
}

function ContestSection({
  card,
  contest,
  results,
  base,
}: {
  card: ScrambleCard;
  contest: SideContest;
  results: { hole: number; winner: { id: string; name: string } | null }[];
  base: string;
}) {
  const rows = pointsBoard(card);
  const top = Math.max(0, ...rows.map((r) => winsOf(r, contest)));
  const claimed = results.filter((r) => r.winner).length;
  const lead =
    top > 0
      ? `${nameList(rows.filter((r) => winsOf(r, contest) === top).map((r) => r.player.name))} — ${contestCounted(contest, top)}.`
      : `${plural(results.filter((r) => !r.winner).length, "hole")} still up for grabs.`;

  return (
    <div>
      <div className="flex items-center gap-2">
        <h3 className="font-display text-base font-extrabold">{contestTitle(contest)}</h3>
        <span className="chip ml-auto text-[10px]">
          {claimed}/{results.length}
        </span>
      </div>
      <p className="mt-0.5 text-xs text-ink-2">{lead}</p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {results.map((r) => (
          <Link
            key={r.hole}
            to={`${base}?hole=${r.hole}`}
            className={`flex min-w-[60px] flex-col items-center rounded-xl border-2 px-2.5 py-1.5 ${
              r.winner ? "border-card-border bg-turf-soft" : "border-dashed border-line bg-surface"
            }`}
            aria-label={r.winner ? `Hole ${r.hole}, ${r.winner.name}. Go to it` : `Hole ${r.hole}, unclaimed. Go to it`}
          >
            <span className="font-display text-sm font-extrabold tabular">{r.hole}</span>
            <span className={`max-w-[72px] truncate text-[10px] font-bold ${r.winner ? "text-ink-2" : "text-ink-3"}`}>
              {r.winner?.name ?? "open"}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}

/** The one stat that gets claimed out loud, said in a sentence rather than left in a column. */
function DriveNote({ rows }: { rows: TallyRow[] }) {
  const best = Math.max(0, ...rows.map((r) => r.drives));
  if (best === 0) return null;
  const names = rows.filter((r) => r.drives === best).map((r) => r.player.name);
  return (
    <p className="card-flat bg-turf-soft px-3 py-2.5 text-sm text-ink-2">
      Off the tee: {nameList(names)}, {plural(best, "drive")} kept.
    </p>
  );
}
