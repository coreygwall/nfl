import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { useBootstrap, useSeasonBoard, useWeekBoard } from "../api/queries.ts";
import { usePlayer } from "../lib/player.tsx";
import { formatKickoff } from "../lib/time.ts";
import { MAX_PICKS } from "../../shared/picks.ts";
import { ordinal } from "../../shared/scoring.ts";
import { SEASON_START_WEEK } from "../../shared/week.ts";
import { Announcements } from "../components/Announcements.tsx";
import { PoolPlays } from "../components/PoolPlays.tsx";
import { fallbackPoolWeeks } from "../lib/poolFallback.ts";
import { joinPromptOpen, previewWeek } from "../lib/poolHome.ts";
import { SeasonRowItem, WeekRowItem } from "./Board.tsx";
import { Share } from "../components/Icons.tsx";
import { poolUrl } from "../lib/basename.ts";
import { useToast } from "../components/Toast.tsx";

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
  if (!boot.data) {
    return <PoolDoorway error={boot.error?.message} retry={() => void boot.refetch()} />;
  }
  return (
    <div className="mx-auto w-full max-w-[860px]">
      <PoolCard />
      <PoolOpenCard now={boot.data.now} />
      <BrowsePool />
      <Announcements preview />
      <MorePools />
      <p className="mt-6 text-center text-sm">
        <Link className="text-ink-3 underline" to="/rules">
          How scoring works
        </Link>
      </p>
    </div>
  );
}

/** Useful before the first request finishes, and still useful if it never does. */
function PoolDoorway({ error, retry }: { error?: string; retry: () => void }) {
  const { pickWeek, boardWeek } = fallbackPoolWeeks();
  return (
    <div className="mx-auto w-full max-w-[860px]">
      <div className="card p-5">
        <p className="text-xs font-bold uppercase tracking-wider text-ink-3">Your pool</p>
        <h1 className="font-display mt-1 text-3xl font-extrabold">High Five</h1>
        <p className="mt-2 text-sm text-ink-2">
          {error ? "We couldn't refresh the live pool yet. You can still go where you need to." : "Refreshing the latest pool details…"}
        </p>
        <div className="mt-5 grid gap-2 sm:grid-cols-3">
          <Link className="btn btn-primary w-full" to={`/week/${pickWeek}`}>
            Make Week {pickWeek} picks
          </Link>
          <Link className="btn w-full" to={`/board/week/${boardWeek}`}>
            Week {boardWeek} winner & results
          </Link>
          <Link className="btn w-full" to="/board/season">
            Season standings · starts Week {SEASON_START_WEEK}
          </Link>
        </div>
        {error && (
          <div className="mt-4 border-t-2 border-dashed border-line pt-4">
            <p role="alert" className="text-xs text-ink-3">{error}</p>
            <button className="btn btn-sm mt-2" onClick={retry}>Try refreshing the pool</button>
          </div>
        )}
      </div>
      <p className="mt-4 text-center text-xs text-ink-3">
        Picks and standings are separate—you can browse the pool without submitting anything.
      </p>
    </div>
  );
}

