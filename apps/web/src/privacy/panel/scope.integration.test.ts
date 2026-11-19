import { describe, expect, it } from "vitest";
import { createPrivacyController } from "./controller";
import type { DataScope } from "./dataScope";
import { applyImport, prepareImport } from "./importData";
import { FIXTURE } from "./fixtures.test-util";
import { eraseLocalData, exportLocalData } from "./localData";
import { createMemoryStorage } from "./storage";

const NOW = new Date(2026, 10, 19, 9, 0, 0);
const SCOPE: DataScope = { prefix: "access.", keys: ["app.preferences.v1", "data-status:snapshot:v1"] };
const SEED = {
  "access.language": "fr",
  "app.preferences.v1": '{"v":1}',
  "data-status:snapshot:v1": "{}",
  "app.preferences.v2": "keep",
  "__map_tile_list": "[]",
  "site.token": "keep",
};

describe("exportLocalData with a scope", () => {
  it("includes the prefix items and the listed extra names, and nothing else", () => {
    const f = exportLocalData(createMemoryStorage(SEED), SCOPE, NOW, "en");
    const body = JSON.parse(f.text) as { prefix: string; items: Record<string, string> };
    expect(Object.keys(body.items).sort()).toEqual(["access.language", "app.preferences.v1", "data-status:snapshot:v1"]);
    expect(body.prefix).toBe("access.");
    expect(f.count).toBe(3);
  });
  it("is unchanged when called with a prefix", () => {
    const f = exportLocalData(createMemoryStorage(SEED), "access.", NOW, "en");
    expect(f.count).toBe(1);
  });
});

describe("eraseLocalData with a scope", () => {
  it("removes the prefix items and the listed extra names only", () => {
    const s = createMemoryStorage(SEED);
    expect(eraseLocalData(s, SCOPE)).toEqual({ removed: 3, failed: [] });
    expect(s.getItem("app.preferences.v2")).toBe("keep");
    expect(s.getItem("__map_tile_list")).toBe("[]");
    expect(s.getItem("site.token")).toBe("keep");
    expect(s.getItem("access.language")).toBeNull();
  });
});

describe("prepareImport with a scope", () => {
  const file = (items: Record<string, string>): string => JSON.stringify({ format: "app-local-data", version: 1, prefix: "access.", items });
  it("accepts a listed extra name and plans it like any other key", () => {
    const s = createMemoryStorage({ "app.preferences.v1": "old" });
    const r = prepareImport(file({ "access.language": "en", "app.preferences.v1": "new" }), s, SCOPE);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.plan.additions).toEqual(["access.language"]);
      expect(r.plan.overwrites).toEqual(["app.preferences.v1"]);
      expect(applyImport(s, r.plan).written).toBe(2);
      expect(s.getItem("app.preferences.v1")).toBe("new");
    }
  });
  it("rejects a name that is not in the scope, naming it", () => {
    const r = prepareImport(file({ "app.preferences.v2": "x" }), createMemoryStorage(), SCOPE);
    expect(r).toEqual({ ok: false, code: "bad-key", detail: "app.preferences.v2" });
  });
  it("rejects an extra name when the scope is only a prefix, as before", () => {
    const r = prepareImport(file({ "app.preferences.v1": "x" }), createMemoryStorage(), "access.");
    expect(r).toEqual({ ok: false, code: "bad-key", detail: "app.preferences.v1" });
  });
  it("still rejects a reserved name and a different prefix", () => {
    expect(prepareImport(file({ "access.__proto__": "x" }), null, SCOPE)).toMatchObject({ ok: false, code: "bad-key" });
    const other = JSON.stringify({ format: "app-local-data", version: 1, prefix: "other.", items: { "other.a": "1" } });
    expect(prepareImport(other, null, SCOPE)).toMatchObject({ ok: false, code: "wrong-prefix" });
  });
});

describe("a controller with extra names", () => {
  function make(extraKeys?: readonly string[]) {
    const storage = createMemoryStorage(SEED);
    const c = createPrivacyController({ storage, prefix: "access.", inventory: FIXTURE, now: () => NOW, ...(extraKeys !== undefined ? { extraKeys } : {}) });
    return { storage, c };
  }
  it("downloads and erases the extra names too", () => {
    const { storage, c } = make(SCOPE.keys);
    const st = c.dispatch({ type: "export" });
    expect(st.lastExport?.count).toBe(3);
    c.dispatch({ type: "erase-ask" });
    expect(c.dispatch({ type: "erase-confirm" }).status).toEqual({ kind: "erased", count: 3 });
    expect(storage.getItem("app.preferences.v1")).toBeNull();
    expect(storage.getItem("site.token")).toBe("keep");
  });
  it("covers the prefix only when no extra names are given", () => {
    const { storage, c } = make();
    expect(c.dispatch({ type: "export" }).lastExport?.count).toBe(1);
    c.dispatch({ type: "erase-ask" });
    c.dispatch({ type: "erase-confirm" });
    expect(storage.getItem("app.preferences.v1")).toBe('{"v":1}');
  });
  it("restores an extra name from a file it made", () => {
    const { storage, c } = make(SCOPE.keys);
    const file = c.dispatch({ type: "export" }).lastExport;
    expect(file).not.toBeNull();
    c.dispatch({ type: "erase-ask" });
    c.dispatch({ type: "erase-confirm" });
    expect(c.dispatch({ type: "import-load", text: file?.text ?? "" }).status?.kind).toBe("import-ready");
    expect(c.dispatch({ type: "import-confirm" }).status).toEqual({ kind: "import-done", count: 3 });
    expect(storage.getItem("app.preferences.v1")).toBe('{"v":1}');
  });
  it("refuses to start with an extra name that is inside the prefix", () => {
    expect(() => make(["access.x"])).toThrow(/inside-prefix access\.x/);
  });
  it("says there is nothing to erase when only unlisted names are stored", () => {
    const storage = createMemoryStorage({ "app.preferences.v2": "x" });
    const c = createPrivacyController({ storage, prefix: "access.", inventory: FIXTURE, now: () => NOW, extraKeys: SCOPE.keys });
    c.dispatch({ type: "erase-ask" });
    expect(c.dispatch({ type: "erase-confirm" }).status).toEqual({ kind: "nothing" });
  });
});
