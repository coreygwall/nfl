import { useState } from "react";
import { Sheet } from "../AppShell.tsx";
import { Segmented } from "../Common.tsx";
import {
  STAKE_MAX,
  STAKE_MIN,
  STANDARD_PARS,
  contestPar,
  carryLine,
  contestTitle,
  holeCount,
  makeStake,
  playingWagers,
  plural,
  runsContest,
  SIDE_CONTESTS,
  stakeFor,
  tallyRows,
  WAGER_ITEMS,
  wagerContest,
  wagerTitle,
  wagerUnit,
  winningsLine,
  withStake,
  type ContestRules,
  type PointValues,
  type ScrambleCard,
  type SideContest,
  type Stake,
  type WagerItem,
} from "../../../shared/golf.ts";

/**
 * Names, pars, side games and stakes — everything about the card that is not the round itself.
 *
 * The app keeps these behind a pencil and so does this, for the same reason: they are decided once
 * on the first tee and then corrected twice all afternoon, so they must be reachable and must not
 * be in the way. The one difference is what is *not* here. The app's sheet can delete a card; this
 * one cannot, and that is deliberate. The link is a capability, not ownership — somebody who was
 * sent a card so they could keep score should not be able to destroy the round for the other
 * three. Deleting stays on the phone that made it.
 *
 * Everything writes through `apply`, which means every edit is in front of the other three within
 * a second. A sheet that batched them behind a Save button would be a sheet where two people
 * quietly overwrite each other's names.
 */
