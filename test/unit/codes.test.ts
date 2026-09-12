import { describe, expect, it } from "vitest";
import { CODE_LENGTH, codesMatch, formatCode, generateCode, isCodeShaped, normalizeCode } from "../../shared/codes.ts";

describe("claim codes", () => {
  it("generates readable codes without the characters people misread", () => {
    for (let i = 0; i < 200; i++) {
      const code = generateCode();
      expect(code).toHaveLength(CODE_LENGTH);
      expect(code).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]+$/);
      expect(code).not.toMatch(/[ILO01]/);
    }
  });

  it("does not repeat itself", () => {
    const seen = new Set(Array.from({ length: 500 }, () => generateCode()));
    expect(seen.size).toBeGreaterThan(495);
  });

  it("accepts the code however it is typed back", () => {
    const code = "QRT49MKP";
    for (const typed of ["QRT49MKP", "qrt4-9mkp", " QRT4 9MKP ", "qrt4 - 9mkp"]) {
      expect(normalizeCode(typed)).toBe(code);
      expect(codesMatch(typed, code)).toBe(true);
    }
    expect(codesMatch("QRT49MKQ", code)).toBe(false);
    expect(codesMatch("", code)).toBe(false);
    expect(codesMatch("QRT49MK", code)).toBe(false);
  });

  it("formats for reading aloud and validates shape", () => {
    expect(formatCode("QRT49MKP")).toBe("QRT4-9MKP");
    expect(isCodeShaped("qrt4-9mkp")).toBe(true);
    expect(isCodeShaped("QRT49MK")).toBe(false);
    expect(isCodeShaped("QRT49MK0")).toBe(false); // 0 is not in the alphabet
    expect(isCodeShaped(null)).toBe(false);
  });
});
