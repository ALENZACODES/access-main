/**
 * From reports to protected tables. One table per report kind and period: rows are regions,
 * columns are topics, with row totals, column totals and a table total.
 *
 * Order of protection for each table:
 *   1. A table whose total is below the minimum cell size is withheld whole.
 *   2. Regions are rolled up (regions.ts), and any row whose total is still below the minimum
 *      pulls its whole parent region into one row, until every row total is at least the minimum.
 *   3. Topics whose total is below the minimum are folded into one combined column, together
 *      with every zero topic and the smallest remaining topic, so the combined total says
 *      little about any one of them.
 *   4. Cells are suppressed (disclosure.ts).
 * After steps 1 to 3 no row total, column total or table total lies between 1 and minimum - 1.
 */
import { periodKey } from "./coarsen.ts";
import { suppressTable } from "./disclosure.ts";
import { rowFor, type RegionIndex } from "./regions.ts";
import {
  ALL_REGIONS,
  COMBINED_TOPIC,
  REPORT_KINDS,
  TOPICS,
  UNKNOWN,
  type AdvocacyReport,
  type PeriodGrain,
  type ProtectedTable,
  type PublishedTable,
  type ReportKind,
} from "./types.ts";

/** A minimum below 3 would let a count of 2 through. It is refused. */
export const MIN_CELL_SIZE_FLOOR = 3;
export const DEFAULT_MIN_CELL_SIZE = 5;

export interface TableOptions {
  minimumCellSize: number;
  grain: PeriodGrain;
}

export function checkMinimumCellSize(value: number): number {
  if (!Number.isInteger(value) || value < MIN_CELL_SIZE_FLOOR) {
    throw new RangeError(`minimum cell size must be an integer of at least ${MIN_CELL_SIZE_FLOOR}`);
  }
  return value;
}

/** In-memory detail about one table. It holds the split of suppressions and must not be exported. */
export interface TableDiagnostics {
  id: string;
  primary: number;
  complementary: number;
  /** Rolled up because a row total was below the minimum, as opposed to the region table alone. */
  dataRollUps: string[];
}

export interface ProtectedTables {
  tables: ProtectedTable[];
  diagnostics: TableDiagnostics[];
}

/** UNKNOWN and ALL sort after region codes, which are lower case. */
function compareCodes(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function sumBy<K>(entries: Iterable<[K, number]>): Map<K, number> {
  const out = new Map<K, number>();
  for (const [key, n] of entries) out.set(key, (out.get(key) ?? 0) + n);
  return out;
}

function protectOne(
  kind: ReportKind,
  period: string,
  reports: readonly AdvocacyReport[],
  index: RegionIndex,
  minimum: number,
): { table: ProtectedTable; diagnostics: TableDiagnostics } {
  const id = `${kind}:${period}`;
  const withheld = (): { table: ProtectedTable; diagnostics: TableDiagnostics } => ({
    table: { id, state: "withheld", kind, period },
    diagnostics: { id, primary: 0, complementary: 0, dataRollUps: [] },
  });
  if (reports.length < minimum) return withheld();

  // Rows.
  const rollUps = new Set(index.staticRollUps);
  const dataRollUps: string[] = [];
  let rowTotals = new Map<string, number>();
  for (;;) {
    rowTotals = sumBy(reports.map((r) => [rowFor(r.region_code, index, rollUps), 1] as [string, number]));
    const small = [...rowTotals].filter(([code, n]) => code !== ALL_REGIONS && n < minimum).map(([code]) => code);
    if (small.length === 0) break;
    for (const code of small.sort(compareCodes)) {
      const parent = index.parentOf(code);
      if (!rollUps.has(parent)) {
        rollUps.add(parent);
        dataRollUps.push(parent);
      }
    }
  }
  const rowCodes = [...rowTotals.keys()].sort(compareCodes);

  // Columns.
  const vocabulary: readonly string[] = TOPICS[kind];
  const topicTotals = sumBy(reports.map((r) => [r.topic, 1] as [string, number]));
  const totalOf = (topic: string) => topicTotals.get(topic) ?? 0;
  let folded: string[] = [];
  if (vocabulary.some((topic) => totalOf(topic) > 0 && totalOf(topic) < minimum)) {
    folded = vocabulary.filter((topic) => totalOf(topic) < minimum);
    const kept = vocabulary.filter((topic) => totalOf(topic) >= minimum);
    const absorbed = kept.reduce<string | null>((best, topic) => (best === null || totalOf(topic) < totalOf(best) ? topic : best), null);
    if (absorbed !== null) {
      folded = vocabulary.filter((topic) => folded.includes(topic) || topic === absorbed);
    } else {
      // Every topic is below the minimum. If each one sat at minimum - 1, the total would give them all away.
      if (reports.length === folded.length * (minimum - 1)) return withheld();
    }
  }
  const columns = [...vocabulary.filter((topic) => !folded.includes(topic)), ...(folded.length > 0 ? [COMBINED_TOPIC] : [])];
  const columnOf = (topic: string) => (folded.includes(topic) ? COMBINED_TOPIC : topic);

  // Cells.
  const counts = rowCodes.map(() => columns.map(() => 0));
  for (const report of reports) {
    const line = counts[rowCodes.indexOf(rowFor(report.region_code, index, rollUps))];
    const c = columns.indexOf(columnOf(report.topic));
    if (line && c >= 0) line[c] = (line[c] ?? 0) + 1;
  }
  const mask = suppressTable(counts, minimum);

  const table: PublishedTable = {
    id,
    state: "published",
    kind,
    period,
    topics: columns,
    combined_topics: folded,
    rolled_up_rows: rowCodes.filter((code) => code === ALL_REGIONS || rollUps.has(code)),
    rows: rowCodes.map((code, r) => ({
      region_code: code,
      cells: columns.map((_, c) => (mask.suppressed[r]?.[c] ? { state: "suppressed" } : { state: "published", count: counts[r]?.[c] ?? 0 })),
      total: rowTotals.get(code) ?? 0,
    })),
    column_totals: columns.map((_, c) => counts.reduce((sum, line) => sum + (line[c] ?? 0), 0)),
    total: reports.length,
    suppressed_cells: mask.primary + mask.complementary,
  };
  return { table, diagnostics: { id, primary: mask.primary, complementary: mask.complementary, dataRollUps } };
}

/**
 * Build every table. Reports must already be validated and consent-checked; region codes must be
 * in the index or "UNKNOWN". The result does not depend on the order of the reports.
 */
export function buildProtectedTables(reports: readonly AdvocacyReport[], index: RegionIndex, options: TableOptions): ProtectedTables {
  const minimum = checkMinimumCellSize(options.minimumCellSize);
  const groups = new Map<string, AdvocacyReport[]>();
  for (const report of reports) {
    const key = `${report.kind}:${periodKey(report.period, options.grain)}`;
    const list = groups.get(key);
    if (list) list.push(report);
    else groups.set(key, [report]);
  }
  const out: ProtectedTables = { tables: [], diagnostics: [] };
  for (const kind of REPORT_KINDS) {
    const periods = [...groups.keys()].filter((key) => key.startsWith(`${kind}:`)).map((key) => key.slice(kind.length + 1));
    for (const period of periods.sort((a, b) => (a === UNKNOWN ? 1 : b === UNKNOWN ? -1 : compareCodes(a, b)))) {
      const { table, diagnostics } = protectOne(kind, period, groups.get(`${kind}:${period}`) ?? [], index, minimum);
      out.tables.push(table);
      out.diagnostics.push(diagnostics);
    }
  }
  return out;
}
