import { describe, expect, it } from "vitest";
import { bare, place, varied } from "./placeFixtures";
import { lintCopy } from "./copyLint";
import { sampleForSpotCheck } from "./spotSample";
import { buildSpotSheet } from "./spotSheet";
import { SPOT_CSV_HEADER, spotSheetToCsv, spotSheetToHtml, spotSheetToText } from "./spotSheetExport";
import { CHECK_KEYS } from "./spotSheetCopy";
import { parseCsv } from "./csvParse";
import type { Locale } from "./stateCopy";
import { lintFrench } from "./typography";

const rowsOf = (csv: string): readonly (readonly string[])[] => {
  const r = parseCsv(csv);
  if (!r.ok) throw new Error(`csv: ${r.error}`);
  return r.rows;
};

const make = (places = varied(14, 30), over: { size?: number; locale?: Locale; seed?: string; balanced?: boolean } = {}) =>
  buildSpotSheet(sampleForSpotCheck(places, { size: over.size ?? 4, seed: over.seed ?? "s", balanced: over.balanced ?? true }), over.seed ?? "s", over.balanced ?? true, over.locale ?? "en", "2026-11-21");

describe("spotSheetToCsv", () => {
  it("has the fixed header, then one row per place with blank answer cells", () => {
    const rows = rowsOf(spotSheetToCsv(make()));
    expect(rows[0]).toEqual([...SPOT_CSV_HEADER]);
    expect(rows).toHaveLength(5);
    for (const [i, r] of rows.slice(1).entries()) {
      expect(r[0]).toBe(String(i + 1));
      expect(r).toHaveLength(SPOT_CSV_HEADER.length);
      expect(r.slice(6)).toEqual(new Array(CHECK_KEYS.length + 2).fill(""));
    }
  });
  it("uses the same header in both languages", () => {
    expect(rowsOf(spotSheetToCsv(make(undefined, { locale: "fr" })))[0]).toEqual(rowsOf(spotSheetToCsv(make()))[0]);
  });
  it("has the id, name, tag token, source and retrieval date from the pack", () => {
    const csv = rowsOf(spotSheetToCsv(make([place("only", { name: "Café Un", wheelchair: "limited" })], { size: 1 })));
    expect(csv[1]!.slice(0, 6)).toEqual(["1", "only", "Café Un", "limited", "OpenStreetMap, Geofabrik Ontario extract", "2026-11-10"]);
  });
  it("writes UNKNOWN for a place with nothing", () => {
    const csv = rowsOf(spotSheetToCsv(make([bare("b")], { size: 1 })));
    expect(csv[1]!.slice(1, 6)).toEqual(["b", "UNKNOWN", "UNKNOWN", "UNKNOWN", "UNKNOWN"]);
  });
  it("makes a cell that could be read as a formula safe", () => {
    const csv = spotSheetToCsv(make([place("f", { name: "=HYPERLINK(\"x\")" })], { size: 1 }));
    expect(csv).toContain("'=HYPERLINK");
    expect(csv).not.toMatch(/,=HYPERLINK/);
  });
  it("quotes commas, quotes and line ends in a name", () => {
    const rows = rowsOf(spotSheetToCsv(make([place("q", { name: 'A "big", place' })], { size: 1 })));
    expect(rows[1]![2]).toBe('A "big", place');
  });
  it("ends with a line end, and starts with a byte order mark only when asked", () => {
    const sheet = make();
    expect(spotSheetToCsv(sheet).endsWith("\r\n")).toBe(true);
    expect(spotSheetToCsv(sheet).startsWith("\uFEFF")).toBe(false);
    expect(spotSheetToCsv(sheet, { bom: true }).startsWith("\uFEFF")).toBe(true);
  });
  it("is only the header for an empty sheet", () => {
    expect(rowsOf(spotSheetToCsv(make([]))).length).toBe(1);
  });
});

