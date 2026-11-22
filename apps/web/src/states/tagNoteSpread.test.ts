import { describe, expect, it } from "vitest";
import { DEFAULT_SPREAD_ORDER, SPREAD_ORDERS, isSpreadOrder, orderSpread, percentOf, spreadByKind, spreadTotals, withDifferences, type SpreadRow } from "./tagNoteSpread";
import { withNote } from "./noteTopicFixtures";
import { lcg, varied } from "./placeFixtures";

const cafe = (id: string, note: string | null, tag: string) => withNote(id, note, { wheelchair: tag, category: "cafe" });
const row = (over: Partial<SpreadRow>): SpreadRow => ({ key: "k", label: "K", checked: 1, flagged: 0, clear: 0, percent: 0, ...over });

describe("percentOf", () => {
  it("rounds to a whole number and never leaves 0 to 100", () => {
    expect(percentOf(1, 3)).toBe(33);
    expect(percentOf(2, 3)).toBe(67);
    expect(percentOf(5, 5)).toBe(100);
    expect(percentOf(9, 5)).toBe(100);
  });
  it("is 0 for no places or no part", () => {
    expect(percentOf(0, 4)).toBe(0);
    expect(percentOf(3, 0)).toBe(0);
    expect(percentOf(-1, 4)).toBe(0);
    expect(Number.isNaN(percentOf(0, 0))).toBe(false);
  });
});

describe("spreadByKind", () => {
  it("counts compared and flagged places per kind", () => {
    const rows = spreadByKind([cafe("a", "Two steps.", "yes"), cafe("b", "Ramp.", "yes"), withNote("c", "Stairs only.", { wheelchair: "yes", category: "library" })]);
    const byKey = Object.fromEntries(rows.map((r) => [r.key, r]));
    expect(byKey["cafe"]).toMatchObject({ checked: 2, flagged: 1, clear: 1, percent: 50 });
    expect(byKey["library"]).toMatchObject({ checked: 1, flagged: 1, percent: 100 });
  });
  it("leaves out places with no note and places whose tag is limited or unknown", () => {
    const rows = spreadByKind([cafe("a", null, "yes"), cafe("b", "Two steps.", "limited"), cafe("c", "Two steps.", "unknown"), cafe("d", "   ", "no")]);
    expect(rows).toEqual([]);
  });
  it("counts a mixed note as flagged but not as clear", () => {
    const [r] = spreadByKind([cafe("a", "Two steps at the front, ramp at the side.", "yes")]);
    expect(r).toMatchObject({ checked: 1, flagged: 1, clear: 0 });
  });
  it("groups kinds that differ in case, underscores and accents", () => {
    const rows = spreadByKind([withNote("a", "Ramp.", { wheelchair: "yes", category: "Fast_Food" }), withNote("b", "Ramp.", { wheelchair: "yes", category: "fast food" }), withNote("c", "Ramp.", { wheelchair: "yes", category: "fast  food" })]);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.checked).toBe(3);
  });
  it("shows the commonest spelling with underscores read as spaces", () => {
    const [r] = spreadByKind([withNote("a", "Ramp.", { wheelchair: "yes", category: "fast_food" }), withNote("b", "Ramp.", { wheelchair: "yes", category: "fast_food" }), withNote("c", "Ramp.", { wheelchair: "yes", category: "Fast Food" })]);
    expect(r!.label).toBe("fast food");
  });
  it("puts places with no kind under UNKNOWN", () => {
    const [r] = spreadByKind([withNote("a", "Two steps.", { wheelchair: "yes", category: null }), withNote("b", "Two steps.", { wheelchair: "yes", category: "unknown" })]);
    expect(r).toMatchObject({ label: "UNKNOWN", checked: 2, flagged: 2 });
  });
  it("counts every compared place once", () => {
    const places = varied(7, 120).map((p, i) => withNote(p.id, i % 2 ? "Two steps at the door." : "Ramp at the side.", { wheelchair: ["yes", "no", "designated"][i % 3], category: ["cafe", "shop", "park"][i % 3] }));
    const t = spreadTotals(spreadByKind(places));
    expect(t.checked).toBe(120);
    expect(t.flagged).toBeLessThanOrEqual(t.checked);
    expect(t.kinds).toBe(3);
  });
  it("does not depend on input order", () => {
    const rand = lcg(11);
    const places = Array.from({ length: 40 }, (_, i) => withNote(`p${i}`, rand() < 0.5 ? "Two steps." : "Ramp.", { wheelchair: rand() < 0.5 ? "yes" : "no", category: rand() < 0.5 ? "cafe" : "shop" }));
    const norm = (r: SpreadRow[]) => orderSpread(r, "name").map((x) => [x.key, x.checked, x.flagged, x.clear]);
    expect(norm(spreadByKind([...places].reverse()))).toEqual(norm(spreadByKind(places)));
  });
});

describe("orderSpread and totals", () => {
  const rows = [row({ key: "b", label: "Beta", checked: 10, flagged: 2, percent: 20 }), row({ key: "a", label: "alpha", checked: 2, flagged: 1, percent: 50 }), row({ key: "c", label: "Gamma", checked: 4, flagged: 2, percent: 50 })];
  it("orders by the number flagged, then share", () => expect(orderSpread(rows, "flagged").map((r) => r.key)).toEqual(["c", "b", "a"]));
  it("orders by share, then the number flagged", () => expect(orderSpread(rows, "share").map((r) => r.key)).toEqual(["c", "a", "b"]));
  it("orders by name without regard to case", () => expect(orderSpread(rows, "name").map((r) => r.key)).toEqual(["a", "b", "c"]));
  it("does not change its input", () => {
    const copy = [...rows];
    orderSpread(rows, "name");
    expect(rows).toEqual(copy);
  });
  it("keeps only kinds with a difference", () => expect(withDifferences([row({}), row({ key: "x", flagged: 2 })]).map((r) => r.key)).toEqual(["x"]));
  it("adds up the totals", () => expect(spreadTotals(rows)).toEqual({ kinds: 3, kindsWithDifferences: 3, checked: 16, flagged: 5 }));
  it("has zero totals for no rows", () => expect(spreadTotals([])).toEqual({ kinds: 0, kindsWithDifferences: 0, checked: 0, flagged: 0 }));
  it("knows its orders", () => {
    expect(SPREAD_ORDERS).toContain(DEFAULT_SPREAD_ORDER);
    expect(isSpreadOrder("share")).toBe(true);
    expect(isSpreadOrder("x")).toBe(false);
    expect(isSpreadOrder(null)).toBe(false);
  });
});
