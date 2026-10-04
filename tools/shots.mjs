// Visual check for town art: renders dev-mode views headless and writes PNGs
// plus one contact sheet (shots/sheet.png) to look at.
//
//   node tools/shots.mjs                 every building + overview
//   node tools/shots.mjs smith inn       just these views (building ids or view names)
//   node tools/shots.mjs --ab smith      before/after: "before" blocks the .glb models
//   node tools/shots.mjs --test          run the ?test=1 self-test, print failures
//   node tools/shots.mjs --time=0.9      time of day (0.5 noon, 0.9 night)
//
// Views: one per building (front three-quarter, generated from townplan), plus
// the named views in VIEWS below. A raw query works too: "q:at=0,0&cam=0,0.4,10".
// Needs Playwright: found via `import("playwright")` or the npx cache
// (npx playwright install chromium once). Uses the server on :8080 if one is
// up, else starts serve.mjs on a spare port.

import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { existsSync, mkdirSync, readdirSync, writeFileSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { BUILDINGS, COTTAGES, sidePoint, localToWorld, worldYaw } from "../src/sim/townplan.js";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const OUT = join(ROOT, "shots");

const VIEWS = {
  overview: "at=0,4,0&cam=3.3,0.95,40",
  square: "at=0,-6,0&cam=0.6,0.5,20",
  gate: "at=0,-29.5,0&cam=0.45,0.32,11",
  hearth: "at=3.4,-24.5,0&cam=-0.5,0.62,12",
  "store-upstairs": "at=-17,1,0&level=1&cam=1.57,0.9,12",
  // One floor per biome (src/sim/biomes.js bands), framed from the arrival landing.
  "d-cave": "floor=2&seed=3&cam=0.7,0.75,17",
  "d-temple": "floor=12&seed=3&cam=0.7,0.75,17",
  "d-root": "floor=22&seed=3&cam=0.7,0.75,17",
  "d-crypt": "floor=32&seed=3&cam=0.7,0.75,17",
  "d-forge": "floor=42&seed=3&cam=0.7,0.75,17"
};

function buildingViews() {
  const out = {};
  for (const b of BUILDINGS.concat(COTTAGES)) {
    const door = b.doors[0];
    const o = { front: [0, 1], back: [0, -1], left: [-1, 0], right: [1, 0] }[door.side];
    // Stand out front of the door; the camera looks back at the facade, a little off-axis.
    // Cottages back onto the forest, so a long camera ends up in the trees:
    // stand in the yard and frame them short and side-on.
    const p = sidePoint(b, door.side, door.at, b.yard ? 2.6 : 4.5);
    const w = localToWorld(b, p.x, p.z);
    const camYaw = worldYaw(b, -o[0], -o[1]) + (b.yard ? 1.0 : 0.55);
    const dist = b.yard ? 9.5 : Math.max(14, Math.max(b.w, b.d) * 1.5);
    const pitch = b.yard ? 0.6 : 0.38;
    out[b.id] = `at=${w.x.toFixed(2)},${w.z.toFixed(2)},0&cam=${camYaw.toFixed(3)},${pitch},${dist.toFixed(1)}`;
    // "<id>-in": just inside the door, looking across the room from above (cutaway).
    const ip = sidePoint(b, door.side, door.at, -1.4);
    const iw = localToWorld(b, ip.x, ip.z);
    const inYaw = worldYaw(b, -o[0], -o[1]) + 0.35;
    out[b.id + "-in"] = `at=${iw.x.toFixed(2)},${iw.z.toFixed(2)},0&cam=${inYaw.toFixed(3)},1.0,${Math.max(10, b.w).toFixed(1)}`;
  }
  return out;
}

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

async function shoot(page, base, query, file) {
  await page.goto(base + "/index.html?dev=1&" + query, { waitUntil: "load", timeout: 90000 });
  await page.waitForFunction(() => window.__game && window.__game.rt && window.__game.rt.townModelsReady, null, { timeout: 60000 });
  await page.evaluate(() => window.__game.rt.townModelsReady);
  // A dungeon floor re-dresses itself and its foes once its biome's Blender sets are in (blocked on "before").
  await page.waitForFunction(() => { const d = window.__game.rt.dungeonRoot; return !d || (d.userData.dressedWithKit && d.userData.foesReady); }, null, { timeout: 15000 }).catch(() => {});
  // &hide=hero also on dungeon floors (main.js only applies it in town).
  if (/(^|&)hide=hero/.test(query)) await page.evaluate(() => { window.__game.rt.player.visible = false; });
  // A few frames so shadows and the cutaway settle.
  await page.evaluate(() => new Promise((r) => { let n = 0; const f = () => (++n > 6 ? r() : requestAnimationFrame(f)); f(); }));
  await page.screenshot({ path: file, timeout: 60000 });
  // Software WebGL: an idle page left rendering would starve the next one.
  await page.goto("about:blank");
}

function sheet(rows, ab) {
  const img = (f) => `<img src="data:image/png;base64,${readFileSync(f).toString("base64")}">`;
  const cells = rows.map(([name, files]) =>
    `<figure><figcaption>${name}</figcaption><div class="pair">${files.map(img).join("")}</div></figure>`).join("");
  return `<!doctype html><meta charset="utf-8"><style>
    body{margin:0;background:#1d1f22;color:#ddd;font:14px system-ui;display:grid;grid-template-columns:repeat(${ab ? 1 : 2},1fr);gap:10px;padding:10px}
    figure{margin:0}figcaption{padding:2px 0 4px}.pair{display:flex;gap:6px}.pair img{width:${ab ? 50 : 100}%;display:block}
  </style>${cells}`;
}

async function main() {
  const args = process.argv.slice(2);
  const flags = Object.fromEntries(args.filter((a) => a.startsWith("--")).map((a) => {
    const [k, v] = a.slice(2).split("=");
    return [k, v == null ? true : v];
  }));
  const names = args.filter((a) => !a.startsWith("--"));
  const all = Object.assign(buildingViews(), VIEWS);
  const { chromium } = await findPlaywright();
  const srv = await server();
  const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
  const errors = [];
  const newPage = async (block) => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, serviceWorkers: "block" });
    const page = await ctx.newPage();
    page.on("pageerror", (e) => errors.push(e.message));
    // The "before" page blocks the models on purpose, so its load warnings are expected.
    if (!block) page.on("console", (m) => { if (m.type() === "error" || /\[town\]/.test(m.text())) errors.push(m.text()); });
    if (block) await page.route("**/*.glb", (r) => r.abort());
    return page;
  };
  try {
    if (flags.test) {
      const page = await newPage(false);
      const report = new Promise((res) => page.on("console", (m) => { if (/ALL PASSED|FAILED$/.test(m.text())) res(m.text()); }));
      await page.goto(srv.base + "/index.html?test=1");
      const text = await Promise.race([report, new Promise((r) => setTimeout(() => r("TIMEOUT"), 300000))]);
      const lines = text.split("\n");
      console.log(lines.filter((l) => !l.startsWith("PASS")).join("\n"));
      console.log(lines.filter((l) => l.startsWith("PASS")).length + " passed");
      if (!names.length) return;
    }
    mkdirSync(OUT, { recursive: true });
    const list = names.length ? names : Object.keys(all);
    const time = flags.time != null ? flags.time : "0.42";
    const after = await newPage(false);
    const before = flags.ab ? await newPage(true) : null;
    const rows = [];
    for (const name of list) {
      const q = (name.startsWith("q:") ? name.slice(2) : all[name]);
      if (!q) { console.log("unknown view: " + name); continue; }
      const query = "time=" + time + "&" + q;
      const safe = name.replace(/[^a-z0-9-]+/gi, "_").slice(0, 40);
      const files = [];
      if (before) { const f = join(OUT, safe + ".before.png"); await shoot(before, srv.base, query, f); files.push(f); }
      const f = join(OUT, safe + ".png");
      await shoot(after, srv.base, query, f);
      files.push(f);
      rows.push([name, files]);
      console.log("shot " + name);
    }
    const html = join(OUT, "sheet.html");
    writeFileSync(html, sheet(rows, !!before));
    const page = await newPage(false);
    await page.setViewportSize({ width: 1600, height: 900 });
    await page.goto(pathToFileURL(html).href);
    await page.screenshot({ path: join(OUT, "sheet.png"), fullPage: true });
    console.log("sheet: " + join(OUT, "sheet.png"));
  } finally {
    if (errors.length) console.log("page errors:\n" + [...new Set(errors)].slice(0, 20).join("\n"));
    await browser.close();
    srv.stop();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
