// Social preview card (og:image / twitter:image in index.html): renders a town
// view at 1200x630 with the HUD hidden, lays the title over it in the game's
// own fonts, and writes icons/og-image.png.
//
//   node tools/og-image.mjs                       the default framing
//   node tools/og-image.mjs "at=0,-6,0&cam=0.6,0.5,20" --out=shots/og-try.png
//
// Needs Playwright, found the same way as tools/shots.mjs.

import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { existsSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const VIEW = "time=0.42&at=0,-6,0&cam=0.6,0.5,20";

async function findPlaywright() {
  try { return await import("playwright"); } catch (e) { /* fall through */ }
  const cache = join(process.env.LOCALAPPDATA || join(process.env.HOME || "", ".npm"), "npm-cache", "_npx");
  const alt = join(process.env.HOME || "", ".npm", "_npx");
  for (const dir of [cache, alt]) {
    if (!existsSync(dir)) continue;
    for (const d of readdirSync(dir)) {
      const p = join(dir, d, "node_modules", "playwright");
      if (existsSync(p)) return createRequire(join(dir, d, "x.js"))("playwright");
    }
  }
  throw new Error("Playwright not found. Run: npx playwright install chromium");
}

async function up(url) {
  try { const r = await fetch(url); return r.ok; } catch (e) { return false; }
}

async function server() {
  if (await up("http://localhost:8080/index.html")) return { base: "http://localhost:8080", stop() {} };
  const port = 8090 + Math.floor(Math.random() * 400);
  const child = spawn(process.execPath, [join(ROOT, "serve.mjs"), String(port)], { stdio: "ignore" });
  const base = "http://localhost:" + port;
  for (let i = 0; i < 50 && !(await up(base + "/index.html")); i++) await new Promise((r) => setTimeout(r, 100));
  return { base, stop() { child.kill(); } };
}

// The title plaque, drawn over the canvas once the HUD is hidden.
const CARD = `
  body > *:not(canvas):not(#og-card) { display: none !important; }
  #og-card { position: fixed; inset: 0; pointer-events: none; z-index: 99;
    background: linear-gradient(90deg, rgba(14,9,6,.88) 0%, rgba(14,9,6,.6) 34%, rgba(14,9,6,0) 58%),
                linear-gradient(0deg, rgba(14,9,6,.55) 0%, rgba(14,9,6,0) 30%); }
  #og-card .plate { position: absolute; left: 64px; top: 50%; transform: translateY(-50%); max-width: 600px; color: var(--ink); }
  #og-card .kicker { font: 600 20px/1 var(--f-display); letter-spacing: .32em; color: var(--brass); text-transform: uppercase; }
  #og-card h1 { margin: 18px 0 10px; font: 700 96px/.95 var(--f-display); letter-spacing: .02em;
    color: var(--brass-hi); text-shadow: 0 3px 0 #000, 0 0 28px rgba(0,0,0,.7); }
  #og-card .rule { width: 220px; height: 2px; margin: 18px 0; background: linear-gradient(90deg, var(--brass), transparent); }
  #og-card p { margin: 0; font: italic 400 30px/1.3 var(--f-body); color: var(--ink-2); text-shadow: 0 2px 6px #000; }
  #og-card .tag { margin-top: 26px; font: 500 21px/1.4 var(--f-body); color: var(--mute); }
`;
const CARD_HTML = `<div class="plate">
  <div class="kicker">The Outer Wood</div>
  <h1>Greenmere</h1>
  <div class="rule"></div>
  <p>Delve the Underwood from the last town before the dark</p>
  <div class="tag">A free browser dungeon crawler &middot; play instantly</div>
</div>`;

async function main() {
  const args = process.argv.slice(2);
  const view = args.find((a) => !a.startsWith("--")) || VIEW;
  const outArg = args.find((a) => a.startsWith("--out="));
  const out = resolve(ROOT, outArg ? outArg.slice(6) : "icons/og-image.png");
  const { chromium } = await findPlaywright();
  const srv = await server();
  const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
  try {
    const ctx = await browser.newContext({ viewport: { width: 1200, height: 630 }, serviceWorkers: "block" });
    const page = await ctx.newPage();
    page.on("pageerror", (e) => console.log("page error: " + e.message));
    await page.goto(srv.base + "/index.html?dev=1&hide=hero&" + view, { waitUntil: "load", timeout: 90000 });
    await page.waitForFunction(() => window.__game && window.__game.rt && window.__game.rt.townModelsReady, null, { timeout: 60000 });
    await page.evaluate(() => window.__game.rt.townModelsReady);
    await page.evaluate(() => window.__game.rt.assetsReady);
    await page.evaluate(() => document.fonts.ready);
    await page.evaluate(({ css, html }) => {
      const style = document.createElement("style");
      style.textContent = css;
      document.head.appendChild(style);
      const card = document.createElement("div");
      card.id = "og-card";
      card.innerHTML = html;
      document.body.appendChild(card);
    }, { css: CARD, html: CARD_HTML });
    // A few frames so shadows and the cutaway settle at the new size.
    await page.evaluate(() => new Promise((r) => { let n = 0; const f = () => (++n > 8 ? r() : requestAnimationFrame(f)); f(); }));
    await page.screenshot({ path: out, timeout: 60000 });
    console.log("wrote " + out);
  } finally {
    await browser.close();
    srv.stop();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
