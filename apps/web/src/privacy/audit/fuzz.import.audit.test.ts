// Robustness audit for "Download my data", "Restore" and "Erase": any file can be offered to Restore, and any storage
// can fail part way. Checked: nothing outside the data scope is ever read into a plan, written or removed; a file is
// accepted or refused whole; a failed write puts everything back; and what is downloaded can be restored exactly.

import { describe, expect, it } from "vitest";
import { inScope, type DataScope } from "../panel/dataScope";
import { IMPORT_PROBLEM_CODES, MAX_IMPORT_BYTES, MAX_IMPORT_ITEMS, MAX_IMPORT_VALUE_BYTES, applyImport, prepareImport, type ImportOutcome } from "../panel/importData";
import { eraseLocalData, exportLocalData } from "../panel/localData";
import { createMemoryStorage } from "../panel/storage";
import { createFaultyStorage, outsideTouches } from "./fuzz/faultyStorage";
import { genDeep, genJson, genKeyName, genString, mutateJson, mutateText, setOwn, writeJson } from "./fuzz/gen";
import { assertProperty, shrinkJson, shrinkString } from "./fuzz/property";
import type { Rng } from "./fuzz/rng";

const PREFIX = "app.";
const SCOPE: DataScope = { prefix: PREFIX, keys: ["app-prefs.v1", "site.language"] };
const NOW = new Date(2026, 10, 20, 9, 0, 0);
const enc = new TextEncoder();
const KEY_RE = /^[A-Za-z0-9._:-]+$/;

function genItems(rng: Rng, max = 8): Record<string, string> {
  const items: Record<string, string> = {};
  for (let i = 0; i < rng.int(0, max); i += 1) {
    const key = rng.bool(0.15) ? rng.pick(SCOPE.keys) : `${PREFIX}${genKeyName(rng, 10)}`;
    items[key] = genString(rng, 40);
  }
  return items;
}

function exportOf(items: Record<string, unknown>, over: Record<string, unknown> = {}): string {
  return JSON.stringify({ format: "app-local-data", version: 1, exportedAt: NOW.toISOString(), prefix: PREFIX, items, ...over });
}

function assertPlanSound(o: ImportOutcome): void {
  if (!o.ok) {
    expect(IMPORT_PROBLEM_CODES).toContain(o.code);
    return;
  }
  const keys = Object.keys(o.plan.items);
  expect(keys.length).toBeGreaterThan(0);
  expect(keys.length).toBeLessThanOrEqual(MAX_IMPORT_ITEMS);
  let bytes = 0;
  for (const k of keys) {
    expect(inScope(SCOPE, k), `${k} is outside the scope`).toBe(true);
    expect(KEY_RE.test(k), `${k} has a character a key may not have`).toBe(true);
    expect(k === PREFIX || k === "__proto__").toBe(false);
    const v = o.plan.items[k] as string;
    expect(typeof v).toBe("string");
    expect(enc.encode(v).length).toBeLessThanOrEqual(MAX_IMPORT_VALUE_BYTES);
    bytes += enc.encode(v).length;
  }
  expect(o.plan.bytes).toBe(bytes);
  const parts = [...o.plan.additions, ...o.plan.overwrites, ...o.plan.unchanged];
  expect([...parts].sort()).toEqual([...keys].sort());
  expect(new Set(parts).size).toBe(parts.length);
  for (const list of [o.plan.additions, o.plan.overwrites, o.plan.unchanged]) expect(list).toEqual([...list].sort());
}