export function EditCardSheet({
  card,
  apply,
  onClose,
}: {
  card: ScrambleCard;
  apply: (change: (card: ScrambleCard) => ScrambleCard) => void;
  onClose: () => void;
}) {
  const [showPars, setShowPars] = useState(false);
  const now = () => new Date().toISOString();
  const settings = (change: (card: ScrambleCard) => ScrambleCard) =>
    apply((c) => ({ ...change(c), settingsUpdatedAt: now() }));

  /** Names with shots already kept: the holes that are in are attributed to them. */
  const locked = new Set(tallyRows(card).filter((r) => r.kept > 0).map((r) => r.player.id));
  const count = holeCount(card);

  const setHoleCount = (next: number) =>
    settings((c) => {
      // Shortening leaves the far holes on disk and simply stops counting them, so a mis-tap does
      // not throw away the back nine — the same posture as an award orphaned by a par correction.
      const pars = next <= c.pars.length ? c.pars.slice(0, next) : [...c.pars, ...STANDARD_PARS.slice(c.pars.length, next)];
      while (pars.length < next) pars.push(4);
      return { ...c, pars };
    });

  return (
    <Sheet title="This card" onClose={onClose}>
      <div className="space-y-6">
        <section>
          <h3 className="font-display text-xs font-extrabold uppercase tracking-[0.12em] text-ink-3">Who's playing</h3>
          <div className="mt-2 space-y-2">
            {card.players.map((p, i) => (
              <div key={p.id} className="flex items-center gap-2">
                <span className="font-display w-4 shrink-0 text-sm text-ink-3">{i + 1}</span>
                <input
                  className="card-flat min-h-11 w-full px-3 py-2 outline-none focus:shadow-hard"
                  value={p.name}
                  aria-label={`Player ${i + 1}'s name`}
                  onChange={(e) =>
                    settings((c) => ({
                      ...c,
                      players: c.players.map((q) => (q.id === p.id ? { ...q, name: e.target.value } : q)),
                    }))
                  }
                />
                <button
                  type="button"
                  className="btn btn-ghost btn-sm shrink-0 px-2 text-xs"
                  // A name with shots on the card cannot leave it: holes that are in point at it.
                  disabled={card.players.length <= 2 || locked.has(p.id)}
                  aria-label={`Remove ${p.name || `player ${i + 1}`}`}
                  onClick={() => settings((c) => ({ ...c, players: c.players.filter((q) => q.id !== p.id) }))}
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
          {card.players.length < 8 && (
            <button
              type="button"
              className="btn btn-sm mt-2"
              onClick={() => settings((c) => ({ ...c, players: [...c.players, { id: crypto.randomUUID(), name: "" }] }))}
            >
              Add another
            </button>
          )}
          {locked.size > 0 && (
            <p className="mt-2 text-xs text-ink-3">
              A name with shots already kept stays on the card — the holes that are in point at it.
            </p>
          )}
        </section>

        <section>
          <h3 className="font-display text-xs font-extrabold uppercase tracking-[0.12em] text-ink-3">The round</h3>
          <div className="mt-2">
            <Segmented
              value={count === 9 ? "9" : "18"}
              label="How many holes"
              pillId="golf-holes"
              options={[
                { value: "18", label: "18 holes" },
                { value: "9", label: "Front 9" },
              ]}
              onChange={(v) => setHoleCount(v === "9" ? 9 : 18)}
            />
          </div>
          <button type="button" className="btn btn-sm mt-2" onClick={() => setShowPars((v) => !v)}>
            {showPars ? "Hide the pars" : "Set the pars"}
          </button>
          {showPars && (
            <div className="mt-2 grid grid-cols-3 gap-1.5">
              {Array.from({ length: count }, (_, i) => i + 1).map((hole) => (
                <div key={hole} className="card-flat px-2 py-1.5 text-center">
                  <p className="text-[10px] font-bold text-ink-3">{hole}</p>
                  <div className="mt-1 flex justify-center gap-1">
                    {[3, 4, 5].map((par) => (
                      <button
                        key={par}
                        type="button"
                        aria-label={`Hole ${hole}, par ${par}`}
                        aria-pressed={card.pars[hole - 1] === par}
                        className={`font-display h-8 w-7 rounded-lg text-[13px] font-extrabold ${
                          card.pars[hole - 1] === par ? "bg-ink text-paper" : "bg-surface text-ink-2"
                        }`}
                        onClick={() =>
                          settings((c) => {
                            const pars = [...c.pars];
                            pars[hole - 1] = par;
                            return { ...c, pars };
                          })
                        }
                      >
                        {par}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
          <p className="mt-2 text-xs text-ink-2">
            Par {card.pars.slice(0, count).reduce((a, b) => a + b, 0)}. Par is also one tap from the tee you're standing
            on, which is usually where you notice it's wrong.
          </p>
        </section>

        <section>
          <h3 className="font-display text-xs font-extrabold uppercase tracking-[0.12em] text-ink-3">Side games</h3>
          <div className="mt-2 space-y-3">
            {SIDE_CONTESTS.map((contest) => (
              <Switch
                key={contest}
                title={contestTitle(contest)}
                // The one number that makes this decidable on a first tee: "on every par 5" is
                // abstract, "4 holes today" is not — and it moves as the pars are corrected.
                detail={`On every par ${contestPar(contest)}. ${plural(holesAtPar(card, contestPar(contest)), "hole")} today.`}
                on={runsContest(card.contests, contest)}
                onChange={(on) => settings((c) => ({ ...c, contests: setContest(c.contests, contest, on) }))}
              />
            ))}
            <div className="border-t-2 border-dashed border-line pt-3">
              <Switch
                title="Play for points"
                detail="Everybody puts the same in each time, and whoever wins it takes the lot. The shots-kept board stays either way."
                on={card.points.enabled}
                onChange={(on) => settings((c) => ({ ...c, points: { ...c.points, enabled: on } }))}
              />
            </div>
          </div>

          {card.points.enabled && (
            <div className="card-flat mt-3 space-y-3 bg-paper-2 p-3">
              {WAGER_ITEMS.map((item) => {
                const contest = wagerContest(item);
                // A contest switched off above has nothing to stake — the bet does not exist on
                // this card, so offering a number for it would be offering a number for nothing.
                if (contest && !runsContest(card.contests, contest)) return null;
                return (
                  <StakeRow
                    key={item}
                    item={item}
                    stake={stakeFor(card.points, item)}
                    players={card.players.length}
                    onChange={(stake) => settings((c) => ({ ...c, points: setStake(c.points, item, stake) }))}
                  />
                );
              })}
              {playingWagers(card.points, card.contests).length === 0 && (
                <p className="text-xs font-semibold text-danger">
                  Nothing is switched on, so the points board will be empty. Put a stake on something above.
                </p>
              )}
            </div>
          )}
        </section>

        <section>
          <h3 className="font-display text-xs font-extrabold uppercase tracking-[0.12em] text-ink-3">Details</h3>
          <div className="mt-2 space-y-2">
            <input
              className="card-flat min-h-11 w-full px-3 py-2 outline-none focus:shadow-hard"
              value={card.name}
              aria-label="Card name"
              placeholder="Saturday scramble"
              onChange={(e) => settings((c) => ({ ...c, name: e.target.value }))}
            />
            <input
              className="card-flat min-h-11 w-full px-3 py-2 outline-none focus:shadow-hard"
              value={card.course}
              aria-label="Course"
              placeholder="Course (optional)"
              onChange={(e) => settings((c) => ({ ...c, course: e.target.value }))}
            />
          </div>
        </section>

        <p className="text-xs text-ink-3">
          Every change here is in front of everybody else on this card within a second. Deleting the card is the one
          thing only the phone that made it can do.
        </p>
      </div>
    </Sheet>
  );
}

function holesAtPar(card: ScrambleCard, par: number): number {
  return card.pars.slice(0, holeCount(card)).filter((p) => p === par).length;
}

function setContest(rules: ContestRules, contest: SideContest, on: boolean): ContestRules {
  return contest === "longestDrive" ? { ...rules, longestDrive: on } : { ...rules, closestToPin: on };
}

function setStake(points: PointValues, item: WagerItem, stake: Stake): PointValues {
  return withStake(points, item, stake);
}

/** A labelled switch with the sentence that says what it actually does. */
function Switch({
  title,
  detail,
  on,
  onChange,
}: {
  title: string;
  detail: string;
  on: boolean;
  onChange: (on: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3">
      <span className="min-w-0 flex-1">
        <span className="font-display block text-[15px] font-extrabold">{title}</span>
        <span className="block text-xs text-ink-2">{detail}</span>
      </span>
      <input
        type="checkbox"
        role="switch"
        checked={on}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-1 h-6 w-6 shrink-0 accent-turf"
        aria-label={title}
      />
    </label>
  );
}

/**
 * One thing to play for: whether it is in, and what everybody puts in each time.
 *
 * The word is **each**, everywhere, because the difference between "10 to the winner" and "10 from
 * everybody" is the whole feature and a bare "10" reads as the first one. The line underneath does
 * the arithmetic out loud for the number of names currently on the card, which is the number
 * nobody wants to do in their head standing on a tee — and it moves as names are added above,
 * because what a win is worth is a fact about how many are playing rather than about the bet.
 */
function StakeRow({
  item,
  stake,
  players,
  onChange,
}: {
  item: WagerItem;
  stake: Stake;
  players: number;
  onChange: (stake: Stake) => void;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <span className="font-display min-w-0 flex-1 truncate text-[15px] font-extrabold">{wagerTitle(item)}</span>
        <input
          type="checkbox"
          role="switch"
          checked={stake.on}
          onChange={(e) => onChange(makeStake(e.target.checked, stake.each, stake.carry))}
          className="h-6 w-6 shrink-0 accent-turf"
          aria-label={`Play for ${wagerUnit(item)}`}
        />
      </div>
      {stake.on && (
        <>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="btn btn-sm w-11 px-0"
              aria-label={`One less on ${wagerUnit(item)}`}
              onClick={() => onChange(makeStake(true, stake.each - 1, stake.carry))}
              disabled={stake.each <= STAKE_MIN}
            >
              −
            </button>
            <span className="font-display text-xl font-extrabold tabular">{stake.each}</span>
            <span className="text-xs font-bold text-ink-2">each</span>
            <button
              type="button"
              className="btn btn-sm ml-auto w-11 px-0"
              aria-label={`One more on ${wagerUnit(item)}`}
              onClick={() => onChange(makeStake(true, stake.each + 1, stake.carry))}
              disabled={stake.each >= STAKE_MAX}
            >
              +
            </button>
          </div>
          <p className="text-xs text-ink-2">{winningsLine(stake, players)}</p>
          {/*
            Only the two contests. A shot the team keeps has no hole to roll into, so a switch
            here would be a control with nothing behind it.
          */}
          {wagerContest(item) && (
            <label className="flex cursor-pointer items-start gap-2 border-t-2 border-line pt-2">
              <input
                type="checkbox"
                role="switch"
                checked={stake.carry}
                onChange={(e) => onChange(makeStake(stake.on, stake.each, e.target.checked))}
                className="mt-0.5 h-5 w-5 shrink-0 accent-turf"
                aria-label={`Carry over ${wagerUnit(item)}`}
              />
              <span className="min-w-0">
                <span className="block text-[13px] font-bold">Carry it over</span>
                <span className="block text-xs text-ink-2">{carryLine(stake, players)}</span>
              </span>
            </label>
          )}
        </>
      )}
    </div>
  );
}
