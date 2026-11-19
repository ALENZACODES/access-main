import { describe, expect, it } from "vitest";
import type { DeviceRow } from "../panel/deviceRegister";
import { compareDevice, formatDeviceComparison, scanDeviceNames } from "./deviceStorageScan";

const file = (path: string, text: string) => ({ path, text });
const ids = (files: ReturnType<typeof file>[]): string[] => scanDeviceNames(files).map((f) => `${f.kind}:${f.match}:${f.name}`);

describe("scanDeviceNames", () => {
  it("finds a cache named by a constant", () => {
    expect(ids([file("apps/web/src/a.ts", 'export const TILE_CACHE_NAME = "map-tiles-v2";')])).toEqual(["cache:exact:map-tiles-v2"]);
    expect(ids([file("apps/web/src/a.ts", "const IMAGE_CACHE = 'img-store';")])).toEqual(["cache:exact:img-store"]);
    expect(ids([file("apps/web/src/a.ts", 'const pageCache = "page-store";')])).toEqual(["cache:exact:page-store"]);
  });
  it("finds a cache opened with a literal", () => {
    expect(ids([file("apps/web/src/a.ts", 'await caches.open("late-cache");')])).toEqual(["cache:exact:late-cache"]);
  });
  it("finds a cache prefix given as cachePrefix and stores it with its hyphen", () => {
    expect(ids([file("apps/web/src/a.ts", 'const config = { cachePrefix: "app-shell", version: "1" };')])).toEqual(["cache:prefix:app-shell-"]);
    expect(ids([file("apps/web/src/a.ts", 'const config = { cachePrefix: "kept-" };')])).toEqual(["cache:prefix:kept-"]);
  });
  it("finds a PREFIX constant only in a file that builds cache names from it", () => {
    const builds = 'const DEFAULT_PREFIX = "data-status";\nfunction cacheName(c) { return `${c.prefix ?? DEFAULT_PREFIX}-${c.version}`; }';
    expect(ids([file("apps/web/src/a.ts", builds)])).toEqual(["cache:prefix:data-status-"]);
    expect(ids([file("apps/web/src/b.ts", 'const DEFAULT_PREFIX = "something-else";')])).toEqual([]);
  });
  it("finds databases named by a default argument, a constant or a literal", () => {
    expect(ids([file("apps/web/src/a.ts", 'function open(databaseName = "app-offline-regions") {}')])).toEqual(["database:exact:app-offline-regions"]);
    expect(ids([file("apps/web/src/a.ts", 'const NOTES_DB_NAME = "notes-store";')])).toEqual(["database:exact:notes-store"]);
    expect(ids([file("apps/web/src/a.ts", 'indexedDB.open("quick-store", 2);')])).toEqual(["database:exact:quick-store"]);
  });
  it("ignores comments, tests, test helpers, declaration files and the audit folder", () => {
    const text = 'const TILE_CACHE_NAME = "map-tiles-v2";';
    expect(ids([file("apps/web/src/a.ts", `// ${text}`), file("apps/web/src/b.ts", ` * ${text}`)])).toEqual([]);
    expect(ids([file("apps/web/src/a.test.ts", text), file("apps/web/src/a.test-util.ts", text), file("apps/web/src/a.d.ts", text), file("apps/web/src/privacy/audit/x.ts", text)])).toEqual([]);
    expect(ids([file("apps/web/src/narrow/samples.ts", text), file("apps/web/src/readme.md", text)])).toEqual([]);
  });
  it("ignores constants that are not about caches or databases", () => {
    expect(ids([file("apps/web/src/a.ts", 'const GREETING = "hello-world"; const TITLE_TEXT = "some-title";')])).toEqual([]);
  });
  it("ignores a name built at run time, because it cannot be read from the source", () => {
    expect(ids([file("apps/web/src/a.ts", "await caches.open(`dyn-${id}`); await caches.open(name);")])).toEqual([]);
  });
  it("lists a name once, with every file that names it, and the first file and line as its place", () => {
    const found = scanDeviceNames([file("apps/web/src/z.ts", 'x\ncaches.open("shared-store");'), file("apps/web/src/a.ts", '\n\nconst SHARED_CACHE = "shared-store";')]);
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ path: "apps/web/src/a.ts", line: 3, paths: ["apps/web/src/a.ts", "apps/web/src/z.ts"] });
  });
  it("sorts by kind and name, whatever the order of the files", () => {
    const a = file("apps/web/src/a.ts", 'const B_CACHE = "bbb-store"; const A_CACHE = "aaa-store"; const Z_DB = "zzz-store";');
    expect(ids([a])).toEqual(["cache:exact:aaa-store", "cache:exact:bbb-store", "database:exact:zzz-store"]);
  });
  it("is not fooled by short or odd values", () => {
    expect(ids([file("apps/web/src/a.ts", 'const A_CACHE = "ab"; const B_CACHE = "has space";')])).toEqual([]);
  });
});

const row = (patch: Partial<DeviceRow>): DeviceRow => ({
  kind: "cache",
  name: "map-tiles-v2",
  match: "exact",
  path: "apps/web/src/a.ts",
  holds: { en: "x", fr: "x" },
  source: "Test",
  recordedOn: "2026-11-19",
  ...patch,
});

describe("compareDevice", () => {
  const found = scanDeviceNames([file("apps/web/src/a.ts", 'const TILE_CACHE_NAME = "map-tiles-v2";')]);
  it("is clean when both sides agree", () => {
    expect(compareDevice(found, [row({})])).toEqual({ unregistered: [], stale: [], moved: [] });
  });
  it("reports a name the source uses that has no row", () => {
    const c = compareDevice(found, []);
    expect(c.unregistered.map((f) => f.name)).toEqual(["map-tiles-v2"]);
    expect(formatDeviceComparison(c)).toBe("cache map-tiles-v2: used in apps/web/src/a.ts:1 but has no row in deviceRegister.ts");
  });
  it("reports a row the source no longer backs", () => {
    const c = compareDevice([], [row({})]);
    expect(c.stale).toHaveLength(1);
    expect(formatDeviceComparison(c)).toBe("cache map-tiles-v2: in deviceRegister.ts but not found in the source");
  });
  it("reports a row whose file is not where the name is found", () => {
    const c = compareDevice(found, [row({ path: "apps/web/src/elsewhere.ts" })]);
    expect(c.moved).toEqual([{ name: "map-tiles-v2", registered: "apps/web/src/elsewhere.ts", found: ["apps/web/src/a.ts"] }]);
    expect(formatDeviceComparison(c)).toContain("registered for apps/web/src/elsewhere.ts, found in apps/web/src/a.ts");
  });
  it("tells a cache from a database of the same name, and an exact name from a prefix", () => {
    expect(compareDevice(found, [row({ kind: "database" })]).unregistered).toHaveLength(1);
    expect(compareDevice(found, [row({ match: "prefix", name: "map-tiles-v2-" })]).unregistered).toHaveLength(1);
  });
  it("formats nothing for a clean comparison", () => {
    expect(formatDeviceComparison({ unregistered: [], stale: [], moved: [] })).toBe("");
  });
});
