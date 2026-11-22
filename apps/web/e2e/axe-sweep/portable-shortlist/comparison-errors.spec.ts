import { expect, test } from "@playwright/test";
import { comparisonDifferences, readComparisonCsv, type VisibleComparison } from "./comparison.ts";

const header = 'place_id,place_name,kind,address,latitude,longitude,wheelchair_tag,tag_status,tag_unknown_reason,source,licence,retrieved_on,tier,source_url';
const row = 'entry,"Hall, East",studio,"12, rue B",43.1,\'-79.2,limited,reported,,City,ODbL-1.0,2026-03-01,1,https://example.org/a';

function documentWith(...rows: string[]) {
  return [header, ...rows, ""].join("\r\n");
}

test("the CSV reader distinguishes a truncated row from a valid empty source URL", () => {
  const withoutUrl = row.slice(0, row.lastIndexOf(",") + 1);
  expect(readComparisonCsv(documentWith(withoutUrl))[0]?.source_url).toBe("");
  expect(() => readComparisonCsv(documentWith(withoutUrl.slice(0, -1)))).toThrow(/13 fields/);
  expect(() => readComparisonCsv(documentWith(row + ","))).toThrow(/15 fields/);
  expect(readComparisonCsv(documentWith())).toEqual([]);
});

test("format damage and localised wire headers produce a diagnostic before comparing place names", () => {
  expect(() => readComparisonCsv(documentWith(row).replace("place_name", "lieu"))).toThrow(/header/);
  expect(() => readComparisonCsv(documentWith(row).replace("place_name", "place_id"))).toThrow(/header/);
  expect(() => readComparisonCsv(documentWith('entry,"Hall'))).toThrow(/unterminated-quote/);
  expect(() => readComparisonCsv(documentWith(row.replace("entry", "")))).toThrow(/no place_id/);
  expect(() => readComparisonCsv(documentWith(row, row))).toThrow(/row 3 repeats entry/);
});

test("CSV formula diagnosis names the offending row and the specific wire field", () => {
  const plusAddress = row.replace('"12, rue B"', '"+45, rue A"');
  expect(() => readComparisonCsv(documentWith(plusAddress))).toThrow(/row 2 has an unguarded address/);
  expect(() => readComparisonCsv(documentWith(row.replace("'-79.2", "-79.2")))).toThrow(/unguarded longitude/);
  const guarded = plusAddress.replace('"+45', `"'+45`);
  expect(readComparisonCsv(documentWith(guarded))[0]?.address).toBe("+45, rue A");
  expect(readComparisonCsv(documentWith(row))[0]?.longitude).toBe("-79.2");
});

test("comparison diagnostics separate a lost identity, renamed place and transplanted provenance", () => {
  const records = readComparisonCsv(documentWith(row));
  const table: VisibleComparison = {
    caption: "One place",
    headers: [],
    rows: [{
      name: "West Hall",
      values: ["Limited", "studio", "12, rue B", "Tier 1", "Retrieved today", "Another publisher", "ODbL-1.0", "Today"],
      removeLabel: "Remove Hall, East from the list",
    }],
  };
  const problems = comparisonDifferences(table, records, ["entry"], "en");
  expect(problems).toHaveLength(2);
  expect(problems[0]).toContain("entry name");
  expect(problems[1]).toContain("entry source");
  expect(comparisonDifferences(table, records, ["lost"], "en")).toEqual([
    "Table is missing exported place entry",
    "CSV is missing lost",
  ]);
});
