import { describe, expect, it } from "vitest";
import { exposedCells, feasibleSlack, suppressTable } from "./disclosure.ts";
import { attackerRanges, seeded } from "./test-helpers.ts";

const rowTotals = (m: number[][]) => m.map((line) => line.reduce((a, b) => a + b, 0));
const colTotals = (m: number[][]) => (m[0] ?? []).map((_, c) => m.reduce((sum, line) => sum + (line[c] ?? 0), 0));
const publishedView = (m: number[][], mask: boolean[][]) => m.map((line, r) => line.map((n, c) => (mask[r]?.[c] ? null : n)));

/** A random table in which every row total and every non-zero column total is at least `k`. */
function randomTable(next: () => number, k: number): number[][] {
  for (;;) {
    const rows = 1 + Math.floor(next() * 4);
    const cols = 1 + Math.floor(next() * 4);
    const table = Array.from({ length: rows }, () =>
      Array.from({ length: cols }, () => (next() < 0.25 ? 0 : next() < 0.5 ? 1 + Math.floor(next() * (k - 1)) : k + Math.floor(next() * 6))),
    );
    if (rowTotals(table).every((n) => n >= k) && colTotals(table).every((n) => n === 0 || n >= k)) return table;
  }
}

describe("primary suppression", () => {
  it("withholds every count from 1 to minimum - 1 and nothing else when no total gives it away", () => {
    const table = [
      [2, 3, 10],
      [3, 2, 10],
      [10, 10, 10],
    ];
    const mask = suppressTable(table, 5);
    expect(mask.primary).toBe(4);
    expect(mask.complementary).toBe(0);
    expect(mask.suppressed).toEqual([
      [true, true, false],
      [true, true, false],
      [false, false, false],
    ]);
  });

  it("publishes zeros and counts at the minimum", () => {
    const mask = suppressTable(
      [
        [0, 5, 9],
        [7, 0, 5],
      ],
      5,
    );
    expect(mask.suppressed.flat()).not.toContain(true);
  });
});

describe("complementary suppression", () => {
  it("withholds more cells when one withheld cell could be recovered by subtraction", () => {
    const table = [
      [2, 10, 10],
      [10, 10, 10],
      [10, 10, 10],
    ];
    const mask = suppressTable(table, 5);
    expect(mask.primary).toBe(1);
    expect(mask.complementary).toBeGreaterThanOrEqual(3);
    expect(exposedCells(table, mask.suppressed, 5)).toEqual([]);
    for (const range of attackerRanges(publishedView(table, mask.suppressed), rowTotals(table), colTotals(table))) {
      expect(range.max - range.min).toBeGreaterThanOrEqual(5);
    }
  });

  it("sees that two withheld cells in each line are not enough when zeros pin them", () => {
    // Each row and column holds two withheld cells, but each pair sums to 2, so a reader knows
    // every one of them is 0, 1 or 2. That range is narrower than the minimum cell size.
    const table = [
      [1, 1, 20],
      [1, 1, 20],
      [20, 20, 20],
    ];
    const naive = table.map((line) => line.map((n) => n > 0 && n < 5));
    expect(exposedCells(table, naive, 5)).toHaveLength(4);
    const mask = suppressTable(table, 5);
    expect(exposedCells(table, mask.suppressed, 5)).toEqual([]);
  });

  it("leaves a column whose total is zero alone", () => {
    const table = [
      [1, 0, 9, 9],
      [9, 0, 9, 9],
    ];
    const mask = suppressTable(table, 5);
    expect(mask.suppressed.map((line) => line[1])).toEqual([false, false]);
  });

  it("measures how far a withheld cell can move", () => {
    const table = [
      [2, 8],
      [7, 3],
    ];
    const all = [
      [true, true],
      [true, true],
    ];
    expect(feasibleSlack(table, all, 0, 0, 100)).toEqual({ up: 7, down: 2 });
    const alone = [
      [true, false],
      [false, false],
    ];
    expect(feasibleSlack(table, alone, 0, 0, 100)).toEqual({ up: 0, down: 0 });
  });

  it("throws when a table cannot be protected, so it cannot be published by mistake", () => {
    // The only row total is below the minimum: the caller should never pass this in.
    expect(() => suppressTable([[1, 2]], 5)).toThrow(/cannot be protected/);
  });
});

describe("property: no withheld cell can be derived from the published cells and totals", () => {
  for (const k of [3, 5]) {
    it(`holds for 150 random tables with a minimum cell size of ${k}`, { timeout: 120_000 }, () => {
      const next = seeded(k * 1000 + 17);
      let withheld = 0;
      for (let round = 0; round < 150; round += 1) {
        const table = randomTable(next, k);
        const mask = suppressTable(table, k);
        const view = publishedView(table, mask.suppressed);

        // Nothing published lies between 1 and k - 1.
        for (const n of [...view.flat(), ...rowTotals(table), ...colTotals(table)]) {
          if (n !== null) expect(n === 0 || n >= k).toBe(true);
        }
        // Every count between 1 and k - 1 is withheld.
        table.forEach((line, r) => line.forEach((n, c) => n > 0 && n < k && expect(mask.suppressed[r]?.[c]).toBe(true)));

        // The independent reader cannot pin any withheld cell, or narrow it to fewer than k values apart.
        const ranges = attackerRanges(view, rowTotals(table), colTotals(table));
        withheld += ranges.length;
        for (const range of ranges) {
          const truth = table[range.row]?.[range.col] ?? -1;
          expect(range.min).toBeLessThanOrEqual(truth);
          expect(range.max).toBeGreaterThanOrEqual(truth);
          expect(range.max - range.min).toBeGreaterThanOrEqual(k);
        }
      }
      expect(withheld).toBeGreaterThan(150);
    });
  }

  it("agrees with the independent reader on the exact range of every withheld cell", { timeout: 120_000 }, () => {
    const next = seeded(99);
    for (let round = 0; round < 150; round += 1) {
      const table = randomTable(next, 4);
      const mask = suppressTable(table, 4);
      for (const range of attackerRanges(publishedView(table, mask.suppressed), rowTotals(table), colTotals(table))) {
        const truth = table[range.row]?.[range.col] ?? 0;
        const slack = feasibleSlack(table, mask.suppressed, range.row, range.col, 1000);
        expect({ min: truth - slack.down, max: truth + slack.up }).toEqual({ min: range.min, max: range.max });
      }
    }
  });
});
