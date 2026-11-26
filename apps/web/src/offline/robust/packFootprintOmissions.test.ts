import { describe, expect, it } from "vitest";
import { measureFootprint, type FootprintEvidence } from "./packFootprint";
import type { FootprintIndex } from "./packFootprintIndex";
import { measureRegionOmissions } from "./packFootprintOmissions";

const unknownCache: FootprintEvidence = { present: new Set(), missingGroups: [], inconsistent: false };
const region = (id: string, cellIds: string[]) => ({
  id, label: { en: id, fr: id }, cellIds, complete: true, withheldCount: 0,
});

function overlap(): FootprintIndex {
  // Three regions: A and B have two common parts, and C references only
  // cross-region parts. Repetition in A is also possible across its cells.
  return {
    builtAt: "2026-09-15",
    regions: new Map([
      ["A", region("A", ["a1", "a2"])],
      ["B", region("B", ["b1"])],
      ["C", region("C", ["c1"])],
    ]),
    cells: new Map([
      ["a1", { id: "a1", hashes: ["one", "two"], complete: true }],
      ["a2", { id: "a2", hashes: ["one", "three"], complete: true }],
      ["b1", { id: "b1", hashes: ["two", "three", "four"], complete: true }],
      ["c1", { id: "c1", hashes: ["three"], complete: true }],
    ]),
    parts: new Map(Object.entries({ one: 40, two: 3, three: 8, four: 24 })
      .map(([hash, bytes]) => [hash, { hash, bytes, sources: [] }])),
  };
}

describe("what changes if one selected region is left out", () => {
  it("counts a part repeated within two cells of one region once", () => {
    const index = overlap();
    const selection = measureFootprint(index, unknownCache, ["A"]);
    expect(measureRegionOmissions(index, unknownCache, selection)).toEqual([{
      regionId: "A", exclusiveBytes: 51, maximumTransferReduction: 51, exclusivePartCount: 3,
    }]);
  });

  it("reports no byte reduction for a region consisting only of shared parts", () => {
    const index = overlap();
    const selected = measureFootprint(index, unknownCache, ["C", "A", "B"]);
    expect(selected.steps[0]?.additionalBytes).toBe(8);
    expect(measureRegionOmissions(index, unknownCache, selected)[0]).toEqual({
      regionId: "C", exclusiveBytes: 0, maximumTransferReduction: 0, exclusivePartCount: 0,
    });
  });

  it("separates exclusive bytes already present from potentially outstanding transfers", () => {
    const index = overlap();
    const evidence = { ...unknownCache, present: new Set(["one", "two"]) };
    const result = measureFootprint(index, evidence, ["A", "B"]);
    expect(measureRegionOmissions(index, evidence, result)).toEqual([
      { regionId: "A", exclusivePartCount: 1, exclusiveBytes: 40, maximumTransferReduction: 0 },
      { regionId: "B", exclusivePartCount: 1, exclusiveBytes: 24, maximumTransferReduction: 24 },
    ]);
  });

  it("reports unknown savings where a missing region prevents ownership comparison", () => {
    const index = overlap();
    const selected = measureFootprint(index, unknownCache, ["retired", "B"]);
    expect(measureRegionOmissions(index, unknownCache, selected)).toEqual([{
      regionId: "B", exclusivePartCount: 3, exclusiveBytes: null, maximumTransferReduction: null,
    }]);
  });

  it("can price remaining transfers even if a cached part has an unknown size", () => {
    const base = overlap();
    const parts = new Map(base.parts);
    parts.set("one", { hash: "one", bytes: null, sources: [] });
    const index = { ...base, parts };
    const evidence = { ...unknownCache, present: new Set(["one"]) };
    const selection = measureFootprint(index, evidence, ["A"]);
    const [result] = measureRegionOmissions(index, evidence, selection);
    expect(result?.exclusiveBytes).toBeNull();
    expect(result?.maximumTransferReduction).toBe(11);
  });

  it("agrees with remeasuring every possible removal across selections and cache states", () => {
    const index = overlap();
    const candidateRegions = [...index.regions.keys()];
    const partKeys = [...index.parts.keys()];
    for (let regionMask = 0; regionMask < 2 ** candidateRegions.length; regionMask++) {
      const chosen = candidateRegions.filter((_, i) => regionMask & (1 << i));
      for (let cacheMask = 0; cacheMask < 2 ** partKeys.length; cacheMask++) {
        const present = new Set(partKeys.filter((_, i) => cacheMask & (1 << i)));
        const evidence = { ...unknownCache, present };
        const selected = measureFootprint(index, evidence, chosen);
        const omissions = measureRegionOmissions(index, evidence, selected);
        expect(omissions.map((row) => row.regionId)).toEqual(chosen);
        for (const row of omissions) {
          const reduced = measureFootprint(index, evidence, chosen.filter((id) => id !== row.regionId));
          expect(row.exclusivePartCount).toBe(selected.hashes.size - reduced.hashes.size);
          expect(row.exclusiveBytes).toBe(selected.declaredBytes! - reduced.declaredBytes!);
          expect(row.maximumTransferReduction).toBe(selected.transfer.maximumBytes! - reduced.transfer.maximumBytes!);
        }
      }
    }
  });
});
