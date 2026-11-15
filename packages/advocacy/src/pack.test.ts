import { describe, expect, it } from "vitest";
import { DEMO_AS_OF, DEMO_OBSERVATIONS } from "./demo.ts";
import { buildEvidencePack, packFilename, serialisePack } from "./pack.ts";
import { obs } from "./test-helpers.ts";
import type { Cell, Observation } from "./types.ts";
import { findPersonalData, validatePack } from "./validate.ts";

const AS_OF = "2026-11-15";
const published = (cells: Cell[]) => cells.flatMap((c) => (c.state === "published" ? [c] : []));

describe("re-identification risk on synthetic small-community data", () => {
  // 24 invented communities. Counts cycle through 1, 2, 3 and 4, then a few large ones.
  const small: Observation[] = Array.from({ length: 24 }, (_, i) =>
    obs({ id: `example-small-${i}`, area: `synthetic-area-${i}`, band: i % 2 === 0 ? "small" : "medium", count: (i % 4) + 1 }),
  );
  const large: Observation[] = [obs({ id: "example-large-1", area: "synthetic-area-big", band: "large", count: 64 })];
  const { pack } = buildEvidencePack([...small, ...large], { asOf: AS_OF });

  it("publishes no cell of 1 or 2, or of any count below the threshold", () => {
    for (const cell of published(pack.cells)) expect(cell.count).toBeGreaterThanOrEqual(5);
    expect(published(pack.cells).map((c) => c.geography.id)).toEqual(["synthetic-area-big"]);
  });

  it("suppresses all 24 small cells and says so", () => {
    expect(pack.counts).toEqual({ published: 1, suppressed: 24, unknown: 0 });
    expect(pack.cells.filter((c) => c.state === "suppressed")).toHaveLength(24);
  });

  it("does not let a suppressed count appear anywhere in the exported JSON", () => {
    const parsed = JSON.parse(serialisePack(pack)) as { cells: Array<Record<string, unknown>> };
    for (const cell of parsed.cells.filter((c) => c.state === "suppressed")) {
      expect(Object.keys(cell).sort()).toEqual(["category", "geography", "period", "record_type", "schema_version", "state"]);
    }
    expect(serialisePack(pack).match(/"count"/g)).toHaveLength(1);
  });

  it("suppresses a cell of 1 or 2 even when it is the only observation in the pack", () => {
    for (const count of [1, 2]) {
      const alone = buildEvidencePack([obs({ count, band: "large" })], { asOf: AS_OF }).pack;
      expect(alone.counts).toEqual({ published: 0, suppressed: 1, unknown: 0 });
      expect(serialisePack(alone)).not.toContain('"count"');
    }
  });

  it("does not publish a small cell by splitting one community across sources", () => {
    const split = buildEvidencePack([obs({ id: "example-s-1", count: 1 }), obs({ id: "example-s-2", count: 1 })], { asOf: AS_OF }).pack;
    expect(split.counts.published).toBe(0);
  });

  it("gives no total from which a suppressed count could be recovered by subtraction", () => {
    const text = serialisePack(pack);
    expect(pack.headline.province_wide_total).toBeNull();
    expect(pack.suppression.totals_published).toBe(false);
    expect(text).not.toMatch(/"(total|sum|province_wide_total)":\s*\d/);
  });

  it("keeps the first small community out of a pack that has a count above the small-community minimum elsewhere", () => {
    const mixed = buildEvidencePack(
      [obs({ id: "example-m-1", area: "synthetic-area-x", band: "small", count: 19 }), obs({ id: "example-m-2", area: "synthetic-area-y", band: "small", count: 20 })],
      { asOf: AS_OF },
    ).pack;
    expect(published(mixed.cells).map((c) => c.geography.id)).toEqual(["synthetic-area-y"]);
  });
});

describe("evidence pack content", () => {
  const { pack, rejected } = buildEvidencePack(DEMO_OBSERVATIONS, { asOf: DEMO_AS_OF });

  it("states methodology, as-of date, suppression rules and the counting-rules reference, in both languages", () => {
    expect(pack.as_of).toBe(DEMO_AS_OF);
    expect(pack.methodology.en).toHaveLength(5);
    expect(pack.methodology.fr).toHaveLength(5);
    expect(pack.suppression).toMatchObject({ k: 5, small_community_factor: 4, small_community_minimum: 20, raw_counts_withheld: true });
    expect(pack.suppression.rules.map((r) => r.id)).toContain("small_cell_threshold");
    expect(pack.counting.reference).toBe("packages/schema/docs/counting-rules.md");
    expect(pack.counting.note.en).toContain("counting-rules.md");
    expect(pack.counting.note.fr).toContain("counting-rules.md");
  });

  it("marks the demonstration pack as demonstration and counts no headline cell", () => {
    expect(pack.demonstration).toBe(true);
    expect(pack.headline).toEqual({ eligible_cells: 0, province_wide_total: null });
    for (const cell of published(pack.cells)) {
      expect(cell.example).toBe(true);
      expect(cell.headline_eligible).toBe(false);
      expect(cell.headline_exclusions).toContain("example_record");
    }
  });

  it("aggregates the demonstration records as designed", () => {
    expect(rejected).toEqual([]);
    expect(pack.inputs).toEqual({ observations_received: 14, observations_accepted: 14, observations_rejected: 0, example_observations: 14 });
    expect(pack.counts).toEqual({ published: 7, suppressed: 5, unknown: 1 });
    expect(published(pack.cells).map((c) => c.count).sort((a, b) => a - b)).toEqual([6, 8, 9, 18, 25, 42, 50]);
  });

  it("validates against its schema, carries no personal data, and is reproducible", () => {
    expect(validatePack(pack).ok).toBe(true);
    expect(findPersonalData(pack)).toEqual([]);
    expect(serialisePack(buildEvidencePack(DEMO_OBSERVATIONS, { asOf: DEMO_AS_OF }).pack)).toBe(serialisePack(pack));
    expect(packFilename(pack)).toBe("advocacy-evidence-pack-2026-11-15.json");
  });

  it("counts a non-demonstration record as headline only when the counting rules allow it", () => {
    const real = obs({ example: false, id: "obs-real-01", source_id: "open-source", licence: "open-licence", count: 12, band: "large" });
    const result = buildEvidencePack([real], { asOf: AS_OF }).pack;
    expect(result.demonstration).toBe(false);
    expect(result.headline).toEqual({ eligible_cells: 1, province_wide_total: null });
  });

  it("rejects invalid observations, counts them, and copies none of their content", () => {
    const bad = { ...obs({ count: 7 }), email: "someone@example.org", tier: 3 };
    const result = buildEvidencePack([bad, obs({ count: 9 })], { asOf: AS_OF });
    expect(result.rejected).toHaveLength(1);
    expect(result.rejected[0]?.index).toBe(0);
    expect(result.pack.inputs).toMatchObject({ observations_received: 2, observations_accepted: 1, observations_rejected: 1 });
    expect(serialisePack(result.pack)).not.toContain("someone@example.org");
  });

  it("refuses a bad as-of date or threshold", () => {
    expect(() => buildEvidencePack([], { asOf: "2026-02-31" })).toThrow(RangeError);
    expect(() => buildEvidencePack([], { asOf: AS_OF, config: { k: 2 } })).toThrow(RangeError);
  });

  it("builds a valid empty pack", () => {
    const empty = buildEvidencePack([], { asOf: AS_OF }).pack;
    expect(empty.demonstration).toBe(false);
    expect(empty.counts).toEqual({ published: 0, suppressed: 0, unknown: 0 });
  });
});
