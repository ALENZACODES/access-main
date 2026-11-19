import { describe, expect, it } from "vitest";
import {
  MAX_SHORTLIST,
  SHORTLIST_KEY,
  addToShortlist,
  isShortlistId,
  isShortlisted,
  loadShortlist,
  parseShortlist,
  removeFromShortlist,
  resolveShortlist,
  saveShortlist,
  serializeShortlist,
  type ShortlistEntry,
} from "./shortlist";
import { parsePackPlaces, type PackPlaceRecord } from "./packPlaces";
import type { KeyValueStore } from "./submissionQueue";

const TODAY = "2026-11-19";
const e = (id: string, addedOn: string | null = TODAY): ShortlistEntry => ({ id, addedOn });
const raw = (id: string) => ({ id, name: `Place ${id}`, wheelchair: "yes", lat: 43.65, lon: -79.38, provenance: { source_name: "Open Data Toronto", licence: "OGL-Ontario-1.0", retrieved_at: "2026-11-10" } });
const places = (...ids: string[]): PackPlaceRecord[] => [...parsePackPlaces(ids.map(raw)).places];

function memoryStore(initial: Record<string, string> = {}): KeyValueStore & { data: Record<string, string> } {
  const data = { ...initial };
  return {
    data,
    getItem: (k) => (k in data ? data[k]! : null),
    setItem: (k, v) => void (data[k] = v),
    removeItem: (k) => void delete data[k],
  };
}

describe("isShortlistId", () => {
  it("accepts ids the pack audit accepts", () => {
    for (const id of ["a", "osm-node-123", "way/45", "É-1", "x".repeat(200)]) expect(isShortlistId(id), id).toBe(true);
  });
  it("rejects empty, long, spaced, control-character and non-string ids", () => {
    for (const id of ["", "x".repeat(201), "a b", "a\tb", "a\u0000b", "\u007f", " a", 5, null, undefined, {}, ["a"]]) expect(isShortlistId(id), String(id)).toBe(false);
  });
});