describe("checking a file before anything is written", () => {
  it("never throws, never touches storage, and gives a sound plan or a named problem, for any text", () => {
    assertProperty<string>({
      name: "prepareImport on any text",
      runs: 700,
      gen: (rng) => {
        const roll = rng.int(0, 4);
        if (roll === 0) return genString(rng, 80);
        if (roll === 1) return writeJson(rng, genJson(rng, 4));
        if (roll === 2) return mutateText(rng, exportOf(genItems(rng)));
        if (roll === 3) return writeJson(rng, mutateJson(rng, JSON.parse(exportOf(genItems(rng))) as unknown));
        return mutateText(rng, mutateText(rng, exportOf(genItems(rng))));
      },
      prop: (text) => {
        const s = createFaultyStorage({ [`${PREFIX}a`]: "1" });
        assertPlanSound(prepareImport(text, s, SCOPE));
        expect(s.touched()).toEqual([]);
      },
      shrink: shrinkString,
      show: (t) => JSON.stringify(t.length > 300 ? `${t.slice(0, 300)}…` : t),
    });
  });

  it("works with no storage and with storage that will not be read", () => {
    const text = exportOf({ [`${PREFIX}a`]: "1" });
    for (const s of [null, createFaultyStorage({ [`${PREFIX}a`]: "1" }, { failReadWhen: () => true })]) {
      const o = prepareImport(text, s, SCOPE);
      expect(o.ok).toBe(true);
      if (o.ok) expect(o.plan.additions).toEqual([`${PREFIX}a`]);
    }
  });

  it("refuses the whole file for one key outside the scope, however the other keys look", () => {
    assertProperty<{ items: Record<string, string>; outside: string }>({
      name: "one outside key refuses the file",
      runs: 300,
      gen: (rng) => ({ items: genItems(rng), outside: rng.pick(["site.theme", "other.key", "app", "App.a", "", "../x", "app-prefs.v2", `${rng.pick(["x", "y"])}.${genKeyName(rng, 4)}`]) }),
      prop: ({ items, outside }) => {
        const all = { ...items, [outside]: "v" };
        const o = prepareImport(exportOf(all), createMemoryStorage(), SCOPE);
        expect(o.ok).toBe(false);
        if (!o.ok) expect(["bad-key", "wrong-format"]).toContain(o.code);
      },
      show: (v) => JSON.stringify(v),
    });
  });

  it("refuses names that clash with object internals and keys with a character a name may not have", () => {
    for (const k of [`${PREFIX}__proto__`, `${PREFIX}constructor`, `${PREFIX}prototype`, `${PREFIX}a b`, `${PREFIX}a/b`, `${PREFIX}é`, `${PREFIX}`, `${PREFIX}a\u0000`]) {
      const text = `{"format":"app-local-data","version":1,"prefix":"${PREFIX}","items":${JSON.stringify({ [k]: "v" })}}`;
      const o = prepareImport(text, createMemoryStorage(), SCOPE);
      expect(o, k).toEqual({ ok: false, code: "bad-key", detail: k });
    }
  });

  it("refuses an item that is not text, whatever it is", () => {
    for (const v of [1, null, true, [], {}, ["a"]]) {
      const o = prepareImport(exportOf({ [`${PREFIX}a`]: v }), createMemoryStorage(), SCOPE);
      expect(o).toEqual({ ok: false, code: "bad-items", detail: `${PREFIX}a` });
    }
  });

  it("refuses a wrong format, version or prefix before it looks at any item", () => {
    const items = { [`${PREFIX}a`]: "1" };
    expect(prepareImport(exportOf(items, { format: "other" }), null, SCOPE)).toEqual({ ok: false, code: "wrong-format" });
    for (const version of [2, "1", null, 1.5, 0]) expect(prepareImport(exportOf(items, { version }), null, SCOPE)).toEqual({ ok: false, code: "wrong-version" });
    expect(prepareImport(exportOf(items, { prefix: "other." }), null, SCOPE)).toEqual({ ok: false, code: "wrong-prefix" });
    for (const v of ["null", "[]", "5", '"x"', "true"]) expect(prepareImport(v, null, SCOPE)).toEqual({ ok: false, code: "wrong-format" });
  });

  it("holds to its size limits exactly", () => {
    const tooMany = Object.fromEntries(Array.from({ length: MAX_IMPORT_ITEMS + 1 }, (_, i) => [`${PREFIX}k${i}`, "v"]));
    expect(prepareImport(exportOf(tooMany), null, SCOPE)).toEqual({ ok: false, code: "too-many-items" });
    const atLimit = Object.fromEntries(Array.from({ length: MAX_IMPORT_ITEMS }, (_, i) => [`${PREFIX}k${i}`, "v"]));
    expect(prepareImport(exportOf(atLimit), null, SCOPE).ok).toBe(true);
    expect(prepareImport(exportOf({ [`${PREFIX}a`]: "x".repeat(MAX_IMPORT_VALUE_BYTES + 1) }), null, SCOPE)).toEqual({ ok: false, code: "value-too-large", detail: `${PREFIX}a` });
    expect(prepareImport(exportOf({ [`${PREFIX}a`]: "x".repeat(MAX_IMPORT_VALUE_BYTES) }), null, SCOPE).ok).toBe(true);
    expect(prepareImport(" ".repeat(MAX_IMPORT_BYTES + 1), null, SCOPE)).toEqual({ ok: false, code: "too-large" });
    expect(prepareImport(exportOf({}), null, SCOPE)).toEqual({ ok: false, code: "nothing-to-restore" });
  });

  it("measures size in bytes, not characters", () => {
    const o = prepareImport(exportOf({ [`${PREFIX}a`]: "é😀" }), null, SCOPE);
    expect(o.ok && o.plan.bytes).toBe(6);
    const wide = "é".repeat(MAX_IMPORT_VALUE_BYTES / 2 + 1);
    expect(prepareImport(exportOf({ [`${PREFIX}a`]: wide }), null, SCOPE)).toMatchObject({ ok: false, code: "value-too-large" });
  });

  it("reads deeply nested text as text that is not accepted, and does not crash", () => {
    const deep = JSON.stringify(genDeep(2000));
    expect(() => prepareImport(deep, null, SCOPE)).not.toThrow();
    expect(prepareImport(`${"[".repeat(200_000)}`, null, SCOPE)).toEqual({ ok: false, code: "not-json" });
  });

  it("sorts what a file would add, replace and leave, against what is stored now", () => {
    const s = createMemoryStorage({ [`${PREFIX}same`]: "1", [`${PREFIX}diff`]: "old" });
    const o = prepareImport(exportOf({ [`${PREFIX}same`]: "1", [`${PREFIX}diff`]: "new", [`${PREFIX}fresh`]: "x" }), s, SCOPE);
    expect(o.ok && { a: o.plan.additions, o: o.plan.overwrites, u: o.plan.unchanged }).toEqual({ a: [`${PREFIX}fresh`], o: [`${PREFIX}diff`], u: [`${PREFIX}same`] });
  });
});

