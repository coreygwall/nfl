// Builds public/logos/*.svg (+ TEN.png) from the react-nfl-logos npm package and scripts/custom-logos/.
// Each output gets a tight viewBox and a baked-in white "die-cut sticker" outline.
// Usage: node scripts/extract-logos.ts
import { execSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readdirSync, readFileSync, writeFileSync, cpSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { chromium } from "@playwright/test";
import { existsSync } from "node:fs";

const ROOT = path.resolve(new URL("..", import.meta.url).pathname);
const OUT = path.join(ROOT, "public/logos");
const CUSTOM = path.join(ROOT, "scripts/custom-logos");
const PKG = "react-nfl-logos@1.0.3";
const OUTLINE_WIDTH = 18; // in 560x400 viewBox units
const PAD = OUTLINE_WIDTH / 2 + 6;
const STRIPPED = new Set(["WAS"]); // stale marks in the package; replaced by custom art
const RASTER = new Set(["TEN"]); // embeds a bitmap; shipped as PNG
const RENAME: Record<string, string> = { LAR: "LA" }; // package → nflverse abbreviation
const SVG_KEEP = new Set(["viewBox", "preserveAspectRatio", "gradientUnits", "gradientTransform", "patternUnits", "patternTransform", "patternContentUnits", "spreadMethod", "clipPathUnits", "maskUnits", "maskContentUnits", "markerUnits", "refX", "refY", "markerWidth", "markerHeight", "stdDeviation", "filterUnits", "primitiveUnits", "startOffset", "textLength"]);

// 1. Fetch the package and turn its React components into SVG strings.
const work = mkdtempSync(path.join(tmpdir(), "nfl-logos-"));
execSync(`npm pack ${PKG} --pack-destination "${work}" --silent`, { stdio: "inherit" });
execSync(`tar -xzf "${path.join(work, readdirSync(work).find((f) => f.endsWith(".tgz"))!)}" -C "${work}"`);
const shimDir = path.join(work, "package", "node_modules");
mkdirSync(path.join(shimDir, "react"), { recursive: true });
mkdirSync(path.join(shimDir, "prop-types"), { recursive: true });
writeFileSync(path.join(shimDir, "prop-types", "index.js"), `const any=new Proxy(function(){return any},{get:()=>any,apply:()=>any});module.exports=any;`);
writeFileSync(path.join(shimDir, "react", "index.js"), `
const keep=new Set(${JSON.stringify([...SVG_KEEP])});
const esc=v=>String(v).replace(/&/g,"&amp;").replace(/"/g,"&quot;");
const attr=k=>k==="className"?"class":k==="xlinkHref"?"xlink:href":k==="xmlnsXlink"?"xmlns:xlink":keep.has(k)?k:k.replace(/[A-Z]/g,m=>"-"+m.toLowerCase());
exports.createElement=(tag,props,...children)=>{const a=Object.entries(props||{}).filter(([k,v])=>v!==undefined&&k!=="key").map(([k,v])=>" "+attr(k)+'="'+esc(v)+'"').join("");return "<"+tag+a+">"+children.flat().filter(Boolean).join("")+"</"+tag+">";};
exports.default=exports;`);
const req = createRequire(path.join(work, "package", "dist", "Icons", "x.js"));
const raw: Record<string, string> = {};
for (const f of readdirSync(path.join(work, "package", "dist", "Icons"))) {
  const name = f.replace(/\.js$/, "").toUpperCase();
  if (name === "NFL") continue;
  const abbr = RENAME[name] ?? name;
  if (STRIPPED.has(abbr)) continue;
  const mod = req(path.join(work, "package", "dist", "Icons", f));
  raw[abbr] = (mod.default ?? mod)({ size: 400 });
}
for (const f of readdirSync(CUSTOM)) raw[f.replace(/\.svg$/, "")] = readFileSync(path.join(CUSTOM, f), "utf8");

// 2. Normalise the root element and split into inner markup.
const inner: Record<string, string> = {};
for (const [abbr, svg] of Object.entries(raw)) {
  const m = svg.match(/^<svg[^>]*>([\s\S]*)<\/svg>\s*$/);
  if (!m) throw new Error(`Unexpected SVG for ${abbr}`);
  inner[abbr] = m[1]!;
}

// 3. Measure tight bounding boxes in a real browser.
const executablePath = process.env.PW_CHROMIUM_PATH ?? ["/opt/pw-browsers/chromium", "/opt/pw-browsers/chromium-1194/chrome-linux/chrome"].find((p) => existsSync(p));
const browser = await chromium.launch(executablePath ? { executablePath } : {});
const page = await browser.newPage();
const html = `<html><body>${Object.entries(inner)
  .map(([abbr, body]) => `<svg id="${abbr}" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 560 400" width="560" height="400">${body}</svg>`)
  .join("")}</body></html>`;
await page.setContent(html);
const boxes: Record<string, { x: number; y: number; width: number; height: number }> = await page.evaluate(() => {
  const out: Record<string, { x: number; y: number; width: number; height: number }> = {};
  for (const svg of Array.from(document.querySelectorAll("svg"))) {
    const b = (svg as SVGGraphicsElement).getBBox();
    out[svg.id] = { x: b.x, y: b.y, width: b.width, height: b.height };
  }
  return out;
});

// 4. Write outputs with tight viewBox + baked outline.
mkdirSync(OUT, { recursive: true });
const shapeTag = /<(path|circle|ellipse|rect|polygon|polyline|line)\b([^>]*)>/g;
function outlineClone(body: string): string {
  return body
    .replace(/<image\b[^>]*>(<\/image>)?/g, "")
    .replace(shapeTag, (_m, tag: string, attrs: string) => {
      const cleaned = attrs.replace(/\s(stroke|stroke-width|stroke-linejoin|stroke-linecap|stroke-dasharray|stroke-opacity|stroke-miterlimit|paint-order|opacity|fill-opacity)="[^"]*"/g, "");
      const selfClosing = /\/\s*$/.test(cleaned);
      const base = cleaned.replace(/\/\s*$/, "");
      return `<${tag}${base} stroke="#fff" stroke-width="${OUTLINE_WIDTH}" stroke-linejoin="round" stroke-linecap="round" opacity="1"${selfClosing ? "/" : ""}>`;
    });
}
const manifest: Record<string, string> = {};
for (const [abbr, body] of Object.entries(inner)) {
  const b = boxes[abbr];
  if (!b) throw new Error(`No bbox for ${abbr}`);
  const vb = `${(b.x - PAD).toFixed(1)} ${(b.y - PAD).toFixed(1)} ${(b.width + PAD * 2).toFixed(1)} ${(b.height + PAD * 2).toFixed(1)}`;
  const withXlink = body.includes("xlink:") ? ' xmlns:xlink="http://www.w3.org/1999/xlink"' : "";
  if (RASTER.has(abbr)) {
    // Render at 3x and save as PNG (transparent), cropped to the art box.
    const svg = `<svg xmlns="http://www.w3.org/2000/svg"${withXlink} viewBox="${vb}" width="${Math.round((b.width + PAD * 2) * 3)}" height="${Math.round((b.height + PAD * 2) * 3)}">${body}</svg>`;
    await page.setContent(`<html><body style="margin:0;background:transparent">${svg}</body></html>`);
    const el = await page.$("svg");
    const png = await el!.screenshot({ omitBackground: true, type: "png" });
    writeFileSync(path.join(OUT, `${abbr}.png`), png);
    manifest[abbr] = `${abbr}.png`;
    continue;
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg"${withXlink} viewBox="${vb}" preserveAspectRatio="xMidYMid meet"><g class="outline">${outlineClone(body)}</g><g class="art">${body}</g></svg>\n`;
  writeFileSync(path.join(OUT, `${abbr}.svg`), svg);
  manifest[abbr] = `${abbr}.svg`;
}
await browser.close();
const names = Object.keys(manifest).sort();
console.log(`Wrote ${names.length} logos → ${OUT}`);
console.log(names.join(" "));
