import { expect, test, type Page } from "@playwright/test";

const BEFORE = "2026-09-09T12:00:00Z"; // Wednesday morning, nothing started
const AFTER_OPENER = "2026-09-10T03:00:00Z"; // NE @ SEA kicked off

const pick = (page: Page, team: string) => page.getByRole("button", { name: `Pick ${team}` }).click();

/** Make this browser advertise the built-in biometric authenticator the signup offer requires. */
const enablePlatformBiometrics = (page: Page) => page.addInitScript(() => {
  if (typeof PublicKeyCredential !== "function") return;
  Object.defineProperty(PublicKeyCredential, "isUserVerifyingPlatformAuthenticatorAvailable", {
    configurable: true,
    value: async () => true,
  });
});

/** The account tab: the name, the entries, the sign-in code and the appearance control. It used
 *  to be a sheet hanging off a chip in the header; the chip was also the entry switcher, and the
 *  two jobs have gone their separate ways. */
async function openAccount(page: Page) {
  // By address rather than by tab, because the tab bar is deliberately *not* drawn while picks are
  // being made — the tray takes its place — and half of these tests are standing in the pick flow
  // when they ask for it. The clock override lives in sessionStorage, so a full load keeps it.
  // Reaching it by tab is covered once, from home, in the smoke test above.
  await page.goto("/p/high-five/account");
  await expect(page).toHaveURL(/\/account$/);
}

/** The account this device is signed in as, which the account tab states in its heading. */
async function expectSignedInAs(page: Page, name: string) {
  await openAccount(page);
  await expect(page.getByRole("heading", { name, level: 1 })).toBeVisible();
}

/** The entry being picked as, which the picker above the picks answers — it is drawn whenever
 *  there is more than one entry, which is the only time the question has an answer worth giving. */
async function expectPickingAs(page: Page, name: string) {
  await expect(page.getByRole("button", { name: `Pick as ${name}` })).toHaveAttribute("aria-pressed", "true");
}

/** Alex's claim code, read off the first device in one test and typed into the next. */
let alexCode = "";

