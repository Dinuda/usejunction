import playwright from "../apps/admin/node_modules/playwright/index.js";
import fs from "node:fs/promises";
import path from "node:path";

const { chromium } = playwright;

const outDir = path.resolve("video/assets/dashboard");
await fs.rm(outDir, { recursive: true, force: true });
await fs.mkdir(outDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
await page.goto("http://127.0.0.1:3001/", { waitUntil: "networkidle", timeout: 30000 });
await page.waitForSelector(".hero-mock-frame");

// The public page's dashboard mock is the repo's real product demo component.
const mock = page.locator(".hero-mock-frame");
const box = await mock.boundingBox();
if (!box) throw new Error("Could not find the dashboard demo bounds");

const fps = 30;
const totalFrames = 360;
for (let frame = 0; frame < totalFrames; frame += 1) {
  await page.screenshot({
    path: path.join(outDir, `${String(frame).padStart(4, "0")}.png`),
    clip: box,
  });
  await page.waitForTimeout(1000 / fps);
}

await fs.writeFile(
  path.join(outDir, "metadata.json"),
  JSON.stringify({ source: "http://127.0.0.1:3001/", bounds: box, fps, totalFrames }, null, 2),
);
await browser.close();
