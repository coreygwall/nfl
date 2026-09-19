/**
 * A scramble card, in the language the web speaks.
 *
 * The rules of this game already exist, written once in Swift (`ios/TallyKit/Sources/TallyKit/Golf/`)
 * because for its whole life the card has lived on exactly one phone. Sharing a card to a browser
 * is what makes that insufficient: a link-holder with no app has to be able to keep the same
 * round, and a web page cannot import a Swift package. So the rules live twice now, once per
 * language, which is the posture this repo already takes for the things both surfaces decide —
 * `shared/live-activity.ts` / `WeekActivity.swift`, `shared/pool-codes.ts` / `PoolCode.swift` —
 * and `golfParity.test.ts` is what stops the two drifting.
 *
 * Three things are deliberately different from the Swift, and each is a consequence of there now
 * being more than one client:
 *
 * - **Everything here is pure.** Swift mutates a struct in place; every function here returns a
 *   new card, because React redraws from a value and a mutation it cannot see is a screen that
 *   does not update.
 * - **`currentHole` is not on the wire.** Which tee you are standing on is a fact about a *device*,
 *   not about the round: two people on one card are on different holes all afternoon, and syncing
 *   it would have them dragging each other backwards. The phone keeps its own, the browser keeps
 *   its own, and the card carries only what happened.
 * - **Every hole carries `updatedAt` and the settings carry `settingsUpdatedAt`.** That is the
 *   whole merge rule (`mergeCards`): newest wins, per hole, and the settings move as one. It is
 *   why the Swift model has had `updatedAt` on a hole since the day it was written.
 */

// MARK: What a stroke is

/**
 * Three of the four credit nobody, and they are separate kinds rather than one because the card
 * should say what actually happened.
 */
export type StrokeKind = "shot" | "tapIn" | "penalty" | "unclaimed";

export interface Stroke {
  id: string;
  kind: StrokeKind;
  /** Set only for a `shot`. */
  playerId?: string | null;
}

export interface GolfPlayer {
  id: string;
  name: string;
}

export type SideContest = "longestDrive" | "closestToPin";

export interface HoleAward {
  contest: SideContest;
  playerId: string;
}

export interface HoleEntry {
  hole: number;
  strokes: Stroke[];
  finished: boolean;
  /** When this hole last changed. The unit the merge works in. */
  updatedAt: string;
  awards: HoleAward[];
}

export interface ContestRules {
  longestDrive: boolean;
  closestToPin: boolean;
}

/** What **every player** puts in, once, each time this is won. */
export interface Stake {
  on: boolean;
  each: number;
}

export interface PointValues {
  enabled: boolean;
  shotKept: Stake;
  longestDrive: Stake;
  closestToPin: Stake;
}

/** One of the three things a group can put a stake on. */
export type WagerItem = "shotKept" | "longestDrive" | "closestToPin";

export interface ScrambleCard {
  id: string;
  name: string;
  course: string;
  createdAt: string;
  /** When the names, the pars, the contests or the stakes last changed. */
  settingsUpdatedAt: string;
  players: GolfPlayer[];
  /** Par per hole, in order. Its length is the length of the round: 18, or 9. */
  pars: number[];
  holes: HoleEntry[];
  contests: ContestRules;
  points: PointValues;
}

// MARK: The contests beside the round

export const SIDE_CONTESTS: SideContest[] = ["longestDrive", "closestToPin"];

/** The par this contest is played on, which is the only thing that decides where it runs. */
export function contestPar(contest: SideContest): number {
  return contest === "longestDrive" ? 5 : 3;
}

export function contestTitle(contest: SideContest): string {
  return contest === "longestDrive" ? "Longest drive" : "Closest to the pin";
}

/** What golfers write on a paper card, and what fits the scorecard's narrow column. */
export function contestInitials(contest: SideContest): string {
  return contest === "longestDrive" ? "LD" : "CTP";
}

/** The question the round screen asks, once, on the hole it applies to. */
export function contestPrompt(contest: SideContest): string {
  return contest === "longestDrive" ? "Whose drive was longest?" : "Who was closest to the pin?";
}

/** "took the longest drive" — the verb phrase, for a sentence about a person. */
export function contestTook(contest: SideContest): string {
  return contest === "longestDrive" ? "took the longest drive" : "was closest to the pin";
}

