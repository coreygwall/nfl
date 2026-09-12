import { useState, type FormEvent } from "react";
import { motion } from "motion/react";
import { api, ApiClientError } from "../api/client.ts";
import { useAdminPlayerMutation, useAdminPlayers, useAdminPullResults, useAdminResetAccess, useAdminSetResult, useAdminStatus, useAdminSync, useAdminWeek, useBootstrap } from "../api/queries.ts";
import { TEAMS, type Abbr } from "../../shared/teams.ts";
import type { AdminGameDTO, AdminPullResultsResponse } from "../../shared/api.ts";
import { formatKickoff, formatShortDay } from "../lib/time.ts";
import { formatCode } from "../../shared/codes.ts";
import { ErrorState, Segmented, Spinner } from "../components/Common.tsx";
import { TeamSticker } from "../components/TeamSticker.tsx";
import { useToast } from "../components/Toast.tsx";
import { useHeaderWeek } from "../components/Chrome.tsx";

const PIN_KEY = "nflpool.admin.pin";

export function Admin() {
  const [pin, setPin] = useState<string | null>(() => {
    try {
      return sessionStorage.getItem(PIN_KEY);
    } catch {
      return null;
    }
  });
  if (!pin)
    return (
      <PinGate
        onOk={(p) => {
          try {
            sessionStorage.setItem(PIN_KEY, p);
          } catch {
            /* ignore */
          }
          setPin(p);
        }}
      />
    );
  return (
    <AdminPanel
      pin={pin}
      onSignOut={() => {
        sessionStorage.removeItem(PIN_KEY);
        setPin(null);
      }}
    />
  );
}

function PinGate({ onOk }: { onOk: (pin: string) => void }) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [shake, setShake] = useState(0);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api("/admin/verify", { method: "POST", body: {}, pin });
      onOk(pin);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Couldn't verify.");
      setShake((s) => s + 1);
    } finally {
      setBusy(false);
    }
  };
  return (
    <form onSubmit={submit} className="card mx-auto mt-6 max-w-sm p-5">
      <h1 className="font-display text-2xl font-extrabold">Commissioner's office</h1>
      <p className="mb-3 text-sm text-ink-2">Enter the admin PIN to record results.</p>
      <motion.div key={shake} animate={shake ? { x: [-8, 8, -5, 5, 0] } : { x: 0 }} transition={{ duration: 0.35 }}>
        <input
          autoFocus
          type="password"
          inputMode="numeric"
          autoComplete="off"
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          placeholder="PIN"
          aria-label="Admin PIN"
          className="card-flat w-full px-4 py-3 text-lg tracking-[0.3em] outline-none focus:shadow-hard"
        />
      </motion.div>
      {error && <p className="mt-2 text-sm font-semibold text-danger">{error}</p>}
      <button className="btn btn-primary mt-4 w-full" disabled={busy || !pin}>
        {busy ? "Checking…" : "Open up"}
      </button>
    </form>
  );
}

function AdminPanel({ pin, onSignOut }: { pin: string; onSignOut: () => void }) {
  const boot = useBootstrap();
  const [tab, setTab] = useState<"results" | "players" | "tools">("results");
  const [week, setWeek] = useState<number | null>(null);
  const activeWeek = week ?? boot.data?.boardWeek ?? 1;
  return (
    <div className="mx-auto w-full max-w-[860px] lg:max-w-[1060px]">
      <Segmented
        value={tab}
        options={[
          { value: "results", label: "Results" },
          { value: "players", label: "Players" },
          { value: "tools", label: "Tools" },
        ]}
        onChange={setTab}
      />
      <div className="mt-4">
        {tab === "results" && <Results pin={pin} week={activeWeek} onWeek={setWeek} />}
        {tab === "players" && <Players pin={pin} />}
        {tab === "tools" && <Tools pin={pin} onSignOut={onSignOut} />}
      </div>
    </div>
  );
}

