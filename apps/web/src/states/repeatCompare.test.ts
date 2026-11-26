import { describe, expect, it } from "vitest";
import { REPEAT_FIELDS, compareKey, compareRepeats, fieldValue, stateOf } from "./repeatCompare";
import { place } from "./placeFixtures";

const base = (id: string, over: Record<string, unknown> = {}) => place(id, { name: "Alpha Hall", address: "5 Elm Street", category: "cafe", wheelchair: "yes", lat: 43.65, lon: -79.38, wheelchair_description: "Ramp at the side.", ...over });
const row = (c: ReturnType<typeof compareRepeats>, f: (typeof REPEAT_FIELDS)[number]) => c.rows.find((r) => r.field === f)!;

describe("fieldValue", () => {
  const p = base("a");
  it("gives each field as the pack gives it", () => {
    expect(fieldValue(p, "name")).toBe("Alpha Hall");
    expect(fieldValue(p, "address")).toBe("5 Elm Street");
    expect(fieldValue(p, "kind")).toBe("cafe");
    expect(fieldValue(p, "tag")).toBe("yes");
    expect(fieldValue(p, "position")).toBe("43.65000, -79.38000");
    expect(fieldValue(p, "source")).toBe("OpenStreetMap, Geofabrik Ontario extract");
    expect(fieldValue(p, "retrieved")).toBe("2026-11-10");
    expect(fieldValue(p, "note")).toBe("Ramp at the side.");
  });
  it("gives null for a field the pack leaves out, and for an unknown tag", () => {
    const q = base("b", { name: null, address: null, category: null, wheelchair: null, lat: null, lon: null, provenance: null, wheelchair_description: null });
    for (const f of REPEAT_FIELDS) expect(fieldValue(q, f), f).toBeNull();
  });
});

describe("compareKey", () => {
  it("treats names alike after folding", () => {
    expect(compareKey(base("a", { name: "Café Étoile" }), "name")).toBe(compareKey(base("b", { name: "Le cafe etoile" }), "name"));
  });
  it("treats a short and a full street type as one address", () => {
    expect(compareKey(base("a", { address: "5 Elm St" }), "address")).toBe(compareKey(base("b", { address: "5 elm street" }), "address"));
    expect(compareKey(base("a", { address: "5 Elm St" }), "address")).not.toBe(compareKey(base("b", { address: "7 Elm St" }), "address"));
  });
  it("falls back to the folded text for an address with no number", () => {
    expect(compareKey(base("a", { address: "Elm Street" }), "address")).toBe("elm street");
  });
  it("ignores case and accents in kinds and notes", () => {
    expect(compareKey(base("a", { category: "Café" }), "kind")).toBe("cafe");
    expect(compareKey(base("a", { wheelchair_description: "Ramp  AT the side!" }), "note")).toBe("ramp at the side");
  });
  it("treats positions within a metre as one", () => {
    expect(compareKey(base("a"), "position")).toBe(compareKey(base("b", { lat: 43.650001 }), "position"));
    expect(compareKey(base("a"), "position")).not.toBe(compareKey(base("b", { lat: 43.651 }), "position"));
  });
  it("compares tags, sources and dates exactly", () => {
    expect(compareKey(base("a"), "tag")).toBe("yes");
    expect(compareKey(base("a"), "retrieved")).toBe("2026-11-10");
  });
  it("is null when there is nothing to compare, including a name of only symbols", () => {
    expect(compareKey(base("a", { name: "—!" }), "name")).toBeNull();
    expect(compareKey(base("a", { name: null }), "name")).toBeNull();
  });
});

describe("stateOf", () => {
  it.each([
    [["a", "a"], "same"], [["a", "b"], "differs"], [["a", null], "partial"], [[null, null], "none"], [["a", "a", null], "partial"], [["a", "b", null], "differs"], [[], "none"], [["a"], "same"],
  ])("%j is %s", (keys, state) => {
    expect(stateOf(keys as (string | null)[])).toBe(state);
  });
});

