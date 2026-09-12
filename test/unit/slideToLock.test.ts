import { describe, expect, it } from "vitest";
import { shouldLock } from "../../src/components/SlideToLock.tsx";

describe("slide to lock release", () => {
  it("accepts a slow drag just beyond halfway", () => expect(shouldLock(111, 200, 0)).toBe(true));
  it("accepts an intentional short forward flick", () => expect(shouldLock(55, 200, 0.5)).toBe(true));
  it("rejects taps and tiny flicks", () => expect(shouldLock(15, 200, 2)).toBe(false));
  it("rejects a short slow or backwards release", () => {
    expect(shouldLock(55, 200, 0.1)).toBe(false);
    expect(shouldLock(55, 200, -1)).toBe(false);
  });
  it("rejects an unmeasured track", () => expect(shouldLock(0, 0, 1)).toBe(false));
});
