import { useState } from "react";
import { Link } from "react-router";
import {
  useBootstrap,
  useLeagueStatus,
  useLeagueWeek,
  usePullResults,
  useRoles,
  useSetResult,
  useSyncSchedule,
} from "../api/queries.ts";
import { TEAMS, type Abbr } from "../../shared/teams.ts";
import type { GameDTO, PullResultsResponse } from "../../shared/api.ts";
import { formatKickoff, formatShortDay } from "../lib/time.ts";
import { ErrorState, Segmented, Spinner } from "../components/Common.tsx";
import { TeamSticker } from "../components/TeamSticker.tsx";
import { useToast } from "../components/Toast.tsx";
import { useHeaderWeek } from "../components/Chrome.tsx";

/**
 * The league office. Every Tally pool scores the same NFL games, so who won is settled in exactly
 * one place — here — rather than by each commissioner typing the same fourteen results into their
 * own pool and eventually disagreeing. Today that is a person with a feed to pull from; the shape
 * is the same the day it is fully automated.
 */
export function League() {
  const boot = useBootstrap();
  const roles = useRoles();
  const [tab, setTab] = useState<"results" | "feed">("results");
  const [week, setWeek] = useState<number | null>(null);
  if (boot.isPending) return <Spinner />;
  if (boot.error) return <ErrorState message={boot.error.message} onRetry={() => boot.refetch()} />;
  if (!roles.platformAdmin) {
    return (
      <div className="card mx-auto mt-6 max-w-md p-5">
        <h1 className="font-display text-2xl font-extrabold">Results aren't set here</h1>
        <p className="mt-1 text-sm text-ink-2">
          Who won a game is the same answer for every pool, so it's settled once, centrally — not by a commissioner.
          Scores land on their own within a few minutes of a game finishing.
        </p>
        <Link className="btn btn-sm mt-4" to="/">
          Back to the pool
        </Link>
      </div>
    );
  }
  const activeWeek = week ?? boot.data.boardWeek;

  return (
    <div className="mx-auto w-full max-w-[860px] lg:max-w-[1060px]">
      <div className="card-flat mb-3 bg-paper-2 p-3">
        <p className="text-xs text-ink-2">
          <b className="font-display">League office.</b> These apply to every pool on Tally, not just{" "}
          {boot.data.poolName}.
          {roles.commissioner && (
            <>
              {" "}
              <Link className="underline" to="/commissioner">
                Your pool's settings are over here.
              </Link>
            </>
          )}
        </p>
      </div>
      <Segmented
        value={tab}
        label="League office sections"
        pillId="league-tab"
        options={[
          { value: "results", label: "Results" },
          { value: "feed", label: "Schedule & feed" },
        ]}
        onChange={setTab}
      />
      <div className="mt-4">{tab === "results" ? <Results week={activeWeek} onWeek={setWeek} /> : <Feed />}</div>
    </div>
  );
}

function Results({ week, onWeek }: { week: number; onWeek: (w: number) => void }) {
  const data = useLeagueWeek(week, true);
  const set = useSetResult();
  const pull = usePullResults();
  const toast = useToast();
  const [conflicts, setConflicts] = useState<PullResultsResponse["conflicts"]>([]);
  useHeaderWeek(week, onWeek);

  const save = async (game: GameDTO, winner: Abbr | "TIE" | null) => {
    try {
      await set.mutateAsync({ gameId: game.id, winner });
      toast(winner === null ? "Result cleared" : winner === "TIE" ? "Recorded as a tie" : `${TEAMS[winner].nickname} win recorded`, "success");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Couldn't save", "error");
    }
  };
  const runPull = async () => {
    try {
      const r = await pull.mutateAsync(week);
      setConflicts(r.conflicts);
      if (!r.ok) {
        toast(`Couldn't reach the scores: ${r.reason ?? "unknown"}`, "error");
        return;
      }
      const parts: string[] = [];
      if (r.applied) parts.push(`${r.applied} filled in`);
      if (r.confirmed) parts.push(`${r.confirmed} already matched`);
      if (r.pending) parts.push(`${r.pending} not posted yet`);
      if (r.applied) toast(`Week ${week}: ${parts.join(" · ")}`, "success");
      else if (parts.length) toast(`Nothing new · ${parts.join(" · ")}`);
      else toast("No games have kicked off yet this week.");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Couldn't pull scores", "error");
    }
  };
  if (data.isPending) return <Spinner />;
  if (data.error) return <ErrorState message={data.error.message} onRetry={() => data.refetch()} />;
  const gamesById = new Map(data.data.games.map((g) => [g.id, g]));

  return (
    <div className="mt-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <p className="text-sm text-ink-2">
          {data.data.games.filter((g) => g.winner).length} of {data.data.games.length} final · tap the winner. Tap again to clear.
        </p>
        <button className="btn btn-sm btn-primary w-full sm:ml-auto sm:w-auto" disabled={pull.isPending} onClick={runPull}>
          {pull.isPending ? "Checking…" : "Pull final scores"}
        </button>
      </div>
      {conflicts.length > 0 && (
        <div className="card-flat mb-3 border-danger/60 bg-danger-soft/60 p-3">
          <h3 className="font-display text-sm font-extrabold">
            nflverse disagrees on {conflicts.length} game{conflicts.length === 1 ? "" : "s"}
          </h3>
          <ul className="mt-1 space-y-1 text-sm text-ink-2">
            {conflicts.map((c) => {
              const g = gamesById.get(c.gameId);
              const label = g ? `${TEAMS[g.away].display} at ${TEAMS[g.home].display}` : c.gameId;
              const said = c.feed === "TIE" ? "a tie" : TEAMS[c.feed as Abbr]?.nickname ?? c.feed;
              const yours = c.recorded === "TIE" ? "a tie" : TEAMS[c.recorded as Abbr]?.nickname ?? c.recorded;
              return (
                <li key={c.gameId}>
                  <b>{label}</b> — you recorded {yours}, the feed says {said} ({c.awayScore}–{c.homeScore}).
                </li>
              );
            })}
          </ul>
          <p className="mt-2 text-xs text-ink-3">Yours stands. Clear the result below and pull again to take the feed's.</p>
        </div>
      )}
      <ul className="grid gap-2 lg:grid-cols-2">
        {data.data.games.map((g) => (
          <ResultRow key={g.id} game={g} onSet={(w) => save(g, w)} busy={set.isPending} />
        ))}
      </ul>
    </div>
  );
}

