import { describe, expect, it } from "vitest";
import { parseCsv } from "./csvParse";
import { READ_CSV_HEADER } from "./noteReadabilityCopy";
import { buildReadingIndex } from "./noteReadabilityIndex";
import { readingCsvFile, readingTextFile, readingsToCsv, readingsToText } from "./noteReadabilityExport";
import { withNote } from "./noteTopicFixtures";

const PLAIN = "Ramp at the side door. Ring the bell. Staff will help you in.";
const entries = buildReadingIndex(
  [withNote("a", PLAIN, { name: "Alpha, \"Hall\"" }), withNote("b", "Open daily", { name: null }), withNote("c", "=SUM(A1) is not a note, but it reads like a long enough one to score.", { name: "=Evil" })],
  "en",
).entries;

describe("readingsToCsv", () => {
  const csv = readingsToCsv(entries);
  it("has the header then one row per note", () => {
    const p = parseCsv(csv);
    expect(p.ok).toBe(true);
    if (p.ok) {
      expect(p.rows[0]).toEqual([...READ_CSV_HEADER]);
      expect(p.rows).toHaveLength(entries.length + 1);
    }
  });
  it("ends with a CRLF and uses CRLF between rows", () => {
    expect(csv.endsWith("\r\n")).toBe(true);
    expect(csv.split("\r\n")).toHaveLength(entries.length + 2);
  });
  it("quotes commas and quotes in a name and round-trips them", () => {
    const p = parseCsv(csv);
    if (p.ok) expect(p.rows[1]![1]).toBe('Alpha, "Hall"');
  });
  it("guards a name a spreadsheet could read as a formula", () => {
    const p = parseCsv(csv);
    if (p.ok) expect(p.rows[3]![1]).toBe("'=Evil");
  });
  it("leaves score and band empty for a note too short to score, and the name empty when there is none", () => {
    const p = parseCsv(csv);
    if (p.ok) {
      expect(p.rows[2]![1]).toBe("");
      expect(p.rows[2]![3]).toBe("");
      expect(p.rows[2]![4]).toBe("");
    }
  });
  it("uses fixed English band tokens in either language", () => {
    const p = parseCsv(readingsToCsv(buildReadingIndex([withNote("a", PLAIN)], "fr").entries));
    if (p.ok) expect(p.rows[1]![4]).toBe("easy");
  });
  it("adds a byte order mark only when asked", () => {
    expect(csv.startsWith("﻿")).toBe(false);
    expect(readingsToCsv(entries, { bom: true }).startsWith("﻿")).toBe(true);
  });
  it("has only the header for no notes", () => {
    expect(readingsToCsv([])).toBe(`${READ_CSV_HEADER.join(",")}\r\n`);
  });
});

describe("readingsToText", () => {
  it("starts with the caveat and carries every note as written", () => {
    const text = readingsToText(entries, "en");
    expect(text.startsWith("Rough score")).toBe(true);
    expect(text).toContain(PLAIN);
    expect(text).toContain("Alpha, \"Hall\" (a)");
    expect(text).toContain("Name not in the pack (b)");
  });
  it("shows a dash for a note too short to score", () => {
    expect(readingsToText(entries, "en")).toMatch(/\n {2}-; /);
  });
  it("is in French when asked", () => {
    const fr = readingsToText(entries, "fr");
    expect(fr).toContain("Score approximatif");
    expect(fr).toContain("Nom absent du pack");
  });
});

describe("files", () => {
  it("are named by language", () => {
    expect(readingCsvFile(entries, "en").name).toBe("note-reading-ease.csv");
    expect(readingCsvFile(entries, "fr").name).toBe("facilite-lecture-notes.csv");
    expect(readingTextFile(entries, "en").name).toBe("note-reading-ease.txt");
    expect(readingTextFile(entries, "fr").mime).toContain("text/plain");
  });
  it("make the CSV with a byte order mark", () => {
    expect(readingCsvFile(entries, "en").content.startsWith("﻿")).toBe(true);
  });
});
