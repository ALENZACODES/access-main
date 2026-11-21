import { describe, expect, it } from "vitest";
import { parsePackPlaces, type PackPlaceRecord } from "./packPlaces";
import { RECORD_TOPICS, VISIT_FILTERS, WAY_IN_TOPICS, filterCounts, filterLabel, filterNote, filterPlan, isVisitFilter } from "./visitFilter";
import { QUESTION_TOPICS, buildVisitPlan } from "./visitQuestions";
import { lintCopy } from "./copyLint";

const TODAY = "2026-11-19";
const OSM = { source_name: "OpenStreetMap, Geofabrik Ontario extract", licence: "ODbL-1.0", retrieved_at: "2024-01-01", tier: 0 };
const mk = (id: string, over: Record<string, unknown> = {}): PackPlaceRecord => parsePackPlaces([{ id, name: id, wheelchair: "yes", address: "1 Main Street", lat: 43.6, lon: -79.3, provenance: OSM, ...over }]).places[0]!;
const plan = (locale: "en" | "fr" = "en") => buildVisitPlan([mk("a"), mk("b", { wheelchair: undefined, address: undefined }), mk("c", { provenance: { ...OSM, retrieved_at: "2026-11-10" } })], 2, locale, TODAY);

describe("the topic groups", () => {
  it("cover every topic but the contact question, with none in both", () => {
    const both = WAY_IN_TOPICS.filter((t) => RECORD_TOPICS.includes(t));
    expect(both).toEqual([]);
    const left = QUESTION_TOPICS.filter((t) => !WAY_IN_TOPICS.includes(t) && !RECORD_TOPICS.includes(t));
    expect(left).toEqual(["contact"]);
  });
});

describe("isVisitFilter", () => {
  it("accepts the four filters", () => {
    for (const f of VISIT_FILTERS) expect(isVisitFilter(f)).toBe(true);
  });
  it("rejects anything else", () => {
    for (const v of ["", "ALL", "all ", "done", null, undefined, 3, {}]) expect(isVisitFilter(v), String(v)).toBe(false);
  });
});

describe("filterPlan", () => {
  it("returns the same plan for all", () => {
    const p = plan();
    expect(filterPlan(p, "all")).toBe(p);
  });
  it("keeps only getting-in questions for way-in", () => {
    const shown = filterPlan(plan(), "way-in");
    for (const place of shown.places) for (const q of place.questions) expect(WAY_IN_TOPICS).toContain(q.topic);
    expect(shown.places.map((p) => p.id)).toEqual(["a", "b", "c"]);
  });
  it("keeps only record questions for record, and drops a place with none", () => {
    const shown = filterPlan(plan(), "record");
    for (const place of shown.places) for (const q of place.questions) expect(RECORD_TOPICS).toContain(q.topic);
    expect(shown.places.map((p) => p.id)).toEqual(["a", "b"]);
  });
  it("keeps the questions that are not ticked for not-asked", () => {
    const p = plan();
    const ticked = new Set([p.places[0]!.questions[0]!.key]);
    const shown = filterPlan(p, "not-asked", ticked);
    expect(shown.total).toBe(p.total - 1);
    expect(shown.places.flatMap((x) => x.questions.map((q) => q.key))).not.toContain([...ticked][0]);
  });
  it("shows every question for not-asked when nothing is ticked", () => {
    const p = plan();
    expect(filterPlan(p, "not-asked").total).toBe(p.total);
  });
  it("shows nothing for not-asked when everything is ticked", () => {
    const p = plan();
    const all = new Set(p.places.flatMap((x) => x.questions.map((q) => q.key)));
    expect(filterPlan(p, "not-asked", all)).toEqual({ places: [], missing: 2, total: 0 });
  });
  it("does not change the wording or the order of a question", () => {
    const p = plan();
    const shown = filterPlan(p, "way-in");
    for (const place of shown.places) {
      const original = p.places.find((x) => x.id === place.id)!.questions.filter((q) => WAY_IN_TOPICS.includes(q.topic));
      expect(place.questions).toEqual(original);
    }
  });
  it("keeps the missing count", () => {
    for (const f of VISIT_FILTERS) expect(filterPlan(plan(), f).missing).toBe(2);
  });
  it("recomputes the total", () => {
    for (const f of VISIT_FILTERS) {
      const shown = filterPlan(plan(), f);
      expect(shown.total).toBe(shown.places.reduce((n, p) => n + p.questions.length, 0));
    }
  });
  it("does not change the plan it is given", () => {
    const p = plan();
    const before = JSON.stringify(p);
    filterPlan(p, "record");
    expect(JSON.stringify(p)).toBe(before);
  });
});

describe("filterCounts", () => {
  it("matches what each filter shows", () => {
    const p = plan();
    const counts = filterCounts(p);
    for (const f of VISIT_FILTERS) expect(counts[f]).toBe(filterPlan(p, f).total);
  });
  it("lets way-in, record and the contact questions add up to all", () => {
    const p = plan();
    const c = filterCounts(p);
    expect(c["way-in"] + c.record + p.places.length).toBe(c.all);
  });
  it("lowers not-asked as questions are ticked", () => {
    const p = plan();
    const first = p.places[0]!.questions.map((q) => q.key);
    expect(filterCounts(p, new Set(first))["not-asked"]).toBe(p.total - first.length);
  });
});

describe("filterNote", () => {
  it("is empty when nothing is hidden", () => {
    const p = plan();
    expect(filterNote(p, p, "en")).toBe("");
  });
  it("says how many are hidden, singular and plural, in both languages", () => {
    const p = plan();
    const one = { ...p, total: p.total - 1 };
    expect(filterNote(p, one, "en")).toBe("1 question is hidden by this choice.");
    expect(filterNote(p, one, "fr")).toBe("1 question est masquée par ce choix.");
    const few = { ...p, total: p.total - 3 };
    expect(filterNote(p, few, "en")).toBe("3 questions are hidden by this choice.");
    expect(filterNote(p, few, "fr")).toBe("3 questions sont masquées par ce choix.");
  });
});

describe("filterLabel", () => {
  it("has distinct, lint-clean labels in both languages", () => {
    for (const locale of ["en", "fr"] as const) {
      const labels = VISIT_FILTERS.map((f) => filterLabel(f, locale));
      expect(new Set(labels).size).toBe(labels.length);
      for (const label of labels) expect(lintCopy(label, locale), label).toEqual([]);
    }
  });
});
