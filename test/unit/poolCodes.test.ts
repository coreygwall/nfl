import { describe, expect, it } from "vitest";
import {
  formatPoolCode,
  formatPoolCodeWhileTyping,
  generatePoolCode,
  isPoolCodeShaped,
  normalizePoolCode,
  POOL_CODE_LENGTH,
} from "../../shared/pool-codes.ts";

/** Deterministic bytes, so a test can mint an exact code. */
const bytesOf = (...values: number[]) => () => Uint8Array.from(values);

describe("a join code is three letters and three digits", () => {
  it("mints the shape it promises, every time", () => {
    for (let i = 0; i < 400; i++) {
      const code = generatePoolCode();
      expect(isPoolCodeShaped(code), code).toBe(true);
      expect(code).toHaveLength(POOL_CODE_LENGTH);
    }
  });

  it("never mints a letter people misread, or a digit that is one", () => {
    const minted = new Set<string>();
    for (let i = 0; i < 400; i++) minted.add(generatePoolCode());
    const letters = [...minted].flatMap((c) => [...c.slice(0, 3)]);
    const digits = [...minted].flatMap((c) => [...c.slice(3)]);
    expect(letters.filter((ch) => "ILO".includes(ch))).toEqual([]);
    expect(digits.filter((ch) => "01".includes(ch))).toEqual([]);
  });

  it("does not hand a pool a code that spells something", () => {
    // "ASS" is index 0, 15, 15 in the letter alphabet; the mint is expected to roll again.
    const rolls = [[0, 15, 15, 0, 0, 0], [9, 3, 12, 1, 5, 0]];
    let call = 0;
    const scripted = () => Uint8Array.from(rolls[Math.min(call++, rolls.length - 1)]!);
    expect(generatePoolCode(scripted)).not.toContain("ASS");
    expect(call).toBe(2);
  });

  it("reads a code however it was typed", () => {
    for (const typed of ["kdp472", "KDP-472", " kdp 472 ", "Kdp–472".replace("–", "-")]) {
      expect(normalizePoolCode(typed)).toBe("KDP472");
      expect(isPoolCodeShaped(typed)).toBe(true);
    }
  });

  it("refuses anything that is not the shape, without asking a server", () => {
    // Too short, too long, digits where letters go, letters where digits go, the excluded
    // characters, and an eight-character device claim code, which is the near miss that matters.
    for (const wrong of ["KDP47", "KDP4722", "K2P472", "KDPA72", "KIP472", "KDP102", "Q7MN4PK2", "", "   "]) {
      expect(isPoolCodeShaped(wrong), wrong).toBe(false);
    }
  });

  it("writes the dash for people and never for storage", () => {
    expect(formatPoolCode("KDP472")).toBe("KDP-472");
    expect(normalizePoolCode(formatPoolCode("KDP472"))).toBe("KDP472");
    // Something that is not a code comes back as typed rather than dressed up as one.
    expect(formatPoolCode("KDP47")).toBe("KDP47");
  });

  it("puts the dash in as the sixth character is typed, not before", () => {
    expect(formatPoolCodeWhileTyping("k")).toBe("K");
    expect(formatPoolCodeWhileTyping("kdp")).toBe("KDP");
    expect(formatPoolCodeWhileTyping("kdp4")).toBe("KDP-4");
    expect(formatPoolCodeWhileTyping("kdp472")).toBe("KDP-472");
    expect(formatPoolCodeWhileTyping("kdp4729999")).toBe("KDP-472");
  });

  it("is not the claim code's alphabet by accident", () => {
    // A claim code allows 0/1-free letters and digits anywhere; a join code fixes the halves.
    expect(generatePoolCode(bytesOf(0, 0, 0, 0, 0, 0))).toBe("AAA222");
  });
});
