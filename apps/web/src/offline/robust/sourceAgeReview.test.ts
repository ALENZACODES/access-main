import { describe, expect, it } from "vitest";
import { type Provenance, type RegionManifest } from "./regionDownload";
import { type InventoryCell, type RegionInventory } from "./regionInventory";
import {
  ageDaysOn, ageReviewAction, classifyAge, parseDay, reviewSourceAge,
  sourceAgeGroups, sourceAgePage, sourceIssues, type AgeFilter, type AgeSort,
} from "./sourceAgeReview";

const north: Provenance = { source: "City transport open data", licence: "CC BY 4.0", date: "2026-01-15" };
const south: Provenance = { source: "Municipal place listing", licence: "CC0 1.0", date: "2025-06-15" };
const manifest: RegionManifest = {
  regionId: "north",
  cells: [
    { id: "alpha", bytes: 100, provenance: north },
    { id: "beta", bytes: 200, provenance: north },
    { id: "gamma", bytes: 300, provenance: south },
    { id: "delta", bytes: 400, provenance: south },
  ],
};
const day = "2026-11-19";

function inventoryCell(id: string, cause: InventoryCell["cause"]): InventoryCell {
  const expected = manifest.cells.find((item) => item.id === id);
  if (!expected) throw new Error("Fixture requires a listed ID");
  return {
    id, cause, expectedBytes: expected.bytes, provenance: expected.provenance,
    state: cause === "present" ? "saved" : "unknown",
  };
}
function inventory(rows: readonly InventoryCell[]): RegionInventory {
  const saved = rows.filter((item) => item.state === "saved");
  return {
    regionId: "north", cells: rows,
    savedCount: saved.length,
    unknownCount: rows.length - saved.length,
    savedBytes: saved.reduce((total, item) => total + item.expectedBytes, 0),
    expectedBytes: rows.reduce((total, item) => total + item.expectedBytes, 0),
    complete: saved.length === rows.length,
  };
}
function completeInventory(): RegionInventory {
  return inventory(manifest.cells.map((cell) => inventoryCell(cell.id, "present")));
}
function partialInventory(): RegionInventory {
  return inventory([
    inventoryCell("alpha", "present"),
    inventoryCell("beta", "missing"),
    inventoryCell("gamma", "stale"),
    inventoryCell("delta", "unreadable"),
  ]);
}
function sample() { return reviewSourceAge(manifest, partialInventory(), day, 365); }

describe("strict source-calendar parsing", () => {
  it("parses a valid ISO source day", () => {
    expect(parseDay("2026-11-19")).toBe(Date.UTC(2026, 10, 19));
  });
  it("rejects noncanonical short months", () => {
    expect(parseDay("2026-1-19")).toBeNull();
  });
  it("rejects noncanonical short days", () => {
    expect(parseDay("2026-11-9")).toBeNull();
  });
  it("rejects 30 February, even if Date adjusts it", () => {
    expect(parseDay("2026-02-30")).toBeNull();
  });
  it("rejects the 29th of February in a non-leap year", () => {
    expect(parseDay("2025-02-29")).toBeNull();
  });
  it("accepts the 29th of February in a leap year", () => {
    expect(parseDay("2024-02-29")).not.toBeNull();
  });
  it("rejects months outside the calendar", () => {
    expect(parseDay("2026-00-15")).toBeNull();
    expect(parseDay("2026-13-15")).toBeNull();
  });
  it("rejects dates containing a time suffix", () => {
    expect(parseDay("2026-01-01T00:00Z")).toBeNull();
  });
  it("rejects an arbitrary date fragment", () => {
    expect(parseDay("../../2026-01-01")).toBeNull();
  });
  it("rejects a trailing newline and control text", () => {
    expect(parseDay("2026-01-01\nother")).toBeNull();
  });
  it("computes exact positive days, including leap day", () => {
    expect(ageDaysOn("2024-02-28", "2024-03-01")).toBe(2);
  });
  it("computes exact zero-day age", () => {
    expect(ageDaysOn(day, day)).toBe(0);
  });
  it("does not mask a future date as current", () => {
    expect(ageDaysOn("2026-11-20", day)).toBe(-1);
  });
  it("does not infer an age from a malformed source date", () => {
    expect(ageDaysOn("2026-02-30", day)).toBeNull();
  });
  it("does not infer an age from an invalid review date", () => {
    expect(ageDaysOn("2026-01-01", "bad")).toBeNull();
  });
});

