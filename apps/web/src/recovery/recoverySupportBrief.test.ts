import { describe, expect, it } from "vitest";
import {
  BRIEF_ACTIONS, BRIEF_CONDITIONS, BRIEF_LIMITS, BRIEF_OPERATIONS,
  BRIEF_QUESTION_STATES, BRIEF_STATES, BRIEF_TIERS, BRIEF_TOPICS,
  addBriefObservation, addBriefQuestion, beginBrief, briefContentReady,
  briefDate, briefSummary, briefTime, changeBriefState, emptyBriefDocument,
  exportBriefs, filterBriefs, importBriefs, nextBriefId, validBriefCase,
  validBriefDocument, validBriefEvent, validBriefObservation, validBriefQuestion,
  validBriefSource, type BriefCase, type BriefDocument,
  type BriefObservation, type BriefQuestion,
} from "./recoverySupportBrief";
const now = "2026-11-19T10:00:00.000Z";
const next = "2026-11-19T11:00:00.000Z";
const later = "2026-11-19T12:00:00.000Z";
const source = { name: "Local inventory", licence: "Example licence", retrievedOn: "2026-11-19", reference: "local-source", tier: "UNKNOWN" as const };
const item = (id = "brief-1", overrides: Partial<BriefCase> = {}): BriefCase => ({ id, packId: "pack-a", title: "Interrupted download", operation: "download", condition: "UNKNOWN", openedAt: now, state: "draft", source, ...overrides });
const observation = (id = "observation-1", overrides: Partial<BriefObservation> = {}): BriefObservation => ({ id, briefId: "brief-1", capturedAt: next, condition: "UNKNOWN", summary: "A local operation stopped", source, ...overrides });
const question = (id = "question-1", overrides: Partial<BriefQuestion> = {}): BriefQuestion => ({ id, briefId: "brief-1", topic: "what-happened", state: "UNKNOWN", question: "Which step stopped?", response: "", capturedAt: next, source, ...overrides });
function open(): BriefDocument {
  const result = beginBrief(emptyBriefDocument(), item());
  if (!result.ok) throw Error(result.issue);
  return result.value;
}
function observed(): BriefDocument {
  const result = addBriefObservation(open(), observation());
  if (!result.ok) throw Error(result.issue);
  return result.value;
}
function questioned(): BriefDocument {
  const result = addBriefQuestion(open(), question());
  if (!result.ok) throw Error(result.issue);
  return result.value;
}
function assertOk<T>(result: { readonly ok: true; readonly value: T } | { readonly ok: false; readonly issue: string }): T {
  if (!result.ok) throw Error(`Unexpected ${result.issue}`);
  return result.value;
}

describe("support brief source validation", () => {
  it("accepts supplied provenance without upgrading the evidence tier", () => { expect(validBriefSource(source)).toBe(true); });
  it("retains UNKNOWN as a literal tier", () => { expect(BRIEF_TIERS).toContain("UNKNOWN"); });
  it("rejects missing source names", () => { expect(validBriefSource({ ...source, name: "" })).toBe(false); });
  it("rejects whitespace-only source names", () => { expect(validBriefSource({ ...source, name: "   " })).toBe(false); });
  it("rejects missing licence", () => { expect(validBriefSource({ ...source, licence: "" })).toBe(false); });
  it("rejects missing reference", () => { expect(validBriefSource({ ...source, reference: "  " })).toBe(false); });
  it("rejects a missing retrieval date", () => { expect(validBriefSource({ ...source, retrievedOn: "" })).toBe(false); });
  it("rejects extra source keys", () => { expect(validBriefSource({ ...source, secret: "not allowed" })).toBe(false); });
  it("rejects a null source", () => { expect(validBriefSource(null)).toBe(false); });
  it("rejects unknown tiers without inventing equivalence", () => { expect(validBriefSource({ ...source, tier: "assured" })).toBe(false); });
  it("rejects a NUL character", () => { expect(validBriefSource({ ...source, name: "bad\u0000name" })).toBe(false); });
  it("accepts normal line breaks in text", () => { expect(validBriefSource({ ...source, name: "Line one\nLine two" })).toBe(true); });
  it("rejects an excessively long licence", () => { expect(validBriefSource({ ...source, licence: "a".repeat(BRIEF_LIMITS.text + 1) })).toBe(false); });
  it("preserves every declared source property", () => { expect(Object.keys(source).sort()).toEqual(["licence", "name", "reference", "retrievedOn", "tier"]); });
  it.each(["2026-02-29", "2026-13-01", "2026-00-01", "2026-11-31", "2026-2-1", "today", "", null])("rejects invalid calendar days: %s", (day) => { expect(briefDate(day)).toBe(false); });
  it.each(["2024-02-29", "2026-11-19", "2025-12-31"]) ("accepts valid calendar days: %s", (day) => { expect(briefDate(day)).toBe(true); });
  it("requires a full timestamp", () => { expect(briefTime("2026-11-19")).toBe(false); });
  it("requires UTC timestamps", () => { expect(briefTime("2026-11-19T10:00:00-05:00")).toBe(false); });
  it("accepts a fractional UTC timestamp", () => { expect(briefTime(now)).toBe(true); });
  it("rejects a partial timestamp", () => { expect(briefTime("2026-11-19T10:00Z")).toBe(false); });
});

