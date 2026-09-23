import { expect, test, type Page } from "@playwright/test";

/**
 * A golf card opened from its link, by somebody with no account.
 *
 * That last part is the whole point and it is what this suite is careful about: it never signs in,
 * never visits a pool, and never touches the app's storage. Everything it does, a stranger holding
 * a link in a group chat can do — which is the promise the feature makes, and the one that breaks
 * silently if a guard creeps in later.
 */
const CARD = {
  id: "e2e-golf-card",
  name: "Saturday scramble",
  course: "Blue Hill",
  createdAt: "2026-09-19T12:00:00.000Z",
  settingsUpdatedAt: "2026-09-19T12:00:00.000Z",
  players: [
    { id: "c", name: "Corey" },
    { id: "d", name: "Dan" },
    { id: "p", name: "Pete" },
    { id: "s", name: "Sam" },
  ],
  // Hole 1 a par 4, hole 2 a par 3 — which is what makes hole 2 host a closest to the pin.
  pars: [4, 3, 5, 4, 3, 5, 4, 4, 4],
  holes: [],
  contests: { longestDrive: true, closestToPin: true },
  points: {
    enabled: true,
    shotKept: { on: false, each: 0 },
    longestDrive: { on: true, each: 10 },
    closestToPin: { on: true, each: 10 },
  },
};

/** Publish through the API, exactly as the app does — there is no way to make a card on the web. */
async function publish(page: Page): Promise<string> {
  const res = await page.request.post("/api/golf/cards", { data: { card: CARD } });
  expect(res.ok()).toBe(true);
  const body = (await res.json()) as { token: string };
  expect(body.token).toMatch(/^[A-HJ-NP-Z2-9]{24}$/);
  return body.token;
}

