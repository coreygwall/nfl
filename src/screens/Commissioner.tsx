import { useState, type FormEvent } from "react";
import { motion } from "motion/react";
import { Link } from "react-router";
import { authHeaders, ApiClientError } from "../api/client.ts";
import {
  useBootstrap,
  useClaimRoles,
  useCommissionerOverview,
  useCommissionerPlayerMutation,
  useCommissionerGrant,
  useCommissionerPlayers,
  useRenamePool,
  useResetAccess,
  useRoles,
  useSetReady,
} from "../api/queries.ts";
import type { RoleHolder } from "../../shared/api.ts";
import { formatShortDay } from "../lib/time.ts";
import { formatCode } from "../../shared/codes.ts";
import { poolUrl } from "../lib/basename.ts";
import { ErrorState, Segmented, Spinner } from "../components/Common.tsx";
import { Check } from "../components/Icons.tsx";
import { useToast } from "../components/Toast.tsx";

/**
 * The commissioner's office — everything about *this pool*, and nothing about who won on Sunday.
 * Results belong to the league office (`League.tsx`), because every pool scores the same games and
 * two commissioners entering them separately is two chances to disagree.
 *
 * The office belongs to an account now rather than to whoever knows a PIN. Somebody arriving here
 * without it is not asked to prove themselves over and over; they are told whose pool it is.
 */
export function Commissioner() {
  const boot = useBootstrap();
  const roles = useRoles();
  const [tab, setTab] = useState<"pool" | "players">("pool");
  if (boot.isPending) return <Spinner />;
  if (boot.error) return <ErrorState message={boot.error.message} onRetry={() => boot.refetch()} />;
  if (!roles.commissioner && !roles.platformAdmin) return <NotTheCommissioner />;

  return (
    <div className="mx-auto w-full max-w-[860px] lg:max-w-[1060px]">
      <Segmented
        value={tab}
        label="Commissioner sections"
        pillId="commissioner-tab"
        options={[
          { value: "pool", label: "Pool" },
          { value: "players", label: "Players" },
        ]}
        onChange={setTab}
      />
      <div className="mt-4">{tab === "pool" ? <PoolSettings /> : <Players />}</div>
      {roles.platformAdmin && (
        <div className="card-flat mt-4 flex flex-wrap items-center gap-3 bg-paper-2 p-4">
          <div className="min-w-0 flex-1">
            <h3 className="font-display font-extrabold">League office</h3>
            <p className="text-sm text-ink-2">
              Results, the schedule and the score feed. They apply to every Tally pool, so they aren't a commissioner's
              to set — you can open them because you run the league.
            </p>
          </div>
          <Link className="btn btn-sm btn-primary" to="/league">
            Open the league office
          </Link>
        </div>
      )}
    </div>
  );
}

/**
 * The keys, once. Typing the owner PIN attaches both offices to the account you are signed in as,
 * and from then on this page just opens.
 */