describe("parseShortlist", () => {
  it("reads the JSON text of a list", () => {
    expect(parseShortlist('[{"id":"a","addedOn":"2026-11-01"},{"id":"b","addedOn":"2026-11-02"}]')).toEqual([e("a", "2026-11-01"), e("b", "2026-11-02")]);
  });
  it("reads an already-parsed list", () => {
    expect(parseShortlist([{ id: "a", addedOn: TODAY }])).toEqual([e("a")]);
  });
  it("reads anything that is not a list as an empty list", () => {
    for (const bad of [null, undefined, 5, true, "", "not json", "{}", '{"id":"a"}', "null", {}, { id: "a" }]) expect(parseShortlist(bad), String(bad)).toEqual([]);
  });
  it("drops entries that are not objects or have a bad id", () => {
    expect(parseShortlist([5, null, "a", ["a"], { id: "" }, { id: "a b" }, { id: 7 }, {}, { id: "ok" }])).toEqual([e("ok", null)]);
  });
  it("keeps an entry whose date is not a valid date, with the date UNKNOWN (null)", () => {
    expect(parseShortlist([{ id: "a", addedOn: "yesterday" }, { id: "b", addedOn: "2026-13-40" }, { id: "c" }, { id: "d", addedOn: 20261119 }])).toEqual([e("a", null), e("b", null), e("c", null), e("d", null)]);
  });
  it("keeps the first of a repeated id", () => {
    expect(parseShortlist([{ id: "a", addedOn: "2026-01-01" }, { id: "a", addedOn: "2026-02-02" }])).toEqual([e("a", "2026-01-01")]);
  });
  it("cuts the list at MAX_SHORTLIST", () => {
    const many = Array.from({ length: MAX_SHORTLIST + 8 }, (_, i) => ({ id: `p${i}`, addedOn: TODAY }));
    const out = parseShortlist(many);
    expect(out).toHaveLength(MAX_SHORTLIST);
    expect(out.at(-1)!.id).toBe(`p${MAX_SHORTLIST - 1}`);
  });
  it("ignores extra fields, so stored code or markup is never carried along", () => {
    const [entry] = parseShortlist([{ id: "a", addedOn: TODAY, name: "<img onerror=x>", script: "alert(1)" }]);
    expect(Object.keys(entry!)).toEqual(["id", "addedOn"]);
  });
  it("does not let a stored key reach an object prototype", () => {
    parseShortlist('[{"id":"a","__proto__":{"polluted":true},"constructor":{"prototype":{"polluted":true}}}]');
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
});

describe("serializeShortlist", () => {
  it("round-trips through parseShortlist", () => {
    const list = [e("a", "2026-11-01"), e("b", null)];
    expect(parseShortlist(serializeShortlist(list))).toEqual(list);
  });
  it("writes only id and date", () => {
    expect(serializeShortlist([{ id: "a", addedOn: TODAY, extra: 1 } as ShortlistEntry])).toBe('[{"id":"a","addedOn":"2026-11-19"}]');
  });
  it("writes an empty list as []", () => {
    expect(serializeShortlist([])).toBe("[]");
  });
});

describe("addToShortlist", () => {
  it("adds at the end with today's date", () => {
    const r = addToShortlist([e("a")], "b", "2026-11-20");
    expect(r.result).toBe("added");
    expect(r.list).toEqual([e("a"), e("b", "2026-11-20")]);
  });
  it("does not add an id that is already there, and returns the same list", () => {
    const list = [e("a")];
    const r = addToShortlist(list, "a", TODAY);
    expect(r).toEqual({ list, result: "already" });
    expect(r.list).toBe(list);
  });
  it("does not add an invalid id", () => {
    const list = [e("a")];
    for (const id of ["", "a b", "x".repeat(201)]) expect(addToShortlist(list, id, TODAY)).toEqual({ list, result: "invalid" });
  });
  it("stops at MAX_SHORTLIST and says the list is full", () => {
    const list = Array.from({ length: MAX_SHORTLIST }, (_, i) => e(`p${i}`));
    expect(addToShortlist(list, "extra", TODAY)).toEqual({ list, result: "full" });
    expect(addToShortlist(list.slice(1), "extra", TODAY).result).toBe("added");
  });
  it("stores an unusable date as null instead of today's text", () => {
    expect(addToShortlist([], "a", "soon").list).toEqual([e("a", null)]);
  });
  it("does not change the list it is given", () => {
    const list = [e("a")];
    addToShortlist(list, "b", TODAY);
    expect(list).toEqual([e("a")]);
  });
});

describe("removeFromShortlist and isShortlisted", () => {
  it("removes one id and keeps the order of the rest", () => {
    expect(removeFromShortlist([e("a"), e("b"), e("c")], "b")).toEqual([e("a"), e("c")]);
  });
  it("returns the same list when the id is not there", () => {
    const list = [e("a")];
    expect(removeFromShortlist(list, "z")).toBe(list);
  });
  it("tells whether an id is on the list, by exact id", () => {
    const list = [e("abc")];
    expect(isShortlisted(list, "abc")).toBe(true);
    expect(isShortlisted(list, "ABC")).toBe(false);
    expect(isShortlisted(list, "ab")).toBe(false);
  });
});

describe("resolveShortlist", () => {
  it("pairs each listed id with its place in the order they were added", () => {
    const r = resolveShortlist([e("c"), e("a")], places("a", "b", "c"));
    expect(r.found.map((x) => x.place.id)).toEqual(["c", "a"]);
    expect(r.found[0]!.entry).toEqual(e("c"));
    expect(r.missing).toEqual([]);
  });
  it("reports ids the pack no longer holds as missing, with nothing else known", () => {
    const r = resolveShortlist([e("a"), e("gone")], places("a"));
    expect(r.found.map((x) => x.place.id)).toEqual(["a"]);
    expect(r.missing).toEqual([e("gone")]);
  });
  it("is empty for an empty list or an empty pack", () => {
    expect(resolveShortlist([], places("a"))).toEqual({ found: [], missing: [] });
    expect(resolveShortlist([e("a")], [])).toEqual({ found: [], missing: [e("a")] });
  });
  it("uses the place as it is now, not a stored copy", () => {
    const [before] = places("a");
    const after = { ...before!, name: "Renamed" };
    expect(resolveShortlist([e("a")], [after]).found[0]!.place.name).toBe("Renamed");
  });
});

describe("loadShortlist and saveShortlist", () => {
  it("loads what was saved", () => {
    const store = memoryStore();
    expect(saveShortlist(store, [e("a"), e("b")])).toBe(true);
    expect(loadShortlist(store)).toEqual({ list: [e("a"), e("b")], ok: true });
  });
  it("saves under the shortlist key and removes the key for an empty list", () => {
    const store = memoryStore();
    saveShortlist(store, [e("a")]);
    expect(Object.keys(store.data)).toEqual([SHORTLIST_KEY]);
    saveShortlist(store, []);
    expect(store.data).toEqual({});
  });
  it("reads a damaged value as an empty list that could still be read", () => {
    expect(loadShortlist(memoryStore({ [SHORTLIST_KEY]: "{{{" }))).toEqual({ list: [], ok: true });
  });
  it("says it could not read when there is no store or the store throws", () => {
    expect(loadShortlist(null)).toEqual({ list: [], ok: false });
    const throwing: KeyValueStore = { getItem: () => { throw new Error("denied"); }, setItem: () => undefined, removeItem: () => undefined };
    expect(loadShortlist(throwing)).toEqual({ list: [], ok: false });
  });
  it("says it could not save when there is no store or the store refuses", () => {
    expect(saveShortlist(null, [e("a")])).toBe(false);
    const full: KeyValueStore = { getItem: () => null, setItem: () => { throw new Error("quota"); }, removeItem: () => { throw new Error("quota"); } };
    expect(saveShortlist(full, [e("a")])).toBe(false);
    expect(saveShortlist(full, [])).toBe(false);
  });
});
