import { describe, expect, it } from "vitest";
import { periodKey, isCoarsePeriod } from "./coarsen.ts";
import { indexRegions, rowFor, type RegionIndex } from "./regions.ts";
import { buildProtectedTables, checkMinimumCellSize } from "./tables.ts";
import { attackerRanges, many, region, seeded } from "./test-helpers.ts";
import { ALL_REGIONS, COMBINED_TOPIC, TOPICS, type AdvocacyReport, type PopulationBand, type PublishedTable, type Region } from "./types.ts";

function indexOf(regions: readonly Region[]): RegionIndex {
  const result = indexRegions(regions);
  if (!result.ok) throw new Error(result.issue);
  return result.index;
}

const FLAT = [region("test-a"), region("test-b"), region("test-c")];
const month = { minimumCellSize: 5, grain: "month" as const };
const publishedOnly = (tables: ReturnType<typeof buildProtectedTables>["tables"]) => tables.flatMap((t) => (t.state === "published" ? [t] : []));
const view = (table: PublishedTable) => table.rows.map((row) => row.cells.map((cell) => (cell.state === "published" ? cell.count : null)));

describe("minimum cell size", () => {
  it("is configurable but never below 3", () => {
    expect(checkMinimumCellSize(3)).toBe(3);
    expect(checkMinimumCellSize(10)).toBe(10);
    for (const bad of [0, 1, 2, 4.5, Number.NaN]) expect(() => checkMinimumCellSize(bad)).toThrow(RangeError);
  });

  it("changes what is published", () => {
    const reports = [...many(4, "parking", "bay_misused", "test-a"), ...many(9, "parking", "bay_blocked", "test-a"), ...many(9, "parking", "bay_misused", "test-b"), ...many(9, "parking", "bay_blocked", "test-b")];
    const loose = publishedOnly(buildProtectedTables(reports, indexOf(FLAT), { minimumCellSize: 3, grain: "month" }).tables)[0];
    const strict = publishedOnly(buildProtectedTables(reports, indexOf(FLAT), month).tables)[0];
    expect(loose?.suppressed_cells).toBe(0);
    expect(strict?.suppressed_cells).toBeGreaterThan(0);
  });
});

describe("tables by kind, region and period", () => {
  const reports = [
    ...many(12, "parking", "bay_misused", "test-a"),
    ...many(8, "parking", "bay_blocked", "test-a"),
    ...many(7, "parking", "bay_misused", "test-b"),
    ...many(6, "parking", "bay_blocked", "test-b"),
    ...many(9, "parking", "bay_misused", "test-a", "2026-11"),
    ...many(6, "barrier", "blocked_curb_cut", "test-c"),
    ...many(4, "housing_wait", "unknown", "test-c"),
  ];
  const { tables } = buildProtectedTables(reports, indexOf(FLAT), month);

  it("makes one table per kind and period, in a fixed order", () => {
    expect(tables.map((t) => `${t.id}:${t.state}`)).toEqual(["barrier:2026-10:published", "parking:2026-10:published", "parking:2026-11:published", "housing_wait:2026-10:withheld"]);
  });

  it("counts correctly and gives totals that add up", () => {
    const table = publishedOnly(tables).find((t) => t.id === "parking:2026-10");
    expect(table?.topics).toEqual(TOPICS.parking);
    expect(table?.rows.map((r) => [r.region_code, r.total])).toEqual([["test-a", 20], ["test-b", 13]]);
    expect(view(table as PublishedTable)).toEqual([[12, 8, 0, 0, 0], [7, 6, 0, 0, 0]]);
    expect(table?.column_totals).toEqual([19, 14, 0, 0, 0]);
    expect(table?.total).toBe(33);
  });

  it("withholds a table with fewer reports than the minimum, with no cell and no total", () => {
    const withheld = tables.find((t) => t.state === "withheld");
    expect(withheld).toEqual({ id: "housing_wait:2026-10", state: "withheld", kind: "housing_wait", period: "2026-10" });
  });

  it("does not depend on the order of the reports", () => {
    const shuffled = [...reports].reverse();
    expect(buildProtectedTables(shuffled, indexOf(FLAT), month).tables).toEqual(tables);
  });

  it("groups months into quarters or years on request", () => {
    const quarter = buildProtectedTables(reports, indexOf(FLAT), { minimumCellSize: 5, grain: "quarter" }).tables;
    expect(quarter.map((t) => t.id)).toEqual(["barrier:2026-Q4", "parking:2026-Q4", "housing_wait:2026-Q4"]);
    expect(publishedOnly(quarter).find((t) => t.kind === "parking")?.total).toBe(42);
  });
});

