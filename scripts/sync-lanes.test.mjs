// Run with: node --test scripts/sync-lanes.test.mjs
// Uses a local bare git repository as the remote. No network.
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");

async function registerTests() {
  const { test, before, after } = await import("node:test");
  const assert = await import("node:assert/strict");
  const { UNPINNED, assertPinned, enforceSizeLimit, parseArgs, parseLock, planFetches, syncLanes } = await import("./sync-lanes.mjs");

  const SHA_A = "a".repeat(40);
  const entry = (extra = {}) => ({ repo: "ALENZACODES/access-tools", path: "packages/games", alias: "@access-tools/games", commit: SHA_A, ...extra });
  const lockText = (...packages) => JSON.stringify({ version: 1, packages });

  const git = (cwd, ...args) =>
    execFileSync("git", ["-c", "user.name=fixture", "-c", "user.email=fixture@example.invalid", "-c", "commit.gpgsign=false", ...args], {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();

  let tmp;
  let remoteBase;
  let commit;

  before(() => {
    tmp = mkdtempSync(path.join(os.tmpdir(), "sync-lanes-"));
    const work = path.join(tmp, "work");
    mkdirSync(path.join(work, "packages", "alpha", "src"), { recursive: true });
    mkdirSync(path.join(work, "packages", "beta", "src"), { recursive: true });
    mkdirSync(path.join(work, "packages", "big"), { recursive: true });
    mkdirSync(path.join(work, "other"), { recursive: true });
    writeFileSync(path.join(work, "README.md"), "root file, not in any listed package\n");
    writeFileSync(path.join(work, "tsconfig.base.json"), "{ \"compilerOptions\": { \"strict\": true } }\n");
    writeFileSync(path.join(work, "other", "skip.txt"), "not listed\n");
    writeFileSync(path.join(work, "packages", "alpha", "src", "index.ts"), "export const alpha = 1;\n");
    writeFileSync(path.join(work, "packages", "beta", "src", "index.ts"), "export const beta = 2;\n");
    writeFileSync(path.join(work, "packages", "big", "blob.bin"), Buffer.alloc(5 * 1024 * 1024 + 1));
    git(tmp, "init", "-q", "-b", "main", work);
    git(work, "add", "-A");
    git(work, "commit", "-q", "-m", "fixture");
    commit = git(work, "rev-parse", "HEAD");
    const bare = path.join(tmp, "remote", "ALENZACODES", "fixture-repo.git");
    mkdirSync(path.dirname(bare), { recursive: true });
    git(tmp, "clone", "-q", "--bare", work, bare);
    git(bare, "config", "uploadpack.allowAnySHA1InWant", "true");
    git(bare, "config", "uploadpack.allowFilter", "true");
    remoteBase = `file://${path.join(tmp, "remote")}`;
  });

  after(() => rmSync(tmp, { recursive: true, force: true }));

  const fixtureEntry = (name, extra = {}) =>
    entry({ repo: "ALENZACODES/fixture-repo", path: `packages/${name}`, alias: `@fixture/${name}`, commit, ...extra });

  const run = (name, lock, options = {}) => {
    const lockPath = path.join(tmp, `${name}.lock.json`);
    const outDir = path.join(tmp, `${name}-out`);
    writeFileSync(lockPath, lock);
    const logs = [];
    const result = () => syncLanes({ lockPath, outDir, remoteBase, log: (line) => logs.push(line), ...options });
    return { outDir, logs, result };
  };

  test("parseLock accepts a valid lock and keeps every field", () => {
    const lock = parseLock(lockText(entry(), entry({ path: "packages/place", alias: "@access-tools/place", commit: UNPINNED })));
    assert.equal(lock.packages.length, 2);
    assert.deepEqual(lock.packages[0], entry());
    assert.equal(lock.packages[1].commit, UNPINNED);
  });

  test("parseLock rejects malformed entries with the entry named", () => {
    assert.throws(() => parseLock("{"), /not valid JSON/);
    assert.throws(() => parseLock('{"version":2,"packages":[]}'), /version/);
    assert.throws(() => parseLock(lockText(entry({ commit: "abc123" }))), /packages\[0\].*40-character/);
    assert.throws(() => parseLock(lockText(entry({ commit: SHA_A.toUpperCase() }))), /40-character/);
    assert.throws(() => parseLock(lockText(entry({ path: "../escape" }))), /path must be/);
    assert.throws(() => parseLock(lockText(entry({ path: "/abs" }))), /path must be/);
    assert.throws(() => parseLock(lockText(entry({ repo: "no-owner" }))), /owner\/name/);
    assert.throws(() => parseLock(lockText(entry({ alias: "bad alias" }))), /alias must/);
    assert.throws(() => parseLock(lockText(entry(), entry({ path: "packages/other" }))), /listed twice/);
  });

  test("the repository lanes.lock.json lists the nine sibling packages", () => {
    const lock = parseLock(readFileSync(path.join(root, "lanes.lock.json"), "utf8"));
    assert.deepEqual(
      lock.packages.map((pkg) => `${pkg.repo.split("/")[1]}:${pkg.path}:${pkg.alias}`),
      [
        "access-maps:packages/places-shell:@access-maps/places-shell",
        "access-maps:packages/journey:@access-maps/journey",
        "access-maps:packages/map-ui:@access-maps/map-ui",
        "access-maps:packages/journey-data:@access-maps/journey-data",
        "access-tools:packages/finders:@access-tools/finders",
        "access-tools:packages/place:@access-tools/place",
        "access-tools:packages/navigator:@access-tools/navigator",
        "access-tools:packages/games:@access-tools/games",
        "access-help:packages/help:@access/help",
      ],
    );
  });

  test("an unpinned package is refused unless a branch is given", () => {
    const lock = parseLock(lockText(entry({ commit: UNPINNED })));
    assert.throws(() => assertPinned(lock, undefined), /PIN-AFTER-MERGE[\s\S]*--allow-unpinned/);
    assert.throws(() => assertPinned(lock, "--oops"), /branch name/);
    assert.doesNotThrow(() => assertPinned(lock, "claude/integration"));
    assert.doesNotThrow(() => assertPinned(parseLock(lockText(entry())), undefined));
    assert.equal(planFetches(lock, "claude/integration")[0].ref, "claude/integration");
  });

  test("the command line exits 1 with the unpinned message", () => {
    const lockPath = path.join(tmp, "cli.lock.json");
    writeFileSync(lockPath, lockText(entry({ commit: UNPINNED })));
    const run1 = spawnSync("node", [path.join(here, "sync-lanes.mjs"), "--lock", lockPath, "--out", path.join(tmp, "cli-out")], {
      encoding: "utf8",
      env: { ...process.env, LANES_ALLOW_UNPINNED: "" },
    });
    assert.equal(run1.status, 1);
    assert.match(run1.stderr, /PIN-AFTER-MERGE/);
    assert.equal(existsSync(path.join(tmp, "cli-out")), false);
    assert.equal(parseArgs(["--allow-unpinned=main", "--if-missing"], {}).allowUnpinned, "main");
    assert.throws(() => parseArgs(["--allow-unpinned"], {}), /needs a value/);
    assert.throws(() => parseArgs(["--nope"], {}), /unknown argument/);
  });

  test("sync keeps only the listed folders, drops .git, and is idempotent", () => {
    const { outDir, logs, result } = run("good", lockText(fixtureEntry("alpha"), fixtureEntry("beta")));
    const first = result();
    assert.equal(readFileSync(path.join(outDir, "fixture-repo", "packages", "alpha", "src", "index.ts"), "utf8"), "export const alpha = 1;\n");
    assert.ok(existsSync(path.join(outDir, "fixture-repo", "packages", "beta", "src", "index.ts")));
    assert.equal(existsSync(path.join(outDir, "fixture-repo", "README.md")), false);
    assert.equal(existsSync(path.join(outDir, "fixture-repo", "other")), false);
    assert.equal(existsSync(path.join(outDir, "fixture-repo", ".git")), false);
    assert.equal(readFileSync(path.join(outDir, "fixture-repo", "tsconfig.base.json"), "utf8"), "{ \"compilerOptions\": { \"strict\": true } }\n");
    assert.equal(readFileSync(path.join(outDir, ".gitignore"), "utf8"), "*\n");
    assert.equal(first.files, 3);
    assert.match(logs.at(-1), /3 files, \d+ bytes/);
    const second = result();
    assert.deepEqual(second, first);
    assert.equal(existsSync(path.join(outDir, ".tmp-fixture-repo-0")), false);
  });

  test("a branch can stand in for an unpinned package", () => {
    const { outDir, result } = run("branch", lockText(fixtureEntry("alpha", { commit: UNPINNED })), { allowUnpinned: "main" });
    assert.equal(result().files, 2);
    assert.ok(existsSync(path.join(outDir, "fixture-repo", "tsconfig.base.json")));
    assert.ok(existsSync(path.join(outDir, "fixture-repo", "packages", "alpha", "src", "index.ts")));
  });

  test("--if-missing does nothing when every package is already there", () => {
    const { logs, result } = run("good", lockText(fixtureEntry("alpha"), fixtureEntry("beta")), { ifMissing: true });
    assert.equal(result().fetches, 0);
    assert.match(logs.at(-1), /already present/);
  });

  test("--if-missing skips a fetch when pins are still PIN-AFTER-MERGE", () => {
    const { logs, result, outDir } = run("unpinned-skip", lockText(fixtureEntry("alpha", { commit: UNPINNED })), { ifMissing: true });
    assert.equal(result().fetches, 0);
    assert.match(logs.at(-1), /PIN-AFTER-MERGE/);
    assert.equal(existsSync(path.join(outDir, "fixture-repo")), false);
  });

  test("a file over 5 MB is refused and removed", () => {
    const { outDir, result } = run("big", lockText(fixtureEntry("big")));
    assert.throws(result, /Refusing to keep 1 file\(s\) over 5 MB.*blob\.bin/);
    assert.equal(existsSync(path.join(outDir, "fixture-repo", "packages", "big", "blob.bin")), false);
    assert.deepEqual(enforceSizeLimit([path.join(outDir, "missing")]), { files: 0, bytes: 0 });
  });

  test("a package folder missing at the pinned commit is named in the error", () => {
    const { result } = run("missing", lockText(fixtureEntry("alpha"), fixtureEntry("gamma")));
    assert.throws(result, /@fixture\/gamma: packages\/gamma does not exist/);
  });
}

if (process.env.VITEST) {
  // The root vitest run also sees this file. It is a node:test file, so vitest only notes it.
  const { it } = await import("vitest");
  it.skip("sync-lanes tests run with: node --test scripts/sync-lanes.test.mjs", () => {});
} else {
  await registerTests();
}