/** The noun, counted: "2 longest drives", "1 closest to the pin". */
export function contestCounted(contest: SideContest, n: number): string {
  if (contest === "longestDrive") return n === 1 ? "1 longest drive" : `${n} longest drives`;
  return n === 1 ? "1 closest to the pin" : `${n} closest to the pin`;
}

export function runsContest(rules: ContestRules, contest: SideContest): boolean {
  return contest === "longestDrive" ? rules.longestDrive : rules.closestToPin;
}

export function anyContest(rules: ContestRules): boolean {
  return rules.longestDrive || rules.closestToPin;
}

export function playingContests(rules: ContestRules): SideContest[] {
  return SIDE_CONTESTS.filter((c) => runsContest(rules, c));
}

// MARK: Stakes

export const STAKE_MIN = 0;
export const STAKE_MAX = 50;

export function clampStake(each: number): number {
  if (!Number.isFinite(each)) return STAKE_MIN;
  return Math.min(Math.max(Math.round(each), STAKE_MIN), STAKE_MAX);
}

export function makeStake(on: boolean, each: number): Stake {
  return { on, each: clampStake(each) };
}

/** On, and for something. A stake of zero is switched on for nothing. */
export function stakeLive(stake: Stake): boolean {
  return stake.on && stake.each > 0;
}

/** What one win is worth to whoever takes it: everybody else's stake. */
export function stakeWinnings(stake: Stake, players: number): number {
  return Math.max(players - 1, 0) * stake.each;
}

export const WAGER_ITEMS: WagerItem[] = ["shotKept", "longestDrive", "closestToPin"];

/** The contest a wager item settles on, or null for shots kept, which is not a contest. */
export function wagerContest(item: WagerItem): SideContest | null {
  return item === "shotKept" ? null : item;
}

export function wagerTitle(item: WagerItem): string {
  if (item === "shotKept") return "Shots kept";
  return contestTitle(item);
}

/** "a shot kept", "a closest to the pin" — the noun a stake is priced against. */
export function wagerUnit(item: WagerItem): string {
  switch (item) {
    case "shotKept":
      return "a shot kept";
    case "longestDrive":
      return "a longest drive";
    case "closestToPin":
      return "a closest to the pin";
  }
}

export function stakeFor(points: PointValues, item: WagerItem): Stake {
  return points[item];
}

export function withStake(points: PointValues, item: WagerItem, stake: Stake): PointValues {
  return { ...points, [item]: makeStake(stake.on, stake.each) };
}

/**
 * The items actually in the game: switched on, worth something, and — for the two contests — being
 * played on this card at all. A stake on a closest to the pin nobody is playing is not a bet.
 */
export function playingWagers(points: PointValues, contests: ContestRules): WagerItem[] {
  return WAGER_ITEMS.filter((item) => {
    if (!stakeLive(stakeFor(points, item))) return false;
    const contest = wagerContest(item);
    return contest === null || runsContest(contests, contest);
  });
}

/**
 * Ten a head on each contest, shots kept left out — a group switches points on *because* of the
 * side games, and putting a stake on every shot the team keeps is the unusual choice.
 */
export function standardPoints(): PointValues {
  return {
    enabled: false,
    shotKept: { on: false, each: 1 },
    longestDrive: { on: true, each: 10 },
    closestToPin: { on: true, each: 10 },
  };
}

// MARK: Reading a card

export function holeCount(card: ScrambleCard): number {
  return card.pars.length;
}

export function holeNumbers(card: ScrambleCard): number[] {
  return Array.from({ length: holeCount(card) }, (_, i) => i + 1);
}

export function totalPar(card: ScrambleCard): number {
  return card.pars.reduce((a, b) => a + b, 0);
}

export function parOf(card: ScrambleCard, hole: number): number {
  if (hole < 1 || hole > card.pars.length) return 4;
  return card.pars[hole - 1] ?? 4;
}

export function entryFor(card: ScrambleCard, hole: number): HoleEntry | undefined {
  return card.holes.find((h) => h.hole === hole);
}

export function playerOf(card: ScrambleCard, id: string | null | undefined): GolfPlayer | undefined {
  if (!id) return undefined;
  return card.players.find((p) => p.id === id);
}

export function holeScore(entry: HoleEntry): number {
  return entry.strokes.length;
}

