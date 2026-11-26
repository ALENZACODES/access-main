#!/usr/bin/env node
// Stages the built App for GitHub Pages.
//
//   node scripts/stage-pages.mjs [--maps <access-maps checkout>] [--dist <dir>]
//                                [--base /access-main/] [--no-sha] [--check-only]
//
// Staging (default):
//   1. copies exactly the files the pack manifest references (manifest, parts,
//      search index, tiles) from the access-maps checkout into <dist>/data/,
//      checking byte size and sha256, and refusing sources held for licence review;
//   2. writes <dist>/404.html, a single-page-app fallback for deep links;
//   3. adds .nojekyll and a small path-restore script to <dist>/index.html.
// Checks (always, and alone with --check-only):
//   every file < 100 MB, whole site < 1 GB, and the service worker's precache
//   total <= 5 MiB (5,242,880 bytes). The pack and tiles are never precached.
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { cp, mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

export const LIMITS = Object.freeze({
  maxFileBytes: 100_000_000,
  maxSiteBytes: 1_000_000_000,
  precacheBytes: 5_242_880,
});
export const MANIFEST_REL = "pack/v1/manifest.json";
export const RESTORE_PARAM = "spa-path";
const RESTORE_MARKER = "<!-- stage-pages:restore-path -->";

export function normalizeBase(input = "/") {
  let value = String(input).trim() || "/";
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) value = new URL(value).pathname;
  if (!value.startsWith("/")) value = `/${value}`;
  if (!value.endsWith("/")) value += "/";
  if (!/^[A-Za-z0-9._~\-/]+$/.test(value) || /(^|\/)\.\.?(\/|$)/.test(value)) {
    throw new Error(`Unsupported base path: ${input}`);
  }
  return value;
}

export function formatBytes(bytes) {
  return `${bytes.toLocaleString("en-CA")} bytes (${(bytes / 1048576).toFixed(2)} MiB)`;
}

// --- SPA fallback -----------------------------------------------------------

export function render404(base = "/") {
  const b = normalizeBase(base);
  const baseJs = JSON.stringify(b);
  return [
    "<!doctype html>",
    '<html lang="en">',
    "<head>",
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    '<meta name="robots" content="noindex">',
    "<title>the App</title>",
    "<script>",
    "(function () {",
    `  var base = ${baseJs};`,
    "  var path = location.pathname;",
    '  var rest = path.indexOf(base) === 0 ? path.slice(base.length) : "";',
    "  var target = base;",
    `  if (rest) target += "?${RESTORE_PARAM}=" + encodeURIComponent(rest + location.search);`,
    "  location.replace(target + location.hash);",
    "})();",
    "</script>",
    "</head>",
    "<body>",
    `<p lang="en">Opening the App. <a href="${b}">Continue</a></p>`,
    `<p lang="fr">Ouverture de l’application. <a href="${b}">Continuer</a></p>`,
    "</body>",
    "</html>",
    "",
  ].join("\n");
}

export function injectRestorePath(html, base = "/") {
  if (html.includes(RESTORE_MARKER)) return html;
  const b = normalizeBase(base);
  const snippet =
    `${RESTORE_MARKER}\n<script>(function(){try{var m=/[?&]${RESTORE_PARAM}=([^&#]*)/.exec(location.search);` +
    `if(m){history.replaceState(null,"",${JSON.stringify(b)}+decodeURIComponent(m[1])+location.hash)}}catch(e){}})();</script>`;
  const head = /<head[^>]*>/i.exec(html);
  if (!head) throw new Error("index.html has no <head> to inject the path-restore script into");
  const at = head.index + head[0].length;
  return `${html.slice(0, at)}\n${snippet}${html.slice(at)}`;
}

// --- helpers ----------------------------------------------------------------

async function exists(file) {
  try {
    await stat(file);
    return true;
  } catch {
    return false;
  }
}

function sha256File(file) {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    createReadStream(file)
      .on("data", (chunk) => hash.update(chunk))
      .on("end", () => resolve(hash.digest("hex")))
      .on("error", reject);
  });
}

async function* walk(dir, problems) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full, problems);
    else if (entry.isFile()) yield full;
    else problems.push(`${full}: symbolic links and special files cannot be published`);
  }
}

function safeRel(rel) {
  return (
    typeof rel === "string" &&
    rel.length > 0 &&
    !rel.startsWith("/") &&
    !rel.includes("\\") &&
    !rel.split("/").some((part) => part === ".." || part === "." || part === "")
  );
}

// --- pack staging -----------------------------------------------------------

