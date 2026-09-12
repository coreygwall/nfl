import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { AnimatePresence, motion } from "motion/react";
import { useBootstrap, useCreatePlayer } from "../api/queries.ts";
import { ApiClientError } from "../api/client.ts";
import { usePlayer } from "../lib/player.tsx";
import { nameKey, validateName } from "../../shared/names.ts";
import type { Player } from "../../shared/types.ts";
import type { Abbr } from "../../shared/teams.ts";
import { ErrorState, Spinner } from "../components/Common.tsx";
import { TeamSticker } from "../components/TeamSticker.tsx";
import { useToast } from "../components/Toast.tsx";

const HERO_STICKERS: Abbr[] = ["SEA", "KC", "DET", "PHI", "BUF", "SF"];

type Mode = "new" | "roster" | "claim" | "differentiate";

export function Welcome() {
  const boot = useBootstrap();
  const { player, setPlayer } = usePlayer();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const next = params.get("next") || "/";
  const toast = useToast();
  const create = useCreatePlayer();
  const [mode, setMode] = useState<Mode>("new");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [claim, setClaim] = useState<Player | null>(null);
  const [shake, setShake] = useState(0);

  const players = boot.data?.players ?? [];
  const taken = useMemo(() => new Map(players.map((p) => [nameKey(p.name), p])), [players]);
  /** The roster entry this typed name would collide with, if any. */
  const collision = name.trim().length >= 2 ? (taken.get(nameKey(name)) ?? null) : null;

  useEffect(() => {
    if (mode === "roster" && boot.data && players.length === 0) setMode("new");
  }, [mode, boot.data, players.length]);

  const go = (p: Player, returning = false) => {
    setPlayer(p);
    if (returning) toast(`Picking as ${p.name}. Not you? Use the name chip up top to switch.`);
    nav(next, { replace: true });
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const check = validateName(name);
    if (!check.ok) {
      setError(check.message);
      setShake((s) => s + 1);
      return;
    }
    // Caught before the round trip: this name is already on the roster.
    if (collision) {
      setClaim(collision);
      setMode("claim");
      setError(null);
      return;
    }
    setError(null);
    try {
      const res = await create.mutateAsync(check.name);
      if (res.created) {
        toast(`Welcome to the pool, ${res.player.name}!`, "success");
        go(res.player);
      } else {
        // Someone claimed it between our roster load and this submit.
        setClaim(res.player);
        setMode("claim");
      }
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Something went wrong.");
      setShake((s) => s + 1);
    }
  };

  return (
    <div className="mx-auto w-full max-w-[560px] lg:max-w-[1060px]">
      <div className="lg:grid lg:min-h-[calc(100dvh-190px)] lg:grid-cols-[minmax(0,1fr)_400px] lg:items-center lg:gap-12">
        <Hero />
        <div>
          {boot.isPending ? (
            <div className="card p-5">
              <Spinner label="Getting the roster…" />
            </div>
          ) : boot.error ? (
            <ErrorState message={boot.error.message} onRetry={() => boot.refetch()} />
          ) : (
            <div className="card p-5">
              {player && (
                <div className="card-flat mb-4 flex flex-wrap items-center gap-2 bg-flag-soft px-3 py-2">
                  <span className="text-sm">
                    This device picks as <b>{player.name}</b>
                  </span>
                  <button className="btn btn-sm ml-auto shrink-0" onClick={() => nav(next, { replace: true })}>
                    Continue
                  </button>
                </div>
              )}
              <AnimatePresence mode="wait" initial={false}>
                {mode === "claim" && claim ? (
                  <Panel key="claim">
                    <h2 className="font-display text-xl font-extrabold leading-tight">
                      “{claim.name}” is already in the pool
                    </h2>
                    <p className="mb-4 mt-1 text-sm text-ink-2">
                      If that's you picking from another device, keep going as yourself — your picks and points come with you.
                    </p>
                    <div className="flex flex-col gap-2">
                      <button className="btn btn-turf w-full" onClick={() => go(claim, true)}>
                        That's me — continue as {claim.name}
                      </button>
                      <button
                        className="btn w-full"
                        onClick={() => {
                          setMode("differentiate");
                          setName(`${claim.name} `);
                          setError(null);
                        }}
                      >
                        I'm a different {claim.name}
                      </button>
                    </div>
                    <button
                      className="mt-4 text-sm font-bold text-ink-2 underline"
                      onClick={() => {
                        setClaim(null);
                        setName("");
                        setMode("new");
                      }}
                    >
                      Start over
                    </button>
                  </Panel>
                ) : mode === "differentiate" && claim ? (
                  <Panel key="differentiate">
                    <form onSubmit={submit}>
                      <h2 className="font-display text-xl font-extrabold leading-tight">Make it yours</h2>
                      <p className="mb-3 mt-1 text-sm text-ink-2">
                        Two {claim.name}s would be chaos on the board. Add a last initial or a nickname.
                      </p>
                      <NameInput
                        autoFocus
                        value={name}
                        onChange={(v) => {
                          setName(v);
                          setError(null);
                        }}
                        shake={shake}
                        placeholder={`${claim.name} W.`}
                      />
                      <p className="mt-2 text-sm font-semibold">
                        {error ? (
                          <span className="text-danger">{error}</span>
                        ) : collision ? (
                          <span className="text-danger">Still “{collision.name}” — change it a little more.</span>
                        ) : name.trim().length >= 2 ? (
                          <span className="text-turf">Nice — “{name.trim()}” is free.</span>
                        ) : (
                          <span className="text-ink-3">e.g. {claim.name} W. · Big {claim.name}</span>
                        )}
                      </p>
                      <button
                        className="btn btn-turf mt-4 w-full"
                        type="submit"
                        disabled={create.isPending || !!collision || name.trim().length < 2}
                      >
                        {create.isPending ? "One sec…" : "Join as this name"}
                      </button>
                      <button
                        type="button"
                        className="mt-3 text-sm font-bold text-ink-2 underline"
                        onClick={() => {
                          setMode("claim");
                          setName(claim.name);
                        }}
                      >
                        Actually, that other {claim.name} is me
                      </button>
                    </form>
                  </Panel>
                ) : mode === "roster" ? (
                  <Panel key="roster">
                    <h2 className="font-display text-xl font-extrabold">Tap your name</h2>
                    <p className="mb-3 text-sm text-ink-2">We'll remember you on this device.</p>
                    <div className="flex flex-wrap gap-2">
                      {players.map((p, i) => (
                        <motion.button
                          key={p.id}
                          className="chip px-3.5 py-2 text-[15px]"
                          initial={{ opacity: 0, scale: 0.8, y: 8 }}
                          animate={{ opacity: 1, scale: 1, y: 0 }}
                          transition={{ type: "spring", stiffness: 500, damping: 26, delay: Math.min(i * 0.03, 0.4) }}
                          whileTap={{ scale: 0.94 }}
                          onClick={() => go(p, true)}
                        >
                          {p.name}
                        </motion.button>
                      ))}
                    </div>
                    <div className="mt-5 border-t-2 border-dashed border-line pt-4">
                      <button
                        className="text-sm font-bold underline"
                        onClick={() => {
                          setMode("new");
                          setName("");
                        }}
                      >
                        Don't see your name? Add it →
                      </button>
                    </div>
                  </Panel>
                ) : (
                  <Panel key="new">
                    <form onSubmit={submit}>
                      <h2 className="font-display text-xl font-extrabold">What should we call you?</h2>
                      <p className="mb-3 text-sm text-ink-2">This is how you'll show up on the board.</p>
                      <NameInput
                        value={name}
                        onChange={(v) => {
                          setName(v);
                          setError(null);
                        }}
                        shake={shake}
                        placeholder="Your name"
                        autoFocus
                      />
                      {error && <p className="mt-2 text-sm font-semibold text-danger">{error}</p>}
                      {!error && collision && (
                        <p className="mt-2 text-sm font-semibold text-ink-2">
                          Someone's already picking as “{collision.name}.”{" "}
                          <button type="button" className="font-bold text-ink underline" onClick={() => go(collision, true)}>
                            That's me →
                          </button>
                        </p>
                      )}
                      <button
                        className="btn btn-turf mt-4 w-full"
                        type="submit"
                        disabled={create.isPending || name.trim().length < 2}
                      >
                        {create.isPending ? "One sec…" : "Let's go"}
                      </button>
                    </form>
                    {players.length > 0 && (
                      <p className="mt-4 border-t-2 border-dashed border-line pt-4 text-sm text-ink-2">
                        <b className="text-ink">
                          {players.length} {players.length === 1 ? "player is" : "players are"} already in.
                        </b>{" "}
                        Joining from another device?{" "}
                        <button className="font-bold text-ink underline" onClick={() => setMode("roster")}>
                          I already entered
                        </button>
                      </p>
                    )}
                  </Panel>
                )}
              </AnimatePresence>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Panel({ children }: { children: React.ReactNode }) {
  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.16 }}>
      {children}
    </motion.div>
  );
}

const NameInput = ({
  value,
  onChange,
  shake,
  placeholder,
  autoFocus,
}: {
  value: string;
  onChange: (v: string) => void;
  shake: number;
  placeholder: string;
  autoFocus?: boolean;
}) => (
  <motion.div key={shake} animate={shake ? { x: [-8, 8, -5, 5, 0] } : { x: 0 }} transition={{ duration: 0.35 }}>
    <input
      autoFocus={autoFocus}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      maxLength={24}
      autoComplete="name"
      autoCapitalize="words"
      aria-label="Your name"
      className="card-flat w-full px-4 py-3 text-lg outline-none focus:shadow-hard"
    />
  </motion.div>
);

function Hero() {
  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 300, damping: 26 }}
      className="mb-6 lg:mb-0"
    >
      <div className="mb-4 flex origin-left items-end gap-1 sm:gap-2 lg:scale-110">
        {HERO_STICKERS.map((abbr, i) => (
          <TeamSticker key={abbr} abbr={abbr} size={58} className={`${i % 2 ? "mb-2" : ""} ${i > 3 ? "hidden sm:block" : ""}`} />
        ))}
      </div>
      <span className="chip bg-flag">2026 season</span>
      <h1 className="font-display mt-3 text-[2.6rem] font-extrabold leading-[0.95] tracking-tight lg:text-[3.5rem]">
        Pick five.
        <br />
        Rank them.
        <br />
        Talk trash.
      </h1>
      <p className="mt-3 max-w-[42ch] text-[15px] leading-snug text-ink-2 lg:text-base">
        Every week, pick the winner of five games and rank them 1 to 5. Nail your #1 for 5 points, your #5 for 1. Most points
        over the season wins.
      </p>
      <ol className="mt-5 grid grid-cols-3 gap-2 text-center lg:max-w-[420px]">
        {[
          ["Pick 5", "winners"],
          ["Rank them", "1 to 5"],
          ["Score", "5·4·3·2·1"],
        ].map(([a, b], i) => (
          <li key={a} className="card-flat bg-white px-2 py-2.5">
            <span className="font-display block text-[10px] font-extrabold uppercase tracking-wider text-ink-3">Step {i + 1}</span>
            <span className="font-display block text-[15px] font-extrabold leading-tight">{a}</span>
            <span className="block text-xs text-ink-2">{b}</span>
          </li>
        ))}
      </ol>
      <p className="mt-3 text-xs text-ink-3">
        No weekly deadline — each game locks at kickoff.{" "}
        <Link to="/rules" className="font-bold underline">
          Full rules
        </Link>
      </p>
    </motion.section>
  );
}