describe("small-community roll-up", () => {
  const regions = [
    region("big", null, "large"),
    region("big-1", "big", "large"),
    region("big-2", "big", "large"),
    region("mixed", null, "large"),
    region("mixed-1", "mixed", "large"),
    region("mixed-tiny", "mixed", "small"),
    region("mixed-unsized", "mixed", "unknown"),
  ];
  const index = indexOf(regions);

  it("never shows a small or unknown-size region as its own row, however many reports it has", () => {
    const reports = [...many(50, "parking", "bay_misused", "mixed-tiny"), ...many(30, "parking", "bay_misused", "mixed-unsized"), ...many(20, "parking", "bay_misused", "mixed-1"), ...many(10, "parking", "bay_misused", "big-1"), ...many(10, "parking", "bay_misused", "big-2")];
    const table = publishedOnly(buildProtectedTables(reports, index, month).tables)[0];
    expect(table?.rows.map((r) => [r.region_code, r.total])).toEqual([["big-1", 10], ["big-2", 10], ["mixed", 100]]);
    expect(table?.rolled_up_rows).toEqual(["mixed"]);
  });

  it("rolls the larger region up whether or not the small community sent any report", () => {
    const without = [...many(20, "parking", "bay_misused", "mixed-1"), ...many(10, "parking", "bay_misused", "big-1")];
    const withOne = [...without, ...many(1, "parking", "bay_misused", "mixed-tiny")];
    const rows = (reports: AdvocacyReport[]) => publishedOnly(buildProtectedTables(reports, index, month).tables)[0]?.rows.map((r) => r.region_code);
    expect(rows(without)).toEqual(["big-1", "mixed"]);
    expect(rows(withOne)).toEqual(["big-1", "mixed"]);
  });

  it("rolls a row with too few reports into its larger region, together with its siblings", () => {
    const reports = [...many(2, "parking", "bay_misused", "big-1"), ...many(30, "parking", "bay_misused", "big-2"), ...many(20, "parking", "bay_misused", "mixed-1")];
    const result = buildProtectedTables(reports, index, month);
    const table = publishedOnly(result.tables)[0];
    expect(table?.rows.map((r) => [r.region_code, r.total])).toEqual([["big", 32], ["mixed", 20]]);
    expect(result.diagnostics[0]?.dataRollUps).toEqual(["big"]);
  });

  it("shows all regions as one row when no larger region is left", () => {
    const reports = [...many(2, "parking", "bay_misused", "big"), ...many(30, "parking", "bay_misused", "mixed-1")];
    const table = publishedOnly(buildProtectedTables(reports, index, month).tables)[0];
    expect(table?.rows.map((r) => [r.region_code, r.total])).toEqual([[ALL_REGIONS, 32]]);
  });

  it("keeps an unknown region as Unknown when it has enough reports, and folds it in when it has not", () => {
    const base = many(30, "parking", "bay_misused", "big-1");
    const enough = publishedOnly(buildProtectedTables([...base, ...many(6, "parking", "bay_misused", "UNKNOWN")], index, month).tables)[0];
    expect(enough?.rows.map((r) => r.region_code)).toEqual(["UNKNOWN", "big-1"]);
    const few = publishedOnly(buildProtectedTables([...base, ...many(2, "parking", "bay_misused", "UNKNOWN")], index, month).tables)[0];
    expect(few?.rows.map((r) => r.region_code)).toEqual([ALL_REGIONS]);
  });

  it("finds the row for a region from the table alone", () => {
    expect(rowFor("mixed-tiny", index, index.staticRollUps)).toBe("mixed");
    expect(rowFor("big-1", index, index.staticRollUps)).toBe("big-1");
    expect(rowFor("big-1", index, new Set([ALL_REGIONS]))).toBe(ALL_REGIONS);
  });

  it("refuses a region table with duplicates, missing parents or loops", () => {
    expect(indexRegions([region("x-1"), region("x-1")])).toMatchObject({ ok: false, issue: "duplicate_code" });
    expect(indexRegions([region("x-1", "nowhere")])).toMatchObject({ ok: false, issue: "unknown_parent" });
    expect(indexRegions([region("x-1", "x-2"), region("x-2", "x-1")])).toMatchObject({ ok: false, issue: "parent_loop" });
  });
});

describe("topic combining", () => {
  const index = indexOf(FLAT);

  it("folds a small topic, the empty topics and the smallest remaining topic into one column", () => {
    const reports = [...many(20, "parking", "bay_misused", "test-a"), ...many(9, "parking", "bay_blocked", "test-a"), ...many(3, "parking", "other", "test-a"), ...many(12, "parking", "bay_misused", "test-b"), ...many(8, "parking", "bay_blocked", "test-b")];
    const table = publishedOnly(buildProtectedTables(reports, index, month).tables)[0];
    expect(table?.topics).toEqual(["bay_misused", COMBINED_TOPIC]);
    expect(table?.combined_topics).toEqual(["bay_blocked", "no_bay_available", "other", "unknown"]);
    expect(table?.column_totals).toEqual([32, 20]);
  });

  it("leaves topics alone when none is small", () => {
    const reports = [...many(20, "parking", "bay_misused", "test-a"), ...many(9, "parking", "bay_blocked", "test-a")];
    const table = publishedOnly(buildProtectedTables(reports, index, month).tables)[0];
    expect(table?.combined_topics).toEqual([]);
    expect(table?.topics).toEqual(TOPICS.parking);
  });

  it("withholds the table when every topic sits just under the minimum, because the total would give each one away", () => {
    const reports = TOPICS.housing_wait.flatMap((topic) => many(4, "housing_wait", topic, "test-a"));
    expect(buildProtectedTables(reports, index, month).tables[0]?.state).toBe("withheld");
  });
});

