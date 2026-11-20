import { describe, expect, it } from "vitest";
import { lintCopy } from "./copyLint";
import { parseCsv, undoFormulaGuard } from "./csvParse";
import { OSM_CREDIT } from "./dataCredits";
import { topicSet, withNote } from "./noteTopicFixtures";
import { TOPIC_CSV_FILENAMES, TOPIC_CSV_HEADER, TOPIC_TABLE_CSV_FILENAMES, TOPIC_TABLE_CSV_HEADER, TOPIC_TEXT_FILENAMES, topicEntriesToCsv, topicTableToCsv, topicsToText } from "./noteTopicExport";
import { DEFAULT_TOPIC_ORDER, NO_TOPIC_FILTER, filterTopicEntries, orderTopicEntries } from "./noteTopicFilter";
import { buildTopicIndex } from "./noteTopicIndex";
import { TOPIC_IDS } from "./noteTopicLexicon";
import type { Locale } from "./stateCopy";

const index = buildTopicIndex(topicSet());
const rows = (csv: string): string[][] => {
  const p = parseCsv(csv);
  if (!p.ok) throw new Error(p.error);
  return p.rows.map((r) => [...r]);
};
const text = (locale: Locale, shown = index.entries) => topicsToText(index, shown, locale);

describe("file names and headers", () => {
  it("has a name in each language for each file, ending in the right extension", () => {
    for (const l of ["en", "fr"] as const) {
      expect(TOPIC_TEXT_FILENAMES[l]).toMatch(/\.txt$/);
      expect(TOPIC_CSV_FILENAMES[l]).toMatch(/\.csv$/);
      expect(TOPIC_TABLE_CSV_FILENAMES[l]).toMatch(/\.csv$/);
    }
    expect(new Set([...Object.values(TOPIC_TEXT_FILENAMES), ...Object.values(TOPIC_CSV_FILENAMES), ...Object.values(TOPIC_TABLE_CSV_FILENAMES)]).size).toBe(6);
  });
  it("keeps the column names as fixed tokens, the same in both languages", () => {
    expect([...TOPIC_CSV_HEADER]).toEqual(["place_id", "place_name", "wheelchair_tag", "kind", "address", "word_groups", "only_after_no", "note"]);
    expect([...TOPIC_TABLE_CSV_HEADER]).toEqual(["word_group", "places", "uses", "places_only_after_no", "tag_yes", "tag_limited", "tag_no", "tag_designated", "tag_unknown"]);
  });
});

describe("topicEntriesToCsv", () => {
  it("has the header and one row per note shown", () => {
    const out = rows(topicEntriesToCsv(index.entries));
    expect(out[0]).toEqual([...TOPIC_CSV_HEADER]);
    expect(out).toHaveLength(1 + index.entries.length);
  });
  it("fills each column, with word groups as topic ids joined by a space", () => {
    const out = rows(topicEntriesToCsv(index.entries));
    expect(out[1]).toEqual(["a", "Alpha Cafe", "yes", "cafe", "1 Main Street", "ramp door help", "", "Ramp at the side entrance. Ring the bell for staff to help."]);
    expect(out[2]![5]).toBe("steps ramp door");
    expect(out[2]![6]).toBe("ramp");
  });
  it("writes UNKNOWN for a missing name, tag, kind or address, and nothing for no words", () => {
    const i = buildTopicIndex([withNote("z", "Open late", { name: null, wheelchair: null, category: null, address: null })]);
    expect(rows(topicEntriesToCsv(i.entries))[1]).toEqual(["z", "UNKNOWN", "UNKNOWN", "UNKNOWN", "UNKNOWN", "", "", "Open late"]);
  });
  it("writes the note as the pack gave it, accents and curly quotes included", () => {
    const note = "Entrée — l’accès “côté” 入口, porte";
    const i = buildTopicIndex([withNote("a", note)]);
    expect(rows(topicEntriesToCsv(i.entries))[1]![7]).toBe(note);
  });
  it("quotes commas and quotation marks in a note", () => {
    const note = 'Use the "side" door, then the ramp.';
    expect(rows(topicEntriesToCsv(buildTopicIndex([withNote("a", note)]).entries))[1]![7]).toBe(note);
  });
  it("guards a note a spreadsheet could read as a formula, and the guard comes off on reading", () => {
    const i = buildTopicIndex([withNote("a", "=HYPERLINK(1) door"), withNote("b", "+1 door"), withNote("c", "@x door")]);
    const out = rows(topicEntriesToCsv(i.entries)).slice(1);
    for (const r of out) expect(r[7]!.startsWith("'")).toBe(true);
    expect(out.map((r) => undoFormulaGuard(r[7]!))).toEqual(["=HYPERLINK(1) door", "+1 door", "@x door"]);
  });
  it("writes only the notes given, so a narrowed list gives a smaller file", () => {
    const narrowed = filterTopicEntries(index.entries, { ...NO_TOPIC_FILTER, topics: ["door"] });
    expect(rows(topicEntriesToCsv(narrowed))).toHaveLength(1 + narrowed.length);
    expect(narrowed.length).toBeLessThan(index.entries.length);
  });
  it("writes in the order given", () => {
    const ordered = orderTopicEntries(index.entries, "tag");
    expect(rows(topicEntriesToCsv(ordered)).slice(1).map((r) => r[0])).toEqual(ordered.map((e) => e.id));
    expect(DEFAULT_TOPIC_ORDER).toBe("name");
  });
  it("is only the header for no notes, with CRLF line ends and an optional byte order mark", () => {
    expect(rows(topicEntriesToCsv([]))).toEqual([[...TOPIC_CSV_HEADER]]);
    const csv = topicEntriesToCsv(index.entries);
    expect(csv.startsWith("\uFEFF")).toBe(false);
    expect(csv.endsWith("\r\n")).toBe(true);
    expect(topicEntriesToCsv(index.entries, { bom: true }).startsWith("\uFEFF")).toBe(true);
  });
});

