import { describe, expect, it } from "vitest";
import { isVulgar } from "../../shared/profanity.ts";

describe("the name filter", () => {
  it("turns away the words nobody types by accident", () => {
    for (const name of ["Fuckface", "cunt", "Big Dickhead", "AssHole", "nigga", "Retard", "Bitch Please"]) {
      expect(isVulgar(name), name).toBe(true);
    }
  });

  it("sees through spacing, punctuation and the usual digit swaps", () => {
    for (const name of ["f u c k", "s.h.i.t", "5h1t", "F-U-C-K", "@sshole", "b1tch"]) {
      expect(isVulgar(name), name).toBe(true);
    }
  });

  it("leaves real names alone, including the ones that spell something inside", () => {
    // The whole point of the two lists: these all contain a flagged word as a substring.
    for (const name of [
      "Cassandra",
      "Sam Assad",
      "Fukuda",
      "Fukushima",
      "Draper",
      "Grape Ape",
      "Titus",
      "Tito",
      "Fagan",
      "Shitsuko",
      "Cocker",
      "Dick Butkus",
      "Analise",
      "Matt Cummings",
      "Hancock",
      "Corey",
      "Mom",
      "J.R. O'Neill-Smith",
    ]) {
      expect(isVulgar(name), name).toBe(false);
    }
  });

  it("catches the same words standing on their own", () => {
    for (const name of ["Ass", "the shit", "Rape", "Big Tits", "Slut"]) {
      expect(isVulgar(name), name).toBe(true);
    }
  });

  /**
   * The trap that took `main` red once, pinned so the next person meets it here rather than in a
   * stack trace.
   *
   * De-leeting runs on *every* name, which means a string of digits is a string of letters as far
   * as this is concerned: `1` is an `i`, `7` is a `t`, `8` is a `b`. A base-36 timestamp is made of
   * exactly those characters, so it spells things — and every worker suite was generating test
   * names as a prefix plus `Date.now().toString(36)`. About one in four thousand of them came out
   * vulgar, the signup 400'd, and the test died several lines later on a missing property.
   *
   * This is the screen behaving correctly. `test/worker/names.ts` is the fix: generate, ask this,
   * and go round again when the answer is no.
   */
  it("reads digits as the letters they stand in for, which is why generated names must be screened", () => {
    // The exact name that failed: de-leets to ["family", "mubrgf", "tit"].
    expect(isVulgar("Family mu8rgf2t17")).toBe(true);
    // And the general shape of it, digit by digit.
    expect(isVulgar("b17ch")).toBe(true);
    expect(isVulgar("Team 5h17head")).toBe(true);
    // A timestamp that happens to spell nothing is still perfectly fine.
    expect(isVulgar("Family mu8rd7pp0")).toBe(false);
  });
});
