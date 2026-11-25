/**
 * First-install budget guard for the production build (P11).
 *
 * Runs after `vite build` (postbuild), so CI's build step fails when the
 * first install grows past 4,718,592 bytes. The first install is what a
 * phone downloads before the app works offline: every file in the service
 * worker precache, plus the service worker and its Workbox runtime.
 *
 * On-demand downloads are not part of the first install and are kept out of
 * the cap: offline region packs (packs/), data files (data/), PMTiles, and
 * the MapLibre chunk that only the map page requests. The guard fails if any
 * of them ever lands in the precache, and reports their sizes separately.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { assertInstallBudget, INSTALL_BUDGET_BYTES, type InstallAsset } from "../src/perf/install-budget.ts";

const ON_DEMAND = [/^packs\//, /^data\//, /\.pmtiles$/, /(^|\/)maplibre-[^/]*\.js$/];

const here = path.dirname(fileURLToPath(import.meta.url));
const dist = path.resolve(here, "../dist");

function fail(message: string): never {
  console.error(`Install budget: ${message}`);
  process.exit(1);
}

function walk(dir: string, prefix = ""): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    return entry.isDirectory() ? walk(path.join(dir, entry.name), rel) : [rel];
  });
}

const swFile = path.join(dist, "sw.js");
if (!existsSync(swFile)) fail("dist/sw.js is missing, so the first install cannot be measured.");
const sw = readFileSync(swFile, "utf8");
const list = /precacheAndRoute\(\s*(\[[\s\S]*?\])\s*(?:,|\))/.exec(sw)?.[1];
if (!list) fail("no precacheAndRoute([...]) in dist/sw.js.");

const urls = [...list.matchAll(/url\s*:\s*"([^"]+)"/g)].map((match) => (match[1] ?? "").replace(/^\//, ""));
if (urls.length === 0) fail("the precache list is empty; refusing to pass an empty install.");

const misplaced = urls.filter((url) => ON_DEMAND.some((pattern) => pattern.test(url)));
if (misplaced.length > 0) fail(`on-demand files are in the precache and would count toward first install: ${misplaced.join(", ")}`);

const runtime = ["sw.js", ...[...sw.matchAll(/["']\.\/(workbox-[\w-]+)["']/g)].map((match) => `${match[1]}.js`)];
const installed = [...new Set([...urls, ...runtime])];
const assets: InstallAsset[] = installed.map((url) => {
  const file = path.join(dist, url);
  if (!existsSync(file)) fail(`precached file is missing from dist: ${url}`);
  return { path: url, bytes: statSync(file).size };
});

let report;
try {
  report = assertInstallBudget(assets);
} catch (error) {
  const largest = [...assets].sort((a, b) => b.bytes - a.bytes).slice(0, 10).map((asset) => `  ${asset.bytes}\t${asset.path}`).join("\n");
  fail(`${error instanceof Error ? error.message : String(error)}\nLargest files:\n${largest}`);
}

const onDemand = walk(dist).filter((file) => ON_DEMAND.some((pattern) => pattern.test(file)));
const onDemandBytes = onDemand.reduce((sum, file) => sum + statSync(path.join(dist, file)).size, 0);

console.log(`First install: ${report.totalBytes} B in ${report.assets} files (cap ${INSTALL_BUDGET_BYTES} B, ${report.remainingBytes} B left).`);
console.log(`On demand, outside the cap: ${onDemandBytes} B in ${onDemand.length} files (packs, data, tiles, MapLibre).`);
