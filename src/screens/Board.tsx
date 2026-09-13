import { useState } from "react";
import { Link, Navigate, useNavigate, useParams, useSearchParams } from "react-router";
import { AnimatePresence, motion } from "motion/react";
import { useBootstrap, useSeasonBoard, useWeekBoard } from "../api/queries.ts";
import { usePlayer } from "../lib/player.tsx";
import { useHeaderWeek } from "../components/Chrome.tsx";
import { TEAMS } from "../../shared/teams.ts";
import type { ScoredPick, SeasonRow, WeekRow } from "../../shared/scoring.ts";
import { WEEKS } from "../../shared/week.ts";
import { EmptyState, ErrorState, RankBadge, Segmented, Spinner } from "../components/Common.tsx";
import { TeamSticker } from "../components/TeamSticker.tsx";
import { Lock } from "../components/Icons.tsx";

export type BoardSort = "points" | "possible";

export function Board({ tab }: { tab: "week" | "season" }) {
  const nav = useNavigate();
  const boot = useBootstrap();
  const { week: weekParam } = useParams();
  const [params, setParams] = useSearchParams();
  const week = tab === "week" ? Number(weekParam) : null;
  if (tab === "week" && (!Number.isInteger(week) || week! < 1 || week! > WEEKS)) return <Navigate to="/board" replace />;
  const boardWeek = boot.data?.boardWeek ?? 1;
  const sort: BoardSort = params.get("sort") === "possible" ? "possible" : "points";
  const setSort = (v: BoardSort) => setParams(v === "possible" ? { sort: v } : {}, { replace: true });
  const keepSort = sort === "possible" ? "?sort=possible" : "";
  return (
    <div className="mx-auto w-full max-w-[760px] lg:max-w-[1060px]">
      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_300px] lg:items-start lg:gap-8">
        <div>
          {/* Both toggles share one line on a phone: two taps, no scrolling, nothing stacked. */}
          <div className="grid grid-cols-2 gap-2 sm:gap-3">
            <Segmented
              value={tab}
              label="Week or season"
              pillId="board-range"
              options={[
                { value: "week", label: "This week", short: "Week" },
                { value: "season", label: "Season" },
              ]}
              onChange={(v) => nav(v === "week" ? `/board/week/${boardWeek}${keepSort}` : `/board/season${keepSort}`)}
            />
            <Segmented
              value={sort}
              label="Sort the board"
              pillId="board-sort"
              options={[
                { value: "points", label: "Points" },
                { value: "possible", label: "Potential" },
              ]}
              onChange={setSort}
            />
          </div>
          <div className="mt-4">
            {tab === "week" ? (
              <WeekBoardView week={week!} sort={sort} onWeek={(w) => nav(`/board/week/${w}${keepSort}`)} />
            ) : (
              <SeasonBoardView sort={sort} />
            )}
          </div>
        </div>
        <SideRail tab={tab} week={tab === "week" ? week! : boardWeek} />
      </div>
      <p className="mt-10 text-center text-xs text-ink-3 lg:hidden">
        <Link to="/rules" className="underline">
          How scoring works
        </Link>
        {" · "}Commissioner?{" "}
        <Link to="/admin" className="underline">
          Enter results
        </Link>
      </p>
    </div>
  );
}