describe("spotSheetToText", () => {
  it("has the title, intro, seed, each place with its questions and boxes, and the footer", () => {
    const sheet = make(undefined, { size: 3, seed: "text seed" });
    const text = spotSheetToText(sheet);
    expect(text).toContain(sheet.title);
    expect(text).toContain("Seed: text seed");
    for (const e of sheet.entries) expect(text).toContain(e.heading);
    expect(text.split("[ ] Yes").length - 1).toBe(4 * 3);
    expect(text.split("[ ] Could not tell").length - 1).toBe(3);
    expect(text).toContain("Date you looked: ________________");
    for (const f of sheet.footer) expect(text).toContain(f);
  });
  it("uses Windows line ends throughout, and ends with one", () => {
    const text = spotSheetToText(make());
    expect(text.replace(/\r\n/g, "")).not.toMatch(/[\r\n]/);
    expect(text.endsWith("\r\n")).toBe(true);
  });
  it("is in French when asked, with French punctuation in the words it wrote", () => {
    const text = spotSheetToText(make(undefined, { locale: "fr" }));
    expect(text).toContain("Valeur de départ:");
    expect(text).toContain("[ ] Oui");
    for (const line of text.split("\r\n")) if (/^\s+- /.test(line)) expect(lintFrench(line.trim().slice(2)), line).toEqual([]);
  });
  it("passes the copy rules on the words it wrote, in both languages", () => {
    for (const locale of ["en", "fr"] as const) {
      const sheet = make(undefined, { locale });
      for (const s of [sheet.title, sheet.intro, ...sheet.footer, ...sheet.checks.map((c) => c.question)]) expect(lintCopy(s, locale), s).toEqual([]);
    }
  });
  it("is just the heading and footer for an empty sheet", () => {
    const text = spotSheetToText(make([]));
    expect(text).toContain("Spot-check sheet: 0 places");
    expect(text).not.toContain("[ ]");
  });
});

describe("spotSheetToHtml", () => {
  it("is a complete page in the right language, with no script and nothing loaded from elsewhere", () => {
    for (const locale of ["en", "fr"] as const) {
      const html = spotSheetToHtml(make(undefined, { locale }));
      expect(html.startsWith("<!DOCTYPE html>")).toBe(true);
      expect(html).toContain(`<html lang="${locale}">`);
      expect(html).toContain('<meta charset="utf-8">');
      expect(html).not.toMatch(/<script|<link|<img|<iframe|src=|href=|@import|url\(/i);
      expect(html).toContain("@media print");
    }
  });
  it("has one article per place with the five questions and a box for each answer", () => {
    const html = spotSheetToHtml(make(undefined, { size: 3 }));
    expect(html.split("<article>").length - 1).toBe(3);
    expect(html.split('<span class="box" aria-hidden="true"></span>').length - 1).toBe(3 * 15);
    expect(html.split('<div class="answer"></div>').length - 1).toBe(3 * 2);
  });
  it("escapes everything taken from the pack, so a name cannot add markup", () => {
    const html = spotSheetToHtml(make([place("x", { name: '<img src=x onerror=alert(1)> & "q"', address: "<b>bold</b>", wheelchair_description: "<script>1</script>" })], { size: 1 }));
    expect(html).not.toContain("<img");
    expect(html).not.toContain("<b>bold");
    expect(html).not.toContain("<script");
    expect(html).toContain("&lt;img src=x onerror=alert(1)&gt; &amp; &quot;q&quot;");
  });
  it("escapes the seed", () => {
    expect(spotSheetToHtml(make(undefined, { seed: "<i>x</i>" }))).not.toContain("<i>x");
  });
  it("sets the title from the sheet", () => {
    const sheet = make();
    expect(spotSheetToHtml(sheet)).toContain(`<title>${sheet.title}</title>`);
  });
  it("shows the footer that says a report is not a finding", () => {
    expect(spotSheetToHtml(make())).toContain("It is not a finding");
  });
  it("uses no colour to carry meaning: black text on white", () => {
    const html = spotSheetToHtml(make());
    expect(html).toContain("color: #000");
    expect(html).toContain("background: #fff");
  });
  it("has headings in order: one h1, an h2 per place and an h3 for the questions", () => {
    const html = spotSheetToHtml(make(undefined, { size: 3 }));
    expect(html.split("<h1>").length - 1).toBe(1);
    expect(html.split("<h2>").length - 1).toBe(3);
    expect(html.split("<h3>").length - 1).toBe(3);
  });
});
