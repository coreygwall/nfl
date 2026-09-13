import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { AnimatePresence, motion } from "motion/react";
import { useBootstrap, useClaimPlayer, useCreatePlayer } from "../api/queries.ts";
import { ApiClientError } from "../api/client.ts";
import { usePlayer } from "../lib/player.tsx";
import type { Identity } from "../lib/identity.ts";
import { nameKey, validateName } from "../../shared/names.ts";
import { isVulgar, VULGAR_MESSAGE } from "../../shared/profanity.ts";
import { CODE_LENGTH, formatCode, normalizeCode } from "../../shared/codes.ts";
import type { Player } from "../../shared/types.ts";
import type { RosterPlayer } from "../../shared/api.ts";
import type { Abbr } from "../../shared/teams.ts";
import { ErrorState, Spinner } from "../components/Common.tsx";
import { TeamSticker } from "../components/TeamSticker.tsx";
import { useToast } from "../components/Toast.tsx";
import { addPasskey, dismissOffer, offerDismissed, passkeysSupported, platformBiometricsSupported, signInWithPasskey, wasCancelled } from "../lib/passkey.ts";

/** Every team, in a fixed shuffle so the strip reads as a jumble rather than a division list. */
const MARQUEE_TEAMS: Abbr[] = [
  "SEA", "KC", "DET", "PHI", "BUF", "SF", "DAL", "GB", "BAL", "MIA", "NYJ", "CIN", "LAC", "MIN", "PIT", "HOU",
  "NE", "TB", "CHI", "LV", "DEN", "ARI", "CLE", "NO", "JAX", "TEN", "ATL", "IND", "CAR", "WAS", "NYG", "LA",
];

type Mode = "new" | "roster" | "taken" | "differentiate" | "code";

