import { useState } from "react";
import { Link, Navigate, useNavigate, useParams, useSearchParams } from "react-router";
import { AnimatePresence, motion } from "motion/react";
import { useBootstrap, useSeasonBoard, useWeekBoard, useWinnings } from "../api/queries.ts";
import { usePlayer } from "../lib/player.tsx";
import { useHeaderWeek } from "../components/Chrome.tsx";
import { EntryPicker } from "../components/EntryPicker.tsx";
import { TEAMS } from "../../shared/teams.ts";
import { MAX_WEEK_POINTS, ordinal, type ScoredPick, type SeasonRow, type WeekRow } from "../../shared/scoring.ts";
import { moneyLabel, NO_MONEY_NOTE, SEASON_POT, WEEKLY_POT, type WinningsRow } from "../../shared/winnings.ts";
import { SEASON_START_WEEK, WEEKS } from "../../shared/week.ts";
import { CountUp, EmptyState, ErrorState, RankBadge, Segmented } from "../components/Common.tsx";
import { BoardSkeleton } from "../components/TallyLoader.tsx";
import { TeamSticker } from "../components/TeamSticker.tsx";
import { Lock } from "../components/Icons.tsx";
import { BoardGrid } from "../components/BoardGrid.tsx";
import { fallbackPoolWeeks } from "../lib/poolFallback.ts";
import { usePlaceMoves } from "../lib/placeMoves.ts";

export type BoardView = "list" | "grid";

export function Board({ tab }: { tab: "week" | "season" }) {
  const nav = useNavigate();
  const boot = useBootstrap();
  const { week: weekParam } = useParams();
  const [params, setParams] = useSearchParams();
  const week = tab === "week" ? Number(weekParam) : null;
  if (tab === "week" && (!Number.isInteger(week) || week! < 1 || week! > WEEKS)) return <Navigate to="/board" replace />;
  const boardWeek = boot.data?.boardWeek ?? fallbackPoolWeeks().boardWeek;
  // The grid is a way of looking at the week, not a different board, so it rides in the query —
  // and only when it is not the default. There used to be a "Potential" sort beside it; it was
  // taken out because it confused more than it told, and "up to N" on every row already says
  // what is still to play for. An old `?sort=possible` link just lands on the ordinary board.
  const view: BoardView = params.get("view") === "grid" ? "grid" : "list";
  const setView = (v: BoardView) => setParams(v === "grid" ? { view: "grid" } : {}, { replace: true });
  const keepView = view === "grid" ? "?view=grid" : "";
  return (
    <div className="mx-auto w-full max-w-[760px] lg:max-w-[1060px]">
      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_300px] lg:items-start lg:gap-8">
        <div>
          <EntryPicker />
          {/* Every way of reading the board together: which board and — on the week — list or
              grid. The toggle is drawn for the whole of the week tab rather than only once rows
              land, so the row does not reflow as the board loads. The season board has no grid,
              but its slot is still held there, invisible and inert: without it Week/Season
              stretched into the gap and jumped width every time you switched between them. */}
          <div className="flex flex-wrap items-stretch gap-2 sm:gap-3">
            <div className="min-w-[9.5rem] flex-1">
              <Segmented
                value={tab}
                label="Week or season"
                pillId="board-range"
                options={[
                  { value: "week", label: "Week" },
                  { value: "season", label: "Season" },
                ]}
                onChange={(v) => nav(v === "week" ? `/board/week/${boardWeek}${keepView}` : `/board/season${keepView}`)}
              />
            </div>
            <div className={`ml-auto flex ${tab === "week" ? "" : "invisible"}`} aria-hidden={tab !== "week"} inert={tab !== "week"}>
              <LayoutToggle view={view} onChange={setView} />
            </div>
          </div>
          <div className="mt-4">
            {tab === "week" ? (
              <WeekBoardView week={week!} view={view} onWeek={(w) => nav(`/board/week/${w}${keepView}`)} />
            ) : (
              <SeasonBoardView />
            )}
          </div>
        </div>
        <SideRail tab={tab} week={tab === "week" ? week! : boardWeek} />
      </div>
      <p className="mt-10 text-center text-xs text-ink-3 lg:hidden">
        <Link to="/rules" className="underline">
          How scoring works
        </Link>
      </p>
    </div>
  );
}