export function manifestReferences(manifest, problems = []) {
  const held = new Set();
  const known = new Set();
  for (const source of manifest.sources ?? []) {
    known.add(source.sourceId);
    if (source.inWebPack === false) held.add(source.sourceId);
  }
  const refs = new Map();
  const add = (rel, extra) => {
    if (!safeRel(rel)) {
      problems.push(`manifest path is not a safe relative path: ${JSON.stringify(rel)}`);
      return;
    }
    if (!refs.has(rel)) refs.set(rel, { rel, ...extra });
  };
  for (const [tranche, group] of Object.entries(manifest.tranches ?? {})) {
    for (const [cell, info] of Object.entries(group?.cells ?? {})) {
      for (const part of info?.parts ?? []) {
        if (held.has(part.sourceId)) {
          problems.push(`${part.path}: source "${part.sourceId}" is held (inWebPack false) and must not ship (${tranche} ${cell})`);
          continue;
        }
        if (!known.has(part.sourceId)) problems.push(`${part.path}: source "${part.sourceId}" is not listed in manifest.sources`);
        add(part.path, { bytes: part.bytes, sha256: part.sha256 });
      }
    }
  }
  for (const entry of Object.values(manifest.search ?? {})) add(entry.path, { bytes: entry.bytes, sha256: entry.sha256 });
  for (const entry of Object.values(manifest.tiles ?? {})) add(entry.path, { bytes: entry.bytes, sha256: entry.sha256 });
  for (const sourceId of Object.keys(manifest.counts?.bySource ?? {})) {
    if (held.has(sourceId)) problems.push(`counts.bySource includes held source "${sourceId}"`);
  }
  return [...refs.values()];
}

async function resolveSource(mapsDir, rel) {
  for (const root of [path.join(mapsDir, "data"), mapsDir]) {
    const candidate = path.join(root, ...rel.split("/"));
    if (await exists(candidate)) return candidate;
  }
  return null;
}

export async function stagePack({ mapsDir, distDir, verifySha = true }) {
  const problems = [];
  const copied = [];
  const manifestSource = await resolveSource(mapsDir, MANIFEST_REL);
  if (!manifestSource) {
    return { problems: [`${MANIFEST_REL} not found under ${mapsDir} (looked in data/ and the checkout root)`], copied };
  }
  let manifest;
  try {
    manifest = JSON.parse(await readFile(manifestSource, "utf8"));
  } catch (error) {
    return { problems: [`${manifestSource}: not valid JSON (${error.message})`], copied };
  }
  const refs = manifestReferences(manifest, problems);
  const outRoot = path.join(distDir, "data");
  await rm(outRoot, { recursive: true, force: true });

  const place = async (source, rel) => {
    const target = path.join(outRoot, ...rel.split("/"));
    await mkdir(path.dirname(target), { recursive: true });
    await cp(source, target);
    copied.push(rel);
  };
  await place(manifestSource, MANIFEST_REL);

  for (const ref of refs) {
    const source = await resolveSource(mapsDir, ref.rel);
    if (!source) {
      problems.push(`${ref.rel}: listed in the manifest but missing from the access-maps checkout`);
      continue;
    }
    const info = await stat(source);
    if (typeof ref.bytes === "number" && info.size !== ref.bytes) {
      problems.push(`${ref.rel}: manifest says ${ref.bytes} bytes, file has ${info.size}`);
      continue;
    }
    if (verifySha && typeof ref.sha256 === "string" && (await sha256File(source)) !== ref.sha256) {
      problems.push(`${ref.rel}: sha256 does not match the manifest`);
      continue;
    }
    await place(source, ref.rel);
  }
  return { problems, copied, manifest };
}

// --- budgets ----------------------------------------------------------------

export async function checkSiteLimits(distDir, limits = LIMITS) {
  const problems = [];
  let total = 0;
  let files = 0;
  let largest = { file: "", bytes: 0 };
  for await (const file of walk(distDir, problems)) {
    const { size } = await stat(file);
    files += 1;
    total += size;
    if (size > largest.bytes) largest = { file: path.relative(distDir, file), bytes: size };
    if (size >= limits.maxFileBytes) {
      problems.push(`${path.relative(distDir, file)}: ${size} bytes is not under the ${limits.maxFileBytes}-byte file limit`);
    }
  }
  if (total >= limits.maxSiteBytes) problems.push(`site is ${total} bytes, not under the ${limits.maxSiteBytes}-byte limit`);
  return { problems, files, totalBytes: total, largest };
}