describe("support brief schema safety", () => {
  it("has an empty, valid document", () => { expect(validBriefDocument(emptyBriefDocument())).toBe(true); });
  it("never claims content readiness", () => { expect(briefContentReady()).toBe(false); });
  it("requires the expected schema", () => { expect(validBriefDocument({ ...emptyBriefDocument(), schema: "other" })).toBe(false); });
  it("does not accept extra root fields", () => { expect(validBriefDocument({ ...emptyBriefDocument(), telemetry: true })).toBe(false); });
  it("does not accept missing arrays", () => { expect(validBriefDocument({ schema: emptyBriefDocument().schema, briefs: [] })).toBe(false); });
  it("does not accept arrays of unrelated records", () => { expect(validBriefDocument({ ...emptyBriefDocument(), briefs: [null] })).toBe(false); });
  it("rejects IDs with unsafe path characters", () => { expect(validBriefCase(item("pack/../other"))).toBe(false); });
  it("rejects empty IDs", () => { expect(validBriefCase(item(""))).toBe(false); });
  it("rejects long IDs", () => { expect(validBriefCase(item("a".repeat(BRIEF_LIMITS.id + 1)))).toBe(false); });
  it("rejects extra case keys", () => { expect(validBriefCase({ ...item(), hidden: true })).toBe(false); });
  it("rejects unrecognized operations", () => { expect(validBriefCase({ ...item(), operation: "erase" })).toBe(false); });
  it("rejects unrecognized conditions", () => { expect(validBriefCase({ ...item(), condition: "ready" })).toBe(false); });
  it("rejects an empty title", () => { expect(validBriefCase({ ...item(), title: "" })).toBe(false); });
  it("rejects a case with source retrieved after creation", () => { expect(validBriefCase({ ...item(), source: { ...source, retrievedOn: "2026-11-20" } })).toBe(false); });
  it("rejects a case with an invalid time", () => { expect(validBriefCase({ ...item(), openedAt: "invalid" })).toBe(false); });
  it("accepts a valid observation", () => { expect(validBriefObservation(observation())).toBe(true); });
  it("rejects a future source retrieval on an observation", () => { expect(validBriefObservation(observation("observation-1", { source: { ...source, retrievedOn: "2026-11-20" } }))).toBe(false); });
  it("rejects an invalid observation condition", () => { expect(validBriefObservation(observation("observation-1", { condition: "complete" as never }))).toBe(false); });
  it("rejects an observation with extra keys", () => { expect(validBriefObservation({ ...observation(), x: true })).toBe(false); });
  it("accepts an UNKNOWN question", () => { expect(validBriefQuestion(question())).toBe(true); });
  it("does not treat an empty answered response as a completed answer", () => { expect(validBriefQuestion(question("q", { state: "answered" }))).toBe(false); });
  it("accepts an explicit answer", () => { expect(validBriefQuestion(question("q", { state: "answered", response: "Local source not available" }))).toBe(true); });
  it("rejects an unsupported question topic", () => { expect(validBriefQuestion({ ...question(), topic: "medical" })).toBe(false); });
  it("rejects an extra question property", () => { expect(validBriefQuestion({ ...question(), collectedBy: "automatic" })).toBe(false); });
  it("requires an event reference key", () => { expect(validBriefEvent({ id: "event-1", briefId: "brief-1", at: now, action: "created", note: "" })).toBe(false); });
  it("rejects an unknown event action", () => { expect(validBriefEvent({ ...open().events[0], action: "auto-retry" })).toBe(false); });
  it("rejects duplicate brief IDs", () => { const x = open(); expect(validBriefDocument({ ...x, briefs: [x.briefs[0], x.briefs[0]] })).toBe(false); });
  it("rejects duplicate event IDs", () => { const x = open(); expect(validBriefDocument({ ...x, events: [x.events[0], x.events[0]] })).toBe(false); });
  it("rejects questions attached to unknown briefs", () => { expect(validBriefDocument({ ...open(), questions: [question()] })).toBe(false); });
  it("rejects an observation without its append-only event", () => { expect(validBriefDocument({ ...open(), observations: [observation()] })).toBe(false); });
  it("accepts an opened case with a creation event", () => { expect(validBriefDocument(open())).toBe(true); });
  it("rejects an opened case missing the creation event", () => { expect(validBriefDocument({ ...open(), events: [] })).toBe(false); });
  it("rejects an open case with a forged reviewed phase", () => { const x = open(); expect(validBriefDocument({ ...x, briefs: [{ ...x.briefs[0]!, state: "review" }] })).toBe(false); });
  it("rejects an event attached to another case", () => { const x = open(); expect(validBriefDocument({ ...x, events: [{ ...x.events[0]!, briefId: "missing" }] })).toBe(false); });
  it("rejects a future question referenced by a past event", () => { const x = questioned(); expect(validBriefDocument({ ...x, questions: [{ ...x.questions[0]!, capturedAt: later }] })).toBe(false); });
  it("rejects observations captured before their case", () => { const x = observed(); expect(validBriefDocument({ ...x, observations: [{ ...x.observations[0]!, capturedAt: "2026-11-18T09:00:00.000Z" }] })).toBe(false); });
});

