import { describe, expect, it } from "vitest";
import { lcg } from "./placeFixtures";
import { TOPIC_IDS, type TopicId } from "./noteTopicLexicon";
import { TOPIC_TAG_ORDER, buildTopicIndex, topicEntryFor, topicTallyAddsUp } from "./noteTopicIndex";
import { scanTopics } from "./noteTopicScan";
import { topicSet, withNote } from "./noteTopicFixtures";

const index = buildTopicIndex(topicSet());
const entry = (id: string) => index.entries.find((e) => e.id === id)!;

describe("topicEntryFor", () => {
  it("gives nothing for a place with no note", () => {
    expect(topicEntryFor(withNote("x", null))).toBeNull();
    expect(topicEntryFor(withNote("x", ""))).toBeNull();
    expect(topicEntryFor(withNote("x", "UNKNOWN"))).toBeNull();
    expect(topicEntryFor(withNote("x", "   "))).toBeNull();
  });
  it("gives nothing for a record whose note is only spaces, even if one reaches it that way", () => {
    expect(topicEntryFor({ ...withNote("x", "door"), note: "   " })).toBeNull();
  });
  it("carries the place's own fields and the note as the pack gave it", () => {
    const e = topicEntryFor(withNote("x", "Ramp at the door", { name: "N", wheelchair: "limited", category: "cafe", address: "1 Main Street" }))!;
    expect(e).toMatchObject({ id: "x", name: "N", tag: "limited", category: "cafe", address: "1 Main Street", note: "Ramp at the door" });
  });
  it("lists distinct topics in the lexicon's order, not the order of the note", () => {
    expect(entry("b").topics).toEqual(["steps", "ramp", "door"]);
    expect(entry("h").topics).toEqual(["door", "parking", "width", "surface"]);
    expect(entry("i").topics).toEqual(["lift", "washroom", "floor"]);
  });
  it("lists the topics whose every use follows a negating word", () => {
    expect(entry("b").negatedOnly).toEqual(["ramp"]);
    expect(entry("c").negatedOnly).toEqual(["lift"]);
    expect(entry("f").negatedOnly).toEqual(["steps"]);
    expect(entry("a").negatedOnly).toEqual([]);
  });
  it("does not list a topic as negated when one of its uses is not", () => {
    const e = topicEntryFor(withNote("x", "No ramp at the front; a ramp at the back"))!;
    expect(e.topics).toEqual(["ramp"]);
    expect(e.negatedOnly).toEqual([]);
  });
  it("keeps a note with no topic word, with empty lists", () => {
    expect(entry("e")).toMatchObject({ topics: [], negatedOnly: [], mentions: [] });
  });
});