export function parsePrecacheUrls(source) {
  const start = source.indexOf("precacheAndRoute(");
  if (start < 0) return [];
  const open = source.indexOf("[", start);
  const close = open < 0 ? -1 : source.indexOf("]", open);
  if (close < 0) return [];
  const urls = [];
  const pattern = /(?:\burl|"url"|'url')\s*:\s*("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/g;
  for (const match of source.slice(open, close + 1).matchAll(pattern)) {
    urls.push(match[1].slice(1, -1).replace(/\\(.)/g, "$1"));
  }
  return [...new Set(urls)];
}

export async function checkPrecache(distDir, budgetBytes = LIMITS.precacheBytes) {
  const problems = [];
  const swFile = path.join(distDir, "sw.js");
  if (!(await exists(swFile))) return { problems: ["sw.js not found: the service worker was not generated"], bytes: 0, entries: 0 };
  const urls = parsePrecacheUrls(await readFile(swFile, "utf8"));
  if (urls.length === 0) problems.push("sw.js has no precache manifest entries");
  let bytes = 0;
  const root = path.resolve(distDir);
  for (const url of urls) {
    const clean = decodeURIComponent(url.split(/[?#]/)[0]);
    const file = path.resolve(root, clean);
    if (!file.startsWith(`${root}${path.sep}`)) {
      problems.push(`precache entry escapes the site root: ${url}`);
      continue;
    }
    if (clean === "data" || clean.startsWith("data/")) problems.push(`precache entry ${url} is pack or tile data, which must never be precached`);
    try {
      bytes += (await stat(file)).size;
    } catch {
      problems.push(`precache entry ${url} is not in ${distDir}`);
    }
  }
  if (bytes > budgetBytes) problems.push(`precache is ${bytes} bytes, over the ${budgetBytes}-byte budget`);
  return { problems, bytes, entries: urls.length };
}

// Uses the G10 budgets package when it is installed. The package name and the
// `precacheBytes` export are assumed; the 5 MiB ceiling always applies, so a
// package can only tighten the budget, never loosen it.
export async function loadPrecacheBudget() {
  try {
    const specifier = "@access-main/budgets";
    const mod = await import(/* @vite-ignore */ specifier);
    const budgets = mod.budgets ?? mod.default ?? mod;
    const value = budgets?.precacheBytes;
    if (Number.isInteger(value) && value > 0) {
      return { bytes: Math.min(value, LIMITS.precacheBytes), source: "@access-main/budgets" };
    }
  } catch {
    // not installed: use the built-in budget
  }
  return { bytes: LIMITS.precacheBytes, source: "built-in" };
}

// --- CLI --------------------------------------------------------------------

export function parseArgs(argv, env = process.env) {
  const args = {
    dist: "apps/web/dist",
    maps: env.ACCESS_MAPS_DIR ?? ".cache/access-maps",
    base: env.VITE_BASE ?? "/",
    verifySha: true,
    checkOnly: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--dist") args.dist = argv[++i];
    else if (arg === "--maps") args.maps = argv[++i];
    else if (arg === "--base") args.base = argv[++i];
    else if (arg === "--no-sha") args.verifySha = false;
    else if (arg === "--check-only") args.checkOnly = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}

export async function run(argv, env = process.env, log = console.log) {
  const args = parseArgs(argv, env);
  const distDir = path.resolve(args.dist);
  const base = normalizeBase(args.base);
  const problems = [];
  if (!(await exists(distDir))) throw new Error(`${distDir} does not exist; run the build first`);

  if (!args.checkOnly) {
    const staged = await stagePack({ mapsDir: path.resolve(args.maps), distDir, verifySha: args.verifySha });
    problems.push(...staged.problems);
    log(`pack: ${staged.copied.length} files copied to ${path.join(distDir, "data")}`);
    await writeFile(path.join(distDir, "404.html"), render404(base));
    await writeFile(path.join(distDir, ".nojekyll"), "");
    const indexFile = path.join(distDir, "index.html");
    await writeFile(indexFile, injectRestorePath(await readFile(indexFile, "utf8"), base));
    log(`404.html, .nojekyll and the path-restore script written for base ${base}`);
  } else {
    for (const name of ["404.html", ".nojekyll"]) {
      if (!(await exists(path.join(distDir, name)))) problems.push(`${name} is missing; run stage-pages without --check-only first`);
    }
  }

  const site = await checkSiteLimits(distDir);
  problems.push(...site.problems);
  log(`site: ${site.files} files, ${formatBytes(site.totalBytes)}; largest ${site.largest.file} at ${formatBytes(site.largest.bytes)}`);

  const budget = await loadPrecacheBudget();
  const precache = await checkPrecache(distDir, budget.bytes);
  problems.push(...precache.problems);
  log(`precache: ${formatBytes(precache.bytes)} in ${precache.entries} entries; budget ${formatBytes(budget.bytes)} (${budget.source})`);

  return { problems, site, precache };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  try {
    const { problems } = await run(process.argv.slice(2));
    if (problems.length > 0) {
      for (const problem of problems) console.error(`FAIL ${problem}`);
      process.exitCode = 1;
    } else {
      console.log("stage-pages: ok");
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
