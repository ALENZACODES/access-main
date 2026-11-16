import { describe, expect, it } from "vitest";
import { type CapacityPlan } from "./quotaPlanning";
import { type RegionInventory } from "./regionInventory";
import { estimatedCapacityLabel, planTriageSelection, suggestTriageFit } from "./triageBudget";

const provenance = { source: "Open municipal source", licence: "CC0 1.0", date: "2026-01-15" };
const inventory: RegionInventory = {
  regionId: "demo",
  cells: [
    { id: "one", expectedBytes: 4, state: "unknown", cause: "missing", provenance },
    { id: "two", expectedBytes: 6, state: "unknown", cause: "stale", provenance },
    { id: "three", expectedBytes: 2, state: "unknown", cause: "unreadable", provenance },
    { id: "four", expectedBytes: 10, state: "saved", cause: "present", provenance },
    { id: "five", expectedBytes: 1, state: "unknown", cause: "missing", provenance },
    { id: "six", expectedBytes: 0, state: "unknown", cause: "missing", provenance },
  ],
  savedCount: 1, unknownCount: 5, savedBytes: 10, expectedBytes: 23, complete: false,
};

function capacity(freeBytes: number | null, reserveBytes = 1): CapacityPlan {
  return {
    status: freeBytes === null ? "unknown" : "sufficient",
    requiredBytes: 14, remainingBytes: 13, freeBytes, reserveBytes,
    missingCount: 5, percentage: 17,
  };
}

describe("selected-cell storage planning", () => {
  it("returns an empty state without selected cells", () => {
    expect(planTriageSelection(inventory, capacity(100), [])).toEqual({
      state: "empty", bytes: 0, selectedCount: 0,
      estimatedFreeAfterReserve: null, estimatedRemaining: null, shortfall: null,
    });
  });

  it("does not include cells already saved", () => {
    const result = planTriageSelection(inventory, capacity(100), ["four", "one"]);
    expect(result.selectedCount).toBe(1);
    expect(result.bytes).toBe(4);
  });

  it("does not include unlisted cells", () => {
    const result = planTriageSelection(inventory, capacity(100), ["not-here"]);
    expect(result.state).toBe("empty");
  });

  it("deduplicates selected IDs", () => {
    const result = planTriageSelection(inventory, capacity(100), ["one", "one"]);
    expect(result.selectedCount).toBe(1);
    expect(result.bytes).toBe(4);
  });

  it("reports a possible fit rather than a successful write", () => {
    const result = planTriageSelection(inventory, capacity(10), ["one", "three"]);
    expect(result.state).toBe("estimated-fit");
    expect(result.estimatedFreeAfterReserve).toBe(9);
    expect(result.estimatedRemaining).toBe(3);
    expect(result.shortfall).toBe(0);
  });

  it("counts reserved bytes before considering available space", () => {
    const result = planTriageSelection(inventory, capacity(6, 3), ["one"]);
    expect(result.state).toBe("estimated-short");
    expect(result.shortfall).toBe(1);
  });

  it("keeps unknown browser storage estimates UNKNOWN", () => {
    const result = planTriageSelection(inventory, capacity(null), ["one"]);
    expect(result.state).toBe("unknown");
    expect(result.shortfall).toBeNull();
  });

  it("keeps missing plan estimates UNKNOWN", () => {
    const result = planTriageSelection(inventory, null, ["one"]);
    expect(result.state).toBe("unknown");
    expect(result.estimatedFreeAfterReserve).toBeNull();
  });

  it("keeps zero-byte selections UNKNOWN when device estimates are missing", () => {
    const result = planTriageSelection(inventory, null, ["six"]);
    expect(result.state).toBe("unknown");
    expect(result.bytes).toBe(0);
  });

  it("reports a zero-byte cell as a possible fit when capacity is known", () => {
    expect(planTriageSelection(inventory, capacity(0), ["six"]).state).toBe("estimated-fit");
  });

  it("does not treat a reserve larger than free bytes as negative space", () => {
    const result = planTriageSelection(inventory, capacity(0, 10), ["one"]);
    expect(result.estimatedFreeAfterReserve).toBe(0);
    expect(result.shortfall).toBe(4);
  });

  it("reports exact shortfall for selected cells", () => {
    const result = planTriageSelection(inventory, capacity(7, 1), ["one", "two"]);
    expect(result.state).toBe("estimated-short");
    expect(result.shortfall).toBe(4);
  });

  it("includes stale and unreadable copies in the calculation", () => {
    const result = planTriageSelection(inventory, capacity(20), ["two", "three"]);
    expect(result.selectedCount).toBe(2);
    expect(result.bytes).toBe(8);
  });

  it("rejects negative expected bytes", () => {
    const altered: RegionInventory = {
      ...inventory,
      cells: inventory.cells.map((cell) => cell.id === "one" ? { ...cell, expectedBytes: -2 } : cell),
    };
    expect(() => planTriageSelection(altered, capacity(100), ["one"])).toThrow(RangeError);
  });

  it("rejects fractional expected bytes", () => {
    const altered: RegionInventory = {
      ...inventory,
      cells: inventory.cells.map((cell) => cell.id === "one" ? { ...cell, expectedBytes: 2.5 } : cell),
    };
    expect(() => planTriageSelection(altered, capacity(100), ["one"])).toThrow(RangeError);
  });

  it("rejects summed bytes exceeding safe integer precision", () => {
    const altered: RegionInventory = {
      ...inventory,
      cells: inventory.cells.map((cell) => cell.id === "one" || cell.id === "two" ?
        { ...cell, expectedBytes: Number.MAX_SAFE_INTEGER } : cell),
    };
    expect(() => planTriageSelection(altered, capacity(100), ["one", "two"])).toThrow(RangeError);
  });

  it("treats invalid free byte estimates as UNKNOWN", () => {
    expect(planTriageSelection(inventory, capacity(-2), ["one"]).state).toBe("unknown");
    expect(planTriageSelection(inventory, capacity(1.5), ["one"]).state).toBe("unknown");
  });

  it("treats invalid reserve estimates as UNKNOWN", () => {
    expect(planTriageSelection(inventory, capacity(10, -1), ["one"]).state).toBe("unknown");
    expect(planTriageSelection(inventory, capacity(10, 1.5), ["one"]).state).toBe("unknown");
  });

  it("calculates leftover space at the exact threshold", () => {
    const result = planTriageSelection(inventory, capacity(5), ["one"]);
    expect(result.state).toBe("estimated-fit");
    expect(result.estimatedRemaining).toBe(0);
  });
});