describe("age thresholds and status honesty", () => {
  it("treats exact threshold age as within the threshold", () => {
    expect(classifyAge(365, 365)).toBe("recent");
  });
  it("labels a one-day excess as older", () => {
    expect(classifyAge(366, 365)).toBe("older");
  });
  it("labels a future source as future, not recent", () => {
    expect(classifyAge(-1, 365)).toBe("future");
  });
  it("keeps absent age UNKNOWN", () => {
    expect(classifyAge(null, 365)).toBe("UNKNOWN");
  });
  it("keeps fractional age UNKNOWN", () => {
    expect(classifyAge(2.25, 365)).toBe("UNKNOWN");
  });
  it("rejects an invalid threshold without silently selecting one", () => {
    expect(classifyAge(30, -1)).toBe("UNKNOWN");
    expect(classifyAge(30, 0)).toBe("UNKNOWN");
    expect(classifyAge(30, 3651)).toBe("UNKNOWN");
  });
  it("requires an explicit valid review date", () => {
    expect(() => reviewSourceAge(manifest, partialInventory(), "bad")).toThrow();
  });
  it("rejects negative, fractional and overly large review thresholds", () => {
    for (const invalid of [-1, 0, 3.5, 3651, Number.NaN]) {
      expect(() => reviewSourceAge(manifest, partialInventory(), day, invalid)).toThrow();
    }
  });
  it("reports source dates separately from stored-copy status", () => {
    const report = sample();
    expect(report.rows.map((row) => row.copyBand)).toEqual([
      "saved", "missing", "stale", "unreadable",
    ]);
    expect(report.rows.map((row) => row.ageBand)).toEqual([
      "recent", "recent", "older", "older",
    ]);
  });
  it("does not classify the accessibility of a place", () => {
    expect(sample().rows.every((row) => !("accessible" in row))).toBe(true);
  });
  it("never infers an evidence tier from saved bytes", () => {
    expect(sample().rows.every((row) => row.evidenceTier === "UNKNOWN")).toBe(true);
  });
  it("reports the exact count of each independent storage status", () => {
    expect(sample()).toMatchObject({ saved: 1, missing: 1, stale: 1, unreadable: 1 });
  });
  it("does not count a stale copy as matching saved data", () => {
    expect(sample().saved).toBe(1);
    expect(sample().rows[2]?.copyBand).toBe("stale");
  });
  it("does not rewrite or mutate the inventory", () => {
    const before = partialInventory();
    const serialized = JSON.stringify(before);
    reviewSourceAge(manifest, before, day);
    expect(JSON.stringify(before)).toBe(serialized);
  });
  it("does not rewrite or mutate the manifest", () => {
    const serialized = JSON.stringify(manifest);
    reviewSourceAge(manifest, partialInventory(), day);
    expect(JSON.stringify(manifest)).toBe(serialized);
  });
  it("keeps a missing inventory UNKNOWN", () => {
    const result = reviewSourceAge(manifest, null, day);
    expect(result.state).toBe("UNKNOWN");
    expect(result.findings).toContain("missing-inventory");
    expect(result.saved).toBe(0);
  });
  it("keeps a wrong-region inventory UNKNOWN", () => {
    const result = reviewSourceAge(manifest, { ...completeInventory(), regionId: "other" }, day);
    expect(result.state).toBe("UNKNOWN");
    expect(result.findings).toContain("region-mismatch");
  });
  it("rejects duplicate manifest identifiers without counting them saved", () => {
    const duplicate: RegionManifest = { ...manifest, cells: [manifest.cells[0]!, manifest.cells[0]!] };
    const result = reviewSourceAge(duplicate, completeInventory(), day);
    expect(result.findings).toContain("duplicate-manifest");
    expect(result.state).toBe("UNKNOWN");
    expect(result.saved).toBe(0);
  });
  it("rejects duplicate inventory identifiers", () => {
    const result = reviewSourceAge(manifest, inventory([
      inventoryCell("alpha", "present"), inventoryCell("alpha", "present"),
    ]), day);
    expect(result.findings).toContain("duplicate-inventory");
    expect(result.rows.every((row) => row.copyBand === "UNKNOWN")).toBe(true);
  });
  it("rejects unlisted inventory cells", () => {
    const outside = { ...inventoryCell("alpha", "present"), id: "outside" };
    const result = reviewSourceAge(manifest, inventory([outside]), day);
    expect(result.findings).toContain("unlisted-inventory");
    expect(result.state).toBe("UNKNOWN");
  });
  it("rejects negative cell sizes", () => {
    const bad: RegionManifest = { ...manifest, cells: [{ id: "a", bytes: -2, provenance: north }] };
    expect(reviewSourceAge(bad, inventory([]), day).findings).toContain("invalid-manifest");
  });
  it("rejects nonintegral cell sizes", () => {
    const bad: RegionManifest = { ...manifest, cells: [{ id: "a", bytes: 1.5, provenance: north }] };
    expect(reviewSourceAge(bad, inventory([]), day).state).toBe("UNKNOWN");
  });
  it("rejects a missing source name", () => {
    const bad = { ...north, source: "" };
    expect(sourceIssues(bad)).toContain("invalid-manifest");
  });
  it("rejects a private or unsupported licence", () => {
    expect(sourceIssues({ ...north, licence: "All rights reserved" })).toContain("unsupported-licence");
  });
  it("does not assign a source date when publication date is invalid", () => {
    const bad: RegionManifest = {
      ...manifest, cells: [{ id: "a", bytes: 1, provenance: { ...north, date: "2026-02-30" } }],
    };
    const result = reviewSourceAge(bad, inventory([]), day);
    expect(result.rows[0]?.ageDays).toBeNull();
    expect(result.rows[0]?.provenance).toBeNull();
    expect(result.state).toBe("UNKNOWN");
  });
  it("flags a future publication date separately", () => {
    const future: RegionManifest = {
      regionId: "north", cells: [{ id: "a", bytes: 1, provenance: { ...north, date: "2027-01-01" } }],
    };
    const result = reviewSourceAge(future, inventory([]), day);
    expect(result.future).toBe(1);
    expect(result.findings).toContain("future-source-date");
    expect(result.state).toBe("UNKNOWN");
  });
  it("never suggests removing data because a source is older", () => {
    const row = sample().rows[2];
    if (!row) throw new Error("Missing fixture cell");
    expect(ageReviewAction(row)).toBe("review-source");
  });
  it("suggests inspecting an unreadable cell", () => {
    const row = sample().rows[3];
    if (!row) throw new Error("Missing fixture cell");
    expect(ageReviewAction(row)).toBe("inspect");
  });
  it("suggests no action for a recent matching saved copy", () => {
    const row = sample().rows[0];
    if (!row) throw new Error("Missing fixture cell");
    expect(ageReviewAction(row)).toBe("none");
  });
  it("does not conflate metadata mismatch with an absent cell", () => {
    const changed = {
      ...inventoryCell("alpha", "present"), provenance: { ...north, date: "2024-01-01" },
    };
    const result = reviewSourceAge(manifest, inventory([changed]), day);
    expect(result.rows[0]).toMatchObject({
      copyBand: "UNKNOWN", issue: "mismatched-copy",
    });
  });
});

