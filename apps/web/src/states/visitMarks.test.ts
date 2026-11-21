import { describe, expect, it } from "vitest";
import { bare, place } from "./placeFixtures";
import {
  MAX_VISIT_MARKS, VISIT_MARKS_KEY, VISIT_STATUSES, clearVisitMark, isVisitStatus, keepMarksFor, loadVisitMarks, markFor, marksForPlaces, parseVisitMarks,
  saveVisitMarks, serializeVisitMarks, setVisitMark, summariseMarks, type VisitMark,
} from "./visitMarks";
import type { KeyValueStore } from "./submissionQueue";

const TODAY = "2026-11-21";
const m = (id: string, status: VisitMark["status"] = "to-visit", markedOn: string | null = "2026-11-01"): VisitMark => ({ id, status, markedOn });
function memory(initial: Record<string, string> = {}): KeyValueStore & { data: Record<string, string> } {
  const data = { ...initial };
  return { data, getItem: (k) => (k in data ? data[k]! : null), setItem: (k, v) => { data[k] = v; }, removeItem: (k) => { delete data[k]; } };
}

describe("isVisitStatus", () => {
  it("knows the three statuses and nothing else", () => {
    for (const s of VISIT_STATUSES) expect(isVisitStatus(s)).toBe(true);
    for (const s of ["", "none", "visited", "TO-VISIT", null, 1, {}, ["been"]]) expect(isVisitStatus(s), String(s)).toBe(false);
  });
  it("lists them in the order they are shown", () => {
    expect([...VISIT_STATUSES]).toEqual(["to-visit", "been", "ruled-out"]);
  });
});