test.describe.serial("pool flow", () => {
  test("new player picks five, ranks, locks in", async ({ page }) => {
    await enablePlatformBiometrics(page);
    await page.goto(`/welcome?now=${BEFORE}`);
    // The name field doubles as the passkey field: without "webauthn" in its autocomplete, a
    // returning player's passkey never appears in the browser's suggestions and nobody notices.
    await expect(page.getByPlaceholder("Your name")).toHaveAttribute("autocomplete", "username webauthn");
    await page.getByPlaceholder("Your name").fill("Corey");
    await page.getByRole("button", { name: "Let's go" }).click();
    const welcome = page.getByRole("dialog", { name: "You’re all set" });
    await expect(welcome.getByText("you won’t need to sign in again here")).toBeVisible();
    await expect(welcome.getByText("Face ID does the rest")).toBeVisible();
    await expect(welcome.getByText(/passkey/i)).toBeHidden();
    // Turning it on leads, because that one tap is what makes every other device and the iOS app
    // free afterwards. Getting straight to picking stays available, just underneath.
    const buttons = await welcome.getByRole("button").allInnerTexts();
    expect(buttons.indexOf("Turn on Face ID or fingerprint")).toBeLessThan(buttons.indexOf("Not now — start picking →"));
    await welcome.getByRole("button", { name: "Not now — start picking →" }).click();
    await expect(page).toHaveURL(/\/week\/1$/);
    await expect(page.locator('header img[src="/icon.svg"]')).toBeVisible();
    await expect(page.getByRole("button", { name: "High Five. Switch pool" })).toBeVisible();
    await expect(page.getByText("No weekly deadline")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Pick 5 winners" })).toBeVisible();

    // Picks is deliberately focused on a phone, but never a cul-de-sac. The one-tap Pool home
    // route is how someone checks standings or a past week without abandoning their draft.
    await page.getByRole("link", { name: "Go to pool home" }).click();
    await expect(page).toHaveURL(/\/p\/high-five\/?$/);
    await expect(page.getByRole("heading", { name: "Explore the pool" })).toBeVisible();
    await expect(page.getByRole("link", { name: /Season standings/ })).toBeVisible();
    await expect(page.getByRole("link", { name: "Week 1", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "High Five. Switch pool" }).click();
    const pools = page.getByRole("dialog", { name: "Pools" });
    // The lockup is not a switcher here and has stopped pretending to be one: on the web a pool is
    // an address, so this names the one you are standing in and says how to get into another.
    await expect(pools.getByText("High Five").first()).toBeVisible();
    await expect(pools.getByRole("heading", { name: "Join a pool" })).toBeVisible();
    await pools.getByRole("button", { name: "Close" }).click();
    await expect(pools).toBeHidden();

    // Account is a tab now, not a chip in the header. The offices behind it — a commissioner's and
    // the league's — were routes with nothing in the app linking to them.
    await page.getByRole("link", { name: "Account" }).first().click();
    await expect(page).toHaveURL(/\/account$/);
    await expect(page.getByRole("heading", { name: "Signed in as" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Corey", level: 1 })).toBeVisible();
    // Nobody here runs the pool, so the office rows are not drawn at all.
    await expect(page.getByRole("link", { name: /Commissioner/ })).toHaveCount(0);
    await page.goto(`/week/1?now=${BEFORE}`);
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
    await expectSignedInAs(page, "Corey");

    // Rules left the nav bar: it is a document you read once, reached from home and the board,
    // which is also where the question occurs to people.
    await expect(page.getByRole("link", { name: "Rules" })).toHaveCount(0);
    await page.getByRole("link", { name: "Home" }).first().click();
    await expect(page).toHaveURL(/\/p\/high-five\/?$/);
    await expect(page.getByRole("heading", { name: "High Five" })).toBeVisible();
    await expect(page.getByText("Your picks are in.")).toBeVisible();
    await page.getByRole("link", { name: "How scoring works" }).click();
    await expect(page).toHaveURL(/\/rules$/);
    await expect(page.getByRole("heading", { name: "How to play High Five" })).toBeVisible();
    await expect(page.getByText("Pick five. Rank your confidence. Score up to 15 points every week.")).toBeVisible();
    await expect(page.getByRole("link", { name: "Back to my picks" })).toBeVisible();
  });

  test("a second player is guarded against stealing a name, can't see hidden picks, and the offices split", async ({ page }) => {
    await enablePlatformBiometrics(page);
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
    await page.getByRole("dialog", { name: "You’re all set" }).getByRole("button", { name: "Not now — start picking →" }).click();
    await expect(page).toHaveURL(/\/week\/1$/);

    for (const t of ["New England Patriots", "Los Angeles Rams", "Houston Texans"]) await pick(page, t);
    await page.getByRole("button", { name: "Rank 3" }).click();
    await page.getByRole("button", { name: "Lock it in" }).click();
    await expect(page.getByText("Locked in")).toBeVisible();
    // The code that moves this name to another device is on the account tab, one row in.
    await openAccount(page);
    await page.getByRole("button", { name: /Sign in on another device/ }).click();
    alexCode = (await page.getByText(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/).innerText()).trim();
    expect(alexCode).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    await page.goBack();
    await page.getByRole("link", { name: "See the board" }).click();

    await expect(page).toHaveURL(/\/board\/week\/1$/);
    const primaryNav = page.getByRole("navigation", { name: "Primary navigation" });
    await expect(primaryNav.getByRole("link", { name: "Board" })).toHaveAttribute("aria-current", "page");
    await expect(primaryNav.getByRole("link", { name: "Picks" })).not.toHaveAttribute("aria-current", "page");
    await expect(page.getByText("2 of 2 have picked")).toBeVisible();
    await page.getByRole("button", { name: /Corey/ }).click();
    await expect(page.getByText("5 picks still hidden — the team shows at kickoff")).toBeVisible();
    // Five places are drawn from the start; hidden picks hold their own rank rather than
    // bunching at the end, so the row fills in instead of growing.
    const slots = page.getByRole("list", { name: "Picks, most confident first" }).first();
    await expect(slots.getByRole("listitem")).toHaveCount(5);

    // The commissioner's office belongs to an account, not to whoever knows a PIN — so a player
    // who wanders in is told whose pool it is rather than handed a box to guess at. The PIN is
    // still the way the owner takes the keys, and it is entered exactly once.
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/commissioner$/);
    await expect(page.getByRole("heading", { name: "This isn't your pool to run" })).toBeVisible();
    await page.getByRole("button", { name: /I own this pool/ }).click();
    await page.getByLabel("Owner PIN").fill("0000");
    await page.getByRole("button", { name: "Take the keys" }).click();
    await expect(page.getByText("Wrong PIN")).toBeVisible();
    await page.getByLabel("Owner PIN").fill("1234");
    await page.getByRole("button", { name: "Take the keys" }).click();
    await expect(page.getByRole("tab", { name: "Pool" })).toBeVisible();

    // Results are not in there. Every pool scores the same games, so they are set once, centrally.
    await page.getByRole("link", { name: "Open the league office" }).click();
    await expect(page).toHaveURL(/\/league$/);
    await expect(page.getByText("0 of 16 final")).toBeVisible();
    await page.getByRole("button", { name: /Seahawks/ }).first().click();
    await expect(page.getByText("1 of 16 final")).toBeVisible();

    // The ready list: tick someone off, then narrow to who is still outstanding.
    await page.goto("/commissioner");
    await page.getByRole("tab", { name: "Players" }).click();
    await expect(page.getByText(/0 of \d+ ready to go/)).toBeVisible();
    await page.getByRole("switch", { name: "Corey ready to go" }).click();
    await expect(page.getByRole("switch", { name: "Corey ready to go" })).toHaveAttribute("aria-checked", "true");
    await page.getByRole("tab", { name: /Waiting/ }).click();
    await expect(page.getByRole("switch", { name: "Corey ready to go" })).toBeHidden();
    await page.getByRole("tab", { name: /^Ready/ }).click();
    await expect(page.getByRole("switch", { name: "Corey ready to go" })).toBeVisible();

    // The roster is a list by default, with columns rather than thirteen identical cards, and the
    // once-a-season actions are behind a menu instead of shouting alongside the weekly ones. The
    // suite runs at phone width, where the columns have already dropped away by design — so the
    // header is checked where it exists.
    await page.setViewportSize({ width: 1280, height: 900 });
    await expect(page.getByText("Code", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Rename" })).toHaveCount(0);
    await page.getByRole("button", { name: /^More for Corey/ }).click();
    await expect(page.getByRole("menuitem", { name: "Rename" })).toBeVisible();
    await expect(page.getByRole("menuitem", { name: "Remove from pool" })).toBeVisible();

    // A `menu` role is a promise about the keyboard: opening hands focus to the first item, and
    // the arrows walk the list rather than scrolling the page behind it. Corey is nobody's entry
    // and isn't the commissioner here (Alex is), so "Add to my account" leads — the one row this
    // suite's Corey happens to share the shape of every ordinary independent player.
    await expect(page.getByRole("menuitem", { name: "Add to my account" })).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await expect(page.getByRole("menuitem", { name: "Rename" })).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await expect(page.getByRole("menuitem", { name: "Reset access" })).toBeFocused();
    await page.keyboard.press("End");
    await expect(page.getByRole("menuitem", { name: "Remove from pool" })).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await expect(page.getByRole("menuitem", { name: "Add to my account" })).toBeFocused();

    // Escape closes it and puts focus back where it was, rather than at the top of the page.
    await page.keyboard.press("Escape");
    await expect(page.getByRole("menuitem", { name: "Rename" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^More for Corey/ })).toBeFocused();

    // The bare numbers in a row are only legible next to a column header, which a screen reader
    // cannot see — so each cell says what it is.
    await expect(page.getByText(/^\d+ picks$/).first()).toBeAttached();
    await expect(page.getByText(/^\d+ devices$/).first()).toBeAttached();

    // Cards are the other way to look at the same roster, and the choice is remembered.
    await page.getByRole("radio", { name: "Cards" }).click();
    await expect(page.getByText("Code", { exact: true })).toHaveCount(0);
    await page.reload();
    await page.getByRole("tab", { name: "Players" }).click();
    await expect(page.getByRole("radio", { name: "Cards" })).toHaveAttribute("aria-checked", "true");
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
    // The week board says which of the two prizes it settles, and that this one stops here.
    await expect(page.getByText("Most points wins Week 1")).toBeVisible();
    await expect(page.getByText(/don't carry into the season race/)).toBeVisible();
    const corey = page.getByRole("button", { name: /Corey/ });
    await expect(corey).toContainText("4");
    await corey.click();
    await expect(page.getByText("4 picks still hidden — the team shows at kickoff")).toBeVisible();
    // The chip says what the pick was worth, and says it in words for anyone who cannot see colour.
    await expect(page.getByTitle(/Seattle Seahawks — won 4 points/)).toBeVisible();

    // Sorting by potential reorders without renaming anyone's standing.
    await page.getByRole("tab", { name: "Potential" }).click();
    await expect(page).toHaveURL(/sort=possible/);
    await expect(page.getByRole("tab", { name: "Potential" })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByText(/up to/).first()).toBeVisible();
    await page.getByRole("tab", { name: "Points" }).click();
    await expect(page).not.toHaveURL(/sort=/);

    // Week 1 points are the week's own prize, so the season race has not opened yet.
    await page.getByRole("tab", { name: "Season" }).click();
    await expect(page.getByText("Season standings start in Week 2")).toBeVisible();
    await expect(page.getByText(/Most points from Week 2 on wins the season/)).toBeVisible();
    await expect(page.getByRole("button", { name: /Corey/ })).toContainText("No picks yet");
  });
});

test("the pool home is useful even before someone joins", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: async ({ url }: ShareData) => sessionStorage.setItem("shared-pool-url", url ?? ""),
    });
  });
  await page.goto(`/p/high-five/?now=${BEFORE}`);
  await expect(page).toHaveURL(/\/p\/high-five\/?/);
  await expect(page.getByRole("heading", { name: "Explore the pool" })).toBeVisible();
  await expect(page.getByText("Follow the pool without making picks.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "The pool is still open" })).toBeVisible();
  const inviteCopy = page.getByText(/Join for Week 2/);
  const inviteLines = await inviteCopy.evaluate((element) => {
    const style = getComputedStyle(element);
    return Math.round(element.getBoundingClientRect().height / Number.parseFloat(style.lineHeight));
  });
  expect(inviteLines).toBeLessThanOrEqual(2);
  await page.getByRole("button", { name: "Share the pool" }).click();
  await expect.poll(() => page.evaluate(() => sessionStorage.getItem("shared-pool-url"))).toMatch(/\/p\/high-five\/?$/);
  await expect(page.getByRole("link", { name: /Season standings · starts Week 2/ })).toBeVisible();
  await page.getByRole("link", { name: /Season standings/ }).click();
  await expect(page).toHaveURL(/\/board\/season$/);
});

test("desktop copies the invite and the prompt ends at the Sunday Week 2 kickoff", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "share", { configurable: true, value: undefined });
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: async (value: string) => sessionStorage.setItem("copied-pool-url", value) },
    });
  });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`/p/high-five/?now=2026-09-20T16:59:59.999Z`);
  await page.getByRole("button", { name: "Share the pool" }).click();
  await expect.poll(() => page.evaluate(() => sessionStorage.getItem("copied-pool-url"))).toMatch(/\/p\/high-five\/?$/);
  await expect(page.getByText("Pool link copied")).toBeVisible();

  await page.goto(`/p/high-five/?now=2026-09-20T17:00:00.000Z`);
  await expect(page.getByRole("heading", { name: "The pool is still open" })).toHaveCount(0);
});

