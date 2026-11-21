import { describe, expect, it } from "vitest";
import { noteSet, noted } from "./packNoteFixtures";
import { buildNoteIndex } from "./packNoteIndex";
import {
  DEFAULT_NOTE_ORDER, EMPTY_NOTE_QUERY, MAX_QUERY_TERMS, NOTE_ORDERS, NO_NOTE_FILTER, filterNotes, highlightTerms, isEmptyQuery, isNoteFiltered, isNoteOrder, matchesQuery, orderNotes, parseNoteQuery, toggleIn,
} from "./packNoteSearch";

const index = buildNoteIndex(noteSet());
const ids = (xs: readonly { id: string }[]) => xs.map((x) => x.id);

describe("parseNoteQuery", () => {
  it("reads plain words, folded", () => {
    expect(parseNoteQuery("Step  DOOR")).toEqual({ words: ["step", "door"], phrases: [], without: [] });
  });
  it("reads a phrase in double quotes as one phrase", () => {
    expect(parseNoteQuery('"side door" bell')).toEqual({ words: ["bell"], phrases: ["side door"], without: [] });
  });
  it("reads a minus sign as a word to leave out", () => {
    expect(parseNoteQuery("door -step")).toEqual({ words: ["door"], phrases: [], without: ["step"] });
  });
  it("reads a minus sign before a phrase as each of its words left out", () => {
    expect(parseNoteQuery('-"side door"')).toEqual({ words: [], phrases: [], without: ["side", "door"] });
  });
  it("splits a word at punctuation", () => {
    expect(parseNoteQuery("side-door l’accès").words).toEqual(["side", "door", "l", "acces"]);
  });
  it("folds accents in words and phrases", () => {
    expect(parseNoteQuery('"ENTRÉE par"').phrases).toEqual(["entree par"]);
  });
  it("ignores an empty phrase, a lone minus and a lone quote", () => {
    expect(parseNoteQuery('"" - "  "')).toEqual(EMPTY_NOTE_QUERY);
    expect(isEmptyQuery(parseNoteQuery("   "))).toBe(true);
  });
  it("reads an unclosed quote as plain words", () => {
    expect(parseNoteQuery('"side door').words).toEqual(["side", "door"]);
  });
  it("reads at most twelve terms of each kind", () => {
    const many = Array.from({ length: 30 }, (_, i) => `w${i}`).join(" ");
    expect(parseNoteQuery(many).words).toHaveLength(MAX_QUERY_TERMS);
    expect(parseNoteQuery(many.replace(/w/g, "-w")).without).toHaveLength(MAX_QUERY_TERMS);
  });
  it("marks the words and phrases wanted and not the ones left out", () => {
    expect(highlightTerms(parseNoteQuery('"side door" bell -step'))).toEqual(["side door", "bell"]);
  });
});

describe("matchesQuery", () => {
  const e = (id: string) => index.entries.find((x) => x.id === id)!;
  it("matches everything for an empty query", () => {
    for (const x of index.entries) expect(matchesQuery(x, EMPTY_NOTE_QUERY)).toBe(true);
  });
  it("needs every word to start a word of the note", () => {
    expect(matchesQuery(e("a"), parseNoteQuery("step door"))).toBe(true);
    expect(matchesQuery(e("a"), parseNoteQuery("step ramp"))).toBe(false);
  });
  it("matches the start of a word and not the middle", () => {
    expect(matchesQuery(e("a"), parseNoteQuery("do"))).toBe(true);
    expect(matchesQuery(e("a"), parseNoteQuery("oor"))).toBe(false);
  });
  it("takes one letter as a whole word", () => {
    expect(matchesQuery(e("a"), parseNoteQuery("s"))).toBe(false);
    expect(matchesQuery(noted2("x", "a step"), parseNoteQuery("a"))).toBe(true);
  });
  it("ignores case and accents in the note and in the search", () => {
    expect(matchesQuery(e("f"), parseNoteQuery("ENTREE"))).toBe(true);
    expect(matchesQuery(e("f"), parseNoteQuery("côté"))).toBe(true);
  });
  it("needs a phrase to appear as written, in order", () => {
    expect(matchesQuery(e("a"), parseNoteQuery('"at the door"'))).toBe(true);
    expect(matchesQuery(e("a"), parseNoteQuery('"door the at"'))).toBe(false);
  });
  it("lets a phrase start in the middle of a word", () => {
    expect(matchesQuery(e("a"), parseNoteQuery('"tep at"'))).toBe(true);
  });
  it("leaves out a note that has an excluded word", () => {
    expect(matchesQuery(e("a"), parseNoteQuery("-step"))).toBe(false);
    expect(matchesQuery(e("b"), parseNoteQuery("-step"))).toBe(true);
  });
  it("combines words, phrases and excluded words", () => {
    const q = parseNoteQuery('"ring the bell" door -washroom');
    expect(matchesQuery(e("b"), q)).toBe(true);
    expect(matchesQuery(e("c"), q)).toBe(false);
  });
});
function noted2(id: string, note: string) {
  return buildNoteIndex([noted(id, note)]).entries[0]!;
}