describe("buildTopicIndex", () => {
  it("counts the places, the places with a note, and those with and without a topic word", () => {
    expect([index.total, index.withNote, index.withTopic, index.withoutTopic]).toEqual([9, 8, 7, 1]);
  });
  it("leaves out places with no note but keeps the pack's order", () => {
    expect(index.entries.map((e) => e.id)).toEqual(["a", "b", "c", "e", "f", "g", "h", "i"]);
  });
  it("counts places, uses and negated-only places for each topic", () => {
    const row = (id: TopicId) => index.byTopic[id];
    expect(row("steps")).toEqual({ places: 3, mentions: 3, negatedOnly: 1 });
    expect(row("ramp")).toEqual({ places: 2, mentions: 2, negatedOnly: 1 });
    expect(row("lift")).toEqual({ places: 2, mentions: 2, negatedOnly: 1 });
    expect(row("door")).toEqual({ places: 4, mentions: 4, negatedOnly: 0 });
    expect(row("washroom")).toEqual({ places: 2, mentions: 2, negatedOnly: 0 });
    expect(row("parking")).toEqual({ places: 1, mentions: 1, negatedOnly: 0 });
    expect(row("floor")).toEqual({ places: 3, mentions: 3, negatedOnly: 0 });
    expect(row("help")).toEqual({ places: 2, mentions: 5, negatedOnly: 0 });
    expect(row("seating")).toEqual({ places: 0, mentions: 0, negatedOnly: 0 });
  });
  it("counts places by topic and wheelchair tag, with UNKNOWN as its own column", () => {
    expect(index.tagTable.steps).toEqual({ yes: 0, limited: 1, no: 1, designated: 1, unknown: 0 });
    expect(index.tagTable.washroom).toEqual({ yes: 1, limited: 0, no: 0, designated: 0, unknown: 1 });
    expect(index.tagTable.seating).toEqual({ yes: 0, limited: 0, no: 0, designated: 0, unknown: 0 });
  });
  it("lists pairs of topics used in the same note, most places first, ties in lexicon order", () => {
    expect(index.pairs.slice(0, 5).map((p) => [p.a, p.b, p.places])).toEqual([
      ["steps", "door", 2], ["ramp", "door", 2], ["lift", "floor", 2], ["door", "help", 2], ["washroom", "floor", 2],
    ]);
    for (const p of index.pairs) expect(TOPIC_IDS.indexOf(p.a)).toBeLessThan(TOPIC_IDS.indexOf(p.b));
  });
  it("adds up", () => {
    expect(topicTallyAddsUp(index)).toBe(true);
    expect(TOPIC_TAG_ORDER).toEqual(["yes", "limited", "no", "designated", "unknown"]);
  });
  it("is empty and adds up for no places, and for places with no notes", () => {
    for (const places of [[], [withNote("a", null), withNote("b", "UNKNOWN")]]) {
      const i = buildTopicIndex(places);
      expect(i.withNote).toBe(0);
      expect(i.entries).toEqual([]);
      expect(i.pairs).toEqual([]);
      expect(topicTallyAddsUp(i)).toBe(true);
    }
  });
  it("does not depend on the order the places arrive in, except for the order of the entries", () => {
    const rev = buildTopicIndex([...topicSet()].reverse());
    expect({ ...rev, entries: [] }).toEqual({ ...index, entries: [] });
    expect(rev.entries.map((e) => e.id)).toEqual(index.entries.map((e) => e.id).reverse());
  });
  it("gives the same index for the same places", () => {
    expect(buildTopicIndex(topicSet())).toEqual(index);
  });
});

describe("buildTopicIndex against a plain recount", () => {
  const NOTES = ["Ramp at the door", "no steps", "Two steps; ramp", "Parking and a lift", "", "Open late", "Sans ascenseur, escalier", "Washroom floor 2, narrow", "Gravel, ice and snow", "Ask staff to help; ring the bell", "UNKNOWN", "Tables and seating"];
  const TAGS = ["yes", "limited", "no", "designated", "UNKNOWN", null];
  it("matches a recount made by scanning every note again", () => {
    for (let seed = 1; seed <= 40; seed++) {
      const next = lcg(seed);
      const places = Array.from({ length: 5 + Math.floor(next() * 25) }, (_, i) => withNote(`p${i}`, NOTES[Math.floor(next() * NOTES.length)]!, { wheelchair: TAGS[Math.floor(next() * TAGS.length)] }));
      const i = buildTopicIndex(places);
      expect(topicTallyAddsUp(i), `seed ${seed}`).toBe(true);
      const noted = places.filter((p) => p.note !== null);
      expect(i.withNote).toBe(noted.length);
      for (const id of TOPIC_IDS) {
        const uses = noted.map((p) => scanTopics(p.note!).filter((m) => m.topic === id));
        expect(i.byTopic[id].places, id).toBe(uses.filter((u) => u.length > 0).length);
        expect(i.byTopic[id].mentions, id).toBe(uses.reduce((s, u) => s + u.length, 0));
        expect(i.byTopic[id].negatedOnly, id).toBe(uses.filter((u) => u.length > 0 && u.every((m) => m.negated)).length);
      }
    }
  });
});
