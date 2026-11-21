import { describe, expect, it } from "vitest";
import { lintCopy } from "./copyLint";
import { parseCsv, undoFormulaGuard } from "./csvParse";
import { OSM_CREDIT } from "./dataCredits";
import { LONG_NOTE, noteSet, noted } from "./packNoteFixtures";
import { NOTE_CSV_FILENAMES, NOTE_CSV_HEADER, NOTE_TEXT_FILENAMES, notesToCsv, notesToText } from "./packNoteExport";
import { buildNoteIndex } from "./packNoteIndex";
import { NO_NOTE_FILTER, filterNotes } from "./packNoteSearch";
import type { Locale } from "./stateCopy";

const index = buildNoteIndex(noteSet());
function rows(csv: string): string[][] {
  const p = parseCsv(csv);
  if (!p.ok) throw new Error(p.error);
  return p.rows.map((r) => [...r]);
}

describe("file names", () => {
  it("has a text and a CSV name in each language", () => {
    expect(NOTE_TEXT_FILENAMES).toEqual({ en: "pack-notes.txt", fr: "notes-du-pack.txt" });
    expect(NOTE_CSV_FILENAMES).toEqual({ en: "pack-notes.csv", fr: "notes-du-pack.csv" });
  });
});

describe("notesToCsv", () => {
  it("has the header and one row per note shown", () => {
    const out = rows(notesToCsv(index.entries));
    expect(out[0]).toEqual([...NOTE_CSV_HEADER]);
    expect(out).toHaveLength(1 + index.entries.length);
  });
  it("fills each column", () => {
    const [, first] = rows(notesToCsv(index.entries));
    expect(first).toEqual(["a", "Alpha Cafe", "limited", "cafe", "1 Main Street", "16", "2", "Step at the door"]);
  });
  it("writes UNKNOWN for a missing name, tag, kind or address", () => {
    const i = buildNoteIndex([noted("z", "note", { name: null, wheelchair: null, category: null, address: null })]);
    expect(rows(notesToCsv(i.entries))[1]).toEqual(["z", "UNKNOWN", "UNKNOWN", "UNKNOWN", "UNKNOWN", "4", "1", "note"]);
  });
  it("writes the note exactly as the pack gave it, with commas, quotes and line breaks kept", () => {
    // The pack's reader folds line breaks to spaces, so a line break is put in by hand to test the cell quoting.
    const note = 'Use the "side" door, then the ramp.\nSecond line';
    const entry = { ...buildNoteIndex([noted("a", "x")]).entries[0]!, note };
    expect(rows(notesToCsv([entry]))[1]![7]).toBe(note);
    expect(rows(notesToCsv(buildNoteIndex([noted("a", 'Use the "side" door, then the ramp.')]).entries))[1]![7]).toBe('Use the "side" door, then the ramp.');
  });
  it("writes accents, curly quotes and other scripts as they are", () => {
    const note = "Entrée — l’accès “côté” 入口";
    expect(rows(notesToCsv(buildNoteIndex([noted("a", note)]).entries))[1]![7]).toBe(note);
  });
  it("guards a note a spreadsheet could read as a formula, and the guard comes off on reading", () => {
    const i = buildNoteIndex([noted("a", "=HYPERLINK(1)"), noted("b", "+1"), noted("c", "@x")]);
    const out = rows(notesToCsv(i.entries)).slice(1);
    for (const r of out) expect(r[7]!.startsWith("'")).toBe(true);
    expect(out.map((r) => undoFormulaGuard(r[7]!))).toEqual(["=HYPERLINK(1)", "+1", "@x"]);
  });
  it("writes only the notes given, so a narrowed list gives a smaller file", () => {
    const narrowed = filterNotes(index.entries, { ...NO_NOTE_FILTER, tags: ["yes"] });
    expect(rows(notesToCsv(narrowed))).toHaveLength(1 + narrowed.length);
  });
  it("is only the header for no notes, with CRLF line ends and an optional byte order mark", () => {
    expect(rows(notesToCsv([]))).toEqual([[...NOTE_CSV_HEADER]]);
    const csv = notesToCsv(index.entries);
    expect(csv.startsWith("\uFEFF")).toBe(false);
    expect(csv.endsWith("\r\n")).toBe(true);
    expect(notesToCsv(index.entries, { bom: true }).startsWith("\uFEFF")).toBe(true);
  });
  it("gives the number of characters and of places with the same note", () => {
    const out = rows(notesToCsv(index.entries)).slice(1);
    const c = out.find((r) => r[0] === "c")!;
    expect(Number(c[5])).toBe(LONG_NOTE.length);
    expect(c[6]).toBe("1");
    expect(out.find((r) => r[0] === "e")![6]).toBe("2");
  });
});