describe("property: nothing below the minimum can be read or derived from any table", () => {
  const BANDS: PopulationBand[] = ["small", "medium", "large", "large", "unknown"];

  function scenario(next: () => number): { regions: Region[]; reports: AdvocacyReport[]; truth: Map<string, number> } {
    const regions: Region[] = [];
    const leaves: string[] = [];
    const tops = 1 + Math.floor(next() * 2);
    for (let t = 0; t < tops; t += 1) {
      const top = `top-${t}`;
      regions.push(region(top, null, next() < 0.15 ? "small" : "large"));
      const children = Math.floor(next() * 3);
      if (children === 0 || next() < 0.2) leaves.push(top);
      for (let c = 0; c < children; c += 1) {
        const code = `${top}-sub-${c}`;
        regions.push(region(code, top, BANDS[Math.floor(next() * BANDS.length)] ?? "large"));
        leaves.push(code);
      }
    }
    if (next() < 0.3) leaves.push("UNKNOWN");
    const reports: AdvocacyReport[] = [];
    const truth = new Map<string, number>();
    for (const period of ["2026-09", "2026-10"]) {
      for (const leaf of leaves) {
        for (const topic of TOPICS.housing_wait) {
          const roll = next();
          const n = roll < 0.35 ? 0 : roll < 0.7 ? 1 + Math.floor(next() * 4) : 5 + Math.floor(next() * 5);
          if (n === 0) continue;
          reports.push(...many(n, "housing_wait", topic, leaf, period));
          truth.set(`${period}|${leaf}|${topic}`, n);
        }
      }
    }
    return { regions, reports, truth };
  }

  for (const k of [3, 5]) {
    it(`holds across 120 random region trees and report sets with a minimum of ${k}`, { timeout: 120_000 }, () => {
      const next = seeded(4242 + k);
      let tablesSeen = 0;
      let hiddenSeen = 0;
      for (let round = 0; round < 120; round += 1) {
        const { regions, reports, truth } = scenario(next);
        if (reports.length === 0) continue;
        const index = indexOf(regions);
        const bandOf = new Map(regions.map((r) => [r.code, r.population_band]));
        const { tables, diagnostics } = buildProtectedTables(reports, index, { minimumCellSize: k, grain: "month" });

        for (const table of tables) {
          const mine = reports.filter((r) => periodKey(r.period, "month") === table.period);
          expect(isCoarsePeriod(table.period)).toBe(true);
          if (table.state === "withheld") {
            // A withheld table shows nothing but its identity.
            expect(Object.keys(table).sort()).toEqual(["id", "kind", "period", "state"]);
            continue;
          }
          tablesSeen += 1;

          // 1. Every number in the table is zero or at least k.
          const numbers = [table.total, ...table.column_totals, ...table.rows.map((r) => r.total), ...view(table).flat().filter((n): n is number => n !== null)];
          for (const n of numbers) expect(n === 0 || n >= k).toBe(true);

          // 2. Rows are regions from the table, never a small or unknown-size one.
          for (const row of table.rows) {
            if (row.region_code === ALL_REGIONS || row.region_code === "UNKNOWN") continue;
            expect(bandOf.has(row.region_code)).toBe(true);
            expect(["medium", "large"]).toContain(bandOf.get(row.region_code));
          }

          // 3. Published numbers are true: totals add up and match the reports.
          expect(table.total).toBe(mine.length);
          expect(table.rows.reduce((sum, r) => sum + r.total, 0)).toBe(table.total);
          expect(table.column_totals.reduce((a, b) => a + b, 0)).toBe(table.total);

          // 4. The independent reader cannot recover a withheld cell from cells and totals.
          const ranges = attackerRanges(view(table), table.rows.map((r) => r.total), table.column_totals);
          hiddenSeen += ranges.length;
          expect(ranges).toHaveLength(table.suppressed_cells);
          for (const range of ranges) expect(range.max - range.min).toBeGreaterThanOrEqual(k);

          // 5. No count below k for an original region and topic appears as a published cell
          //    under that same region and topic.
          for (const [key, n] of truth) {
            const [period, leaf, topic] = key.split("|");
            if (period !== table.period || n >= k) continue;
            const row = table.rows.findIndex((r) => r.region_code === leaf);
            const col = table.topics.indexOf(topic ?? "");
            if (row >= 0 && col >= 0 && table.rows[row]?.total === mine.filter((r) => r.region_code === leaf).length) {
              expect(view(table)[row]?.[col]).toBeNull();
            }
          }
        }
        // The split of primary and complementary suppression stays out of the tables.
        expect(JSON.stringify(tables)).not.toMatch(/primary|complementary/);
        expect(diagnostics).toHaveLength(tables.length);
      }
      expect(tablesSeen).toBeGreaterThan(100);
      expect(hiddenSeen).toBeGreaterThan(100);
    });
  }
});
