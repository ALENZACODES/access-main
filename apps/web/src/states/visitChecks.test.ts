import { describe, expect, it } from "vitest";
import { parsePackPlaces, type PackPlaceRecord } from "./packPlaces";
import { progress, progressLine, pruneDone, toggleDone } from "./visitChecks";
import { buildVisitPlan } from "./visitQuestions";

const mk = (id: string, wheelchair = "yes"): PackPlaceRecord => parsePackPlaces([{ id, name: id, wheelchair, provenance: { source_name: "Open Data Toronto", licence: "OGL-Ontario-1.0", retrieved_at: "2026-11-10" } }]).places[0]!;
const plan = (...ids: string[]) => buildVisitPlan(ids.map((id) => mk(id)), 0, "en", "2026-11-19");

describe("toggleDone", () => {
  it("ticks a key that is not ticked", () => {
    expect([...toggleDone(new Set(), "a")]).toEqual(["a"]);
  });
  it("unticks a key that is ticked", () => {
    expect([...toggleDone(new Set(["a", "b"]), "a")]).toEqual(["b"]);
  });
  it("returns a new set and leaves the old one as it was", () => {
    const before = new Set(["a"]);
    const after = toggleDone(before, "b");
    expect(after).not.toBe(before);
    expect([...before]).toEqual(["a"]);
  });
  it("twice is the same as not at all", () => {
    const start = new Set(["a"]);
    expect([...toggleDone(toggleDone(start, "z"), "z")]).toEqual(["a"]);
  });
});

describe("pruneDone", () => {
  it("keeps keys that are still questions", () => {
    const p = plan("a", "b");
    const keys = p.places.flatMap((x) => x.questions.map((q) => q.key));
    expect(pruneDone(new Set(keys), p).size).toBe(keys.length);
  });
  it("drops keys for a place that is no longer in the plan", () => {
    const p = plan("a");
    const stale = plan("b").places[0]!.questions[0]!.key;
    expect(pruneDone(new Set([stale]), p).size).toBe(0);
  });
  it("drops keys that were never questions", () => {
    expect(pruneDone(new Set(["", "a", "a:contact:99"]), plan("a")).size).toBe(0);
  });
});

describe("progress", () => {
  it("counts ticked questions against the total", () => {
    const p = plan("a", "b");
    const first = p.places[0]!.questions[0]!.key;
    expect(progress(new Set([first]), p)).toEqual({ asked: 1, total: p.total });
  });
  it("does not count a tick for a question that has gone", () => {
    expect(progress(new Set(["gone:scope:0"]), plan("a")).asked).toBe(0);
  });
  it("is 0 of 0 for an empty plan", () => {
    expect(progress(new Set(), buildVisitPlan([], 0, "en", "2026-11-19"))).toEqual({ asked: 0, total: 0 });
  });
});

describe("progressLine", () => {
  it("reads in English and in French", () => {
    expect(progressLine({ asked: 2, total: 5 }, "en")).toBe("2 of 5 asked.");
    expect(progressLine({ asked: 2, total: 5 }, "fr")).toBe("2 sur 5 posées.");
  });
  it("says there are no questions when there are none", () => {
    expect(progressLine({ asked: 0, total: 0 }, "en")).toBe("No questions.");
    expect(progressLine({ asked: 0, total: 0 }, "fr")).toBe("Aucune question.");
  });
});
