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
const PRECACHE_LIMIT = 4_141_875;

function fail(message) {
  console.error(message);
  process.exit(1);
}

if (!fs.existsSync(budgetPath)) fail(`Missing budget file: ${budgetPath}`);
const budget = JSON.parse(fs.readFileSync(budgetPath, "utf8"));
const limit = Number(budget.maxPrecacheBytes);
if (!Number.isSafeInteger(limit) || limit !== PRECACHE_LIMIT) {
  fail(`budget.json maxPrecacheBytes must be ${PRECACHE_LIMIT} (3.95 MiB); found ${budget.maxPrecacheBytes}`);
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

let entries;
try {
  entries = JSON.parse(match[1]);
} catch (error) {
  fail(`Precache manifest in ${path.relative(repoRoot, swPath)} is not valid JSON: ${error instanceof Error ? error.message : error}`);
}

if (!Array.isArray(entries) || entries.length === 0) {
  fail("The built precache manifest is empty. Refusing to treat this as a passing install.");
}

const assets = [];
for (const entry of entries) {
  const url = typeof entry === "string" ? entry : entry?.url;
  if (typeof url !== "string" || !url) fail(`Precache entry is missing a url: ${JSON.stringify(entry)}`);
  const relative = url.replace(/^\//, "");
  const filePath = path.join(distDir, relative);
  if (!fs.existsSync(filePath)) fail(`Precached file is missing on disk: ${relative}`);
  const bytes = fs.statSync(filePath).size;
  assets.push({ url: relative, bytes });
}

const total = assets.reduce((sum, asset) => sum + asset.bytes, 0);
const largest = assets.reduce((max, asset) => (asset.bytes > max.bytes ? asset : max), assets[0]);
console.log(`Measured apps/web precache: ${total} bytes in ${assets.length} files (cap ${limit} bytes / 3.95 MiB).`);
console.log(`Largest precached file: ${largest.url} (${largest.bytes} bytes).`);

if (total > limit) {
  const over = assets
    .slice()
    .sort((a, b) => b.bytes - a.bytes)
    .slice(0, 15)
    .map((asset) => `  ${asset.bytes}\t${asset.url}`)
    .join("\n");
  fail(`Precache ${total} bytes exceeds ${limit} bytes (3.95 MiB).\nLargest files:\n${over}`);
}

console.log("Precache is within the 3.95 MiB first-install budget.");
