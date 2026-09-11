import { describe, expect, it } from "vitest";
import { gamesFromCsv, parseCsv } from "../../shared/nflverse.ts";

const HEADER = "game_id,season,game_type,week,gameday,weekday,gametime,away_team,home_team,location,stadium";
const csv = [
  HEADER,
  '2026_01_NE_SEA,2026,REG,1,2026-09-09,Wednesday,20:20,NE,SEA,Home,Lumen Field',
  '2026_01_SF_LA,2026,REG,1,2026-09-10,Thursday,20:35,SF,LA,Neutral,Melbourne Cricket Ground',
  '2026_08_ARI_DAL,2026,REG,8,2026-11-01,Sunday,13:00,ARI,DAL,Home,"AT&T Stadium"',
  '2026_18_TEN_HOU,2026,REG,18,2027-01-10,Sunday,,TEN,HOU,Home,"Reliant, Stadium"',
  '2025_01_KC_LAC,2025,REG,1,2025-09-05,Friday,20:00,KC,LAC,Neutral,Corinthians Arena',
  '2026_19_BUF_KC,2026,POST,19,2027-01-16,Saturday,16:30,BUF,KC,Home,Arrowhead',
].join("\n");

describe("nflverse CSV", () => {
  it("parses quoted fields with commas and doubled quotes", () => {
    const rows = parseCsv('a,b\n1,"x, y"\n2,"say ""hi"""\n');
    expect(rows).toEqual([
      { a: "1", b: "x, y" },
      { a: "2", b: 'say "hi"' },
    ]);
  });

  it("keeps only the requested regular season and converts Eastern kickoffs to UTC", () => {
    const games = gamesFromCsv(csv, 2026);
    expect(games.map((g) => g.id)).toEqual(["2026_01_NE_SEA", "2026_01_SF_LA", "2026_08_ARI_DAL", "2026_18_TEN_HOU"]);
    expect(games[0]).toMatchObject({ kickoff: "2026-09-10T00:20:00.000Z", neutral: false, venue: "Lumen Field", tbd: false });
    expect(games[1]).toMatchObject({ kickoff: "2026-09-11T00:35:00.000Z", neutral: true });
    // DST ended that morning: 1pm ET is 18:00Z, not 17:00Z.
    expect(games[2]!.kickoff).toBe("2026-11-01T18:00:00.000Z");
    expect(games[2]!.venue).toBe("AT&T Stadium");
  });

  it("flags rows with no kickoff time yet instead of inventing one silently", () => {
    const tbd = gamesFromCsv(csv, 2026).find((g) => g.id === "2026_18_TEN_HOU")!;
    expect(tbd.tbd).toBe(true);
    expect(tbd.kickoff).toBe("2027-01-10T18:00:00.000Z"); // 1pm ET placeholder
    expect(tbd.venue).toBe("Reliant, Stadium");
  });
});
