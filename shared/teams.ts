export type Abbr =
  | "ARI" | "ATL" | "BAL" | "BUF" | "CAR" | "CHI" | "CIN" | "CLE"
  | "DAL" | "DEN" | "DET" | "GB"  | "HOU" | "IND" | "JAX" | "KC"
  | "LA"  | "LAC" | "LV"  | "MIA" | "MIN" | "NE"  | "NO"  | "NYG"
  | "NYJ" | "PHI" | "PIT" | "SEA" | "SF"  | "TB"  | "TEN" | "WAS";

export interface Team {
  abbr: Abbr;
  /** What we show people (e.g. "LAR" for the Rams; nflverse codes them "LA"). */
  display: string;
  city: string;
  nickname: string;
  primary: string;
  secondary: string;
  conference: "AFC" | "NFC";
  division: "East" | "North" | "South" | "West";
  logo: string;
}

const t = (
  abbr: Abbr, city: string, nickname: string, primary: string, secondary: string,
  conference: Team["conference"], division: Team["division"], display: string = abbr, logo = `/logos/${abbr}.svg`,
): Team => ({ abbr, display, city, nickname, primary, secondary, conference, division, logo });

export const TEAMS: Record<Abbr, Team> = {
  ARI: t("ARI", "Arizona", "Cardinals", "#97233F", "#FFB612", "NFC", "West"),
  ATL: t("ATL", "Atlanta", "Falcons", "#A71930", "#000000", "NFC", "South"),
  BAL: t("BAL", "Baltimore", "Ravens", "#241773", "#9E7C0C", "AFC", "North"),
  BUF: t("BUF", "Buffalo", "Bills", "#00338D", "#C60C30", "AFC", "East"),
  CAR: t("CAR", "Carolina", "Panthers", "#0085CA", "#101820", "NFC", "South"),
  CHI: t("CHI", "Chicago", "Bears", "#0B162A", "#C83803", "NFC", "North"),
  CIN: t("CIN", "Cincinnati", "Bengals", "#FB4F14", "#000000", "AFC", "North"),
  CLE: t("CLE", "Cleveland", "Browns", "#FF3C00", "#311D00", "AFC", "North", "CLE", "/logos/CLE.png"),
  DAL: t("DAL", "Dallas", "Cowboys", "#003594", "#869397", "NFC", "East"),
  DEN: t("DEN", "Denver", "Broncos", "#FB4F14", "#002244", "AFC", "West"),
  DET: t("DET", "Detroit", "Lions", "#0076B6", "#B0B7BC", "NFC", "North"),
  GB:  t("GB", "Green Bay", "Packers", "#203731", "#FFB612", "NFC", "North"),
  HOU: t("HOU", "Houston", "Texans", "#03202F", "#A71930", "AFC", "South"),
  IND: t("IND", "Indianapolis", "Colts", "#002C5F", "#A2AAAD", "AFC", "South"),
  JAX: t("JAX", "Jacksonville", "Jaguars", "#006778", "#D7A22A", "AFC", "South"),
  KC:  t("KC", "Kansas City", "Chiefs", "#E31837", "#FFB81C", "AFC", "West"),
  LA:  t("LA", "Los Angeles", "Rams", "#003594", "#FFA300", "NFC", "West", "LAR"),
  LAC: t("LAC", "Los Angeles", "Chargers", "#0080C6", "#FFC20E", "AFC", "West"),
  LV:  t("LV", "Las Vegas", "Raiders", "#000000", "#A5ACAF", "AFC", "West"),
  MIA: t("MIA", "Miami", "Dolphins", "#008E97", "#FC4C02", "AFC", "East"),
  MIN: t("MIN", "Minnesota", "Vikings", "#4F2683", "#FFC62F", "NFC", "North"),
  NE:  t("NE", "New England", "Patriots", "#002244", "#C60C30", "AFC", "East"),
  NO:  t("NO", "New Orleans", "Saints", "#101820", "#D3BC8D", "NFC", "South"),
  NYG: t("NYG", "New York", "Giants", "#0B2265", "#A71930", "NFC", "East"),
  NYJ: t("NYJ", "New York", "Jets", "#125740", "#000000", "AFC", "East"),
  PHI: t("PHI", "Philadelphia", "Eagles", "#004C54", "#A5ACAF", "NFC", "East"),
  PIT: t("PIT", "Pittsburgh", "Steelers", "#101820", "#FFB612", "AFC", "North"),
  SEA: t("SEA", "Seattle", "Seahawks", "#002244", "#69BE28", "NFC", "West"),
  SF:  t("SF", "San Francisco", "49ers", "#AA0000", "#B3995D", "NFC", "West"),
  TB:  t("TB", "Tampa Bay", "Buccaneers", "#D50A0A", "#FF7900", "NFC", "South"),
  TEN: t("TEN", "Tennessee", "Titans", "#0C2340", "#4B92DB", "AFC", "South", "TEN", "/logos/TEN.png"),
  WAS: t("WAS", "Washington", "Commanders", "#5A1414", "#FFB612", "NFC", "East"),
};

export const TEAM_LIST: Team[] = Object.values(TEAMS);
export const ABBRS = Object.keys(TEAMS) as Abbr[];
export const isAbbr = (s: unknown): s is Abbr => typeof s === "string" && s in TEAMS;
export const team = (abbr: Abbr): Team => TEAMS[abbr];

/**
 * Whether a label on a team's primary colour should be dark rather than white: whichever of the
 * two contrasts more, by WCAG relative luminance. A team is drawn as its colours and abbreviation
 * rather than its logo — the logos are trademarks Tally has no licence for — so the abbreviation
 * has to read on all 32. Same rule as `Team.labelIsDark` in TallyKit.
 */
export function labelIsDark(hex: string): boolean {
  const digits = hex.replace(/^#/, "");
  if (!/^[0-9a-f]{6}$/i.test(digits)) return false;
  const channel = (i: number) => {
    const c = parseInt(digits.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const l = 0.2126 * channel(0) + 0.7152 * channel(2) + 0.0722 * channel(4);
  return (l + 0.05) / 0.05 > 1.05 / (l + 0.05);
}
