import { zonedTimeToUtc } from "./tz.ts";

export const NFLVERSE_GAMES_CSV = "https://raw.githubusercontent.com/nflverse/nfldata/master/data/games.csv";

export interface ScheduleGame {
  id: string;
  week: number;
  /** ISO-8601 UTC. */
  kickoff: string;
  away: string;
  home: string;
  neutral: boolean;
  venue: string | null;
  /** True when the feed had no kickoff time yet; `kickoff` is then a 1pm ET placeholder. */
  tbd: boolean;
}

/** Minimal RFC 4180 parser: quoted fields, doubled quotes, CRLF. */
export function parseCsv(text: string): Record<string, string>[] {
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

/** Regular-season games for one season, kickoffs converted from Eastern time to UTC. */
export function gamesFromCsv(text: string, season: number): ScheduleGame[] {
  return parseCsv(text)
    .filter((r) => Number(r.season) === season && r.game_type === "REG" && r.game_id && r.gameday)
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
}

export interface FinalScore {
  id: string;
  week: number;
  away: string;
  home: string;
  awayScore: number;
  homeScore: number;
  /** Winning team abbreviation, or "TIE". */
  winner: string;
}

/**
 * Games the feed reports as played, with their final score. Rows without both scores are
 * games that have not finished (or that nflverse has not filled in yet) and are left out.
 */
export function finalsFromCsv(text: string, season: number): FinalScore[] {
  return parseCsv(text)
    .filter((r) => Number(r.season) === season && r.game_type === "REG" && r.game_id)
    .flatMap((r) => {
      const away = Number(r.away_score);
      const home = Number(r.home_score);
      if (r.away_score === "" || r.home_score === "" || !Number.isFinite(away) || !Number.isFinite(home)) return [];
      return [
        {
          id: r.game_id!,
          week: Number(r.week),
          away: r.away_team!,
          home: r.home_team!,
          awayScore: away,
          homeScore: home,
          winner: home > away ? r.home_team! : away > home ? r.away_team! : "TIE",
        },
      ];
    });
}
