#!/usr/bin/env node
/**
 * Measure the apps/web production precache against budget.json.
 * This is a real build check, not the invented fixture in this package.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../..");
const budgetPath = path.join(here, "../budget.json");
const distDir = path.join(repoRoot, "apps/web/dist");
const PRECACHE_LIMIT = 4_718_592;
const JS_ENTRY_LIMIT = 524_288;

function fail(message) {
  console.error(message);
  process.exit(1);
}

if (!fs.existsSync(budgetPath)) fail(`Missing budget file: ${budgetPath}`);
const budget = JSON.parse(fs.readFileSync(budgetPath, "utf8"));
const limit = Number(budget.maxPrecacheBytes);
if (!Number.isSafeInteger(limit) || limit !== PRECACHE_LIMIT) {
  fail(`budget.json maxPrecacheBytes must be ${PRECACHE_LIMIT} (4.5 MiB); found ${budget.maxPrecacheBytes}`);
}
const jsEntryLimit = Number(budget.maxLargestJsEntryBytes);
if (!Number.isSafeInteger(jsEntryLimit) || jsEntryLimit !== JS_ENTRY_LIMIT) {
  fail(`budget.json maxLargestJsEntryBytes must be ${JS_ENTRY_LIMIT} (512 KiB); found ${budget.maxLargestJsEntryBytes}`);
}

if (!fs.existsSync(distDir)) {
  fail("apps/web/dist is missing. Run npm run build first so the real precache can be measured.");
}

const swCandidates = ["sw.js", "service-worker.js"].map((name) => path.join(distDir, name));
const swPath = swCandidates.find((candidate) => fs.existsSync(candidate));
if (!swPath) fail(`No service worker found in ${distDir}. The precache cannot be measured.`);

const source = fs.readFileSync(swPath, "utf8");
const match = source.match(/precacheAndRoute\(\s*(\[[\s\S]*?\])\s*(?:,|\))/);
if (!match) fail(`Could not find precacheAndRoute([...]) in ${path.relative(repoRoot, swPath)}.`);

// Workbox emits a JS array literal ({url:"...",revision:...}), not JSON.
let entries;
try {
  const literal = match[1].replace(/\b(url|revision)\s*:/g, '"$1":');
  entries = JSON.parse(literal);
} catch (error) {
  fail(`Could not parse precache manifest in ${path.relative(repoRoot, swPath)}: ${error instanceof Error ? error.message : error}`);
}

if (!Array.isArray(entries) || entries.length === 0) {
  fail("The built precache manifest is empty. Refusing to treat this as a passing install.");
}

const seen = new Set();
const assets = [];
for (const entry of entries) {
  const url = typeof entry === "string" ? entry : entry?.url;
  if (typeof url !== "string" || !url) fail(`Precache entry is missing a url: ${JSON.stringify(entry)}`);
  const relative = url.replace(/^\//, "");
  if (seen.has(relative)) continue;
  seen.add(relative);
  const filePath = path.join(distDir, relative);
  if (!fs.existsSync(filePath)) fail(`Precached file is missing on disk: ${relative}`);
  const bytes = fs.statSync(filePath).size;
  assets.push({ url: relative, bytes });
}

const total = assets.reduce((sum, asset) => sum + asset.bytes, 0);
const largest = assets.reduce((max, asset) => (asset.bytes > max.bytes ? asset : max), assets[0]);
const jsAssets = assets.filter((asset) => asset.url.endsWith(".js"));
const largestJs = jsAssets.reduce((max, asset) => (asset.bytes > max.bytes ? asset : max), jsAssets[0] ?? { url: "(none)", bytes: 0 });
console.log(`Measured apps/web precache: ${total} bytes in ${assets.length} files (cap ${limit} bytes / 4.5 MiB).`);
console.log(`Largest precached file: ${largest.url} (${largest.bytes} bytes).`);
console.log(`Largest precached JS entry: ${largestJs.url} (${largestJs.bytes} bytes, cap ${jsEntryLimit} bytes / 512 KiB).`);

if (largestJs.bytes > jsEntryLimit) {
  const over = jsAssets
    .slice()
    .sort((a, b) => b.bytes - a.bytes)
    .slice(0, 15)
    .map((asset) => `  ${asset.bytes}\t${asset.url}`)
    .join("\n");
  fail(`JS entry ${largestJs.url} is ${largestJs.bytes} bytes, over the ${jsEntryLimit} byte (512 KiB) per-file budget.\nLargest JS files:\n${over}`);
}

if (total > limit) {
  const over = assets
    .slice()
    .sort((a, b) => b.bytes - a.bytes)
    .slice(0, 15)
    .map((asset) => `  ${asset.bytes}\t${asset.url}`)
    .join("\n");
  fail(`Precache ${total} bytes exceeds ${limit} bytes (4.5 MiB).\nLargest files:\n${over}`);
}

console.log("Precache is within the 4.5 MiB first-install budget.");
