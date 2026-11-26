import { describe, expect, it } from "vitest";
import { lcg, place } from "./placeFixtures";
import { tagNotePlaces } from "./tagNoteFixtures";
import { DEFAULT_TAG_NOTE_ORDER, TAG_NOTE_ORDERS, buildTagNoteIndex, isTagNoteOrder, shownTagNotes } from "./tagNoteIndex";
import { TAG_NOTE_KINDS } from "./tagNoteRules";

const index = buildTagNoteIndex(tagNotePlaces());
const ids = (reads: readonly { id: string }[]) => reads.map((r) => r.id);

describe("buildTagNoteIndex", () => {
  it("lists the places whose tag and note read in different directions, in the order given", () => {
    expect(ids(index.reads)).toEqual(["a", "c", "d", "f", "j"]);
  });
  it("counts places with a note, and each reading", () => {
    expect(index.withNote).toBe(10);
    expect(index.byKind).toEqual({ "yes-steps": 3, "no-ramp-lift": 1, "unknown-words": 1 });
    expect(Object.values(index.byKind).reduce((a, b) => a + b, 0)).toBe(index.reads.length);
  });
  it("is empty for no places and for places with no note", () => {
    expect(buildTagNoteIndex([])).toEqual({ reads: [], withNote: 0, byKind: { "yes-steps": 0, "no-ramp-lift": 0, "unknown-words": 0 } });
    expect(buildTagNoteIndex([place("z", { wheelchair_description: null })]).withNote).toBe(0);
  });
  it("lists a place once, with exactly one reading", () => {
    expect(new Set(ids(index.reads)).size).toBe(index.reads.length);
    for (const r of index.reads) expect(TAG_NOTE_KINDS).toContain(r.kind);
  });
});

describe("shownTagNotes", () => {
  it("puts reads in name order, a place with no name last, ties by id", () => {
    expect(ids(shownTagNotes(index.reads, null, "name"))).toEqual(["a", "d", "c", "j", "f"]);
    const same = [place("2", { name: "Twin", wheelchair: "yes", wheelchair_description: "steps" }), place("1", { name: "twin", wheelchair: "yes", wheelchair_description: "steps" })];
    expect(ids(shownTagNotes(buildTagNoteIndex(same).reads, null, "name"))).toEqual(["1", "2"]);
  });
  it("orders by reading and then name", () => {
    expect(ids(shownTagNotes(index.reads, null, "kind"))).toEqual(["a", "c", "j", "d", "f"]);
  });
  it("keeps only one reading when asked", () => {
    expect(ids(shownTagNotes(index.reads, "yes-steps", "name"))).toEqual(["a", "c", "j"]);
    expect(ids(shownTagNotes(index.reads, "no-ramp-lift", "name"))).toEqual(["d"]);
    expect(ids(shownTagNotes(index.reads, "unknown-words", "kind"))).toEqual(["f"]);
  });
  it("never changes the reads it is given, and returns every one for no filter", () => {
    const before = JSON.stringify(index.reads);
    const out = shownTagNotes(index.reads, null, "kind");
    expect(JSON.stringify(index.reads)).toBe(before);
    expect(out).toHaveLength(index.reads.length);
    expect(out).not.toBe(index.reads);
  });
  it("gives the same name order whatever order the places come in", () => {
    const rand = lcg(11);
    for (let i = 0; i < 20; i++) {
      const shuffled = [...tagNotePlaces()].sort(() => rand() - 0.5);
      expect(ids(shownTagNotes(buildTagNoteIndex(shuffled).reads, null, "name"))).toEqual(["a", "d", "c", "j", "f"]);
    }
  });
});

describe("orders", () => {
  it("knows its two orders", () => {
    expect(DEFAULT_TAG_NOTE_ORDER).toBe("name");
    for (const o of TAG_NOTE_ORDERS) expect(isTagNoteOrder(o)).toBe(true);
    for (const o of ["", "tag", null, 1]) expect(isTagNoteOrder(o)).toBe(false);
  });
});

describe("a reading found by a reference made from labelled phrases", () => {
  // Each phrase says what it is, so the expected result never comes from the code being tested.
  const phrases: Array<{ text: string; steps?: "live" | "none"; ramp?: "live" | "none"; lift?: "live" | "none" }> = [
    { text: "Two steps at the front", steps: "live" },
    { text: "No steps at all", steps: "none" },
    { text: "Step-free side door", steps: "none" },
    { text: "Ramp at the side", ramp: "live" },
    { text: "No ramp", ramp: "none" },
    { text: "Elevator inside", lift: "live" },
    { text: "Without elevator", lift: "none" },
    { text: "Washrooms are upstairs" },
    { text: "Ask the staff" },
  ];
  const tagsOf = ["yes", "designated", "no", "limited", null] as const;
  it("matches for 300 generated places", () => {
    const rand = lcg(2026);
    for (let i = 0; i < 300; i++) {
      const chosen = Array.from({ length: 1 + Math.floor(rand() * 3) }, () => phrases[Math.floor(rand() * phrases.length)]!);
      const tag = tagsOf[Math.floor(rand() * tagsOf.length)]!;
      const note = chosen.map((p) => p.text).join(". ") + ".";
      const has = (k: "steps" | "ramp" | "lift") => chosen.some((p) => p[k] === "live");
      const expected = tag === "yes" || tag === "designated" ? (has("steps") ? "yes-steps" : null) : tag === "no" ? (has("ramp") || has("lift") ? "no-ramp-lift" : null) : tag === null ? (has("steps") || has("ramp") || has("lift") ? "unknown-words" : null) : null;
      const got = buildTagNoteIndex([place("g", { wheelchair: tag, wheelchair_description: note })]).reads[0]?.kind ?? null;
      expect(got, `${tag} | ${note}`).toBe(expected);
    }
  });
});
