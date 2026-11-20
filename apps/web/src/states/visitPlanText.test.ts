import { describe, expect, it } from "vitest";
import { OSM_CREDIT } from "./dataCredits";
import { parsePackPlaces, type PackPlaceRecord } from "./packPlaces";
import { VISIT_CSV_FILENAMES, VISIT_CSV_HEADER, VISIT_TEXT_FILENAMES, visitPlanToCsv, visitPlanToText, visitRows } from "./visitPlanText";
import { buildVisitPlan } from "./visitQuestions";

const TODAY = "2026-11-19";
const OSM = { source_name: "OpenStreetMap, Geofabrik Ontario extract", licence: "ODbL-1.0", retrieved_at: "2026-11-10", tier: 0 };
const mk = (over: Record<string, unknown> = {}): PackPlaceRecord => parsePackPlaces([{ id: "p1", name: "Alpha Hall", wheelchair: "yes", category: "cafe", address: "1 Main Street", lat: 43.65, lon: -79.38, provenance: OSM, ...over }]).places[0]!;
const plan = (places: PackPlaceRecord[], missing = 0, locale: "en" | "fr" = "en") => buildVisitPlan(places, missing, locale, TODAY);
const two = (locale: "en" | "fr" = "en") => plan([mk({ id: "a" }), mk({ id: "b", name: "Beta Court", wheelchair: "limited" })], 0, locale);

