import { isVulgar } from "../../shared/profanity.ts";

/**
 * A name no test has used before, and that the pool will actually accept.
 *
 * Every worker suite needs a fresh name per player, and every one of them reached for the obvious
 * thing: a prefix plus `Date.now().toString(36)` plus a counter. That generator has a rare and
 * extremely confusing failure, and it took down `main` once before anybody worked out what it was.
 *
 * `POST /players` screens names through `shared/profanity.ts`, which **de-leets digits into
 * letters** — `1→i`, `7→t`, `8→b`, `0→o`, `5→s` — and then splits on whatever is left. A base-36
 * timestamp is a string of exactly those characters, so it spells things. `Family mu8rgf2t17`
 * de-leets to `familymubrgf2tit` and splits to `["family", "mubrgf", "tit"]` — and "tit" is on the
 * word list. The signup comes back 400 with no `player` on it, and the test dies three lines later
 * on `Cannot read properties of undefined`, naming nothing that would lead anybody here.
 *
 * It happens to about one name in four thousand, which is exactly often enough to be a mystery:
 * rare enough that a suite passes for months, common enough that it will absolutely happen again.
 *
 * The fix is to ask the same screen the server will ask, and try again when the answer is no.
 * Using the real `isVulgar` rather than a cleverer alphabet is the point — a generator that tried
 * to avoid the list by construction would be a second, private copy of the rule, and would drift.
 *
 * The random chunk is doing something specific, and it is not uniqueness — `seq` already
 * guarantees that. It is what makes each *retry* independent. Built from the clock instead, every
 * attempt inside one millisecond shares a prefix, so a timestamp that de-leets into a banned
 * substring on its own is one the loop can never escape: it would spin fifty times and throw. With
 * a fresh chunk each go, two failures in a row is already a one-in-sixteen-million coincidence.
 */
let seq = 0;

const chunk = () => Math.random().toString(36).slice(2, 8);

export function uniqueName(prefix = "Player"): string {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    // `seq` is what makes this unique; the chunk is what makes the retry worth taking.
    const name = `${prefix} ${chunk()}${(seq++).toString(36)}`;
    if (!isVulgar(name)) return name;
  }
  throw new Error(`uniqueName could not produce a clean name for "${prefix}"`);
}
