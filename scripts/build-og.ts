// Renders public/og.jpg (1200x630), the image chat apps show when the pool link is shared.
// Usage: node scripts/build-og.ts
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { chromium } from "@playwright/test";

const ROOT = path.resolve(new URL("..", import.meta.url).pathname);
const font = (p: string) => `file://${path.join(ROOT, "node_modules", p)}`;
const logo = (abbr: string, ext = "svg") => `file://${path.join(ROOT, "public/logos", `${abbr}.${ext}`)}`;
const stickers: [string, number][] = [["SEA", -8], ["KC", 6], ["DET", -4], ["PHI", 7], ["BUF", -6], ["SF", 5]];

interface Card {
  file: string;
  chip: string;
  head: string;
  body: string;
}

/** The pool's own card, and the one the Tally link unfurls with. */
const cards: Card[] = [
  {
    file: "og.jpg",
    chip: "🏈 High Five · a Tally pool",
    head: "Pick five.<br>Rank them.",
    body: "Pick five winners a week and rank them 1–5. Nail your #1 for 5 points. No signup — just your name.",
  },
  {
    file: "og-tally.jpg",
    chip: "Tally",
    head: "Games to play<br>with your friends.",
    body: "Pick a pool, share one link, and everyone's in. Simple, free, and nothing to install.",
  },
];

const template = (c: Card) => `<!doctype html><html><head><style>
@font-face{font-family:"Bricolage";src:url("${font("@fontsource-variable/bricolage-grotesque/files/bricolage-grotesque-latin-wght-normal.woff2")}") format("woff2");font-weight:200 800}
@font-face{font-family:"InterV";src:url("${font("@fontsource-variable/inter/files/inter-latin-wght-normal.woff2")}") format("woff2");font-weight:100 900}
html,body{margin:0}
body{width:1200px;height:630px;background:#F6F1E8;background-image:radial-gradient(rgba(20,18,15,.07) 1.5px,transparent 1.5px);background-size:26px 26px;font-family:InterV,system-ui,sans-serif;color:#14120F;position:relative;overflow:hidden}
.chip{position:absolute;left:72px;top:64px;display:inline-flex;align-items:center;gap:10px;border:3px solid #14120F;border-radius:999px;background:#FFD23F;padding:8px 20px;font-family:Bricolage;font-weight:800;font-size:26px}
h1{position:absolute;left:72px;top:150px;margin:0;font-family:Bricolage;font-weight:800;font-size:124px;line-height:.92;letter-spacing:-.02em;font-variation-settings:"wdth" 96}
p{position:absolute;left:72px;top:420px;margin:0;width:640px;font-size:30px;line-height:1.25;color:#5B554B}
.row{position:absolute;right:56px;top:96px;width:380px;display:flex;flex-wrap:wrap;gap:22px;justify-content:center;align-content:flex-start}
.s{width:150px;height:150px;display:flex;align-items:center;justify-content:center;filter:drop-shadow(0 10px 10px rgba(20,18,15,.22))}
.s img{max-width:150px;max-height:150px}
.frame{position:absolute;inset:22px;border:4px solid #14120F;border-radius:34px;pointer-events:none}
</style></head><body>
<div class="frame"></div>
<div class="chip">${c.chip}</div>
<h1>${c.head}</h1>
<p>${c.body}</p>
<div class="row">${stickers.map(([a, r]) => `<div class="s" style="transform:rotate(${r}deg)"><img src="${logo(a, existsSync(path.join(ROOT, "public/logos", a + ".svg")) ? "svg" : "png")}"></div>`).join("")}</div>
</body></html>`;

const executablePath = process.env.PW_CHROMIUM_PATH ?? ["/opt/pw-browsers/chromium"].find((p) => existsSync(p));
const browser = await chromium.launch({ ...(executablePath ? { executablePath } : {}), args: ["--allow-file-access-from-files"] });
const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
const dir = mkdtempSync(path.join(tmpdir(), "og-"));
for (const card of cards) {
  // A page must itself be file:// for file:// fonts and images to load.
  const tmp = path.join(dir, `${card.file}.html`);
  writeFileSync(tmp, template(card));
  await page.goto(`file://${tmp}`, { waitUntil: "load" });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(300);
  const out = path.join(ROOT, "public", card.file);
  writeFileSync(out, await page.screenshot({ type: "jpeg", quality: 86 }));
  console.log(`Wrote ${out} (${(readFileSync(out).length / 1024).toFixed(0)} kB)`);
}
await browser.close();
