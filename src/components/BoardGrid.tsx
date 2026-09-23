import { TEAMS } from "../../shared/teams.ts";
import type { ScoredPick, WeekRow } from "../../shared/scoring.ts";
import { Lock } from "./Icons.tsx";

/**
 * The week as a table: every entry down the side, the five places across, the points at the end.
 *
 * The card list answers "how is everybody doing" one row at a time, with the picks a tap away. This
 * answers the other question — *who took whom* — for the whole pool at once, which is what people
 * ask on a Sunday afternoon with two games left: is anyone else on the Chiefs at 5? A column per
 * place rather than per game because the place is the fact that makes a pick worth comparing; two
 * people on the same team at 5 and at 1 are in different arguments.
 *
 * It hides exactly what the list hides. A pick whose game has not started is a lock for anyone
 * outside the asking account, and the server decided that before the row got here — this only
 * draws what it was sent. The account's own entries are all shown whole, marked *yours*, because a
 * phone that picks for the family is one reader.
 *
 * Text rather than logos in the cells. At six columns on a phone a logo is twenty pixels, and at
 * twenty pixels the Giants and the Jets are the same blue smudge; three letters are not.
 */
export function BoardGrid({ rows, started, activeId }: { rows: WeekRow[]; started: boolean; activeId: string | null }) {
  return (
    // Two boxes rather than one. The outer draws the border and clips to it; the inner is what
    // scrolls if a screen is narrower than the columns, rounded to sit just inside the stroke. On
    // one box the highlighted row painted over the border at the corners, because a scroll
    // container's clip and a border's radius are not the same shape in every browser.
    <div className="card-flat overflow-hidden bg-surface" role="region" aria-label="Who picked whom, by place">
      <div className="overflow-x-auto rounded-[calc(var(--radius-card)-2px)]">
        {/* Fixed layout: the five places and the points are set widths, and the name gets every
            pixel that is left — under auto layout it was the column that gave way, to one letter
            on a phone. A long name wraps to a second line rather than being cut; the chip drops
            under it so it never competes for the same line. */}
        <table className="w-full min-w-[300px] table-fixed border-collapse text-left">
          <thead>
            <tr className="border-b-2 border-line text-[10px] font-bold uppercase tracking-wider text-ink-3">
              <th scope="col" className="py-2 pl-3 pr-1 font-bold">
                <span className="sr-only">Place and name</span>
              </th>
              {[1, 2, 3, 4, 5].map((rank) => (
                <th key={rank} scope="col" className="w-10 px-0.5 py-2 text-center font-display text-[13px] font-extrabold text-ink" title={`Rank ${rank}, worth ${6 - rank}`}>
                  {6 - rank}
                </th>
              ))}
              <th scope="col" className="w-11 py-2 pl-1 pr-3 text-right">
                Pts
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const isMe = row.playerId === activeId;
              const yours = row.mine && !isMe;
              const byRank = new Map(row.picks.map((p) => [p.rank, p]));
              const hidden = new Set(row.hiddenRanks);
              return (
                <tr key={row.playerId} className={`border-b border-line last:border-b-0 ${isMe ? "bg-flag-soft" : ""}`}>
                  <th scope="row" className="py-1.5 pl-3 pr-1 font-normal">
                    <div className="flex items-center gap-2">
                      <Place place={row.place} muted={!started} />
                      <div className="flex min-w-0 flex-col items-start gap-0.5">
                        <span className="font-display line-clamp-2 break-words text-[13px] font-extrabold leading-tight">{row.name}</span>
                        {isMe && <span className="chip bg-surface py-0 text-[10px]">you</span>}
                        {yours && <span className="chip bg-surface py-0 text-[10px]">yours</span>}
                      </div>
                    </div>
                  </th>
                  {[1, 2, 3, 4, 5].map((rank) => (
                    <td key={rank} className="px-0.5 py-1.5 text-center">
                      <GridCell pick={byRank.get(rank)} locked={hidden.has(rank)} rank={rank} />
                    </td>
                  ))}
                  <td className="py-1.5 pl-1 pr-3 text-right font-display text-lg font-extrabold tabular">{row.points}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/**
 * One place in one row. The same colour vocabulary as the pick chips on the list — turf for a win,
 * red for a loss, plain while it is still playing — so a person who has learned one has learned
 * the other. A lock is a pick that exists and is not yet anybody's business; a dash is a place
 * nobody took.
 */
function GridCell({ pick, locked, rank }: { pick: ScoredPick | undefined; locked: boolean; rank: number }) {
  const worth = 6 - rank;
  if (!pick) {
    return locked ? (
      <span className="inline-flex h-7 w-9 items-center justify-center rounded-md border-2 border-ink/25 bg-surface" title={`A hidden pick worth ${worth}, revealed at kickoff`}>
        <span className="sr-only">{`Hidden pick worth ${worth}`}</span>
        <Lock size={12} className="text-ink-2" />
      </span>
    ) : (
      <span className="inline-flex h-7 w-9 items-center justify-center rounded-md border-2 border-dashed border-line text-[12px] font-bold text-ink-3" title={`No pick worth ${worth}`}>
        <span className="sr-only">{`No pick worth ${worth}`}</span>
        <span aria-hidden="true">–</span>
      </span>
    );
  }
  const t = TEAMS[pick.team];
  const [tone, said] =
    pick.outcome === "win"
      ? ["border-turf bg-turf-soft text-ink", `won ${pick.points}`]
      : pick.outcome === "loss"
        ? ["border-danger/55 bg-danger-soft text-danger line-through decoration-2", "got nothing"]
        : pick.outcome === "tie"
          ? ["border-line bg-paper-2 text-ink-3", "tied"]
          : ["border-ink/25 bg-surface text-ink", `still playing, worth ${worth}`];
  return (
    <span className={`font-display inline-flex h-7 w-9 items-center justify-center rounded-md border-2 text-[12px] font-extrabold ${tone}`} title={`${t.city} ${t.nickname} — ${said}`}>
      <span className="sr-only">{`${t.nickname}, ${said}`}</span>
      <span aria-hidden="true">{t.display}</span>
    </span>
  );
}

/** The list's small place badge, kept in step by eye: same tones, same 28px, same border. */
function Place({ place, muted }: { place: number; muted: boolean }) {
  const tone = muted
    ? "bg-paper-2 text-ink-3"
    : place === 1 ? "bg-flag" : place === 2 ? "bg-paper-3" : place === 3 ? "bg-bronze" : "bg-surface";
  return (
    <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 border-ink font-display text-xs font-extrabold tabular ${tone}`}>
      {place}
    </span>
  );
}
