import { useEffect, useState, type FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { AnimatePresence, motion } from "motion/react";
import { useBootstrap, useCreatePlayer } from "../api/queries.ts";
import { ApiClientError } from "../api/client.ts";
import { usePlayer } from "../lib/player.tsx";
import { validateName } from "../../shared/names.ts";
import type { Player } from "../../shared/types.ts";
import { ErrorState, Spinner } from "../components/Common.tsx";
import { TeamSticker } from "../components/TeamSticker.tsx";
import { useToast } from "../components/Toast.tsx";

export function Welcome() {
  const boot = useBootstrap();
  const { setPlayer } = usePlayer();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const next = params.get("next") || "/";
  const toast = useToast();
  const create = useCreatePlayer();
  const [mode, setMode] = useState<"roster" | "new">(params.get("new") ? "new" : "roster");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [claim, setClaim] = useState<Player | null>(null);
  const [shake, setShake] = useState(0);

  const players = boot.data?.players ?? [];
  useEffect(() => {
    if (boot.data && players.length === 0) setMode("new");
  }, [boot.data, players.length]);

  const go = (p: Player) => {
    setPlayer(p);
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
    setError(null);
    try {
      const res = await create.mutateAsync(check.name);
      if (res.created) {
        toast(`Welcome to the pool, ${res.player.name}!`, "success");
        go(res.player);
      } else {
        setClaim(res.player);
      }
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Something went wrong.");
      setShake((s) => s + 1);
    }
  };

  return (
    <div className="mx-auto max-w-[560px]">
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 300, damping: 26 }}
        className="relative mb-6 overflow-hidden"
      >
        <div className="absolute -right-6 -top-4 flex gap-1 opacity-90">
          <TeamSticker abbr="SEA" size={64} />
          <TeamSticker abbr="KC" size={64} className="mt-6" />
          <TeamSticker abbr="DET" size={64} className="-mt-2" />
        </div>
        <span className="chip bg-flag">2026 season</span>
        <h1 className="font-display mt-3 text-[2.6rem] font-extrabold leading-[0.95] tracking-tight">
          Pick five.
          <br />
          Rank them.
          <br />
          Talk trash.
        </h1>
        <p className="mt-3 max-w-[38ch] text-[15px] leading-snug text-ink-2">
          Every week, pick the winner of five games and rank them 1 to 5. Nail your #1 for 5 points, your #5 for 1. Most points
          over the season wins.
        </p>
      </motion.section>

      {boot.isPending ? (
        <Spinner label="Getting the roster…" />
      ) : boot.error ? (
        <ErrorState message={boot.error.message} onRetry={() => boot.refetch()} />
      ) : (
        <div className="card p-5">
          <AnimatePresence mode="wait" initial={false}>
            {mode === "roster" && !claim ? (
              <motion.div key="roster" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
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
                      onClick={() => go(p)}
                    >
                      {p.name}
                    </motion.button>
                  ))}
                </div>
                <div className="mt-5 flex items-center gap-3 border-t-2 border-dashed border-line pt-4">
                  <span className="text-sm text-ink-2">New here?</span>
                  <button className="btn btn-sm btn-primary" onClick={() => setMode("new")}>
                    Add my name
                  </button>
                </div>
              </motion.div>
            ) : claim ? (
              <motion.div key="claim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <h2 className="font-display text-xl font-extrabold">Someone's already picking as “{claim.name}”</h2>
                <p className="mb-4 text-sm text-ink-2">Is that you on another device?</p>
                <div className="flex flex-wrap gap-2">
                  <button className="btn btn-primary" onClick={() => go(claim)}>
                    Yep, that's me
                  </button>
                  <button
                    className="btn"
                    onClick={() => {
                      setClaim(null);
                      setName("");
                    }}
                  >
                    No, try another name
                  </button>
                </div>
              </motion.div>
            ) : (
              <motion.form key="new" onSubmit={submit} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <h2 className="font-display text-xl font-extrabold">What should we call you?</h2>
                <p className="mb-3 text-sm text-ink-2">This is how you'll show up on the board.</p>
                <motion.div key={shake} animate={shake ? { x: [-8, 8, -5, 5, 0] } : { x: 0 }} transition={{ duration: 0.35 }}>
                  <input
                    autoFocus
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Your name"
                    maxLength={24}
                    autoComplete="name"
                    aria-label="Your name"
                    className="card-flat w-full px-4 py-3 text-lg outline-none focus:shadow-hard"
                  />
                </motion.div>
                {error && <p className="mt-2 text-sm font-semibold text-danger">{error}</p>}
                <div className="mt-4 flex flex-wrap gap-2">
                  <button className="btn btn-turf" type="submit" disabled={create.isPending || name.trim().length < 2}>
                    {create.isPending ? "One sec…" : "Let's go"}
                  </button>
                  {players.length > 0 && (
                    <button className="btn" type="button" onClick={() => setMode("roster")}>
                      I'm already in
                    </button>
                  )}
                </div>
              </motion.form>
            )}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