function NotTheCommissioner() {
  const boot = useBootstrap();
  const claim = useClaimRoles();
  const toast = useToast();
  const [pin, setPin] = useState("");
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shake, setShake] = useState(0);
  const signedIn = !!boot.data?.account;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await claim.mutateAsync(pin);
      toast("You're the commissioner of this pool. The office is attached to your account now.", "success");
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Couldn't verify.");
      setShake((s) => s + 1);
    }
  };

  return (
    <div className="card mx-auto mt-6 max-w-md p-5">
      <h1 className="font-display text-2xl font-extrabold">This isn't your pool to run</h1>
      <p className="mt-1 text-sm text-ink-2">
        {boot.data?.poolName ?? "This pool"} has a commissioner, and it isn't this account. They set the roster, the
        name and the invites; if something needs changing, ask them.
      </p>
      <Link className="btn btn-sm mt-4" to="/">
        Back to the pool
      </Link>
      <div className="mt-5 border-t-2 border-dashed border-line pt-4">
        {!asking ? (
          <button className="text-xs text-ink-3 underline" onClick={() => setAsking(true)}>
            I own this pool and lost access
          </button>
        ) : !signedIn ? (
          <p className="text-sm text-ink-2">Sign in to your account first, then come back and enter the owner PIN.</p>
        ) : (
          <form onSubmit={submit}>
            <label className="font-display block text-sm font-extrabold" htmlFor="owner-pin">
              Owner PIN
            </label>
            <p className="mb-2 text-xs text-ink-3">
              Entered once. It hands the office to the account you're signed in as — it isn't a password you'll type
              again.
            </p>
            <motion.div key={shake} animate={shake ? { x: [-8, 8, -5, 5, 0] } : { x: 0 }} transition={{ duration: 0.35 }}>
              <input
                id="owner-pin"
                autoFocus
                type="password"
                inputMode="numeric"
                autoComplete="off"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                placeholder="PIN"
                className="card-flat w-full px-4 py-3 text-lg tracking-[0.3em] outline-none focus:shadow-hard"
              />
            </motion.div>
            {error && <p className="mt-2 text-sm font-semibold text-danger">{error}</p>}
            <button className="btn btn-primary mt-3 w-full" disabled={claim.isPending || !pin}>
              {claim.isPending ? "Checking…" : "Take the keys"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

function PoolSettings() {
  const overview = useCommissionerOverview(true);
  const rename = useRenamePool();
  const toast = useToast();
  const [name, setName] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  if (overview.isPending) return <Spinner />;
  if (overview.error) return <ErrorState message={overview.error.message} onRetry={() => overview.refetch()} />;
  const pool = overview.data.pool;
  const draft = name ?? pool.name;

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (draft.trim() === pool.name) return;
    try {
      await rename.mutateAsync(draft.trim());
      toast(`This pool is called ${draft.trim()} now — on the board, the share card and everyone's home screen.`, "success");
      setName(null);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Couldn't rename", "error");
    }
  };

  const copyInvite = async () => {
    const link = poolUrl("/welcome");
    try {
      await navigator.clipboard.writeText(link);
      toast("Invite link copied. Anyone who opens it can put their name in.", "success");
    } catch {
      window.prompt("Invite link", link);
    }
  };

  const exportCsv = async () => {
    setExporting(true);
    try {
      const res = await fetch("/api/commissioner/export.csv", { headers: authHeaders() });
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

  return (
    <div className="grid items-start gap-3 lg:grid-cols-2">
      <div className="card-flat bg-white p-4">
        <h3 className="font-display font-extrabold">Pool name</h3>
        <p className="mb-2 text-sm text-ink-2">What everyone sees on the board, in a shared link and on a home screen.</p>
        <form className="flex flex-wrap gap-2" onSubmit={save}>
          <input
            value={draft}
            maxLength={40}
            onChange={(e) => setName(e.target.value)}
            aria-label="Pool name"
            className="card-flat min-w-0 flex-1 px-3 py-2 outline-none focus:shadow-hard"
          />
          <button className="btn btn-sm btn-primary" disabled={rename.isPending || draft.trim() === pool.name || draft.trim().length < 2}>
            {rename.isPending ? "Saving…" : "Save"}
          </button>
        </form>
        <p className="mt-2 text-xs text-ink-3">
          /p/{pool.slug} · {pool.type} · season {pool.season}
        </p>
      </div>

      <div className="card-flat bg-white p-4">
        <h3 className="font-display font-extrabold">Who's in</h3>
        <p className="text-sm text-ink-2">
          {overview.data.playerCount} {overview.data.playerCount === 1 ? "entry" : "entries"} ·{" "}
          {overview.data.readyCount} squared away ·{" "}
          {overview.data.unclaimedCount === 0 ? "everyone has a device" : `${overview.data.unclaimedCount} not on a phone yet`}
        </p>
        <button className="btn btn-sm mt-3" onClick={copyInvite}>
          Copy invite link
        </button>
      </div>

      <Commissioners
        holders={overview.data.commissioners}
        onChanged={() => void overview.refetch()}
      />

      <div className="card-flat bg-white p-4">
        <h3 className="font-display font-extrabold">Backup</h3>
        <p className="mb-3 text-sm text-ink-2">
          Every pick with its game, result and points, as a spreadsheet. Grab one whenever you like; it settles arguments.
        </p>
        <button className="btn btn-sm" disabled={exporting} onClick={exportCsv}>
          {exporting ? "Preparing…" : "Download picks CSV"}
        </button>
      </div>
    </div>
  );
}

/**
 * Sharing the office, or handing it over. A co-commissioner gets the roster and the settings —
 * never the results, which are not this pool's to set in the first place.
 */
function Commissioners({ holders, onChanged }: { holders: RoleHolder[]; onChanged: () => void }) {
  const boot = useBootstrap();
  const grant = useCommissionerGrant();
  const toast = useToast();
  const [pick, setPick] = useState("");
  const held = new Set(holders.map((c) => c.id));
  const candidates = (boot.data?.players ?? []).filter((p) => !held.has(p.id));

  const act = async (playerId: string, action: "add" | "remove", name: string) => {
    try {
      await grant.mutateAsync({ playerId, action } as Parameters<typeof grant.mutateAsync>[0]);
      toast(action === "add" ? `${name} can run this pool now.` : `${name} no longer runs this pool.`, "success");
      setPick("");
      onChanged();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Couldn't save", "error");
    }
  };

  return (
    <div className="card-flat bg-white p-4">
      <h3 className="font-display font-extrabold">Commissioners</h3>
      <ul className="mb-3 text-sm text-ink-2">
        {holders.map((c) => (
          <li key={c.id} className="flex items-center gap-2">
            <span className="font-display font-extrabold text-ink">{c.name}</span>
            {holders.length > 1 && (
              <button className="btn btn-sm ml-auto" disabled={grant.isPending} onClick={() => void act(c.id, "remove", c.name)}>
                Remove
              </button>
            )}
          </li>
        ))}
        {holders.length === 0 && <li>Nobody yet — the owner PIN hands out the first set of keys.</li>}
      </ul>
      {candidates.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <label className="sr-only" htmlFor="co-commissioner">
            Add a co-commissioner
          </label>
          <select
            id="co-commissioner"
            className="card-flat min-w-0 flex-1 px-3 py-2 outline-none focus:shadow-hard"
            value={pick}
            onChange={(e) => setPick(e.target.value)}
          >
            <option value="">Add a co-commissioner…</option>
            {candidates.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <button
            className="btn btn-sm btn-primary"
            disabled={!pick || grant.isPending}
            onClick={() => void act(pick, "add", candidates.find((p) => p.id === pick)?.name ?? "They")}
          >
            {grant.isPending ? "Adding…" : "Add"}
          </button>
        </div>
      )}
      <p className="mt-2 text-xs text-ink-3">
        They share the roster and the settings, never the results. It has to be an account rather than an entry
        someone manages.
      </p>
    </div>
  );
}

type ReadyFilter = "all" | "ready" | "waiting";

function Players() {
  const data = useCommissionerPlayers(true);
  const mut = useCommissionerPlayerMutation();
  const reset = useResetAccess();
  const setReady = useSetReady();
  const [filter, setFilter] = useState<ReadyFilter>("all");
  const toast = useToast();
  if (data.isPending) return <Spinner />;
  if (data.error) return <ErrorState message={data.error.message} onRetry={() => data.refetch()} />;
  /** Signs someone in on the device they open it with — for a new domain, or a lost code. */
  const copySignIn = async (id: string, code: string, name: string) => {
    const link = `${poolUrl("/welcome")}?claim=${id}&code=${code}`;
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
  const toggleReady = async (id: string, name: string, ready: boolean) => {
    try {
      await setReady.mutateAsync({ id, ready });
      toast(ready ? `${name} is ready to go` : `${name} moved back to waiting`, ready ? "success" : undefined);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Couldn't save", "error");
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
  const all = data.data.players;
  const readyCount = all.filter((p) => p.ready).length;
  const shown = filter === "all" ? all : all.filter((p) => (filter === "ready" ? p.ready : !p.ready));

  return (
    <div>
      <div className="mb-3 sm:max-w-[460px]">
        <Segmented
          value={filter}
          label="Filter players"
          pillId="commissioner-ready"
          options={[
            { value: "all", label: `All ${all.length}` },
            { value: "ready", label: `Ready ${readyCount}` },
            { value: "waiting", label: `Waiting ${all.length - readyCount}` },
          ]}
          onChange={setFilter}
        />
      </div>
      <p className="mb-3 text-sm text-ink-2">
        {readyCount} of {all.length} ready to go · tap the circle to mark someone off.
      </p>
      <ul className="grid gap-2 lg:grid-cols-2">
        {all.length === 0 && <p className="text-sm text-ink-2">No players yet.</p>}
        {shown.length === 0 && all.length > 0 && (
          <p className="text-sm text-ink-2">{filter === "ready" ? "Nobody marked ready yet." : "Everyone is ready."}</p>
        )}
        {shown.map((p) => (
          <li key={p.id} className={`card-flat p-3 ${p.ready ? "bg-turf-soft" : "bg-white"}`}>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <button
                role="switch"
                aria-checked={p.ready}
                aria-label={`${p.name} ready to go`}
                disabled={setReady.isPending}
                onClick={() => void toggleReady(p.id, p.name, !p.ready)}
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 border-ink transition-colors ${
                  p.ready ? "bg-turf text-white" : "bg-white text-transparent hover:text-ink-3"
                }`}
              >
                <Check />
              </button>
              <div className="min-w-0 flex-1 basis-[55%]">
                <div className="font-display truncate font-extrabold">{p.name}</div>
                <div className="truncate text-xs text-ink-2">
                  {p.picksCount} picks · {p.weeksPlayed} wk{p.weeksPlayed === 1 ? "" : "s"} · last seen {formatShortDay(p.lastSeenAt)}
                </div>
              </div>
              {/* Wraps to its own line on a phone rather than crushing the name. */}
              <div className="ml-auto flex gap-2">
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
                    if (window.confirm(`Remove ${p.name}, their picks, and any entries managed by their account?`)) void act({ id: p.id, action: "delete" });
                  }}
                >
                  Remove
                </button>
              </div>
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
    </div>
  );
}
