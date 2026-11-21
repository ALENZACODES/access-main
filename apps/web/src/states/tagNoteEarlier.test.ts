import { describe, expect, it } from "vitest";
import { checkPlaces } from "./tagNoteCheck";
import { compareWithEarlier, looksLikeFindingsFile, readEarlierFindings, type EarlierFinding } from "./tagNoteEarlier";
import { findingsToCsv } from "./tagNoteExport";
import { withNote } from "./noteTopicFixtures";

const now = (notes: Array<[string, string, string]>) => checkPlaces(notes.map(([id, note, tag]) => withNote(id, note, { wheelchair: tag, name: `Name ${id}` }))).findings;
const e = (id: string, over: Partial<EarlierFinding> = {}): EarlierFinding => ({ id, name: `Name ${id}`, tag: "yes", kind: "yes-but-barrier", note: "Two steps.", ...over });

describe("readEarlierFindings", () => {
  it("reads back a file this tool wrote", () => {
    const f = now([["a", "Two steps.", "yes"], ["b", "Step free entrance.", "no"]]);
    const r = readEarlierFindings(findingsToCsv(f, { bom: true }));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.findings.map((x) => [x.id, x.name, x.tag, x.kind, x.note])).toEqual([["a", "Name a", "yes", "yes-but-barrier", "Two steps."], ["b", "Name b", "no", "no-but-access", "Step free entrance."]]);
  });
  it("undoes the formula guard on a note and a name", () => {
    const f = checkPlaces([withNote("a", "=2 steps at the door", { wheelchair: "yes", name: "+Cafe" })]).findings;
    const r = readEarlierFindings(findingsToCsv(f));
    expect(r.ok && r.findings[0]).toMatchObject({ name: "+Cafe", note: "=2 steps at the door" });
  });
  it("keeps a note with quotes and commas", () => {
    const note = 'Two "steps", then, more steps';
    const r = readEarlierFindings(findingsToCsv(checkPlaces([withNote("a", note, { wheelchair: "yes" })]).findings));
    expect(r.ok && r.findings[0]!.note).toBe(note);
  });
  it.each([
    ["", "empty"],
    ["   \n", "empty"],
  ])("refuses an empty file (%j)", (text, problem) => expect(readEarlierFindings(text)).toEqual({ ok: false, problem }));
  it("names the columns that are missing", () => {
    expect(readEarlierFindings("place_id,note\r\na,b\r\n")).toEqual({ ok: false, problem: "missing-columns", missing: ["wheelchair_tag", "kind"] });
  });
  it("refuses a file with a header only", () => {
    expect(readEarlierFindings("place_id,wheelchair_tag,kind,note\r\n")).toEqual({ ok: false, problem: "no-rows" });
  });
  it("refuses a quote that never closes", () => {
    expect(readEarlierFindings('place_id,wheelchair_tag,kind,note\r\na,yes,x,"oops\r\n')).toEqual({ ok: false, problem: "unterminated-quote" });
  });
  it("refuses a file that is too large", () => {
    expect(readEarlierFindings("a".repeat(5_000_001))).toEqual({ ok: false, problem: "too-large" });
  });
  it("counts rows it cannot use instead of guessing", () => {
    const r = readEarlierFindings("place_id,wheelchair_tag,kind,note\r\na,yes,k,n\r\n,yes,k,n\r\nb,yes\r\na,no,k,again\r\n" + "x".repeat(65) + ",yes,k,n\r\n");
    expect(r).toMatchObject({ ok: true, skipped: 4 });
    expect(r.ok && r.findings.map((x) => x.id)).toEqual(["a"]);
  });
  it("finds columns wherever they sit and ignores extra ones", () => {
    const r = readEarlierFindings("extra,note,kind,wheelchair_tag,place_id\r\nz,Two steps.,yes-but-barrier,yes,a\r\n");
    expect(r.ok && r.findings[0]).toMatchObject({ id: "a", tag: "yes", name: null });
  });
  it("accepts line feeds alone", () => {
    expect(readEarlierFindings("place_id,wheelchair_tag,kind,note\na,yes,k,n\n").ok).toBe(true);
  });
});

describe("compareWithEarlier", () => {
  it("marks a place that points different ways now and did not before as new", () => {
    const d = compareWithEarlier(now([["a", "Two steps.", "yes"]]), []);
    expect(d.rows).toEqual([{ id: "a", name: "Name a", change: "new" }]);
    expect(d.counts).toEqual({ new: 1, gone: 0, changed: 0, same: 0 });
  });
  it("marks one that no longer does as gone, with the earlier name", () => {
    const d = compareWithEarlier([], [e("a")]);
    expect(d.rows).toEqual([{ id: "a", name: "Name a", change: "gone" }]);
  });
  it("marks an unchanged place as same, ignoring white space in the note", () => {
    const d = compareWithEarlier(now([["a", "Two   steps.", "yes"]]), [e("a", { note: "Two steps." })]);
    expect(d.counts.same).toBe(1);
  });
  it("marks a changed note or tag as changed", () => {
    expect(compareWithEarlier(now([["a", "Two steps and a lift?", "yes"]]), [e("a")]).counts.changed).toBe(1);
    expect(compareWithEarlier(now([["a", "Two steps.", "designated"]]), [e("a")]).counts.changed).toBe(1);
    expect(compareWithEarlier(now([["a", "Step free.", "no"]]), [e("a")]).counts.changed).toBe(1);
  });
  it("lists new first, then changed, gone, same, each by name", () => {
    const f = now([["a", "Two steps.", "yes"], ["b", "Two steps.", "yes"], ["c", "Two steps and a lift?", "yes"], ["d", "Two steps.", "yes"]]);
    const d = compareWithEarlier(f, [e("a"), e("c"), e("z"), e("d", { note: "Two stairs." })]);
    expect(d.rows.map((r) => `${r.change}:${r.id}`)).toEqual(["new:b", "changed:c", "changed:d", "gone:z", "same:a"]);
  });
  it("counts add up to the rows", () => {
    const f = now([["a", "Two steps.", "yes"], ["b", "Two steps.", "yes"]]);
    const d = compareWithEarlier(f, [e("a"), e("q")]);
    expect(d.rows).toHaveLength(d.counts.new + d.counts.gone + d.counts.changed + d.counts.same);
  });
  it("is a no-op for the same file read back", () => {
    const f = now([["a", "Two steps.", "yes"], ["b", "Step free entrance.", "no"]]);
    const r = readEarlierFindings(findingsToCsv(f));
    const d = compareWithEarlier(f, r.ok ? r.findings : []);
    expect(d.counts).toEqual({ new: 0, gone: 0, changed: 0, same: 2 });
  });
});

describe("looksLikeFindingsFile", () => {
  it("accepts the header this tool writes, with or without a byte order mark", () => {
    const csv = findingsToCsv([], { bom: true });
    expect(looksLikeFindingsFile(csv)).toBe(true);
    expect(looksLikeFindingsFile(csv.slice(1))).toBe(true);
  });
  it("refuses other files", () => {
    expect(looksLikeFindingsFile("place_id,place_name\r\n")).toBe(false);
    expect(looksLikeFindingsFile("")).toBe(false);
  });
});