describe("topicTableToCsv", () => {
  it("has a row for every topic, used or not, in the lexicon's order", () => {
    const out = rows(topicTableToCsv(index));
    expect(out.slice(1).map((r) => r[0])).toEqual([...TOPIC_IDS]);
  });
  it("gives places, uses, places that only use it after no, then places by tag", () => {
    const out = rows(topicTableToCsv(index));
    expect(out.find((r) => r[0] === "steps")).toEqual(["steps", "3", "3", "1", "0", "1", "1", "1", "0"]);
    expect(out.find((r) => r[0] === "seating")).toEqual(["seating", "0", "0", "0", "0", "0", "0", "0", "0"]);
    expect(out.find((r) => r[0] === "help")).toEqual(["help", "2", "5", "0", "1", "0", "0", "1", "0"]);
  });
  it("has tag columns that add up to the places of the row", () => {
    for (const r of rows(topicTableToCsv(index)).slice(1)) expect(r.slice(4).reduce((s, n) => s + Number(n), 0)).toBe(Number(r[1]));
  });
  it("does not change with the notes shown, because it counts the whole pack", () => {
    expect(topicTableToCsv(index)).toBe(topicTableToCsv(buildTopicIndex([...topicSet()].reverse())));
  });
  it("is all zeros for a pack with no notes, and still has every row", () => {
    const out = rows(topicTableToCsv(buildTopicIndex([])));
    expect(out).toHaveLength(1 + TOPIC_IDS.length);
    for (const r of out.slice(1)) expect(r.slice(1).every((n) => n === "0")).toBe(true);
  });
  it("carries an optional byte order mark and CRLF line ends", () => {
    expect(topicTableToCsv(index, { bom: true }).startsWith("\uFEFF")).toBe(true);
    expect(topicTableToCsv(index).includes("\r\n")).toBe(true);
  });
});

describe("topicsToText", () => {
  it("starts with a heading, the coverage and the line that a note only uses a word", () => {
    const l = text("en").split("\n");
    expect(l[0]).toBe("Words in the notes");
    expect(l[2]).toBe("At least one of these words appears in 7 of 8 notes.");
    expect(l[3]).toBe("A note only uses a word. Whatever it goes on to say is in the note, which is shown as written.");
  });
  it("counts each topic with its places and uses, and places by tag", () => {
    const t = text("en");
    expect(t).toContain("Steps and stairs: 3 places, 3 uses of these words\n   Limited 1, No 1, Designated 1");
    expect(t).toContain("Staff and help: 2 places, 5 uses of these words");
    expect(t).not.toContain("Seating and tables");
  });
  it("lists the words used together", () => {
    expect(text("en")).toContain("Words used together in the same note\n   Steps and stairs and Doors and entrances: 2 notes");
  });
  it("lists each note with the words it uses, then the note as written and indented", () => {
    expect(text("en")).toContain("2. Beta Library\n   Wheelchair tag: Limited\n   Kind: cafe\n   Address: 1 Main Street\n   Words used: Steps and stairs; Ramps and slopes; Doors and entrances\n   Only right after “no”, “not” or “without”: Ramps and slopes\n   Note, as written in the pack:\n     Two steps at the front door; no ramp.\n");
  });
  it("says so for a note that uses none of the words", () => {
    expect(text("en")).toContain("None of the listed words.");
  });
  it("keeps the line breaks of a note it is given, indented", () => {
    const entry = { ...index.entries[0]!, note: "line one\nline two\r\nline three" };
    expect(text("en", [entry])).toContain("     line one\n     line two\n     line three\n");
  });
  it("leaves out a kind or address the pack does not give", () => {
    const i = buildTopicIndex([withNote("a", "door", { category: null, address: null })]);
    const t = topicsToText(i, i.entries, "en");
    expect(t).not.toContain("Kind:");
    expect(t).not.toContain("Address:");
  });
  it("names a nameless place and writes UNKNOWN for a missing tag", () => {
    const i = buildTopicIndex([withNote("a", "door", { name: null, wheelchair: null })]);
    const t = topicsToText(i, i.entries, "en");
    expect(t).toContain("1. Place with no name (UNKNOWN)");
    expect(t).toContain("Wheelchair tag: UNKNOWN");
  });
  it("says there is nothing to list when nothing is shown, in both languages", () => {
    expect(text("en", [])).toContain("No notes to list.");
    expect(text("fr", [])).toContain("Aucune note à lister.");
  });
  it("leaves out the pairs section when no two words are used together", () => {
    const i = buildTopicIndex([withNote("a", "door"), withNote("b", "ramp")]);
    expect(topicsToText(i, i.entries, "en")).not.toContain("used together");
  });
  it("shows at most five pairs", () => {
    const i = buildTopicIndex([withNote("a", "door ramp lift steps washroom parking floor")]);
    expect(i.pairs.length).toBeGreaterThan(5);
    const t = topicsToText(i, i.entries, "en");
    expect(t.split("\n").filter((l) => /^ {3}.* and .*: \d+ notes?$/.test(l))).toHaveLength(5);
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
    expect(t).toContain("Mots dans les notes");
    expect(t).toMatch(/Indication pour fauteuil roulant\u00a0: Limité/);
    expect(t).toMatch(/Genre\u00a0: cafe/);
    expect(t).toMatch(/Mots employés\u00a0: Marches et escaliers\u202f; Rampes et pentes\u202f; Portes et entrées/);
    expect(t).toMatch(/Note, telle qu’écrite dans le pack\u00a0:/);
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
