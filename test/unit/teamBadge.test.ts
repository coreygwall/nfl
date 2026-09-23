import { describe, expect, it } from "vitest";
import { labelIsDark, TEAMS } from "../../shared/teams.ts";

/**
 * A team is drawn as its colours and abbreviation, not its logo (`TeamSticker`, both surfaces),
 * so the letters are the whole identification — they have to read on every team's primary. 3:1
 * is WCAG's floor for large, bold text, which is what the sticker sets.
 */
function luminance(hex: string): number {
  const d = hex.replace(/^#/, "");
  const c = (i: number) => {
    const v = parseInt(d.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * c(0) + 0.7152 * c(2) + 0.0722 * c(4);
}
const contrast = (a: number, b: number) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);

describe("team stickers", () => {
  it("pick a label colour that reads on every team's primary", () => {
    for (const team of Object.values(TEAMS)) {
      const label = labelIsDark(team.primary) ? 0 : 1;
      expect(contrast(luminance(team.primary), label), `${team.abbr} on ${team.primary}`).toBeGreaterThanOrEqual(3);
    }
  });

  it("goes dark on a light colour and white on a dark one", () => {
    expect(labelIsDark("#FFB612")).toBe(true);
    expect(labelIsDark("#0B162A")).toBe(false);
    expect(labelIsDark("not a colour")).toBe(false);
  });
});
