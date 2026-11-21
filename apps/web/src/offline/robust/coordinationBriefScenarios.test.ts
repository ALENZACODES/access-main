import { describe, expect, it } from "vitest";
import {
  addBriefNote, addBriefStep, assertCoordinationBrief, createCoordinationBrief,
  editBriefStep, encodeCoordinationBrief, moveBriefStep, pageBriefSteps,
  parseCoordinationBrief, removeBriefStep, setBriefStatus, summarizeBrief,
  type BriefTopic, type CoordinationBrief, type StepDraft,
} from "./coordinationBrief";
const day = "2026-11-20";
const timestamp = (hour: number): string => `2026-11-${hour < 24 ? "20" : "21"}T${String(hour % 24).padStart(2, "0")}:00:00.000Z`;
const sample: StepDraft = { label: "Ask about the arrival", topic: "arrival", priority: "essential",
  question: "Who can describe arrival arrangements?", fallbackQuestion: "Who can describe a different arrival point?",
  contactMethod: "Phone enquiry", note: "My own note", provenance: null };
function make(): CoordinationBrief { return createCoordinationBrief("ontario", "Sequence of enquiries", day, "A local outing"); }
function add(book: CoordinationBrief, id: string, hour: number, data: Partial<StepDraft> = {}): CoordinationBrief {
  return addBriefStep(book, id, `event-${id}`, timestamp(hour), { ...sample, ...data });
}
type MutableBrief = Record<string, unknown> & { steps: unknown[]; events: unknown[] };
function step(value: MutableBrief): Record<string, unknown> { return value.steps[0] as Record<string, unknown>; }
function event(value: MutableBrief): Record<string, unknown> { return value.events[0] as Record<string, unknown>; }
function malformed(book: CoordinationBrief, change: (value: MutableBrief) => void): () => void {
  const value = JSON.parse(encodeCoordinationBrief(book)) as MutableBrief;
  change(value);
  return () => assertCoordinationBrief(value);
}
const all = { search: "", filter: "all", sort: "order", offset: 0, limit: 40 } as const;
describe("offline coordination: realistic sequences", () => {
  it("supports arrival, entrance, rest and departure inquiries", () => {
    let book = make();
    book = add(book, "arrival", 10, { topic: "arrival" });
    book = add(book, "entrance", 11, { topic: "entrance", label: "Ask about entrance" });
    book = add(book, "rest", 12, { topic: "rest", label: "Ask where to rest" });
    book = add(book, "departure", 13, { topic: "departure", label: "Ask about departure" });
    expect(book.steps.map((item) => item.topic)).toEqual(["arrival", "entrance", "rest", "departure"]);
    expect(book.steps.every((item) => item.physicalCondition === "UNKNOWN")).toBe(true);
  });
  it("can ask, record a reply and require follow-up", () => {
    let book = add(make(), "arrival", 10);
    book = setBriefStatus(book, "arrival", "e2", timestamp(11), "asked");
    book = addBriefNote(book, "arrival", "e3", timestamp(12), "Contact said a door might be closed");
    book = setBriefStatus(book, "arrival", "e4", timestamp(13), "follow-up");
    expect(summarizeBrief(book).followUp).toBe(1);
    expect(book.steps[0]?.physicalCondition).toBe("UNKNOWN");
    expect(book.events.map((event) => event.kind)).toEqual(["created", "status", "note", "status"]);
  });
  it("can record a conversation without promoting it to physical access fact", () => {
    let book = add(make(), "entrance", 10);
    book = setBriefStatus(book, "entrance", "e2", timestamp(11), "reply-recorded");
    book = addBriefNote(book, "entrance", "e3", timestamp(12), "They described the entrance");
    expect(summarizeBrief(book).replies).toBe(1);
    expect(book.steps[0]?.physicalCondition).toBe("UNKNOWN");
  });
  it("can reorder a plan without changing event sequence", () => {
    let book = add(add(add(make(), "arrival", 10), "entrance", 11), "departure", 12);
    book = moveBriefStep(book, "departure", 0, "event-move", timestamp(13));
    expect(pageBriefSteps(book, all).rows.map((item) => item.id)).toEqual(["departure", "arrival", "entrance"]);
    expect(book.events.map((event) => event.at)).toEqual([timestamp(10), timestamp(11), timestamp(12), timestamp(13)]);
  });
  it("can remove a checkpoint and retain an audit event", () => {
    let book = add(add(make(), "arrival", 10), "entrance", 11);
    book = removeBriefStep(book, "entrance", "event-removed", timestamp(12));
    expect(book.steps).toHaveLength(1);
    expect(book.events.at(-1)?.kind).toBe("removed");
    expect(parseCoordinationBrief(encodeCoordinationBrief(book)).steps).toHaveLength(1);
  });
  it("can update wording without removing the earlier reply status", () => {
    let book = add(make(), "arrival", 10);
    book = setBriefStatus(book, "arrival", "event-asked", timestamp(11), "asked");
    book = editBriefStep(book, "arrival", "event-edit", timestamp(12), { ...sample, question: "Can someone provide a diagram?" });
    expect(book.steps[0]?.status).toBe("asked");
    expect(book.steps[0]?.question).toContain("diagram");
  });
  it("keeps no-source metadata null in all exports", () => {
    const book = add(make(), "arrival", 10);
    expect(JSON.parse(encodeCoordinationBrief(book)).steps[0].provenance).toBeNull();
  });
  it("explicitly tracks source date when entered by a person", () => {
    const p = { source: "Community questionnaire", licence: "Permission to quote", date: "2026-11-01" };
    const book = add(make(), "arrival", 10, { provenance: p });
    expect(book.steps[0]?.provenance).toEqual(p);
  });
  it("does not conflate region matching with usable routes", () => {
    const book = add(make(), "arrival", 10);
    expect(book.steps[0]?.physicalCondition).toBe("UNKNOWN");
    expect(book.regionId).toBe("ontario");
  });
});
describe("offline coordination: paging, filtering and sorting under repeated changes", () => {
  function many(): CoordinationBrief {
    let book = make();
    for (let index = 0; index < 18; index += 1) {
      const at = `2026-11-20T10:${String(index).padStart(2, "0")}:00.000Z`;
      const id = `step-${index}`;
      book = addBriefStep(book, id, `event-${index}`, at, {
        ...sample, label: `Checkpoint ${index}`, question: `Ask about checkpoint ${index}`,
        topic: (index % 2 === 0 ? "arrival" : "washroom") as BriefTopic,
        priority: index % 3 === 0 ? "essential" : "optional",
      });
    }
    return book;
  }
  it("returns the first ten items", () => { expect(pageBriefSteps(many(), { ...all, limit: 10 }).rows).toHaveLength(10); });
  it("returns eight remaining items", () => { expect(pageBriefSteps(many(), { ...all, limit: 10, offset: 10 }).rows).toHaveLength(8); });
  it("reports next after the first page", () => { expect(pageBriefSteps(many(), { ...all, limit: 10 }).next).toBe(true); });
  it("reports previous on the last page", () => { expect(pageBriefSteps(many(), { ...all, limit: 10, offset: 10 }).previous).toBe(true); });
  it("has no empty phantom page in total count", () => { expect(pageBriefSteps(many(), { ...all, offset: 20 }).total).toBe(18); });
  it("filters six essential checkpoints", () => { expect(pageBriefSteps(many(), { ...all, filter: "essential" }).total).toBe(6); });
  it("searches exactly one numbered checkpoint", () => { expect(pageBriefSteps(many(), { ...all, search: "checkpoint 17" }).rows).toHaveLength(1); });
  it("finds an entire topic family", () => { expect(pageBriefSteps(many(), { ...all, search: "washroom" }).total).toBe(9); });
  it("sorts the same set without changing total", () => { expect(pageBriefSteps(many(), { ...all, sort: "priority" }).total).toBe(18); });
  it("sorts by topic deterministically", () => { const b = many(); expect(pageBriefSteps(b, { ...all, sort: "topic" }).rows[0]?.topic).toBe("arrival"); });
  it("preserves step count during pagination", () => { const b = many(); pageBriefSteps(b, { ...all, limit: 1, offset: 17 }); expect(b.steps).toHaveLength(18); });
  it("returns an empty page beyond the end", () => { expect(pageBriefSteps(many(), { ...all, offset: 18 }).rows).toHaveLength(0); });
});
describe("offline coordination: import corruption is fail-closed", () => {
  const valid = add(make(), "arrival", 10);
  it("rejects extra root fields", () => { expect(malformed(valid, (v) => { v.physicalAccess = true; })).toThrow(); });
  it("rejects an unsupported copied field on a checkpoint", () => { expect(malformed(valid, (v) => { step(v).routeSafe = true; })).toThrow(); });
  it("rejects an unsupported copied field in an event", () => { expect(malformed(valid, (v) => { event(v).claimedAccessible = true; })).toThrow(); });
  it("rejects hidden extra provenance fields", () => { const withSource = add(make(), "arrival", 10, { provenance: { source: "S", licence: "L", date: day } }); expect(malformed(withSource, (v) => { (step(v).provenance as Record<string, unknown>).confidence = "verified"; })).toThrow(); });
  it("rejects null root", () => { expect(() => assertCoordinationBrief(null)).toThrow(); });
  it("rejects array root", () => { expect(() => assertCoordinationBrief([])).toThrow(); });
  it("rejects a missing version", () => { expect(malformed(valid, (v) => { delete v.schema; })).toThrow(); });
  it("rejects different version", () => { expect(malformed(valid, (v) => { v.schema = "future-v2"; })).toThrow(); });
  it("rejects missing region ID", () => { expect(malformed(valid, (v) => { delete v.regionId; })).toThrow(); });
  it("rejects invalid region ID", () => { expect(malformed(valid, (v) => { v.regionId = "../fake"; })).toThrow(); });
  it("rejects empty title", () => { expect(malformed(valid, (v) => { v.title = ""; })).toThrow(); });
  it("rejects nonstring date", () => { expect(malformed(valid, (v) => { v.date = 123; })).toThrow(); });
  it("rejects negative year", () => { expect(malformed(valid, (v) => { v.date = "-001-11-20"; })).toThrow(); });
  it("rejects invalid month", () => { expect(malformed(valid, (v) => { v.date = "2026-00-20"; })).toThrow(); });
  it("rejects invalid day", () => { expect(malformed(valid, (v) => { v.date = "2026-11-32"; })).toThrow(); });
  it("rejects nonarray steps", () => { expect(malformed(valid, (v) => { Object.assign(v, { steps: {} }); })).toThrow(); });
  it("rejects nonarray events", () => { expect(malformed(valid, (v) => { Object.assign(v, { events: {} }); })).toThrow(); });
  it("rejects null step", () => { expect(malformed(valid, (v) => { v.steps[0] = null; })).toThrow(); });
  it("rejects blank step ID", () => { expect(malformed(valid, (v) => { step(v).id = ""; })).toThrow(); });
  it("rejects step path ID", () => { expect(malformed(valid, (v) => { step(v).id = "../../x"; })).toThrow(); });
  it("rejects step order beyond the list", () => { expect(malformed(valid, (v) => { step(v).order = 30; })).toThrow(); });
  it("rejects negative step order", () => { expect(malformed(valid, (v) => { step(v).order = -1; })).toThrow(); });
  it("rejects noninteger step order", () => { expect(malformed(valid, (v) => { step(v).order = 0.5; })).toThrow(); });
  it("rejects invalid step topic", () => { expect(malformed(valid, (v) => { step(v).topic = "staircase"; })).toThrow(); });
  it("rejects invalid priority", () => { expect(malformed(valid, (v) => { step(v).priority = "critical"; })).toThrow(); });
  it("rejects blank question", () => { expect(malformed(valid, (v) => { step(v).question = ""; })).toThrow(); });
  it("rejects impossible access status", () => { expect(malformed(valid, (v) => { step(v).status = "accessible"; })).toThrow(); });
  it("rejects physical condition true", () => { expect(malformed(valid, (v) => { step(v).physicalCondition = true; })).toThrow(); });
  it("rejects physical condition false", () => { expect(malformed(valid, (v) => { step(v).physicalCondition = false; })).toThrow(); });
  it("rejects physical condition 'verified'", () => { expect(malformed(valid, (v) => { step(v).physicalCondition = "verified"; })).toThrow(); });
  it("rejects absent physical-condition status", () => { expect(malformed(valid, (v) => { delete step(v).physicalCondition; })).toThrow(); });
  it("rejects missing source date", () => { const withSource = add(make(), "arrival", 10, { provenance: { source: "S", licence: "L", date: day } }); expect(malformed(withSource, (v) => { delete (step(v).provenance as Record<string, unknown>).date; })).toThrow(); });
  it("rejects source provenance object without licence", () => { const withSource = add(make(), "arrival", 10, { provenance: { source: "S", licence: "L", date: day } }); expect(malformed(withSource, (v) => { (step(v).provenance as Record<string, unknown>).licence = ""; })).toThrow(); });
  it("rejects invalid source date", () => { const withSource = add(make(), "arrival", 10, { provenance: { source: "S", licence: "L", date: day } }); expect(malformed(withSource, (v) => { (step(v).provenance as Record<string, unknown>).date = "next week"; })).toThrow(); });
  it("rejects malformed created timestamp", () => { expect(malformed(valid, (v) => { step(v).created = "yesterday"; })).toThrow(); });
  it("rejects malformed updated timestamp", () => { expect(malformed(valid, (v) => { step(v).updated = "today"; })).toThrow(); });
  it("rejects updated timestamp before created", () => { expect(malformed(valid, (v) => { step(v).updated = "2026-01-01T00:00:00.000Z"; })).toThrow(); });
  it("rejects event without ID", () => { expect(malformed(valid, (v) => { delete event(v).id; })).toThrow(); });
  it("rejects event with invalid kind", () => { expect(malformed(valid, (v) => { event(v).kind = "claimed"; })).toThrow(); });
  it("rejects event with unknown step", () => { expect(malformed(valid, (v) => { event(v).stepId = "nonexistent"; })).toThrow(); });
  it("rejects event without summary", () => { expect(malformed(valid, (v) => { event(v).summary = ""; })).toThrow(); });
  it("rejects event without timestamp", () => { expect(malformed(valid, (v) => { event(v).at = null; })).toThrow(); });
  it("rejects event with wrong kind sequence", () => { expect(malformed(valid, (v) => { event(v).kind = "edited"; })).toThrow(); });
  it("rejects list with missing creation", () => { expect(malformed(valid, (v) => { v.events = []; })).toThrow(); });
  it("rejects duplicate live IDs", () => { expect(malformed(valid, (v) => { v.steps.push({ ...step(v) }); })).toThrow(); });
  it("rejects missing step while creation exists", () => { expect(malformed(valid, (v) => { v.steps = []; })).toThrow(); });
  it("rejects event that purports to delete still-present step", () => { expect(malformed(valid, (v) => { v.events.push({ id: "event-delete", stepId: "arrival", at: timestamp(11), kind: "removed", summary: "removed" }); })).toThrow(); });
  it("accepts a valid return from JSON import", () => { expect(parseCoordinationBrief(encodeCoordinationBrief(valid)).steps[0]?.id).toBe("arrival"); });
});