test("home previews the latest completed week with expandable picks", async ({ page, request }) => {
  // This suite has two established entries at this point; add a third so the compact preview's
  // three-row cap is exercised rather than assuming every pool already has three people.
  await request.post("/api/players", { data: { name: "Preview Player" } });
  const week = await request.get(`/api/league/weeks/1?now=2026-09-15T12:00:00Z`, {
    headers: { "x-admin-pin": "1234" },
  });
  const { games } = await week.json() as { games: Array<{ id: string; home: string }> };
  for (const game of games) {
    await request.put(`/api/league/games/${game.id}/result?now=2026-09-15T12:00:00Z`, {
      headers: { "x-admin-pin": "1234" },
      data: { winner: game.home },
    });
  }

  await page.goto(`/p/high-five/?now=2026-09-15T12:00:00Z`);
  await expect(page.getByRole("heading", { name: "Week 1 results" })).toBeVisible();
  const topThree = page.getByRole("list", { name: "Week 1 top three" });
  await expect(topThree.getByRole("button")).toHaveCount(3);
  await topThree.getByRole("button").first().click();
  await expect(topThree.getByRole("list", { name: "Picks, most confident first" })).toBeVisible();
  await expect(page.getByRole("link", { name: "See the full Week 1 leaderboard" })).toBeVisible();
  await expect(page.getByText("Starts Week 2", { exact: true })).toBeVisible();
});