/**
 * Who holed it, once the hole is finished and it was a shot rather than a gimme.
 */
export function holedBy(entry: HoleEntry): string | null {
  if (!entry.finished) return null;
  const last = entry.strokes[entry.strokes.length - 1];
  if (!last || last.kind !== "shot") return null;
  return last.playerId ?? null;
}

export function endedWithTapIn(entry: HoleEntry): boolean {
  return entry.finished && entry.strokes[entry.strokes.length - 1]?.kind === "tapIn";
}

/** Only holes on the card: a round shortened to nine keeps the record but stops counting it. */
export function finishedHoles(card: ScrambleCard): HoleEntry[] {
  const count = holeCount(card);
  return card.holes.filter((h) => h.finished && h.hole >= 1 && h.hole <= count).sort((a, b) => a.hole - b.hole);
}

export function throughHole(card: ScrambleCard): number {
  return finishedHoles(card).length;
}

export function isComplete(card: ScrambleCard): boolean {
  return holeCount(card) > 0 && throughHole(card) === holeCount(card);
}

export function strokesTaken(card: ScrambleCard): number {
  return finishedHoles(card).reduce((n, h) => n + holeScore(h), 0);
}

/** Over finished holes only: a hole with two strokes on it is not yet under par. */
export function toPar(card: ScrambleCard): number {
  return finishedHoles(card).reduce((n, h) => n + holeScore(h) - parOf(card, h.hole), 0);
}

/**
 * The hole most recently finished, by *when* rather than by number — the correction somebody
 * makes three seconds later is about a hole that is no longer on screen.
 */
export function lastFinished(card: ScrambleCard): HoleEntry | null {
  const holes = finishedHoles(card);
  if (!holes.length) return null;
  return holes.reduce((best, h) => {
    const a = Date.parse(h.updatedAt);
    const b = Date.parse(best.updatedAt);
    if (a !== b) return a > b ? h : best;
    return h.hole > best.hole ? h : best;
  });
}

/** The next hole still to play after `hole`, wrapping round to pick up one that was skipped. */
export function nextUnfinishedHole(card: ScrambleCard, hole: number): number | null {
  const count = holeCount(card);
  if (count === 0) return null;
  for (let i = 1; i <= count; i += 1) {
    const candidate = ((hole + i - 1) % count) + 1;
    if (!entryFor(card, candidate)?.finished) return candidate;
  }
  return null;
}

/**
 * Which side contest this hole hosts, if any — decided by par, and by nothing else.
 *
 * Par is the whole rule, because par is corrected from the tee you are standing on: a stored list
 * of contest holes would be wrong the moment the fourth turned out to be a three.
 */
export function contestFor(card: ScrambleCard, hole: number): SideContest | null {
  if (hole < 1 || hole > holeCount(card)) return null;
  return SIDE_CONTESTS.find((c) => contestPar(c) === parOf(card, hole) && runsContest(card.contests, c)) ?? null;
}

export function contestHoles(card: ScrambleCard): number[] {
  if (!anyContest(card.contests)) return [];
  return holeNumbers(card).filter((h) => contestFor(card, h) !== null);
}

export function awardOn(entry: HoleEntry | undefined, contest: SideContest): string | null {
  return entry?.awards.find((a) => a.contest === contest)?.playerId ?? null;
}

/**
 * Who took a hole's contest — null if nobody has said, and null if the hole no longer hosts the
 * contest the award was recorded under. The record survives a par correction; the counting stops.
 */
export function winnerOf(card: ScrambleCard, contest: SideContest, hole: number): GolfPlayer | null {
  if (contestFor(card, hole) !== contest) return null;
  return playerOf(card, awardOn(entryFor(card, hole), contest)) ?? null;
}

export function standingOn(card: ScrambleCard, hole: number): { contest: SideContest; winner: GolfPlayer | null } | null {
  const contest = contestFor(card, hole);
  if (!contest) return null;
  return { contest, winner: winnerOf(card, contest, hole) };
}

// MARK: Writing

