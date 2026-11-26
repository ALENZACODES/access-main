import type { Locator } from "@playwright/test";
import { parseCsv, undoFormulaGuard } from "../../../src/states/csvParse.ts";
import type { Language } from "./browser.ts";

// These wire names are consumed by spreadsheets in either language. Keep the
// oracle independent of the writer so an accidental header rename is caught.
const columns = [
  "place_id", "place_name", "kind", "address", "latitude", "longitude",
  "wheelchair_tag", "tag_status", "tag_unknown_reason", "source", "licence",
  "retrieved_on", "tier", "source_url",
] as const;
type Column = (typeof columns)[number];
export type ShortlistRecord = Readonly<Record<Column, string>>;

export function readComparisonCsv(source: string): readonly ShortlistRecord[] {
  const parsed = parseCsv(source);
  if (!parsed.ok) throw new Error(`Unreadable shortlist CSV (${parsed.error})`);
  const [header, ...body] = parsed.rows;
  if (!header || header.length !== columns.length || header.some((value, i) => value !== columns[i])) {
    throw new Error(`Unexpected shortlist CSV header ${header?.join(",") ?? "(empty)"}`);
  }
  const ids = new Set<string>();
  return body.map((cells, i) => {
    const at = `Shortlist CSV row ${i + 2}`;
    if (cells.length !== columns.length) throw new Error(`${at} has ${cells.length} fields`);
    const entries = columns.map((column, c) => {
      const raw = cells[c]!;
      if (/^[=+\-@\t\r]/.test(raw)) throw new Error(`${at} has an unguarded ${column}`);
      return [column, undoFormulaGuard(raw)] as const;
    });
    const record = Object.fromEntries(entries) as Record<Column, string>;
    if (!record.place_id.trim()) throw new Error(`${at} has no place_id`);
    if (ids.has(record.place_id)) throw new Error(`${at} repeats ${record.place_id}`);
    ids.add(record.place_id);
    return record;
  });
}

export interface VisibleComparison {
  readonly caption: string;
  readonly headers: readonly string[];
  readonly rows: readonly {
    name: string;
    values: readonly string[];
    removeLabel: string;
  }[];
}

/** Read the actual header associations. A matching text string elsewhere in the
 * panel cannot stand in for the corresponding row or column header. */
export async function readComparisonTable(table: Locator): Promise<VisibleComparison> {
  return table.evaluate((element) => {
    if (!(element instanceof HTMLTableElement)) throw new Error("Expected a comparison table");
    const caption = element.caption?.textContent?.trim();
    if (!caption) throw new Error("The comparison has no caption");
    const heading = element.tHead?.rows[0];
    if (!heading) throw new Error("Missing comparison headers");
    const headers = [...heading.cells].map((cell) => {
      if (cell.tagName !== "TH" || cell.scope !== "col") throw new Error("Missing column header association");
      return cell.textContent?.trim() ?? "";
    });
    if (new Set(headers).size !== headers.length || headers.includes("")) throw new Error("Ambiguous comparison headers");
    const body = element.tBodies[0];
    if (!body) throw new Error("Missing comparison body");
    const rows = [...body.rows].map((row) => {
      const [rowHeader, ...data] = [...row.cells];
      if (!rowHeader || rowHeader.tagName !== "TH" || rowHeader.scope !== "row") {
        throw new Error("Missing comparison row header");
      }
      if (row.cells.length !== headers.length || data.some((cell) => cell.tagName !== "TD")) {
        throw new Error("Comparison row does not match its column headers");
      }
      const action = data.pop()?.querySelector("button");
      const removeLabel = action?.getAttribute("aria-label");
      if (!removeLabel) throw new Error("Missing named removal action in the last column");
      return {
        name: rowHeader.textContent?.trim() ?? "",
        values: data.map((cell) => cell.textContent?.trim() ?? ""),
        removeLabel,
      };
    });
    return { caption, headers, rows };
  });
}

/** UI labels change language. The exported fields remain machine-readable,
 * including UNKNOWN, the raw tier, and the original retrieval date. */
export function comparisonDifferences(
  table: VisibleComparison,
  records: readonly ShortlistRecord[],
  tableIds: readonly string[],
  language: Language,
): string[] {
  const problems: string[] = [];
  if (table.rows.length !== tableIds.length) problems.push(`Expected ${tableIds.length} comparison rows, saw ${table.rows.length}`);
  const byId = new Map(records.map((record) => [record.place_id, record]));
  for (const record of records) {
    if (!tableIds.includes(record.place_id)) problems.push(`Table is missing exported place ${record.place_id}`);
  }
  for (const [i, id] of tableIds.entries()) {
    const record = byId.get(id);
    if (!record) {
      problems.push(`CSV is missing ${id}`);
      continue;
    }
    const row = table.rows[i];
    if (!row) continue;
    const check = (field: string, visible: string | undefined, expected: string) => {
      if (visible !== expected) problems.push(`${id} ${field}: expected ${JSON.stringify(expected)}, saw ${JSON.stringify(visible)}`);
    };
    check("name", row.name, record.place_name);
    check("kind", row.values[1], record.kind);
    check("address", row.values[2], record.address);
    check("tier", row.values[3], `${language === "en" ? "Tier" : "Niveau"} ${record.tier}`);
    check("source", row.values[5], record.source);
    check("licence", row.values[6], record.licence);
    if (record.retrieved_on === "UNKNOWN") check("retrieved date", row.values[4], "UNKNOWN");
    const remove = language === "en" ? `Remove ${record.place_name} from the list` : `Retirer ${record.place_name} de la liste`;
    // Accessible names collapse the narrow spaces used for French punctuation.
    // Raw CSV values and table cells above are still compared byte for byte.
    const displaySpaces = (value: string) => value.replace(/[\u00a0\u202f]/g, " ");
    check("remove action", displaySpaces(row.removeLabel), displaySpaces(remove));
  }
  return problems;
}