describe("source group accounting", () => {
  it("groups matching source, licence and date triples", () => {
    expect(sourceAgeGroups(sample())).toHaveLength(2);
  });
  it("keeps different source publication dates distinct", () => {
    const changed: RegionManifest = {
      ...manifest,
      cells: [
        manifest.cells[0]!,
        { ...manifest.cells[1]!, provenance: { ...north, date: "2026-01-16" } },
      ],
    };
    expect(sourceAgeGroups(reviewSourceAge(changed, inventory([]), day))).toHaveLength(2);
  });
  it("counts saved and UNKNOWN records in each group independently", () => {
    const groups = sourceAgeGroups(sample());
    expect(groups.find((g) => g.source.source === north.source)).toMatchObject({
      rows: 2, saved: 1, unknown: 0,
    });
  });
  it("preserves exact licence and date in every group", () => {
    expect(sourceAgeGroups(sample()).map((g) => g.source.licence)).toEqual([
      "CC BY 4.0", "CC0 1.0",
    ]);
  });
  it("does not invent a group for invalid provenance", () => {
    const invalid: RegionManifest = {
      regionId: "north", cells: [{ id: "x", bytes: 1, provenance: { ...north, licence: "Private" } }],
    };
    expect(sourceAgeGroups(reviewSourceAge(invalid, inventory([]), day))).toEqual([]);
  });
  it("sorts group names predictably", () => {
    const groups = sourceAgeGroups(sample());
    expect(groups.map((g) => g.source.source)).toEqual([
      "City transport open data", "Municipal place listing",
    ]);
  });
});

