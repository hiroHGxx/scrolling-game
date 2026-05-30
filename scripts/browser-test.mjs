// Real-browser smoke test of the production build. Serves dist/ under the
// GitHub Pages base path (/scrolling-game/), loads it in headless Chromium,
// checks for console/page/asset errors, drives input, and screenshots the
// title + live gameplay. Run: node scripts/browser-test.mjs
import http from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, extname } from "node:path";
import { chromium } from "playwright";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const DIST = join(root, "dist");
const BASE = "/scrolling-game/";
const PORT = 5179;

const TYPES = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".png": "image/png",
  ".json": "application/json",
  ".svg": "image/svg+xml",
};

const server = http.createServer(async (req, res) => {
  try {
    let urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
    if (urlPath.startsWith(BASE)) urlPath = urlPath.slice(BASE.length);
    else if (urlPath === BASE.slice(0, -1)) urlPath = "";
    else urlPath = urlPath.replace(/^\//, "");
    if (urlPath === "" || urlPath.endsWith("/")) urlPath += "index.html";
    const file = join(DIST, urlPath);
    if (!file.startsWith(DIST) || !existsSync(file)) {
      res.statusCode = 404;
      res.end("not found: " + urlPath);
      return;
    }
    const data = await readFile(file);
    res.setHeader("Content-Type", TYPES[extname(file)] || "application/octet-stream");
    res.end(data);
  } catch (e) {
    res.statusCode = 500;
    res.end(String(e));
  }
});

await new Promise((r) => server.listen(PORT, r));

const consoleErrors = [];
const pageErrors = [];
const badResponses = [];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1000, height: 600 }, deviceScaleFactor: 2 });
page.on("console", (m) => {
  if (m.type() === "error") consoleErrors.push(m.text());
});
page.on("pageerror", (e) => pageErrors.push(String(e)));
page.on("response", (r) => {
  if (r.status() >= 400) badResponses.push(`${r.status()} ${r.url()}`);
});

const url = `http://localhost:${PORT}${BASE}`;
await page.goto(url, { waitUntil: "networkidle" });
await page.waitForTimeout(800);
await page.screenshot({ path: join(root, "scripts", "_shot-title.png") });

// start + play
await page.keyboard.press("Enter");
await page.keyboard.down("Space");
const moves = ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"];
for (let i = 0; i < 6; i++) {
  const k = moves[i % moves.length];
  await page.keyboard.down(k);
  await page.waitForTimeout(420);
  await page.keyboard.up(k);
}
await page.keyboard.up("Space");
await page.waitForTimeout(400);
await page.screenshot({ path: join(root, "scripts", "_shot-play.png") });

// canvas not blank?
const fill = await page.evaluate(() => {
  const c = document.getElementById("game");
  if (!c) return -1;
  const ctx = c.getContext("2d");
  const d = ctx.getImageData(0, 0, c.width, c.height).data;
  let lit = 0;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i] + d[i + 1] + d[i + 2] > 90) lit++;
  }
  return lit / (d.length / 4);
});

const state = await page.evaluate(() => "ok");

await browser.close();
await new Promise((r) => server.close(r));

console.log("---- browser test ----");
console.log("console errors:", consoleErrors.length, consoleErrors.slice(0, 8));
console.log("page errors:", pageErrors.length, pageErrors.slice(0, 8));
console.log("bad responses (>=400):", badResponses.length, badResponses.slice(0, 12));
console.log("canvas lit-pixel ratio (gameplay):", fill.toFixed(4));
console.log("eval ok:", state);

const ok = consoleErrors.length === 0 && pageErrors.length === 0 && badResponses.length === 0 && fill > 0.02;
console.log(ok ? "PASS" : "FAIL");
process.exit(ok ? 0 : 1);