describe("manual case and evidence operations", () => {
  it("creates one case and creation event", () => { expect(open().events).toHaveLength(1); });
  it("refuses duplicate case IDs", () => { expect(beginBrief(open(), item()).ok).toBe(false); });
  it("preserves source metadata on case creation", () => { expect(open().briefs[0]?.source).toEqual(source); });
  it("does not infer an observed condition", () => { expect(open().briefs[0]?.condition).toBe("UNKNOWN"); });
  it("rejects a case that starts in archived state", () => { expect(beginBrief(emptyBriefDocument(), item("brief-2", { state: "archived" })).ok).toBe(false); });
  it("records an observation with provenance", () => { expect(observed().observations[0]?.source).toEqual(source); });
  it("records an observation event linked to the observation", () => { expect(observed().events[1]?.referenceId).toBe("observation-1"); });
  it("refuses an observation without an existing brief", () => { expect(addBriefObservation(open(), observation("o-2", { briefId: "missing" })).ok).toBe(false); });
  it("refuses a duplicate observation", () => { expect(addBriefObservation(observed(), observation()).ok).toBe(false); });
  it("refuses observation timestamps preceding the case", () => { expect(addBriefObservation(open(), observation("o-2", { capturedAt: "2026-11-18T09:00:00.000Z" })).ok).toBe(false); });
  it("preserves UNKNOWN on an observation", () => { expect(observed().observations[0]?.condition).toBe("UNKNOWN"); });
  it("records a question with its topic", () => { expect(questioned().questions[0]?.topic).toBe("what-happened"); });
  it("records a question event linked to its ID", () => { expect(questioned().events[1]?.referenceId).toBe("question-1"); });
  it("refuses an absent question reference", () => { expect(addBriefQuestion(open(), question("q-2", { briefId: "missing" })).ok).toBe(false); });
  it("refuses duplicate question IDs", () => { expect(addBriefQuestion(questioned(), question()).ok).toBe(false); });
  it("records an explicit answer without inferring a condition", () => { const x = assertOk(addBriefQuestion(open(), question("q-2", { state: "answered", response: "Unknown upstream source" }))); expect(x.briefs[0]?.condition).toBe("UNKNOWN"); });
  it("does not let notes update the initial observation", () => { const x = observed(); expect(x.briefs[0]?.condition).toBe("UNKNOWN"); });
  it("keeps the case source after a question", () => { expect(questioned().briefs[0]?.source).toEqual(source); });
  it("refuses a review transition for an unknown case", () => { expect(changeBriefState(open(), "missing", "review-requested", later).ok).toBe(false); });
  it("accepts draft to review", () => { expect(assertOk(changeBriefState(open(), "brief-1", "review-requested", later)).briefs[0]?.state).toBe("review"); });
  it("refuses draft directly to archived", () => { expect(changeBriefState(open(), "brief-1", "archived", later).ok).toBe(false); });
  it("accepts review to archived", () => { const x = assertOk(changeBriefState(open(), "brief-1", "review-requested", next)); expect(assertOk(changeBriefState(x, "brief-1", "archived", later)).briefs[0]?.state).toBe("archived"); });
  it("refuses duplicate review request", () => { const x = assertOk(changeBriefState(open(), "brief-1", "review-requested", next)); expect(changeBriefState(x, "brief-1", "review-requested", later).ok).toBe(false); });
  it("refuses archive before review time", () => { const x = assertOk(changeBriefState(open(), "brief-1", "review-requested", later)); expect(changeBriefState(x, "brief-1", "archived", next).ok).toBe(false); });
  it("refuses new observations after archival", () => { const x = assertOk(changeBriefState(assertOk(changeBriefState(open(), "brief-1", "review-requested", next)), "brief-1", "archived", later)); expect(addBriefObservation(x, observation("new", { capturedAt: later })).ok).toBe(false); });
  it("refuses new questions after archival", () => { const x = assertOk(changeBriefState(assertOk(changeBriefState(open(), "brief-1", "review-requested", next)), "brief-1", "archived", later)); expect(addBriefQuestion(x, question("new", { capturedAt: later })).ok).toBe(false); });
  it("keeps the exported summary fail closed", () => { expect(briefSummary(open()).contentReady).toBe(false); });
});