/** This is intentionally time-boxed campaign copy, not a permanent rule about joining. */
function PoolOpenCard({ now }: { now: string }) {
  const toast = useToast();
  if (!joinPromptOpen(now)) return null;

  const share = async () => {
    const url = poolUrl();
    if (navigator.share) {
      try {
        await navigator.share({ url });
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        // A desktop browser can expose Web Share and still decline this payload. Copy is the
        // dependable second path, rather than making the button silently do nothing.
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      toast("Pool link copied — send it to anyone who still wants in.", "success");
    } catch {
      toast("Couldn't open sharing. Copy the address from your browser instead.", "error");
    }
  };

  return (
    <section className="card mt-4 overflow-hidden bg-surface p-5" aria-labelledby="pool-open-heading">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold uppercase tracking-wider text-ink-3">Invite your people</p>
          <h2 id="pool-open-heading" className="font-display mt-0.5 text-xl font-extrabold">The pool is still open</h2>
        </div>
        <span className="font-display shrink-0 rounded-full border-2 border-ink bg-flag px-3 py-1 text-xs font-extrabold">
          Until Sun 1 ET
        </span>
      </div>
      <p className="mt-3 w-full text-sm leading-relaxed text-ink-2">
        Join for Week 2. Games lock one by one, so new players can pick from what’s left.
      </p>
      <button className="btn btn-primary mt-4 w-full sm:w-auto" onClick={() => void share()}>
        <Share /> Share the pool
      </button>
      <p className="mt-2 text-xs text-ink-3">Opens your phone’s share menu; on desktop, the link is copied.</p>
    </section>
  );
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

  // Something of yours is missing and there is still time to fix it. It is the only state on this
  // page worth shouting about, so it is the only one that gets the flag — see `PoolOpenCard`,
  // which gave its yellow up for this.
  const owingNow = Boolean(player) && Boolean(week.data) && owing.length > 0;

  return (
    <div className={`card p-5 ${owingNow ? "bg-flag-soft" : ""}`}>
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
          <>
            <p className="mt-2 font-display font-extrabold text-turf">
              {entries.length > 1 ? `All ${entries.length} sets of picks are in.` : "Your picks are in."}
            </p>
            {/* Someone who already picked comes back to ask one question, and it is not "did I
                pick". It is "can I still change it" — so the answer is on the screen they land
                on, next to the way to do it, rather than in the rules. */}
            <Link className="btn btn-sm mt-3" to={`/week/${currentWeek}`}>
              Review or change your picks
            </Link>
            <p className="mt-2 text-xs text-ink-2">Each pick stays editable until that game kicks off.</p>
          </>
        ) : (
          <>
            <p className="mt-2 font-display text-xl font-extrabold">
              {entries.length === 1
                ? "Your picks aren't in yet."
                : owing.length === entries.length
                  ? `None of your ${entries.length} entries have picked yet.`
                  : `${owing.map((e) => e.name).join(", ")} still ${owing.length === 1 ? "needs" : "need"} picks.`}
            </p>
            {/* What the task actually is. Somebody who plays once a week does not carry the rules
                around in their head, and "Make your picks" alone does not say how long this takes
                or what it asks of them. */}
            <p className="mt-1 text-sm text-ink-2">
              Pick {MAX_PICKS} winners and rank them — your surest call is worth {MAX_PICKS} points, your shakiest 1.
            </p>
            <button
              className="btn btn-primary mt-4 w-full sm:w-auto"
              onClick={() => {
                // The button names someone; switching to them is the half that does the naming true.
                const first = owing[0];
                if (first && first.id !== player?.id) switchTo(first.id);
                nav(`/week/${currentWeek}`);
              }}
            >
              {owing.length === 1 && entries.length > 1 && owing[0] ? `Make ${owing[0].name}'s picks` : "Make your picks"}
            </button>
            <p className="mt-2 text-xs text-ink-2">
              Takes a minute, and there is no deadline for the week — each game locks at its own kickoff.
            </p>
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
  const { player } = usePlayer();
  const currentWeek = boot.data?.currentWeek ?? 1;
  const boardWeek = boot.data?.boardWeek ?? currentWeek;
  // The week being played, not the last one that finished — see `previewWeek`.
  const preview = previewWeek(boot.data?.weeks ?? []);
  const weekBoard = useWeekBoard(preview?.week ?? null);
  const seasonBoard = useSeasonBoard();
  const [openWeekPlayer, setOpenWeekPlayer] = useState<string | null>(null);
  const [openSeasonPlayer, setOpenSeasonPlayer] = useState<string | null>(null);
  const pastWeeks = (boot.data?.weeks ?? [])
    .filter((week) => week.gameCount > 0 && week.finalCount === week.gameCount && week.week !== preview?.week)
    .map((week) => week.week);

  return (
    <section className="mt-5" aria-labelledby="explore-pool-heading">
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <h2 id="explore-pool-heading" className="font-display text-lg font-extrabold">Explore the pool</h2>
        <span className="text-xs text-ink-3">No picks required</span>
      </div>
      <div className="grid items-start gap-3 lg:grid-cols-2">
        <section className="card p-4" aria-labelledby="latest-week-heading">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-ink-3">
                {preview?.final ? "Latest weekly winner" : "This week so far"}
              </p>
              <h3 id="latest-week-heading" className="font-display mt-0.5 text-xl font-extrabold">
                {preview ? `Week ${preview.week} ${preview.final ? "results" : "standings"}` : "Weekly standings"}
              </h3>
            </div>
            {preview && (
              <span className={`chip text-xs ${preview.final ? "bg-turf-soft" : "bg-flag-soft"}`}>
                {preview.final ? "Final" : "In progress"}
              </span>
            )}
          </div>

          {preview === null ? (
            <>
              <p className="mt-3 text-sm text-ink-2">The first top three will appear here once Week 1 kicks off.</p>
              <Link className="btn btn-sm mt-3" to={`/board/week/${boardWeek}`}>Week {boardWeek}</Link>
            </>
          ) : weekBoard.isPending ? (
            <PreviewSkeleton />
          ) : !weekBoard.data ? (
            <p className="mt-3 text-sm text-ink-2">Couldn’t load this week’s standings.</p>
          ) : (
            <>
              <ul className="mt-3 space-y-2" aria-label={`Week ${preview.week} top three`}>
                {weekBoard.data.rows.slice(0, 3).map((row, index) => (
                  <WeekRowItem
                    key={row.playerId}
                    row={row}
                    index={index}
                    open={openWeekPlayer === row.playerId}
                    onToggle={() => setOpenWeekPlayer(openWeekPlayer === row.playerId ? null : row.playerId)}
                    isMe={row.playerId === player?.id}
                    week={preview.week}
                    started
                  />
                ))}
              </ul>
              <Link className="btn btn-sm mt-3 w-full" to={`/board/week/${preview.week}`}>
                See the full Week {preview.week} leaderboard
              </Link>
            </>
          )}

          {pastWeeks.length > 0 && (
            <div className="mt-4 border-t-2 border-dashed border-line pt-3">
              <h4 className="font-display text-sm font-extrabold">Past weeks</h4>
              <div className="mt-2 flex flex-wrap gap-2" aria-label="Browse past weeks">
                {pastWeeks.map((week) => (
                  <Link key={week} className="chip bg-paper-2 hover:bg-flag" to={`/board/week/${week}`}>Week {week}</Link>
                ))}
              </div>
            </div>
          )}
        </section>

        <section className="card p-4" aria-labelledby="season-preview-heading">
          <p className="text-xs font-bold uppercase tracking-wider text-ink-3">Season race</p>
          <h3 id="season-preview-heading" className="font-display mt-0.5 text-xl font-extrabold">Season standings</h3>
          {seasonBoard.isPending ? (
            <PreviewSkeleton />
          ) : !seasonBoard.data ? (
            <p className="mt-3 text-sm text-ink-2">Couldn’t load the season standings.</p>
          ) : seasonBoard.data.throughWeek === 0 ? (
            <div className="card-flat mt-3 bg-flag-soft p-4">
              <p className="font-display font-extrabold">Starts Week {seasonBoard.data.fromWeek}</p>
              <p className="mt-1 text-sm text-ink-2">Week 1 crowns its own winner. Season points begin next week.</p>
            </div>
          ) : (
            <ul className="mt-3 space-y-2" aria-label="Season top three">
              {seasonBoard.data.rows.slice(0, 3).map((row, index) => (
                <SeasonRowItem
                  key={row.playerId}
                  row={row}
                  index={index}
                  isMe={row.playerId === player?.id}
                  open={openSeasonPlayer === row.playerId}
                  onToggle={() => setOpenSeasonPlayer(openSeasonPlayer === row.playerId ? null : row.playerId)}
                  throughWeek={seasonBoard.data.throughWeek}
                  fromWeek={seasonBoard.data.fromWeek}
                />
              ))}
            </ul>
          )}
          <Link className="btn btn-sm mt-3 w-full" to="/board/season">
            Season standings · starts Week {SEASON_START_WEEK}
          </Link>
        </section>
      </div>
    </section>
  );
}

function PreviewSkeleton() {
  return (
    <div className="mt-3 space-y-2" aria-label="Loading standings">
      {[0, 1, 2].map((row) => <div key={row} className="shimmer h-[66px] rounded-card bg-paper-2" aria-hidden="true" />)}
    </div>
  );
}

/** Joining another pool, and what Tally plays. Kept below the fold: nobody opens the app for it,
 * and the same panel is behind the lockup and on the account page — written once, in `PoolPlays`. */
function MorePools() {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-5 border-t-2 border-dashed border-line pt-4">
      <button className="btn btn-sm" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        {open ? "Hide" : "Join or start a pool"}
      </button>
      {open && (
        <div className="mt-3">
          <PoolPlays />
        </div>
      )}
    </div>
  );
}
