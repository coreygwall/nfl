import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { POOL_CODE_DIGITS, POOL_CODE_LENGTH, POOL_CODE_LETTERS, isPoolCodeShaped } from "../../shared/pool-codes.ts";

/**
 * A join code is one rule, written twice.
 *
 * The Worker mints it and the app reads it off a keyboard, so the two have to agree on the
 * alphabets and the shape exactly. They cannot drift quietly: a Swift build does not see this
 * file's alphabet, this file's tests do not run Swift, and the wire carries a plain string that
 * satisfies both type systems whatever it holds. What it costs if they disagree is somebody
 * typing the code from the group chat and being told it is not a code.
 */
const swift = readFileSync(new URL("../../ios/TallyKit/Sources/TallyKit/Pools/PoolCode.swift", import.meta.url), "utf8");

/** `public static let letters = "ABC…"` */
function swiftString(name: string): string {
  const match = swift.match(new RegExp(`public static let ${name} = "([^"]*)"`));
  expect(match, `PoolCode.swift should define ${name}`).not.toBeNull();
  return match![1]!;
}

function swiftInt(name: string): number {
  const match = swift.match(new RegExp(`public static let ${name} = (\\d+)`));
  expect(match, `PoolCode.swift should define ${name}`).not.toBeNull();
  return Number(match![1]);
}

describe("the join code is the same code on both surfaces", () => {
  it("found a Swift enum to compare against", () => {
    expect(swift).toContain("public enum PoolCode");
    expect(swift).toContain("public static func isShaped");
    expect(swift).toContain("public static func normalize");
    expect(swift).toContain("public static func format");
    expect(swift).toContain("public static func formatWhileTyping");
  });

  it("uses the same two alphabets", () => {
    // Derived by asking the shared module what it accepts, rather than retyped here — a third
    // copy of an alphabet is the thing this test exists to prevent.
    const every = [..."ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"];
    const letters = every.filter((ch) => isPoolCodeShaped(`${ch}DP472`)).join("");
    const digits = every.filter((ch) => isPoolCodeShaped(`KDP${ch}72`)).join("");
    expect(swiftString("letters")).toBe(letters);
    expect(swiftString("digits")).toBe(digits);
    // The excluded characters are the whole point of both alphabets, so name them: an edit that
    // puts I, L, O, 0 or 1 back on either side fails here rather than in somebody's group chat.
    for (const misread of ["I", "L", "O"]) expect(letters).not.toContain(misread);
    for (const misread of ["0", "1"]) expect(digits).not.toContain(misread);
  });

  it("splits the code in the same place", () => {
    expect(swiftInt("letterCount")).toBe(POOL_CODE_LETTERS);
    expect(swiftInt("digitCount")).toBe(POOL_CODE_DIGITS);
    expect(swiftInt("letterCount") + swiftInt("digitCount")).toBe(POOL_CODE_LENGTH);
  });

  it("is not the device claim code's shape on either side", () => {
    // `Codes` and `shared/codes.ts` are the other pair: eight characters of one alphabet. If a
    // join code ever became eight too, one input box could no longer tell them apart, which is
    // half of why this shape was chosen.
    const claim = readFileSync(new URL("../../ios/TallyKit/Sources/TallyKit/Rules/Codes.swift", import.meta.url), "utf8");
    const claimLength = Number(claim.match(/public static let length = (\d+)/)![1]);
    expect(POOL_CODE_LENGTH).not.toBe(claimLength);
    // Swift derives its length from the two halves rather than stating a third number.
    expect(swift).toContain("public static let length = letterCount + digitCount");
  });
});
