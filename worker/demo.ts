import type { Env } from "./env.ts";
import type { Abbr } from "../shared/teams.ts";
import type { Game, Pick } from "../shared/types.ts";
import { nameKey } from "../shared/names.ts";
import { generateCode } from "../shared/codes.ts";
import { pickWeek } from "../shared/week.ts";
import { createPlayer, findPlayerByKey, listGames, replacePicks, setClaimCode } from "./db.ts";

/**
 * The demo pool: `demo.playtally.app`, a second copy of this Worker with a database of its own
 * (`wrangler.jsonc` → `env.demo`), where a dozen made-up people play a real season.
 *
 * It is how somebody with no invite sees what Tally is (the iOS front door's third button), and it
 * is how App Review gets in without a stranger turning up on a real group's board. It has to look
 * alive in week 14 without anybody tending it, so every cron firing tops it up: any demo player
 * without picks for a week that has started, or for the week open now, gets five. The games and the
 * results are the real ones — the results sync fills them in exactly as it does for a real pool —
 * so the standings are an honest account of how these picks did.
 *
 * Nothing here runs unless `DEMO` is set, which only the demo environment does.
 */

export interface DemoPlayer {
  name: string;
  /** Always taken when they play, and ranked first: everybody in a pool has a team. */
  favourites: Abbr[];
  /** How often an ordinary game goes to the home side, 0–1. */
  homeLean: number;
}

/** The made-up roster. Plain first names and initials, the way a real pool's roster reads. */
export const DEMO_PLAYERS: DemoPlayer[] = [
  { name: "Marge O.", favourites: ["GB"], homeLean: 0.6 },
  { name: "Dev P.", favourites: ["SF"], homeLean: 0.5 },
  { name: "Tina B.", favourites: ["KC"], homeLean: 0.55 },
  { name: "Big Sal", favourites: ["PHI", "NYG"], homeLean: 0.7 },
  { name: "Rosa M.", favourites: ["DET"], homeLean: 0.45 },
  { name: "Coach K", favourites: ["BAL"], homeLean: 0.65 },
  { name: "Priya S.", favourites: ["SEA"], homeLean: 0.5 },
  { name: "Uncle Ray", favourites: ["DAL"], homeLean: 0.8 },
  { name: "Jules", favourites: ["MIA"], homeLean: 0.35 },
  { name: "Hank T.", favourites: ["PIT"], homeLean: 0.6 },
  { name: "Nadia F.", favourites: ["BUF"], homeLean: 0.5 },
  // App Review signs in as this one (its code is read out of the demo database and pasted into
  // App Store Connect, never committed), so the reviewer lands on a season of their own picks.
  { name: "App Review", favourites: [], homeLean: 0.55 },
];

/** A small, seedable PRNG, so a demo player's week is the same every time it is worked out. */
function seeded(seed: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return () => {
    h = (h + 0x6d2b79f5) | 0;
    let t = Math.imul(h ^ (h >>> 15), 1 | h);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(items: T[], random: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    const swap = out[i]!;
    out[i] = out[j]!;
    out[j] = swap;
  }
  return out;
}

/** One demo player's five for a week: their team first, then whatever takes their fancy. */
export function demoPicks(player: DemoPlayer, week: number, games: Game[]): Pick[] {
  const random = seeded(`${player.name}:${week}`);
  const theirs = games.filter((g) => player.favourites.includes(g.home) || player.favourites.includes(g.away));
  const rest = shuffle(games.filter((g) => !theirs.includes(g)), random);
  const chosen = [...theirs, ...rest].slice(0, 5);
  // Their own team is the surest thing on the card; the others are shuffled into the ranks below.
  const ordered = [...chosen.filter((g) => theirs.includes(g)), ...shuffle(chosen.filter((g) => !theirs.includes(g)), random)];
  return ordered.map((g, i) => {
    const favourite = player.favourites.find((t) => t === g.home || t === g.away);
    const team = favourite ?? (random() < player.homeLean ? g.home : g.away);
    return { gameId: g.id, team, rank: i + 1 };
  });
}

export function isDemo(env: { DEMO?: Env["DEMO"] }): boolean {
  return env.DEMO === "true";
}

/**
 * Makes sure every demo player exists and has picks for every week up to the one open now.
 * Idempotent: a player who already has a week is left alone, so the cron can run it every
 * half hour for nothing.
 *
 * Picks for a week are written the first time that week is reached, over every game in it, and
 * stamped an hour before its first kickoff — which is when a real player in no hurry would have
 * made them. That is what lets a pool created in week 3 still have a week 1.
 */
export async function runDemo(
  db: D1Database,
  season: number,
  now: string,
  roster: DemoPlayer[] = DEMO_PLAYERS,
): Promise<{ created: number; weeksFilled: number }> {
  const games = await listGames(db, season);
  if (games.length === 0) return { created: 0, weeksFilled: 0 };

  let created = 0;
  const ids = new Map<string, string>();
  for (const player of roster) {
    const key = nameKey(player.name);
    const existing = await findPlayerByKey(db, key);
    if (existing) {
      ids.set(player.name, existing.id);
      continue;
    }
    const id = crypto.randomUUID();
    const code = generateCode();
    await createPlayer(db, { id, name: player.name, nameKey: key, now, claimCode: code });
    // Behind its code from the start. A demo player nobody holds would otherwise be claimed by
    // the first visitor to tap the name, which is the pool's rule for a roster a commissioner
    // typed in, and exactly wrong here.
    await setClaimCode(db, id, code, true);
    ids.set(player.name, id);
    created++;
  }

  const through = pickWeek(games, now);
  const marks = [...ids.values()].map(() => "?").join(", ");
  const { results } = await db
    .prepare(`SELECT DISTINCT player_id, week FROM picks WHERE player_id IN (${marks})`)
    .bind(...ids.values())
    .all<{ player_id: string; week: number }>();
  const have = new Set(results.map((r) => `${r.player_id}:${r.week}`));

  let weeksFilled = 0;
  for (let week = 1; week <= through; week++) {
    const weekGames = games.filter((g) => g.week === week);
    if (weekGames.length === 0) continue;
    const firstKickoff = weekGames.map((g) => g.kickoffAt).sort()[0]!;
    const madeAt = new Date(Math.min(Date.parse(now), Date.parse(firstKickoff) - 60 * 60 * 1000)).toISOString();
    for (const player of roster) {
      const id = ids.get(player.name)!;
      if (have.has(`${id}:${week}`)) continue;
      await replacePicks(db, id, week, demoPicks(player, week, weekGames), madeAt, true, null, player.name);
      weeksFilled++;
    }
  }
  return { created, weeksFilled };
}
