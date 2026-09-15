import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { useBootstrap, useSeasonBoard, useWeekBoard } from "../api/queries.ts";
import { usePlayer } from "../lib/player.tsx";
import { ErrorState, Spinner } from "../components/Common.tsx";
import { POOL_TYPES } from "../../shared/pools.ts";
import { formatKickoff } from "../lib/time.ts";
import { MAX_PICKS } from "../../shared/picks.ts";
import { WEEKS } from "../../shared/week.ts";
import { Announcements } from "../components/Announcements.tsx";

/**
 * Home: which pool you are in, and what it wants from you.
 *
 * It exists because "which pool am I in" stopped being rhetorical. With one pool the answer was the
 * whole app, so the app *was* the pool and the question never came up; with two it is the first
 * thing you need on opening, and no other screen can answer it — Picks and Board are already
 * inside a pool by the time you reach them.
 *
 * The rule it is built to: the pool you are in is never more than a glance away. At one pool this
 * is a single card saying what week it is, whether your picks are in and where you stand — useful
 * today rather than useful later.
 */
export function Home() {
  const boot = useBootstrap();
  if (boot.isPending) return <Spinner />;
  if (boot.error) return <ErrorState message={boot.error.message} onRetry={() => boot.refetch()} />;
  return (
    <div className="mx-auto w-full max-w-[860px]">
      <PoolCard />
      <Announcements preview />
      <BrowsePool />
      <MorePools />
      <p className="mt-6 text-center text-sm">
        <Link className="text-ink-3 underline" to="/rules">
          How scoring works
        </Link>
      </p>
    </div>
  );
}

function ordinal(n: number): string {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  return `${n}${["th", "st", "nd", "rd"][n % 10] ?? "th"}`;
}

function PoolCard() {
  const boot = useBootstrap();
  const { player, people, switchTo } = usePlayer();
  const nav = useNavigate();
  const currentWeek = boot.data?.currentWeek ?? 1;
  const week = useWeekBoard(currentWeek);
  const season = useSeasonBoard();

  const summary = boot.data?.weeks.find((w) => w.week === currentWeek);
  const entries = people.length > 0 ? people : player ? [player] : [];
  const made = new Map((week.data?.rows ?? []).map((r) => [r.playerId, r.picksMade]));
  const owing = week.data ? entries.filter((e) => (made.get(e.id) ?? 0) < MAX_PICKS) : [];
  const poolType = boot.data?.pool?.type;
  // Before any counting week has finished there is nothing to stand on: "1st of 3 · 0 pts" is a
  // boast about a race that has not started, and everyone is 1st.
  const standing = season.data && season.data.throughWeek > 0
    ? season.data.rows.find((r) => r.playerId === player?.id)
    : undefined;

  const lockText = !summary
    ? null
    : summary.lockedCount >= summary.gameCount
      ? "every game has started"
      : summary.lockedCount > 0
        ? `${summary.gameCount - summary.lockedCount} still open`
        : `first game ${formatKickoff(summary.firstKickoff)}`;

  return (
    <div className="card p-5">
      <div className="flex items-start gap-3">
        <div className="min-w-0">
          <h1 className="font-display truncate text-2xl font-extrabold">{boot.data?.poolName}</h1>
          {/* Most pools are named after the game they play, and printing "High Five" under
              "High Five" under a lockup that already says it is three of the same word. */}
          {poolType && poolType !== boot.data?.poolName && (
            <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-ink-2">{poolType}</p>
          )}
        </div>
      </div>

      <div className="mt-4 border-t-2 border-dashed border-line pt-4">
        <p className="text-sm font-semibold text-ink-2">
          Week {currentWeek}
          {lockText ? ` · ${lockText}` : ""}
        </p>
        {week.isPending ? (
          <div className="shimmer mt-2 h-5 w-48 rounded-full bg-paper-2" aria-hidden="true" />
        ) : !week.data ? (
          // Silence is the only safe thing to say here. "Your picks are in" off a request that
          // failed is the one sentence on this screen that can cost someone their week.
          <p className="mt-2 text-sm text-ink-2">
            Couldn't check your picks.{" "}
            <button className="underline" onClick={() => void week.refetch()}>
              Try again
            </button>
          </p>
        ) : !player ? (
          <>
            <p className="mt-2 font-display font-extrabold">Follow the pool without making picks.</p>
            <p className="mt-1 text-sm text-ink-2">See every week's results and the season race whenever you want.</p>
            <Link className="btn btn-sm mt-3" to="/welcome">Join to make picks</Link>
          </>
        ) : owing.length === 0 ? (
          <p className="mt-2 font-display font-extrabold text-turf">
            {entries.length > 1 ? `All ${entries.length} sets of picks are in.` : "Your picks are in."}
          </p>
        ) : (
          <>
            <p className="mt-2 font-display font-extrabold">
              {entries.length === 1
                ? "Your picks aren't in yet."
                : owing.length === entries.length
                  ? `None of your ${entries.length} entries have picked yet.`
                  : `${owing.map((e) => e.name).join(", ")} still ${owing.length === 1 ? "needs" : "need"} picks.`}
            </p>
            <button
              className="btn btn-primary btn-sm mt-3"
              onClick={() => {
                // The button names someone; switching to them is the half that does the naming true.
                const first = owing[0];
                if (first && first.id !== player?.id) switchTo(first.id);
                nav(`/week/${currentWeek}`);
              }}
            >
              {owing.length === 1 && entries.length > 1 && owing[0] ? `Make ${owing[0].name}'s picks` : "Make your picks"}
            </button>
          </>
        )}
      </div>

      {standing && (
        <Link
          to="/board/season"
          className="mt-4 flex items-center gap-3 border-t-2 border-dashed border-line pt-4 hover:text-ink"
        >
          <span className="font-display flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 border-ink bg-flag text-sm font-extrabold">
            {standing.place}
          </span>
          <span className="min-w-0">
            <span className="font-display block text-sm font-extrabold">
              {ordinal(standing.place)} of {season.data?.rows.length ?? 0} for the season
            </span>
            <span className="block text-xs text-ink-2">
              {standing.points} pts · best week {standing.bestWeek ? standing.bestWeek.points : "—"}
            </span>
          </span>
          <span className="ml-auto text-ink-3">›</span>
        </Link>
      )}
    </div>
  );
}

