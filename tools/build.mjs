// Release build (npm run build): stages what the game loads into _site/, fills in
// the site address, and checks that nothing the page asks for is missing.
//
//   node tools/build.mjs                  BASE_URL defaults to http://localhost:8080
//   BASE_URL=https://x.github.io/repo node tools/build.mjs
//
// There is no compile step: the shipped files are the source files. The Pages
// workflow (.github/workflows/pages.yml) runs this and publishes _site/.

import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const OUT = join(ROOT, "_site");
const SHIP = ["index.html", "manifest.webmanifest", "sw.js", "icons", "assets", "src"];
const BASE_URL = (process.env.BASE_URL || "http://localhost:8080").replace(/\/+$/, "");

const problems = [];

function stage() {
  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(OUT);
  for (const entry of SHIP) cpSync(join(ROOT, entry), join(OUT, entry), { recursive: true });
  writeFileSync(join(OUT, ".nojekyll"), "");
}

// Social cards and the canonical link need absolute URLs (index.html <head>).
function fillBaseUrl() {
  const file = join(OUT, "index.html");
  const html = readFileSync(file, "utf8").replaceAll("%BASE_URL%", BASE_URL);
  writeFileSync(file, html);
  writeFileSync(join(OUT, "robots.txt"), `User-agent: *\nAllow: /\nSitemap: ${BASE_URL}/sitemap.xml\n`);
  const day = new Date().toISOString().slice(0, 10);
  writeFileSync(join(OUT, "sitemap.xml"),
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    `  <url><loc>${BASE_URL}/</loc><lastmod>${day}</lastmod></url>\n</urlset>\n`);
}

function files(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...files(p));
    else out.push(p);
  }
  return out;
}

// A same-site reference must name a file that shipped.
function need(from, ref) {
  if (!ref || /^(https?:|data:|blob:|#|mailto:)/.test(ref) || ref.includes("${")) return;
  const clean = ref.split(/[?#]/)[0];
  if (!clean) return;
  const target = resolve(dirname(from), clean);
  const ok = existsSync(target) && (statSync(target).isFile() || existsSync(join(target, "index.html")));
  if (!ok) problems.push(`${relative(OUT, from)}: missing ${ref}`);
}

function validate() {
  const index = join(OUT, "index.html");
  const html = readFileSync(index, "utf8");
  if (html.includes("%BASE_URL%")) problems.push("index.html: unfilled %BASE_URL%");
  for (const m of html.matchAll(/\b(?:href|src)="([^"]+)"/g)) need(index, m[1]);
  for (const m of html.matchAll(/url\("(\.[^"]+)"\)/g)) need(index, m[1]);
  for (const m of html.matchAll(/(?:import|from)\s*\(?\s*["'](\.[^"']+)["']/g)) need(index, m[1]);

  const manifestFile = join(OUT, "manifest.webmanifest");
  const manifest = JSON.parse(readFileSync(manifestFile, "utf8"));
  for (const icon of manifest.icons || []) need(manifestFile, icon.src);

  for (const file of files(join(OUT, "src")).filter((f) => f.endsWith(".js"))) {
    const code = readFileSync(file, "utf8");
    for (const m of code.matchAll(/(?:^|[\s;])(?:import|export)\s[^"';]*?from\s*["'](\.{1,2}\/[^"']+)["']/gm)) need(file, m[1]);
    for (const m of code.matchAll(/(?:^|[\s;])import\s*["'](\.{1,2}\/[^"']+)["']/gm)) need(file, m[1]);
    for (const m of code.matchAll(/import\(\s*["'](\.{1,2}\/[^"']+)["']\s*\)/g)) need(file, m[1]);
    // Asset URLs are written from the page root ("./assets/..."), not from the module.
    for (const m of code.matchAll(/["'](\.\/(?:assets|icons)\/[^"'*]+?\.[a-z0-9]+)["']/g)) need(index, m[1]);
  }
}

stage();
fillBaseUrl();
validate();
if (problems.length) {
  console.error("build: " + problems.length + " problem(s)\n" + problems.map((p) => "  " + p).join("\n"));
  process.exit(1);
}
const size = files(OUT).reduce((n, f) => n + statSync(f).size, 0);
console.log(`build: _site/ ready for ${BASE_URL} (${files(OUT).length} files, ${(size / 1048576).toFixed(1)} MB)`);
