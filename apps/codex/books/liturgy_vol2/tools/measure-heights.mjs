// Measure the REAL rendered height of every spell ruleBlock in live
// Homebrewery and emit ../calibration.json ({ "<spell title>": <px>, ... }).
// Drives a real browser against homebrewery.naturalcrit.com — client-side
// only (a `/new` editor tab; nothing is saved or published). See README.md.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const BOOK = join(HERE, "..");
// Playwright is not a dependency of this directory — borrow an installed
// copy (default: vellum-render's, the repo's pinned browser-automation app).
const PLAYWRIGHT_PKG =
  process.env.PLAYWRIGHT_PKG ??
  join(HERE, "../../../../vellum-render/node_modules/playwright/index.mjs");
const { chromium } = await import(PLAYWRIGHT_PKG);

const md = readFileSync(join(BOOK, "liturgy_of_the_iridite_vol2.md"), "utf8");
const css = readFileSync(join(BOOK, "liturgy_of_the_iridite_vol2.css"), "utf8");
const brewText = `<style>\n${css}\n</style>\n\n${md}`;

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({
  viewport: { width: 1920, height: 1200 },
  permissions: ["clipboard-read", "clipboard-write"],
});
const page = await ctx.newPage();
await page.goto("https://homebrewery.naturalcrit.com/new", {
  waitUntil: "networkidle",
  timeout: 60000,
});
await page.waitForSelector(".cm-content");
await page.evaluate((t) => navigator.clipboard.writeText(t), brewText);
await page.click(".cm-content");
await page.keyboard.press("ControlOrMeta+a");
await page.keyboard.press("ControlOrMeta+v");
await page.waitForTimeout(25000);

let renderFrame;
for (const frame of page.frames()) {
  if ((await frame.$$(".page")).length > 0) renderFrame = frame;
}
if (!renderFrame) throw new Error("no rendered .page frames found");

const calibration = await renderFrame.evaluate(async () => {
  const pages = [...document.querySelectorAll(".page")];
  const out = {};
  for (const pageEl of pages) {
    pageEl.scrollIntoView();
    await new Promise((resolve) => setTimeout(resolve, 60));
    for (const block of pageEl.querySelectorAll(".ruleBlock")) {
      const title = block.querySelector(".title")?.textContent?.trim();
      if (!title) continue;
      // Sum child MARGIN-BOX heights — immune to column-fragment bbox
      // inflation when a block flows across CSS columns (break-inside:
      // auto). Margins are load-bearing: paragraph margins (~12px each) +
      // the block's own 5px top/bottom make blocks render ~12% taller
      // than bare rect heights, which under-modeled pagination and
      // spilled spells into a clipped third column (live audit,
      // 2026-07-31).
      let height = 10; // the .ruleBlock's own 5px top + bottom margins
      for (const child of block.children) {
        const cs = getComputedStyle(child);
        height += child.getBoundingClientRect().height
          + parseFloat(cs.marginTop) + parseFloat(cs.marginBottom);
      }
      // Homebrewery smart-quotes titles at render; calibration keys must
      // match the store's plain-ASCII `name` field.
      out[title.replace(/’/g, "'")] = Math.round(height);
    }
  }
  return out;
});
await browser.close();

const sorted = Object.fromEntries(
  Object.entries(calibration).sort(([a], [b]) => (a < b ? -1 : 1)),
);
writeFileSync(join(BOOK, "calibration.json"), `${JSON.stringify(sorted, null, 2)}\n`);
console.log(`calibration.json: ${Object.keys(sorted).length} blocks measured`);
