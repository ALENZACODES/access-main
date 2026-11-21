import { describe, expect, it } from "vitest";
import { lintCopy } from "./copyLint";
import { checkDeviceRegister, DEVICE_REGISTER, describeDevice, findRow, notReached, rowMatches, type DeviceRow } from "./deviceRegister";

const row = (patch: Partial<DeviceRow>): DeviceRow => ({
  kind: "cache",
  name: "thing-cache",
  match: "exact",
  path: "apps/web/src/x.ts",
  holds: { en: "Something", fr: "Quelque chose" },
  source: "Test",
  recordedOn: "2026-11-19",
  ...patch,
});

describe("rowMatches", () => {
  it("matches an exact row only on the whole name", () => {
    const r = row({ name: "map-tiles-v2" });
    expect(rowMatches(r, "cache", "map-tiles-v2")).toBe(true);
    expect(rowMatches(r, "cache", "map-tiles-v22")).toBe(false);
    expect(rowMatches(r, "cache", "map-tiles")).toBe(false);
  });
  it("matches a prefix row on any longer name that starts with it, but not on the prefix alone", () => {
    const r = row({ name: "data-status-", match: "prefix" });
    expect(rowMatches(r, "cache", "data-status-v3")).toBe(true);
    expect(rowMatches(r, "cache", "data-status-")).toBe(false);
    expect(rowMatches(r, "cache", "data-statusx")).toBe(false);
  });
  it("never matches across kinds", () => {
    expect(rowMatches(row({ name: "same-name" }), "database", "same-name")).toBe(false);
  });
});

describe("findRow", () => {
  it("returns null for a name that is in no row", () => {
    expect(findRow(DEVICE_REGISTER, "cache", "somebody-elses-cache")).toBeNull();
  });
  it("prefers an exact row over a prefix row", () => {
    const rows = [row({ name: "a-", match: "prefix", holds: { en: "prefix", fr: "préfixe" } }), row({ name: "a-b", holds: { en: "exact", fr: "exact" } })];
    expect(findRow(rows, "cache", "a-b")?.holds.en).toBe("exact");
    expect(findRow(rows, "cache", "a-c")?.holds.en).toBe("prefix");
  });
  it("finds the App's own names", () => {
    expect(findRow(DEVICE_REGISTER, "cache", "map-tiles-v2")?.path).toBe("apps/web/src/map/tileCache.ts");
    expect(findRow(DEVICE_REGISTER, "cache", "data-status-2026-11")?.path).toBe("apps/web/src/data-status/offline.ts");
    expect(findRow(DEVICE_REGISTER, "database", "app-offline-regions")?.kind).toBe("database");
  });
});

describe("describeDevice", () => {
  it("keeps Unknown as null rather than an empty list", () => {
    expect(describeDevice({ caches: null, databases: null }, DEVICE_REGISTER)).toEqual({ caches: null, databases: null });
  });
  it("keeps an empty answer empty", () => {
    expect(describeDevice({ caches: [], databases: [] }, DEVICE_REGISTER)).toEqual({ caches: [], databases: [] });
  });
  it("pairs names with rows and marks the unlisted ones", () => {
    const d = describeDevice({ caches: ["map-tiles-v2", "stranger"], databases: ["app-offline-regions", "other-db"] }, DEVICE_REGISTER);
    expect(d.caches?.map((c) => [c.name, c.row?.name ?? null])).toEqual([["map-tiles-v2", "map-tiles-v2"], ["stranger", null]]);
    expect(d.databases?.map((c) => [c.name, c.row !== null])).toEqual([["app-offline-regions", true], ["other-db", false]]);
  });
  it("marks a name clearable only when the button's prefix for its kind matches", () => {
    const d = describeDevice({ caches: ["app-shell-v1", "map-tiles-v2"], databases: ["app-offline-regions"] }, DEVICE_REGISTER, { cachePrefix: "app-shell-" });
    expect(d.caches?.map((c) => c.clearable)).toEqual([true, false]);
    expect(d.databases?.map((c) => c.clearable)).toEqual([false]);
  });
  it("marks nothing clearable when no prefix is given, and refuses an empty prefix", () => {
    expect(describeDevice({ caches: ["a-b"], databases: ["a-b"] }, [], {}).caches?.[0]?.clearable).toBe(false);
    expect(describeDevice({ caches: ["a-b"], databases: [] }, [], { cachePrefix: "" }).caches?.[0]?.clearable).toBe(false);
  });
  it("does not let a cache prefix clear a database of the same name", () => {
    expect(describeDevice({ caches: [], databases: ["app-offline-regions"] }, DEVICE_REGISTER, { cachePrefix: "app-" }).databases?.[0]?.clearable).toBe(false);
  });
});