test("a sign-in link claims the name in one tap, with no code to type", async ({ page, request }) => {
  const name = `Linked ${Date.now().toString(36)}`;
  const created = await request.post("/api/players", { data: { name } });
  const { player, code } = (await created.json()) as { player: { id: string }; code: string };

  await page.goto(`/welcome?claim=${player.id}&code=${code}&now=${BEFORE}`);
  await expect(page).toHaveURL(/\/week\/1$/);
  await expectSignedInAs(page, name);

  // The code does not stay in the address bar, and the device is really signed in.
  await page.reload();
  await expect(page.getByRole("heading", { name, level: 1 })).toBeVisible();
});

test("a sign-in link with the wrong code falls back to typing it", async ({ page, request }) => {
  const name = `Mislinked ${Date.now().toString(36)}`;
  const created = await request.post("/api/players", { data: { name } });
  const { player } = (await created.json()) as { player: { id: string } };

  await page.goto(`/welcome?claim=${player.id}&code=AAAA2222&now=${BEFORE}`);
  await expect(page.getByRole("heading", { name: `Prove you're ${name}` })).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`claim=${player.id}$`));
});

test("one phone can pick for the whole family, and the code stays out of the way", async ({ page, request }) => {
  const stamp = Date.now().toString(36);
  const parent = await (await request.post("/api/players", { data: { name: `Parent ${stamp}` } })).json();

  await page.goto(`/welcome?claim=${parent.player.id}&code=${parent.code}&now=${BEFORE}`);
  await expect(page).toHaveURL(/\/week\/1$/);

  await page.getByRole("button", { name: "Pick Buffalo Bills" }).click();

  // The code is not on show; it is one deliberate tap away, on the account tab.
  await expectSignedInAs(page, `Parent ${stamp}`);
  await expect(page.getByText(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/)).toBeHidden();
  await page.getByRole("button", { name: /Sign in on another device/ }).click();
  await expect(page.getByText(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/)).toBeVisible();

  // Any account can create a child entry: no PIN, code, or separate sign-in.
  await page.getByRole("button", { name: "Add an entry", exact: true }).click();
  await expect(page.getByLabel("Admin PIN")).toBeHidden();
  await page.getByLabel("Entry name").fill(`Kid ${stamp}`);
  await page.getByRole("button", { name: "Add entry & make picks" }).click();

  // Adding one moves you to their picks, and the picker above them says whose they are.
  await expect(page).toHaveURL(/\/week\/1$/);
  await expectPickingAs(page, `Kid ${stamp}`);

  await expect(page.getByRole("button", { name: "Pick Buffalo Bills" })).toHaveAttribute("aria-pressed", "false");

  // Picks for the kid go in from here, and switching back is one tap.
  await page.getByRole("button", { name: "Pick Seattle Seahawks" }).click();
  // One pick of five: the tray offers to rank what you have.
  await page.getByRole("button", { name: "Rank 1" }).click();
  await page.getByRole("button", { name: "Lock it in" }).click();
  await expect(page.getByText("Locked in")).toBeVisible();

  await page.getByRole("button", { name: `Pick as Parent ${stamp}` }).click();
  await expectPickingAs(page, `Parent ${stamp}`);

  await expect(page.getByRole("heading", { name: "Pick 5 winners" })).toBeVisible();

  await expect(page.getByRole("button", { name: "Pick Buffalo Bills" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: "Pick Seattle Seahawks" })).toHaveAttribute("aria-pressed", "false");

  // This is an ordinary player action, not a commissioner override.
  const csv = await request.get("/api/commissioner/export.csv", { headers: { "x-admin-pin": "1234" } });
  const rows = (await csv.text()).split("\n").filter((l) => l.includes(`Kid ${stamp}`));
  expect(rows.length).toBe(1);
  expect(rows[0]!.endsWith("player")).toBe(true);
});

