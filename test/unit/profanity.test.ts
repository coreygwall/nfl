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
});