function Results({ pin, week, onWeek }: { pin: string; week: number; onWeek: (w: number) => void }) {
  const data = useAdminWeek(week, pin);
  const set = useAdminSetResult(pin);
  const pull = useAdminPullResults(pin);
  const toast = useToast();
  const [conflicts, setConflicts] = useState<AdminPullResultsResponse["conflicts"]>([]);
  const save = async (game: AdminGameDTO, winner: Abbr | "TIE" | null) => {
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
  const gamesById = new Map((data.data?.games ?? []).map((g) => [g.id, g]));
  useHeaderWeek(week, onWeek);
  return (
    <div>
      {data.isPending ? (
        <Spinner />
      ) : data.error ? (
        <ErrorState message={data.error.message} onRetry={() => data.refetch()} />
      ) : (
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
      )}
    </div>
  );
}

function ResultRow({ game, onSet, busy }: { game: AdminGameDTO; onSet: (w: Abbr | "TIE" | null) => void; busy: boolean }) {
  const count = (abbr: Abbr) => game.picks.filter((p) => p.team === abbr).length;
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
        <span className="min-w-0">
          <span className="font-display block truncate text-sm font-extrabold">{t.nickname}</span>
          <span className={`block text-[11px] ${on ? "text-white/80" : "text-ink-3"}`}>{count(abbr)} picked</span>
        </span>
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
        <span className="flex items-center gap-2">
          {game.awayScore !== null && game.homeScore !== null && (
            <span className="tabular text-ink-3">
              {game.awayScore}–{game.homeScore}
            </span>
          )}
          {game.picks.length} pick{game.picks.length === 1 ? "" : "s"}
        </span>
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

function Players({ pin }: { pin: string }) {
  const data = useAdminPlayers(pin);
  const mut = useAdminPlayerMutation(pin);
  const reset = useAdminResetAccess(pin);
  const toast = useToast();
  if (data.isPending) return <Spinner />;
  if (data.error) return <ErrorState message={data.error.message} onRetry={() => data.refetch()} />;
  /** Signs someone in on the device they open it with — for a new domain, or a lost code. */
  const copySignIn = async (id: string, code: string, name: string) => {
    const link = `${window.location.origin}/welcome?claim=${id}&code=${code}`;
    try {
      await navigator.clipboard.writeText(link);
      toast(`Copied ${name}'s sign-in link. Send it to them and nobody else.`, "success");
    } catch {
      window.prompt(`${name}'s sign-in link`, link);
    }
  };

  const resetAccess = async (id: string, name: string) => {
    try {
      const r = await reset.mutateAsync(id);
      toast(`${name}'s new code is ${formatCode(r.code)} — send it to them.`, "success");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Couldn't reset", "error");
    }
  };
  const act = async (input: Parameters<typeof mut.mutateAsync>[0]) => {
    try {
      await mut.mutateAsync(input);
      toast(input.action === "delete" ? "Player removed" : "Renamed", "success");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Couldn't save", "error");
    }
  };
  return (
    <ul className="grid gap-2 lg:grid-cols-2">
      {data.data.players.length === 0 && <p className="text-sm text-ink-2">No players yet.</p>}
      {data.data.players.map((p) => (
        <li key={p.id} className="card-flat bg-white p-3">
          <div className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <div className="font-display truncate font-extrabold">{p.name}</div>
              <div className="text-xs text-ink-2">
                {p.picksCount} picks · {p.weeksPlayed} wk{p.weeksPlayed === 1 ? "" : "s"} · last seen {formatShortDay(p.lastSeenAt)}
              </div>
            </div>
            <button
              className="btn btn-sm"
              onClick={() => {
                const name = window.prompt("New name", p.name);
                if (name && name !== p.name) void act({ id: p.id, action: "rename", name });
              }}
            >
              Rename
            </button>
            <button
              className="btn btn-sm text-danger"
              onClick={() => {
                if (window.confirm(`Remove ${p.name} and all their picks?`)) void act({ id: p.id, action: "delete" });
              }}
            >
              Remove
            </button>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2 border-t-2 border-dashed border-line pt-2 text-xs text-ink-2">
            <span className="chip bg-paper-2 py-0 text-[11px]">
              {p.devices === 0 ? "No device yet" : `${p.devices} device${p.devices === 1 ? "" : "s"}`}
            </span>
            <span className="font-display tracking-[0.1em]">{p.code ? formatCode(p.code) : "no code"}</span>
            {p.code && (
              <button
                className="btn btn-sm"
                onClick={() => void copySignIn(p.id, p.code!, p.name)}
                title="A link that signs this person in on whatever device they open it with"
              >
                Copy sign-in link
              </button>
            )}
            <button
              className="btn btn-sm ml-auto"
              disabled={reset.isPending}
              onClick={() => {
                if (!window.confirm(`Give ${p.name} a new code and sign out their devices?`)) return;
                void resetAccess(p.id, p.name);
              }}
            >
              Reset access
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
}

function Tools({ pin, onSignOut }: { pin: string; onSignOut: () => void }) {
  const sync = useAdminSync(pin);
  const status = useAdminStatus(pin);
  const toast = useToast();
  const [exporting, setExporting] = useState(false);

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

  const exportCsv = async () => {
    setExporting(true);
    try {
      const res = await fetch("/api/admin/export.csv", { headers: { "x-admin-pin": pin } });
      if (!res.ok) throw new Error(`Export failed (${res.status})`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = res.headers.get("content-disposition")?.match(/filename="([^"]+)"/)?.[1] ?? "picks.csv";
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Export failed", "error");
    } finally {
      setExporting(false);
    }
  };

  const st = status.data;
  return (
    <div className="grid items-start gap-3 lg:grid-cols-2">
      <div className="card-flat bg-white p-4">
        <h3 className="font-display font-extrabold">Schedule</h3>
        <p className="mb-2 text-sm text-ink-2">
          Every morning the app checks nflverse for flexed kickoff times and moves them. It never touches picks or results.
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
          The <b>Pull final scores</b> button on the Results tab fills in winners from nflverse for games that have
          finished. It only fills blanks — anything you entered by hand stands, and a disagreement is shown, never applied.
        </p>
        {st && (
          <p className="text-xs text-ink-3">
            {st.resultsSyncedAt ? `Last pulled ${formatKickoff(st.resultsSyncedAt)}` : "Not pulled yet"}
            {st.resultsSyncError ? ` · last error: ${st.resultsSyncError}` : ""}
          </p>
        )}
      </div>
      <div className="card-flat bg-white p-4">
        <h3 className="font-display font-extrabold">Backup</h3>
        <p className="mb-3 text-sm text-ink-2">
          Every pick with its game, result and points, as a spreadsheet. Grab one whenever you like; it settles arguments.
        </p>
        <button className="btn btn-sm" disabled={exporting} onClick={exportCsv}>
          {exporting ? "Preparing…" : "Download picks CSV"}
        </button>
      </div>
      <div className="card-flat bg-white p-4">
        <h3 className="font-display font-extrabold">Late picks</h3>
        <p className="text-sm text-ink-2">
          Someone texted their picks after kickoff? Their picks can be backfilled through the API (see the README) — locks are bypassed for
          the commissioner only.
        </p>
      </div>
      <button className="btn btn-sm justify-self-start" onClick={onSignOut}>
        Sign out of admin
      </button>
    </div>
  );
}