test("a player who shows up Sunday night can still pick what's left", async ({ page }) => {
  // Only the Sunday night and Monday night games have yet to kick off.
  const SUNDAY_NIGHT = "2026-09-13T22:00:00Z";
  await enablePlatformBiometrics(page);
  await page.goto(`/welcome?now=${SUNDAY_NIGHT}`);
  await page.getByPlaceholder("Your name").fill("Sunday Nighter");
  await page.getByRole("button", { name: "Let's go" }).click();
  await page.getByRole("dialog", { name: "You’re all set" }).getByRole("button", { name: "Not now — start picking →" }).click();

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

test("an entry removed by the commissioner doesn't strand the device that held it", async ({ page }) => {
  await page.goto(`/welcome?now=${BEFORE}`);
  await page.getByPlaceholder("Your name").fill("Dana");
  await page.getByRole("button", { name: "Let's go" }).click();
  await expect(page).toHaveURL(/\/week\/1$/);

  await openAccount(page);
  await page.getByRole("button", { name: "Add an entry" }).click();
  await page.getByLabel("Entry name").fill("Robin");
  await page.getByRole("button", { name: "Add entry & make picks" }).click();
  await expectPickingAs(page, "Robin");

  // The commissioner clears Robin out of the roster while this phone is still picking as Robin.
  const roster = await page.request.get("/api/commissioner/players", { headers: { "x-admin-pin": "1234" } });
  const robin = ((await roster.json()) as { players: { id: string; name: string }[] }).players.find((p) => p.name === "Robin")!;
  expect((await page.request.delete(`/api/commissioner/players/${robin.id}`, { headers: { "x-admin-pin": "1234" } })).status()).toBe(200);

  // Every request from this device is now refused. It should land back on the account rather than
  // on an error with a retry button that can never work.
  await page.reload();
  await expect(page.getByText("isn't on this account any more")).toBeVisible();
  // Robin is gone, so there is nobody left to choose between and the picker goes with them.
  await expect(page.getByRole("button", { name: /^Pick as / })).toHaveCount(0);
  await expectSignedInAs(page, "Dana");
  await page.goBack();
  await expect(page.getByRole("heading", { name: /Pick 5 winners/ })).toBeVisible();
});

test("home never says your picks are in off a board it could not load", async ({ page }) => {
  await page.goto(`/p/high-five/welcome?now=${BEFORE}`);
  await page.getByPlaceholder("Your name").fill(`Offline ${Date.now().toString(36)}`);
  await page.getByRole("button", { name: "Let's go" }).click();
  await page.waitForURL(/\/week\/1$/);

  // The week board is the only thing that knows whether the picks are in. With it refused, the
  // absence of "owing" entries is ignorance, not success — and "Your picks are in" off a failed
  // request is the one sentence on this screen that can cost someone their week.
  await page.route("**/api/board/week/**", (route) => route.abort());
  await page.goto(`/p/high-five/?now=${BEFORE}`);
  await expect(page.getByText("Couldn't check your picks.")).toBeVisible();
  await expect(page.getByText("Your picks are in.")).toHaveCount(0);
});

test("appearance follows the device and stays in sync across the desktop shortcut and account controls", async ({ page }) => {
  // The tokens are the theme: nothing re-renders, the custom properties are redefined on <html>.
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/");
  const ground = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(await ground()).toBe("rgb(25, 22, 17)");

  await page.emulateMedia({ colorScheme: "light" });
  expect(await ground()).toBe("rgb(246, 241, 232)");

  // On desktop, one press sets a saved choice that wins over the device, updates both
  // browser-chrome media branches, and survives a reload without a flash.
  await page.setViewportSize({ width: 1280, height: 844 });
  await page.getByRole("button", { name: "Switch to dark mode" }).click();
  expect(await page.getAttribute("html", "data-theme")).toBe("dark");
  expect(await ground()).toBe("rgb(25, 22, 17)");
  expect(await page.locator('meta[name="theme-color"]').evaluateAll((tags) => tags.map((tag) => tag.getAttribute("content")))).toEqual(["#1A1713", "#1A1713"]);
  await page.reload();
  expect(await page.getAttribute("html", "data-theme")).toBe("dark");
  expect(await ground()).toBe("rgb(25, 22, 17)");

  // Auto restores the independent light/dark metadata, so a later system change requires no
  // mounted settings sheet or JavaScript listener to keep the browser chrome current.
  // Auto is still available on the account tab; return to it below once a player has joined.
  await page.goto(`/p/high-five/welcome?now=${BEFORE}`);
  await page.getByPlaceholder("Your name").fill(`Appearance ${Date.now().toString(36)}`);
  await page.getByRole("button", { name: "Let's go" }).click();
  await openAccount(page);
  await page.getByRole("radio", { name: "Auto" }).click();
  expect(await page.getAttribute("html", "data-theme")).toBeNull();
  expect(await page.locator('meta[name="theme-color"]').evaluateAll((tags) => tags.map((tag) => tag.getAttribute("content")))).toEqual(["#F6F1E8", "#1A1713"]);

});

test("the landing page explains a pool without linking into one", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Simple, fun games/ })).toBeVisible();
  // Nothing here drops a stranger into someone's pool: you get in from the link you were sent.
  expect(await page.locator('a[href*="/p/"], a[href*="/welcome"], a[href*="/week"]').count()).toBe(0);

  await page.getByRole("button", { name: /High Five/ }).click();
  const dialog = page.getByRole("dialog", { name: "High Five" });
  // The same words the pool's own "How to play" page uses — one source, rendered in two places.
  await expect(dialog.getByRole("heading", { name: "Rank your confidence" })).toBeVisible();
  await expect(dialog.getByText("No weekly deadline")).toBeVisible();
  // …minus the bits that only make sense once you are inside a pool.
  await expect(dialog.getByText("Using another device?")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();

  // A pool type that isn't open yet says so rather than pretending.
  await page.getByRole("button", { name: /Survivor/ }).click();
  await expect(page.getByRole("dialog", { name: "Survivor" })).toContainText("Not open yet");
});

