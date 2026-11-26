import { describe, expect, it } from "vitest";
import { OSM_CREDIT } from "./dataCredits";
import { place } from "./placeFixtures";
import { tagNotePlaces } from "./tagNoteFixtures";
import { TAG_NOTE_CSV_FILENAMES, TAG_NOTE_CSV_HEADER, TAG_NOTE_TEXT_FILENAMES, tagNotesToCsv, tagNotesToText } from "./tagNoteExport";
import { tagNoteRuleLine, tagNoteRulesExtra } from "./tagNoteCopy";
import { buildTagNoteIndex, shownTagNotes } from "./tagNoteIndex";
import { TAG_NOTE_KINDS } from "./tagNoteRules";

const index = buildTagNoteIndex(tagNotePlaces());
const shown = shownTagNotes(index.reads, null, "name");
const rows = (s: string) => s.split("\r\n").filter((l) => l !== "");

describe("tagNotesToCsv", () => {
  it("has the fixed header and one row per shown place, in the order shown", () => {
    const r = rows(tagNotesToCsv(shown));
    expect(r[0]).toBe(TAG_NOTE_CSV_HEADER.join(","));
    expect(r).toHaveLength(shown.length + 1);
    expect(r.slice(1).map((l) => l.split(",")[0])).toEqual(shown.map((s) => s.id));
  });
  it("writes UNKNOWN for a missing name, tag, kind or address, and the reading name in English both times", () => {
    const r = rows(tagNotesToCsv(shown));
    const f = r.find((l) => l.startsWith("f,"))!;
    expect(f).toBe("f,UNKNOWN,UNKNOWN,cafe,1 Main Street,unknown-words,ramp,Ramp at the side door");
    expect(r.find((l) => l.startsWith("a,"))).toContain(",yes,cafe,1 Main Street,yes-steps,steps,");
  });
  it("keeps the note whole, even with a comma or a quote", () => {
    const p = place("q", { name: "Q", wheelchair: "yes", wheelchair_description: 'Two steps, "narrow" second line' });
    const csv = tagNotesToCsv(buildTagNoteIndex([p]).reads);
    expect(csv).toContain('"Two steps, ""narrow"" second line"');
  });
  it("keeps a note that starts like a formula from running as one", () => {
    const p = place("q", { name: "Q", wheelchair: "yes", wheelchair_description: "=steps up" });
    expect(tagNotesToCsv(buildTagNoteIndex([p]).reads)).toContain("'=steps up");
  });
  it("has a byte order mark only when asked, and writes only the header for none", () => {
    expect(tagNotesToCsv(shown).charCodeAt(0)).not.toBe(0xfeff);
    expect(tagNotesToCsv(shown, { bom: true }).charCodeAt(0)).toBe(0xfeff);
    expect(tagNotesToCsv([])).toBe(TAG_NOTE_CSV_HEADER.join(",") + "\r\n");
  });
  it("has different file names for each language, all plain", () => {
    expect(TAG_NOTE_CSV_FILENAMES.en).not.toBe(TAG_NOTE_CSV_FILENAMES.fr);
    expect(TAG_NOTE_TEXT_FILENAMES.en).not.toBe(TAG_NOTE_TEXT_FILENAMES.fr);
    for (const f of [...Object.values(TAG_NOTE_CSV_FILENAMES), ...Object.values(TAG_NOTE_TEXT_FILENAMES)]) expect(f).toMatch(/^[a-z-]+\.(csv|txt)$/);
  });
});