describe("notReached", () => {
  it("lists every row when the button has no prefixes", () => {
    expect(notReached(DEVICE_REGISTER, {})).toHaveLength(DEVICE_REGISTER.length);
  });
  it("leaves out only the rows whose every name starts with the prefix", () => {
    const names = notReached(DEVICE_REGISTER, { cachePrefix: "app-shell-" }).map((r) => r.name);
    expect(names).not.toContain("app-shell-");
    expect(names).toContain("map-tiles-v2");
    expect(names).toContain("app-offline-regions");
  });
  it("does not count a shorter prefix as reaching a longer name it does not cover entirely", () => {
    const rows = [row({ name: "alpha-", match: "prefix" })];
    expect(notReached(rows, { cachePrefix: "alpha-beta-" })).toHaveLength(1);
    expect(notReached(rows, { cachePrefix: "alpha-" })).toHaveLength(0);
    expect(notReached(rows, { cachePrefix: "al" })).toHaveLength(0);
  });
});

describe("checkDeviceRegister", () => {
  it("accepts the App's register", () => {
    expect(checkDeviceRegister(DEVICE_REGISTER)).toEqual([]);
  });
  it("catches a row listed twice", () => {
    expect(checkDeviceRegister([row({}), row({})])).toEqual(["cache:thing-cache: listed twice"]);
  });
  it("allows the same name once as a cache and once as a database", () => {
    expect(checkDeviceRegister([row({}), row({ kind: "database" })])).toEqual([]);
  });
  it("catches names that are not plain lower case", () => {
    expect(checkDeviceRegister([row({ name: "Bad Name" })])[0]).toContain("not a plain lower-case name");
    expect(checkDeviceRegister([row({ name: "ab" })])[0]).toContain("not a plain lower-case name");
  });
  it("needs a prefix row to end with a hyphen and an exact row not to", () => {
    expect(checkDeviceRegister([row({ name: "data", match: "prefix" })])[0]).toContain("must end with a hyphen");
    expect(checkDeviceRegister([row({ name: "data-" })])[0]).toContain("cannot end with a hyphen");
  });
  it("catches a name two rows could both match", () => {
    const rows = [row({ name: "pre-", match: "prefix" }), row({ name: "pre-fixed" })];
    expect(checkDeviceRegister(rows).join("\n")).toContain("could match both");
  });
  it("catches a bad date, blank text, a blank source and a blank path", () => {
    const problems = checkDeviceRegister([row({ recordedOn: "19/11/2026", holds: { en: " ", fr: "x" }, source: "", path: "" })]).join("\n");
    expect(problems).toContain("recordedOn is not YYYY-MM-DD");
    expect(problems).toContain("holds is empty in one language");
    expect(problems).toContain("source is empty");
    expect(problems).toContain("path is empty");
  });
});

describe("register wording", () => {
  it("passes the copy lint in both languages for every row", () => {
    for (const r of DEVICE_REGISTER) {
      expect(lintCopy("en", r.holds.en), r.name).toEqual([]);
      expect(lintCopy("fr", r.holds.fr), r.name).toEqual([]);
    }
  });
  it("is dated on the day it was read", () => {
    expect(new Set(DEVICE_REGISTER.map((r) => r.recordedOn)).size).toBe(1);
  });
});
