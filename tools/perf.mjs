// Frame-cost profile on the real GPU: drives dev views headless (ANGLE/D3D11, not
// swiftshader) and, inside the page, times rt.update, rt.tickHud and the render's CPU
// submit, the GPU time of each render (timer queries), and the rAF-paced frame.
//
//   node tools/perf.mjs                  the default views below
//   node tools/perf.mjs town d12         just these
//   node tools/perf.mjs --frames=240 --w=1920 --h=1080 --dpr=1.5
//   node tools/perf.mjs --json           one JSON line per view (for before/after diffs)
//   node tools/perf.mjs --cpu town       also a CPU profile: top functions by self time
//   node tools/perf.mjs --meshes town    also the heaviest meshes (triangles x instances, culling, shadows)
//   node tools/perf.mjs --ablate town    render time with one thing switched off at a time
//
// Uses the server on :8080 if one is up, else (or with --own) starts serve.mjs from
// this checkout on a spare port: run a copy in a `git worktree` for a before/after.

import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { existsSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));

const VIEWS = {
  town: "",
  square: "at=0,-6,0&cam=0.6,0.5,20",
  overview: "at=0,4,0&cam=3.3,0.95,40",
  d2: "floor=2&seed=3&cam=0.7,0.75,17",
  d12: "floor=12&seed=3&cam=0.7,0.75,17",
  d22: "floor=22&seed=3&cam=0.7,0.75,17",
  d32: "floor=32&seed=3&cam=0.7,0.75,17",
  d42: "floor=42&seed=3&cam=0.7,0.75,17",
  boss15: "floor=15&seed=3&cam=0.7,0.75,17"
};

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

async function server(own) {
  if (!own && await up("http://localhost:8080/index.html")) return { base: "http://localhost:8080", stop() {} };
  const port = 8090 + Math.floor(Math.random() * 400);
  const child = spawn(process.execPath, [join(ROOT, "serve.mjs"), String(port)], { stdio: "ignore" });
  const base = "http://localhost:" + port;
  for (let i = 0; i < 50 && !(await up(base + "/index.html")); i++) await new Promise((r) => setTimeout(r, 100));
  return { base, stop() { child.kill(); } };
}

// Runs inside the page. CPU: rt.update, rt.tickHud and renderer.render (submit only,
// no sync). GPU: EXT_disjoint_timer_query_webgl2 around each render (shadow + main
// pass), collected after the loop. A forced readPixels sync is not used: on ANGLE/D3D11
// it stalls ~3-8 ms on its own and swamps the real cost.
async function measure(frames) {
  const rt = window.__game.rt;
  const r = rt.renderer;
  const gl = r.getContext();
  const ext = gl.getExtension("EXT_disjoint_timer_query_webgl2");
  const t = { update: [], hud: [], render: [], gpu: [] };
  const queries = [];
  for (let i = 0; i < 20; i++) { rt.update(1 / 60); rt.tickHud(1 / 60); r.render(rt.scene, rt.camera); }
  for (let i = 0; i < frames; i++) {
    const a = performance.now();
    rt.update(1 / 60);
    const b = performance.now();
    rt.tickHud(1 / 60);
    const c = performance.now();
    let q = null;
    if (ext) { q = gl.createQuery(); gl.beginQuery(ext.TIME_ELAPSED_EXT, q); }
    r.render(rt.scene, rt.camera);
    if (q) { gl.endQuery(ext.TIME_ELAPSED_EXT); queries.push(q); }
    const d = performance.now();
    t.update.push(b - a); t.hud.push(c - b); t.render.push(d - c);
    // let the GPU drain now and then so queries do not pile up past the driver's limit
    if (i % 10 === 9) await new Promise((res) => setTimeout(res, 0));
  }
  await new Promise((res) => setTimeout(res, 300));
  for (const q of queries) {
    if (gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE) && !gl.getParameter(ext.GPU_DISJOINT_EXT)) t.gpu.push(gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6);
    gl.deleteQuery(q);
  }
  // The game's own loop, paced by rAF (capped at the display rate).
  const t0 = performance.now();
  let n = 0;
  await new Promise((res) => { const f = () => { if (++n >= 90) res(); else requestAnimationFrame(f); }; requestAnimationFrame(f); });
  const raf = (performance.now() - t0) / 90;
  const stat = (list) => {
    if (!list.length) return { mean: NaN, p95: NaN };
    const s = list.slice().sort((x, y) => x - y);
    const mean = s.reduce((x, y) => x + y, 0) / s.length;
    return { mean: +mean.toFixed(2), p95: +s[Math.floor(s.length * 0.95)].toFixed(2) };
  };
  let lights = 0;
  let shadowLights = 0;
  let meshes = 0;
  let visibleMeshes = 0;
  rt.scene.traverse((o) => {
    if (o.isLight) { lights++; if (o.castShadow) shadowLights++; }
    if (o.isMesh) { meshes++; if (o.visible) visibleMeshes++; }
  });
  const info = r.info;
  return {
    update: stat(t.update), hud: stat(t.hud), render: stat(t.render), gpu: stat(t.gpu), raf: +raf.toFixed(2),
    calls: info.render.calls, triangles: info.render.triangles,
    programs: info.programs ? info.programs.length : 0,
    geometries: info.memory.geometries, textures: info.memory.textures,
    lights, shadowLights, meshes, visibleMeshes,
    canvas: r.domElement.width + "x" + r.domElement.height
  };
}

