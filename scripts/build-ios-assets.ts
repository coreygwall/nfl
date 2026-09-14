// Rasterises the team logos and the Tally mark into the iOS asset catalogue.
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

  // The Tally mark, for the header.
  const mark = path.join(CATALOG, "TallyMark.imageset");
  rmSync(mark, { recursive: true, force: true });
  mkdirSync(mark, { recursive: true });
  await render(path.join(ROOT, "public/icon.svg"), MARK_PT, path.join(mark, "TallyMark"));
  writeFileSync(
    path.join(mark, "Contents.json"),
    contents([1, 2, 3].map((s) => ({ idiom: "universal", filename: `TallyMark${s === 1 ? "" : `@${s}x`}.png`, scale: `${s}x` }))),
  );

  // The app icon: iOS masks its own corners, so the artwork fills the square edge to edge.
  const icon = path.join(CATALOG, "AppIcon.appiconset");
  rmSync(icon, { recursive: true, force: true });
  mkdirSync(icon, { recursive: true });
  await page.setViewportSize({ width: 1024, height: 1024 });
  await page.setContent(
    `<!doctype html><html><body style="margin:0;background:#FFD23F">
      <div style="width:1024px;height:1024px;background:#FFD23F;display:flex;align-items:center;justify-content:center">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="1024" height="1024">
          <rect width="128" height="128" fill="#FFD23F"/>
          <rect x="9" y="9" width="110" height="110" rx="26" fill="none" stroke="#14120F" stroke-width="7"/>
          <g transform="rotate(-32 64 64)">
            <path d="M19 64C33 34 48 27 64 27s31 7 45 37C95 94 80 101 64 101S33 94 19 64Z" fill="#14120F"/>
            <path d="M43 64h42M52 55v18M64 55v18M76 55v18" fill="none" stroke="#F6F1E8" stroke-width="6" stroke-linecap="round"/>
          </g>
        </svg></div></body></html>`,
  );
  await page.screenshot({ path: path.join(icon, "AppIcon.png") });

  // The dark icon (iOS 18+). Not the light one dimmed: the relationship inverts. On a home screen
  // full of dark icons the yellow square was the loudest thing on the page, so at night the ground
  // becomes the app's own warm near-black and the ball becomes the yellow — the same two colours,
  // the other way round, which is what the rest of the app does when it goes dark.
  await page.setContent(
    `<!doctype html><html><body style="margin:0;background:#1A1713">
      <div style="width:1024px;height:1024px;background:#1A1713;display:flex;align-items:center;justify-content:center">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="1024" height="1024">
          <rect width="128" height="128" fill="#1A1713"/>
          <rect x="9" y="9" width="110" height="110" rx="26" fill="none" stroke="#FFD23F" stroke-width="7"/>
          <g transform="rotate(-32 64 64)">
            <path d="M19 64C33 34 48 27 64 27s31 7 45 37C95 94 80 101 64 101S33 94 19 64Z" fill="#FFD23F"/>
            <path d="M43 64h42M52 55v18M64 55v18M76 55v18" fill="none" stroke="#1A1713" stroke-width="6" stroke-linecap="round"/>
          </g>
        </svg></div></body></html>`,
  );
  await page.screenshot({ path: path.join(icon, "AppIcon-Dark.png") });

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
  console.log(`wrote ${files.length} stickers, the mark and the app icon to ios/Tally/Assets.xcassets`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
