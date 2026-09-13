/**
 * What each pool type is, in one place: the landing page, the pool's own "How to play" page and
 * the Worker's share card all read from here, so the explanation a stranger taps on playtally.app
 * is the same text a player sees once they are in. There is no second copy to drift.
 */
export type PoolStep = { title: string; body: string; showRanks?: boolean };
export type PoolNote = { term: string; body: string; appOnly?: boolean };

export type PoolTypeContent = {
  /** Matches the pool's URL slug when an instance of this type is running. */
  slug: string;
  name: string;
  status: "live" | "soon";
  sports: string[];
  /** One line under the name. */
  tagline: string;
  /** Two sentences for the landing page card. */
  blurb: string;
  steps: PoolStep[];
  notes: PoolNote[];
};

export const HIGH_FIVE: PoolTypeContent = {
  slug: "high-five",
  name: "High Five",
  status: "live",
  sports: ["NFL"],
  tagline: "Pick five. Rank your confidence. Score up to 15 points every week.",
  blurb:
    "Every week, pick the winners of five games and rank them 1 to 5. Your surest call is worth 5 points, your shakiest 1.",
  steps: [
    {
      title: "Pick 5 winners",
      body: "Choose any five games you think you can call correctly. You can change each pick until that game kicks off.",
    },
    {
      title: "Rank your confidence",
      body: "Your surest pick is worth 5 points, then 4, 3, 2, and 1. Put the most points behind the picks you trust most.",
      showRanks: true,
    },
    {
      title: "Climb the board",
      body: "A correct pick earns its assigned points. A miss earns zero. Get all five right and you score the full 15.",
    },
  ],
  notes: [
    { term: "No weekly deadline", body: "Games lock one at a time at kickoff, so later games stay open." },
    {
      term: "Showing up late is okay",
      body: "Pick from the games that are left. Your first remaining pick is still worth 5 points.",
    },
    { term: "Picks stay private", body: "Other players' picks appear only after those games begin." },
    { term: "Season standings", body: "Most points wins. Ties break on correct picks, then 5-point hits." },
    {
      term: "Using another device?",
      body: "Tap “I already entered”, choose your name, and type your device code — tap your name at the top of this app to find it. It stops anyone else picking as you.",
      appOnly: true,
    },
    { term: "What about an NFL tie?", body: "A tied game scores zero for everyone who picked it." },
  ],
};

export const SURVIVOR: PoolTypeContent = {
  slug: "survivor",
  name: "Survivor",
  status: "soon",
  sports: ["NFL", "Soccer"],
  tagline: "One pick a week, one life, no repeats.",
  blurb: "Pick one winner each week and you can never pick that team again. Miss once and you're out.",
  steps: [],
  notes: [],
};

export const BRACKETS: PoolTypeContent = {
  slug: "brackets",
  name: "Brackets",
  status: "soon",
  sports: ["College basketball", "World Cup"],
  tagline: "Fill it in, watch it burn by the second round.",
  blurb: "Call the whole tournament before it starts, then argue about it until next spring.",
  steps: [],
  notes: [],
};

export const MAJORS: PoolTypeContent = {
  slug: "majors",
  name: "Majors",
  status: "soon",
  sports: ["Golf"],
  tagline: "Draft a handful of players and live with it for four days.",
  blurb: "Pick your group before the first tee. Their scores are your score, all weekend.",
  steps: [],
  notes: [],
};

export const POOL_TYPES: PoolTypeContent[] = [HIGH_FIVE, SURVIVOR, BRACKETS, MAJORS];

/** Pool types are named in the Worker's config (POOL_TYPE), which is how it finds its copy. */
export function poolTypeByName(name: string | undefined): PoolTypeContent | undefined {
  return POOL_TYPES.find((p) => p.name === name);
}
