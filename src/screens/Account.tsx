import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { AnimatePresence } from "motion/react";
import { useBootstrap, useRoles } from "../api/queries.ts";
import { usePlayer } from "../lib/player.tsx";
import { api } from "../api/client.ts";
import { Sheet } from "../components/AppShell.tsx";
import { PoolPlays } from "../components/PoolPlays.tsx";
import { ThemePicker } from "../components/ThemeControl.tsx";
import { Bank, Cards, Check, ChevronRight, CircleHelp, Device, Key, Palette, Pencil, Shield } from "../components/Icons.tsx";
import { useToast } from "../components/Toast.tsx";
import { addPasskey, passkeysSupported, wasCancelled } from "../lib/passkey.ts";
import { CODE_LENGTH, formatCode, normalizeCode } from "../../shared/codes.ts";
import { poolUrl } from "../lib/basename.ts";
import { isVulgar, VULGAR_MESSAGE } from "../../shared/profanity.ts";
import type { Identity } from "../lib/identity.ts";

/**
 * Your account, grouped the way Settings groups things.
 *
 * It was a sheet hanging off the name chip in the header, and that sheet was doing two jobs: *who
 * am I picking as*, which you do mid-week in two taps, and *my account*, which you visit once.
 * Splitting them sent the switcher into the page (`EntryPicker`) and left this, which then had
 * nowhere to live — so it is a tab now, on both surfaces.
 *
 * Making it a place fixed something else by accident. The commissioner's office and the league
 * office are routes this app never linked to: a commissioner on the web had to remember
 * `/commissioner` and type it. They are rows here, drawn only for an account that holds the
 * office, which is the same rule the iOS app follows.
 *
 * The order is how often each thing is touched: who you are, the entries you run, the offices, the
 * settings, the other-device link, and everything about Tally itself last.
 */
