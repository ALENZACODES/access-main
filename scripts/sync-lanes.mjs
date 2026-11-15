#!/usr/bin/env node
// Pulls the sibling packages listed in lanes.lock.json into .lanes/<repo>/.
// Node 22, no dependencies. Each repo is fetched at one pinned commit with a
// sparse checkout of only the listed package folders; the .git folder is then
// deleted. Running it again rebuilds the same result.
import { execFileSync } from "node:child_process";
import { existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const UNPINNED = "PIN-AFTER-MERGE";
export const MAX_FILE_BYTES = 5 * 1024 * 1024;

const SHA = /^[0-9a-f]{40}$/;
const REPO = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const REF = /^[A-Za-z0-9][A-Za-z0-9_./-]*$/;
const PACKAGE_PATH = /^[A-Za-z0-9_.-]+(\/[A-Za-z0-9_.-]+)*$/;
const ALIAS = /^@[a-z0-9][a-z0-9_.-]*\/[a-z0-9][a-z0-9_.-]*$/;

/** Parses and checks lanes.lock.json text. Throws an Error that says which entry is wrong. */
export function parseLock(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch (error) {
    throw new Error(`lanes.lock.json is not valid JSON: ${error.message}`);
  }
  if (!data || data.version !== 1 || !Array.isArray(data.packages) || data.packages.length === 0) {
    throw new Error('lanes.lock.json must be {"version": 1, "packages": [...]} with at least one package');
  }
  const aliases = new Set();
  const packages = data.packages.map((entry, index) => {
    const where = `lanes.lock.json packages[${index}]`;
    const { repo, path: pkgPath, alias, commit } = entry ?? {};
    if (typeof repo !== "string" || !REPO.test(repo)) throw new Error(`${where}: repo must look like "owner/name"`);
    if (typeof pkgPath !== "string" || !PACKAGE_PATH.test(pkgPath) || pkgPath.split("/").some((part) => part === "." || part === "..")) {
      throw new Error(`${where}: path must be a relative folder inside the repo, without "." or ".." parts`);
    }
    if (typeof alias !== "string" || !ALIAS.test(alias)) throw new Error(`${where}: alias must look like "@scope/name"`);
    if (typeof commit !== "string" || (commit !== UNPINNED && !SHA.test(commit))) {
      throw new Error(`${where} (${alias}): commit must be a 40-character lowercase hex SHA or "${UNPINNED}"`);
    }
    if (aliases.has(alias)) throw new Error(`${where}: alias ${alias} is listed twice`);
    aliases.add(alias);
    return { repo, path: pkgPath, alias, commit };
  });
  return { version: 1, packages };
}

export function repoName(repo) {
  return repo.split("/")[1];
}

export function packageDir(outDir, pkg) {
  return path.join(outDir, repoName(pkg.repo), ...pkg.path.split("/"));
}

/** Refuses PIN-AFTER-MERGE unless a branch name was given for this run. */
export function assertPinned(lock, allowUnpinned) {
  const loose = lock.packages.filter((pkg) => pkg.commit === UNPINNED);
  if (loose.length === 0) return;
  if (!allowUnpinned) {
    throw new Error(
      `${loose.length} package(s) in lanes.lock.json still have "${UNPINNED}" as their commit (${loose.map((pkg) => pkg.alias).join(", ")}). ` +
        `Replace each with the 40-character commit of the merged package, or pass --allow-unpinned <branch> ` +
        `(or set LANES_ALLOW_UNPINNED=<branch>) to fetch the head of that branch for this run only.`,
    );
  }
  if (!REF.test(allowUnpinned)) throw new Error(`--allow-unpinned needs a branch name, got "${allowUnpinned}"`);
}

/** One fetch per repo and ref. Unpinned packages use the branch given for this run. */
export function planFetches(lock, allowUnpinned) {
  const groups = new Map();
  for (const pkg of lock.packages) {
    const ref = pkg.commit === UNPINNED ? allowUnpinned : pkg.commit;
    const key = `${pkg.repo}@${ref}`;
    if (!groups.has(key)) groups.set(key, { repo: pkg.repo, ref, packages: [] });
    groups.get(key).packages.push(pkg);
  }
  return [...groups.values()];
}

function git(args, cwd) {
  try {
    return execFileSync("git", args, {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
    });
  } catch (error) {
    throw new Error(`git ${args[0]} failed: ${String(error.stderr || error.message).trim()}`);
  }
}

function pullGroup(group, outDir, remoteBase, index) {
  const tmp = path.join(outDir, `.tmp-${repoName(group.repo)}-${index}`);
  rmSync(tmp, { recursive: true, force: true });
  mkdirSync(tmp, { recursive: true });
  try {
    git(["init", "-q"], tmp);
    git(["remote", "add", "origin", `${remoteBase}/${group.repo}.git`], tmp);
    git(["config", "core.sparseCheckout", "true"], tmp);
    git(["config", "core.sparseCheckoutCone", "false"], tmp);
    mkdirSync(path.join(tmp, ".git", "info"), { recursive: true });
    writeFileSync(path.join(tmp, ".git", "info", "sparse-checkout"), group.packages.map((pkg) => `/${pkg.path}/\n`).join(""));
    git(["fetch", "-q", "--depth", "1", "--filter=blob:none", "origin", group.ref], tmp);
    git(["checkout", "-q", "FETCH_HEAD"], tmp);
    rmSync(path.join(tmp, ".git"), { recursive: true, force: true });
    for (const pkg of group.packages) {
      const from = path.join(tmp, ...pkg.path.split("/"));
      if (!existsSync(from)) throw new Error(`${pkg.alias}: ${pkg.path} does not exist in ${group.repo} at ${group.ref}`);
      const to = packageDir(outDir, pkg);
      mkdirSync(path.dirname(to), { recursive: true });
      rmSync(to, { recursive: true, force: true });
      renameSync(from, to);
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

function listFiles(dir) {
  const files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...listFiles(full));
    else files.push({ file: full, size: lstatSync(full).size });
  }
  return files;
}

/** Removes and reports any file over the limit. Returns the file count and total bytes kept. */
export function enforceSizeLimit(dirs, limit = MAX_FILE_BYTES) {
  const all = dirs.filter((dir) => existsSync(dir)).flatMap(listFiles);
  const tooBig = all.filter((entry) => entry.size > limit);
  for (const entry of tooBig) rmSync(entry.file, { force: true });
  if (tooBig.length > 0) {
    const list = tooBig.map((entry) => `${entry.file} (${(entry.size / 1048576).toFixed(1)} MB)`).join(", ");
    throw new Error(`Refusing to keep ${tooBig.length} file(s) over ${limit / 1048576} MB; removed: ${list}`);
  }
  return { files: all.length, bytes: all.reduce((sum, entry) => sum + entry.size, 0) };
}

export function syncLanes({ lockPath, outDir, allowUnpinned, remoteBase = "https://github.com", ifMissing = false, log = console.log }) {
  const lock = parseLock(readFileSync(lockPath, "utf8"));
  if (ifMissing && lock.packages.every((pkg) => existsSync(packageDir(outDir, pkg)))) {
    log("lanes: all packages already present, nothing to do");
    return { files: 0, bytes: 0, fetches: 0 };
  }
  if (ifMissing && !allowUnpinned && lock.packages.some((pkg) => pkg.commit === UNPINNED)) {
    log(`lanes: skipping fetch; ${UNPINNED} pins are not set yet. The shell uses fallbacks until each package is pinned.`);
    return { files: 0, bytes: 0, fetches: 0 };
  }
  assertPinned(lock, allowUnpinned);
  mkdirSync(outDir, { recursive: true });
  writeFileSync(path.join(outDir, ".gitignore"), "*\n");
  const repos = [...new Set(lock.packages.map((pkg) => repoName(pkg.repo)))];
  for (const name of repos) rmSync(path.join(outDir, name), { recursive: true, force: true });
  const groups = planFetches(lock, allowUnpinned);
  groups.forEach((group, index) => {
    log(`lanes: ${group.repo} @ ${group.ref.slice(0, 12)} (${group.packages.map((pkg) => pkg.path).join(", ")})`);
    pullGroup(group, outDir, remoteBase, index);
  });
  const { files, bytes } = enforceSizeLimit(repos.map((name) => path.join(outDir, name)));
  log(`lanes: ${files} files, ${bytes} bytes in ${outDir}`);
  return { files, bytes, fetches: groups.length };
}

const VALUE_FLAGS = { "--allow-unpinned": "allowUnpinned", "--lock": "lock", "--out": "out", "--remote-base": "remoteBase" };

export function parseArgs(argv, env = process.env) {
  const options = { allowUnpinned: env.LANES_ALLOW_UNPINNED || undefined, ifMissing: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const eq = arg.indexOf("=");
    const flag = eq < 0 ? arg : arg.slice(0, eq);
    if (flag === "--if-missing") {
      options.ifMissing = true;
    } else if (flag in VALUE_FLAGS) {
      const value = eq < 0 ? argv[++index] : arg.slice(eq + 1);
      if (!value || value.startsWith("--")) throw new Error(`${flag} needs a value`);
      options[VALUE_FLAGS[flag]] = value;
    } else {
      throw new Error(`unknown argument ${arg}. Usage: sync-lanes.mjs [--allow-unpinned <branch>] [--if-missing] [--lock <file>] [--out <dir>] [--remote-base <url>]`);
    }
  }
  return options;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
    const options = parseArgs(process.argv.slice(2));
    syncLanes({
      lockPath: options.lock ? path.resolve(options.lock) : path.join(root, "lanes.lock.json"),
      outDir: options.out ? path.resolve(options.out) : path.join(root, ".lanes"),
      allowUnpinned: options.allowUnpinned,
      remoteBase: options.remoteBase,
      ifMissing: options.ifMissing,
    });
  } catch (error) {
    console.error(`sync-lanes: ${error.message}`);
    process.exit(1);
  }
}
