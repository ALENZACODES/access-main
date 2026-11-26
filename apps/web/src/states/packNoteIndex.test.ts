import { describe, expect, it } from "vitest";
import { LONG_NOTE, noteSet, noted } from "./packNoteFixtures";
import { buildNoteIndex, entriesOfLength, lengthsAddUp, noteExtremes } from "./packNoteIndex";
import { bare, place } from "./placeFixtures";

describe("buildNoteIndex", () => {
  const index = buildNoteIndex(noteSet());
  it("counts the places, with and without a note", () => {
    expect(index.total).toBe(8);
    expect(index.withNote).toBe(6);
    expect(index.withoutNote).toBe(2);
    expect(index.withNote + index.withoutNote).toBe(index.total);
  });
  it("lists the places with a note in id order", () => {
    expect(index.entries.map((e) => e.id)).toEqual(["a", "b", "c", "e", "f", "h"]);
  });
  it("counts places with and without a note by tag", () => {
    expect(index.withByTag).toEqual({ yes: 2, limited: 1, no: 1, designated: 1, unknown: 1 });
    expect(index.withoutByTag).toEqual({ yes: 0, limited: 0, no: 1, designated: 0, unknown: 1 });
  });
  it("keeps each note exactly as written, only trimmed", () => {
    expect(index.entries.find((e) => e.id === "e")!.note).toBe("step at the door");
    expect(buildNoteIndex([noted("x", "  padded note  ")]).entries[0]!.note).toBe("padded note");
  });
  it("reads a note's key, words and length", () => {
    const a = index.entries.find((e) => e.id === "a")!;
    expect(a.key).toBe("step at the door");
    expect(a.words).toEqual(["step", "at", "the", "door"]);
    expect(a.chars).toBe(16);
    expect(a.length).toBe("short");
  });
  it("sorts notes into short, medium and long and adds them up", () => {
    expect(index.byLength).toEqual({ short: 4, medium: 1, long: 1 });
    expect(lengthsAddUp(index)).toBe(true);
    expect(entriesOfLength(index, "long").map((e) => e.id)).toEqual(["c"]);
    expect(entriesOfLength(index, "short").map((e) => e.id)).toEqual(["a", "e", "f", "h"]);
  });
  it("groups notes that are the same words, ignoring case", () => {
    expect(index.duplicates).toHaveLength(1);
    expect(index.duplicates[0]).toMatchObject({ ids: ["a", "e"], names: ["Alpha Cafe", "Epsilon Bar"], note: "Step at the door" });
    expect(index.entries.find((e) => e.id === "a")!.copies).toBe(2);
    expect(index.entries.find((e) => e.id === "e")!.copies).toBe(2);
    expect(index.entries.find((e) => e.id === "b")!.copies).toBe(1);
  });
  it("does not merge or drop the places in a group", () => {
    expect(index.entries.filter((e) => e.key === "step at the door")).toHaveLength(2);
  });
});

describe("what counts as having a note", () => {
  it("treats a missing note and a blank one the same way", () => {
    const i = buildNoteIndex([noted("a", null), noted("b", "   "), noted("c", "")]);
    expect(i.withNote).toBe(0);
    expect(i.withoutNote).toBe(3);
  });
  it("treats the pack's UNKNOWN as no note", () => {
    expect(buildNoteIndex([noted("a", "UNKNOWN")]).withNote).toBe(0);
  });
  it("counts a place with only a note and nothing else", () => {
    const i = buildNoteIndex([place("a", { name: null, wheelchair: null, category: null, address: null, lat: null, lon: null, provenance: null, wheelchair_description: "only this" })]);
    expect(i.entries[0]).toMatchObject({ id: "a", name: null, tag: "unknown", category: null, address: null, note: "only this" });
  });
  it("counts a record with nothing as without a note", () => {
    const i = buildNoteIndex([bare("z")]);
    expect(i.withoutNote).toBe(1);
    expect(i.withoutByTag.unknown).toBe(1);
  });
});

describe("repeated places and empty input", () => {
  it("counts a repeated id once", () => {
    const p = noted("a", "same");
    expect(buildNoteIndex([p, p, p]).total).toBe(1);
  });
  it("is all zero for no places", () => {
    const i = buildNoteIndex([]);
    expect(i).toMatchObject({ total: 0, withNote: 0, withoutNote: 0, entries: [], duplicates: [] });
    expect(noteExtremes(i)).toBeNull();
  });
  it("gives the same index whatever order the places arrive in", () => {
    const set = noteSet();
    expect(buildNoteIndex([...set].reverse())).toEqual(buildNoteIndex(set));
  });
  it("does not change the list it was given", () => {
    const set = noteSet();
    const ids = set.map((p) => p.id);
    buildNoteIndex(set);
    expect(set.map((p) => p.id)).toEqual(ids);
  });
});

describe("duplicates", () => {
  it("lists the biggest group first and breaks a tie by the first id", () => {
    const i = buildNoteIndex([noted("p", "one"), noted("q", "ONE"), noted("r", "two"), noted("s", "Two"), noted("t", "three"), noted("u", "three"), noted("v", "three")]);
    expect(i.duplicates.map((g) => g.ids)).toEqual([["t", "u", "v"], ["p", "q"], ["r", "s"]]);
  });
  it("treats accents and spacing as the same words, and different words as different notes", () => {
    const i = buildNoteIndex([noted("a", "Entrée  côté"), noted("b", "entree cote"), noted("c", "entree cote 2")]);
    expect(i.duplicates).toHaveLength(1);
    expect(i.duplicates[0]!.ids).toEqual(["a", "b"]);
  });
  it("gives a name of null for a nameless place in a group", () => {
    const i = buildNoteIndex([noted("a", "x", { name: null }), noted("b", "x")]);
    expect(i.duplicates[0]!.names).toEqual([null, "Place b"]);
  });
});

describe("noteExtremes", () => {
  it("finds the longest and the shortest note", () => {
    const e = noteExtremes(buildNoteIndex(noteSet()))!;
    expect(e.longest.id).toBe("c");
    expect(e.longest.chars).toBe(LONG_NOTE.length);
    expect(["a", "e"]).toContain(e.shortest.id);
    expect(e.shortest.chars).toBe(16);
  });
  it("breaks a tie by the first id", () => {
    const e = noteExtremes(buildNoteIndex([noted("b", "same"), noted("a", "same")]))!;
    expect(e.longest.id).toBe("a");
    expect(e.shortest.id).toBe("a");
  });
});
