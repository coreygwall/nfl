import { expect, test, type Page } from "@playwright/test";

const BEFORE = "2026-09-09T12:00:00Z"; // Wednesday morning, nothing started
const AFTER_OPENER = "2026-09-10T03:00:00Z"; // NE @ SEA kicked off

const pick = (page: Page, team: string) => page.getByRole("button", { name: `Pick ${team}` }).click();

test.describe.serial("pool flow", () => {
  test("new player picks five, ranks, locks in", async ({ page }) => {
    await page.goto(`/welcome?now=${BEFORE}`);
    await page.getByPlaceholder("Your name").fill("Corey");
    await page.getByRole("button", { name: "Let's go" }).click();
    await expect(page).toHaveURL(/\/week\/1$/);
    await expect(page.getByText("No weekly deadline")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Pick 5 winners" })).toBeVisible();

    for (const t of ["Seattle Seahawks", "San Francisco 49ers", "Buffalo Bills", "Cincinnati Bengals", "Detroit Lions"]) {
      await pick(page, t);
    }
    // A sixth pick is refused.
    await pick(page, "Kansas City Chiefs");
    await expect(page.getByText("That's five already")).toBeVisible();

    await page.getByRole("button", { name: "Rank them" }).click();
    await expect(page.getByText("How sure are you?")).toBeVisible();
    // Move the Seahawks (top) down one: 49ers become the 5-pointer.
    await page.getByRole("button", { name: "Move down" }).first().click();
    await page.getByRole("button", { name: "Looks right" }).click();
    await expect(page.getByText("Locking in for")).toBeVisible();
    await expect(page.getByText("up to 15 points")).toBeVisible();
    await page.getByRole("button", { name: "Lock it in" }).click();
    await expect(page.getByText("Locked in")).toBeVisible();
    await page.getByRole("button", { name: "Done" }).click();
    await expect(page.getByText("Your five")).toBeVisible();
    await expect(page.getByText("Picks in ✓")).toBeVisible();

    // Reload keeps the identity and the saved picks.
    await page.reload();
    await expect(page.getByText("Your five")).toBeVisible();
    await expect(page.getByRole("button", { name: "Switch player" })).toContainText("Corey");
  });

  test("second player sees the roster, can't see hidden picks, admin scores the week", async ({ page }) => {
    await page.goto(`/welcome?now=${BEFORE}`);
    await expect(page.getByText("Tap your name")).toBeVisible();
    await expect(page.getByRole("button", { name: "Corey" })).toBeVisible();
    await page.getByRole("button", { name: "Add my name" }).click();
    await page.getByPlaceholder("Your name").fill("corey"); // taken, case-insensitive
    await page.getByRole("button", { name: "Let's go" }).click();
    await expect(page.getByText("already picking as")).toBeVisible();
    await page.getByRole("button", { name: "No, try another name" }).click();
    await page.getByPlaceholder("Your name").fill("Alex");
    await page.getByRole("button", { name: "Let's go" }).click();
    await expect(page).toHaveURL(/\/week\/1$/);

    for (const t of ["New England Patriots", "Los Angeles Rams", "Houston Texans"]) await pick(page, t);
    await page.getByRole("button", { name: "Rank 3" }).click();
    await page.getByRole("button", { name: "Looks right" }).click();
    await page.getByRole("button", { name: "Lock it in" }).click();
    await expect(page.getByText("Locked in")).toBeVisible();
    await page.getByRole("link", { name: "See the board" }).click();

    await expect(page).toHaveURL(/\/board\/week\/1$/);
    await expect(page.getByText("2 of 2 have picked")).toBeVisible();
    await page.getByRole("button", { name: /Corey/ }).click();
    await expect(page.getByText("5 more picks revealed at kickoff")).toBeVisible();

    // Admin records the opener.
    await page.goto("/admin");
    await page.getByLabel("Admin PIN").fill("0000");
    await page.getByRole("button", { name: "Open up" }).click();
    await expect(page.getByText("Wrong PIN")).toBeVisible();
    await page.getByLabel("Admin PIN").fill("1234");
    await page.getByRole("button", { name: "Open up" }).click();
    await expect(page.getByText("0 of 16 final")).toBeVisible();
    await page.getByRole("button", { name: /Seahawks/ }).first().click();
    await expect(page.getByText("1 of 16 final")).toBeVisible();
  });

  test("after kickoff the pick is frozen and the board reveals it", async ({ page }) => {
    // Alex is remembered on this device (same browser context is NOT shared across tests, so re-select).
    await page.goto(`/welcome?now=${AFTER_OPENER}`);
    await page.getByRole("button", { name: "Alex" }).click();
    await expect(page).toHaveURL(/\/week\/1$/);
    await expect(page.getByText("0 of 1 right so far")).toBeVisible();
    await expect(page.getByText("Who picked whom")).toBeVisible();

    await page.getByRole("button", { name: "Edit picks" }).click();
    await expect(page.getByText("Final")).toBeVisible();
    await expect(page.getByRole("button", { name: "Pick Seattle Seahawks" })).toBeDisabled();
    // Add two more unlocked picks and save; the frozen Patriots pick survives.
    await pick(page, "Green Bay Packers");
    await pick(page, "Miami Dolphins");
    await page.getByRole("button", { name: "Rank" }).first().click();
    await expect(page.getByText("Locked in")).toBeVisible(); // frozen section header
    await page.getByRole("button", { name: "Looks right" }).click();
    await page.getByRole("button", { name: "Lock it in" }).click();
    await expect(page.getByText("Nice, Alex.")).toBeVisible();

    await page.goto(`/board/week/1`);
    await expect(page.getByText("1 of 16 games final")).toBeVisible();
    const corey = page.getByRole("button", { name: /Corey/ });
    await expect(corey).toContainText("4");
    await corey.click();
    await expect(page.getByText("4 more picks revealed at kickoff")).toBeVisible();
    await expect(page.getByText("+4")).toBeVisible();

    await page.getByRole("tab", { name: "Season" }).click();
    await expect(page.getByText("through Week 1")).toBeVisible();
  });
});

test("a player who shows up Sunday night can still pick what's left", async ({ page }) => {
  // Only the Sunday night and Monday night games have yet to kick off.
  const SUNDAY_NIGHT = "2026-09-13T22:00:00Z";
  await page.goto(`/welcome?now=${SUNDAY_NIGHT}`);
  await page.getByRole("button", { name: "Add my name" }).click();
  await page.getByPlaceholder("Your name").fill("Sunday Nighter");
  await page.getByRole("button", { name: "Let's go" }).click();

  // The ask scales to what is actually still available — no dead five-slot tray.
  await expect(page.getByRole("heading", { name: "Pick 2 winners" })).toBeVisible();
  await expect(page.getByText("2 open")).toBeVisible();
  await expect(page.getByText("Already kicked off (14)")).toBeVisible();

  await page.getByRole("button", { name: "Pick New York Giants" }).click();
  await page.getByRole("button", { name: "Pick Kansas City Chiefs" }).click();
  await page.getByRole("button", { name: "Rank them" }).click();
  await expect(page.getByText("How sure are you?")).toBeVisible();
  await page.getByRole("button", { name: "Looks right" }).click();
  // Two picks are still worth the top two rank values: 5 + 4.
  await expect(page.getByText("up to 9 points")).toBeVisible();
  await page.getByRole("button", { name: "Lock it in" }).click();
  await expect(page.getByText("Locked in")).toBeVisible();
});

test("the shared link unfurls with absolute image and url, and the rules page reads", async ({ page, baseURL }) => {
  const res = await page.request.get("/");
  expect(res.status()).toBe(200);
  const html = await res.text();
  expect(html).toContain(`property="og:image" content="${baseURL}/og.jpg"`);
  expect(html).toContain(`property="og:url" content="${baseURL}/"`);
  expect(html).toContain(`name="twitter:image" content="${baseURL}/og.jpg"`);
  expect(html).toContain("<title>High Five</title>");
  const img = await page.request.get("/og.jpg");
  expect(img.status()).toBe(200);
  expect(img.headers()["content-type"]).toContain("image/jpeg");

  await page.goto("/rules");
  await expect(page.getByRole("heading", { name: "How High Five works" })).toBeVisible();
  await expect(page.getByText("No weekly deadline")).toBeVisible();
  await page.getByRole("link", { name: "Join the pool" }).click();
  await expect(page).toHaveURL(/\/welcome$/);
  await expect(page.getByText("Step 1")).toBeVisible();
});
