import { expect, test, type Page } from "@playwright/test";

const BEFORE = "2026-09-09T12:00:00Z"; // Wednesday morning, nothing started
const AFTER_OPENER = "2026-09-10T03:00:00Z"; // NE @ SEA kicked off

const pick = (page: Page, team: string) => page.getByRole("button", { name: `Pick ${team}` }).click();

/** Alex's claim code, read off the first device in one test and typed into the next. */
let alexCode = "";

test.describe.serial("pool flow", () => {
  test("new player picks five, ranks, locks in", async ({ page }) => {
    await page.goto(`/welcome?now=${BEFORE}`);
    await page.getByPlaceholder("Your name").fill("Corey");
    await page.getByRole("button", { name: "Let's go" }).click();
    await expect(page).toHaveURL(/\/week\/1$/);
    await expect(page.locator('header img[src="/icon.svg"]')).toBeVisible();
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
    // Ranking is the confirmation: there is no separate screen to click through.
    await expect(page.getByText("Up to 15 this week")).toBeVisible();
    await page.getByRole("button", { name: "Lock it in" }).click();
    await expect(page.getByText("Locked in")).toBeVisible();
    await page.getByRole("button", { name: "Done" }).click();
    await expect(page.getByText("Your five")).toBeVisible();
    await expect(page.getByText("Picks in ✓")).toBeVisible();

    // Reload keeps the identity and the saved picks.
    await page.reload();
    await expect(page.getByText("Your five")).toBeVisible();
    await expect(page.getByRole("button", { name: "Switch player" })).toContainText("Corey");

    await page.getByRole("link", { name: "Rules" }).click();
    await expect(page).toHaveURL(/\/rules$/);
    await expect(page.getByRole("heading", { name: "How to play High Five" })).toBeVisible();
    await expect(page.getByText("Pick five. Rank your confidence. Score up to 15 points every week.")).toBeVisible();
    await expect(page.getByRole("link", { name: "Back to my picks" })).toBeVisible();
  });

  test("a second player is guarded against stealing a name, can't see hidden picks, admin scores the week", async ({ page }) => {
    // First run on a new device asks for a name; the roster is one link away.
    await page.goto(`/welcome?now=${BEFORE}`);
    await expect(page.getByRole("heading", { name: "What should we call you?" })).toBeVisible();
    await page.getByRole("button", { name: "I already entered" }).click();
    await expect(page.getByText("Tap your name")).toBeVisible();
    await expect(page.getByRole("button", { name: "Corey" })).toBeVisible();
    await page.getByRole("button", { name: /Don't see your name/ }).click();

    // A taken name is caught while typing, case-insensitively, and again on submit.
    await page.getByPlaceholder("Your name").fill("corey");
    await expect(page.getByText("Someone's already picking as")).toBeVisible();
    await page.getByRole("button", { name: "Let's go" }).click();
    await expect(page.getByText("is already in the pool")).toBeVisible();

    // Claiming a new entry forces a name that is actually different.
    await page.getByRole("button", { name: "I'm a different Corey" }).click();
    await expect(page.getByRole("heading", { name: "Make it yours" })).toBeVisible();
    await page.getByPlaceholder(/Corey/).fill("Corey");
    await expect(page.getByRole("button", { name: "Join as this name" })).toBeDisabled();
    await page.getByPlaceholder(/Corey/).fill("Alex");
    await page.getByRole("button", { name: "Join as this name" }).click();
    await expect(page).toHaveURL(/\/week\/1$/);

    for (const t of ["New England Patriots", "Los Angeles Rams", "Houston Texans"]) await pick(page, t);
    await page.getByRole("button", { name: "Rank 3" }).click();
    await page.getByRole("button", { name: "Lock it in" }).click();
    await expect(page.getByText("Locked in")).toBeVisible();
    // The code that moves this name to another device lives under the name chip.
    await page.getByRole("button", { name: "Switch player" }).click();
    const sheet = page.getByRole("dialog", { name: "Your account" });
    alexCode = (await sheet.getByText(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/).innerText()).trim();
    expect(alexCode).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    await sheet.getByRole("button", { name: "Close" }).click();
    await expect(sheet).toBeHidden();
    await page.getByRole("link", { name: "See the board" }).click();

    await expect(page).toHaveURL(/\/board\/week\/1$/);
    const primaryNav = page.getByRole("navigation", { name: "Primary navigation" });
    await expect(primaryNav.getByRole("link", { name: "Board" })).toHaveAttribute("aria-current", "page");
    await expect(primaryNav.getByRole("link", { name: "Picks" })).not.toHaveAttribute("aria-current", "page");
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
    await page.getByRole("button", { name: "I already entered" }).click();
    await page.getByRole("button", { name: "Alex" }).click();
    // A name someone already holds is not free to take: the code is the proof.
    await expect(page.getByRole("heading", { name: "Prove you're Alex" })).toBeVisible();
    await page.getByLabel("Your device code").fill("AAAA-2222");
    await page.getByRole("button", { name: "Pick as Alex" }).click();
    await expect(page.getByText("That code doesn't match")).toBeVisible();
    await page.getByLabel("Your device code").fill(alexCode);
    await page.getByRole("button", { name: "Pick as Alex" }).click();
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
    await page.getByRole("button", { name: "Lock it in" }).click();
    await expect(page.getByText("Nice, Alex.")).toBeVisible();

    await page.goto(`/board/week/1`);
    await expect(page.getByText("1 of 16 games final")).toBeVisible();
    const corey = page.getByRole("button", { name: /Corey/ });
    await expect(corey).toContainText("4");
    await corey.click();
    await expect(page.getByText("4 more picks revealed at kickoff")).toBeVisible();
    await expect(page.getByText("+4")).toBeVisible();

    // Sorting by potential reorders without renaming anyone's standing.
    await page.getByRole("tab", { name: "Potential" }).click();
    await expect(page).toHaveURL(/sort=possible/);
    await expect(page.getByRole("tab", { name: "Potential" })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByText(/up to/).first()).toBeVisible();
    await page.getByRole("tab", { name: "Points" }).click();
    await expect(page).not.toHaveURL(/sort=/);

    await page.getByRole("tab", { name: "Season" }).click();
    await expect(page.getByText("through Week 1")).toBeVisible();
  });
});

test("a sign-in link claims the name in one tap, with no code to type", async ({ page, request }) => {
  const name = `Linked ${Date.now().toString(36)}`;
  const created = await request.post("/api/players", { data: { name } });
  const { player, code } = (await created.json()) as { player: { id: string }; code: string };

  await page.goto(`/welcome?claim=${player.id}&code=${code}&now=${BEFORE}`);
  await expect(page).toHaveURL(/\/week\/1$/);
  await expect(page.getByRole("button", { name: "Switch player" })).toContainText(name);

  // The code does not stay in the address bar, and the device is really signed in.
  await page.reload();
  await expect(page.getByRole("button", { name: "Switch player" })).toContainText(name);
});

test("a sign-in link with the wrong code falls back to typing it", async ({ page, request }) => {
  const name = `Mislinked ${Date.now().toString(36)}`;
  const created = await request.post("/api/players", { data: { name } });
  const { player } = (await created.json()) as { player: { id: string } };

  await page.goto(`/welcome?claim=${player.id}&code=AAAA2222&now=${BEFORE}`);
  await expect(page.getByRole("heading", { name: `Prove you're ${name}` })).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`claim=${player.id}$`));
});

test("a player who shows up Sunday night can still pick what's left", async ({ page }) => {
  // Only the Sunday night and Monday night games have yet to kick off.
  const SUNDAY_NIGHT = "2026-09-13T22:00:00Z";
  await page.goto(`/welcome?now=${SUNDAY_NIGHT}`);
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
  // Two picks are still worth the top two rank values: 5 + 4.
  await expect(page.getByText("Up to 9 this week")).toBeVisible();
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
  await expect(page.getByRole("heading", { name: "How to play High Five" })).toBeVisible();
  await expect(page.getByText("No weekly deadline")).toBeVisible();
  await page.getByRole("link", { name: "Join the pool" }).click();
  await expect(page).toHaveURL(/\/welcome$/);
  await expect(page.getByText("Step 1")).toBeVisible();
});