describe("downloading and restoring", () => {
  it("restores exactly what was downloaded, for any contents", () => {
    assertProperty<Record<string, string>>({
      name: "download then restore is the identity",
      runs: 300,
      gen: (rng) => genItems(rng, 20),
      prop: (items) => {
        const source = createMemoryStorage({ ...items, "site.theme": "dark", "unrelated": "1" });
        const file = exportLocalData(source, SCOPE, NOW, "en");
        const parsed = JSON.parse(file.text) as { items: Record<string, string> };
        expect(Object.keys(parsed.items).sort()).toEqual(Object.keys(items).sort());
        expect(file.count).toBe(Object.keys(items).length);
        const target = createMemoryStorage({ "site.theme": "light" });
        const o = prepareImport(file.text, target, SCOPE);
        if (Object.keys(items).length === 0) {
          expect(o).toEqual({ ok: false, code: "nothing-to-restore" });
          return;
        }
        expect(o.ok).toBe(true);
        if (!o.ok) return;
        const r = applyImport(target, o.plan);
        expect(r).toEqual({ written: o.plan.additions.length + o.plan.overwrites.length, failed: [], rolledBack: false, restoreFailed: [] });
        for (const [k, v] of Object.entries(items)) expect(target.getItem(k)).toBe(v);
        expect(target.getItem("site.theme")).toBe("light");
        expect(target.getItem("unrelated")).toBeNull();
      },
      show: (v) => JSON.stringify(v),
    });
  });

  it("only downloads names in the scope, from storage that holds anything", () => {
    assertProperty<string[]>({
      name: "exportLocalData stays in scope",
      runs: 300,
      gen: (rng) => Array.from({ length: rng.int(0, 15) }, () => (rng.bool(0.5) ? PREFIX : rng.pick(["site.", "x", "", "app", "app-prefs.v1", "site.language"])) + genKeyName(rng, 5)),
      prop: (names) => {
        const s = createFaultyStorage(Object.fromEntries(names.map((n) => [n, "v"])));
        const file = exportLocalData(s, SCOPE, NOW, "fr");
        for (const k of Object.keys((JSON.parse(file.text) as { items: object }).items)) expect(inScope(SCOPE, k), k).toBe(true);
        expect(file.filename).toBe("l-app-donnees-2026-11-20.json");
        expect(s.touched()).toEqual([]);
      },
    });
  });
});

