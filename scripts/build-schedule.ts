// Builds shared/schedule-<season>.json from the nflverse games.csv.
// Usage: node scripts/build-schedule.ts [season]
import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import { gamesFromCsv, NFLVERSE_GAMES_CSV } from "../shared/nflverse.ts";

const SEASON = Number(process.argv[2] ?? 2026);
const res = await fetch(NFLVERSE_GAMES_CSV);
if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
const games = gamesFromCsv(await res.text(), SEASON);
if (games.length === 0) throw new Error(`No ${SEASON} REG games found`);
const version = createHash("sha256").update(JSON.stringify(games)).digest("hex").slice(0, 12);
const out = { season: SEASON, version, source: NFLVERSE_GAMES_CSV, generatedAt: new Date().toISOString(), games };
const path = new URL(`../shared/schedule-${SEASON}.json`, import.meta.url);
writeFileSync(path, JSON.stringify(out, null, 1) + "\n");
const weeks = new Set(games.map((g) => g.week));
console.log(`Wrote ${games.length} games across ${weeks.size} weeks (version ${version}) → ${path.pathname}`);
console.log(`First: ${games[0]!.id} ${games[0]!.kickoff}   Last: ${games.at(-1)!.id} ${games.at(-1)!.kickoff}`);
console.log(`TBD kickoff times: ${games.filter((g) => g.tbd).length}`);