// Self time per function (url:line), largest first.
function printProfile(profile, top) {
  const self = new Map();
  const byId = new Map(profile.nodes.map((n) => [n.id, n]));
  const dt = profile.timeDeltas;
  const hits = new Map();
  for (let i = 0; i < profile.samples.length; i++) hits.set(profile.samples[i], (hits.get(profile.samples[i]) || 0) + (dt[i] || 0));
  let total = 0;
  for (const [id, us] of hits) {
    const n = byId.get(id);
    const f = n.callFrame;
    const file = (f.url || "").split("/").slice(-2).join("/");
    const key = (f.functionName || "(anon)") + " " + file + ":" + (f.lineNumber + 1);
    self.set(key, (self.get(key) || 0) + us);
    total += us;
  }
  const rows = [...self].sort((a, b) => b[1] - a[1]).slice(0, top);
  for (const [k, us] of rows) console.log("   " + (us / 1000).toFixed(1).padStart(7) + " ms " + ((100 * us) / total).toFixed(1).padStart(5) + "%  " + k);
}

async function main() {
  const args = process.argv.slice(2);
  const flags = Object.fromEntries(args.filter((a) => a.startsWith("--")).map((a) => {
    const [k, v] = a.slice(2).split("=");
    return [k, v == null ? true : v];
  }));
  const names = args.filter((a) => !a.startsWith("--"));
  const list = names.length ? names : Object.keys(VIEWS);
  const frames = Number(flags.frames) || 180;
  const { chromium } = await findPlaywright();
  const srv = await server(!!flags.own);
  const browser = await chromium.launch({ args: ["--use-angle=d3d11", "--ignore-gpu-blocklist", "--enable-gpu"] });
  try {
    for (const name of list) {
      const ctx = await browser.newContext({
        viewport: { width: Number(flags.w) || 1600, height: Number(flags.h) || 900 },
        deviceScaleFactor: Number(flags.dpr) || 1,
        serviceWorkers: "block"
      });
      const page = await ctx.newPage();
      const q = name.startsWith("q:") ? name.slice(2) : VIEWS[name];
      // &res=pin: hold the resolution at its cap so runs compare (play/resolution.js).
      await page.goto(srv.base + "/index.html?dev=1&res=pin&" + q, { waitUntil: "load", timeout: 90000 });
      await page.waitForFunction(() => window.__game && window.__game.rt && window.__game.rt.townModelsReady, null, { timeout: 60000 });
      await page.evaluate(() => window.__game.rt.townModelsReady);
  await page.evaluate(() => window.__game.rt.assetsReady);
      await page.waitForFunction(() => { const d = window.__game.rt.dungeonRoot; return !d || (d.userData.dressedWithKit && d.userData.foesReady); }, null, { timeout: 15000 }).catch(() => {});
      await page.waitForTimeout(1500);
      let cdp = null;
      if (flags.cpu) {
        cdp = await ctx.newCDPSession(page);
        await cdp.send("Profiler.enable");
        await cdp.send("Profiler.setSamplingInterval", { interval: 200 });
        await cdp.send("Profiler.start");
      }
      const m = await page.evaluate(measure, frames);
      if (flags.ablate) {
        const rows = await page.evaluate(async (frames) => {
          const rt = window.__game.rt;
          const r = rt.renderer;
          const gl = r.getContext();
          const ext = gl.getExtension("EXT_disjoint_timer_query_webgl2");
          const wait = (ms) => new Promise((res) => setTimeout(res, ms));
          // CPU submit ms and GPU ms per render, over `frames` renders.
          async function time() {
            for (let i = 0; i < 5; i++) r.render(rt.scene, rt.camera);
            await wait(50);
            const q = ext ? gl.createQuery() : null;
            if (q) gl.beginQuery(ext.TIME_ELAPSED_EXT, q);
            const a = performance.now();
            for (let i = 0; i < frames; i++) r.render(rt.scene, rt.camera);
            const cpu = (performance.now() - a) / frames;
            if (q) gl.endQuery(ext.TIME_ELAPSED_EXT);
            let gpu = NaN;
            for (let k = 0; q && k < 40; k++) {
              await wait(25);
              if (gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) { gpu = gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6 / frames; break; }
            }
            if (q) gl.deleteQuery(q);
            return cpu.toFixed(2) + "/" + gpu.toFixed(2);
          }
          const lights = [];
          rt.scene.traverse((o) => { if (o.isLight) lights.push(o); });
          const sun = lights.find((l) => l.castShadow);
          const out = { base: await time() };
          if (sun) { sun.castShadow = false; out.noShadow = await time(); sun.castShadow = true; }
          const points = lights.filter((l) => (l.isPointLight || l.isSpotLight) && l.visible);
          points.forEach((l) => { l.visible = false; });
          out["noPoint" + points.length] = await time();
          points.forEach((l) => { l.visible = true; });
          const fog = rt.scene.fog;
          rt.scene.fog = null;
          out.noFog = await time();
          rt.scene.fog = fog;
          const hidden = [];
          rt.scene.traverse((o) => { if (o.material && !Array.isArray(o.material) && o.material.transparent && o.visible) { o.visible = false; hidden.push(o); } });
          out["noTransp" + hidden.length] = await time();
          hidden.forEach((o) => { o.visible = true; });
          const inst = [];
          rt.scene.traverse((o) => { if (o.isInstancedMesh && o.visible) { o.visible = false; inst.push(o); } });
          out["noInstanced" + inst.length] = await time();
          inst.forEach((o) => { o.visible = true; });
          const pr = r.getPixelRatio();
          r.setPixelRatio(pr * 0.5);
          out.halfRes = await time();
          r.setPixelRatio(pr);
          const clip = r.localClippingEnabled;
          r.localClippingEnabled = false;
          out.noClipping = await time();
          r.localClippingEnabled = clip;
          return out;
        }, 30);
        console.log("   ablate cpu/gpu ms: " + Object.entries(rows).map(([k, v]) => k + " " + v).join(" | "));
      }
      if (flags.meshes) {
        const rows = await page.evaluate(() => {
          const out = [];
          window.__game.rt.scene.traverse((o) => {
            if (!o.isMesh || !o.visible) return;
            let vis = true;
            for (let p = o.parent; p; p = p.parent) if (!p.visible) vis = false;
            if (!vis) return;
            const g = o.geometry;
            const tris = (g.index ? g.index.count : g.attributes.position.count) / 3;
            const n = o.isInstancedMesh ? o.count : 1;
            out.push({ name: o.name || o.parent && o.parent.name || "?", tris, n, total: tris * n, culled: o.frustumCulled, cast: o.castShadow, inst: !!o.isInstancedMesh });
          });
          return out.sort((a, b) => b.total - a.total).slice(0, 25);
        });
        for (const r of rows) console.log("   " + String(Math.round(r.total)).padStart(8) + " tris  " + String(Math.round(r.tris)).padStart(6) + " x " + String(r.n).padStart(5) + (r.inst ? " inst" : "     ") + (r.culled ? " cull" : " ALL ") + (r.cast ? " shadow" : "       ") + "  " + r.name);
      }
      if (cdp) printProfile((await cdp.send("Profiler.stop")).profile, Number(flags.top) || 25);
      if (flags.json) console.log(JSON.stringify(Object.assign({ view: name }, m)));
      else {
        const cpu = m.update.mean + m.hud.mean + m.render.mean;
        console.log(`${name.padEnd(9)} cpu ${cpu.toFixed(2).padStart(6)} ms (update ${String(m.update.mean).padStart(5)} hud ${String(m.hud.mean).padStart(4)} render ${String(m.render.mean).padStart(5)}) | gpu ${String(m.gpu.mean).padStart(5)} ms (p95 ${m.gpu.p95}) | rAF ${m.raf} ms | calls ${m.calls} tris ${m.triangles} progs ${m.programs} lights ${m.lights}/${m.shadowLights}sh meshes ${m.visibleMeshes}/${m.meshes} ${m.canvas}`);
      }
      await ctx.close();
    }
  } finally {
    await browser.close();
    srv.stop();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