describe("notesToText", () => {
  const text = (locale: Locale, shown = index.entries) => notesToText(index, shown, locale);
  it("starts with a heading, the coverage and the line that a note is the pack's wording", () => {
    const l = text("en").split("\n");
    expect(l[0]).toBe("Notes in the pack");
    expect(l[2]).toBe("6 of 8 places have a note.");
    expect(l[3]).toBe("Each note is the pack's wording, shown as written.");
  });
  it("lists each note on lines of its own under the place, indented, as written", () => {
    const t = text("en");
    expect(t).toContain("1. Alpha Cafe\n   Wheelchair tag: Limited\n   Kind: cafe\n   Address: 1 Main Street\n   Note, as written in the pack (16 characters):\n     Step at the door\n");
  });
  it("keeps a long note whole, never cut", () => {
    expect(text("en")).toContain(LONG_NOTE);
  });
  it("keeps the line breaks of a note it is given", () => {
    const i = buildNoteIndex([noted("a", "x")]);
    const entry = { ...i.entries[0]!, note: "line one\nline two\r\nline three" };
    expect(notesToText(i, [entry], "en")).toContain("     line one\n     line two\n     line three\n");
  });
  it("says when the same note is on several places", () => {
    expect(text("en")).toContain("The same note is on 2 places.");
  });
  it("leaves out a kind or address the pack does not give", () => {
    const i = buildNoteIndex([noted("a", "x", { category: null, address: null })]);
    const t = notesToText(i, i.entries, "en");
    expect(t).not.toContain("Kind:");
    expect(t).not.toContain("Address:");
  });
  it("names a nameless place and writes UNKNOWN for a missing tag", () => {
    const i = buildNoteIndex([noted("a", "x", { name: null, wheelchair: null })]);
    const t = notesToText(i, i.entries, "en");
    expect(t).toContain("1. Place with no name (UNKNOWN)");
    expect(t).toContain("Wheelchair tag: UNKNOWN");
  });
  it("says there is nothing to list when nothing is shown", () => {
    expect(text("en", [])).toContain("No notes to list.");
    expect(text("fr", [])).toContain("Aucune note à lister.");
  });
  it("ends with the OpenStreetMap credit once and a final newline", () => {
    for (const l of ["en", "fr"] as const) {
      const t = text(l);
      expect(t.split(OSM_CREDIT)).toHaveLength(2);
      expect(t.endsWith(`${OSM_CREDIT}\n`)).toBe(true);
    }
  });
  it("uses French spacing in the French file", () => {
    const t = text("fr");
    expect(t).toContain("Notes dans le pack");
    expect(t).toMatch(/Indication pour fauteuil roulant\u00a0: Limité/);
    expect(t).toMatch(/Genre\u00a0: cafe/);
    expect(t).toMatch(/Note, telle qu’écrite dans le pack \(16 caractères\)\u00a0:/);
  });
  it("passes the copy rules for the App's own lines, in both languages", () => {
    for (const l of ["en", "fr"] as const) {
      for (const line of text(l).split("\n")) {
        if (/^ {5}/.test(line) || /^\d+\. /.test(line) || /^ {3}(Kind|Address|Genre|Adresse)/.test(line)) continue;
        expect(lintCopy(line, l), line).toEqual([]);
      }
    }
  });
  it("does not write INCONNU", () => {
    expect(text("fr")).not.toMatch(/inconnu/i);
  });
});
