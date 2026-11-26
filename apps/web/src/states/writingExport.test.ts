import { describe, expect, it } from "vitest";
import { parseCsv } from "./csvParse";
import { place } from "./placeFixtures";
import { WR_CSV_HEADER, WR_CSV_NAME, WR_TEXT_NAME } from "./writingCopy";
import { writingCsvFile, writingTextFile, writingToCsv, writingToText } from "./writingExport";
import { buildWritingReport } from "./writingReport";

const p = (id: string, name: string | null, address: string | null) => place(id, { name, address });
const findings = () => buildWritingReport([p("a", "CITY LIBRARY", "1 Main Street"), p("b", "- Beta, Inc. 416-555-0123", "2 Oak St, Toronto, ON"), p("c", "Gamma", "3 Elm Street"), p("d", "Delta", "4 Pine Street"), p("e", "Eps", "5 Ash Street")]).findings;

describe("writingToCsv", () => {
  it("writes the header and one row per thing noticed", () => {
    const rows = parseCsv(writingToCsv(findings(), "en"));
    expect(rows.ok && rows.rows[0]).toEqual([...WR_CSV_HEADER]);
    expect(rows.ok && rows.rows.slice(1).map((r) => [r[0], r[4]])).toEqual([
      ["a", "name-all-capitals"],
      ["b", "name-contact"],
      ["b", "name-edge-punctuation"],
      ["b", "address-province"],
      ["b", "street-type-mix"],
    ]);
  });
  it("writes the field and the text seen", () => {
    const rows = parseCsv(writingToCsv(findings(), "en"));
    const r = rows.ok ? rows.rows.slice(1) : [];
    expect(r[1]!.slice(3, 6)).toEqual(["name", "name-contact", "416-555-0123"]);
    expect(r[3]!.slice(3, 6)).toEqual(["address", "address-province", "ON"]);
  });
  it("puts the street-type note in its own column, in the language asked for", () => {
    const rows = parseCsv(writingToCsv(findings(), "fr"));
    const last = rows.ok ? rows.rows.at(-1)! : [];
    expect(last[6]).toContain("Cette adresse écrit");
    expect(last[5]).toBe("");
  });
  it("quotes commas and guards a name that starts like a formula", () => {
    const f = buildWritingReport([p("a", "=CITY LIBRARY", "x")]).findings;
    expect(writingToCsv(f, "en")).toContain("'=CITY LIBRARY");
    expect(writingToCsv(findings(), "en")).toContain('"\'- Beta, Inc. 416-555-0123"');
  });
  it("starts with a byte order mark only when asked", () => {
    expect(writingToCsv([], "en").charCodeAt(0)).not.toBe(0xfeff);
    expect(writingToCsv([], "en", { bom: true }).charCodeAt(0)).toBe(0xfeff);
  });
  it("writes only the header for no findings", () => expect(writingToCsv([], "en")).toBe(WR_CSV_HEADER.join(",") + "\r\n"));
});

describe("writingToText", () => {
  it("starts with the caveat and has a block per place with a sentence per thing noticed", () => {
    const t = writingToText(findings(), "en");
    expect(t.startsWith("Not a list of mistakes.")).toBe(true);
    expect(t).toContain("CITY LIBRARY (a)");
    expect(t).toContain("  - The name is written in capital letters.");
    expect(t).toContain("  - The address includes a province or country: “ON”.");
    expect(t).toContain("This address uses “St”");
  });
  it("says when the name or the address is missing", () => {
    const t = writingToText(buildWritingReport([p("a", null, "KING STREET WEST")]).findings, "en");
    expect(t).toContain("Name not in the pack (a)");
    expect(writingToText(buildWritingReport([p("a", "DELTA DELTA", null)]).findings, "en")).toContain("Address not in the pack");
  });
  it("is in French for French", () => expect(writingToText(findings(), "fr")).toContain("Le nom est écrit en majuscules."));
  it("does not change the text it was given", () => expect(writingToText(findings(), "en")).toContain("- Beta, Inc. 416-555-0123 (b)"));
});

describe("files", () => {
  it("name the files for the language and set the type", () => {
    expect(writingCsvFile(findings(), "fr")).toMatchObject({ name: WR_CSV_NAME.fr, mime: "text/csv;charset=utf-8" });
    expect(writingTextFile(findings(), "en")).toMatchObject({ name: WR_TEXT_NAME.en, mime: "text/plain;charset=utf-8" });
    expect(writingCsvFile(findings(), "en").content.charCodeAt(0)).toBe(0xfeff);
  });
});