function touch(card: ScrambleCard, hole: number, now: string, change: (entry: HoleEntry) => HoleEntry): ScrambleCard {
  const existing = entryFor(card, hole) ?? { hole, strokes: [], finished: false, updatedAt: now, awards: [] };
  const next = { ...change({ ...existing, strokes: [...existing.strokes], awards: [...existing.awards] }), updatedAt: now };
  const holes = card.holes.filter((h) => h.hole !== hole).concat(next).sort((a, b) => a.hole - b.hole);
  return { ...card, holes };
}

function onCard(card: ScrambleCard, hole: number): boolean {
  return hole >= 1 && hole <= holeCount(card);
}

export function newStroke(kind: StrokeKind, playerId?: string | null, id: string = crypto.randomUUID()): Stroke {
  return { id, kind, playerId: kind === "shot" ? (playerId ?? null) : null };
}

/**
 * Another stroke on an open hole. A finished hole is left alone: reopen it first, so a stray tap
 * after "holed it" cannot quietly turn a birdie into a par.
 */
export function recordStroke(card: ScrambleCard, hole: number, stroke: Stroke, now: string): ScrambleCard {
  if (!onCard(card, hole) || entryFor(card, hole)?.finished) return card;
  return touch(card, hole, now, (e) => ({ ...e, strokes: [...e.strokes, stroke] }));
}

/**
 * The ball is in. With `tapIn` a nameless stroke is added first; without it the last stroke
 * recorded is the one that went in and its owner gets the mark.
 */
export function finishHole(card: ScrambleCard, hole: number, tapIn: boolean, now: string): ScrambleCard {
  const entry = entryFor(card, hole);
  if (!entry || entry.strokes.length === 0 || entry.finished) return card;
  return touch(card, hole, now, (e) => ({
    ...e,
    strokes: tapIn ? [...e.strokes, newStroke("tapIn")] : e.strokes,
    finished: true,
  }));
}

/**
 * One step back, whatever the last step was. On a finished hole that is the finishing act; on an
 * open one the last stroke comes off. Nothing to take back is a no-op rather than an error.
 */
export function undoHole(card: ScrambleCard, hole: number, now: string): ScrambleCard {
  const entry = entryFor(card, hole);
  if (!entry) return card;
  if (entry.finished) {
    return touch(card, hole, now, (e) => ({
      ...e,
      strokes: e.strokes[e.strokes.length - 1]?.kind === "tapIn" ? e.strokes.slice(0, -1) : e.strokes,
      finished: false,
    }));
  }
  if (!entry.strokes.length) return card;
  return touch(card, hole, now, (e) => ({ ...e, strokes: e.strokes.slice(0, -1) }));
}

/**
 * Say whose a stroke actually was, after the fact — allowed on a finished hole, because the count
 * does not change and so the score cannot.
 */
export function reassignStroke(
  card: ScrambleCard,
  hole: number,
  strokeId: string,
  kind: StrokeKind,
  playerId: string | null,
  now: string,
): ScrambleCard {
  if (!onCard(card, hole)) return card;
  if (kind === "shot" && !card.players.some((p) => p.id === playerId)) return card;
  if (!entryFor(card, hole)?.strokes.some((s) => s.id === strokeId)) return card;
  return touch(card, hole, now, (e) => ({
    ...e,
    strokes: e.strokes.map((s) => (s.id === strokeId ? newStroke(kind, playerId, s.id) : s)),
  }));
}

/** Take one stroke out of the middle of an open hole. A finished hole keeps its count. */
export function removeStroke(card: ScrambleCard, hole: number, strokeId: string, now: string): ScrambleCard {
  const entry = entryFor(card, hole);
  if (!onCard(card, hole) || !entry || entry.finished) return card;
  if (!entry.strokes.some((s) => s.id === strokeId)) return card;
  return touch(card, hole, now, (e) => ({ ...e, strokes: e.strokes.filter((s) => s.id !== strokeId) }));
}

/**
 * Name who took a hole's side contest, or clear it with null.
 *
 * Deliberately not guarded by `contestFor`: the hole is allowed to be recorded before its par is
 * right, and the reading side already refuses to count an award on a hole that does not host that
 * contest. It is allowed on a finished hole, because an award changes no score.
 */
export function awardContest(
  card: ScrambleCard,
  contest: SideContest,
  hole: number,
  playerId: string | null,
  now: string,
): ScrambleCard {
  if (!onCard(card, hole)) return card;
  if (playerId !== null && !card.players.some((p) => p.id === playerId)) return card;
  return touch(card, hole, now, (e) => ({
    ...e,
    awards: e.awards.filter((a) => a.contest !== contest).concat(playerId ? [{ contest, playerId }] : []),
  }));
}