test("both links unfurl: the app at the root, the pool at its own path", async ({ page, baseURL }) => {
  // The Tally landing page.
  const landing = await page.request.get("/");
  expect(landing.status()).toBe(200);
  const landingHtml = await landing.text();
  expect(landingHtml).toContain("<title>Tally — pools to play with your friends</title>");
  expect(landingHtml).toContain(`property="og:image" content="${baseURL}/og-tally.jpg"`);
  expect(landingHtml).toContain(`property="og:url" content="${baseURL}/"`);

  // The pool itself.
  const res = await page.request.get("/p/high-five");
  expect(res.status()).toBe(200);
  const html = await res.text();
  expect(html).toContain(`property="og:image" content="${baseURL}/og.jpg"`);
  expect(html).toContain(`property="og:url" content="${baseURL}/p/high-five"`);
  expect(html).toContain(`name="twitter:image" content="${baseURL}/og.jpg"`);
  expect(html).toContain('property="og:site_name" content="Tally"');
  expect(html).toContain("<title>High Five</title>");
  for (const src of ["/og.jpg", "/og-tally.jpg"]) {
    const img = await page.request.get(src);
    expect(img.status(), src).toBe(200);
    expect(img.headers()["content-type"]).toContain("image/jpeg");
  }

  // An old root link still lands in the pool.
  const moved = await page.request.get("/rules", { maxRedirects: 0 });
  expect(moved.status()).toBe(301);
  expect(moved.headers()["location"]).toContain("/p/high-five/rules");


  await page.goto("/rules");
  await expect(page.getByRole("heading", { name: "How to play High Five" })).toBeVisible();
  await expect(page.getByText("No weekly deadline")).toBeVisible();
  await page.getByRole("link", { name: "Join the pool" }).click();
  await expect(page).toHaveURL(/\/welcome$/);
  await expect(page.getByText("Step 1")).toBeVisible();
});