describe("advisory smallest-first selection", () => {
  it("returns no suggestions when storage is UNKNOWN", () => {
    expect(suggestTriageFit(inventory, null)).toEqual([]);
    expect(suggestTriageFit(inventory, capacity(null))).toEqual([]);
  });

  it("picks the smallest UNKNOWN cells first", () => {
    expect(suggestTriageFit(inventory, capacity(8))).toEqual(["six", "five", "three", "one"]);
  });

  it("does not suggest saved cells", () => {
    expect(suggestTriageFit(inventory, capacity(100))).not.toContain("four");
  });

  it("does not exceed the byte estimate after reserve", () => {
    const ids = suggestTriageFit(inventory, capacity(8));
    const result = planTriageSelection(inventory, capacity(8), ids);
    expect(result.bytes).toBeLessThanOrEqual(7);
  });

  it("keeps enough space for a zero-byte cell", () => {
    expect(suggestTriageFit(inventory, capacity(0))).toEqual(["six"]);
  });

  it("allows the caller to limit number of suggestions", () => {
    expect(suggestTriageFit(inventory, capacity(100), 2)).toEqual(["six", "five"]);
  });

  it("allows selecting no cells", () => {
    expect(suggestTriageFit(inventory, capacity(100), 0)).toEqual([]);
  });

  it("rejects negative selection limits", () => {
    expect(() => suggestTriageFit(inventory, capacity(100), -1)).toThrow(RangeError);
  });

  it("rejects limits beyond the maximum", () => {
    expect(() => suggestTriageFit(inventory, capacity(100), 501)).toThrow(RangeError);
  });

  it("rejects fractional limits", () => {
    expect(() => suggestTriageFit(inventory, capacity(100), 1.25)).toThrow(RangeError);
  });

  it("never mutates input inventory order", () => {
    const ids = inventory.cells.map((cell) => cell.id);
    suggestTriageFit(inventory, capacity(100));
    expect(inventory.cells.map((cell) => cell.id)).toEqual(ids);
  });

  it("accounts for low free space without making a network request", () => {
    expect(suggestTriageFit(inventory, capacity(1))).toEqual(["six"]);
  });

  it("returns suggestions based on byte counts only", () => {
    const suggested = suggestTriageFit(inventory, capacity(100));
    expect(suggested).toEqual(["six", "five", "three", "one", "two"]);
  });

  it("skips invalid candidate sizes", () => {
    const altered: RegionInventory = {
      ...inventory,
      cells: [...inventory.cells, {
        id: "invalid", expectedBytes: -3, state: "unknown", cause: "missing", provenance,
      }],
    };
    expect(suggestTriageFit(altered, capacity(100))).not.toContain("invalid");
  });

  it("gives stable ordering on equal sizes", () => {
    const equal: RegionInventory = {
      ...inventory,
      cells: [
        { id: "z", expectedBytes: 2, state: "unknown", cause: "missing", provenance },
        { id: "a", expectedBytes: 2, state: "unknown", cause: "missing", provenance },
      ],
    };
    expect(suggestTriageFit(equal, capacity(5))).toEqual(["a", "z"]);
  });
});

describe("advisory result copy", () => {
  it("explains an empty selection", () => {
    expect(estimatedCapacityLabel(planTriageSelection(inventory, null, []), "en")).toBe("No cells selected.");
  });

  it("keeps English UNKNOWN when estimates are absent", () => {
    expect(estimatedCapacityLabel(planTriageSelection(inventory, null, ["one"]), "en")).toContain("UNKNOWN");
  });

  it("keeps French UNKNOWN when estimates are absent", () => {
    expect(estimatedCapacityLabel(planTriageSelection(inventory, null, ["one"]), "fr")).toContain("INCONNUE");
  });

  it("does not promise successful persistence when space appears available", () => {
    const result = planTriageSelection(inventory, capacity(100), ["one"]);
    expect(estimatedCapacityLabel(result, "en")).toContain("can still fail");
  });

  it("gives a cautious French explanation", () => {
    const result = planTriageSelection(inventory, capacity(100), ["one"]);
    expect(estimatedCapacityLabel(result, "fr")).toContain("peut échouer");
  });

  it("warns on insufficient estimated space", () => {
    const result = planTriageSelection(inventory, capacity(2), ["one"]);
    expect(estimatedCapacityLabel(result, "en")).toContain("may exceed");
    expect(estimatedCapacityLabel(result, "fr")).toContain("pourrait dépasser");
  });

  it("provides French typography without straight apostrophes", () => {
    for (const state of ["empty", "unknown", "estimated-fit", "estimated-short"] as const) {
      const result = { ...planTriageSelection(inventory, null, ["one"]), state };
      const text = estimatedCapacityLabel(result, "fr");
      expect(text).not.toContain("'");
      expect(/(?<!\u00a0):/u.test(text)).toBe(false);
      expect(/(?<!\u202f)[;!?]/u.test(text)).toBe(false);
    }
  });
});
