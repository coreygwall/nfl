import { Link } from "react-router";
import {
  anyContest,
  contestFor,
  contestInitials,
  entryFor,
  holeCount,
  holeLabel,
  holeNumbers,
  initialsFor,
  parOf,
  strokesTaken,
  toPar,
  toParText,
  totalPar,
  winnerOf,
  type ScrambleCard,
} from "../../../shared/golf.ts";

/**
 * The card, hole by hole — the paper one, plus the column the paper one has no room for.
 *
 * Par, the team's score, and who the shots belonged to, as initials. Out and In total the way a
 * scorecard totals them, and a nine-hole card simply has no back. Every row is a link to that
 * hole, which is how a hole entered wrong gets fixed: this is the list, the Round tab is the edit.
 */
export function ScorecardTab({ card, base }: { card: ScrambleCard; base: string }) {
  const initials = initialsFor(card.players);
  const count = holeCount(card);

  /** Par over every hole in the range; score over the finished ones only. */
  const total = (from: number, to: number, par: boolean) => {
    let n = 0;
    for (let hole = from; hole <= to; hole += 1) {
      if (par) n += parOf(card, hole);
      else {
        const entry = entryFor(card, hole);
        if (entry?.finished) n += entry.strokes.length;
      }
    }
    return n;
  };

  return (
    <div className="space-y-3">
      <header>
        <h1 className="font-display text-2xl font-extrabold">{card.name}</h1>
        <p className="text-sm text-ink-2">
          {card.course ? `${card.course} · ` : ""}
          {count} holes, par {totalPar(card)} · {card.players.map((p) => p.name).join(", ")}
        </p>
      </header>

      <div className="card-flat overflow-hidden py-2">
        <div className="flex gap-2 px-3 pb-1.5 text-[10px] font-bold uppercase tracking-wider text-ink-3">
          <span className={anyContest(card.contests) ? "w-[68px]" : "w-10"}>Hole</span>
          <span className="w-9 text-right">Par</span>
          <span className="w-11 text-right">Score</span>
          <span className="flex-1 text-right">Kept by</span>
        </div>
        {holeNumbers(card).map((hole) => (
          <div key={hole}>
            <div className="mx-2.5 border-t-2 border-dashed border-line" />
            <Row card={card} hole={hole} initials={initials} base={base} />
            {hole === 9 && count > 9 && <Total label="OUT" par={total(1, 9, true)} score={total(1, 9, false)} card={card} />}
            {hole === count && count > 9 && (
              <Total label="IN" par={total(10, count, true)} score={total(10, count, false)} card={card} />
            )}
          </div>
        ))}
        <Total label="TOTAL" par={totalPar(card)} score={strokesTaken(card)} trailing={toParText(toPar(card))} emphasis card={card} />
      </div>

      <div className="space-y-1 text-xs text-ink-3">
        <p>Initials are whose shots the team kept. A dash is a stroke nobody earned: a tap-in, a penalty, or nobody's ball.</p>
        {anyContest(card.contests) && (
          <p>LD and CTP mark the side-game holes, with the winner's initial once somebody has taken it. The Tally tab has the whole list.</p>
        )}
      </div>
    </div>
  );
}

function Row({
  card,
  hole,
  initials,
  base,
}: {
  card: ScrambleCard;
  hole: number;
  initials: Record<string, string>;
  base: string;
}) {
  const entry = entryFor(card, hole);
  const played = entry?.finished ?? false;
  const par = parOf(card, hole);
  const contest = contestFor(card, hole);
  const winner = contest ? winnerOf(card, contest, hole) : null;
  const diff = played && entry ? entry.strokes.length - par : 0;
  // A birdie or better gets a wash of turf, a bogey or worse a wash of paper. Par stays plain,
  // because most holes are pars and a card that tints every row tells you nothing.
  const tint = !played ? "" : diff < 0 ? "bg-turf-soft" : diff > 0 ? "bg-paper-2" : "";

  const keptBy = entry?.strokes.length
    ? entry.strokes.map((s) => (s.kind === "shot" ? (initials[s.playerId ?? ""] ?? "?") : "–")).join(" ")
    : "";

  return (
    <Link
      to={`${base}?hole=${hole}`}
      className={`flex items-center gap-2 px-3 py-2 ${tint} hover:bg-paper-2`}
      aria-label={
        played && entry
          ? `Hole ${hole}, par ${par}, ${entry.strokes.length} — ${holeLabel(entry.strokes.length, par)}. Go to it.`
          : `Hole ${hole}, par ${par}, not played. Go to it.`
      }
    >
      <span className={`flex items-center gap-1 ${anyContest(card.contests) ? "w-[68px]" : "w-10"}`}>
        <span className="font-display text-[15px] font-extrabold tabular">{hole}</span>
        {contest && (
          <span
            className={`rounded-full px-1 py-px text-[8px] font-bold leading-tight ${
              winner ? "bg-turf text-on-turf" : "border border-line text-ink-3"
            }`}
          >
            {contestInitials(contest)}
            {winner ? ` ${initials[winner.id]}` : ""}
          </span>
        )}
      </span>
      <span className="w-9 text-right text-sm tabular text-ink-2">{par}</span>
      <span className="w-11 text-right">
        {played && entry ? (
          <span className="font-display text-[17px] font-extrabold tabular">{entry.strokes.length}</span>
        ) : (
          <span className="text-sm text-ink-3">—</span>
        )}
      </span>
      {/* A par five with two-letter initials is fifteen characters, which one truncating line ate
          silently. Two lines and a little shrink hold it. */}
      <span className="flex-1 break-words text-right text-xs font-bold leading-tight text-ink-2">{keptBy}</span>
    </Link>
  );
}

function Total({
  label,
  par,
  score,
  trailing,
  emphasis = false,
  card,
}: {
  label: string;
  par: number;
  score: number;
  trailing?: string;
  emphasis?: boolean;
  card: ScrambleCard;
}) {
  return (
    <div className="flex items-center gap-2 border-t-2 border-dashed border-line bg-paper-2 px-3 py-2">
      <span
        className={`font-display font-extrabold tracking-wider ${anyContest(card.contests) ? "w-[68px]" : "w-10"} ${
          emphasis ? "text-sm" : "text-xs"
        }`}
      >
        {label}
      </span>
      <span className="w-9 text-right text-sm font-bold tabular text-ink-2">{par}</span>
      <span className={`font-display w-11 text-right font-extrabold tabular ${emphasis ? "text-lg" : "text-[17px]"}`}>
        {score === 0 ? "—" : score}
      </span>
      <span className="font-display flex-1 text-right text-sm font-extrabold text-ink-2">{trailing ?? ""}</span>
    </div>
  );
}