export function Account() {
  const boot = useBootstrap();
  const roles = useRoles();
  const { player, people, setPlayer, signOut } = usePlayer();
  const nav = useNavigate();
  const [showCode, setShowCode] = useState(false);
  const [adding, setAdding] = useState(false);
  const [attaching, setAttaching] = useState(false);
  const [plays, setPlays] = useState(false);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [confirmSignOut, setConfirmSignOut] = useState(false);

  const accountName = boot.data?.account?.name ?? player?.name ?? "";
  const poolName = boot.data?.poolName ?? "this pool";
  const currentWeek = boot.data?.currentWeek ?? 1;

  return (
    <div className="mx-auto w-full max-w-[640px]">
      <section aria-labelledby="account-who">
        <SectionLabel id="account-who">Signed in as</SectionLabel>
        {renaming === boot.data?.account?.id && boot.data?.account ? (
          <RenameName
            id={boot.data.account.id}
            current={accountName}
            onDone={() => setRenaming(null)}
            onCancel={() => setRenaming(null)}
          />
        ) : (
          <div className="mt-1 flex flex-wrap items-center gap-3">
            <h1 className="font-display text-3xl font-extrabold">{accountName}</h1>
            {boot.data?.account && (
              <button className="btn btn-sm" onClick={() => setRenaming(boot.data!.account!.id)}>
                Edit
              </button>
            )}
          </div>
        )}
        <PasskeyRow key={player?.accountId ?? player?.id} hasPasskey={(boot.data?.myPasskeys ?? 0) > 0} />
      </section>

      <section className="mt-7" aria-labelledby="account-entries">
        <SectionLabel id="account-entries">Entries in {poolName}</SectionLabel>
        <ul className="mt-2 space-y-2">
          {people.map((p) => (
            <li key={p.id} className="card-flat bg-surface p-3">
              {renaming === p.id && p.id !== boot.data?.account?.id ? (
                <RenameName
                  id={p.id}
                  current={p.name}
                  onDone={() => setRenaming(null)}
                  onCancel={() => setRenaming(null)}
                />
              ) : (
                <div className="flex items-center gap-2">
                  <span className="font-display truncate font-extrabold">{p.name}</span>
                  {p.managed && <span className="chip shrink-0 bg-paper-2 py-0 text-[10px]">you manage</span>}
                  {p.id === player?.id && (
                    <span className="chip ml-auto shrink-0 bg-flag py-0 text-[10px]">picking</span>
                  )}
                  <button
                    className={`${p.id === player?.id ? "" : "ml-auto "}shrink-0 rounded-lg p-1.5 text-ink-3 hover:bg-paper-2`}
                    aria-label={`Rename ${p.name}`}
                    onClick={() => setRenaming(p.id)}
                  >
                    <Pencil size={15} />
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
        {adding ? (
          <AddEntry
            player={player}
            onDone={(p) => {
              setAdding(false);
              setPlayer(p);
              nav(`/week/${currentWeek}`);
            }}
            onCancel={() => setAdding(false)}
          />
        ) : attaching ? (
          <AttachEntry
            player={player}
            onDone={(p) => {
              setAttaching(false);
              setPlayer(p);
            }}
            onCancel={() => setAttaching(false)}
          />
        ) : (
          <>
            <div className="mt-2 flex flex-wrap gap-3">
              <button className="btn btn-sm" onClick={() => setAdding(true)}>
                Add an entry
              </button>
              <button className="btn btn-sm" onClick={() => setAttaching(true)}>
                Attach an existing one
              </button>
            </div>
            <p className="mt-1.5 text-xs text-ink-2">
              Add: for your kids, a partner, a friend who won't install anything. Attach: for a name that already
              joined the pool on its own — type it and its code, and it becomes one of your entries. Either way it
              gets its own picks and its own row on the board. Switch between them above the picks.
            </p>
          </>
        )}
      </section>

      {(roles.commissioner || roles.platformAdmin) && (
        <section className="mt-7" aria-labelledby="account-offices">
          <SectionLabel id="account-offices">Run the pool</SectionLabel>
          <div className="card-flat mt-2 bg-surface">
            {roles.commissioner && (
              <RowLink
                to="/commissioner"
                icon={<Key />}
                title="Commissioner"
                detail={`${poolName}: roster, name, invite, export`}
              />
            )}
            {roles.commissioner && roles.platformAdmin && <RowDivider />}
            {roles.platformAdmin && (
              <RowLink
                to="/league"
                icon={<Bank />}
                title="League office"
                detail="Results, schedule and the score feed, for every pool on Tally"
              />
            )}
          </div>
        </section>
      )}

      <section className="mt-7" aria-labelledby="account-settings">
        <SectionLabel id="account-settings">Settings</SectionLabel>
        <div className="card-flat mt-2 bg-surface p-3">
          <div className="flex items-center gap-3">
            <span className="shrink-0 text-ink-2">
              <Palette />
            </span>
            <span className="font-display font-extrabold">Appearance</span>
          </div>
          <div className="mt-2">
            <ThemePicker />
          </div>
          <p className="mt-1.5 text-xs text-ink-2">
            Auto matches your device. Light or Dark stays selected until you change it.
          </p>
        </div>
      </section>

      <section className="mt-7" aria-labelledby="account-device">
        <SectionLabel id="account-device">Another device</SectionLabel>
        {showCode && boot.data?.myCode ? (
          <div className="mt-2">
            <DeviceCode code={boot.data.myCode} name={accountName} accountId={boot.data.account?.id ?? null} />
          </div>
        ) : (
          <div className="card-flat mt-2 bg-surface">
            <RowButton
              icon={<Device />}
              title="Sign in on another device"
              detail="A one-tap link to send yourself, and the code to type if you'd rather"
              disabled={!boot.data?.myCode}
              onClick={() => setShowCode(true)}
            />
          </div>
        )}
      </section>

      <section className="mt-7" aria-labelledby="account-about">
        <SectionLabel id="account-about">About Tally</SectionLabel>
        <div className="card-flat mt-2 bg-surface">
          <RowLink to="/rules" icon={<CircleHelp size={18} />} title="How scoring works" />
          <RowDivider />
          <RowButton
            icon={<Cards size={18} />}
            title="Join or start a pool"
            detail="And what else Tally plays"
            onClick={() => setPlays(true)}
          />
          <RowDivider />
          <RowLink to="/privacy" icon={<Shield size={18} />} title="Privacy" detail="What Tally keeps, and what it never asks for" />
          <RowDivider />
          <p className="px-3 py-3 text-xs text-ink-3">Version {__BUILD_ID__.slice(0, 8)}</p>
        </div>
        {/* A real button that asks first, the same as the app's. The word is red and the fill is
            not: a solid danger fill is this design system's word for irreversible, and signing out
            keeps every pick on the board. The reassurance moved into the asking, where somebody is
            actually deciding. */}
        {confirmSignOut ? (
          <div className="card-flat mt-3 bg-flag-soft p-4">
            <p className="font-display text-sm font-extrabold">Sign out?</p>
            <p className="mt-1 text-sm text-ink-2">
              Your picks stay on the board and nothing is deleted. Signing back in on this device needs Face ID, a
              fingerprint, or your code.
            </p>
            <div className="mt-3 flex flex-wrap gap-3">
              <button className="btn btn-sm text-danger" onClick={signOut}>
                Sign out
              </button>
              <button className="btn btn-sm" onClick={() => setConfirmSignOut(false)}>
                Stay signed in
              </button>
            </div>
          </div>
        ) : (
          <button className="btn mt-3 w-full text-danger sm:w-auto" onClick={() => setConfirmSignOut(true)}>
            Sign out
          </button>
        )}
      </section>

      <AnimatePresence>
        {plays && (
          <Sheet title="Pools" onClose={() => setPlays(false)}>
            <PoolPlays />
          </Sheet>
        )}
      </AnimatePresence>
    </div>
  );
}

function SectionLabel({ id, children }: { id?: string; children: React.ReactNode }) {
  return (
    <h2 id={id} className="font-display text-xs font-extrabold uppercase tracking-wider text-ink-3">
      {children}
    </h2>
  );
}

function RowDivider() {
  return <div className="mx-3 border-t-2 border-dashed border-line" />;
}

/** A door: a glyph, what is behind it, and a chevron. Full width, so it reads as a place. */
function RowBody({ icon, title, detail }: { icon: React.ReactNode; title: string; detail?: string }) {
  return (
    <>
      <span className="shrink-0 text-ink-2">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="font-display block font-extrabold">{title}</span>
        {detail && <span className="block text-xs text-ink-2">{detail}</span>}
      </span>
      <ChevronRight size={18} className="shrink-0 text-ink-3" />
    </>
  );
}

function RowLink({ to, icon, title, detail }: { to: string; icon: React.ReactNode; title: string; detail?: string }) {
  return (
    <Link to={to} className="row-hover flex min-h-14 items-center gap-3 rounded-card p-3 hover:bg-paper-2">
      <RowBody icon={icon} title={title} detail={detail} />
    </Link>
  );
}

function RowButton({
  icon,
  title,
  detail,
  onClick,
  disabled,
}: {
  icon: React.ReactNode;
  title: string;
  detail?: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="row-hover flex min-h-14 w-full items-center gap-3 rounded-card p-3 text-left hover:bg-paper-2 disabled:pointer-events-none disabled:opacity-50"
    >
      <RowBody icon={icon} title={title} detail={detail} />
    </button>
  );
}

/** Every signed-in account can create a named entry it owns. */
function AddEntry({
  player,
  onDone,
  onCancel,
}: {
  player: Identity | null;
  onDone: (p: Identity) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();
  const qc = useQueryClient();

  return (
    <form
      className="mt-3 border-t-2 border-dashed border-line pt-4"
      onSubmit={async (event) => {
        event.preventDefault();
        if (busy || !player) return;
        setBusy(true);
        setError(null);
        if (isVulgar(name)) {
          setError(VULGAR_MESSAGE);
          setBusy(false);
          return;
        }
        try {
          const r = await api<{ player: Identity }>("/entries", { body: { name } });
          void qc.invalidateQueries({ queryKey: ["bootstrap"] });
          toast(`${r.player.name}'s entry is ready. Let's make their picks!`, "success");
          onDone({ ...r.player, accountId: player.accountId ?? player.id, token: player.token });
        } catch (err) {
          setError(err instanceof Error ? err.message : "Couldn't add the entry.");
          setBusy(false);
        }
      }}
    >
      <h3 className="font-display text-sm font-extrabold">Add an entry</h3>
      <p className="mb-3 mt-1 text-sm text-ink-2">
        Choose the name everyone will see on the board. No separate sign-in needed.
      </p>
      <label htmlFor="entry-name" className="text-sm font-bold">
        Entry name
      </label>
      <input
        id="entry-name"
        autoFocus
        autoComplete="off"
        maxLength={24}
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="e.g. Parker"
        disabled={busy}
        aria-describedby={error ? "entry-error" : undefined}
        className="card-flat mb-3 mt-1 w-full px-3 py-3 outline-none focus:shadow-hard"
      />
      {error && (
        <p id="entry-error" role="alert" className="mb-3 text-sm font-semibold text-danger">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-3">
        <button type="submit" className="btn btn-primary min-h-11" disabled={busy || !name.trim()}>
          {busy ? "Adding…" : "Add entry & make picks"}
        </button>
        <button type="button" className="btn min-h-11" disabled={busy} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}

/**
 * The other way an entry joins an account: it already exists.
 *
 * `AddEntry` only ever covers a name created from inside the account. Most of a pool joins the
 * other way — typing a name straight into the shared link — and a name that got there first never
 * had an owner to give it one, on this account or any other. This is how that gets corrected
 * without a commissioner in the loop: the same proof `/players/:id/claim` already accepts for a
 * fresh device, since if that code is enough to sign in as somebody, it is enough to say they are
 * yours to manage.
 */
function AttachEntry({
  player,
  onDone,
  onCancel,
}: {
  player: Identity | null;
  onDone: (p: Identity) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();
  const qc = useQueryClient();
  const ready = name.trim() !== "" && normalizeCode(code).length === CODE_LENGTH;

  return (
    <form
      className="mt-3 border-t-2 border-dashed border-line pt-4"
      onSubmit={async (event) => {
        event.preventDefault();
        if (busy || !player || !ready) return;
        setBusy(true);
        setError(null);
        try {
          const r = await api<{ player: Identity; ownerId: string }>("/entries/attach", {
            body: { name, code: normalizeCode(code) },
          });
          void qc.invalidateQueries({ queryKey: ["bootstrap"] });
          toast(`${r.player.name} is now one of your entries.`, "success");
          onDone({ ...r.player, accountId: player.accountId ?? player.id, token: player.token });
        } catch (err) {
          setError(err instanceof Error ? err.message : "Couldn't attach that entry.");
          setBusy(false);
        }
      }}
    >
      <h3 className="font-display text-sm font-extrabold">Attach an existing entry</h3>
      <p className="mb-3 mt-1 text-sm text-ink-2">
        The name they already play under, and the code that came with it — the same one that signs a second phone in
        as them.
      </p>
      <label htmlFor="attach-name" className="text-sm font-bold">
        Their name
      </label>
      <input
        id="attach-name"
        autoFocus
        autoComplete="off"
        maxLength={24}
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="e.g. Parker"
        disabled={busy}
        className="card-flat mb-3 mt-1 w-full px-3 py-3 outline-none focus:shadow-hard"
      />
      <label htmlFor="attach-code" className="text-sm font-bold">
        Their code
      </label>
      <input
        id="attach-code"
        value={code}
        onChange={(e) => setCode(formatCode(e.target.value))}
        placeholder="QRT4-9MKP"
        inputMode="text"
        autoCapitalize="characters"
        autoComplete="one-time-code"
        spellCheck={false}
        disabled={busy}
        aria-describedby={error ? "attach-error" : undefined}
        className="card-flat font-display mb-3 mt-1 w-full px-4 py-3 text-center text-2xl font-extrabold tracking-[0.15em] outline-none focus:shadow-hard"
      />
      {error && (
        <p id="attach-error" role="alert" className="mb-3 text-sm font-semibold text-danger">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-3">
        <button type="submit" className="btn btn-primary min-h-11" disabled={busy || !ready}>
          {busy ? "Attaching…" : "Attach"}
        </button>
        <button type="button" className="btn min-h-11" disabled={busy} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}

/** Face ID / Touch ID: an offer, never a requirement. */
function PasskeyRow({ hasPasskey }: { hasPasskey: boolean }) {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const toast = useToast();
  const qc = useQueryClient();
  if (!passkeysSupported()) return null;
  if (done || hasPasskey) {
    return (
      <p className="mt-1 flex items-center gap-2 text-sm text-ink-2">
        <Check size={16} className="shrink-0 text-turf" /> Face ID or fingerprint is on — it signs you in here and in
        the Tally app.
      </p>
    );
  }
  const turnOn = async () => {
    setBusy(true);
    try {
      await addPasskey();
      setDone(true);
      toast("Face ID or fingerprint is ready for your account.", "success");
      void qc.invalidateQueries({ queryKey: ["bootstrap"] });
    } catch (err) {
      if (!wasCancelled(err)) toast(err instanceof Error ? err.message : "Couldn't set that up.", "error");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="mt-2">
      <button className="btn btn-sm" disabled={busy} onClick={() => void turnOn()}>
        {busy ? "Waiting…" : "Set up Face ID or fingerprint"}
      </button>
      <p className="mt-1.5 text-xs text-ink-2">
        Optional. Opens your account on a new phone, a laptop, or the Tally iOS app without a code.
      </p>
    </div>
  );
}

/**
 * Getting onto a second device. The link is the easy path — one tap signs that device in, and on
 * an iPhone with the app installed it opens the app rather than the browser. The code stays
 * underneath for anyone reading it to someone across the room.
 */
function DeviceCode({ code, name, accountId }: { code: string; name: string; accountId: string | null }) {
  const [copied, setCopied] = useState(false);
  const toast = useToast();
  const link = accountId ? poolUrl(`/welcome?claim=${accountId}&code=${code}`) : null;

  const copy = async (text: string, done: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast(done, "success");
    } catch {
      toast("Couldn't copy — write it down instead.", "error");
    }
  };

  const send = async () => {
    if (!link) return;
    try {
      if (navigator.share) {
        await navigator.share({ url: link });
        return;
      }
      await copy(link, "Sign-in link copied. Open it on your other device.");
    } catch {
      /* share sheet dismissed */
    }
  };

  return (
    <div className="card-flat bg-flag-soft p-3">
      {link && (
        <>
          <button className="btn btn-sm btn-primary w-full" onClick={() => void send()}>
            Send myself a sign-in link
          </button>
          <p className="mt-1.5 text-xs text-ink-2">
            Text or AirDrop it to yourself. One tap signs that device in as <b>{name}</b> — and opens the Tally app if
            you have it. Treat it like a password.
          </p>
        </>
      )}
      <div className="mt-3 border-t-2 border-dashed border-line pt-2">
        <span className="text-[11px] font-bold uppercase tracking-wider text-ink-3">Or type this code</span>
        <div className="mt-1 flex items-center gap-2">
          <span className="font-display flex-1 text-2xl font-extrabold tracking-[0.12em]">{formatCode(code)}</span>
          <button className="btn btn-sm shrink-0" onClick={() => void copy(formatCode(code), "Code copied.")}>
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Changing a name you are responsible for: your own, or one of the entries you manage.
 *
 * Inline rather than a dialog, which is what every other edit on this page already is. The server
 * decides whether the id is yours — the same route the app calls — so this only has to show the
 * control for names the page already lists, and report what comes back.
 */
function RenameName({
  id,
  current,
  onDone,
  onCancel,
}: {
  id: string;
  current: string;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(current);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();
  const qc = useQueryClient();
  const trimmed = name.trim();

  return (
    <form
      className="w-full"
      onSubmit={async (event) => {
        event.preventDefault();
        if (busy || trimmed.length < 2 || trimmed === current) return;
        setBusy(true);
        setError(null);
        if (isVulgar(trimmed)) {
          setError(VULGAR_MESSAGE);
          setBusy(false);
          return;
        }
        try {
          const r = await api<{ player: { id: string; name: string } }>(`/players/${id}/name`, {
            method: "PATCH",
            body: { name: trimmed },
          });
          void qc.invalidateQueries({ queryKey: ["bootstrap"] });
          void qc.invalidateQueries({ queryKey: ["board"] });
          toast(`Now ${r.player.name}.`, "success");
          onDone();
        } catch (err) {
          setError(err instanceof Error ? err.message : "Couldn't change the name.");
          setBusy(false);
        }
      }}
    >
      <label htmlFor={`rename-${id}`} className="sr-only">
        Name
      </label>
      <input
        id={`rename-${id}`}
        autoFocus
        autoComplete="off"
        maxLength={24}
        value={name}
        onChange={(e) => setName(e.target.value)}
        disabled={busy}
        aria-describedby={error ? `rename-error-${id}` : undefined}
        className="card-flat w-full px-3 py-2 outline-none focus:shadow-hard"
      />
      {error && (
        <p id={`rename-error-${id}`} role="alert" className="mt-2 text-sm font-semibold text-danger">
          {error}
        </p>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button
          type="submit"
          className="btn btn-primary btn-sm"
          disabled={busy || trimmed.length < 2 || trimmed === current}
        >
          {busy ? "Saving…" : "Save"}
        </button>
        <button type="button" className="btn btn-sm" disabled={busy} onClick={onCancel}>
          Cancel
        </button>
        <span className="text-xs text-ink-3">This is the name on the board.</span>
      </div>
    </form>
  );
}