test.describe.serial("a shared golf card", () => {
  let token = "";

  test("opens from the link with no account, and keeps a hole", async ({ page }) => {
    token = await publish(page);
    await page.goto(`/g/${token}`);

    // The card's own shell, not the pool's: the name in the header and the contest's three tabs.
    await expect(page.getByRole("heading", { name: "Hole 1" })).toBeVisible();
    await expect(page.getByText("Saturday scramble").first()).toBeVisible();
    await expect(page.getByRole("link", { name: "Round" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Tally" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Scorecard" })).toBeVisible();
    // And nothing the pool's shell would draw.
    await expect(page.getByRole("link", { name: "Picks" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Board" })).toHaveCount(0);

    // Two shots, then the review — the hole does not close on a tap.
    await page.getByRole("button", { name: /^Corey/ }).click();
    await page.getByRole("button", { name: /^Dan/ }).click();
    await page.getByRole("button", { name: "Dan holed it" }).click();

    const review = page.getByRole("region", { name: "Finish hole 1" });
    await expect(review).toBeVisible();
    await expect(review.getByText("Dan holed it.")).toBeVisible();
    await expect(review.getByText("1 shot").first()).toBeVisible();

    // It closes on one deliberate act: a slide on a touch phone, this button on a desktop. The
    // pool's pick flow pairs the two the same way, and CSS draws exactly one of them.
    await review.getByRole("button", { name: "Finish the hole" }).click();
    await expect(page.getByRole("heading", { name: "Hole 2" })).toBeVisible({ timeout: 10_000 });
  });

  test("the hole survives a reload, because it went to the server", async ({ page }) => {
    await page.goto(`/g/${token}`);
    await page.getByRole("link", { name: "Scorecard" }).click();
    // Hole 1: par 4, two strokes, and both of them somebody's.
    await expect(page.getByRole("link", { name: /^Hole 1, par 4, 2 — eagle/ })).toBeVisible();
    await expect(page.getByText("TOTAL")).toBeVisible();
  });

  /**
   * Par decides where a contest runs and nothing else does, so hole 2 being a three is what puts
   * the closest to the pin on it. Claiming it moves the pot: ten each from four players is +30 to
   * whoever takes it and −10 to the other three, and the column adds to nothing.
   */
  test("claims a side game and the pot settles", async ({ page }) => {
    await page.goto(`/g/${token}?hole=2`);
    const strip = page.getByRole("region", { name: "Closest to the pin" });
    await expect(strip).toBeVisible();
    await expect(strip.getByText("Who was closest to the pin?")).toBeVisible();
    await strip.getByRole("button", { name: "Corey" }).click();
    await expect(strip.getByText("Corey was closest to the pin.")).toBeVisible();

    await page.getByRole("link", { name: "Tally" }).click();
    const points = page.getByRole("region", { name: "Points" });
    await expect(points.getByText("+30")).toBeVisible();
    await expect(points.getByText("−10").first()).toBeVisible();
    await expect(points.getByText("10 each on a closest to the pin")).toBeVisible();
  });

  test("everything about the card is editable from the link", async ({ page }) => {
    await page.goto(`/g/${token}`);
    await page.getByRole("button", { name: "Names, pars and stakes" }).click();
    const sheet = page.getByRole("dialog", { name: "This card" });
    await expect(sheet).toBeVisible();

    await sheet.getByRole("textbox", { name: "Card name" }).fill("Sunday scramble");
    await page.keyboard.press("Escape");
    await expect(page.getByText("Sunday scramble").first()).toBeVisible();

    // And it is the *server's* card that changed, not this tab's idea of one.
    await page.reload();
    await expect(page.getByText("Sunday scramble").first()).toBeVisible();
  });

  /**
   * The rule the group assumed they were playing and the app was not.
   *
   * Hole 2 is the first par 3 and hole 5 is the second. Finish 2 without naming anybody and its
   * stakes roll: hole 5 is then worth two holes to whoever takes it, and the settle-up says so as
   * an instruction rather than a column somebody has to solve.
   */
  test("a hole nobody wins rolls into the next one, and the board says who pays whom", async ({ page }) => {
    const res = await page.request.post("/api/golf/cards", {
      data: {
        card: {
          ...CARD,
          id: "e2e-golf-carry",
          name: "Carry it over",
          points: {
            ...CARD.points,
            longestDrive: { on: false, each: 0, carry: false },
            closestToPin: { on: true, each: 10, carry: true },
          },
        },
      },
    });
    expect(res.ok()).toBe(true);
    const { token: carried } = (await res.json()) as { token: string };

    // Hole 2 is played out and nobody is named for the closest to the pin.
    await page.goto(`/g/${carried}?hole=2`);
    // By name and kept-count: hole 2 is a par 3, so the contest strip above has a "Corey" button
    // of its own and that is exactly the one this must not press.
    await page.getByRole("region", { name: "Log a stroke" }).getByRole("button", { name: /^Corey/ }).click();
    await page.getByRole("button", { name: "Corey holed it" }).click();
    await page.getByRole("region", { name: "Finish hole 2" }).getByRole("button", { name: "Finish the hole" }).click();

    await page.getByRole("link", { name: "Tally" }).click();
    const riding = page.getByLabel("Closest to the pin riding");
    await expect(riding).toBeVisible();
    await expect(riding.getByText("1 hole riding")).toBeVisible();
    // Two holes at ten a head from three other players.
    await expect(riding.getByText(/is worth 60 to whoever takes it/)).toBeVisible();

    // Dan takes the next one and the whole pot goes with it.
    await page.goto(`/g/${carried}?hole=5`);
    await page.getByRole("region", { name: "Closest to the pin" }).getByRole("button", { name: "Dan" }).click();
    await page.getByRole("link", { name: "Tally" }).click();
    await expect(page.getByRole("region", { name: "Points" }).getByText("+60")).toBeVisible();
    await expect(page.getByLabel("Closest to the pin riding")).toHaveCount(0);

    // And the answer the group actually wanted: three names, one payee, no arithmetic.
    const settling = page.getByRole("region", { name: "Settling up" });
    await expect(settling.getByText("Corey")).toBeVisible();
    await expect(settling.getByText(/3 payments and everybody.s square/)).toBeVisible();
  });

  test("a link that names no card says so rather than pretending", async ({ page }) => {
    await page.goto("/g/ABCDEFGHJKMNPQRSTUVWXYZ2");
    await expect(page.getByText(/isn't here/)).toBeVisible();
    await expect(page.getByText(/only reachable by their link/)).toBeVisible();
  });
});
