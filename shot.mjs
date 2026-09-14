import { chromium } from "@playwright/test";
const BEFORE = "2026-09-09T12:00:00.000Z";
const base = "http://localhost:5188";
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const page = await browser.newPage({ viewport: { width: 390, height: 900 } });
const stamp = Date.now().toString(36);
await page.goto(`${base}/p/high-five/welcome?now=${BEFORE}`);
await page.getByPlaceholder("Your name").fill(`Shot ${stamp}`);
await page.getByRole("button", { name: "Let's go" }).click();
await page.waitForURL(/\/week\/1$/);
// One pick in, so Home has something to nag about.
await page.getByRole("button", { name: "Pick Seattle Seahawks" }).click();
await page.goto(`${base}/p/high-five/?now=${BEFORE}`);
await page.waitForTimeout(1200);
await page.screenshot({ path: "/tmp/claude-0/-home-user-nfl/0faa11e3-1c94-5af3-a722-8837dcafc850/scratchpad/home.png", fullPage: true });
await browser.close();
console.log("shot taken");