/** Clamped to 3...6, because a par 2 is not a thing and a par 7 is not on this card. */
export function setPar(card: ScrambleCard, hole: number, par: number, now: string): ScrambleCard {
  if (!onCard(card, hole)) return card;
  const pars = [...card.pars];
  pars[hole - 1] = Math.min(Math.max(Math.round(par), 3), 6);
  return { ...card, pars, settingsUpdatedAt: now };
}

// MARK: The tally

export interface TallyRow {
  player: GolfPlayer;
  /** Every shot of theirs the team played from. The number the leaderboard is sorted by. */
  kept: number;
  /** Tee shots kept — "off the tee", the stat everyone actually claims. */
  drives: number;
  /** Shots that went in the hole. A tap-in is nobody's, so it is not here. */
  holed: number;
  /** Everything in between: the approach that set it up, the lag that made it a tap-in. */
  between: number;
  /** 1-based, and shared on a tie. */
  place: number;
}

export function tallyRows(card: ScrambleCard): TallyRow[] {
  const kept = new Map<string, number>();
  const drives = new Map<string, number>();
  const holed = new Map<string, number>();
  const between = new Map<string, number>();
  const bump = (m: Map<string, number>, id: string) => m.set(id, (m.get(id) ?? 0) + 1);

  for (const entry of card.holes) {
    const shots = entry.strokes.filter((s) => s.kind === "shot");
    shots.forEach((stroke, index) => {
      const id = stroke.playerId;
      if (!id) return;
      bump(kept, id);
      const isDrive = index === 0;
      const isHoled = entry.finished && stroke.id === entry.strokes[entry.strokes.length - 1]?.id;
      if (isDrive) bump(drives, id);
      if (isHoled) bump(holed, id);
      if (!isDrive && !isHoled) bump(between, id);
    });
  }

  const at = (m: Map<string, number>, id: string) => m.get(id) ?? 0;
  const sorted = [...card.players].sort((a, b) => {
    if (at(kept, a.id) !== at(kept, b.id)) return at(kept, b.id) - at(kept, a.id);
    if (at(drives, a.id) !== at(drives, b.id)) return at(drives, b.id) - at(drives, a.id);
    if (at(holed, a.id) !== at(holed, b.id)) return at(holed, b.id) - at(holed, a.id);
    return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
  });

  const rows: TallyRow[] = [];
  sorted.forEach((player, index) => {
    const k = at(kept, player.id);
    const above = rows[index - 1];
    const place = above && above.kept === k ? above.place : index + 1;
    rows.push({
      player,
      kept: k,
      drives: at(drives, player.id),
      holed: at(holed, player.id),
      between: at(between, player.id),
      place,
    });
  });
  return rows;
}

/**
 * One or two letters per player, for the scorecard's shots column. A first letter each until two
 * people share one; then those two get two.
 */
export function initialsFor(players: GolfPlayer[]): Record<string, string> {
  const prefix = (name: string, n: number) => name.trim().slice(0, n).toUpperCase();
  const out: Record<string, string> = {};
  for (const player of players) {
    const one = prefix(player.name, 1);
    const clash = players.some((p) => p.id !== player.id && prefix(p.name, 1) === one);
    out[player.id] = prefix(player.name, clash ? 2 : 1);
  }
  return out;
}

export interface ContestResult {
  hole: number;
  contest: SideContest;
  winner: GolfPlayer | null;
}

/** Every hole hosting a contest today, in playing order, with whoever has claimed it. */
export function contestResults(card: ScrambleCard): ContestResult[] {
  return contestHoles(card).flatMap((hole) => {
    const contest = contestFor(card, hole);
    if (!contest) return [];
    return [{ hole, contest, winner: winnerOf(card, contest, hole) }];
  });
}

export interface PointsRow {
  player: GolfPlayer;
  kept: number;
  longestDrives: number;
  closestToPins: number;
  /** Collected from the others, across everything they won. */
  won: number;
  /** Put in on everything somebody else won. */
  paid: number;
  /** `won - paid`. Negative is a real answer. */
  points: number;
  place: number;
}

