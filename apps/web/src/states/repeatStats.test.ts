import { describe, expect, it } from "vitest";
import { findDuplicates } from "./duplicateGroups";
import { DUPLICATE_REASONS } from "./duplicateScore";
import { place, varied } from "./placeFixtures";
import { repeatStats } from "./repeatStats";

const twin = (id: string, over: Record<string, unknown> = {}) => place(id, { name: "Alpha Hall", address: "5 Elm Street", category: "cafe", lat: 43.65, lon: -79.38, ...over });
const other = (id: string, over: Record<string, unknown> = {}) => place(id, { name: "Beta Court", address: "9 Oak Avenue", category: "shop", lat: 44.2, lon: -80, ...over });

describe("repeatStats", () => {
  it("is all zero for no groups", () => {
    const s = repeatStats(findDuplicates([]));
    expect(s).toMatchObject({ groups: 0, places: 0, pairsOnly: 0, larger: 0, largest: 0, tagDisagreements: 0, meanTopScore: null });
    for (const r of DUPLICATE_REASONS) expect(s.byReason[r]).toBe(0);
  });
  it("counts groups, places and group sizes", () => {
    const s = repeatStats(findDuplicates([twin("a"), twin("b"), twin("c"), other("d"), other("e")]));
    expect(s.groups).toBe(2);
    expect(s.places).toBe(5);
    expect(s.pairsOnly).toBe(1);
    expect(s.larger).toBe(1);
    expect(s.largest).toBe(3);
    expect(s.pairsOnly + s.larger).toBe(s.groups);
  });
  it("counts a reason once per group however many pairs have it", () => {
    const s = repeatStats(findDuplicates([twin("a"), twin("b"), twin("c")]));
    expect(s.byReason["same-name"]).toBe(1);
    expect(s.byReason["same-address"]).toBe(1);
  });
  it("counts reasons only for the groups that have them", () => {
    const s = repeatStats(findDuplicates([twin("a"), twin("b"), other("c", { lat: 44.2 }), other("d", { lat: null, lon: null })]));
    expect(s.byReason["same-name"]).toBe(2);
    expect(s.byReason["very-near"]).toBe(1);
  });
  it("counts groups whose members disagree on the tag", () => {
    const s = repeatStats(findDuplicates([twin("a", { wheelchair: "yes" }), twin("b", { wheelchair: "no" }), other("c", { wheelchair: "yes" }), other("d", { wheelchair: "yes" })]));
    expect(s.tagDisagreements).toBe(1);
  });
  it("averages the best scores to two places", () => {
    const s = repeatStats(findDuplicates([twin("a"), twin("b"), other("c", { lat: 44.2 }), other("d", { lat: 45, address: "1 Zed St", category: "bar" })], "loose"));
    expect(s.meanTopScore).not.toBeNull();
    expect(s.meanTopScore!).toBeGreaterThan(0);
    expect(s.meanTopScore!).toBeLessThanOrEqual(1);
    expect(Math.round(s.meanTopScore! * 100) / 100).toBe(s.meanTopScore);
  });
  it("agrees with the report it reads on a varied pack", () => {
    const r = findDuplicates(varied(7, 80), "loose");
    const s = repeatStats(r);
    expect(s.groups).toBe(r.groups.length);
    expect(s.places).toBe(r.placesInGroups);
    expect(s.pairsOnly + s.larger).toBe(r.groups.length);
    for (const reason of DUPLICATE_REASONS) expect(s.byReason[reason]).toBeLessThanOrEqual(r.groups.length);
  });
});
