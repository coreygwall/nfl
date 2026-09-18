// Rasterises the team logos, the marks and the app icon into the iOS asset catalogue, and the
// web's touch icon from the same artwork.
// Usage: node scripts/build-ios-assets.ts   (fonts are scripts/build-ios-fonts.py)
//
// PNG at 1x/2x/3x rather than the SVGs themselves: Xcode's SVG support covers a subset of the
// format, and a logo it cannot render fails the build. A bitmap at three scales is boring and
// cannot fail. 128pt is the largest a sticker is ever drawn, so 3x is 384px.
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { chromium } from "@playwright/test";

const ROOT = path.resolve(new URL("..", import.meta.url).pathname);
const LOGOS = path.join(ROOT, "public/logos");
const CATALOG = path.join(ROOT, "ios/Tally/Assets.xcassets");
const STICKER_PT = 128;
const MARK_PT = 64;

const contents = (images: object[], extra: object = {}) =>
  JSON.stringify({ images, info: { author: "xcode", version: 1 }, ...extra }, null, 2) + "\n";

async function main() {
  // The env may pin a different browser than this Playwright wants; a path override keeps the script runnable anywhere.
  const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  // A file:// image only loads from a file:// page, so each render goes through a real file.
  const stage = path.join(mkdtempSync(path.join(tmpdir(), "tally-ios-")), "stage.html");

  async function render(src: string, pt: number, out: string, pad = 0) {
    for (const scale of [1, 2, 3]) {
      const px = pt * scale;
      await page.setViewportSize({ width: px, height: px });
      writeFileSync(
        stage,
        `<!doctype html><html><body style="margin:0;background:transparent">
          <div style="width:${px}px;height:${px}px;display:flex;align-items:center;justify-content:center;box-sizing:border-box;padding:${pad * scale}px">
            <img src="file://${src}" style="width:100%;height:100%;object-fit:contain;display:block">
          </div></body></html>`,
      );
      await page.goto(`file://${stage}`, { waitUntil: "load" });
      const ok = await page.evaluate(() => {
        const img = document.querySelector("img") as HTMLImageElement;
        return img.complete && img.naturalWidth > 0;
      });
      if (!ok) throw new Error(`Could not render ${src}`);
      await page.screenshot({ path: `${out}${scale === 1 ? "" : `@${scale}x`}.png`, omitBackground: true });
    }
  }

  // Team stickers: one imageset per team, named team-<ABBR>.
  const files = readdirSync(LOGOS).filter((f) => /\.(svg|png)$/.test(f));
  for (const file of files) {
    const abbr = file.replace(/\.(svg|png)$/, "");
    const dir = path.join(CATALOG, `team-${abbr}.imageset`);
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });
    await render(path.join(LOGOS, file), STICKER_PT, path.join(dir, abbr));
    writeFileSync(
      path.join(dir, "Contents.json"),
      contents([1, 2, 3].map((s) => ({ idiom: "universal", filename: `${abbr}${s === 1 ? "" : `@${s}x`}.png`, scale: `${s}x` }))),
    );
    console.log(`team-${abbr}`);
  }

  // The marks: the app's own, and one per family of contest. Same badge every time — yellow ground,
  // ink, the border — and what sits inside it says which: the tally is Tally, the football is a
  // pool, the ball on a tee is a golf card.
  for (const [name, source] of [
    ["TallyMark", "public/icon.svg"],
    ["FootballMark", "public/football.svg"],
    ["GolfMark", "public/golf.svg"],
  ]) {
    const mark = path.join(CATALOG, `${name}.imageset`);
    rmSync(mark, { recursive: true, force: true });
    mkdirSync(mark, { recursive: true });
    await render(path.join(ROOT, source), MARK_PT, path.join(mark, name));
    writeFileSync(
      path.join(mark, "Contents.json"),
      contents([1, 2, 3].map((s) => ({ idiom: "universal", filename: `${name}${s === 1 ? "" : `@${s}x`}.png`, scale: `${s}x` }))),
    );
  }

  // The app icon: iOS masks its own corners, so the artwork fills the square edge to edge. The
  // glyph is the one in public/icon.svg — four uprights and the slash, the mark the loader draws —
  // rather than a football, because the app is the count and the football is one thing it counts.
  // It is drawn by a hand rather than a ruler: each upright leans and lands at its own height, and
  // the fifth stroke is a heavy pull with a cut of the ground down its middle. The dark tile is
  // the same geometry with its own weights, because yellow on black swells where black on yellow
  // shrinks — drawn at the light weights, the dark cut nearly closed. TallyGlyph.swift and
  // TallyLoader.tsx carry the same numbers.
  const iconSvg = (ground: string, ink: string, dark: boolean) => {
    const k = dark ? 0.92 : 1;
    const [edge, cut] = dark ? [13.2, 5.6] : [14, 4];
    const hook = "M26 92 C 44 78, 64 62, 84 48 C 92 42.5, 98 37, 103 34 C 104.5 33.5, 105 35, 104 36.5";
    const uprights: [string, number][] = [
      ["M38 38 C 37 55, 39.5 73, 40 92", 8.2],
      ["M55 43 C 56.5 58, 54 72, 55.5 86", 7.4],
      ["M71.5 36 C 70 55, 73 72, 71 90", 9],
      ["M89 41 C 90.5 56, 88 71, 89.5 89", 7.8],
    ];
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="1024" height="1024">
      <rect width="128" height="128" fill="${ground}"/>
      <rect x="9" y="9" width="110" height="110" rx="26" fill="none" stroke="${ink}" stroke-width="7"/>
      <g fill="none" stroke="${ink}" stroke-linecap="round" stroke-linejoin="round">
        ${uprights.map(([d, w]) => `<path d="${d}" stroke-width="${(w * k).toFixed(2)}"/>`).join("")}
        <path d="${hook}" stroke-width="${edge}"/>
      </g>
      <path d="${hook}" fill="none" stroke="${ground}" stroke-width="${cut}" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`;
  };
  const iconPage = (ground: string, ink: string, px: number, dark = false) =>
    `<!doctype html><html><body style="margin:0;background:${ground}">
      <div style="width:${px}px;height:${px}px;background:${ground};display:flex;align-items:center;justify-content:center">
        ${iconSvg(ground, ink, dark).replace('width="1024" height="1024"', `width="${px}" height="${px}"`)}
      </div></body></html>`;

  const icon = path.join(CATALOG, "AppIcon.appiconset");
  rmSync(icon, { recursive: true, force: true });
  mkdirSync(icon, { recursive: true });
  await page.setViewportSize({ width: 1024, height: 1024 });
  await page.setContent(iconPage("#FFD23F", "#14120F", 1024));
  await page.screenshot({ path: path.join(icon, "AppIcon.png") });

  // The dark icon (iOS 18+). Not the light one dimmed: the relationship inverts. On a home screen
  // full of dark icons the yellow square was the loudest thing on the page, so at night the ground
  // becomes the app's own warm near-black and the strokes become the yellow — the same two
  // colours, the other way round, which is what the rest of the app does when it goes dark — and
  // the dark weights, per iconSvg.
  await page.setContent(iconPage("#1A1713", "#FFD23F", 1024, true));
  await page.screenshot({ path: path.join(icon, "AppIcon-Dark.png") });

  // The web's touch icon is the light icon at 180, so a home-screen shortcut matches the app.
  await page.setViewportSize({ width: 180, height: 180 });
  await page.setContent(iconPage("#FFD23F", "#14120F", 180));
  await page.screenshot({ path: path.join(ROOT, "public/apple-touch-icon.png") });

  writeFileSync(
    path.join(icon, "Contents.json"),
    contents([
      { filename: "AppIcon.png", idiom: "universal", platform: "ios", size: "1024x1024" },
      {
        appearances: [{ appearance: "luminosity", value: "dark" }],
        filename: "AppIcon-Dark.png",
        idiom: "universal",
        platform: "ios",
        size: "1024x1024",
      },
    ]),
  );

  if (!existsSync(path.join(CATALOG, "Contents.json"))) {
    writeFileSync(path.join(CATALOG, "Contents.json"), JSON.stringify({ info: { author: "xcode", version: 1 } }, null, 2) + "\n");
  }
  await browser.close();
  console.log(`wrote ${files.length} stickers, three marks and the app icon to ios/Tally/Assets.xcassets, and public/apple-touch-icon.png`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