function ResultRow({ game, onSet, busy }: { game: GameDTO; onSet: (w: Abbr | "TIE" | null) => void; busy: boolean }) {
  const teamBtn = (abbr: Abbr) => {
    const t = TEAMS[abbr];
    const on = game.winner === abbr;
    return (
      <button
        disabled={busy}
        onClick={() => onSet(on ? null : abbr)}
        aria-pressed={on}
        className={`flex flex-1 items-center gap-2 rounded-xl border-2 px-2 py-1.5 text-left transition-colors ${on ? "border-ink text-white" : "border-line bg-white"}`}
        style={on ? { background: t.primary } : undefined}
      >
        <TeamSticker abbr={abbr} size={32} flat />
        <span className="font-display min-w-0 truncate text-sm font-extrabold">{t.nickname}</span>
      </button>
    );
  };
  return (
    <li className="card-flat bg-white p-2.5">
      <div className="mb-2 flex items-center justify-between text-[11px] font-semibold text-ink-2">
        <span>
          {formatShortDay(game.kickoffAt)} · {formatKickoff(game.kickoffAt).split("·")[1]}
          {!game.locked && <span className="ml-2 chip bg-flag-soft py-0 text-[10px]">Not started</span>}
        </span>
        {game.awayScore !== null && game.homeScore !== null && (
          <span className="tabular text-ink-3">
            {game.awayScore}–{game.homeScore}
          </span>
        )}
      </div>
      <div className="flex items-stretch gap-2">
        {teamBtn(game.away)}
        <button
          disabled={busy}
          onClick={() => onSet(game.winner === "TIE" ? null : "TIE")}
          aria-pressed={game.winner === "TIE"}
          className={`rounded-xl border-2 px-2 text-xs font-bold ${game.winner === "TIE" ? "border-ink bg-ink text-paper" : "border-line bg-white text-ink-2"}`}
        >
          Tie
        </button>
        {teamBtn(game.home)}
      </div>
    </li>
  );
}

function Feed() {
  const sync = useSyncSchedule();
  const status = useLeagueStatus(true);
  const toast = useToast();

  const runSync = async (source: "remote" | "bundled") => {
    try {
      const r = await sync.mutateAsync(source);
      if ("ok" in r) {
        toast(r.ok ? `Checked nflverse: ${r.updated} kickoff${r.updated === 1 ? "" : "s"} updated` : `Not applied: ${r.reason}`, r.ok ? "success" : "error");
      } else {
        toast(`Reloaded bundled schedule (${r.upserted} games)`, "success");
      }
    } catch (err) {
      toast(err instanceof Error ? err.message : "Sync failed", "error");
    }
  };

  const st = status.data;
  return (
    <div className="grid items-start gap-3 lg:grid-cols-2">
      <div className="card-flat bg-white p-4">
        <h3 className="font-display font-extrabold">Schedule</h3>
        <p className="mb-2 text-sm text-ink-2">
          Every morning Tally checks nflverse for flexed kickoff times and moves them. It never touches picks or results.
        </p>
        {st && (
          <p className="mb-3 text-xs text-ink-3">
            {st.scheduleSyncedAt ? `Last checked ${formatKickoff(st.scheduleSyncedAt)} · ${st.scheduleLastChanges ?? 0} changed` : "Not checked yet"}
            {st.scheduleSyncError ? ` · last error: ${st.scheduleSyncError}` : ""}
            {` · build ${st.build}`}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <button className="btn btn-sm btn-primary" disabled={sync.isPending} onClick={() => runSync("remote")}>
            {sync.isPending ? "Checking…" : "Check nflverse now"}
          </button>
          <button className="btn btn-sm" disabled={sync.isPending} onClick={() => runSync("bundled")}>
            Reload bundled copy
          </button>
        </div>
      </div>
      <div className="card-flat bg-white p-4">
        <h3 className="font-display font-extrabold">Final scores</h3>
        <p className="mb-2 text-sm text-ink-2">
          Through the game windows Tally looks for finished games and fills in the winners. It only fills blanks —
          anything set by hand stands, and a disagreement is shown, never applied.
        </p>
        {st && (
          <p className="text-xs text-ink-3">
            {st.resultsSyncedAt ? `Last pulled ${formatKickoff(st.resultsSyncedAt)}` : "Not pulled yet"}
            {st.resultsSyncError ? ` · last error: ${st.resultsSyncError}` : ""}
          </p>
        )}
      </div>
      <div className="card-flat bg-white p-4">
        <h3 className="font-display font-extrabold">Who runs the league</h3>
        <ul className="text-sm text-ink-2">
          {(st?.admins ?? []).map((a) => (
            <li key={a.id} className="font-display font-extrabold text-ink">
              {a.name}
            </li>
          ))}
          {st && st.admins.length === 0 && <li>Nobody yet.</li>}
        </ul>
        <p className="mt-2 text-xs text-ink-3">
          Results, the schedule and the feed apply to every pool, so this list is deliberately short.
        </p>
      </div>
    </div>
  );
}
