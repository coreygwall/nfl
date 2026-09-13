/**
 * A doormat, not a censor. Names go on a board everyone's family can see, so the handful of
 * words nobody could type by accident are turned away at the point of entry — and that's all.
 * Two lists, because the risk runs both ways: a filter that blocks Cassandra or Fukuda is worse
 * than one that lets a mild word through.
 *
 * Deliberately not applied to the commissioner's rename in /admin: if this ever refuses a real
 * name (Scunthorpe is the famous one), that is the way to put it right.
 */

/** Common digit and symbol swaps, so s.h.i.t and 5h1t read the same as the word. */
const LEET: Record<string, string> = {
  "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t", "8": "b",
  "@": "a", "$": "s", "!": "i", "|": "l",
};

/**
 * Severe enough to refuse wherever it appears, including inside a longer word, because that is
 * how they get past a word list: "xXfuckXx". Each one is long and specific enough that an
 * innocent name is unlikely to contain it — which is why "fuk" is absent (Fukuda) and "fag" is
 * only here as "faggot" (Fagan).
 */
const ANYWHERE = [
  "fuck",
  "cunt",
  "nigger",
  "nigga",
  "faggot",
  "cocksuck",
  "dickhead",
  "asshole",
  "shithead",
  "motherfuck",
  "rapist",
  "bitch",
  "wanker",
  "bollock",
  "retard",
];

/**
 * Vulgar standing alone, ordinary inside another word — "ass" in Cassandra, "rape" in Draper,
 * "tit" in Titus. Matched only as a word of its own.
 */
const WORDS = [
  "ass", "arse", "shit", "shite", "piss", "prick", "cock", "tit", "tits", "slut",
  "whore", "bastard", "rape", "penis", "vagina", "turd", "douche", "twat", "jizz", "cum",
];

const deLeet = (s: string): string =>
  s
    .toLowerCase()
    .split("")
    .map((ch) => LEET[ch] ?? ch)
    .join("");

/** Letters only, so "s h i t" and "s-h-i-t" collapse onto the word they spell. */
const squash = (s: string): string => deLeet(s).replace(/[^a-z]/g, "");

const words = (s: string): string[] => deLeet(s).split(/[^a-z]+/).filter(Boolean);

/** True when a name is one of the few nobody types by accident. */
export function isVulgar(raw: string): boolean {
  const flat = squash(raw);
  if (ANYWHERE.some((bad) => flat.includes(bad))) return true;
  // A word-list term spelled out with punctuation — "s.h.i.t" — is the whole name once the
  // punctuation goes. Matching the squashed form exactly catches that without turning the
  // word list into a substring list, which is what would flag Cassandra.
  if (WORDS.includes(flat)) return true;
  const parts = new Set(words(raw));
  return WORDS.some((bad) => parts.has(bad));
}

export const VULGAR_MESSAGE = "Let's keep it friendly — pick another name.";
