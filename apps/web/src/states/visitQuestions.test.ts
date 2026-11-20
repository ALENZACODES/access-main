import { describe, expect, it } from "vitest";
import { parsePackPlaces, type PackPlaceRecord } from "./packPlaces";
import { MAX_NOTE_QUOTE, QUESTION_TOPICS, buildVisitPlan, planSummary, questionsFor, tagBasis, tagQuestionCount, type QuestionTopic } from "./visitQuestions";

const TODAY = "2026-11-19";
const OSM = { source_name: "OpenStreetMap, Geofabrik Ontario extract", licence: "ODbL-1.0", retrieved_at: "2026-11-10", tier: 0 };
const OLD = { ...OSM, retrieved_at: "2024-06-01" };

/** A pack place as the pack would give it, with fields overridden or removed by passing undefined. */
function place(over: Record<string, unknown> = {}): PackPlaceRecord {
  const raw = { id: "p1", name: "Alpha Hall", wheelchair: "yes", category: "cafe", address: "1 Main Street", lat: 43.65, lon: -79.38, provenance: OSM, ...over };
  const parsed = parsePackPlaces([raw]).places[0];
  if (!parsed) throw new Error("test place did not parse");
  return parsed;
}
const topics = (p: PackPlaceRecord, locale: "en" | "fr" = "en"): QuestionTopic[] => questionsFor(p, locale, TODAY).map((q) => q.topic);

describe("a place with a reported tag", () => {
  it("asks what a Yes covers and nothing about the gaps it does not have", () => {
    expect(topics(place())).toEqual(["scope", "contact"]);
  });
  it("names the tag in the question, in English", () => {
    const q = questionsFor(place(), "en", TODAY)[0]!;
    expect(q.text).toContain("The pack says Yes.");
    expect(q.text).toMatch(/entrance, the main area and the washroom/);
    expect(q.basis).toBe("The pack reports the wheelchair tag Yes.");
  });
  it("names the tag in French with guillemets and thin spaces", () => {
    const q = questionsFor(place(), "fr", TODAY)[0]!;
    expect(q.text).toContain("« Oui »");
    expect(q.text.endsWith(" ?")).toBe(true);
  });
  it("treats Designated like Yes", () => {
    const p = place({ wheelchair: "designated" });
    expect(topics(p)).toEqual(["scope", "contact"]);
    expect(questionsFor(p, "en", TODAY)[0]!.text).toContain("The pack says Designated.");
  });
  it("asks what Limited means and whether another way in exists", () => {
    const p = place({ wheelchair: "limited" });
    expect(topics(p)).toEqual(["limited-meaning", "other-entrance", "contact"]);
    expect(questionsFor(p, "en", TODAY)[0]!.text).toContain("What does that mean here");
  });
  it("asks about another way in when the tag is No, and does not predict the answer", () => {
    const p = place({ wheelchair: "no" });
    expect(topics(p)).toEqual(["other-entrance", "contact"]);
    const text = questionsFor(p, "en", TODAY)[0]!.text;
    expect(text).toContain("The pack says No.");
    expect(text).not.toMatch(/\b(will|should|must|safe|suitable|recommend)/i);
  });
});

describe("a place whose tag is UNKNOWN", () => {
  it("asks about the way in and about the inside", () => {
    expect(topics(place({ wheelchair: undefined }))).toEqual(["entrance", "inside", "contact"]);
  });
  it("says why the tag is UNKNOWN: not recorded, not recognised, or no source", () => {
    expect(tagBasis(place({ wheelchair: undefined }), "en")).toMatch(/records no wheelchair tag/);
    expect(tagBasis(place({ wheelchair: "maybe" }), "en")).toMatch(/does not recognise/);
    expect(tagBasis(place({ provenance: undefined }), "en")).toMatch(/no source for it/);
  });
  it("uses the token UNKNOWN in French too, never INCONNU", () => {
    for (const over of [{ wheelchair: undefined }, { wheelchair: "maybe" }, { provenance: undefined }]) {
      const basis = tagBasis(place(over), "fr");
      expect(basis).toContain("UNKNOWN");
      expect(basis).not.toMatch(/INCONNU/i);
    }
  });
  it("treats the pack's own UNKNOWN text and a blank the same as no tag", () => {
    expect(topics(place({ wheelchair: "UNKNOWN" }))).toEqual(topics(place({ wheelchair: "" })));
  });
});