/** Desktop-only rail: uses the space beside the standings for your spot, the scoring key, and shortcuts. */
function SideRail({ tab, week }: { tab: "week" | "season"; week: number }) {
  const { player } = usePlayer();
  const boot = useBootstrap();
  // Only the tab being looked at. This rail is desktop-only — `hidden lg:block` below — but CSS
  // does not stop React mounting it, so on a phone, where it is invisible, it was quietly polling
  // both boards every minute for nobody.
  const weekBoard = useWeekBoard(tab === "week" ? week : null);
  const seasonBoard = useSeasonBoard(tab === "season");
  const rows: (WeekRow | SeasonRow)[] = tab === "week" ? (weekBoard.data?.rows ?? []) : (seasonBoard.data?.rows ?? []);
  const mine = rows.find((r) => r.playerId === player?.id);
  const leader = rows[0];
  // Before the season race begins everyone is level on nothing, so there is no standing to report.
  const seasonPending = tab === "season" && (seasonBoard.data?.throughWeek ?? 0) === 0;
  return (
    <aside className="mt-6 hidden lg:sticky lg:top-24 lg:mt-0 lg:block">
      <div className="card-flat bg-surface p-4">
        <h2 className="font-display text-[11px] font-extrabold uppercase tracking-wider text-ink-3">
          {tab === "week" ? `Week ${week}` : "Season"}
        </h2>
        {seasonPending ? (
          <>
            <p className="font-display mt-1 text-xl font-extrabold leading-tight">Starts in Week {SEASON_START_WEEK}</p>
            <p className="mt-1 text-xs text-ink-2">
              Week 1 has its own winner. Total points from Week {SEASON_START_WEEK} on take the season.
            </p>
          </>
        ) : mine ? (
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
      <div className="card-flat mt-3 bg-surface p-4">
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
        </p>
      </div>
    </aside>
  );
}


/**
 * Before anything has been scored everyone shares first place, which is true but reads as a wall
 * of gold — and gold that every row has stops meaning anything. Muted until there is a race.
 */
/**
 * List or grid, on the week board. Two glyphs rather than a third segmented control: the line
 * already holds two, and this is a way of looking rather than a different board.
 */
function LayoutToggle({ view, onChange }: { view: BoardView; onChange: (v: BoardView) => void }) {
  // The same segmented control as Week/Season beside it — same card, same pill, same height — at
  // its own width, with a glyph where the words would be.
  const glyph = (path: string) => (
    <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <path d={path} />
    </svg>
  );
  return (
    <Segmented
      value={view}
      label="Board layout"
      pillId="board-layout"
      fill={false}
      options={[
        { value: "list", label: "List", icon: glyph("M2 4h12M2 8h12M2 12h12") },
        { value: "grid", label: "Grid", icon: glyph("M2 2h12v12H2zM2 6.7h12M2 11.3h12M6.7 2v12M11.3 2v12") },
      ]}
      onChange={onChange}
    />
  );
}

/**
 * ▲2 or ▼1 beside a name that has just changed place (`usePlaceMoves`). Up takes the turf; down is
 * said in grey, because the board should report a slide rather than rub it in. iOS: `MovedChip`.
 */
function MovedChip({ by }: { by: number }) {
  return (
    <AnimatePresence initial={false}>
      {by !== 0 && (
        <motion.span
          key={by}
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0, opacity: 0 }}
          transition={{ type: "spring", stiffness: 520, damping: 22 }}
          className={`chip shrink-0 py-0 text-[10px] tabular ${by > 0 ? "bg-turf text-on-turf" : "bg-paper-2 text-ink-2"}`}
          aria-label={by > 0 ? `Up ${by}` : `Down ${-by}`}
        >
          <span aria-hidden="true">
            {by > 0 ? "▲" : "▼"}
            {Math.abs(by)}
          </span>
        </motion.span>
      )}
    </AnimatePresence>
  );
}

function PlaceBadge({ place, size = "md", muted = false }: { place: number; size?: "md" | "sm"; muted?: boolean }) {
  const tone = muted
    ? "bg-paper-2 text-ink-3"
    : place === 1 ? "bg-flag" : place === 2 ? "bg-paper-3" : place === 3 ? "bg-bronze" : "bg-surface";
  const dims = size === "sm" ? "h-7 w-7 text-xs" : "h-9 w-9 text-sm";
  return (
    <span className={`flex shrink-0 items-center justify-center rounded-full border-2 border-ink font-display font-extrabold tabular ${tone} ${dims}`}>
      {place}
    </span>
  );
}

