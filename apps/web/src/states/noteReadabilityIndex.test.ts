import { describe, expect, it } from "vitest";
import { DEFAULT_READING_ORDER, READING_FILTERS, READING_ORDERS, buildReadingIndex, filterReadings, isReadingFilter, isReadingOrder, orderReadings } from "./noteReadabilityIndex";
import { topicSet, withNote } from "./noteTopicFixtures";

const PLAIN = "Ramp at the side door. Ring the bell. Staff will help you in.";
const HEAVY = "Accessibility accommodations necessitate preliminary communication regarding architectural modifications, notwithstanding unpredictable circumstances affecting administrative availability throughout institutional operations.";
const mixed = () => [
  withNote("p", PLAIN, { name: "Plain Place" }),
  withNote("h", HEAVY, { name: "Étoile Heavy" }),
  withNote("s", "Open daily", { name: "Short One" }),
  withNote("n", null, { name: "No Note" }),
  withNote("u", PLAIN, { name: null }),
  withNote("f", "Entrée par le côté. Sonnez la sonnette. Le personnel vous aide.", { name: "Fleur" }),
];

describe("buildReadingIndex tallies", () => {
  const idx = buildReadingIndex(mixed(), "en");
  it("counts places with and without a note", () => {
    expect(idx.withNote).toBe(5);
    expect(idx.withoutNote).toBe(1);
    expect(idx.entries.map((e) => e.id)).toEqual(["p", "h", "s", "u", "f"]);
  });
  it("counts notes too short to score apart from scored ones", () => {
    expect(idx.tooShort).toBe(1);
    expect(idx.scored).toBe(4);
    expect(idx.tooShort + idx.scored).toBe(idx.withNote);
  });
  it("tallies the bands so they add up to the scored notes", () => {
    expect(Object.values(idx.bands).reduce((a, b) => a + b, 0)).toBe(idx.scored);
    expect(idx.bands.easy).toBeGreaterThanOrEqual(2);
    expect(idx.bands["very-hard"] + idx.bands.hard).toBeGreaterThanOrEqual(1);
  });
  it("counts notes read in the other language", () => {
    expect(idx.otherLanguage).toBe(1);
    expect(buildReadingIndex(mixed(), "fr").otherLanguage).toBe(2);
  });
  it("averages the scored notes", () => {
    const scores = idx.entries.map((e) => e.reading.score).filter((s): s is number => s !== null);
    expect(idx.averageScore).toBe(Math.round(scores.reduce((a, b) => a + b, 0) / scores.length));
  });
  it("has no average when nothing is scored", () => {
    expect(buildReadingIndex([], "en")).toMatchObject({ withNote: 0, withoutNote: 0, scored: 0, averageScore: null });
    expect(buildReadingIndex([withNote("a", "Open daily")], "en").averageScore).toBeNull();
  });
  it("treats a blank note as no note", () => {
    const idx = buildReadingIndex([withNote("a", "   "), withNote("b", null)], "en");
    expect(idx.withoutNote).toBe(2);
    expect(idx.withNote).toBe(0);
  });
  it("reads a French note with the French formula", () => {
    const f = idx.entries.find((e) => e.id === "f")!;
    expect(f.reading.locale).toBe("fr");
    expect(idx.entries.find((e) => e.id === "p")!.reading.locale).toBe("en");
  });
  it("reads the fixture set without trouble", () => {
    const t = buildReadingIndex(topicSet(), "en");
    expect(t.withNote + t.withoutNote).toBe(topicSet().length);
  });
});

describe("filterReadings", () => {
  const idx = buildReadingIndex(mixed(), "en");
  it("lists every scored note for all", () => {
    expect(filterReadings(idx.entries, "all")).toHaveLength(idx.scored);
  });
  it("lists one band", () => {
    for (const b of ["easy", "fair", "hard", "very-hard"] as const) expect(filterReadings(idx.entries, b)).toHaveLength(idx.bands[b]);
  });
  it("never lists a note that was not scored", () => {
    for (const f of READING_FILTERS) expect(filterReadings(idx.entries, f).every((e) => e.reading.score !== null)).toBe(true);
  });
});

describe("orderReadings", () => {
  const scored = filterReadings(buildReadingIndex(mixed(), "en").entries, "all");
  const ids = (o: Parameters<typeof orderReadings>[1]) => orderReadings(scored, o).map((e) => e.id);
  it("puts the hardest first, ties in pack order", () => {
    const out = orderReadings(scored, "hardest");
    for (let i = 1; i < out.length; i += 1) expect(out[i - 1]!.reading.score!).toBeLessThanOrEqual(out[i]!.reading.score!);
    expect(out[0]!.id).toBe("h");
  });
  it("puts the easiest first", () => {
    const out = orderReadings(scored, "easiest");
    for (let i = 1; i < out.length; i += 1) expect(out[i - 1]!.reading.score!).toBeGreaterThanOrEqual(out[i]!.reading.score!);
  });
  it("orders by name without accents and puts unnamed places last", () => {
    const out = ids("name");
    expect(out.at(-1)).toBe("u");
    expect(out.indexOf("h")).toBeLessThan(out.indexOf("f"));
    expect(out.indexOf("f")).toBeLessThan(out.indexOf("p"));
  });
  it("keeps the pack order for pack", () => {
    expect(ids("pack")).toEqual(scored.map((e) => e.id));
  });
  it("does not change the list it is given", () => {
    const copy = [...scored];
    for (const o of READING_ORDERS) orderReadings(scored, o);
    expect(scored).toEqual(copy);
  });
  it("keeps every entry whatever the order", () => {
    for (const o of READING_ORDERS) expect(ids(o).sort()).toEqual(scored.map((e) => e.id).sort());
  });
  it("has hardest as the default", () => {
    expect(DEFAULT_READING_ORDER).toBe("hardest");
  });
});

describe("guards", () => {
  it("recognise only the listed values", () => {
    expect(isReadingOrder("name")).toBe(true);
    expect(isReadingOrder("worst")).toBe(false);
    expect(isReadingOrder(null)).toBe(false);
    expect(isReadingFilter("very-hard")).toBe(true);
    expect(isReadingFilter("all")).toBe(true);
    expect(isReadingFilter("medium")).toBe(false);
  });
});
