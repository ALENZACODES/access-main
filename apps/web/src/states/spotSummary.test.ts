import { describe, expect, it } from "vitest";
import type { ResultRow } from "./spotResults";
import { SPOT_MATCH_KINDS, matchOf, nothingAnswered, summariseResults } from "./spotSummary";

const row = (id: string, tag: string, match?: "same" | "different" | "could-not-tell", extra: Partial<ResultRow> = {}): ResultRow => ({
  n: id, id, name: `Place ${id}`, tag, source: "OpenStreetMap", retrievedOn: "2026-11-10", answers: match ? { match } : {}, dateLooked: null, notes: "", problems: [], ...extra,
});

describe("matchOf", () => {
  it("reads the answer to the last question", () => {
    expect(matchOf(row("a", "yes", "same"))).toBe("same");
    expect(matchOf(row("a", "yes", "different"))).toBe("different");
    expect(matchOf(row("a", "yes", "could-not-tell"))).toBe("could-not-tell");
  });
  it("is not-answered with no answer, even when other questions were answered", () => {
    expect(matchOf(row("a", "yes"))).toBe("not-answered");
    expect(matchOf(row("a", "yes", undefined, { answers: { step: "yes", door: "no" } }))).toBe("not-answered");
  });
  it("lists the four kinds", () => {
    expect([...SPOT_MATCH_KINDS]).toEqual(["same", "different", "could-not-tell", "not-answered"]);
  });
});

describe("summariseResults", () => {
  const rows = [row("1", "yes", "same"), row("2", "yes", "different"), row("3", "limited", "same"), row("4", "no"), row("5", "UNKNOWN", "could-not-tell"), row("6", "yes", "different")];
  const s = summariseResults(rows);
  it("counts every row once, by match", () => {
    expect(s.total).toBe(6);
    expect(s.byMatch).toEqual({ same: 2, different: 2, "could-not-tell": 1, "not-answered": 1 });
    expect(Object.values(s.byMatch).reduce((a, b) => a + b, 0)).toBe(s.total);
  });
  it("tallies by tag, in the order tags first appear", () => {
    expect(s.byTag.map((t) => t.tag)).toEqual(["yes", "limited", "no", "UNKNOWN"]);
    expect(s.byTag[0]).toEqual({ tag: "yes", total: 3, byMatch: { same: 1, different: 2, "could-not-tell": 0, "not-answered": 0 } });
    expect(s.byTag.reduce((n, t) => n + t.total, 0)).toBe(6);
  });
  it("lists the rows where a difference was seen, in order", () => {
    expect(s.differences.map((r) => r.id)).toEqual(["2", "6"]);
  });
  it("counts rows with an unreadable cell", () => {
    const withBad = [row("1", "yes", "same", { problems: [{ column: "step", problem: "answer-not-understood" }] }), row("2", "yes")];
    expect(summariseResults(withBad).withProblems).toBe(1);
    expect(s.withProblems).toBe(0);
  });
  it("has a summary for no rows", () => {
    const e = summariseResults([]);
    expect(e).toEqual({ total: 0, byMatch: { same: 0, different: 0, "could-not-tell": 0, "not-answered": 0 }, byTag: [], differences: [], withProblems: 0 });
  });
  it("does not change the rows it is given", () => {
    const copy = JSON.stringify(rows);
    summariseResults(rows);
    expect(JSON.stringify(rows)).toBe(copy);
  });
  it("gives no rate or score", () => {
    expect(Object.keys(s).sort()).toEqual(["byMatch", "byTag", "differences", "total", "withProblems"]);
  });
});

describe("nothingAnswered", () => {
  it("is true when no row has an answer or a note", () => {
    expect(nothingAnswered([row("1", "yes"), row("2", "no")])).toBe(true);
    expect(nothingAnswered([])).toBe(true);
  });
  it("is false when any answer or note exists", () => {
    expect(nothingAnswered([row("1", "yes"), row("2", "no", "same")])).toBe(false);
    expect(nothingAnswered([row("1", "yes", undefined, { notes: "hi" })])).toBe(false);
    expect(nothingAnswered([row("1", "yes", undefined, { answers: { step: "no" } })])).toBe(false);
  });
});