export function Welcome() {
  const boot = useBootstrap();
  const { player, setPlayer } = usePlayer();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const next = params.get("next") || "/";
  const claimId = params.get("claim");
  const toast = useToast();
  const create = useCreatePlayer();
  const claim = useClaimPlayer();
  const [mode, setMode] = useState<Mode>("new");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  /** The roster entry we are claiming, or that a typed name collided with. */
  const [target, setTarget] = useState<Player | null>(null);
  const [shake, setShake] = useState(0);
  const [biometricOffer, setBiometricOffer] = useState<Identity | null>(null);

  const players = boot.data?.players ?? [];
  const taken = useMemo(() => new Map(players.map((p) => [nameKey(p.name), p])), [players]);
  /** The roster entry this typed name would collide with, if any. */
  const collision = name.trim().length >= 2 ? (taken.get(nameKey(name)) ?? null) : null;

  // Arriving from "switch player" or a signed-out device: go straight to the code. A link that
  // carries the code too (the commissioner's sign-in link, or moving to a new address) just works.
  const linkCode = params.get("code");
  const [linkTried, setLinkTried] = useState(false);
  useEffect(() => {
    if (!claimId || !boot.data) return;
    const found = players.find((p) => p.id === claimId);
    if (found) {
      setTarget(found);
      setMode("code");
    }
    if (!found || !linkCode || linkTried) return;
    setLinkTried(true);
    claim
      .mutateAsync({ id: found.id, code: normalizeCode(linkCode) })
      .then((r) => {
        // Don't leave the code sitting in the address bar or the back stack.
        window.history.replaceState(null, "", "/welcome");
        go({ ...r.player, token: r.token }, true);
      })
      .catch(() => {
        window.history.replaceState(null, "", `/welcome?claim=${found.id}`);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [claimId, linkCode, linkTried, boot.data]);

  useEffect(() => {
    if (mode === "roster" && boot.data && players.length === 0) setMode("new");
  }, [mode, boot.data, players.length]);

  const go = (p: Identity, returning = false) => {
    setPlayer(p);
    if (returning) toast(`Picking as ${p.name}. Not you? Use the name chip up top to switch.`);
    nav(next, { replace: true });
  };

  const welcomeNewPlayer = async (p: Identity) => {
    setPlayer(p);
    toast(`Welcome to the pool, ${p.name}!`, "success");
    if (!offerDismissed(p.id) && await platformBiometricsSupported()) {
      setBiometricOffer(p);
      return;
    }
    nav(next, { replace: true });
  };

  /** Tapping a name on the roster: unclaimed names come free, claimed ones want the code. */
  const tapRoster = async (p: RosterPlayer) => {
    setError(null);
    setTarget(p);
    if (!p.claimed) {
      try {
        const r = await claim.mutateAsync({ id: p.id });
        go({ ...r.player, token: r.token }, true);
        return;
      } catch {
        /* Someone claimed it between the roster loading and this tap: fall through to the code. */
      }
    }
    setMode("code");
  };

  const submitName = async (e: FormEvent) => {
    e.preventDefault();
    const check = validateName(name);
    if (!check.ok) {
      setError(check.message);
      setShake((s) => s + 1);
      return;
    }
    // The server refuses these too; catching it here saves a round trip and the same words.
    if (isVulgar(check.name)) {
      setError(VULGAR_MESSAGE);
      setShake((s) => s + 1);
      return;
    }
    // Caught before the round trip: this name is already on the roster.
    if (collision) {
      setTarget(collision);
      setMode("taken");
      setError(null);
      return;
    }
    setError(null);
    try {
      const res = await create.mutateAsync(check.name);
      if (res.created && res.token) {
        await welcomeNewPlayer({ ...res.player, token: res.token });
      } else {
        // Someone claimed it between our roster load and this submit.
        setTarget(res.player);
        setMode("taken");
      }
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Something went wrong.");
      setShake((s) => s + 1);
    }
  };

  return (
    <>
    <div className="mx-auto w-full max-w-[560px] lg:max-w-[1060px]">
      <TeamMarquee />
      <div className="lg:grid lg:min-h-[calc(100dvh-420px)] lg:grid-cols-[minmax(0,1fr)_400px] lg:items-center lg:gap-12">
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
              {player?.token && (
                <div className="card-flat mb-4 flex flex-wrap items-center gap-2 bg-flag-soft px-3 py-2">
                  <span className="text-sm">
                    This device picks as <b>{player.name}</b>
                  </span>
                  <button className="btn btn-sm ml-auto shrink-0" onClick={() => nav(next, { replace: true })}>
                    Continue
                  </button>
                </div>
              )}
              <PasskeySignIn onSignedIn={(p) => go(p, true)} />
              <AnimatePresence mode="wait" initial={false}>
                {mode === "code" && target && linkCode && !linkTried ? (
                  <Panel key="link">
                    <Spinner label={`Signing you in as ${target.name}…`} />
                  </Panel>
                ) : mode === "code" && target ? (
                  <Panel key="code">
                    <CodeForm
                      player={target}
                      pending={claim.isPending}
                      onSubmit={async (code) => {
                        const r = await claim.mutateAsync({ id: target.id, code });
                        go({ ...r.player, token: r.token }, true);
                      }}
                      onBack={() => {
                        setMode(players.length > 0 ? "roster" : "new");
                        setTarget(null);
                      }}
                    />
                  </Panel>
                ) : mode === "taken" && target ? (
                  <Panel key="taken">
                    <h2 className="font-display text-xl font-extrabold leading-tight">“{target.name}” is already in the pool</h2>
                    <p className="mb-4 mt-1 text-sm text-ink-2">
                      If that's you picking from another device, your code will bring your picks and points with you.
                    </p>
                    <div className="flex flex-col gap-2">
                      <button className="btn btn-turf w-full" onClick={() => setMode("code")}>
                        That's me — I have a code
                      </button>
                      <button
                        className="btn w-full"
                        onClick={() => {
                          setMode("differentiate");
                          setName(`${target.name} `);
                          setError(null);
                        }}
                      >
                        I'm a different {target.name}
                      </button>
                    </div>
                    <button
                      className="mt-4 text-sm font-bold text-ink-2 underline"
                      onClick={() => {
                        setTarget(null);
                        setName("");
                        setMode("new");
                      }}
                    >
                      Start over
                    </button>
                  </Panel>
                ) : mode === "differentiate" && target ? (
                  <Panel key="differentiate">
                    <form onSubmit={submitName}>
                      <h2 className="font-display text-xl font-extrabold leading-tight">Make it yours</h2>
                      <p className="mb-3 mt-1 text-sm text-ink-2">
                        Two {target.name}s would be chaos on the board. Add a last initial or a nickname.
                      </p>
                      <NameInput
                        autoFocus
                        value={name}
                        onChange={(v) => {
                          setName(v);
                          setError(null);
                        }}
                        shake={shake}
                        placeholder={`${target.name} W.`}
                      />
                      <p className="mt-2 text-sm font-semibold">
                        {error ? (
                          <span className="text-danger">{error}</span>
                        ) : collision ? (
                          <span className="text-danger">Still “{collision.name}” — change it a little more.</span>
                        ) : name.trim().length >= 2 ? (
                          <span className="text-turf">Nice — “{name.trim()}” is free.</span>
                        ) : (
                          <span className="text-ink-3">e.g. {target.name} W. · Big {target.name}</span>
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
                          setMode("taken");
                          setName(target.name);
                        }}
                      >
                        Actually, that other {target.name} is me
                      </button>
                    </form>
                  </Panel>
                ) : mode === "roster" ? (
                  <Panel key="roster">
                    <h2 className="font-display text-xl font-extrabold">Tap your name</h2>
                    <p className="mb-3 text-sm text-ink-2">We'll ask for your code, then remember you on this device.</p>
                    <div className="flex flex-wrap gap-2">
                      {players.map((p, i) => (
                        <motion.button
                          key={p.id}
                          className="chip px-3.5 py-2 text-[15px]"
                          initial={{ opacity: 0, scale: 0.8, y: 8 }}
                          animate={{ opacity: 1, scale: 1, y: 0 }}
                          transition={{ type: "spring", stiffness: 500, damping: 26, delay: Math.min(i * 0.03, 0.4) }}
                          whileTap={{ scale: 0.94 }}
                          onClick={() => void tapRoster(p)}
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
                    <form onSubmit={submitName}>
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
                          <button
                            type="button"
                            className="font-bold text-ink underline"
                            onClick={() => {
                              setTarget(collision);
                              setMode("code");
                            }}
                          >
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
    <AnimatePresence>
      {biometricOffer && (
        <BiometricOffer
          player={biometricOffer}
          onDone={() => {
            dismissOffer(biometricOffer.id);
            setBiometricOffer(null);
            nav(next, { replace: true });
          }}
        />
      )}
    </AnimatePresence>
    </>
  );
}

/** A plain-language, one-time offer immediately after a successful signup. */
function BiometricOffer({ player, onDone }: { player: Identity; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();

  const turnOn = async () => {
    setBusy(true);
    setError(null);
    try {
      await addPasskey();
      toast("Face ID or fingerprint is ready on your account.", "success");
      onDone();
    } catch (err) {
      if (!wasCancelled(err)) setError(err instanceof Error ? err.message : "Couldn't set that up right now.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink/45 p-0 sm:items-center sm:p-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onDone}
      onKeyDown={(event) => { if (event.key === "Escape") onDone(); }}
    >
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-labelledby="biometric-offer-title"
        className="card w-full max-w-[460px] rounded-b-none p-6 pb-[max(env(safe-area-inset-bottom),24px)] sm:rounded-b-card"
        initial={{ y: 56, scale: 0.98 }}
        animate={{ y: 0, scale: 1 }}
        exit={{ y: 56, opacity: 0 }}
        transition={{ type: "spring", stiffness: 400, damping: 32 }}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl border-2 border-ink bg-flag text-2xl font-black" aria-hidden="true">✓</div>
        <h2 id="biometric-offer-title" className="font-display text-2xl font-extrabold">You’re all set</h2>
        <p className="mt-1 text-sm leading-relaxed text-ink-2">
          We’ll remember <b className="text-ink">{player.name}</b> on this device, so you won’t need to sign in again here.
        </p>
        <div className="card-flat mt-5 bg-flag-soft p-4">
          <h3 className="font-display font-extrabold">Want to use another device?</h3>
          <p className="mt-1 text-sm leading-relaxed text-ink-2">
            Set up Face ID or fingerprint now to open your account on a new phone, tablet, or computer without a code.
          </p>
        </div>
        {error && <p role="alert" className="mt-3 text-sm font-semibold text-danger">{error}</p>}
        <button autoFocus className="btn btn-turf mt-5 min-h-12 w-full" disabled={busy} onClick={() => void turnOn()}>
          {busy ? "Waiting for you…" : "Set up Face ID or fingerprint"}
        </button>
        <button className="btn mt-2 min-h-12 w-full" disabled={busy} onClick={onDone}>
          Not now — start picking
        </button>
        <p className="mt-3 text-center text-xs text-ink-3">You can always turn this on later from your account.</p>
      </motion.div>
    </motion.div>
  );
}

/** Offered above the name form: a passkey knows who you are, so there is nothing to type. */
function PasskeySignIn({ onSignedIn }: { onSignedIn: (p: Identity) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!passkeysSupported()) return null;
  const go = async () => {
    setBusy(true);
    setError(null);
    try {
      onSignedIn(await signInWithPasskey());
    } catch (err) {
      // Cancelling the sheet is not a failure, and neither is having no passkey yet.
      if (!wasCancelled(err)) setError("No passkey for this device yet — use your name below.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="mb-4 border-b-2 border-dashed border-line pb-4">
      <button className="btn btn-sm w-full" disabled={busy} onClick={() => void go()}>
        {busy ? "Waiting…" : "Sign in with Face ID or fingerprint"}
      </button>
      {error && <p className="mt-2 text-xs text-ink-2">{error}</p>}
    </div>
  );
}

function CodeForm({
  player,
  pending,
  onSubmit,
  onBack,
}: {
  player: Player;
  pending: boolean;
  onSubmit: (code: string) => Promise<void>;
  onBack: () => void;
}) {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [shake, setShake] = useState(0);
  const ready = normalizeCode(code).length === CODE_LENGTH;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!ready) return;
    setError(null);
    try {
      await onSubmit(normalizeCode(code));
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Couldn't check that code.");
      setShake((s) => s + 1);
    }
  };

  return (
    <form onSubmit={submit}>
      <h2 className="font-display text-xl font-extrabold leading-tight">Prove you're {player.name}</h2>
      <p className="mb-3 mt-1 text-sm text-ink-2">
        Open the pool on the device you already use and tap your name up top — your code is there.
      </p>
      <motion.div key={shake} animate={shake ? { x: [-8, 8, -5, 5, 0] } : { x: 0 }} transition={{ duration: 0.35 }}>
        <input
          autoFocus
          value={code}
          onChange={(e) => {
            setCode(formatCode(e.target.value));
            setError(null);
          }}
          placeholder="QRT4-9MKP"
          inputMode="text"
          autoCapitalize="characters"
          autoComplete="one-time-code"
          spellCheck={false}
          aria-label="Your device code"
          className="card-flat w-full px-4 py-3 text-center font-display text-2xl font-extrabold tracking-[0.15em] outline-none focus:shadow-hard"
        />
      </motion.div>
      {error && <p className="mt-2 text-sm font-semibold text-danger">{error}</p>}
      <button className="btn btn-turf mt-4 w-full" type="submit" disabled={pending || !ready}>
        {pending ? "Checking…" : `Pick as ${player.name}`}
      </button>
      <p className="mt-4 border-t-2 border-dashed border-line pt-4 text-sm text-ink-2">
        Lost it? The commissioner can issue a new one.{" "}
        <button type="button" className="font-bold text-ink underline" onClick={onBack}>
          Go back
        </button>
      </p>
    </form>
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

/** All 32 logos drifting past; hover or touch to hold one still. Decorative, so it is aria-hidden. */
function TeamMarquee() {
  const strip = [...MARQUEE_TEAMS, ...MARQUEE_TEAMS];
  return (
    <div
      className="marquee mb-6 overflow-hidden"

      style={{
        marginInline: "calc(50% - 50vw)",
        maskImage: "linear-gradient(90deg, transparent, #000 6%, #000 94%, transparent)",
        WebkitMaskImage: "linear-gradient(90deg, transparent, #000 6%, #000 94%, transparent)",
      }}
      aria-hidden
    >
      <div className="marquee-track flex w-max items-end gap-3 sm:gap-5">
        {strip.map((abbr, i) => (
          <TeamSticker key={`${abbr}-${i}`} abbr={abbr} size={56} className={i % 3 === 1 ? "mb-3" : i % 3 === 2 ? "mb-1" : ""} />
        ))}
      </div>
    </div>
  );
}

function Hero() {
  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 300, damping: 26 }}
      className="mb-6 lg:mb-0"
    >
      <span className="chip bg-flag">2026 season</span>
      <h1 className="font-display mt-3 text-[2.6rem] font-extrabold leading-[0.95] tracking-tight lg:text-[3.5rem]">
        Pick five.
        <br />
        Rank them.
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