describe("filterNotes", () => {
  it("keeps everything with no filter", () => {
    expect(filterNotes(index.entries, NO_NOTE_FILTER)).toEqual(index.entries);
    expect(isNoteFiltered(NO_NOTE_FILTER)).toBe(false);
  });
  it("searches the notes", () => {
    expect(ids(filterNotes(index.entries, { ...NO_NOTE_FILTER, query: "door" }))).toEqual(["a", "b", "c", "e"]);
    expect(ids(filterNotes(index.entries, { ...NO_NOTE_FILTER, query: "washroom" }))).toEqual(["c", "h"]);
  });
  it("keeps chosen tags, any of them", () => {
    expect(ids(filterNotes(index.entries, { ...NO_NOTE_FILTER, tags: ["yes"] }))).toEqual(["b", "c"]);
    expect(ids(filterNotes(index.entries, { ...NO_NOTE_FILTER, tags: ["limited", "no"] }))).toEqual(["a", "e"]);
  });
  it("keeps places with an UNKNOWN tag only when asked for them", () => {
    expect(ids(filterNotes(index.entries, { ...NO_NOTE_FILTER, tags: ["unknown"] }))).toEqual(["h"]);
    expect(filterNotes(index.entries, { ...NO_NOTE_FILTER, tags: ["yes"] }).some((x) => x.tag === "unknown")).toBe(false);
  });
  it("keeps chosen lengths", () => {
    expect(ids(filterNotes(index.entries, { ...NO_NOTE_FILTER, lengths: ["long"] }))).toEqual(["c"]);
    expect(ids(filterNotes(index.entries, { ...NO_NOTE_FILTER, lengths: ["medium", "long"] }))).toEqual(["b", "c"]);
  });
  it("keeps only repeated notes when asked", () => {
    expect(ids(filterNotes(index.entries, { ...NO_NOTE_FILTER, repeatedOnly: true }))).toEqual(["a", "e"]);
  });
  it("combines the filters", () => {
    expect(ids(filterNotes(index.entries, { query: "door", tags: ["no"], lengths: ["short"], repeatedOnly: true }))).toEqual(["e"]);
    expect(filterNotes(index.entries, { query: "door", tags: ["yes"], lengths: ["short"], repeatedOnly: false })).toEqual([]);
  });
  it("counts any narrowing as a filter, and a blank search as none", () => {
    expect(isNoteFiltered({ ...NO_NOTE_FILTER, query: "x" })).toBe(true);
    expect(isNoteFiltered({ ...NO_NOTE_FILTER, query: "   " })).toBe(false);
    expect(isNoteFiltered({ ...NO_NOTE_FILTER, tags: ["no"] })).toBe(true);
    expect(isNoteFiltered({ ...NO_NOTE_FILTER, lengths: ["short"] })).toBe(true);
    expect(isNoteFiltered({ ...NO_NOTE_FILTER, repeatedOnly: true })).toBe(true);
  });
  it("hands back the same entries, not changed copies", () => {
    for (const x of filterNotes(index.entries, { ...NO_NOTE_FILTER, tags: ["yes"] })) expect(x).toBe(index.entries.find((y) => y.id === x.id));
  });
});

describe("orderNotes", () => {
  it("has four orders, by name to begin with", () => {
    expect([...NOTE_ORDERS]).toEqual(["name", "longest", "shortest", "tag"]);
    expect(DEFAULT_NOTE_ORDER).toBe("name");
    for (const o of NOTE_ORDERS) expect(isNoteOrder(o)).toBe(true);
    for (const bad of ["", "random", null, 4, "Name"]) expect(isNoteOrder(bad)).toBe(false);
  });
  it("sorts by place name ignoring case and accents, the unnamed last", () => {
    expect(ids(orderNotes(index.entries, "name"))).toEqual(["a", "b", "e", "f", "c", "h"]);
  });
  it("sorts by longest and shortest note, ties by name", () => {
    expect(ids(orderNotes(index.entries, "longest"))[0]).toBe("c");
    expect(ids(orderNotes(index.entries, "shortest")).slice(0, 2)).toEqual(["a", "e"]);
  });
  it("sorts by tag in the page's order, then by name", () => {
    expect(ids(orderNotes(index.entries, "tag"))).toEqual(["b", "c", "a", "e", "f", "h"]);
  });
  it("gives the same order whatever order it receives", () => {
    for (const o of NOTE_ORDERS) expect(orderNotes([...index.entries].reverse(), o)).toEqual(orderNotes(index.entries, o));
  });
  it("does not change the list it was given", () => {
    const before = ids(index.entries);
    for (const o of NOTE_ORDERS) orderNotes(index.entries, o);
    expect(ids(index.entries)).toEqual(before);
  });
  it("puts a nameless place last by name", () => {
    const i = buildNoteIndex([noted("a", "x", { name: null }), noted("b", "x", { name: "Zed" })]);
    expect(ids(orderNotes(i.entries, "name"))).toEqual(["b", "a"]);
  });
});

describe("toggleIn", () => {
  it("adds an item that is not there and removes one that is, without changing the list given", () => {
    const list = ["a"] as const;
    expect(toggleIn(list, "b")).toEqual(["a", "b"]);
    expect(toggleIn(["a", "b"], "a")).toEqual(["b"]);
    expect(list).toEqual(["a"]);
  });
});