describe("gaps in the record", () => {
  it("asks for the name when the pack gives none", () => {
    const qs = questionsFor(place({ name: "" }), "en", TODAY);
    expect(qs.map((q) => q.topic)).toContain("name");
    expect(qs.find((q) => q.topic === "name")!.basis).toBe("The pack gives no name for this place: UNKNOWN.");
  });
  it("asks for the address when the pack gives none", () => {
    expect(topics(place({ address: undefined }))).toContain("address");
    expect(topics(place())).not.toContain("address");
  });
  it("asks how to find the entrance when there is no map point", () => {
    expect(topics(place({ lat: undefined }))).toContain("find");
    expect(topics(place({ lon: "x" }))).toContain("find");
    expect(topics(place())).not.toContain("find");
  });
  it("asks about change when the source is more than a year old, and says when it was retrieved", () => {
    const p = place({ provenance: OLD });
    const q = questionsFor(p, "en", TODAY).find((x) => x.topic === "recent")!;
    expect(q.text).toContain("retrieved on 1 June 2024");
    expect(q.basis).toMatch(/^Retrieved \d+ days ago$/);
  });
  it("uses the French date form and 1er for the first of the month", () => {
    const q = questionsFor(place({ provenance: OLD }), "fr", TODAY).find((x) => x.topic === "recent")!;
    expect(q.text).toContain("le 1er juin 2024");
  });
  it("does not call a source that is exactly a year old out of date", () => {
    expect(topics(place({ provenance: { ...OSM, retrieved_at: "2025-11-19" } }))).not.toContain("recent");
    expect(topics(place({ provenance: { ...OSM, retrieved_at: "2025-11-18" } }))).toContain("recent");
  });
  it("asks for a description of the place as it is now when the pack gives no source", () => {
    const qs = questionsFor(place({ provenance: undefined }), "en", TODAY);
    expect(qs.map((q) => q.topic)).toContain("source");
    expect(qs.map((q) => q.topic)).not.toContain("recent");
  });
  it("quotes the pack's note and asks whether it still holds", () => {
    const q = questionsFor(place({ wheelchair_description: "Ramp at the side door" }), "en", TODAY).find((x) => x.topic === "note")!;
    expect(q.text).toBe('The pack\'s note says "Ramp at the side door". Is that still how it is?');
  });
  it("quotes the note in guillemets in French", () => {
    const q = questionsFor(place({ wheelchair_description: "Rampe côté porte" }), "fr", TODAY).find((x) => x.topic === "note")!;
    expect(q.text).toBe("La note du pack dit « Rampe côté porte ». Est-ce toujours le cas ?");
  });
  it("cuts a long note and marks the cut", () => {
    const long = "word ".repeat(200);
    const q = questionsFor(place({ wheelchair_description: long }), "en", TODAY).find((x) => x.topic === "note")!;
    const quoted = /"(.*)"/.exec(q.text)![1]!;
    expect(Array.from(quoted).length).toBeLessThanOrEqual(MAX_NOTE_QUOTE);
    expect(quoted.endsWith("…")).toBe(true);
  });
  it("flattens line breaks in a note", () => {
    const q = questionsFor(place({ wheelchair_description: "one\n\ntwo\tthree" }), "en", TODAY).find((x) => x.topic === "note")!;
    expect(q.text).toContain('"one two three"');
  });
  it("does not cut a surrogate pair in half", () => {
    const q = questionsFor(place({ wheelchair_description: "😀".repeat(300) }), "en", TODAY).find((x) => x.topic === "note")!;
    expect(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/.test(q.text)).toBe(false);
  });
});