describe("known tokens and manual filters", () => {
  it("enumerates the literal UNKNOWN condition", () => { expect(BRIEF_CONDITIONS).toContain("UNKNOWN"); });
  it("enumerates UNKNOWN question state", () => { expect(BRIEF_QUESTION_STATES).toContain("UNKNOWN"); });
  it("exposes every topic for manual selection", () => { expect(BRIEF_TOPICS).toHaveLength(5); });
  it("exposes operations without changing pack state", () => { expect(BRIEF_OPERATIONS).toEqual(["pack", "download", "storage", "transfer", "other"]); });
  it("does not include ready as a supported condition", () => { expect(BRIEF_CONDITIONS).not.toContain("ready"); });
  it("does not support automatic retries", () => { expect(BRIEF_ACTIONS).not.toContain("retry"); });
  it("reports no cases in empty summary", () => { expect(briefSummary(emptyBriefDocument()).briefs).toBe(0); });
  it("counts all observations", () => { expect(briefSummary(observed()).observations).toBe(1); });
  it("counts all questions", () => { expect(briefSummary(questioned()).questions).toBe(1); });
  it("counts unanswered UNKNOWN questions", () => { expect(briefSummary(questioned()).unanswered).toBe(1); });
  it("counts distinct packs, not distinct observations", () => { expect(briefSummary(observed()).distinctPacks).toBe(1); });
  it("filters by pack identifier", () => { expect(filterBriefs(open(), { packId: "pack-a" })).toHaveLength(1); });
  it("filters out other pack IDs", () => { expect(filterBriefs(open(), { packId: "pack-b" })).toHaveLength(0); });
  it("filters by condition", () => { expect(filterBriefs(open(), { condition: "UNKNOWN" })).toHaveLength(1); });
  it("filters by state", () => { expect(filterBriefs(open(), { state: "review" })).toHaveLength(0); });
  it("filters by title text case-insensitively", () => { expect(filterBriefs(open(), { search: "INTERRUPTED" })).toHaveLength(1); });
  it("filters by an unrelated title", () => { expect(filterBriefs(open(), { search: "not-found" })).toHaveLength(0); });
  it("creates another free ID after an existing identifier", () => { expect(nextBriefId(open(), "brief")).toBe("brief-2"); });
  it("does not reuse an existing event ID", () => { expect(nextBriefId(open(), "event")).toBe("event-2"); });
  it("retains the exact states", () => { expect(BRIEF_STATES).toEqual(["draft", "review", "archived"]); });
  it("allows explicitly documented evidence tier", () => { expect(BRIEF_TIERS).toContain("documented"); });
  it("preserves manual handoff question topic", () => { expect(BRIEF_TOPICS).toContain("handoff"); });
});