/** Parse CSV text with quoted cells, doubled quotes and CRLF line ends. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(cell);
      cell = "";
    } else if (c === "\r" && text[i + 1] === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      i += 1;
    } else cell += c;
  }
  return rows;
}

describe("visitPlanToText", () => {
  it("starts with the title, an underline of the same length, the date and the summary", () => {
    const lines = visitPlanToText(two(), "en", TODAY).split("\n");
    expect(lines[0]).toBe("Questions to ask before you go");
    expect(lines[1]).toBe("=".repeat(lines[0]!.length));
    expect(lines[2]).toBe("Date: 2026-11-19");
    expect(lines[3]).toMatch(/^\d+ questions for 2 places/);
  });
  it("says the pack is a starting point and that the answers are not in it", () => {
    const text = visitPlanToText(two(), "en", TODAY);
    expect(text).toContain("The pack on this device is a starting point.");
    expect(text).toContain("the answers are not in the pack");
  });
  it("puts each place name on its own line, followed by numbered questions with a why line", () => {
    const lines = visitPlanToText(two(), "en", TODAY).split("\n");
    const at = lines.indexOf("Beta Court");
    expect(at).toBeGreaterThan(0);
    expect(lines[at + 1]).toMatch(/^ {2}\[ \] 1\. The pack says Limited\./);
    expect(lines[at + 2]).toBe("      Why: The pack reports the wheelchair tag Limited.");
  });
  it("numbers the questions of each place from 1", () => {
    const text = visitPlanToText(two(), "en", TODAY);
    expect(text.match(/\] 1\. /g)).toHaveLength(2);
  });
  it("marks ticked questions with an x and leaves the others empty", () => {
    const p = two();
    const first = p.places[0]!.questions[0]!.key;
    const text = visitPlanToText(p, "en", TODAY, new Set([first]));
    expect(text.match(/\[x\]/g)).toHaveLength(1);
    expect(text).toContain(`[x] 1. ${p.places[0]!.questions[0]!.text}`);
  });
  it("ignores ticks for questions that are not in the plan", () => {
    const text = visitPlanToText(two(), "en", TODAY, new Set(["gone:contact:0"]));
    expect(text).not.toContain("[x]");
  });
  it("names a place that has no name as UNKNOWN in the heading", () => {
    const text = visitPlanToText(plan([mk({ name: "" })]), "en", TODAY);
    expect(text).toContain("\nPlace with no name (UNKNOWN)\n");
  });
  it("ends with the exact OpenStreetMap credit and a final newline", () => {
    const text = visitPlanToText(two(), "en", TODAY);
    expect(text.endsWith(`\n${OSM_CREDIT}\n`)).toBe(true);
    expect(OSM_CREDIT).toBe("© OpenStreetMap contributors");
  });
  it("adds a line for listed places the pack no longer holds, one or many", () => {
    expect(visitPlanToText(plan([mk()], 1), "en", TODAY)).toContain("1 listed place is not in the pack on this device, so it has no questions.");
    expect(visitPlanToText(plan([mk()], 4), "en", TODAY)).toContain("4 listed places are not in the pack on this device, so they have no questions.");
    expect(visitPlanToText(plan([mk()], 0), "en", TODAY)).not.toContain("not in the pack on this device");
  });
  it("writes a short note for an empty plan", () => {
    const text = visitPlanToText(plan([], 2), "en", TODAY);
    expect(text).toContain("No listed place is in the pack on this device, so there are no questions.");
    expect(text).toContain("2 listed places are not in the pack");
  });
  it("sets the French text with a no-break space before the colon and a thin space before ; and ?", () => {
    const text = visitPlanToText(two("fr"), "fr", TODAY);
    expect(text).toContain("Date : 2026-11-19");
    expect(text).toContain("Pourquoi : ");
    expect(text).toContain("lieu ; les réponses");
    expect(text).not.toMatch(/ [:;!?]/);
  });
  it("uses the typographic apostrophe in French and never a straight one", () => {
    expect(visitPlanToText(two("fr"), "fr", TODAY)).not.toContain("'");
  });
  it("is the same text each time for the same input", () => {
    expect(visitPlanToText(two(), "en", TODAY)).toBe(visitPlanToText(two(), "en", TODAY));
  });
});

describe("visitPlanToCsv", () => {
  it("has the fixed English header, in both languages", () => {
    for (const locale of ["en", "fr"] as const) expect(parseCsv(visitPlanToCsv(two(locale)))[0]).toEqual([...VISIT_CSV_HEADER]);
  });
  it("has one row per question and an empty answer cell", () => {
    const p = two();
    const rows = parseCsv(visitPlanToCsv(p));
    expect(rows).toHaveLength(p.total + 1);
    for (const row of rows.slice(1)) {
      expect(row).toHaveLength(6);
      expect(row[5]).toBe("");
    }
  });
  it("uses English topic tokens and the place id in the first column", () => {
    const rows = parseCsv(visitPlanToCsv(two("fr"))).slice(1);
    expect(rows[0]![0]).toBe("a");
    expect(rows[0]![2]).toBe("scope");
    expect(rows.map((r) => r[2])).toContain("limited-meaning");
  });
  it("writes the place name, or the token UNKNOWN when it has none", () => {
    const rows = parseCsv(visitPlanToCsv(plan([mk({ name: "" })]))).slice(1);
    expect(rows.every((r) => r[1] === "UNKNOWN")).toBe(true);
  });
  it("quotes cells with commas, quotes and line breaks and reads back the same", () => {
    const p = plan([mk({ name: 'Smith, "Jones" & Co', wheelchair_description: 'Door "B", round the back' })]);
    const rows = parseCsv(visitPlanToCsv(p));
    expect(rows[1]![1]).toBe('Smith, "Jones" & Co');
    expect(rows.find((r) => r[2] === "note")![3]).toContain('"Door "B", round the back"');
  });
  it("defuses a name that a spreadsheet would run as a formula", () => {
    for (const name of ["=1+1", "+SUM(A1)", "-2", "@cmd", "=HYPERLINK(\"x\")"]) {
      const rows = parseCsv(visitPlanToCsv(plan([mk({ name })])));
      expect(rows[1]![1]!.startsWith("'"), name).toBe(true);
    }
  });
  it("ends every line with CRLF, including the last", () => {
    const text = visitPlanToCsv(two());
    expect(text.endsWith("\r\n")).toBe(true);
    expect(text.replace(/\r\n/g, "").includes("\n")).toBe(false);
  });
  it("starts with a byte order mark only when asked", () => {
    expect(visitPlanToCsv(two()).startsWith("﻿")).toBe(false);
    expect(visitPlanToCsv(two(), { bom: true }).startsWith("﻿")).toBe(true);
  });
  it("is only the header for an empty plan", () => {
    expect(parseCsv(visitPlanToCsv(plan([], 3)))).toEqual([[...VISIT_CSV_HEADER]]);
  });
  it("matches visitRows cell for cell", () => {
    const p = two();
    expect(parseCsv(visitPlanToCsv(p)).slice(1)).toEqual(visitRows(p));
  });
});

describe("file names", () => {
  it("are plain ASCII, differ by language and end in the right extension", () => {
    for (const name of [...Object.values(VISIT_CSV_FILENAMES), ...Object.values(VISIT_TEXT_FILENAMES)]) expect(name).toMatch(/^[a-z-]+\.(csv|txt)$/);
    expect(VISIT_CSV_FILENAMES.en).not.toBe(VISIT_CSV_FILENAMES.fr);
    expect(VISIT_TEXT_FILENAMES.en.endsWith(".txt")).toBe(true);
    expect(VISIT_CSV_FILENAMES.fr.endsWith(".csv")).toBe(true);
  });
});
