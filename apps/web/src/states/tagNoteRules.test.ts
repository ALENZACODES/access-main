import { describe, expect, it } from "vitest";
import { topicEntryFor } from "./noteTopicIndex";
import { scanTopics } from "./noteTopicScan";
import { place } from "./placeFixtures";
import { TAG_NOTE_KINDS, TAG_NOTE_RULES, isStepFree, isTagNoteKind, standingMentions, tagNoteFor } from "./tagNoteRules";

const read = (tag: string | null, note: string | null) => {
  const entry = topicEntryFor(place("x", { wheelchair: tag, wheelchair_description: note }));
  return entry === null ? null : tagNoteFor(entry);
};
const kindOf = (tag: string | null, note: string | null) => read(tag, note)?.kind ?? null;

describe("isStepFree", () => {
  const stepFree = (note: string) => scanTopics(note).filter((m) => m.topic === "steps").map((m) => isStepFree(note, m));
  it("is true for step-free in its usual spellings and in French", () => {
    for (const n of ["step-free entrance", "Step free access", "STEP–FREE", "step‑free", "marches libres", "marche libre"]) expect(stepFree(n), n).toContain(true);
  });
  it("is false for a steps word that is not followed by free", () => {
    for (const n of ["two steps", "steps freezer", "step freeway", "stairs at the front", "step, free parking", "free steps"]) expect(stepFree(n), n).not.toContain(true);
  });
  it("is only ever about steps", () => {
    const note = "ramp free";
    for (const m of scanTopics(note)) expect(isStepFree(note, m)).toBe(false);
  });
});

describe("standingMentions", () => {
  it("leaves out words after no and step-free, and keeps the rest", () => {
    const e = topicEntryFor(place("x", { wheelchair_description: "No steps. Step-free side door. 3 steps at the back" }))!;
    const live = standingMentions(e, ["steps"]);
    expect(live).toHaveLength(1);
    expect(e.note.slice(live[0]!.start, live[0]!.end).toLowerCase()).toBe("steps");
    expect(e.note.slice(live[0]!.start - 2, live[0]!.start)).toBe("3 ");
  });
  it("keeps only the topics asked for", () => {
    const e = topicEntryFor(place("x", { wheelchair_description: "Ramp and elevator and steps" }))!;
    expect(standingMentions(e, ["ramp"]).map((m) => m.topic)).toEqual(["ramp"]);
    expect(standingMentions(e, [])).toEqual([]);
  });
});

describe("the three readings", () => {
  it("lists them, each for its own tags, and no tag is in two", () => {
    expect(TAG_NOTE_RULES.map((r) => r.kind)).toEqual([...TAG_NOTE_KINDS]);
    const tags = TAG_NOTE_RULES.flatMap((r) => r.tags);
    expect(new Set(tags).size).toBe(tags.length);
    expect(tags).not.toContain("limited");
  });
  it("reads a Yes or Designated tag against a steps word", () => {
    expect(kindOf("yes", "Two steps at the front door")).toBe("yes-steps");
    expect(kindOf("designated", "Stairs only")).toBe("yes-steps");
  });
  it("does not read a Yes tag against no steps, step-free, or other words", () => {
    for (const n of ["No steps", "Without stairs", "Step-free entrance", "Ramp at the side", "Washrooms upstairs", "Elevator inside"]) expect(kindOf("yes", n), n).toBeNull();
  });
  it("reads a No tag against a ramp or lift word, but not after no", () => {
    expect(kindOf("no", "Elevator out of service")).toBe("no-ramp-lift");
    expect(kindOf("no", "A ramp at the side")).toBe("no-ramp-lift");
    for (const n of ["No ramp and no lift", "Without elevator", "Steps at the door"]) expect(kindOf("no", n), n).toBeNull();
  });
  it("reads a missing tag against a steps, ramp or lift word", () => {
    for (const n of ["Ramp at the side door", "2 steps", "Elevator to the second floor"]) expect(kindOf(null, n), n).toBe("unknown-words");
    for (const n of ["Washrooms on the second floor", "Ask the staff", "No steps"]) expect(kindOf(null, n), n).toBeNull();
  });
  it("never reads a Limited tag", () => {
    for (const n of ["Steps and a ramp", "Elevator", "stairs"]) expect(kindOf("limited", n), n).toBeNull();
  });
  it("gives nothing for a place with no note", () => {
    expect(read("yes", null)).toBeNull();
    expect(read(null, "   ")).toBeNull();
  });
  it("works in French, with negation by sans", () => {
    expect(kindOf("yes", "Entrée avec des marches")).toBe("yes-steps");
    expect(kindOf("yes", "Sans marches à l’entrée")).toBeNull();
    expect(kindOf("no", "Ascenseur disponible")).toBe("no-ramp-lift");
  });
  it("carries only the words that make the reading, in the lexicon's order, and marks only those uses", () => {
    const r = read(null, "Ramp at the door, then steps, then an elevator. Staff will help.")!;
    expect(r.topics).toEqual(["steps", "ramp", "lift"]);
    expect(r.mentions.every((m) => ["steps", "ramp", "lift"].includes(m.topic))).toBe(true);
    expect(r.mentions.map((m) => r.note.slice(m.start, m.end).toLowerCase()).sort()).toEqual(["elevator", "ramp", "steps"]);
  });
  it("keeps the place's own fields and the note exactly as written", () => {
    const p = place("q", { name: "Q", category: "cafe", address: "1 Main Street", wheelchair: "yes", wheelchair_description: "  Two   steps\nat the door " });
    const r = tagNoteFor(topicEntryFor(p)!)!;
    expect(r).toMatchObject({ id: "q", name: "Q", tag: "yes", category: "cafe", address: "1 Main Street" });
    expect(r.note).toBe(p.note);
  });
});

describe("isTagNoteKind", () => {
  it("knows the three kinds only", () => {
    for (const k of TAG_NOTE_KINDS) expect(isTagNoteKind(k)).toBe(true);
    for (const k of ["", "all", "yes", null, 3, "Yes-steps"]) expect(isTagNoteKind(k)).toBe(false);
  });
});