describe("order and keys", () => {
  it("always ends with the contact question", () => {
    for (const over of [{}, { wheelchair: "no" }, { wheelchair: undefined, name: "", address: undefined, lat: undefined, provenance: undefined, wheelchair_description: "x" }]) {
      const qs = questionsFor(place(over), "en", TODAY);
      expect(qs[qs.length - 1]!.topic).toBe("contact");
    }
  });
  it("asks in the fixed topic order, however many gaps there are", () => {
    const qs = questionsFor(place({ wheelchair: undefined, name: "", address: undefined, lat: undefined, provenance: OLD, wheelchair_description: "note" }), "en", TODAY);
    const ranks = qs.map((q) => QUESTION_TOPICS.indexOf(q.topic));
    expect([...ranks].sort((a, b) => a - b)).toEqual(ranks);
  });
  it("gives every question a distinct key that starts with the place id", () => {
    const qs = questionsFor(place({ id: "osm-node-9", wheelchair: undefined, name: "", address: undefined }), "en", TODAY);
    expect(new Set(qs.map((q) => q.key)).size).toBe(qs.length);
    for (const q of qs) expect(q.key.startsWith("osm-node-9:")).toBe(true);
  });
  it("gives the same keys in both languages", () => {
    const p = place({ wheelchair: "limited", address: undefined });
    expect(questionsFor(p, "en", TODAY).map((q) => q.key)).toEqual(questionsFor(p, "fr", TODAY).map((q) => q.key));
  });
  it("lists every topic in the topic list once", () => {
    expect(new Set(QUESTION_TOPICS).size).toBe(QUESTION_TOPICS.length);
  });
});

describe("buildVisitPlan", () => {
  const found = [place({ id: "a" }), place({ id: "b", wheelchair: "no", name: "" })];
  it("makes one entry per found place, in the order given", () => {
    const plan = buildVisitPlan(found, 0, "en", TODAY);
    expect(plan.places.map((p) => p.id)).toEqual(["a", "b"]);
    expect(plan.places[1]!.name).toBeNull();
  });
  it("counts every question", () => {
    const plan = buildVisitPlan(found, 0, "en", TODAY);
    expect(plan.total).toBe(plan.places.reduce((n, p) => n + p.questions.length, 0));
    expect(plan.total).toBe(5);
  });
  it("carries the missing count and makes no questions for those places", () => {
    const plan = buildVisitPlan(found, 3, "en", TODAY);
    expect(plan.missing).toBe(3);
    expect(plan.total).toBe(5);
  });
  it("is empty, with a total of 0, for no found places", () => {
    const plan = buildVisitPlan([], 2, "en", TODAY);
    expect(plan).toEqual({ places: [], missing: 2, total: 0 });
  });
  it("counts a tag question for every place the pack holds", () => {
    expect(tagQuestionCount(buildVisitPlan(found, 0, "en", TODAY))).toBe(2);
    const noTag = place({ id: "c", wheelchair: undefined });
    expect(tagQuestionCount(buildVisitPlan([noTag], 0, "fr", TODAY))).toBe(1);
  });
  it("does not change the places it is given", () => {
    const before = JSON.stringify(found);
    buildVisitPlan(found, 0, "en", TODAY);
    expect(JSON.stringify(found)).toBe(before);
  });
});

describe("planSummary", () => {
  it("says there are no questions when no place is in the pack", () => {
    expect(planSummary(buildVisitPlan([], 1, "en", TODAY), "en")).toMatch(/^No listed place is in the pack on this device/);
  });
  it("uses singular forms for one place and one question", () => {
    const plan = { places: [{ id: "a", name: "A", questions: [{ key: "a:contact:0", topic: "contact" as const, text: "q", basis: "b" }] }], missing: 0, total: 1 };
    expect(planSummary(plan, "en")).toBe("1 question for 1 place, made from what the pack says and leaves out.");
    expect(planSummary(plan, "fr")).toBe("1 question pour 1 lieu, établie d’après ce que le pack indique et ce qu’il omet.");
  });
  it("uses plural forms otherwise", () => {
    expect(planSummary(buildVisitPlan(found2(), 0, "en", TODAY), "en")).toMatch(/^\d+ questions for 2 places,/);
    expect(planSummary(buildVisitPlan(found2(), 0, "fr", TODAY), "fr")).toMatch(/^\d+ questions pour 2 lieux, établies d’après/);
  });
});

function found2(): PackPlaceRecord[] {
  return [place({ id: "x" }), place({ id: "y", wheelchair: "limited" })];
}