export function winsOf(row: PointsRow, item: WagerItem): number {
  switch (item) {
    case "shotKept":
      return row.kept;
    case "longestDrive":
      return row.longestDrives;
    case "closestToPin":
      return row.closestToPins;
  }
}

/**
 * The points board, settled as a pot.
 *
 * A stake of ten on the closest to the pin means all four players put ten in on every par three,
 * and whoever is nearest takes the other three tens. So a win is worth `each × (players − 1)` to
 * the winner and `each` to everybody else, and **the column adds to zero**.
 *
 * Only what has actually been *claimed* settles. An unclaimed par three has no pot: nobody has put
 * anything in on a bet nobody has won yet.
 */
export function pointsBoard(card: ScrambleCard): PointsRow[] {
  const playing = playingWagers(card.points, card.contests);
  const players = card.players.length;
  const rows = tallyRows(card);
  const kept = new Map(rows.map((r) => [r.player.id, r.kept]));

  const wins = new Map<WagerItem, Map<string, number>>([["shotKept", new Map(kept)]]);
  const claimed = new Map<WagerItem, number>([["shotKept", [...kept.values()].reduce((a, b) => a + b, 0)]]);
  for (const result of contestResults(card)) {
    if (!result.winner) continue;
    const item: WagerItem = result.contest;
    const forItem = wins.get(item) ?? new Map<string, number>();
    forItem.set(result.winner.id, (forItem.get(result.winner.id) ?? 0) + 1);
    wins.set(item, forItem);
    claimed.set(item, (claimed.get(item) ?? 0) + 1);
  }
  const mine = (item: WagerItem, id: string) => wins.get(item)?.get(id) ?? 0;

  const settle = (id: string) => {
    let won = 0;
    let paid = 0;
    for (const item of playing) {
      const stake = stakeFor(card.points, item);
      const taken = mine(item, id);
      won += taken * stakeWinnings(stake, players);
      // Everything somebody else won is a stake this player put in and did not take back.
      paid += ((claimed.get(item) ?? 0) - taken) * stake.each;
    }
    return { won, paid };
  };

  const net = new Map(card.players.map((p) => {
    const s = settle(p.id);
    return [p.id, s.won - s.paid];
  }));
  const at = (m: Map<string, number>, id: string) => m.get(id) ?? 0;

  const sorted = [...card.players].sort((a, b) => {
    if (at(net, a.id) !== at(net, b.id)) return at(net, b.id) - at(net, a.id);
    if (mine("closestToPin", a.id) !== mine("closestToPin", b.id)) return mine("closestToPin", b.id) - mine("closestToPin", a.id);
    if (mine("longestDrive", a.id) !== mine("longestDrive", b.id)) return mine("longestDrive", b.id) - mine("longestDrive", a.id);
    if (at(kept, a.id) !== at(kept, b.id)) return at(kept, b.id) - at(kept, a.id);
    return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
  });

  const out: PointsRow[] = [];
  sorted.forEach((player, index) => {
    const s = settle(player.id);
    const points = s.won - s.paid;
    const above = out[index - 1];
    const place = above && above.points === points ? above.place : index + 1;
    out.push({
      player,
      kept: at(kept, player.id),
      longestDrives: mine("longestDrive", player.id),
      closestToPins: mine("closestToPin", player.id),
      won: s.won,
      paid: s.paid,
      points,
      place,
    });
  });
  return out;
}

// MARK: Words

/** "E", "−2", "+3": the number a golfer reads, with a real minus sign. */
export function toParText(n: number): string {
  if (n === 0) return "E";
  return n < 0 ? `−${-n}` : `+${n}`;
}

/** "+30", "−10", "0" — a net, with an explicit plus, because the sign is the point of the column. */
export function netText(n: number): string {
  if (n === 0) return "0";
  return n < 0 ? `−${-n}` : `+${n}`;
}

/** The word for a finished hole's score. Anything past a double bogey is just the number. */
export function holeLabel(score: number, par: number): string {
  const diff = score - par;
  if (diff < -2) return score === 1 ? "ace" : "albatross";
  if (diff === -2) return score === 1 ? "ace" : "eagle";
  if (diff === -1) return "birdie";
  if (diff === 0) return "par";
  if (diff === 1) return "bogey";
  if (diff === 2) return "double";
  return `+${diff}`;
}

