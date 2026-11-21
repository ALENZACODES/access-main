import { describe, expect, it } from "vitest";
import {
  addBriefNote, addBriefStep, assertCoordinationBrief, briefForRegion, createCoordinationBrief,
  editBriefStep, encodeCoordinationBrief, moveBriefStep, pageBriefSteps, parseCoordinationBrief,
  removeBriefStep, setBriefStatus, summarizeBrief, type CoordinationBrief, type StepDraft,
} from "./coordinationBrief";
const t1 = "2026-11-20T14:00:00.000Z";
const t2 = "2026-11-20T15:00:00.000Z";
const t3 = "2026-11-20T16:00:00.000Z";
const provenance = { source: "Open data example", licence: "Open Government Licence", date: "2026-10-01" };
const draft: StepDraft = { label: "Entrance question", topic: "entrance", priority: "essential",
  question: "Which entrance should we ask about?", fallbackQuestion: "Who knows the alternate entrance?",
  contactMethod: "Telephone", note: "Ask directly", provenance };
function empty(): CoordinationBrief { return createCoordinationBrief("local-region", "Outing brief", "2026-11-20"); }
function one(): CoordinationBrief { return addBriefStep(empty(), "entry", "ev-1", t1, draft); }
function two(): CoordinationBrief { return addBriefStep(one(), "washroom", "ev-2", t2,
  { ...draft, label: "Washroom question", topic: "washroom", priority: "helpful", question: "What should we ask?", fallbackQuestion: "Who knows about the washroom?", provenance: null }); }
const page = (book: CoordinationBrief, overrides: Partial<Parameters<typeof pageBriefSteps>[1]> = {}) =>
  pageBriefSteps(book, { search: "", filter: "all", sort: "order", offset: 0, limit: 10, ...overrides });
