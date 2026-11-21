import { describe, expect, it } from "vitest";
import { exportLocalData } from "./localData";
import { MAX_IMPORT_BYTES, MAX_IMPORT_ITEMS, MAX_IMPORT_VALUE_BYTES, applyImport, prepareImport, type ImportOutcome } from "./importData";
import { createMemoryStorage, type StorageLike } from "./storage";

const P = "app.";
const file = (items: Record<string, unknown>, over: Record<string, unknown> = {}): string =>
  JSON.stringify({ format: "app-local-data", version: 1, exportedAt: "2026-11-15T00:00:00Z", prefix: P, items, ...over });
const problem = (o: ImportOutcome): string => (o.ok ? "ok" : o.code);

describe("prepareImport", () => {
  it("accepts a file the App itself made, and sorts additions, replacements and matches", () => {
    const from = createMemoryStorage({ "app.a": "1", "app.b": "2", "app.c": "3", "other.x": "no" });
    const exported = exportLocalData(from, P, new Date(2026, 10, 15), "en").text;
    const into = createMemoryStorage({ "app.b": "different", "app.c": "3" });
    const r = prepareImport(exported, into, P);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.plan.additions).toEqual(["app.a"]);
    expect(r.plan.overwrites).toEqual(["app.b"]);
    expect(r.plan.unchanged).toEqual(["app.c"]);
    expect(Object.keys(r.plan.items).sort()).toEqual(["app.a", "app.b", "app.c"]);
    expect(into.getItem("app.a")).toBeNull();
  });
  it("changes nothing while checking", () => {
    const s = createMemoryStorage({ "app.b": "keep" });
    prepareImport(file({ "app.b": "new", "app.a": "x" }), s, P);
    expect(s.getItem("app.b")).toBe("keep");
    expect(s.getItem("app.a")).toBeNull();
  });
  it.each([
    ["not json", "{oops", "not-json"],
    ["a list", "[]", "wrong-format"],
    ["null", "null", "wrong-format"],
    ["another format", file({ "app.a": "1" }, { format: "something-else" }), "wrong-format"],
    ["another version", file({ "app.a": "1" }, { version: 2 }), "wrong-version"],
    ["a version as text", file({ "app.a": "1" }, { version: "1" }), "wrong-version"],
    ["another prefix", file({ "app.a": "1" }, { prefix: "other." }), "wrong-prefix"],
    ["items as a list", file({}, { items: ["a"] }), "bad-items"],
    ["no items key", JSON.stringify({ format: "app-local-data", version: 1, prefix: P }), "bad-items"],
    ["a number value", file({ "app.a": 5 }), "bad-items"],
    ["a null value", file({ "app.a": null }), "bad-items"],
    ["an empty set", file({}), "nothing-to-restore"],
  ])("refuses %s", (_n, text, code) => {
    expect(problem(prepareImport(text, createMemoryStorage(), P))).toBe(code);
  });
  it.each([
    ["a key outside the prefix", "other.a"],
    ["the bare prefix", "app."],
    ["a space", "app.a b"],
    ["a slash", "app.a/b"],
    ["a quote", 'app."x'],
    ["an accented letter", "app.é"],
    ["a prototype name", "app.__proto__"],
    ["constructor", "app.constructor"],
    ["prototype", "app.prototype"],
  ])("refuses %s", (_n, key) => {
    const text = `{"format":"app-local-data","version":1,"prefix":"${P}","items":{${JSON.stringify(key)}:"x"}}`;
    expect(problem(prepareImport(text, createMemoryStorage(), P))).toBe("bad-key");
  });
  it("does not let a __proto__ key reach the plan's prototype", () => {
    const text = `{"format":"app-local-data","version":1,"prefix":"${P}","items":{"app.a":"1"}}`;
    const r = prepareImport(text, createMemoryStorage(), P);
    expect(r.ok && Object.getPrototypeOf(r.plan.items)).toBe(Object.prototype);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
  it("enforces the size limits", () => {
    expect(problem(prepareImport("x".repeat(MAX_IMPORT_BYTES + 1), null, P))).toBe("too-large");
    const many: Record<string, string> = {};
    for (let i = 0; i <= MAX_IMPORT_ITEMS; i += 1) many[`app.k${i}`] = "x";
    expect(problem(prepareImport(file(many), null, P))).toBe("too-many-items");
    expect(problem(prepareImport(file({ "app.big": "x".repeat(MAX_IMPORT_VALUE_BYTES + 1) }), null, P))).toBe("value-too-large");
    expect(problem(prepareImport(file({ "app.ok": "x".repeat(MAX_IMPORT_VALUE_BYTES) }), null, P))).toBe("ok");
  });
  it("counts bytes, not characters", () => {
    const r = prepareImport(file({ "app.a": "é".repeat(10) }), null, P);
    expect(r.ok && r.plan.bytes).toBe(20);
  });
  it("treats every item as new when storage is unavailable", () => {
    const r = prepareImport(file({ "app.a": "1" }), null, P);
    expect(r.ok && r.plan.additions).toEqual(["app.a"]);
  });
});

function plan(items: Record<string, string>, storage: StorageLike): Extract<ImportOutcome, { ok: true }>["plan"] {
  const r = prepareImport(file(items), storage, P);
  if (!r.ok) throw new Error(r.code);
  return r.plan;
}

describe("applyImport", () => {
  it("writes additions and replacements", () => {
    const s = createMemoryStorage({ "app.b": "old", "app.c": "same" });
    const r = applyImport(s, plan({ "app.a": "1", "app.b": "new", "app.c": "same" }, s));
    expect(r).toEqual({ written: 2, failed: [], rolledBack: false, restoreFailed: [] });
    expect(s.getItem("app.a")).toBe("1");
    expect(s.getItem("app.b")).toBe("new");
    expect(s.getItem("app.c")).toBe("same");
  });
  it("puts everything back if a write fails part way", () => {
    const s = createMemoryStorage({ "app.b": "old" });
    const p = plan({ "app.a": "1", "app.b": "new", "app.z": "3" }, s);
    const real = s.setItem.bind(s);
    s.setItem = (k, v) => {
      if (k === "app.z") throw new Error("quota");
      real(k, v);
    };
    const r = applyImport(s, p);
    expect(r).toEqual({ written: 0, failed: ["app.z"], rolledBack: true, restoreFailed: [] });
    expect(s.getItem("app.a")).toBeNull();
    expect(s.getItem("app.b")).toBe("old");
    expect(s.getItem("app.z")).toBeNull();
  });
  it("says so when something could not be put back", () => {
    const s = createMemoryStorage({ "app.z": "old" });
    const p = plan({ "app.a": "1", "app.z": "3" }, s);
    const real = s.setItem.bind(s);
    s.setItem = (k, v) => {
      if (k === "app.z") throw new Error("quota");
      real(k, v);
    };
    s.removeItem = () => {
      throw new Error("locked");
    };
    const r = applyImport(s, p);
    expect(r.failed).toEqual(["app.z"]);
    expect(r.rolledBack).toBe(false);
    expect(r.restoreFailed).toEqual(["app.a"]);
  });
  it("writes nothing for an empty plan of unchanged items", () => {
    const s = createMemoryStorage({ "app.a": "1" });
    expect(applyImport(s, plan({ "app.a": "1" }, s)).written).toBe(0);
  });
});
