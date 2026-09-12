import { describe, expect, it } from "vitest";
import { shouldLock, slideLabel, slideProgress } from "../../src/components/SlideToLock.tsx";

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

describe("slide feedback", () => {
  it("clamps visual progress to the track", () => {
    expect(slideProgress(-20, 100)).toBe(0);
    expect(slideProgress(28, 100)).toBe(0.28);
    expect(slideProgress(150, 100)).toBe(1);
    expect(slideProgress(20, 0)).toBe(0);
  });

  it("gives clear feedback while progressing toward the forgiving release point", () => {
    expect(slideLabel(0, false)).toBe("Slide to lock in");
    expect(slideLabel(0.35, false)).toBe("Keep sliding →");
    expect(slideLabel(0.55, false)).toBe("Release to lock it in");
    expect(slideLabel(1, true)).toBe("Locking in…");
  });
});