/** The pool should be useful before someone ever commits a pick. These links deliberately live on
 * Home rather than behind the pick flow, so a member can treat Tally like a season scoreboard. */
function BrowsePool() {
  const boot = useBootstrap();
  const currentWeek = boot.data?.currentWeek ?? 1;
  const boardWeek = boot.data?.boardWeek ?? currentWeek;
  const lastWeek = Math.min(WEEKS, Math.max(1, currentWeek, boardWeek));
  const weeks = Array.from({ length: lastWeek }, (_, i) => i + 1);

  return (
    <section className="mt-5" aria-labelledby="explore-pool-heading">
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <h2 id="explore-pool-heading" className="font-display text-lg font-extrabold">Explore the pool</h2>
        <span className="text-xs text-ink-3">No picks required</span>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <Link to="/board/season" className="card-flat block bg-surface p-4 transition-colors hover:bg-paper-2">
          <span className="font-display block font-extrabold">Season standings <span aria-hidden="true">›</span></span>
          <span className="mt-1 block text-sm text-ink-2">See the full-season leaderboard.</span>
        </Link>
        <Link to={`/board/week/${boardWeek}`} className="card-flat block bg-surface p-4 transition-colors hover:bg-paper-2">
          <span className="font-display block font-extrabold">Weekly standings <span aria-hidden="true">›</span></span>
          <span className="mt-1 block text-sm text-ink-2">Open Week {boardWeek}'s board and results.</span>
        </Link>
      </div>
      <div className="card-flat mt-2 bg-surface p-4">
        <h3 className="font-display font-extrabold">Past weeks</h3>
        <p className="mt-1 text-sm text-ink-2">Jump to any week to revisit its picks and results.</p>
        <div className="mt-3 flex flex-wrap gap-2" aria-label="Browse weeks">
          {weeks.map((week) => (
            <Link key={week} className="chip bg-paper-2 hover:bg-flag" to={`/board/week/${week}`}>
              Week {week}
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

/** Joining another pool, and what Tally plays. Kept below the fold: nobody opens the app for it. */
function MorePools() {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-5 border-t-2 border-dashed border-line pt-4">
      <button className="btn btn-sm" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        {open ? "Hide" : "Join or start a pool"}
      </button>
      {open && (
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <div className="card-flat bg-surface p-4">
            <h3 className="font-display font-extrabold">Join a pool</h3>
            <p className="text-sm text-ink-2">
              Open the link your commissioner sent. Every pool lives at its own address, so the link is the way in.
            </p>
          </div>
          <div className="card-flat bg-surface p-4">
            <h3 className="font-display font-extrabold">
              Start a pool <span className="chip ml-1 bg-paper-2 py-0 text-[10px]">coming soon</span>
            </h3>
            <p className="text-sm text-ink-2">Pick a game, name it, share one link.</p>
          </div>
          {POOL_TYPES.map((t) => (
            <div key={t.slug} className="card-flat bg-surface p-4">
              <h3 className="font-display font-extrabold">
                {t.name}{" "}
                <span className={`chip ml-1 py-0 text-[10px] ${t.status === "live" ? "bg-turf text-on-turf" : "bg-paper-2"}`}>
                  {t.status === "live" ? "live now" : "coming soon"}
                </span>
              </h3>
              <p className="text-sm text-ink-2">{t.blurb}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