describe("compareRepeats", () => {
  it("has one row per field in table order, and one value per member in the group's order", () => {
    const c = compareRepeats(["b", "a"], [base("a"), base("b")]);
    expect(c.rows.map((r) => r.field)).toEqual([...REPEAT_FIELDS]);
    expect(c.ids).toEqual(["b", "a"]);
    for (const r of c.rows) expect(r.values).toHaveLength(2);
  });
  it("calls identical records the same on every field", () => {
    const c = compareRepeats(["a", "b"], [base("a"), base("b")]);
    expect(c.rows.every((r) => r.state === "same")).toBe(true);
    expect(c.differing).toEqual([]);
    expect(c.spreadMetres).toBe(0);
  });
  it("marks the fields that differ and lists them", () => {
    const c = compareRepeats(["a", "b"], [base("a"), base("b", { wheelchair: "no", category: "bar", address: "7 Elm Street" })]);
    expect(c.differing).toEqual(["address", "kind", "tag"]);
    expect(row(c, "tag").values).toEqual(["yes", "no"]);
    expect(row(c, "name").state).toBe("same");
  });
  it("shows values as the pack gives them even when they count as the same", () => {
    const c = compareRepeats(["a", "b"], [base("a", { address: "5 Elm St" }), base("b", { address: "5 elm street" })]);
    expect(row(c, "address").state).toBe("same");
    expect(row(c, "address").values).toEqual(["5 Elm St", "5 elm street"]);
  });
  it("marks a field one record lacks as partial and shows the gap as null", () => {
    const c = compareRepeats(["a", "b"], [base("a"), base("b", { wheelchair_description: null, wheelchair: null })]);
    expect(row(c, "note")).toMatchObject({ state: "partial", values: ["Ramp at the side.", null] });
    expect(row(c, "tag").state).toBe("partial");
    expect(c.differing).toEqual([]);
  });
  it("marks a field no record gives as none", () => {
    const c = compareRepeats(["a", "b"], [base("a", { wheelchair_description: null }), base("b", { wheelchair_description: null })]);
    expect(row(c, "note").state).toBe("none");
  });
  it("measures the greatest distance between members with a position", () => {
    const c = compareRepeats(["a", "b", "c"], [base("a"), base("b", { lat: 43.6505 }), base("c", { lat: null, lon: null })]);
    expect(c.spreadMetres).toBeGreaterThan(40);
    expect(c.spreadMetres).toBeLessThan(70);
  });
  it("has no spread with fewer than two positions", () => {
    expect(compareRepeats(["a", "b"], [base("a"), base("b", { lat: null, lon: null })]).spreadMetres).toBeNull();
  });
  it("leaves out an id the list does not hold", () => {
    const c = compareRepeats(["a", "gone", "b"], [base("a"), base("b")]);
    expect(c.ids).toEqual(["a", "b"]);
    expect(row(c, "name").values).toHaveLength(2);
  });
  it("handles three members, one different", () => {
    const c = compareRepeats(["a", "b", "c"], [base("a"), base("b"), base("c", { name: "Zed Pharmacy" })]);
    expect(row(c, "name").state).toBe("differs");
    expect(row(c, "name").values).toEqual(["Alpha Hall", "Alpha Hall", "Zed Pharmacy"]);
  });
  it("does not choose between values or change the records", () => {
    const a = base("a");
    const b = base("b", { wheelchair: "no" });
    const copy = [JSON.stringify(a), JSON.stringify(b)];
    compareRepeats(["a", "b"], [a, b]);
    expect([JSON.stringify(a), JSON.stringify(b)]).toEqual(copy);
  });
  it("gives an empty table for no members", () => {
    const c = compareRepeats([], []);
    expect(c.ids).toEqual([]);
    expect(c.rows.every((r) => r.state === "none")).toBe(true);
    expect(c.spreadMetres).toBeNull();
  });
});
