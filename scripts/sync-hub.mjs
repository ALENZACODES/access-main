#!/usr/bin/env node
// Fetches the idea packages listed in lanes.hub.json into .lanes/<repo>/.
// Node 22, no extra dependencies. Each repo is cloned at one pinned commit
// with a sparse checkout of only the listed package folders.
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";

import path from "node:path";
import { fileURLToPath } from "node:url";
import { applyHubWordingBan } from "./hub-wording.mjs";

const SHA = /^[0-9a-f]{40}$/;
const REPO = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const PKG = /^[A-Za-z0-9_.-]+$/;
const ALIAS = /^@[a-z0-9][a-z0-9_.-]*\/[a-z0-9][a-z0-9_.-]*$/;

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** Idea packages ship as standalone apps with their own <main> and <h1>. The shell already has both. */
function demoteNestedMains(dir) {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) {
      demoteNestedMains(full);
      continue;
    }
    if (!/\.(tsx|jsx)$/.test(name)) continue;
    const text = readFileSync(full, "utf8");
    const next = text
      .replaceAll("<main", "<div")
      .replaceAll("</main>", "</div>")
      .replaceAll("<h1", "<h2")
      .replaceAll("</h1>", "</h2>");
    if (next !== text) writeFileSync(full, next);
  }
}

const lockPath = path.join(root, "lanes.hub.json");
const outDir = path.join(root, ".lanes");
const tmpDir = path.join(root, ".lanes-tmp");
const stampPath = path.join(outDir, ".stamp.json");
const skipDirs = new Set(["node_modules", "dist", "e2e", "test", "playwright-report", "test-results"]);
const skipFiles = new Set(["tsconfig.json", "tsconfig.ts.json", "vite.config.ts", "index.html", "playwright.config.ts"]);

function parseLock(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch (error) {
    throw new Error(`lanes.hub.json is not valid JSON: ${error.message}`);
  }
  if (!data || data.version !== 1 || !Array.isArray(data.packages) || data.packages.length === 0) {
    throw new Error('lanes.hub.json must be {"version": 1, "packages": [...]} with at least one package');
  }
  const aliases = new Set();
  const packages = data.packages.map((entry, index) => {
    const where = `lanes.hub.json packages[${index}]`;
    const { repo, package: pkgName, alias, commit } = entry ?? {};
    if (typeof repo !== "string" || !REPO.test(repo)) throw new Error(`${where}: repo must look like "owner/name"`);
    if (typeof pkgName !== "string" || !PKG.test(pkgName)) throw new Error(`${where}: package must be a single folder name`);
    if (typeof alias !== "string" || !ALIAS.test(alias)) throw new Error(`${where}: alias must look like "@scope/name"`);
    if (typeof commit !== "string" || !SHA.test(commit)) throw new Error(`${where} (${alias}): commit must be a 40-character lowercase hex SHA`);
    if (aliases.has(alias)) throw new Error(`${where}: alias ${alias} is listed twice`);
    aliases.add(alias);
    return { repo, package: pkgName, alias, commit };
  });
  return { version: 1, packages };
}

const lockText = readFileSync(lockPath, "utf8");
const lock = parseLock(lockText);
const stamp = JSON.stringify({ version: lock.version, packages: lock.packages }, null, 2);

function alreadySynced() {
  if (!existsSync(stampPath)) return false;
  if (readFileSync(stampPath, "utf8") !== stamp) return false;
  return lock.packages.every((pkg) =>
    existsSync(path.join(outDir, pkg.repo.split("/")[1], "packages", pkg.package, "src", "index.ts")),
  );
}

if (alreadySynced()) {
  for (const pkg of lock.packages) {
    applyHubWordingBan(path.join(outDir, pkg.repo.split("/")[1], "packages", pkg.package));
  }
  process.exit(0);
}

const groups = new Map();
for (const pkg of lock.packages) {
  const key = `${pkg.repo}@${pkg.commit}`;
  const list = groups.get(key) ?? [];
  list.push(pkg);
  groups.set(key, list);
}

rmSync(tmpDir, { recursive: true, force: true });
mkdirSync(tmpDir, { recursive: true });

try {
  for (const pkgs of groups.values()) {
    const { repo, commit } = pkgs[0];
    const repoDir = path.join(tmpDir, repo.replace("/", "_"));
    const url = `https://github.com/${repo}.git`;
    execFileSync("git", ["clone", "--filter=blob:none", "--sparse", "--no-checkout", url, repoDir], { stdio: "inherit" });
    execFileSync(
      "git",
      ["-C", repoDir, "sparse-checkout", "set", "--cone", ...pkgs.map((pkg) => `packages/${pkg.package}`)],
      { stdio: "inherit" },
    );
    execFileSync("git", ["-C", repoDir, "fetch", "--depth", "1", "origin", commit], { stdio: "inherit" });
    execFileSync("git", ["-C", repoDir, "checkout", "--detach", commit], { stdio: "inherit" });
    const destRepo = path.join(outDir, repo.split("/")[1]);
    for (const pkg of pkgs) {
      const from = path.join(repoDir, "packages", pkg.package);
      if (!existsSync(path.join(from, "src", "index.ts"))) {
        throw new Error(`missing packages/${pkg.package}/src/index.ts in ${repo}@${commit}`);
      }
      const to = path.join(destRepo, "packages", pkg.package);
      rmSync(to, { recursive: true, force: true });
      mkdirSync(path.dirname(to), { recursive: true });
      cpSync(from, to, {
        recursive: true,
        filter: (src) => {
          const name = path.basename(src);
          if (skipDirs.has(name) || skipFiles.has(name)) return false;
          if (name.startsWith("tsconfig") && name.endsWith(".json")) return false;
          return true;
        },
      });
      demoteNestedMains(to);
      applyHubWordingBan(to);
    }
  }
  mkdirSync(outDir, { recursive: true });
  writeFileSync(stampPath, stamp);
} finally {
  rmSync(tmpDir, { recursive: true, force: true });
}