describe("tagNotesToText", () => {
  it("has the heading, the three readings, the count, each place and the credit once at the end", () => {
    const text = tagNotesToText(index, shown, "en");
    expect(text.startsWith("Tags and notes side by side\r\n")).toBe(true);
    expect(text).toContain("The three readings");
    for (const kind of TAG_NOTE_KINDS) expect(text).toContain(`   ${tagNoteRuleLine(kind, "en")}`);
    expect(text).toContain(tagNoteRulesExtra("en"));
    expect(text).toContain("5 of 10 notes are on the list.");
    for (const s of shown) expect(text).toContain(`     ${s.note}`);
    expect(text.split(OSM_CREDIT).length - 1).toBe(1);
    expect(text.trimEnd().endsWith(OSM_CREDIT)).toBe(true);
  });
  it("writes a place with no name as UNKNOWN and indents the note under it", () => {
    const p = place("q", { name: null, wheelchair: "yes", wheelchair_description: "Two steps and more" });
    const text = tagNotesToText(buildTagNoteIndex([p]), buildTagNoteIndex([p]).reads, "en");
    expect(text).toContain("\r\nUNKNOWN\r\n");
    expect(text).toContain("     Two steps and more\r\n");
  });
  it("is French with the no-break space before colons, and never INCONNU", () => {
    const text = tagNotesToText(index, shown, "fr");
    expect(text).toContain("Indications et notes côte à côte");
    expect(text).toContain("Note, telle qu’écrite dans le pack\u00a0:");
    expect(text).not.toMatch(/INCONN/i);
  });
  it("is complete for no places", () => {
    const empty = buildTagNoteIndex([]);
    expect(tagNotesToText(empty, [], "en")).toContain("No place in this list has a note.");
import { parseCsv } from "./csvParse";
import { withNote } from "./noteTopicFixtures";
import { checkPlaces } from "./tagNoteCheck";
import { TN_CSV_HEADER } from "./tagNoteCopy";
import { findingsCsvFile, findingsTextFile, findingsToCsv, findingsToText } from "./tagNoteExport";

const f = checkPlaces([
  withNote("a", "Two steps at the front, ramp at the side.", { wheelchair: "yes", name: "Alpha, \"Hall\"" }),
  withNote("b", "Step free entrance.", { wheelchair: "no", name: "=Evil" }),
  withNote("c", "Stairs only.", { wheelchair: "designated", name: null }),
]).findings;

describe("findingsToCsv", () => {
  const csv = findingsToCsv(f);
  const parsed = parseCsv(csv);
  it("has the header then one row per place", () => {
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.rows[0]).toEqual([...TN_CSV_HEADER]);
      expect(parsed.rows).toHaveLength(f.length + 1);
    }
  });
  it("round-trips names with commas and quotes and guards a formula", () => {
    if (parsed.ok) {
      expect(parsed.rows[1]![1]).toBe('Alpha, "Hall"');
      expect(parsed.rows[2]![1]).toBe("'=Evil");
      expect(parsed.rows[3]![1]).toBe("");
    }
  });
  it("gives the tag, kind and weight as fixed English tokens", () => {
    if (parsed.ok) {
      expect(parsed.rows[1]!.slice(2, 5)).toEqual(["yes", "yes-but-barrier", "mixed"]);
      expect(parsed.rows[2]!.slice(2, 5)).toEqual(["no", "no-but-access", "one-sided"]);
      expect(parsed.rows[3]![2]).toBe("designated");
    }
  });
  it("separates the words against the tag from the words with it", () => {
    if (parsed.ok) {
      expect(parsed.rows[1]![5]).toBe("steps");
      expect(parsed.rows[1]![6]).toBe("ramp");
      expect(parsed.rows[2]![6]).toBe("");
    }
  });
  it("carries the note as written", () => {
    if (parsed.ok) expect(parsed.rows[1]![7]).toBe("Two steps at the front, ramp at the side.");
  });
  it("ends with CRLF and has a byte order mark only when asked", () => {
    expect(csv.endsWith("\r\n")).toBe(true);
    expect(csv.startsWith("﻿")).toBe(false);
    expect(findingsToCsv(f, { bom: true }).startsWith("﻿")).toBe(true);
  });
  it("is only the header for no findings", () => {
    expect(findingsToCsv([])).toBe(`${TN_CSV_HEADER.join(",")}\r\n`);
  });
});

describe("findingsToText", () => {
  it("starts with the caveat and says either may be right", () => {
    const t = findingsToText(f, "en");
    expect(t.startsWith("Not a finding.")).toBe(true);
    expect(t).toContain("the pack does not say which");
  });
  it("lists each place with its tag, what it reads as, the marked words and the note", () => {
    const t = findingsToText(f, "en");
    expect(t).toContain('Alpha, "Hall" (a)');
    expect(t).toContain("Tag: yes");
    expect(t).toContain("The tag says yes; the note uses words that read as barriers.");
    expect(t).toContain("steps (barrier), ramp (access)");
    expect(t).toContain("Two steps at the front, ramp at the side.");
    expect(t).toContain("Name not in the pack (c)");
  });
  it("is in French when asked, with French direction words", () => {
    const t = findingsToText(f, "fr");
    expect(t).toContain("Ce n’est pas une conclusion.");
    expect(t).toContain("(obstacle)");
    expect(t).toContain("(accès)");
  });
  it("has no more than one blank line in a row", () => {
    expect(findingsToText(f, "en")).not.toMatch(/\n\n\n/);
  });
});

describe("files", () => {
  it("are named by language, CSV with a byte order mark", () => {
    expect(findingsCsvFile(f, "en").name).toBe("tag-and-note.csv");
    expect(findingsCsvFile(f, "fr").name).toBe("balise-et-note.csv");
    expect(findingsTextFile(f, "en").name).toBe("tag-and-note.txt");
    expect(findingsTextFile(f, "fr").name).toBe("balise-et-note.txt");
    expect(findingsCsvFile(f, "en").content.startsWith("﻿")).toBe(true);
    expect(findingsTextFile(f, "en").mime).toContain("text/plain");
  });
});