/** "10 each on a closest to the pin · 10 each on a longest drive". */
export function pointsLine(card: ScrambleCard): string {
  const playing = playingWagers(card.points, card.contests);
  if (!playing.length) return "Nothing is being played for yet.";
  return playing.map((item) => `${stakeFor(card.points, item).each} each on ${wagerUnit(item)}`).join(" · ");
}

/** "Worth 30 to whoever takes it, 10 from each of the other 3." */
export function winningsLine(stake: Stake, players: number): string {
  const others = Math.max(players - 1, 0);
  if (others === 0 || stake.each === 0) return "Nobody else to play it with yet.";
  return `Worth ${stakeWinnings(stake, players)} to whoever takes it, ${stake.each} from each of the other ${others}.`;
}

/** "Corey", "Corey and Sam", "Corey, Sam and Parker" — mirrors `Names.list`. */
export function nameList(names: string[]): string {
  if (names.length === 0) return "";
  if (names.length === 1) return names[0]!;
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

export function plural(n: number, singular: string, pluralForm?: string): string {
  return n === 1 ? `${n} ${singular}` : `${n} ${pluralForm ?? `${singular}s`}`;
}

// MARK: Merging

/**
 * Two versions of one card, reconciled.
 *
 * The rule is the whole reason a hole has carried `updatedAt` since the model was written: **the
 * hole is the unit**, and the newer of the two wins it outright. A hole is a small, coherent thing
 * — its strokes and its awards belong together, and merging *inside* one would invent a round
 * neither phone played. The settings (names, pars, contests, stakes) move as a second unit, on
 * `settingsUpdatedAt`, for the same reason: renaming a player and shortening the round are not
 * changes you would want half of.
 *
 * Last-write-wins is the honest rule here rather than a compromise. Four people round one card are
 * not editing the same hole from two phones; they are on hole 7 while somebody fixes hole 3, and
 * that merges perfectly. When they genuinely do collide, the later tap is the one made by somebody
 * looking at the ball.
 */
export function mergeCards(base: ScrambleCard, incoming: ScrambleCard): ScrambleCard {
  const newer = Date.parse(incoming.settingsUpdatedAt) > Date.parse(base.settingsUpdatedAt) ? incoming : base;
  const holes = new Map<number, HoleEntry>();
  for (const hole of base.holes) holes.set(hole.hole, hole);
  for (const hole of incoming.holes) {
    const existing = holes.get(hole.hole);
    if (!existing || Date.parse(hole.updatedAt) > Date.parse(existing.updatedAt)) holes.set(hole.hole, hole);
  }
  return {
    ...newer,
    id: base.id,
    createdAt: base.createdAt,
    holes: [...holes.values()].sort((a, b) => a.hole - b.hole),
  };
}

// MARK: The wire

/** Par 72 as most cards lay it out: four threes, four fives, ten fours. */
export const STANDARD_PARS = [4, 4, 3, 5, 4, 4, 3, 4, 5, 4, 3, 4, 5, 4, 4, 3, 5, 4];

const STROKE_KINDS: StrokeKind[] = ["shot", "tapIn", "penalty", "unclaimed"];

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function asIsoDate(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const t = Date.parse(value);
  return Number.isNaN(t) ? fallback : new Date(t).toISOString();
}

function asStake(value: unknown, fallback: Stake): Stake {
  if (!value || typeof value !== "object") return fallback;
  const raw = value as Record<string, unknown>;
  return makeStake(typeof raw.on === "boolean" ? raw.on : fallback.on, typeof raw.each === "number" ? raw.each : fallback.each);
}

/**
 * Read a card off the wire, defaulting rather than throwing.
 *
 * The posture is the Swift model's hand-written decoder, and for the same reason: a card is
 * somebody's afternoon, and the failure mode of strictness is an empty screen where a round was.
 * A field that is missing or the wrong shape takes its default; only an unusable envelope — no id,
 * no players, no pars — is refused, by returning null.
 */
export function parseCard(value: unknown): ScrambleCard | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const id = asString(raw.id);
  if (!id) return null;

  const players: GolfPlayer[] = Array.isArray(raw.players)
    ? raw.players.flatMap((p) => {
        if (!p || typeof p !== "object") return [];
        const rp = p as Record<string, unknown>;
        const pid = asString(rp.id);
        return pid ? [{ id: pid, name: asString(rp.name) }] : [];
      })
    : [];
  if (!players.length) return null;

  const pars: number[] = Array.isArray(raw.pars)
    ? raw.pars.map((p) => (typeof p === "number" && Number.isFinite(p) ? Math.min(Math.max(Math.round(p), 3), 6) : 4))
    : [];
  if (!pars.length) return null;

  const createdAt = asIsoDate(raw.createdAt, new Date(0).toISOString());
  const known = new Set(players.map((p) => p.id));

  const holes: HoleEntry[] = Array.isArray(raw.holes)
    ? raw.holes.flatMap((h) => {
        if (!h || typeof h !== "object") return [];
        const rh = h as Record<string, unknown>;
        const hole = typeof rh.hole === "number" ? Math.round(rh.hole) : 0;
        if (hole < 1) return [];
        const strokes: Stroke[] = Array.isArray(rh.strokes)
          ? rh.strokes.flatMap((s) => {
              if (!s || typeof s !== "object") return [];
              const rs = s as Record<string, unknown>;
              const sid = asString(rs.id);
              const kind = STROKE_KINDS.includes(rs.kind as StrokeKind) ? (rs.kind as StrokeKind) : "unclaimed";
              if (!sid) return [];
              const playerId = asString(rs.playerId);
              // A shot naming somebody who is not on the card would be a mark nobody can see.
              if (kind === "shot" && !known.has(playerId)) return [newStroke("unclaimed", null, sid)];
              return [newStroke(kind, playerId || null, sid)];
            })
          : [];
        const awards: HoleAward[] = Array.isArray(rh.awards)
          ? rh.awards.flatMap((a) => {
              if (!a || typeof a !== "object") return [];
              const ra = a as Record<string, unknown>;
              const contest = ra.contest as SideContest;
              const playerId = asString(ra.playerId);
              if (!SIDE_CONTESTS.includes(contest) || !known.has(playerId)) return [];
              return [{ contest, playerId }];
            })
          : [];
        return [{
          hole,
          strokes,
          finished: rh.finished === true && strokes.length > 0,
          updatedAt: asIsoDate(rh.updatedAt, createdAt),
          awards,
        }];
      })
    : [];

  const rawContests = (raw.contests ?? {}) as Record<string, unknown>;
  const rawPoints = (raw.points ?? {}) as Record<string, unknown>;
  const fallbackPoints = standardPoints();

  return {
    id,
    name: asString(raw.name, "Golf card"),
    course: asString(raw.course),
    createdAt,
    settingsUpdatedAt: asIsoDate(raw.settingsUpdatedAt, createdAt),
    players,
    pars,
    holes: holes.sort((a, b) => a.hole - b.hole),
    contests: {
      longestDrive: rawContests.longestDrive === true,
      closestToPin: rawContests.closestToPin === true,
    },
    points: {
      enabled: rawPoints.enabled === true,
      shotKept: asStake(rawPoints.shotKept, fallbackPoints.shotKept),
      longestDrive: asStake(rawPoints.longestDrive, fallbackPoints.longestDrive),
      closestToPin: asStake(rawPoints.closestToPin, fallbackPoints.closestToPin),
    },
  };
}

// MARK: Where a card lives

/**
 * The one definition of a shared card's address.
 *
 * Three things need to agree about it and they are written in three different places: the Worker
 * decides which requests get the noindex header, `public/robots.txt` decides which a crawler may
 * fetch, and the app builds the link it puts in a QR code. A card that is reachable at a path one
 * of them has not heard of is a card that gets indexed, so the prefix is named once here.
 *
 * Off the root rather than under `/p/<slug>`, because a card is not in a pool: the person holding
 * the link may have no pool, and a round played at a golf course has nothing to do with whichever
 * football pool happens to be served from this host.
 */
export const SHARED_CARD_PREFIX = "/g";

export function sharedCardPath(token: string): string {
  return `${SHARED_CARD_PREFIX}/${token}`;
}

/** Every URL that is a shared card, including the ones that turn out not to name one. */
export function isSharedCardPath(path: string): boolean {
  return path === SHARED_CARD_PREFIX || path.startsWith(`${SHARED_CARD_PREFIX}/`);
}
