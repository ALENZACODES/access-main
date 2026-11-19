import {
  CONSENT_ENTRY_SCHEMA_VERSION,
  INPUT_SET_SCHEMA_VERSION,
  REGION_SCHEMA_VERSION,
  REPORT_SCHEMA_VERSION,
  type AdvocacyReport,
  type ConsentEntry,
  type InputSet,
  type PopulationBand,
  type Region,
  type ReportKind,
  type RequiredPurpose,
} from "./types.ts";

export const TEST_PURPOSE: RequiredPurpose = { purpose_id: "example-advocacy-evidence", purpose_version: 1 };

export function region(code: string, parent: string | null = null, band: PopulationBand = "large"): Region {
  return { record_type: "advocacy_region", schema_version: REGION_SCHEMA_VERSION, code, parent, population_band: band, example: true };
}

export function inputSet(overrides: Partial<InputSet> = {}): InputSet {
  return {
    record_type: "advocacy_input_set",
    schema_version: INPUT_SET_SCHEMA_VERSION,
    id: "example-set",
    example: true,
    source_name: "Test data",
    source_url: null,
    licence: "not-a-real-dataset",
    source_date: "2026-11-01",
    tier: 0,
    label: "PROTOTYPE-UNVERIFIED",
    ...overrides,
  };
}

export function report(overrides: Partial<AdvocacyReport> = {}): AdvocacyReport {
  return {
    record_type: "advocacy_report",
    schema_version: REPORT_SCHEMA_VERSION,
    id: "example-r-0",
    example: true,
    kind: "parking",
    topic: "bay_misused",
    region_code: "test-a",
    period: "2026-10",
    set_id: "example-set",
    consent_ref: "example-c-0",
    ...overrides,
  };
}

export function grant(ref: string, overrides: Partial<ConsentEntry> = {}): ConsentEntry {
  return {
    record_type: "advocacy_consent_entry",
    schema_version: CONSENT_ENTRY_SCHEMA_VERSION,
    ref,
    purpose_id: TEST_PURPOSE.purpose_id,
    purpose_version: TEST_PURPOSE.purpose_version,
    status: "granted",
    ...overrides,
  };
}

let serial = 0;

/** `n` synthetic reports for one cell, each with its own id and consent reference. */
export function many(n: number, kind: ReportKind, topic: string, regionCode: string, period = "2026-10"): AdvocacyReport[] {
  return Array.from({ length: n }, () => {
    serial += 1;
    return report({ id: `example-r-${serial}`, consent_ref: `example-c-${serial}`, kind, topic, region_code: regionCode, period });
  });
}

export function grantsFor(reports: readonly AdvocacyReport[]): ConsentEntry[] {
  return reports.map((r) => grant(r.consent_ref));
}

/** Small seeded generator, so property-style tests are repeatable. */
export function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let x = state;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * An independent reader who tries to recover withheld cells. It knows the published cells, the
 * row and column totals, and that counts are whole and not negative. For each withheld cell it
 * tries every value and searches for any table that fits. It shares no code with the engine.
 */
export function attackerRanges(
  published: ReadonlyArray<ReadonlyArray<number | null>>,
  rowTotals: readonly number[],
  columnTotals: readonly number[],
): Array<{ row: number; col: number; min: number; max: number }> {
  const hidden: Array<{ row: number; col: number }> = [];
  const rowLeft = rowTotals.map((total, r) => total - (published[r] ?? []).reduce<number>((sum, n) => sum + (n ?? 0), 0));
  const colLeft = columnTotals.map((total, c) => total - published.reduce((sum, line) => sum + (line[c] ?? 0), 0));
  published.forEach((line, row) => line.forEach((n, col) => n === null && hidden.push({ row, col })));
  const lastInRow = (i: number) => !hidden.slice(i + 1).some((h) => h.row === hidden[i]?.row);
  const lastInCol = (i: number) => !hidden.slice(i + 1).some((h) => h.col === hidden[i]?.col);

  const search = (fixed: number, value: number): boolean => {
    const dead = new Set<string>();
    const fits = (i: number, rows: number[], cols: number[]): boolean => {
      const at = hidden[i];
      if (!at) return rows.every((n) => n === 0) && cols.every((n) => n === 0);
      const key = `${i}|${rows.join(",")}|${cols.join(",")}`;
      if (dead.has(key)) return false;
      const top = Math.min(rows[at.row] ?? 0, cols[at.col] ?? 0);
      const choices: number[] = [];
      if (i === fixed) choices.push(value);
      else for (let v = 0; v <= top; v += 1) choices.push(v);
      for (const v of choices) {
        if (v < 0 || v > top) continue;
        if (lastInRow(i) && v !== rows[at.row]) continue;
        if (lastInCol(i) && v !== cols[at.col]) continue;
        const nextRows = [...rows];
        const nextCols = [...cols];
        nextRows[at.row] = (nextRows[at.row] ?? 0) - v;
        nextCols[at.col] = (nextCols[at.col] ?? 0) - v;
        if (fits(i + 1, nextRows, nextCols)) return true;
      }
      dead.add(key);
      return false;
    };
    return fits(0, rowLeft, colLeft);
  };

  return hidden.map((at, i) => {
    const top = Math.min(rowLeft[at.row] ?? 0, colLeft[at.col] ?? 0);
    let min = 0;
    while (min <= top && !search(i, min)) min += 1;
    let max = top;
    while (max > min && !search(i, max)) max -= 1;
    return { row: at.row, col: at.col, min, max };
  });
}
