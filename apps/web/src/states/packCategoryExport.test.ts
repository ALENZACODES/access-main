import { describe, expect, it } from "vitest";
import contentText from "../../public/packs/toronto/content.json?raw";
import { containsForbiddenOrg } from "../../../../packages/shared/test/forbiddenOrg";
import { lintCopy } from "./copyLint";
import { KIND_CSV_FILENAMES, KIND_CSV_HEADER, KIND_TEXT_FILENAMES, kindsToCsv, kindsToText } from "./packCategoryExport";
import { buildKindRows } from "./packCategories";
import { parsePackPlaces } from "./packPlaces";
import { lintFrench } from "./typography";

const TODAY = "2026-11-19";
const OSM = "OpenStreetMap, Geofabrik Ontario extract";
const raw = (id: string, over: Record<string, unknown> = {}, prov: Record<string, unknown> | null = {}) => ({
  id,
  name: `Place ${id}`,
  category: "cafe",
  wheelchair: "yes",
  lat: 43.65,
  lon: -79.38,
  provenance: prov === null ? null : { source_name: OSM, licence: "ODbL-1.0", retrieved_at: "2026-11-10", tier: 0, ...prov },
  ...over,
});
const rowsOf = (items: unknown[]) => buildKindRows(parsePackPlaces(items).places, TODAY);
const shippedRows = rowsOf((JSON.parse(contentText) as { places: unknown[] }).places);
/** Split CSV text into rows of cells, understanding quotes. */
function csvRows(text: string): string[][] {
  const out: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const body = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < body.length; i += 1) {
    const ch = body[i]!;
    if (quoted) {
      if (ch === '"' && body[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\r" && body[i + 1] === "\n") {
      row.push(cell);
      out.push(row);
      row = [];
      cell = "";
      i += 1;
    } else cell += ch;
  }
  return out;
}

describe("kindsToCsv", () => {
  const rows = rowsOf([
    raw("a", { category: "fast_food", wheelchair: "yes" }),
    raw("b", { category: "fast_food", wheelchair: "no" }),
    raw("c", { category: "fast_food", wheelchair: "" }),
    raw("d", { category: null }),
  ]);
  it("starts with the fixed English header", () => {
    expect(csvRows(kindsToCsv(rows))[0]).toEqual([...KIND_CSV_HEADER]);
  });
  it("writes one row per kind with counts that match the table", () => {
    const parsed = csvRows(kindsToCsv(rows));
    expect(parsed).toHaveLength(3);
    expect(parsed[1]).toEqual(["fast food", "3", "1", "0", "1", "0", "1", "66", "3", "3", "0"]);
    expect(parsed[2]![0]).toBe("UNKNOWN");
    expect(parsed[2]![1]).toBe("1");
  });
  it("gives every row as many cells as the header has", () => {
    for (const row of csvRows(kindsToCsv(shippedRows))) expect(row).toHaveLength(KIND_CSV_HEADER.length);
  });
  it("uses CRLF line ends, ends with one, and adds a byte order mark only when asked", () => {
    const text = kindsToCsv(rows);
    expect(text.endsWith("\r\n")).toBe(true);
    expect(text.startsWith("﻿")).toBe(false);
    expect(kindsToCsv(rows, { bom: true }).startsWith("﻿")).toBe(true);
    expect(kindsToCsv(rows, { bom: true }).slice(1)).toBe(text);
    expect(text.split("\r\n").every((line) => !line.includes("\n"))).toBe(true);
  });
  it("writes only a header for no rows", () => {
    expect(kindsToCsv([])).toBe(`${KIND_CSV_HEADER.join(",")}\r\n`);
  });
  it("writes the token UNKNOWN, not a blank or 0, when a share cannot be worked out", () => {
    const [row] = rows;
    const empty = { ...row!, total: 0, reported: 0 };
    expect(csvRows(kindsToCsv([empty]))[1]![7]).toBe("UNKNOWN");
  });
  it("quotes a kind with a comma or quote and defuses a leading formula character", () => {
    const tricky = rowsOf([raw("a", { category: 'a,"b"' }), raw("b", { category: "=SUM(1)" }), raw("c", { category: "+x" })]);
    const text = kindsToCsv(tricky);
    const kinds = csvRows(text).slice(1).map((r) => r[0]);
    expect(kinds).toContain('a,"b"');
    expect(kinds).toContain("'=SUM(1)");
    expect(kinds).toContain("'+x");
    expect(text).not.toMatch(/(^|\r\n)=/);
  });
  it("is the same in both languages: the file does not depend on a locale", () => {
    expect(kindsToCsv(rows)).toBe(kindsToCsv(rows));
    expect(KIND_CSV_HEADER.every((h) => /^[a-z_]+$/.test(h))).toBe(true);
  });
  it("totals in the file equal the number of places in the pack", () => {
    const total = csvRows(kindsToCsv(shippedRows)).slice(1).reduce((n, r) => n + Number(r[1]), 0);
    expect(total).toBe(24);
  });
});

describe("file names", () => {
  it("are safe in both languages and differ by kind of file", () => {
    for (const name of [...Object.values(KIND_CSV_FILENAMES), ...Object.values(KIND_TEXT_FILENAMES)]) expect(name).toMatch(/^[a-z0-9-]+\.(csv|txt)$/);
    expect(KIND_CSV_FILENAMES.en).not.toBe(KIND_CSV_FILENAMES.fr);
    expect(KIND_TEXT_FILENAMES.en).not.toBe(KIND_TEXT_FILENAMES.fr);
  });
});

describe("kindsToText", () => {
  const rows = rowsOf([
    raw("a", { category: "fast_food", wheelchair: "yes" }),
    raw("b", { category: "fast_food", wheelchair: "limited" }, { retrieved_at: "2025-01-01" }),
    raw("c", { category: null, wheelchair: "" }),
  ]);
  it("names the pack, the date, the counts and the credit", () => {
    const text = kindsToText(rows, "en", TODAY);
    expect(text).toContain("Kinds of place in the saved pack");
    expect(text).toContain("Date: 2026-11-19");
    expect(text).toContain("3 places: 1 kind as tagged. 1 place has no kind (UNKNOWN).");
    expect(text).toContain("fast food — 2 places");
    expect(kindsToText(rowsOf([raw("a")]), "fr", TODAY)).toContain("cafe — 1 lieu");
    expect(text).toContain("Wheelchair tag: yes 1, limited 1, no 0, designated 0, UNKNOWN 0");
    expect(text.trimEnd().endsWith("© OpenStreetMap contributors, ODbL-1.0")).toBe(true);
  });
  it("states the share and the old-source count", () => {
    const text = kindsToText(rows, "en", TODAY);
    expect(text).toContain("Tag reported with a source: 100%");
    expect(text).toContain("Source older than a year: 1");
    expect(text).toContain("No kind stated (UNKNOWN) — 1 place");
  });
  it("leaves out the old-source line when no source is old", () => {
    expect(kindsToText(rowsOf([raw("a")]), "en", TODAY)).not.toContain("older than a year");
  });
  it("ends with one newline", () => {
    const text = kindsToText(rows, "en", TODAY);
    expect(text.endsWith("\n")).toBe(true);
    expect(text.endsWith("\n\n")).toBe(false);
  });
  it("is correct French: no-break space before the colon, narrow one before %, token UNKNOWN", () => {
    const text = kindsToText(rows, "fr", TODAY);
    expect(text).toContain("Date : 2026-11-19");
    expect(text).toContain("Indication pour fauteuil roulant : oui 1, limité 1, non 0, réservé 0, UNKNOWN 0");
    expect(text).toContain("Indication fournie avec une source : 100 %");
    expect(text).toContain("Aucun type indiqué (UNKNOWN)");
    expect(text).not.toMatch(/INCONNU/);
    for (const line of text.split("\n")) expect(lintFrench(line), line).toEqual([]);
  });
  it("never uses a plain space before a French colon", () => {
    expect(kindsToText(rows, "fr", TODAY)).not.toMatch(/\S :/);
  });
  it("passes the copy linter in both languages and names no organisation", () => {
    for (const locale of ["en", "fr"] as const) {
      for (const line of kindsToText(shippedRows, locale, TODAY).split("\n")) {
        expect(lintCopy(line, locale), line).toEqual([]);
        expect(containsForbiddenOrg(line), line).toBe(false);
      }
    }
  });
  it("makes no claim about accessibility of a kind", () => {
    const text = `${kindsToText(shippedRows, "en", TODAY)}${kindsToText(shippedRows, "fr", TODAY)}`;
    expect(text).not.toMatch(/\b(accessible|inaccessible|safe|recommended|best|worst)\b/i);
    expect(text).not.toMatch(/\b(vérifi|verif)/i);
  });
  it("lists every kind of the shipped pack once", () => {
    const text = kindsToText(shippedRows, "en", TODAY);
    expect(text.split("\n").filter((l) => / — \d+ places?$/.test(l))).toHaveLength(shippedRows.length);
    expect(shippedRows.length).toBeGreaterThan(3);
  });
});
