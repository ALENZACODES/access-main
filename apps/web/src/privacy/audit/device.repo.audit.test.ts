// CI audit: every Cache Storage and IndexedDB name the App's source uses has a row in deviceRegister.ts.

import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { checkDeviceRegister, DEVICE_REGISTER } from "../panel/deviceRegister";
import { compareDevice, formatDeviceComparison, scanDeviceNames } from "./deviceStorageScan";
import { loadFiles } from "./repoFiles";

const ROOT = fileURLToPath(new URL("../../../../../", import.meta.url));

describe("cache and database names in the source", () => {
  const files = loadFiles(ROOT, ["apps/web/src"]);
  const found = scanDeviceNames(files);

  it("scans the real tree, so it cannot pass by finding nothing", () => {
    const ids = found.map((f) => `${f.kind}:${f.name}`);
    expect(ids).toContain("cache:map-tiles-v2");
    expect(ids).toContain("cache:data-status-");
    expect(ids).toContain("database:app-offline-regions");
  });

  it("matches the register in both directions", () => {
    const c = compareDevice(found, DEVICE_REGISTER);
    expect(c, `\n${formatDeviceComparison(c)}\n`).toEqual({ unregistered: [], stale: [], moved: [] });
  });

  it("has a well-formed register", () => {
    expect(checkDeviceRegister(DEVICE_REGISTER)).toEqual([]);
  });

  it("points every row at a file that exists and mentions the name", () => {
    for (const r of DEVICE_REGISTER) {
      const file = join(ROOT, r.path);
      expect(existsSync(file), r.path).toBe(true);
      expect(readFileSync(file, "utf8"), `${r.path} should name ${r.name}`).toContain(r.match === "prefix" ? r.name.slice(0, -1) : r.name);
    }
  });

  describe("would fail on a change, so it cannot pass by being blind", () => {
    const extra = (path: string, text: string) => [...files, { path, text }];

    it("fails when a new feature opens a cache with no row", () => {
      const c = compareDevice(scanDeviceNames(extra("apps/web/src/newFeature/store.ts", 'export const PHOTO_CACHE_NAME = "photo-store-v1";')), DEVICE_REGISTER);
      expect(c.unregistered.map((f) => `${f.kind}:${f.name}`)).toEqual(["cache:photo-store-v1"]);
      expect(formatDeviceComparison(c)).toContain("apps/web/src/newFeature/store.ts:1");
    });

    it("fails when a new feature names a database with no row", () => {
      const c = compareDevice(scanDeviceNames(extra("apps/web/src/newFeature/db.ts", 'const NOTES_DB = "notes-store";')), DEVICE_REGISTER);
      expect(c.unregistered.map((f) => `${f.kind}:${f.name}`)).toEqual(["database:notes-store"]);
    });

    it("fails when a new feature gives its service worker a cache prefix with no row", () => {
      const c = compareDevice(scanDeviceNames(extra("apps/web/src/newFeature/sw.ts", 'const config = { cachePrefix: "photo-shell" };')), DEVICE_REGISTER);
      expect(c.unregistered.map((f) => f.name)).toEqual(["photo-shell-"]);
    });

    it("fails when a file that names a registered cache is removed from the scan", () => {
      const without = files.filter((f) => f.path !== "apps/web/src/map/tileCache.ts");
      const c = compareDevice(scanDeviceNames(without), DEVICE_REGISTER);
      expect(c.stale.map((r) => r.name).sort()).toEqual(["map-tile-list-v1", "map-tiles-v2"]);
    });

    it("fails when a registered name moves to another file", () => {
      const c = compareDevice(scanDeviceNames(files), DEVICE_REGISTER.map((r) => (r.name === "app-offline-regions" ? { ...r, path: "apps/web/src/old/place.ts" } : r)));
      expect(c.moved).toHaveLength(1);
      expect(c.moved[0]?.name).toBe("app-offline-regions");
    });

    it("does not fail for a name that appears only in a test or in a comment", () => {
      const c = compareDevice(
        scanDeviceNames(extra("apps/web/src/newFeature/x.test.ts", 'const T_CACHE = "only-in-a-test";').concat(extra("apps/web/src/newFeature/y.ts", '// const Y_CACHE = "only-in-a-comment";'))),
        DEVICE_REGISTER,
      );
      expect(c).toEqual({ unregistered: [], stale: [], moved: [] });
    });
  });
});