describe("search and bounded pagination", () => {
  const page = (filter: AgeFilter, sort: AgeSort, search = "", offset = 0, pageSize = 12) =>
    sourceAgePage(sample(), { filter, sort, search, page: offset, pageSize });

  it("returns the full listing by default", () => {
    expect(page("all", "manifest").rows.map((row) => row.id)).toEqual([
      "alpha", "beta", "gamma", "delta",
    ]);
  });
  it("finds a cell by case-insensitive ID", () => {
    expect(page("all", "manifest", "ALPHA").rows.map((row) => row.id)).toEqual(["alpha"]);
  });
  it("trims search whitespace", () => {
    expect(page("all", "manifest", "  beta  ").rows.map((row) => row.id)).toEqual(["beta"]);
  });
  it("searches provenance source names", () => {
    expect(page("all", "manifest", "municipal").rows.map((row) => row.id)).toEqual(["gamma", "delta"]);
  });
  it("searches licence text", () => {
    expect(page("all", "manifest", "CC0").total).toBe(2);
  });
  it("searches publication date", () => {
    expect(page("all", "manifest", "2026-01").total).toBe(2);
  });
  it("filters cells within the review threshold", () => {
    expect(page("recent", "manifest").rows.map((row) => row.id)).toEqual(["alpha", "beta"]);
  });
  it("filters older cells", () => {
    expect(page("older", "manifest").rows.map((row) => row.id)).toEqual(["gamma", "delta"]);
  });
  it("filters cells requiring attention", () => {
    expect(page("needs-attention", "manifest").rows.map((row) => row.id)).toEqual(["beta", "gamma", "delta"]);
  });
  it("does not silently reinterpret UNKNOWN as recent", () => {
    const result = reviewSourceAge(manifest, null, day);
    const data = sourceAgePage(result, {
      filter: "unknown", sort: "manifest", search: "", page: 0, pageSize: 10,
    });
    expect(data.total).toBe(4);
  });
  it("supports zero results without a negative page index", () => {
    const result = page("all", "manifest", "no-such-record");
    expect(result.page).toBe(0);
    expect(result.pages).toBe(1);
    expect(result.rows).toEqual([]);
  });
  it("paginates without losing records", () => {
    const rows: string[] = [];
    for (let index = 0; index < 4; index += 1) {
      const view = page("all", "manifest", "", index, 1);
      expect(view.rows).toHaveLength(1);
      rows.push(view.rows[0]!.id);
    }
    expect(rows).toEqual(["alpha", "beta", "gamma", "delta"]);
  });
  it("caps the requested page size at 100", () => {
    const result = page("all", "manifest", "", 0, 9000);
    expect(result.rows).toHaveLength(4);
  });
  it("normalizes a negative page index", () => {
    expect(page("all", "manifest", "", -5, 2).page).toBe(0);
  });
  it("normalizes an excessive page index", () => {
    expect(page("all", "manifest", "", 200, 2).page).toBe(1);
  });
  it("sorts by source name deterministically", () => {
    const a = page("all", "source");
    const b = page("all", "source");
    expect(a).toEqual(b);
  });
  it("sorts by storage status deterministically", () => {
    expect(page("all", "status")).toEqual(page("all", "status"));
  });
  it("supports oldest and newest sort order", () => {
    const oldest = page("all", "oldest");
    const newest = page("all", "newest");
    expect(oldest.rows[0]?.id).toBe("delta");
    expect(newest.rows[0]?.id).toBe("alpha");
  });
  it("keeps each row's original provenance after sorting", () => {
    const entries = page("all", "oldest").rows;
    expect(entries.find((row) => row.id === "alpha")?.provenance).toEqual(north);
  });
});
