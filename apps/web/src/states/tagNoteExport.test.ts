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
  });
});