describe("a write that fails part way", () => {
  it("puts back every earlier write, whichever write fails and whatever was stored before", () => {
    assertProperty<{ before: Record<string, string>; items: Record<string, string>; failAt: number }>({
      name: "applyImport rolls back",
      runs: 400,
      gen: (rng) => {
        const items = genItems(rng, 10);
        const keys = Object.keys(items);
        const before: Record<string, string> = {};
        for (const k of keys) if (rng.bool(0.4)) before[k] = genString(rng, 10);
        if (rng.bool()) before[`${PREFIX}untouched`] = "keep";
        return { before, items, failAt: rng.int(1, Math.max(1, keys.length)) };
      },
      prop: ({ before, items, failAt }) => {
        if (Object.keys(items).length === 0) return;
        const s = createFaultyStorage(before);
        const o = prepareImport(exportOf(items), s, SCOPE);
        if (!o.ok) return;
        s.setFaults({ failWriteNumber: Math.min(failAt, o.plan.additions.length + o.plan.overwrites.length) });
        const r = applyImport(s, o.plan);
        if (o.plan.additions.length + o.plan.overwrites.length === 0) return;
        expect(r.failed).toHaveLength(1);
        expect(r.written).toBe(0);
        expect(r.rolledBack).toBe(true);
        expect(r.restoreFailed).toEqual([]);
        expect(s.snapshot()).toEqual(before);
      },
      show: (v) => JSON.stringify(v),
    });
  });

  it("does not claim a rollback when putting a value back also fails, and names the keys it could not restore", () => {
    const s = createFaultyStorage({ [`${PREFIX}a`]: "old-a" });
    const o = prepareImport(exportOf({ [`${PREFIX}a`]: "new-a", [`${PREFIX}b`]: "new-b", [`${PREFIX}c`]: "new-c" }), s, SCOPE);
    if (!o.ok) throw new Error("plan");
    let writes = 0;
    s.setFaults({ failWriteWhen: () => { writes += 1; return writes >= 3; }, failRemoveWhen: (k) => k === `${PREFIX}b` });
    const r = applyImport(s, o.plan);
    expect(r.rolledBack).toBe(false);
    expect(r.restoreFailed).toEqual([`${PREFIX}b`]);
  });

  it("does nothing at all when there is nothing new to write", () => {
    const s = createFaultyStorage({ [`${PREFIX}a`]: "1" });
    const o = prepareImport(exportOf({ [`${PREFIX}a`]: "1" }), s, SCOPE);
    if (!o.ok) throw new Error("plan");
    s.clearOps();
    expect(applyImport(s, o.plan)).toEqual({ written: 0, failed: [], rolledBack: false, restoreFailed: [] });
    expect(s.touched()).toEqual([]);
  });

  it("writes only the names in the plan", () => {
    assertProperty<Record<string, string>>({
      name: "applyImport writes inside the scope",
      runs: 200,
      gen: (rng) => genItems(rng, 10),
      prop: (items) => {
        if (Object.keys(items).length === 0) return;
        const s = createFaultyStorage({ "site.theme": "dark" });
        const o = prepareImport(exportOf(items), s, SCOPE);
        if (!o.ok) return;
        applyImport(s, o.plan);
        expect(outsideTouches(s, (k) => inScope(SCOPE, k))).toEqual([]);
        expect(s.getItem("site.theme")).toBe("dark");
      },
    });
  });
});

describe("erasing", () => {
  it("counts what is gone and names what is not, for any mix of failing and ignored removals", () => {
    assertProperty<{ names: string[]; fail: string[]; drop: string[] }>({
      name: "eraseLocalData reports the truth",
      runs: 400,
      gen: (rng) => {
        const names = Array.from({ length: rng.int(0, 14) }, (_, i) => (rng.bool(0.75) ? `${PREFIX}${genKeyName(rng, 5)}${i}` : rng.pick(["site.theme", `other${i}`, "app-prefs.v1", "site.language"])));
        return { names, fail: names.filter(() => rng.bool(0.2)), drop: names.filter(() => rng.bool(0.2)) };
      },
      prop: ({ names, fail, drop }) => {
        const s = createFaultyStorage(Object.fromEntries(names.map((n) => [n, "v"])), { failRemoveWhen: (k) => fail.includes(k), dropRemoveWhen: (k) => drop.includes(k) });
        const present = Object.keys(s.snapshot());
        const mine = present.filter((k) => inScope(SCOPE, k));
        const r = eraseLocalData(s, SCOPE);
        const left = Object.keys(s.snapshot());
        expect(r.removed + r.failed.length).toBe(mine.length);
        expect(left.filter((k) => inScope(SCOPE, k)).sort()).toEqual([...r.failed].sort());
        expect(left.filter((k) => !inScope(SCOPE, k)).sort()).toEqual(present.filter((k) => !inScope(SCOPE, k)).sort());
        expect(outsideTouches(s, (k) => inScope(SCOPE, k))).toEqual([]);
      },
      show: (v) => JSON.stringify(v),
    });
  });

  it("is a no-op that says nothing was removed for storage with none of the App's names", () => {
    const s = createFaultyStorage({ "site.theme": "dark" });
    expect(eraseLocalData(s, SCOPE)).toEqual({ removed: 0, failed: [] });
    expect(s.touched()).toEqual([]);
  });
});

describe("the helpers used here", () => {
  it("setOwn and shrinkJson keep a __proto__ key as a name through a copy", () => {
    const o: Record<string, unknown> = {};
    setOwn(o, "__proto__", 1);
    setOwn(o, "a", 2);
    const copies = [...shrinkJson(o)].filter((v) => v !== null && typeof v === "object").map((v) => Object.keys(v as object));
    expect(copies).toContainEqual(["__proto__"]);
    expect(copies).toContainEqual(["a"]);
  });
});
