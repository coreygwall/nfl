// Builds shared/schedule-<season>.json from the nflverse games.csv.
// Usage: node scripts/build-schedule.ts [season]
import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import { zonedTimeToUtc } from "../shared/tz.ts";

const SEASON = Number(process.argv[2] ?? 2026);
const SOURCE = "https://raw.githubusercontent.com/nflverse/nfldata/master/data/games.csv";

function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += ch;
  }
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }
  const header = rows.shift() ?? [];
  return rows
    .filter((r) => r.length === header.length)
    .map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ""])));
}

const res = await fetch(SOURCE);
if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
const records = parseCsv(await res.text());
const games = records
  .filter((r) => Number(r.season) === SEASON && r.game_type === "REG")
  .map((r) => {
    const [y, m, d] = r.gameday!.split("-").map(Number) as [number, number, number];
    const tbd = !r.gametime;
    const [hh, mm] = (r.gametime || "13:00").split(":").map(Number) as [number, number];
    return {
      id: r.game_id!,
      week: Number(r.week),
      kickoff: zonedTimeToUtc(y, m, d, hh, mm, "America/New_York"),
      away: r.away_team!,
      home: r.home_team!,
      neutral: r.location === "Neutral",
      venue: r.stadium || null,
      tbd,
    };
  })
  .sort((a, b) => a.week - b.week || a.kickoff.localeCompare(b.kickoff) || a.id.localeCompare(b.id));

if (games.length === 0) throw new Error(`No ${SEASON} REG games found`);
const version = createHash("sha256").update(JSON.stringify(games)).digest("hex").slice(0, 12);
const out = { season: SEASON, version, source: SOURCE, generatedAt: new Date().toISOString(), games };
const path = new URL(`../shared/schedule-${SEASON}.json`, import.meta.url);
writeFileSync(path, JSON.stringify(out, null, 1) + "\n");
const weeks = new Set(games.map((g) => g.week));
console.log(`Wrote ${games.length} games across ${weeks.size} weeks (version ${version}) → ${path.pathname}`);
console.log(`First: ${games[0]!.id} ${games[0]!.kickoff}   Last: ${games.at(-1)!.id} ${games.at(-1)!.kickoff}`);
console.log(`TBD kickoff times: ${games.filter((g) => g.tbd).length}`);