function WeekBoardView({ week, view, onWeek }: { week: number; view: BoardView; onWeek: (w: number) => void }) {
  const board = useWeekBoard(week);
  const { player } = usePlayer();
  const [open, setOpen] = useState<string | null>(null);
  const moves = usePlaceMoves(board.data?.rows, week);
  useHeaderWeek(week, onWeek);
  return (
    <div>
      {board.isPending ? (
        <BoardSkeleton />
      ) : board.error ? (
        <ErrorState message={board.error.message} onRetry={() => board.refetch()} />
      ) : (
        <div className="mt-4">
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
          ) : view === "grid" ? (
            <BoardGrid rows={board.data.rows} started={board.data.lockedCount > 0} activeId={player?.id ?? null} />
          ) : (
            <motion.ul layout className="space-y-2">
              {board.data.rows.map((row, i) => (
                <WeekRowItem
                  key={row.playerId}
                  row={row}
                  index={i}
                  open={open === row.playerId}
                  onToggle={() => setOpen(open === row.playerId ? null : row.playerId)}
                  isMe={row.playerId === player?.id}
                  week={week}
                  started={board.data.lockedCount > 0}
                  moved={moves[row.playerId]}
                />
              ))}
            </motion.ul>
          )}
          {/* How far through the week this is, and which of the two prizes it settles —
              underneath, because it is a footnote about the standings rather than a heading over
              them, and the top of this screen is for the standings and the ways of reading them. */}
          <div className="mt-4">
            <p className="text-sm text-ink-2">
              {board.data.lockedCount === 0
                ? `Nothing has kicked off yet · ${board.data.rows.filter((r) => r.picksMade > 0).length} of ${board.data.rows.length} have picked`
                : `${board.data.finalCount} of ${board.data.gameCount} games final`}
            </p>
            <p className="mt-0.5 text-xs text-ink-3">
              {week < SEASON_START_WEEK
                ? `Most points wins Week ${week}. These points don't carry into the season race — that starts in Week ${SEASON_START_WEEK}.`
                : `Most points wins Week ${week}, and they all count towards the season.`}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

export function WeekRowItem({ row, index, open, onToggle, isMe, week, started, moved = 0 }: { row: WeekRow; index: number; open: boolean; onToggle: () => void; isMe: boolean; week: number; started: boolean; moved?: number }) {
  const hidden = row.picksMade - row.picks.length;
  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 400, damping: 30, delay: Math.min(index * 0.03, 0.3) }}
      className={`card-flat overflow-hidden ${isMe ? "bg-flag-soft shadow-hard" : "bg-surface"}`}
    >
      <button className="row-hover flex w-full items-center gap-3 p-3 text-left" onClick={onToggle} aria-expanded={open}>
        <PlaceBadge place={row.place} muted={!started} />
        <div className="min-w-0 flex-1">
          <div className="font-display flex items-center gap-2 truncate text-[17px] font-extrabold">
            <span className="truncate">{row.name}</span>
            {isMe && <span className="chip bg-surface py-0 text-[10px]">you</span>}
            {/* One of the account's other entries: not who you are picking as, but yours all the
                same — and, since the server knows that too, its picks open whole below. */}
            {row.mine && !isMe && <span className="chip bg-surface py-0 text-[10px]">yours</span>}
            <MovedChip by={moved} />
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
          <CountUp value={row.points} className="font-display block text-3xl font-extrabold leading-none tabular" />
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
              <PickSlots picks={row.picks} hiddenRanks={row.hiddenRanks} />
              {row.picksMade === 0 ? (
                <p className="mt-2 text-sm text-ink-3">
                  {isMe ? (
                    <Link className="font-bold underline" to={`/week/${week}`}>
                      Make your picks →
                    </Link>
                  ) : (
                    "Hasn't picked yet."
                  )}
                </p>
              ) : (
                hidden > 0 && (
                  <p className="mt-2 flex items-center gap-1 text-xs text-ink-3">
                    <Lock size={12} /> {hidden} pick{hidden === 1 ? "" : "s"} still hidden — the team shows at kickoff
                  </p>
                )
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.li>
  );
}

/**
 * Five slots, always, in rank order. A pick whose game has begun shows its team and what it is
 * worth; one that has not shows a lock in its own place, because the rank is public even while
 * the team is not; a rank nobody took stays an empty outline. The row fills in as the week goes
 * rather than growing sideways, so its shape says how far along someone is at a glance.
 */
function PickSlots({ picks, hiddenRanks }: { picks: ScoredPick[]; hiddenRanks: number[] }) {
  const byRank = new Map(picks.map((p) => [p.rank, p]));
  const hidden = new Set(hiddenRanks);
  return (
    <ul className="flex flex-wrap gap-1.5" aria-label="Picks, most confident first">
      {[1, 2, 3, 4, 5].map((rank) => {
        const pick = byRank.get(rank);
        return pick ? <PickChip key={rank} pick={pick} /> : <EmptySlot key={rank} rank={rank} locked={hidden.has(rank)} />;
      })}
    </ul>
  );
}

/**
 * A capsule holding a logo has to leave more room at its ends than one holding text. Text sits in
 * the middle of the pill where the cap has not started curving; a logo is a square, and its corners
 * land exactly where the cap curves away. At 26px in a 30px pill they hung outside the outline
 * altogether. 24px of logo, 3px of vertical padding and 7px/5px at the ends keeps every corner
 * inside the curve. The iOS app works the same numbers out in `PillFit`.
 */
const SLOT = "flex items-center gap-[3px] rounded-full border-2 py-[3px] pl-[7px] pr-[5px]";
const SLOT_ICON = "flex h-6 w-6 items-center justify-center";
const SLOT_BADGE =
  "font-display flex h-[18px] min-w-[18px] items-center justify-center rounded-full text-[11px] font-extrabold leading-none tabular";

function EmptySlot({ rank, locked }: { rank: number; locked: boolean }) {
  const stake = 6 - rank;
  const said = locked ? `A hidden pick worth ${stake} points, revealed at kickoff` : `No pick worth ${stake} points`;
  return (
    // The description is a real, visually hidden child rather than an `aria-label`. It was on the
    // inner span, which is `role="generic"` — ARIA prohibits a label there and browsers drop it, so
    // an empty rank and a hidden pick both announced only their number. Naming the `li` itself
    // would work too, but overriding its role costs the list its `listitem`s.
    <li
      className={`${SLOT} ${locked ? "border-ink/25 bg-surface" : "border-dashed border-line bg-paper-2/50"}`}
      title={said}
    >
      <span className="sr-only">{said}</span>
      <span className={SLOT_ICON} aria-hidden="true">
        {locked ? <Lock size={13} className="text-ink-2" /> : <span className="text-[13px] font-bold text-ink-3">–</span>}
      </span>
      <span className={`${SLOT_BADGE} ${locked ? "bg-surface text-ink" : "text-ink-3"}`} aria-hidden="true">
        {stake}
      </span>
    </li>
  );
}

/**
 * One pick, small enough that all five sit on one line of a phone. The number is the points: what
 * the pick is worth while the game is still going, what it actually earned once it is over. Colour
 * carries the state, so nothing has to say "pending" — plain means it has not finished.
 */
function PickChip({ pick }: { pick: ScoredPick }) {
  const stake = 6 - pick.rank;
  const t = TEAMS[pick.team];
  // A loss is red rather than merely faded. Grey reads as "nothing happened here", which is what a
  // rank nobody took looks like; a pick that went down is a different thing and should be legible
  // as one from across the row. A tie stays neutral: it scored nothing, but it was not wrong.
  const [tone, badge, value, said] =
    pick.outcome === "win"
      ? ["border-turf bg-turf-soft", "bg-turf text-on-turf", `${pick.points}`, `won ${pick.points} points`]
      : pick.outcome === "loss"
        ? ["border-danger/55 bg-danger-soft", "bg-surface text-danger", "0", "got nothing"]
        : pick.outcome === "tie"
          ? ["border-line bg-paper-2", "bg-surface text-ink-3", "0", "tied, so no points"]
          : ["border-ink/25 bg-surface", "bg-surface text-ink", `${stake}`, `still playing, worth ${stake} points`];
  return (
    <li className={`${SLOT} ${tone}`} title={`${t.city} ${t.nickname} — ${said}`}>
      {/* The logo's alt text gave the team but never the outcome — colour alone carried that. */}
      <span className="sr-only">{`${t.nickname}, ${said}`}</span>
      <span aria-hidden="true" className="contents">
        <TeamSticker abbr={pick.team} size={24} flat lost={pick.outcome === "loss"} />
      </span>
      <span className={`${SLOT_BADGE} ${badge}`} aria-hidden="true">
        {value}
      </span>
    </li>
  );
}

function SeasonBoardView() {
  const board = useSeasonBoard();
  const { player } = usePlayer();
  const [open, setOpen] = useState<string | null>(null);
  const moves = usePlaceMoves(board.data?.rows, "season");
  if (board.isPending) return <BoardSkeleton />;
  if (board.error) return <ErrorState message={board.error.message} onRetry={() => board.refetch()} />;
  const rows = board.data.rows;
  return (
    <div>
      <p className="text-sm text-ink-2">
        {board.data.throughWeek === 0
          ? `Season standings start in Week ${board.data.fromWeek}`
          : `Season standings through Week ${board.data.throughWeek}`}
      </p>
      {/* The board is the one place someone checks every week, so the prize it settles is named here. */}
      <p className="mb-3 mt-0.5 text-xs text-ink-3">
        Most points from Week {board.data.fromWeek} on wins the season. Every week also has its own winner —{" "}
        <Link to="/rules" className="underline">
          full rules
        </Link>
        .
      </p>
      {rows.length === 0 ? (
        <EmptyState title="Nobody's on the board yet." body="Standings show up once people start picking." />
      ) : (
        <motion.ul layout className="space-y-2">
          {rows.map((row, i) => (
            <SeasonRowItem key={row.playerId} row={row} index={i} isMe={row.playerId === player?.id} open={open === row.playerId} onToggle={() => setOpen(open === row.playerId ? null : row.playerId)} throughWeek={board.data.throughWeek} fromWeek={board.data.fromWeek} moved={moves[row.playerId]} />
          ))}
        </motion.ul>
      )}
      <WinningsCard />
    </div>
  );
}

/**
 * The real-money board: what every entry has actually won, running. It sits under the season
 * standings rather than inside them — the points column already means something on every other
 * screen, and this is a different number entirely, so it gets its own card and its own `$` rather
 * than borrowing the points row's big digit.
 */
function WinningsCard() {
  const winnings = useWinnings();
  const { player } = usePlayer();
  if (winnings.isPending) return null; // the season standings above already carried the loading state
  if (winnings.error) return null; // real money is worth showing only once it is right; say nothing rather than guess
  const { rows, weeks, seasonSettled } = winnings.data;
  if (rows.every((r) => r.total === 0)) return null; // nothing has settled yet — nothing to show
  return (
    <section className="card-flat mt-6 bg-surface p-4" aria-label="Winnings">
      <h2 className="font-display mb-1 text-xs font-extrabold uppercase tracking-[0.12em] text-ink-3">Winnings</h2>
      <p className="mb-3 text-xs text-ink-3">
        {moneyLabel(WEEKLY_POT)} to each week's winner, {moneyLabel(SEASON_POT)} to the season's
        {seasonSettled ? "" : " once it's decided"} — a tie splits the pot evenly.
      </p>
      <ul className="space-y-2">
        {rows
          .filter((r) => r.total > 0)
          .map((row) => (
            <WinningsRowItem key={row.playerId} row={row} isMe={row.playerId === player?.id} />
          ))}
      </ul>
      {weeks.length > 0 && (
        <ul className="mt-4 space-y-1 border-t-2 border-dashed border-line pt-3 text-xs text-ink-2">
          {weeks.map((w) => (
            <li key={w.week}>
              <span className="font-bold text-ink-3">Week {w.week}</span> — {w.winnerNames.join(" & ")}
              {w.winnerNames.length > 1 ? ` split ${moneyLabel(w.share)} each` : ` — ${moneyLabel(w.share)}`}
            </li>
          ))}
        </ul>
      )}
      <p className="mt-3 text-xs text-ink-3">{NO_MONEY_NOTE}</p>
    </section>
  );
}

function WinningsRowItem({ row, isMe }: { row: WinningsRow; isMe: boolean }) {
  return (
    <li className={`flex items-center gap-3 rounded-2xl p-2 ${isMe ? "bg-flag-soft" : ""}`}>
      <PlaceBadge place={row.place} size="sm" />
      <div className="min-w-0 flex-1">
        <div className="font-display flex items-center gap-2 truncate text-[15px] font-extrabold">
          <span className="truncate">{row.name}</span>
          {isMe && <span className="chip bg-surface py-0 text-[10px]">you</span>}
          {row.mine && !isMe && <span className="chip bg-surface py-0 text-[10px]">yours</span>}
        </div>
        <p className="text-xs text-ink-2">
          {row.weeksWon} week{row.weeksWon === 1 ? "" : "s"} won
          {row.season > 0 ? " · season" : ""}
        </p>
      </div>
      <span className="font-display shrink-0 tabular text-xl font-extrabold">{moneyLabel(row.total)}</span>
    </li>
  );
}

/** How tall a column's track is. A perfect week fills it exactly. */
const TRACK = 52;

/**
 * One player's season as a chart: a column per week from the first week that counts to the last
 * of the season, so the weeks still to come are *on screen* as placeholders rather than implied.
 *
 * It used to draw only the weeks that had been played, which in Week 2 meant a single column
 * filling the whole width — and because a nothing week was drawn as a two-pixel sliver, that
 * column read as a horizontal rule with a stray "2" under it. Nobody could tell it was a chart.
 *
 * Three states, and the dashes mean here what they mean on the grid: nothing here.
 *
 * | Column | Week | Drawn as |
 * | --- | --- | --- |
 * | scored | played, points on the board | turf fill, its number above |
 * | blank | played, nothing scored | an empty track |
 * | ahead | not played yet | a dashed outline |
 *
 * The scale is a *perfect week* rather than this row's own best, so a five-point column is the
 * same height on everybody's chart — which is the whole point of putting them one above another.
 */
function SeasonWeekChart({ row, fromWeek, throughWeek }: { row: SeasonRow; fromWeek: number; throughWeek: number }) {
  const weeks = Array.from({ length: Math.max(WEEKS - fromWeek + 1, 1) }, (_, i) => i + fromWeek);
  return (
    <div>
      <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-ink-3">Points by week</p>
      <div className="flex items-end gap-[2px]">
        {weeks.map((w) => {
          const pts = row.byWeek[w] ?? 0;
          const played = w <= throughWeek;
          const said = played ? `Week ${w}: ${pts} point${pts === 1 ? "" : "s"}` : `Week ${w}: not played yet`;
          return (
            <Link key={w} to={`/board/week/${w}`} className="flex flex-1 flex-col items-center gap-1" title={said} aria-label={said}>
              {/* The score is the thing to read, so it is the only ink-black text here. */}
              <span className="h-3.5 text-[10px] font-extrabold leading-[14px] tabular text-ink">{played && pts > 0 ? pts : ""}</span>
              {/* Every track is the same. A dashed outline on the weeks still to come was doing the
                  job a green bar already does — saying which weeks have happened — and seventeen
                  dashed boxes at this size is a texture, not information. */}
              <span className="relative w-full overflow-hidden rounded-[3px] border border-line bg-paper-2" style={{ height: TRACK }}>
                {pts > 0 && (
                  <motion.span
                    initial={{ height: 0 }}
                    animate={{ height: Math.max((pts / MAX_WEEK_POINTS) * TRACK, 6) }}
                    className="absolute inset-x-0 bottom-0 block rounded-t-[3px] border-2 border-b-0 border-ink bg-turf"
                  />
                )}
              </span>
              {/* Every week is numbered, but quietly: the axis is for orienting yourself once, and
                  it should never compete with the scores above it. */}
              <span className="h-3 text-[8px] font-bold leading-3 tabular text-ink-3/70">{w}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

export function SeasonRowItem({ row, index, isMe, open, onToggle, throughWeek, fromWeek = SEASON_START_WEEK, moved = 0 }: { row: SeasonRow; index: number; isMe: boolean; open: boolean; onToggle: () => void; throughWeek: number; fromWeek?: number; moved?: number }) {
  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 400, damping: 30, delay: Math.min(index * 0.03, 0.3) }}
      className={`card-flat overflow-hidden ${isMe ? "bg-flag-soft shadow-hard" : "bg-surface"}`}
    >
      <button className="row-hover flex w-full items-center gap-3 p-3 text-left" onClick={onToggle} aria-expanded={open}>
        <PlaceBadge place={row.place} muted={throughWeek === 0} />
        <div className="min-w-0 flex-1">
          <div className="font-display flex items-center gap-2 truncate text-[17px] font-extrabold">
            <span className="truncate">{row.name}</span>
            {isMe && <span className="chip bg-surface py-0 text-[10px]">you</span>}
            {row.mine && !isMe && <span className="chip bg-surface py-0 text-[10px]">yours</span>}
            <MovedChip by={moved} />
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
          <CountUp value={row.points} className="font-display block text-3xl font-extrabold leading-none tabular" />
          <div className="text-[10px] font-bold uppercase tracking-wider text-ink-3">pts</div>
        </div>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
            <div className="border-t-2 border-dashed border-line px-3 pb-3 pt-3">
              <SeasonWeekChart row={row} fromWeek={fromWeek} throughWeek={throughWeek} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.li>
  );
}