test("Face ID: turn it on, lose the device's memory, and sign back in with no typing", async ({ page, context }) => {
  // A virtual authenticator stands in for the phone's biometrics.
  const cdp = await context.newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  const { authenticatorId } = await cdp.send("WebAuthn.addVirtualAuthenticator", {
    options: {
      protocol: "ctap2",
      transport: "internal",
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  });
  await enablePlatformBiometrics(page);

  const name = `Face ${Date.now().toString(36)}`;
  await page.goto(`/p/high-five/welcome?now=${BEFORE}`);
  await page.getByPlaceholder("Your name").fill(name);
  await page.getByRole("button", { name: "Let's go" }).click();
  const welcome = page.getByRole("dialog", { name: "You’re all set" });
  await welcome.getByRole("button", { name: "Turn on Face ID or fingerprint" }).click();
  await expect(page).toHaveURL(/\/week\/1$/);
  await expectSignedInAs(page, name);

  // Add two children before registering the account passkey while picking as a child.
  for (const childName of [`Child A ${name}`, `Child B ${name}`]) {
    await openAccount(page);
    await page.getByRole("button", { name: "Add an entry", exact: true }).click();
    await page.getByLabel("Entry name").fill(childName);
    await page.getByRole("button", { name: "Add entry & make picks" }).click();
    await expectPickingAs(page, childName);
  }

  // Now forget everything this device knows: no token, no cookie, as if it were a new phone.
  await context.clearCookies();
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  // The name field also offers the passkey through the browser's own autofill, which is a
  // request left waiting in the background. A real browser waits for someone to pick it; a
  // virtual authenticator simulating presence answers the moment the page loads, which would
  // race this assertion. Presence goes off so the signed-out screen holds still, and back on
  // once the explicit button has asked for it.
  await cdp.send("WebAuthn.setAutomaticPresenceSimulation", { authenticatorId, enabled: false });
  await page.goto(`/p/high-five/welcome?now=${BEFORE}`);
  await expect(page.getByRole("heading", { name: "What should we call you?" })).toBeVisible();

  await page.getByRole("button", { name: "Sign in with Face ID or fingerprint" }).click();
  await cdp.send("WebAuthn.setAutomaticPresenceSimulation", { authenticatorId, enabled: true });
  await expect(page).toHaveURL(/\/week\/1$/);
  await expectPickingAs(page, name);

  // Both children follow the passkey onto the recovered device.
  await expect(page.getByRole("button", { name: `Pick as Child A ${name}` })).toBeVisible();
  await page.getByRole("button", { name: `Pick as Child B ${name}` }).click();
  await expectPickingAs(page, `Child B ${name}`);

  // And it is a real session: picks save.
  await page.getByRole("button", { name: "Pick Seattle Seahawks" }).click();
  await page.getByRole("button", { name: "Rank 1" }).click();
  await page.getByRole("button", { name: "Lock it in" }).click();
  await expect(page.getByText("Locked in")).toBeVisible();
});
