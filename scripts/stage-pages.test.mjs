import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { findCommit } from "../deploy/lock-commit.mjs";
import {
  LIMITS,
  checkPrecache,
  checkSiteLimits,
  injectRestorePath,
  manifestReferences,
  normalizeBase,
  parseArgs,
  parsePrecacheUrls,
  render404,
  run,
  stagePack,
} from "./stage-pages.mjs";

let tmp;
beforeEach(async () => {
  tmp = await mkdtemp(path.join(os.tmpdir(), "stage-pages-"));
});
afterEach(async () => {
  await rm(tmp, { recursive: true, force: true });
});

async function put(file, content) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, content);
}
const sha = (content) => createHash("sha256").update(content).digest("hex");

const CELL = "n43.5_w079.5";
const PART = `venues/osm-ontario/${CELL}.ndjson.gz`;
const SEARCH = `pack/v1/search/${CELL}.json.gz`;
const TILES = "tiles/open/places.pmtiles";

async function fakeMaps(root, { heldPart = false, badSha = false, omitTiles = false } = {}) {
  const part = "part-bytes";
  const search = "search-bytes";
  const tiles = "tile-bytes";
  await put(path.join(root, "data", PART), part);
  await put(path.join(root, SEARCH), search);
  if (!omitTiles) await put(path.join(root, TILES), tiles);
  const parts = [{ path: PART, bytes: part.length, sha256: badSha ? "0".repeat(64) : sha(part), count: 1, sourceId: "osm-ontario" }];
  if (heldPart) parts.push({ path: `venues/go-transit/${CELL}.ndjson.gz`, bytes: 1, sha256: sha("x"), count: 1, sourceId: "go-transit" });
  const manifest = {
    version: 1,
    sources: [
      { sourceId: "osm-ontario", inWebPack: true, heldReason: null },
      { sourceId: "go-transit", inWebPack: false, heldReason: "licence held for a decision" },
    ],
    tranches: { venue: { cells: { [CELL]: { parts } } } },
    search: { [CELL]: { path: SEARCH, bytes: search.length, sha256: sha(search), count: 1 } },
    tiles: { open: { path: TILES, bytes: tiles.length } },
    counts: { bySource: { "osm-ontario": 1 } },
  };
  await put(path.join(root, "pack/v1/manifest.json"), JSON.stringify(manifest));
  return manifest;
}

describe("normalizeBase", () => {
  it("adds the leading and trailing slash", () => {
    expect(normalizeBase("/access-main")).toBe("/access-main/");
    expect(normalizeBase("access-main/")).toBe("/access-main/");
    expect(normalizeBase("")).toBe("/");
    expect(normalizeBase("https://alenzacodes.github.io/access-main/")).toBe("/access-main/");
  });
  it("rejects path tricks and script-breaking characters", () => {
    expect(() => normalizeBase("/a/../b/")).toThrow();
    expect(() => normalizeBase('/a"</script>/')).toThrow();
  });
});

describe("404 fallback", () => {
  it("keeps the path and base, and carries EN and FR text", () => {
    const html = render404("/access-main/");
    expect(html).toContain('var base = "/access-main/";');
    expect(html).toContain("?spa-path=");
    expect(html).toContain("location.hash");
    expect(html).toContain("Ouverture de l’application.");
  });
  it("matches the committed apps/web/public/404.html", async () => {
    const committed = await readFile(new URL("../apps/web/public/404.html", import.meta.url), "utf8");
    expect(committed).toBe(render404("/"));
  });
  it("restores the path once and only once", () => {
    const html = "<!doctype html><html><head><title>x</title></head><body></body></html>";
    const once = injectRestorePath(html, "/access-main/");
    expect(once).toContain("history.replaceState");
    expect(once).toContain('"/access-main/"');
    expect(injectRestorePath(once, "/access-main/")).toBe(once);
    expect(() => injectRestorePath("<p>no head</p>", "/")).toThrow();
  });
});

