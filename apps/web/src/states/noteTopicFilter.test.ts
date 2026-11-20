import { describe, expect, it } from "vitest";
import {
  DEFAULT_TOPIC_ORDER, NO_TOPIC_FILTER, TOPIC_MODES, TOPIC_ORDERS, entryUsesTopic, filterTopicEntries, isTopicFiltered, isTopicMode, isTopicOrder, orderTopicEntries, toggleTopicIn, topicsInUse,
} from "./noteTopicFilter";
import { buildTopicIndex } from "./noteTopicIndex";
import { TOPIC_IDS } from "./noteTopicLexicon";
import { topicSet } from "./noteTopicFixtures";

const index = buildTopicIndex(topicSet());
const ids = (list: readonly { id: string }[]) => list.map((e) => e.id);
const filt = (over: Partial<typeof NO_TOPIC_FILTER>) => ({ ...NO_TOPIC_FILTER, ...over });

describe("filterTopicEntries", () => {
  it("gives every entry when nothing is chosen", () => {
    expect(filterTopicEntries(index.entries, NO_TOPIC_FILTER)).toEqual(index.entries);
    expect(isTopicFiltered(NO_TOPIC_FILTER)).toBe(false);
  });
  it("keeps notes that use a chosen word", () => {
    expect(ids(filterTopicEntries(index.entries, filt({ topics: ["ramp"] })))).toEqual(["a", "b"]);
  });
  it("with several words and 'any', keeps notes that use at least one", () => {
    expect(ids(filterTopicEntries(index.entries, filt({ topics: ["ramp", "lift"] })))).toEqual(["a", "b", "c", "i"]);
  });
  it("with several words and 'all', keeps notes that use every one", () => {
    expect(ids(filterTopicEntries(index.entries, filt({ topics: ["door", "help"], mode: "all" })))).toEqual(["a", "f"]);
    expect(ids(filterTopicEntries(index.entries, filt({ topics: ["door", "help", "ramp"], mode: "all" })))).toEqual(["a"]);
  });
  it("gives nothing when no note uses all the words chosen", () => {
    expect(filterTopicEntries(index.entries, filt({ topics: ["seating", "ramp"], mode: "all" }))).toEqual([]);
  });
  it("narrows by wheelchair tag, UNKNOWN included", () => {
    expect(ids(filterTopicEntries(index.entries, filt({ tags: ["yes"] })))).toEqual(["a", "h", "i"]);
    expect(ids(filterTopicEntries(index.entries, filt({ tags: ["unknown"] })))).toEqual(["e", "g"]);
    expect(ids(filterTopicEntries(index.entries, filt({ tags: ["no", "limited"] })))).toEqual(["b", "c"]);
  });
  it("combines tags with words", () => {
    expect(ids(filterTopicEntries(index.entries, filt({ topics: ["steps"], tags: ["limited", "no"] })))).toEqual(["b", "c"]);
    expect(isTopicFiltered(filt({ topics: ["steps"] }))).toBe(true);
    expect(isTopicFiltered(filt({ tags: ["yes"] }))).toBe(true);
  });
  it("can leave out notes that use a word only after no, not or without", () => {
    expect(ids(filterTopicEntries(index.entries, filt({ topics: ["steps"], skipNegatedOnly: true })))).toEqual(["b", "c"]);
    expect(ids(filterTopicEntries(index.entries, filt({ topics: ["steps"] })))).toEqual(["b", "c", "f"]);
    expect(ids(filterTopicEntries(index.entries, filt({ topics: ["lift"], skipNegatedOnly: true })))).toEqual(["i"]);
  });
  it("does not change what it is given", () => {
    const before = JSON.stringify(index.entries);
    filterTopicEntries(index.entries, filt({ topics: ["door"] }));
    orderTopicEntries(index.entries, "topics");
    expect(JSON.stringify(index.entries)).toBe(before);
  });
  it("never invents an entry: what comes back is always some of what went in", () => {
    for (const topic of TOPIC_IDS) for (const mode of TOPIC_MODES) {
      const out = filterTopicEntries(index.entries, filt({ topics: [topic, "door"], mode }));
      for (const e of out) expect(index.entries).toContain(e);
    }
  });
});

describe("entryUsesTopic", () => {
  it("counts a negated use only when asked to", () => {
    const b = index.entries.find((e) => e.id === "b")!;
    expect(entryUsesTopic(b, "ramp", false)).toBe(true);
    expect(entryUsesTopic(b, "ramp", true)).toBe(false);
    expect(entryUsesTopic(b, "steps", true)).toBe(true);
    expect(entryUsesTopic(b, "lift", false)).toBe(false);
  });
});

describe("orderTopicEntries", () => {
  it("orders by place name, a place with no name last", () => {
    expect(ids(orderTopicEntries(index.entries, "name"))).toEqual(["a", "b", "e", "f", "c", "h", "i", "g"]);
  });
  it("orders by the number of different words, most first, then by name", () => {
    const out = orderTopicEntries(index.entries, "topics");
    expect(out.map((e) => e.topics.length)).toEqual([4, 3, 3, 3, 3, 3, 2, 0]);
    for (let i = 1; i < out.length; i++) expect(out[i - 1]!.topics.length).toBeGreaterThanOrEqual(out[i]!.topics.length);
    expect(out[0]!.id).toBe("h");
  });
  it("orders by wheelchair tag in the page's tag order, then by name", () => {
    expect(ids(orderTopicEntries(index.entries, "tag"))).toEqual(["a", "h", "i", "b", "c", "f", "e", "g"]);
  });
  it("gives the same order whatever order it was given", () => {
    for (const o of TOPIC_ORDERS) expect(ids(orderTopicEntries([...index.entries].reverse(), o))).toEqual(ids(orderTopicEntries(index.entries, o)));
  });
  it("has a default order that is one of the orders", () => {
    expect(TOPIC_ORDERS).toContain(DEFAULT_TOPIC_ORDER);
  });
});

describe("small helpers", () => {
  it("toggles an item in a list without changing the list it was given", () => {
    const list = ["a", "b"] as const;
    expect(toggleTopicIn(list, "c")).toEqual(["a", "b", "c"]);
    expect(toggleTopicIn(list, "a")).toEqual(["b"]);
    expect(list).toEqual(["a", "b"]);
  });
  it("recognises its modes and orders and nothing else", () => {
    for (const m of TOPIC_MODES) expect(isTopicMode(m)).toBe(true);
    for (const o of TOPIC_ORDERS) expect(isTopicOrder(o)).toBe(true);
    for (const bad of ["", "ANY", "name ", null, 1, undefined]) {
      expect(isTopicMode(bad)).toBe(false);
      expect(isTopicOrder(bad)).toBe(false);
    }
  });
  it("lists the topics some note uses, in the lexicon's order", () => {
    expect(topicsInUse(index.entries)).toEqual(["steps", "ramp", "lift", "door", "washroom", "parking", "floor", "width", "surface", "help"]);
    expect(topicsInUse([])).toEqual([]);
  });
});
