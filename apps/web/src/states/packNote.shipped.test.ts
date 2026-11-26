import { describe, expect, it } from "vitest";
import contentText from "../../public/packs/toronto/content.json?raw";
import { lintCopy } from "./copyLint";
import { parseCsv } from "./csvParse";
import { OSM_CREDIT } from "./dataCredits";
import { NOTE_CSV_HEADER, notesToCsv, notesToText } from "./packNoteExport";
import { buildNoteIndex, lengthsAddUp } from "./packNoteIndex";
import { NO_NOTE_FILTER, NOTE_ORDERS, filterNotes, orderNotes } from "./packNoteSearch";
import { highlightSegments } from "./packNoteText";
import { parsePackPlaces } from "./packPlaces";

const raw = (JSON.parse(contentText) as { places: Array<Record<string, unknown>> }).places;
const { places } = parsePackPlaces(raw);
const index = buildNoteIndex(places);

describe("notes of the shipped pack", () => {
  it("reads every place of the pack", () => {
    expect(index.total).toBe(places.length);
    expect(index.total).toBeGreaterThan(10);
    expect(index.withNote + index.withoutNote).toBe(index.total);
    expect(lengthsAddUp(index)).toBe(true);
  });
  it("has the notes the pack file holds, and no more", () => {
    const want = raw.filter((p) => typeof p.wheelchair_description === "string" && p.wheelchair_description.trim() !== "" && p.wheelchair_description !== "UNKNOWN").length;
    expect(index.withNote).toBe(want);
    expect(want).toBeGreaterThan(0);
  });
  it("gives each note exactly as the pack file wrote it", () => {
    for (const e of index.entries) {
      const original = raw.find((p) => p.id === e.id)!.wheelchair_description as string;
      expect(e.note).toBe(original.trim());
    }
  });
  it("counts places with and without a note by tag, adding up to the places", () => {
    const sum = (c: Record<string, number>) => Object.values(c).reduce((a, b) => a + b, 0);
    expect(sum(index.withByTag)).toBe(index.withNote);
    expect(sum(index.withoutByTag)).toBe(index.withoutNote);
  });
  it("filters and orders without losing or inventing a note", () => {
    for (const o of NOTE_ORDERS) expect(orderNotes(index.entries, o).map((e) => e.id).sort()).toEqual(index.entries.map((e) => e.id).sort());
    expect(filterNotes(index.entries, NO_NOTE_FILTER)).toEqual(index.entries);
  });
  it("marks a word that is in a shipped note, and the pieces join back to the note", () => {
    const e = index.entries[0]!;
    const word = e.words[0]!;
    const segs = highlightSegments(e.note, [word]);
    expect(segs.some((s) => s.match)).toBe(true);
    expect(segs.map((s) => s.text).join("")).toBe(e.note);
  });
  it("writes a text and a CSV file that carry the credit and read back", () => {
    for (const locale of ["en", "fr"] as const) {
      const text = notesToText(index, index.entries, locale);
      expect(text.split(OSM_CREDIT)).toHaveLength(2);
      for (const line of text.split("\n")) if (!line.startsWith("   ") && !/^\d+\. /.test(line)) expect(lintCopy(line, locale), line).toEqual([]);
    }
    const csv = parseCsv(notesToCsv(index.entries));
    expect(csv.ok && csv.rows[0]).toEqual([...NOTE_CSV_HEADER]);
    expect(csv.ok && csv.rows.length).toBe(1 + index.withNote);
  });
  it("does not change when the places arrive in another order", () => {
    expect(buildNoteIndex([...places].reverse())).toEqual(index);
  });
});