describe("pack staging", () => {
  it("copies only the files the manifest references", async () => {
    const maps = path.join(tmp, "maps");
    const dist = path.join(tmp, "dist");
    await fakeMaps(maps);
    await put(path.join(maps, "data", "venues/go-transit/held.ndjson.gz"), "held");
    const { problems, copied } = await stagePack({ mapsDir: maps, distDir: dist });
    expect(problems).toEqual([]);
    expect(copied.sort()).toEqual([PART, SEARCH, TILES, "pack/v1/manifest.json"].sort());
    expect(await readFile(path.join(dist, "data", PART), "utf8")).toBe("part-bytes");
    await expect(readFile(path.join(dist, "data", "venues/go-transit/held.ndjson.gz"))).rejects.toThrow();
  });
  it("refuses parts from a source held for licence review", async () => {
    const manifest = await fakeMaps(path.join(tmp, "maps"), { heldPart: true });
    const problems = [];
    manifestReferences(manifest, problems);
    expect(problems.join("\n")).toMatch(/go-transit.*held/);
  });
  it("flags a sha256 mismatch and a missing file", async () => {
    await fakeMaps(path.join(tmp, "bad"), { badSha: true });
    const bad = await stagePack({ mapsDir: path.join(tmp, "bad"), distDir: path.join(tmp, "d1") });
    expect(bad.problems.join("\n")).toMatch(/sha256 does not match/);
    await fakeMaps(path.join(tmp, "gone"), { omitTiles: true });
    const gone = await stagePack({ mapsDir: path.join(tmp, "gone"), distDir: path.join(tmp, "d2") });
    expect(gone.problems.join("\n")).toMatch(/missing from the access-maps checkout/);
  });
  it("rejects manifest paths that climb out of the pack", () => {
    const problems = [];
    manifestReferences({ sources: [], search: { c: { path: "../secrets.txt", bytes: 1 } } }, problems);
    expect(problems[0]).toMatch(/not a safe relative path/);
  });
  it("fails clearly when there is no manifest", async () => {
    const { problems } = await stagePack({ mapsDir: path.join(tmp, "empty"), distDir: path.join(tmp, "dist") });
    expect(problems[0]).toMatch(/manifest.json not found/);
  });
});

describe("budgets", () => {
  it("uses the agreed limits", () => {
    expect(LIMITS.precacheBytes).toBe(5 * 1024 * 1024);
    expect(LIMITS.maxFileBytes).toBe(100_000_000);
    expect(LIMITS.maxSiteBytes).toBe(1_000_000_000);
  });
  it("fails a file or site at or over the limit", async () => {
    await put(path.join(tmp, "dist/a.bin"), "x".repeat(10));
    await put(path.join(tmp, "dist/b.bin"), "x".repeat(5));
    const ok = await checkSiteLimits(path.join(tmp, "dist"), { maxFileBytes: 11, maxSiteBytes: 16 });
    expect(ok.problems).toEqual([]);
    const tooBig = await checkSiteLimits(path.join(tmp, "dist"), { maxFileBytes: 10, maxSiteBytes: 16 });
    expect(tooBig.problems.join("\n")).toMatch(/a\.bin/);
    const siteBig = await checkSiteLimits(path.join(tmp, "dist"), { maxFileBytes: 11, maxSiteBytes: 15 });
    expect(siteBig.problems.join("\n")).toMatch(/site is 15 bytes/);
  });
  it("reads minified and quoted precache manifests", () => {
    const sw = 'e.precacheAndRoute([{url:"assets/a-1.js",revision:null},{"url":"index.html","revision":"abc"},{url:"icons/i.png",revision:"z"}],{});e.registerRoute(({url:u})=>u)';
    expect(parsePrecacheUrls(sw)).toEqual(["assets/a-1.js", "index.html", "icons/i.png"]);
    expect(parsePrecacheUrls("no manifest here")).toEqual([]);
  });
  it("sums the precache from files on disk and fails over budget", async () => {
    const dist = path.join(tmp, "dist");
    await put(path.join(dist, "assets/a.js"), "x".repeat(30));
    await put(path.join(dist, "index.html"), "x".repeat(20));
    await put(path.join(dist, "sw.js"), 'precacheAndRoute([{url:"assets/a.js",revision:null},{url:"index.html",revision:"r"}],{})');
    const within = await checkPrecache(dist, 50);
    expect(within).toMatchObject({ bytes: 50, entries: 2, problems: [] });
    const over = await checkPrecache(dist, 49);
    expect(over.problems.join("\n")).toMatch(/over the 49-byte budget/);
  });
  it("fails when the service worker is missing, empty, or precaches pack data", async () => {
    const dist = path.join(tmp, "dist");
    await mkdir(dist, { recursive: true });
    expect((await checkPrecache(dist)).problems[0]).toMatch(/sw\.js not found/);
    await put(path.join(dist, "sw.js"), "precacheAndRoute([],{})");
    expect((await checkPrecache(dist)).problems[0]).toMatch(/no precache manifest entries/);
    await put(path.join(dist, "data/pack/v1/manifest.json"), "{}");
    await put(path.join(dist, "sw.js"), 'precacheAndRoute([{url:"data/pack/v1/manifest.json",revision:null}],{})');
    expect((await checkPrecache(dist)).problems.join("\n")).toMatch(/must never be precached/);
  });
});