describe("bounded local serialization", () => {
  it("exports an empty valid document", () => { expect(exportBriefs(emptyBriefDocument()).ok).toBe(true); });
  it("imports a valid serialized brief", () => { const raw = assertOk(exportBriefs(open())); expect(importBriefs(raw).ok).toBe(true); });
  it("preserves UNKNOWN after a round-trip", () => { const raw = assertOk(exportBriefs(open())); expect(assertOk(importBriefs(raw)).briefs[0]?.condition).toBe("UNKNOWN"); });
  it("round-trips an observation and its event", () => { const raw = assertOk(exportBriefs(observed())); expect(assertOk(importBriefs(raw)).events).toHaveLength(2); });
  it("round-trips a question", () => { const raw = assertOk(exportBriefs(questioned())); expect(assertOk(importBriefs(raw)).questions).toHaveLength(1); });
  it("rejects empty JSON input", () => { expect(importBriefs("").ok).toBe(false); });
  it("rejects JSON null", () => { expect(importBriefs("null").ok).toBe(false); });
  it("rejects an object missing its schema", () => { expect(importBriefs(JSON.stringify({ briefs: [] })).ok).toBe(false); });
  it("rejects unknown root keys", () => { expect(importBriefs(JSON.stringify({ ...emptyBriefDocument(), privateData: "x" })).ok).toBe(false); });
  it("rejects file size over the cap", () => { expect(importBriefs("x".repeat(BRIEF_LIMITS.bytes + 1)).ok).toBe(false); });
  it("does not return invalid partial documents", () => { expect(importBriefs('{"schema":"a"').ok).toBe(false); });
  it("rejects invalid JSON with trailing punctuation", () => { expect(importBriefs(`${JSON.stringify(open())},`).ok).toBe(false); });
  it("rejects an exported invalid document", () => { expect(exportBriefs({ ...open(), questions: [{ ...question(), briefId: "unknown" }] }).ok).toBe(false); });
  it("rejects a forged stage on import", () => { const x = open(); expect(importBriefs(JSON.stringify({ ...x, briefs: [{ ...x.briefs[0]!, state: "archived" }] })).ok).toBe(false); });
  it("keeps source provenance from the imported file", () => { const raw = assertOk(exportBriefs(open())); expect(assertOk(importBriefs(raw)).briefs[0]?.source.reference).toBe(source.reference); });
  it("does not invent any email, phone or personal fields", () => { expect(Object.keys(open().briefs[0]!)).toEqual(["id", "packId", "title", "operation", "condition", "openedAt", "state", "source"]); });
});