describe("offline coordination brief: creation", () => {
  it("starts with a versioned empty book", () => { expect(empty().schema).toBe("offline-coordination-brief-v1"); });
  it("retains the region and explicit date", () => { expect(empty().regionId).toBe("local-region"); expect(empty().date).toBe("2026-11-20"); });
  it("starts with zero steps and events", () => { expect(empty().steps).toHaveLength(0); expect(empty().events).toHaveLength(0); });
  it("rejects a blank region", () => { expect(() => createCoordinationBrief("", "Brief", "2026-11-20")).toThrow(); });
  it("rejects region paths", () => { expect(() => createCoordinationBrief("../region", "Brief", "2026-11-20")).toThrow(); });
  it("rejects blank title", () => { expect(() => createCoordinationBrief("region", "", "2026-11-20")).toThrow(); });
  it("rejects invalid day", () => { expect(() => createCoordinationBrief("region", "Brief", "2026-11-31")).toThrow(); });
  it("accepts actual leap day", () => { expect(createCoordinationBrief("region", "Brief", "2024-02-29").date).toBe("2024-02-29"); });
  it("rejects invalid leap day", () => { expect(() => createCoordinationBrief("region", "Brief", "2025-02-29")).toThrow(); });
  it("rejects oversized context", () => { expect(() => createCoordinationBrief("region", "Brief", "2026-11-20", "X".repeat(2001))).toThrow(); });
  it("preserves explicit context", () => { expect(createCoordinationBrief("region", "Brief", "2026-11-20", "Museum enquiry").context).toBe("Museum enquiry"); });
  it("names only same local region, never a different one", () => { expect(briefForRegion(empty(), "another")).toBe("UNKNOWN"); });
  it("does not claim place accessibility for matching region", () => { expect(briefForRegion(empty(), "local-region")).toBe("same-region"); });
});
describe("offline coordination brief: steps", () => {
  it("adds user-authored checkpoint with source", () => { expect(one().steps[0]?.provenance).toEqual(provenance); });
  it("starts all physical conditions at UNKNOWN", () => { expect(one().steps[0]?.physicalCondition).toBe("UNKNOWN"); });
  it("starts reply status at UNKNOWN", () => { expect(one().steps[0]?.status).toBe("UNKNOWN"); });
  it("retains the exact question, no inferred answers", () => { expect(one().steps[0]?.question).toBe(draft.question); });
  it("retains fallback as question, never an access promise", () => { expect(one().steps[0]?.fallbackQuestion).toBe(draft.fallbackQuestion); });
  it("adds creation event", () => { expect(one().events[0]?.kind).toBe("created"); });
  it("leaves input empty book unchanged", () => { const b = empty(); addBriefStep(b, "entry", "ev-1", t1, draft); expect(b.steps).toHaveLength(0); });
  it("orders second checkpoint after first", () => { expect(two().steps.map((s) => s.order)).toEqual([0, 1]); });
  it("allows no source, not fabricated licence", () => { expect(two().steps[1]?.provenance).toBeNull(); });
  it("rejects duplicate step IDs", () => { expect(() => addBriefStep(one(), "entry", "ev-2", t2, draft)).toThrow(); });
  it("rejects duplicate event IDs", () => { expect(() => addBriefStep(one(), "other", "ev-1", t2, draft)).toThrow(); });
  it("rejects events earlier than prior events", () => { expect(() => addBriefStep(one(), "other", "ev-2", "2026-11-20T13:00:00.000Z", draft)).toThrow(); });
  it("rejects blank question", () => { expect(() => addBriefStep(empty(), "entry", "ev-1", t1, { ...draft, question: "" })).toThrow(); });
  it("rejects blank label", () => { expect(() => addBriefStep(empty(), "entry", "ev-1", t1, { ...draft, label: "" })).toThrow(); });
  it("rejects overlong label", () => { expect(() => addBriefStep(empty(), "entry", "ev-1", t1, { ...draft, label: "a".repeat(141) })).toThrow(); });
  it("rejects overlong note", () => { expect(() => addBriefStep(empty(), "entry", "ev-1", t1, { ...draft, note: "a".repeat(2001) })).toThrow(); });
  it("rejects overlong question", () => { expect(() => addBriefStep(empty(), "entry", "ev-1", t1, { ...draft, question: "q".repeat(1001) })).toThrow(); });
  it("rejects metadata without licence", () => { expect(() => addBriefStep(empty(), "entry", "ev-1", t1, { ...draft, provenance: { ...provenance, licence: "" } })).toThrow(); });
  it("rejects metadata with invalid date", () => { expect(() => addBriefStep(empty(), "entry", "ev-1", t1, { ...draft, provenance: { ...provenance, date: "2026-14-01" } })).toThrow(); });
  it("rejects an invalid topic", () => { expect(() => addBriefStep(empty(), "entry", "ev-1", t1, { ...draft, topic: "elevator" as StepDraft["topic"] })).toThrow(); });
  it("rejects invalid priority", () => { expect(() => addBriefStep(empty(), "entry", "ev-1", t1, { ...draft, priority: "urgent" as StepDraft["priority"] })).toThrow(); });
  it("accepts empty optional contact", () => { expect(addBriefStep(empty(), "entry", "ev-1", t1, { ...draft, contactMethod: "" }).steps[0]?.contactMethod).toBe(""); });
  it("records the exact update timestamp", () => { expect(one().steps[0]?.updated).toBe(t1); });
  it("rejects malformed timestamp", () => { expect(() => addBriefStep(empty(), "entry", "ev-1", "now", draft)).toThrow(); });
});
describe("offline coordination brief: state changes", () => {
  it("records a question asked without implying a reply", () => { expect(setBriefStatus(one(), "entry", "ev-2", t2, "asked").steps[0]?.status).toBe("asked"); });
  it("records a reply without changing physical UNKNOWN", () => { const s = setBriefStatus(one(), "entry", "ev-2", t2, "reply-recorded").steps[0]; expect(s?.physicalCondition).toBe("UNKNOWN"); });
  it("records follow-up explicitly", () => { expect(setBriefStatus(one(), "entry", "ev-2", t2, "follow-up").events[1]?.summary).toBe("follow-up"); });
  it("reopening returns to UNKNOWN", () => { const b = setBriefStatus(one(), "entry", "ev-2", t2, "asked"); expect(setBriefStatus(b, "entry", "ev-3", t3, "UNKNOWN").events[2]?.kind).toBe("reopened"); });
  it("rejects unmodified status", () => { expect(() => setBriefStatus(one(), "entry", "ev-2", t2, "UNKNOWN")).toThrow(); });
  it("rejects unknown step ID", () => { expect(() => setBriefStatus(one(), "fake", "ev-2", t2, "asked")).toThrow(); });
  it("rejects invalid status token", () => { expect(() => setBriefStatus(one(), "entry", "ev-2", t2, "confirmed" as "asked")).toThrow(); });
  it("does not mutate old book on status change", () => { const b = one(); setBriefStatus(b, "entry", "ev-2", t2, "asked"); expect(b.steps[0]?.status).toBe("UNKNOWN"); });
  it("edits a question and retains source metadata", () => { const b = editBriefStep(one(), "entry", "ev-2", t2, { ...draft, question: "New question" }); expect(b.steps[0]?.question).toBe("New question"); expect(b.steps[0]?.provenance).toEqual(provenance); });
  it("keeps the original creation date on edit", () => { expect(editBriefStep(one(), "entry", "ev-2", t2, draft).steps[0]?.created).toBe(t1); });
  it("edits metadata without inventing status", () => { expect(editBriefStep(one(), "entry", "ev-2", t2, { ...draft, provenance: null }).steps[0]?.status).toBe("UNKNOWN"); });
  it("rejects edits to missing step", () => { expect(() => editBriefStep(one(), "missing", "ev-2", t2, draft)).toThrow(); });
  it("rejects edits earlier than step update", () => { expect(() => editBriefStep(one(), "entry", "ev-2", "2026-11-20T13:00:00.000Z", draft)).toThrow(); });
  it("appends a private note", () => { expect(addBriefNote(one(), "entry", "ev-2", t2, "Second note").steps[0]?.note).toBe("Ask directly\nSecond note"); });
  it("preserves notes without ever inferring suitability", () => { expect(addBriefNote(one(), "entry", "ev-2", t2, "They replied").steps[0]?.physicalCondition).toBe("UNKNOWN"); });
  it("rejects empty appended note", () => { expect(() => addBriefNote(one(), "entry", "ev-2", t2, "")).toThrow(); });
  it("rejects note append overflow", () => { const b = editBriefStep(one(), "entry", "ev-2", t2, { ...draft, note: "a".repeat(2000) }); expect(() => addBriefNote(b, "entry", "ev-3", t3, "extra")).toThrow(); });
  it("rejects note append to missing step", () => { expect(() => addBriefNote(one(), "missing", "ev-2", t2, "extra")).toThrow(); });
  it("retains update time on a note", () => { expect(addBriefNote(one(), "entry", "ev-2", t2, "extra").steps[0]?.updated).toBe(t2); });
});
describe("offline coordination brief: ordering", () => {
  it("reorders a checkpoint without changing contents", () => { const b = moveBriefStep(two(), "washroom", 0, "ev-3", t3); expect(page(b).rows.map((s) => s.id)).toEqual(["washroom", "entry"]); });
  it("keeps explicit sequential orders", () => { expect(moveBriefStep(two(), "washroom", 0, "ev-3", t3).steps.map((s) => s.order)).toEqual([0, 1]); });
  it("records a move event", () => { expect(moveBriefStep(two(), "washroom", 0, "ev-3", t3).events[2]?.kind).toBe("moved"); });
  it("rejects movement to same place", () => { expect(() => moveBriefStep(two(), "washroom", 1, "ev-3", t3)).toThrow(); });
  it("rejects movement outside list", () => { expect(() => moveBriefStep(two(), "washroom", 2, "ev-3", t3)).toThrow(); });
  it("rejects negative position", () => { expect(() => moveBriefStep(two(), "washroom", -1, "ev-3", t3)).toThrow(); });
  it("rejects missing step", () => { expect(() => moveBriefStep(two(), "missing", 0, "ev-3", t3)).toThrow(); });
  it("removes only selected checkpoint", () => { expect(removeBriefStep(two(), "entry", "ev-3", t3).steps.map((s) => s.id)).toEqual(["washroom"]); });
  it("compacts orders after remove", () => { expect(removeBriefStep(two(), "entry", "ev-3", t3).steps[0]?.order).toBe(0); });
  it("records removal event", () => { expect(removeBriefStep(two(), "entry", "ev-3", t3).events[2]?.kind).toBe("removed"); });
  it("rejects double deletion", () => { const b = removeBriefStep(two(), "entry", "ev-3", t3); expect(() => removeBriefStep(b, "entry", "ev-4", "2026-11-20T17:00:00.000Z")).toThrow(); });
  it("preserves immutable original on remove", () => { const b = two(); removeBriefStep(b, "entry", "ev-3", t3); expect(b.steps).toHaveLength(2); });
});
describe("offline coordination brief: summary and pagination", () => {
  it("reports zero counts for empty book", () => { expect(summarizeBrief(empty()).total).toBe(0); });
  it("counts all physical conditions as UNKNOWN", () => { expect(summarizeBrief(two()).unknownConditions).toBe(2); });
  it("counts missing sources without guessing", () => { expect(summarizeBrief(two()).sourceUnspecified).toBe(1); });
  it("counts essential steps separately", () => { expect(summarizeBrief(two()).essential).toBe(1); });
  it("counts both unanswered checkpoints", () => { expect(summarizeBrief(two()).unanswered).toBe(2); });
  it("changes reply count after manual status update", () => { const b = setBriefStatus(two(), "washroom", "ev-3", t3, "reply-recorded"); expect(summarizeBrief(b).replies).toBe(1); });
  it("still treats non-replied item as unanswered", () => { const b = setBriefStatus(two(), "washroom", "ev-3", t3, "reply-recorded"); expect(summarizeBrief(b).unanswered).toBe(1); });
  it("filters by essential", () => { expect(page(two(), { filter: "essential" }).rows.map((s) => s.id)).toEqual(["entry"]); });
  it("filters unanswered", () => { expect(page(two(), { filter: "unanswered" }).total).toBe(2); });
  it("filters replies", () => { expect(page(two(), { filter: "reply-recorded" }).total).toBe(0); });
  it("finds a question by case-insensitive text", () => { expect(page(two(), { search: "WASHROOM" }).rows.map((s) => s.id)).toEqual(["washroom"]); });
  it("finds a fallback question", () => { expect(page(two(), { search: "alternate entrance" }).rows.map((s) => s.id)).toEqual(["entry"]); });
  it("finds by topic", () => { expect(page(two(), { search: "entrance" }).rows.map((s) => s.id)).toEqual(["entry"]); });
  it("reports next page", () => { expect(page(two(), { limit: 1 }).next).toBe(true); });
  it("reports prior page", () => { expect(page(two(), { limit: 1, offset: 1 }).previous).toBe(true); });
  it("does not invent a next page after last", () => { expect(page(two(), { offset: 1, limit: 1 }).next).toBe(false); });
  it("rejects page size zero", () => { expect(() => page(two(), { limit: 0 })).toThrow(); });
  it("rejects page size above hard cap", () => { expect(() => page(two(), { limit: 41 })).toThrow(); });
  it("rejects negative offset", () => { expect(() => page(two(), { offset: -1 })).toThrow(); });
  it("rejects huge search input", () => { expect(() => page(two(), { search: "z".repeat(181) })).toThrow(); });
  it("sorts essential first", () => { expect(page(two(), { sort: "priority" }).rows.map((s) => s.id)).toEqual(["entry", "washroom"]); });
  it("sorts most recently modified first", () => { expect(page(two(), { sort: "updated" }).rows.map((s) => s.id)).toEqual(["washroom", "entry"]); });
  it("does not mutate insertion order when sorting", () => { const b = two(); page(b, { sort: "updated" }); expect(b.steps.map((s) => s.id)).toEqual(["entry", "washroom"]); });
});
describe("offline coordination brief: safe export", () => {
  it("serializes valid JSON", () => { expect(JSON.parse(encodeCoordinationBrief(one())).schema).toBe("offline-coordination-brief-v1"); });
  it("exports with newline", () => { expect(encodeCoordinationBrief(two()).endsWith("\n")).toBe(true); });
  it("round-trips a real note", () => { expect(parseCoordinationBrief(encodeCoordinationBrief(one())).steps[0]?.note).toBe("Ask directly"); });
  it("round-trips source and licence", () => { expect(parseCoordinationBrief(encodeCoordinationBrief(one())).steps[0]?.provenance).toEqual(provenance); });
  it("round-trips UNKNOWN conditions", () => { expect(parseCoordinationBrief(encodeCoordinationBrief(one())).steps[0]?.physicalCondition).toBe("UNKNOWN"); });
  it("rejects invalid JSON", () => { expect(() => parseCoordinationBrief("{" )).toThrow(); });
  it("rejects wrong schema", () => { expect(() => parseCoordinationBrief('{"schema":"wrong"}')).toThrow(); });
  it("rejects an oversized imported file", () => { expect(() => parseCoordinationBrief(" ".repeat(360_001))).toThrow(); });
  it("rejects an extra step without a creation event", () => { const value = JSON.parse(encodeCoordinationBrief(one())); value.steps.push({ ...value.steps[0], id: "fake", order: 1 }); expect(() => assertCoordinationBrief(value)).toThrow(); });
  it("rejects corrupted physical condition", () => { const value = JSON.parse(encodeCoordinationBrief(one())); value.steps[0].physicalCondition = "yes"; expect(() => assertCoordinationBrief(value)).toThrow(); });
  it("rejects duplicate event ID", () => { const value = JSON.parse(encodeCoordinationBrief(one())); value.events.push({ ...value.events[0] }); expect(() => assertCoordinationBrief(value)).toThrow(); });
  it("rejects deleted event history", () => { const value = JSON.parse(encodeCoordinationBrief(one())); value.events = []; expect(() => assertCoordinationBrief(value)).toThrow(); });
  it("rejects timestamps outside chronology", () => { const value = JSON.parse(encodeCoordinationBrief(one())); value.steps[0].updated = "2026-11-20T00:00:00.000Z"; expect(() => assertCoordinationBrief(value)).toThrow(); });
  it("rejects invented source metadata", () => { const value = JSON.parse(encodeCoordinationBrief(one())); value.steps[0].provenance.date = "2026-13-01"; expect(() => assertCoordinationBrief(value)).toThrow(); });
  it("rejects event about missing step", () => { const value = JSON.parse(encodeCoordinationBrief(one())); value.events.push({ id: "ev-2", at: t2, stepId: "unknown", kind: "note", summary: "X" }); expect(() => assertCoordinationBrief(value)).toThrow(); });
  it("rejects duplicate positions", () => { const value = JSON.parse(encodeCoordinationBrief(two())); value.steps[1].order = 0; expect(() => assertCoordinationBrief(value)).toThrow(); });
  it("is deterministic without current-time metadata", () => { expect(encodeCoordinationBrief(one())).toBe(encodeCoordinationBrief(one())); });
  it("does not contain browser location fields", () => { expect(encodeCoordinationBrief(one())).not.toContain("latitude"); });
  it("does not include downloaded content", () => { expect(encodeCoordinationBrief(one())).not.toContain("payloadBytes"); });
});