describe("run", () => {
  it("stages a built site end to end", async () => {
    const maps = path.join(tmp, "maps");
    const dist = path.join(tmp, "dist");
    await fakeMaps(maps);
    await put(path.join(dist, "index.html"), "<!doctype html><html><head></head><body></body></html>");
    await put(path.join(dist, "assets/app.js"), "console.log(1)");
    await put(path.join(dist, "sw.js"), 'precacheAndRoute([{url:"assets/app.js",revision:null}],{})');
    const logs = [];
    const result = await run(["--dist", dist, "--maps", maps, "--base", "/access-main/"], {}, (line) => logs.push(line));
    expect(result.problems).toEqual([]);
    expect(await readFile(path.join(dist, "404.html"), "utf8")).toContain('"/access-main/"');
    expect(await readFile(path.join(dist, ".nojekyll"), "utf8")).toBe("");
    expect(await readFile(path.join(dist, "index.html"), "utf8")).toContain("history.replaceState");
    expect(logs.join("\n")).toMatch(/precache: 14 bytes/);
    const again = await run(["--dist", dist, "--check-only"], {}, () => {});
    expect(again.problems).toEqual([]);
  });
  it("check-only fails when staging has not run", async () => {
    const dist = path.join(tmp, "dist");
    await put(path.join(dist, "sw.js"), "precacheAndRoute([],{})");
    const result = await run(["--dist", dist, "--check-only"], {}, () => {});
    expect(result.problems.join("\n")).toMatch(/404\.html is missing/);
  });
  it("reads defaults from the environment and rejects unknown flags", () => {
    expect(parseArgs([], { VITE_BASE: "/access-main/", ACCESS_MAPS_DIR: "/m" })).toMatchObject({ base: "/access-main/", maps: "/m", checkOnly: false });
    expect(() => parseArgs(["--nope"], {})).toThrow(/Unknown argument/);
  });
});

describe("lanes.lock.json reader", () => {
  const A = "a".repeat(40);
  const B = "b".repeat(40);
  it("finds the pinned commit in the shapes a lock file takes", () => {
    expect(findCommit({ "access-maps": A }, "access-maps")).toBe(A);
    expect(findCommit({ repos: { "access-maps": { commit: A }, "access-tools": { commit: B } } }, "access-maps")).toBe(A);
    expect(findCommit({ lanes: [{ repo: "ALENZACODES/access-tools", sha: B }, { repo: "ALENZACODES/access-maps", sha: A }] }, "access-maps")).toBe(A);
  });
  it("refuses a branch name or a missing repo", () => {
    expect(() => findCommit({ "access-maps": "main" }, "access-maps")).toThrow(/40-character/);
    expect(() => findCommit({ "access-tools": A }, "access-maps")).toThrow(/no entry/);
  });
});

describe("deploy/pages.yml", () => {
  let yml;
  beforeEach(async () => {
    yml = await readFile(new URL("../deploy/pages.yml", import.meta.url), "utf8");
  });
  const active = () => yml.split("\n").filter((line) => !line.trimStart().startsWith("#")).join("\n");
  it("is manual-only, with the push trigger present but commented out", () => {
    expect(active()).toMatch(/^on:\n {2}workflow_dispatch:\n/m);
    expect(yml).toMatch(/^ {2}# push:\n {2}# {3}branches: \[main\]$/m);
    expect(active()).not.toMatch(/\bpush:|\bpull_request:|\bschedule:|\bcron\b/);
  });
  it("has the Pages permissions and concurrency group", () => {
    expect(active()).toMatch(/pages: write/);
    expect(active()).toMatch(/id-token: write/);
    expect(active()).toMatch(/contents: read/);
    expect(active()).toMatch(/group: pages/);
  });
  it("runs the build steps in order", () => {
    const order = [
      "actions/checkout@v4",
      "npm ci",
      "node scripts/sync-lanes.mjs",
      "node deploy/lock-commit.mjs lanes.lock.json access-maps",
      "repository: ALENZACODES/access-maps",
      "npm run build",
      "node scripts/stage-pages.mjs --maps",
      "node scripts/stage-pages.mjs --check-only",
      "actions/upload-pages-artifact@v3",
      "actions/deploy-pages@v4",
    ];
    let at = -1;
    for (const needle of order) {
      const next = yml.indexOf(needle, at + 1);
      expect(next, needle).toBeGreaterThan(at);
      at = next;
    }
    expect(yml).toMatch(/VITE_BASE: \/access-main\//);
    expect(yml).toMatch(/sparse-checkout: \|\n\s+data\n\s+pack\n\s+tiles\n/);
    expect(yml).toMatch(/fetch-depth: 1/);
  });
  it("cannot run: the file is not under .github/workflows", async () => {
    expect(new URL("../deploy/pages.yml", import.meta.url).pathname).not.toContain(".github/workflows");
  });
});
