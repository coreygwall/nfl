import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { SHARED_CARD_PREFIX, isSharedCardPath, sharedCardPath } from "../../shared/golf.ts";

/**
 * The half of "not discoverable" that lives in a file rather than a header.
 *
 * `robots.txt` is a static asset, so the Worker never sees a request for it and no worker test can
 * reach it. It is worth a test of its own anyway: it is one line of text that quietly stops a
 * crawler fetching a shared round, and a typo in it fails silently and permanently.
 */
const robots = readFileSync(new URL("../../public/robots.txt", import.meta.url), "utf8");

describe("a shared card is not crawlable", () => {
  it("disallows the prefix the cards live under", () => {
    expect(robots).toMatch(/^User-agent: \*$/m);
    expect(robots).toMatch(/^Disallow: \/g\/$/m);
  });

  /** The pool is a public address and is meant to be found; only the cards are not. */
  it("does not disallow anything else", () => {
    const disallowed = [...robots.matchAll(/^Disallow: (.*)$/gm)].map((m) => m[1]!.trim());
    expect(disallowed).toEqual(["/g/"]);
  });

  /** The file, the Worker and the link the app hands out all have to name the same prefix. */
  it("names the prefix a card actually lives under", () => {
    expect(robots).toContain(`Disallow: ${SHARED_CARD_PREFIX}/`);
    expect(sharedCardPath("ABCDEFGHJKMNPQRSTUVWXYZ2")).toBe("/g/ABCDEFGHJKMNPQRSTUVWXYZ2");
    expect(isSharedCardPath(sharedCardPath("ABCDEFGHJKMNPQRSTUVWXYZ2"))).toBe(true);
    expect(isSharedCardPath("/g/ABCDEFGHJKMNPQRSTUVWXYZ2")).toBe(true);
    expect(isSharedCardPath("/g")).toBe(true);
    expect(isSharedCardPath("/p/high-five")).toBe(false);
    expect(isSharedCardPath("/golf")).toBe(false);
    expect(isSharedCardPath("/")).toBe(false);
  });
});
