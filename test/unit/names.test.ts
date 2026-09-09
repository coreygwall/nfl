import { describe, expect, it } from "vitest";
import { nameKey, normalizeName, validateName } from "../../shared/names.ts";

describe("names", () => {
  it("normalises whitespace and unicode", () => {
    expect(normalizeName("  Corey   W \n")).toBe("Corey W");
    expect(nameKey(" COREY  w ")).toBe("corey w");
    expect(nameKey("ｃorey")).toBe("corey"); // NFKC folds full-width
  });
  it("validates length and characters", () => {
    expect(validateName("C")).toMatchObject({ ok: false });
    expect(validateName("x".repeat(25))).toMatchObject({ ok: false });
    expect(validateName("Corey <script>")).toMatchObject({ ok: false });
    expect(validateName(42)).toMatchObject({ ok: false });
    expect(validateName("Mr. O'Neil-Jr")).toEqual({ ok: true, name: "Mr. O'Neil-Jr" });
    expect(validateName("José 2")).toEqual({ ok: true, name: "José 2" });
  });
});