describe("parseVisitMarks", () => {
  it("reads good entries from JSON text or a parsed value", () => {
    const value = [{ id: "a", status: "been", markedOn: "2026-11-01" }];
    expect(parseVisitMarks(JSON.stringify(value))).toEqual(value);
    expect(parseVisitMarks(value)).toEqual(value);
  });
  it("gives nothing for text that is not JSON or is not a list", () => {
    for (const v of ["{{{", "", "null", "{}", "5", null, undefined, 5, {}, "x"]) expect(parseVisitMarks(v), String(v)).toEqual([]);
  });
  it("drops entries with no usable id", () => {
    for (const id of [undefined, null, "", "has space", "tab\t", "a\u0000b", 5, {}, "x".repeat(201)]) {
      expect(parseVisitMarks([{ id, status: "been" }]), String(id)).toEqual([]);
    }
  });
  it("drops entries with an unknown or missing status", () => {
    for (const status of [undefined, null, "", "visited", "BEEN", 1, {}]) expect(parseVisitMarks([{ id: "a", status }]), String(status)).toEqual([]);
  });
  it("drops entries that are not objects", () => {
    expect(parseVisitMarks([null, 3, "a", [], [{ id: "a", status: "been" }], { id: "z", status: "been" }])).toEqual([{ id: "z", status: "been", markedOn: null }]);
  });
  it("keeps a repeated id once, with its first status", () => {
    expect(parseVisitMarks([{ id: "a", status: "been" }, { id: "a", status: "ruled-out" }])).toEqual([{ id: "a", status: "been", markedOn: null }]);
  });
  it("keeps a real day and turns anything else into null", () => {
    const day = (markedOn: unknown) => parseVisitMarks([{ id: "a", status: "been", markedOn }])[0]?.markedOn;
    expect(day("2026-11-01")).toBe("2026-11-01");
    for (const bad of ["2026-02-30", "yesterday", "2026-11-01T00:00:00Z", 5, null, undefined]) expect(day(bad), String(bad)).toBeNull();
  });
  it("cuts the list at the limit", () => {
    const many = Array.from({ length: MAX_VISIT_MARKS + 25 }, (_, i) => ({ id: `p${i}`, status: "been" }));
    const out = parseVisitMarks(many);
    expect(out).toHaveLength(MAX_VISIT_MARKS);
    expect(out[0]?.id).toBe("p0");
  });
  it("reads own keys only", () => {
    const proto = { id: "inherited", status: "been" };
    const entry = Object.create(proto) as Record<string, unknown>;
    expect(parseVisitMarks([entry])).toEqual([]);
    const half = Object.create({ status: "been" }) as Record<string, unknown>;
    half.id = "own";
    expect(parseVisitMarks([half])).toEqual([]);
  });
  it("ignores extra keys and does not carry them on", () => {
    const [x] = parseVisitMarks([{ id: "a", status: "been", note: "secret", __proto__: { polluted: true } }]);
    expect(Object.keys(x!).sort()).toEqual(["id", "markedOn", "status"]);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
});

describe("serializeVisitMarks", () => {
  it("round-trips and writes only the three fields", () => {
    const marks = [m("a"), m("b", "ruled-out", null)];
    expect(parseVisitMarks(serializeVisitMarks(marks))).toEqual(marks);
    expect(Object.keys(JSON.parse(serializeVisitMarks(marks))[0]).sort()).toEqual(["id", "markedOn", "status"]);
  });
});

describe("setVisitMark", () => {
  it("adds a mark with today's day", () => {
    expect(setVisitMark([], "a", "to-visit", TODAY)).toEqual({ marks: [{ id: "a", status: "to-visit", markedOn: TODAY }], result: "set" });
  });
  it("replaces the status and takes the new day, keeping the place of the entry", () => {
    const out = setVisitMark([m("a"), m("b")], "a", "been", TODAY);
    expect(out.result).toBe("set");
    expect(out.marks).toEqual([{ id: "a", status: "been", markedOn: TODAY }, m("b")]);
  });
  it("changes nothing when the status is the same and keeps the first day", () => {
    const marks = [m("a", "been", "2026-10-01")];
    const out = setVisitMark(marks, "a", "been", TODAY);
    expect(out.result).toBe("same");
    expect(out.marks).toBe(marks);
  });
  it("refuses an unusable id or status", () => {
    const marks = [m("a")];
    expect(setVisitMark(marks, "bad id", "been", TODAY)).toEqual({ marks, result: "invalid" });
    expect(setVisitMark(marks, "b", "nope" as never, TODAY)).toEqual({ marks, result: "invalid" });
  });
  it("refuses a new place when full but still lets an existing one change", () => {
    const full = Array.from({ length: MAX_VISIT_MARKS }, (_, i) => m(`p${i}`));
    expect(setVisitMark(full, "extra", "been", TODAY).result).toBe("full");
    expect(setVisitMark(full, "p3", "been", TODAY).result).toBe("set");
  });
  it("keeps no day when today is not a real day", () => {
    expect(setVisitMark([], "a", "been", "later").marks[0]?.markedOn).toBeNull();
  });
  it("does not change the list it is given", () => {
    const marks = [m("a")];
    const copy = JSON.stringify(marks);
    setVisitMark(marks, "a", "ruled-out", TODAY);
    setVisitMark(marks, "b", "been", TODAY);
    expect(JSON.stringify(marks)).toBe(copy);
  });
});

describe("clearVisitMark and keepMarksFor", () => {
  it("removes one mark and returns the same list when there is none to remove", () => {
    const marks = [m("a"), m("b")];
    expect(clearVisitMark(marks, "a")).toEqual([m("b")]);
    expect(clearVisitMark(marks, "zzz")).toBe(marks);
  });
  it("keeps only the marks for the ids given", () => {
    const marks = [m("a"), m("b"), m("c")];
    expect(keepMarksFor(marks, new Set(["a", "c"]))).toEqual([m("a"), m("c")]);
    expect(keepMarksFor(marks, new Set(["a", "b", "c", "d"]))).toBe(marks);
    expect(keepMarksFor(marks, new Set())).toEqual([]);
  });
  it("finds a mark by id", () => {
    expect(markFor([m("a")], "a")?.status).toBe("to-visit");
    expect(markFor([m("a")], "b")).toBeNull();
  });
});

describe("summariseMarks", () => {
  it("counts listed places by status, those with no mark, and marks elsewhere", () => {
    const marks = [m("a", "to-visit"), m("b", "been"), m("c", "been"), m("gone", "ruled-out")];
    expect(summariseMarks(marks, ["a", "b", "c", "d", "e"])).toEqual({ counts: { "to-visit": 1, been: 2, "ruled-out": 0 }, unmarked: 2, elsewhere: 1 });
  });
  it("counts nothing for nothing", () => {
    expect(summariseMarks([], [])).toEqual({ counts: { "to-visit": 0, been: 0, "ruled-out": 0 }, unmarked: 0, elsewhere: 0 });
  });
  it("counts a repeated listed id once", () => {
    expect(summariseMarks([m("a")], ["a", "a"]).unmarked).toBe(0);
  });
});

describe("marksForPlaces", () => {
  it("pairs each place with its mark in the order the places were given", () => {
    const places = [place("b"), place("a"), bare("c")];
    const rows = marksForPlaces([m("a", "been")], places);
    expect(rows.map((r) => r.place.id)).toEqual(["b", "a", "c"]);
    expect(rows.map((r) => r.mark?.status ?? null)).toEqual([null, "been", null]);
  });
});

describe("loadVisitMarks and saveVisitMarks", () => {
  it("reads nothing from no store and says it could not read", () => {
    expect(loadVisitMarks(null)).toEqual({ marks: [], ok: false });
    expect(saveVisitMarks(null, [m("a")])).toBe(false);
  });
  it("saves and loads again", () => {
    const store = memory();
    expect(saveVisitMarks(store, [m("a")])).toBe(true);
    expect(loadVisitMarks(store)).toEqual({ marks: [m("a")], ok: true });
    expect(Object.keys(store.data)).toEqual([VISIT_MARKS_KEY]);
  });
  it("removes the key for an empty list", () => {
    const store = memory({ [VISIT_MARKS_KEY]: "[]" });
    expect(saveVisitMarks(store, [])).toBe(true);
    expect(VISIT_MARKS_KEY in store.data).toBe(false);
  });
  it("reads damaged storage as empty but readable", () => {
    expect(loadVisitMarks(memory({ [VISIT_MARKS_KEY]: "{{{" }))).toEqual({ marks: [], ok: true });
  });
  it("says so when the store throws", () => {
    const bad: KeyValueStore = { getItem: () => { throw new Error("no"); }, setItem: () => { throw new Error("no"); }, removeItem: () => { throw new Error("no"); } };
    expect(loadVisitMarks(bad)).toEqual({ marks: [], ok: false });
    expect(saveVisitMarks(bad, [m("a")])).toBe(false);
    expect(saveVisitMarks(bad, [])).toBe(false);
  });
  it("uses a key of its own, not the shortlist's", () => {
    expect(VISIT_MARKS_KEY).not.toBe("app.pack-shortlist.v1");
  });
});