/** Desktop-only rail: uses the space beside the standings for your spot, the scoring key, and shortcuts. */
function SideRail({ tab, week }: { tab: "week" | "season"; week: number }) {
  const { player } = usePlayer();
  const boot = useBootstrap();
  const weekBoard = useWeekBoard(week);
  const seasonBoard = useSeasonBoard();
  const rows: (WeekRow | SeasonRow)[] = tab === "week" ? (weekBoard.data?.rows ?? []) : (seasonBoard.data?.rows ?? []);
  const mine = rows.find((r) => r.playerId === player?.id);
  const leader = rows[0];
  return (
    <aside className="mt-6 hidden lg:sticky lg:top-24 lg:mt-0 lg:block">
      <div className="card-flat bg-white p-4">
        <h2 className="font-display text-[11px] font-extrabold uppercase tracking-wider text-ink-3">
          {tab === "week" ? `Week ${week}` : "Season"}
        </h2>
        {mine ? (
          <>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="font-display text-3xl font-extrabold leading-none tabular">{ordinal(mine.place)}</span>
              <span className="font-display text-lg font-extrabold tabular text-ink-2">{mine.points} pts</span>
            </div>
            <p className="mt-1 text-xs text-ink-2">
              {leader && leader.playerId !== player?.id
                ? `${leader.points - mine.points} behind ${leader.name}`
                : "You're on top. Say nothing, stay humble."}
            </p>
          </>
        ) : (
          <p className="mt-1 text-sm text-ink-2">
            {player ? "You're not on this board yet." : "Join the pool to land on the board."}
          </p>
        )}
        <Link className="btn btn-sm btn-primary mt-3 w-full" to={player ? `/week/${boot.data?.currentWeek ?? week}` : "/welcome"}>
          {player ? "Make my picks" : "Join the pool"}
        </Link>
      </div>
      <div className="card-flat mt-3 bg-white p-4">
        <h2 className="font-display text-[11px] font-extrabold uppercase tracking-wider text-ink-3">Scoring</h2>
        <ul className="mt-2 space-y-1.5">
          {[1, 2, 3, 4, 5].map((r) => (
            <li key={r} className="flex items-center gap-2 text-sm">
              <RankBadge rank={r} size="sm" />
              <span className="text-ink-2">
                rank {r} → <b className="text-ink">{6 - r}</b> pt{6 - r === 1 ? "" : "s"}
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-ink-3">
          <Link to="/rules" className="underline">
            How scoring works
          </Link>
          {" · "}
          <Link to="/admin" className="underline">
            Enter results
          </Link>
        </p>
      </div>
    </aside>
  );
}

/**
 * Sorting by potential reorders the list but keeps each player's real standing on their badge —
 * "third, but still the most to play for" is the interesting thing to see.
 */
function sortRows<T extends { place: number; possible: number }>(rows: T[], sort: BoardSort): T[] {
  if (sort === "points") return rows;
  return [...rows].sort((a, b) => b.possible - a.possible || a.place - b.place);
}

function ordinal(n: number): string {
  const suffix = ["th", "st", "nd", "rd"] as const;
  const v = n % 100;
  return `${n}${suffix[(v - 20) % 10] ?? suffix[v] ?? "th"}`;
}

function PlaceBadge({ place, size = "md" }: { place: number; size?: "md" | "sm" }) {
  const tone = place === 1 ? "bg-flag" : place === 2 ? "bg-paper-3" : place === 3 ? "bg-[#e9c9a6]" : "bg-white";
  const dims = size === "sm" ? "h-7 w-7 text-xs" : "h-9 w-9 text-sm";
  return (
    <span className={`flex shrink-0 items-center justify-center rounded-full border-2 border-ink font-display font-extrabold tabular ${tone} ${dims}`}>
      {place}
    </span>
  );
}

function WeekBoardView({ week, sort, onWeek }: { week: number; sort: BoardSort; onWeek: (w: number) => void }) {
  const board = useWeekBoard(week);
  const { player } = usePlayer();
  const [open, setOpen] = useState<string | null>(null);
  useHeaderWeek(week, onWeek);
  return (
    <div>
      {board.isPending ? (
        <Spinner />
      ) : board.error ? (
        <ErrorState message={board.error.message} onRetry={() => board.refetch()} />
      ) : (
        <div className="mt-4">
          <p className="mb-3 text-sm text-ink-2">
            {board.data.lockedCount === 0
              ? `Nothing has kicked off yet · ${board.data.rows.filter((r) => r.picksMade > 0).length} of ${board.data.rows.length} have picked`
              : `${board.data.finalCount} of ${board.data.gameCount} games final`}
          </p>
          {board.data.rows.length === 0 ? (
            <EmptyState
              title="Nobody's on the board yet."
              body="Be the first to lock in five picks."
              action={
                <Link className="btn btn-sm btn-primary" to={`/week/${week}`}>
                  Make your picks
                </Link>
              }
            />
          ) : (
            <motion.ul layout className="space-y-2">
              {sortRows(board.data.rows, sort).map((row, i) => (
                <WeekRowItem
                  key={row.playerId}
                  row={row}
                  index={i}
                  open={open === row.playerId}
                  onToggle={() => setOpen(open === row.playerId ? null : row.playerId)}
                  isMe={row.playerId === player?.id}
                  week={week}
                  started={board.data.lockedCount > 0}
                />
              ))}
            </motion.ul>
          )}
        </div>
      )}
    </div>
  );
}

function WeekRowItem({ row, index, open, onToggle, isMe, week, started }: { row: WeekRow; index: number; open: boolean; onToggle: () => void; isMe: boolean; week: number; started: boolean }) {
  const hidden = row.picksMade - row.picks.length;
  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 400, damping: 30, delay: Math.min(index * 0.03, 0.3) }}
      className={`card-flat overflow-hidden ${isMe ? "bg-flag-soft shadow-hard" : "bg-white"}`}
    >
      <button className="flex w-full items-center gap-3 p-3 text-left" onClick={onToggle} aria-expanded={open}>
        <PlaceBadge place={row.place} />
        <div className="min-w-0 flex-1">
          <div className="font-display flex items-center gap-2 truncate text-[17px] font-extrabold">
            <span className="truncate">{row.name}</span>
            {isMe && <span className="chip bg-white py-0 text-[10px]">you</span>}
          </div>
          <div className="text-xs text-ink-2">
            {row.picksMade === 0 ? (
              "No picks"
            ) : !started ? (
              <>
                {row.picksMade} pick{row.picksMade === 1 ? "" : "s"} in · up to {row.possible}
              </>
            ) : (
              <>
                {row.correct} of {row.picksMade} right · up to {row.possible}
              </>
            )}
          </div>
        </div>
        <div className="text-right">
          <motion.div key={row.points} initial={{ scale: 1.3 }} animate={{ scale: 1 }} className="font-display text-3xl font-extrabold leading-none tabular">
            {row.points}
          </motion.div>
          <div className="text-[10px] font-bold uppercase tracking-wider text-ink-3">pts</div>
        </div>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="border-t-2 border-dashed border-line px-3 pb-3 pt-2">
              {row.picksMade === 0 ? (
                <p className="text-sm text-ink-3">
                  {isMe ? (
                    <Link className="font-bold underline" to={`/week/${week}`}>
                      Make your picks →
                    </Link>
                  ) : (
                    "Hasn't picked yet."
                  )}
                </p>
              ) : (
                <>
                  <ul className="flex flex-wrap gap-2">
                    {row.picks.map((p) => (
                      <PickChip key={p.gameId} pick={p} />
                    ))}
                  </ul>
                  {hidden > 0 && (
                    <p className="mt-2 flex items-center gap-1 text-xs text-ink-3">
                      <Lock size={12} /> {hidden} more pick{hidden === 1 ? "" : "s"} revealed at kickoff
                    </p>
                  )}
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.li>
  );
}

function PickChip({ pick }: { pick: ScoredPick }) {
  const tone =
    pick.outcome === "win"
      ? "border-turf bg-turf-soft"
      : pick.outcome === "loss"
        ? "border-danger/60 bg-danger-soft/70"
        : pick.outcome === "tie"
          ? "border-line bg-paper-2"
          : "border-line bg-white";
  return (
    <li className={`flex items-center gap-2 rounded-xl border-2 py-1 pl-1 pr-2 ${tone}`} title={`${TEAMS[pick.team].city} ${TEAMS[pick.team].nickname}`}>
      <TeamSticker abbr={pick.team} size={30} flat dimmed={pick.outcome === "loss"} />
      <RankBadge rank={pick.rank} size="sm" />
      <span className="font-display text-sm font-extrabold tabular">
        {pick.outcome === "win" ? `+${pick.points}` : pick.outcome === "loss" ? "0" : pick.outcome === "tie" ? "tie" : "…"}
      </span>
    </li>
  );
}

function SeasonBoardView({ sort }: { sort: BoardSort }) {
  const board = useSeasonBoard();
  const { player } = usePlayer();
  const [open, setOpen] = useState<string | null>(null);
  if (board.isPending) return <Spinner />;
  if (board.error) return <ErrorState message={board.error.message} onRetry={() => board.refetch()} />;
  const rows = sortRows(board.data.rows, sort);
  return (
    <div>
      <p className="mb-3 text-sm text-ink-2">
        {board.data.throughWeek === 0 ? "Season standings · nothing has kicked off yet" : `Season standings through Week ${board.data.throughWeek}`}
      </p>
      {rows.length === 0 ? (
        <EmptyState title="Nobody's on the board yet." body="Standings show up once people start picking." />
      ) : (
        <motion.ul layout className="space-y-2">
          {rows.map((row, i) => (
            <SeasonRowItem key={row.playerId} row={row} index={i} isMe={row.playerId === player?.id} open={open === row.playerId} onToggle={() => setOpen(open === row.playerId ? null : row.playerId)} throughWeek={board.data.throughWeek} />
          ))}
        </motion.ul>
      )}
    </div>
  );
}

function SeasonRowItem({ row, index, isMe, open, onToggle, throughWeek }: { row: SeasonRow; index: number; isMe: boolean; open: boolean; onToggle: () => void; throughWeek: number }) {
  const weeks = Array.from({ length: Math.max(throughWeek, 1) }, (_, i) => i + 1);
  const max = Math.max(15, ...Object.values(row.byWeek));
  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 400, damping: 30, delay: Math.min(index * 0.03, 0.3) }}
      className={`card-flat overflow-hidden ${isMe ? "bg-flag-soft shadow-hard" : "bg-white"}`}
    >
      <button className="flex w-full items-center gap-3 p-3 text-left" onClick={onToggle} aria-expanded={open}>
        <PlaceBadge place={row.place} />
        <div className="min-w-0 flex-1">
          <div className="font-display flex items-center gap-2 truncate text-[17px] font-extrabold">
            <span className="truncate">{row.name}</span>
            {isMe && <span className="chip bg-white py-0 text-[10px]">you</span>}
          </div>
          <div className="text-xs text-ink-2">
            {row.weeksPlayed === 0
              ? "No picks yet"
              : `${row.correct} right · ${row.weeksPlayed} wk${row.weeksPlayed === 1 ? "" : "s"}${
                  row.possible > row.points ? ` · up to ${row.possible}` : ""
                }${row.bestWeek && row.bestWeek.points > 0 ? ` · best ${row.bestWeek.points} (W${row.bestWeek.week})` : ""}`}
          </div>
        </div>
        <div className="text-right">
          <div className="font-display text-3xl font-extrabold leading-none tabular">{row.points}</div>
          <div className="text-[10px] font-bold uppercase tracking-wider text-ink-3">pts</div>
        </div>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
            <div className="border-t-2 border-dashed border-line px-3 pb-3 pt-3">
              <div className="flex h-16 items-end gap-1">
                {weeks.map((w) => {
                  const pts = row.byWeek[w] ?? 0;
                  return (
                    <Link key={w} to={`/board/week/${w}`} className="group flex flex-1 flex-col items-center gap-1" title={`Week ${w}: ${pts}`}>
                      <motion.div
                        initial={{ height: 0 }}
                        animate={{ height: `${Math.max((pts / max) * 48, pts ? 6 : 2)}px` }}
                        className={`w-full rounded-t-md border-2 border-b-0 border-ink ${pts ? "bg-turf" : "bg-paper-3"}`}
                      />
                      <span className="text-[9px] font-bold text-ink-3">{w}</span>
                    </Link>
                  );
                })}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.li>
  );
}
