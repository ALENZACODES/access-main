import { describe, expect, it } from "vitest";
import {
  GUIDED_ACTIONS, GUIDED_CONDITIONS, GUIDED_EVIDENCE, GUIDED_LIMITS, GUIDED_OUTCOMES,
  GUIDED_PHASES, GUIDED_TIERS, GUIDED_TOPICS, appendGuidedEvent, beginGuidedCase,
  checkGuidedCase, checkGuidedDocument, checkGuidedEvent, checkGuidedSource, checkGuidedStep,
  emptyGuidedDocument, filterGuidedCases, guidedContentReady, guidedEventsFor,
  guidedPhaseFromEvents, guidedStepsFor, guidedSummary, nextGuidedId,
  recordGuidedStep, type GuidedCase, type GuidedDocument, type GuidedEvent,
  type GuidedSource, type GuidedStep,
} from "./recoveryGuidedReview";

const stamp = "2026-11-20T11:00:00.000Z";
const source: GuidedSource = { name: "Local example", licence: "Example licence", retrievedOn: "2026-11-19", reference: "local-review", tier: "UNKNOWN" };
const makeCase = (id = "case-1", update: Partial<GuidedCase> = {}): GuidedCase => ({
  id, packId: "pack-a", condition: "UNKNOWN", phase: "draft", title: "Interrupted local transfer",
  openedAt: stamp, source, ...update,
});
const makeStep = (id = "step-1", update: Partial<GuidedStep> = {}): GuidedStep => ({
  id, caseId: "case-1", topic: "identify", evidence: "UNKNOWN", outcome: "UNKNOWN",
  note: "Manual observation", capturedAt: "2026-11-20T11:01:00.000Z", source, ...update,
});
const makeEvent = (id = "event-1", update: Partial<GuidedEvent> = {}): GuidedEvent => ({
  id, caseId: "case-1", action: "note-added", at: "2026-11-20T11:02:00.000Z", note: "Manual note", stepId: null, ...update,
});
const doc = (cases: GuidedCase[] = [], steps: GuidedStep[] = [], events: GuidedEvent[] = []): GuidedDocument => ({ ...emptyGuidedDocument(), cases, steps, events });

describe("guided recovery review public vocabulary", () => {
  it("contains each manually selectable topic", () => {
    expect(GUIDED_TOPICS).toEqual(["identify", "connection", "storage", "permissions", "integrity", "transfer", "follow-up"]);
  });
  it("retains literal UNKNOWN for condition", () => {
    expect(GUIDED_CONDITIONS).toContain("UNKNOWN");
  });
  it("retains literal UNKNOWN for evidence", () => {
    expect(GUIDED_EVIDENCE).toContain("UNKNOWN");
  });
  it("retains literal UNKNOWN for outcome", () => {
    expect(GUIDED_OUTCOMES).toContain("UNKNOWN");
  });
  it("retains literal UNKNOWN for evidence tier", () => {
    expect(GUIDED_TIERS).toContain("UNKNOWN");
  });
  it("defines review phases without a ready state", () => {
    expect(GUIDED_PHASES).toEqual(["draft", "review", "closed"]);
  });
  it("does not define an automatic action", () => {
    expect(GUIDED_ACTIONS).not.toContain("automatic-retry");
  });
  it("limits local file size", () => {
    expect(GUIDED_LIMITS.bytes).toBeLessThanOrEqual(524288);
  });
  it("limits local number of cases", () => {
    expect(GUIDED_LIMITS.cases).toBeGreaterThan(0);
    expect(GUIDED_LIMITS.cases).toBeLessThan(1000);
  });
  it("does not mark empty records usable", () => {
    expect(guidedContentReady(emptyGuidedDocument())).toBe(false);
  });
  it("creates a truly empty document", () => {
    expect(emptyGuidedDocument()).toMatchObject({ cases: [], steps: [], events: [] });
  });
});

describe("guided provenance validation", () => {
  it("accepts explicitly supplied provenance", () => {
    expect(checkGuidedSource(source)).toBe(true);
  });
  it("rejects missing source", () => {
    expect(checkGuidedSource({ ...source, name: "" })).toBe(false);
  });
  it("rejects whitespace source", () => {
    expect(checkGuidedSource({ ...source, name: "   " })).toBe(false);
  });
  it("rejects missing licence", () => {
    expect(checkGuidedSource({ ...source, licence: "" })).toBe(false);
  });
  it("rejects blank reference", () => {
    expect(checkGuidedSource({ ...source, reference: " " })).toBe(false);
  });
  it("rejects impossible calendar dates", () => {
    expect(checkGuidedSource({ ...source, retrievedOn: "2026-02-30" })).toBe(false);
  });
  it("rejects incomplete calendar dates", () => {
    expect(checkGuidedSource({ ...source, retrievedOn: "2026-1-1" })).toBe(false);
  });
  it("rejects unlisted evidence tier", () => {
    expect(checkGuidedSource({ ...source, tier: "trusted" })).toBe(false);
  });
  it("rejects extra provenance keys", () => {
    expect(checkGuidedSource({ ...source, approved: true })).toBe(false);
  });
  it("rejects carriage-control characters", () => {
    expect(checkGuidedSource({ ...source, name: "Local\u0003source" })).toBe(false);
  });
  it("accepts human-readable line breaks", () => {
    expect(checkGuidedSource({ ...source, name: "Local\nsource" })).toBe(true);
  });
  it("accepts every supported provenance tier", () => {
    for (const tier of GUIDED_TIERS) expect(checkGuidedSource({ ...source, tier })).toBe(true);
  });
  it("rejects null provenance", () => {
    expect(checkGuidedSource(null)).toBe(false);
  });
  it("rejects primitive provenance", () => {
    expect(checkGuidedSource("source")).toBe(false);
  });
});

describe("guided case validation", () => {
  it("accepts a draft case with unknown condition", () => {
    expect(checkGuidedCase(makeCase())).toBe(true);
  });
  it("accepts every supported condition", () => {
    for (const condition of GUIDED_CONDITIONS) expect(checkGuidedCase(makeCase("case-1", { condition }))).toBe(true);
  });
  it("rejects empty identity", () => {
    expect(checkGuidedCase(makeCase(""))).toBe(false);
  });
  it("rejects unsafe identity", () => {
    expect(checkGuidedCase(makeCase("../unsafe"))).toBe(false);
  });
  it("rejects empty pack identity", () => {
    expect(checkGuidedCase(makeCase("case-1", { packId: "" }))).toBe(false);
  });
  it("rejects missing title", () => {
    expect(checkGuidedCase(makeCase("case-1", { title: "" }))).toBe(false);
  });
  it("rejects an unsupported condition", () => {
    expect(checkGuidedCase({ ...makeCase(), condition: "ready" })).toBe(false);
  });
  it("rejects unsupported lifecycle state", () => {
    expect(checkGuidedCase({ ...makeCase(), phase: "complete" })).toBe(false);
  });
  it("rejects an impossible UTC calendar day", () => {
    expect(checkGuidedCase(makeCase("case-1", { openedAt: "2026-02-30T11:00:00Z" }))).toBe(false);
  });
  it("rejects invalid UTC timestamp", () => {
    expect(checkGuidedCase(makeCase("case-1", { openedAt: "2026-11-20" }))).toBe(false);
  });
  it("rejects source dated after observation", () => {
    expect(checkGuidedCase(makeCase("case-1", { source: { ...source, retrievedOn: "2026-11-21" } }))).toBe(false);
  });
  it("rejects source with missing licence", () => {
    expect(checkGuidedCase(makeCase("case-1", { source: { ...source, licence: "" } }))).toBe(false);
  });
  it("rejects invented assurance flag", () => {
    expect(checkGuidedCase({ ...makeCase(), isUsable: true })).toBe(false);
  });
});

describe("guided step validation", () => {
  it("accepts manually recorded step", () => {
    expect(checkGuidedStep(makeStep())).toBe(true);
  });
  it("accepts all supported topics", () => {
    for (const topic of GUIDED_TOPICS) expect(checkGuidedStep(makeStep("step-1", { topic }))).toBe(true);
  });
  it("accepts all evidence statuses", () => {
    for (const evidence of GUIDED_EVIDENCE) expect(checkGuidedStep(makeStep("step-1", { evidence }))).toBe(true);
  });
  it("accepts all manually recorded outcomes", () => {
    for (const outcome of GUIDED_OUTCOMES) expect(checkGuidedStep(makeStep("step-1", { outcome }))).toBe(true);
  });
  it("rejects missing case link", () => {
    expect(checkGuidedStep(makeStep("step-1", { caseId: "" }))).toBe(false);
  });
  it("rejects unsupported topic", () => {
    expect(checkGuidedStep({ ...makeStep(), topic: "medical" })).toBe(false);
  });
  it("rejects impossible source date", () => {
    expect(checkGuidedStep(makeStep("step-1", { source: { ...source, retrievedOn: "2026-00-01" } }))).toBe(false);
  });
  it("rejects invalid timestamp format", () => {
    expect(checkGuidedStep(makeStep("step-1", { capturedAt: "tomorrow" }))).toBe(false);
  });
  it("rejects unexpected extra data", () => {
    expect(checkGuidedStep({ ...makeStep(), unsafe: "extra" })).toBe(false);
  });
  it("rejects invisible controls", () => {
    expect(checkGuidedStep(makeStep("step-1", { note: "bad\u0007note" }))).toBe(false);
  });
});

describe("guided event validation", () => {
  it("accepts note-added event", () => {
    expect(checkGuidedEvent(makeEvent())).toBe(true);
  });
  it("accepts every listed action", () => {
    for (const action of GUIDED_ACTIONS) expect(checkGuidedEvent(makeEvent("event-1", { action }))).toBe(true);
  });
  it("rejects cross-case id syntax", () => {
    expect(checkGuidedEvent(makeEvent("event-1", { caseId: "../pack" }))).toBe(false);
  });
  it("rejects unlisted action", () => {
    expect(checkGuidedEvent({ ...makeEvent(), action: "retry" })).toBe(false);
  });
  it("rejects invalid timestamp", () => {
    expect(checkGuidedEvent(makeEvent("event-1", { at: "2026-02-30" }))).toBe(false);
  });
  it("rejects overlong note", () => {
    expect(checkGuidedEvent(makeEvent("event-1", { note: "a".repeat(GUIDED_LIMITS.text + 1) }))).toBe(false);
  });
  it("rejects control character in note", () => {
    expect(checkGuidedEvent(makeEvent("event-1", { note: "bad\u0002message" }))).toBe(false);
  });
  it("accepts optional step reference", () => {
    expect(checkGuidedEvent(makeEvent("event-1", { stepId: "step-1" }))).toBe(true);
  });
  it("rejects invalid step reference", () => {
    expect(checkGuidedEvent(makeEvent("event-1", { stepId: "!" }))).toBe(false);
  });
});

describe("guided document structural validation", () => {
  it("accepts a blank document", () => {
    expect(checkGuidedDocument(emptyGuidedDocument())).toBe(true);
  });
  it("accepts one draft", () => {
    expect(checkGuidedDocument(doc([makeCase()]))).toBe(true);
  });
  it("rejects duplicate case IDs", () => {
    expect(checkGuidedDocument(doc([makeCase(), makeCase()]))).toBe(false);
  });
  it("rejects duplicate observation IDs", () => {
    expect(checkGuidedDocument(doc([makeCase()], [makeStep(), makeStep()]))).toBe(false);
  });
  it("rejects duplicate event IDs", () => {
    expect(checkGuidedDocument(doc([makeCase()], [], [makeEvent(), makeEvent()]))).toBe(false);
  });
  it("rejects observations linked to missing case", () => {
    expect(checkGuidedDocument(doc([makeCase()], [makeStep("step-1", { caseId: "case-2" })]))).toBe(false);
  });
  it("rejects events linked to missing case", () => {
    expect(checkGuidedDocument(doc([makeCase()], [], [makeEvent("event-1", { caseId: "case-2" })]))).toBe(false);
  });
  it("rejects observation before case was opened", () => {
    expect(checkGuidedDocument(doc([makeCase()], [makeStep("step-1", { capturedAt: "2026-11-20T10:00:00.000Z" })]))).toBe(false);
  });
  it("rejects event before case was opened", () => {
    expect(checkGuidedDocument(doc([makeCase()], [], [makeEvent("event-1", { at: "2026-11-20T10:00:00.000Z" })]))).toBe(false);
  });
  it("rejects event pointing to non-existent observation", () => {
    expect(checkGuidedDocument(doc([makeCase()], [], [makeEvent("event-1", { action: "step-recorded", stepId: "step-2" })]))).toBe(false);
  });
  it("rejects event pointing to another case observation", () => {
    expect(checkGuidedDocument(doc([makeCase(), makeCase("case-2")], [makeStep("step-2", { caseId: "case-2" })], [makeEvent("event-1", { action: "step-recorded", stepId: "step-2" })]))).toBe(false);
  });
  it("rejects closed case without documented review", () => {
    expect(checkGuidedDocument(doc([makeCase("case-1", { phase: "closed" })]))).toBe(false);
  });
  it("rejects review case without recorded transition", () => {
    expect(checkGuidedDocument(doc([makeCase("case-1", { phase: "review" })]))).toBe(false);
  });
  it("rejects close action without prior review", () => {
    expect(checkGuidedDocument(doc([makeCase("case-1", { phase: "closed" })], [], [makeEvent("event-1", { action: "closed" })]))).toBe(false);
  });
  it("rejects reopened action without prior close", () => {
    expect(checkGuidedDocument(doc([makeCase("case-1", { phase: "review" })], [], [makeEvent("event-1", { action: "reopened" })]))).toBe(false);
  });
  it("rejects unsupported document schema", () => {
    expect(checkGuidedDocument({ ...emptyGuidedDocument(), schema: "other" })).toBe(false);
  });
  it("rejects additional document properties", () => {
    expect(checkGuidedDocument({ ...emptyGuidedDocument(), tracking: "yes" })).toBe(false);
  });
  it("rejects missing events array", () => {
    expect(checkGuidedDocument({ schema: emptyGuidedDocument().schema, cases: [], steps: [] })).toBe(false);
  });
  it("rejects all non-object input", () => {
    for (const value of [null, 1, "", [], true]) expect(checkGuidedDocument(value)).toBe(false);
  });
});

describe("guided review transitions and filtered views", () => {
  it("begins an inspected case without pretending completeness", () => {
    const r = beginGuidedCase(emptyGuidedDocument(), makeCase());
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.cases).toHaveLength(1);
  });
  it("rejects creating the same case twice", () => {
    expect(beginGuidedCase(doc([makeCase()]), makeCase()).ok).toBe(false);
  });
  it("rejects a closed case as an initial case", () => {
    expect(beginGuidedCase(emptyGuidedDocument(), makeCase("case-1", { phase: "closed" })).ok).toBe(false);
  });
  it("rejects an invalid source when starting a case", () => {
    expect(beginGuidedCase(emptyGuidedDocument(), makeCase("case-1", { source: { ...source, name: "" } })).ok).toBe(false);
  });
  it("records a step and its append-only event", () => {
    const r = recordGuidedStep(doc([makeCase()]), makeStep());
    expect(r.ok).toBe(true);
    if (r.ok) { expect(r.value.steps).toHaveLength(1); expect(r.value.events[0]?.action).toBe("step-recorded"); }
  });
  it("does not record a step without parent", () => {
    expect(recordGuidedStep(emptyGuidedDocument(), makeStep()).ok).toBe(false);
  });
  it("does not duplicate step identifiers", () => {
    const original = recordGuidedStep(doc([makeCase()]), makeStep());
    if (!original.ok) throw new Error("fixture failed");
    expect(recordGuidedStep(original.value, makeStep()).ok).toBe(false);
  });
  it("does not record a step predating its case", () => {
    expect(recordGuidedStep(doc([makeCase()]), makeStep("step-1", { capturedAt: "2026-11-20T10:00:00.000Z" })).ok).toBe(false);
  });
  it("allows a manual review request", () => {
    const r = appendGuidedEvent(doc([makeCase()]), makeEvent("event-1", { action: "review-requested" }));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.cases[0]?.phase).toBe("review");
  });
  it("refuses to close unreviewed documentation", () => {
    expect(appendGuidedEvent(doc([makeCase()]), makeEvent("event-1", { action: "closed" })).ok).toBe(false);
  });
  it("allows closing documentation after review", () => {
    const a = appendGuidedEvent(doc([makeCase()]), makeEvent("event-1", { action: "review-requested" }));
    if (!a.ok) throw new Error("fixture failed");
    const b = appendGuidedEvent(a.value, makeEvent("event-2", { action: "closed", at: "2026-11-20T11:03:00.000Z" }));
    expect(b.ok).toBe(true);
    if (b.ok) expect(b.value.cases[0]?.phase).toBe("closed");
  });
  it("refuses a repeated review request", () => {
    const a = appendGuidedEvent(doc([makeCase()]), makeEvent("event-1", { action: "review-requested" }));
    if (!a.ok) throw new Error("fixture failed");
    expect(appendGuidedEvent(a.value, makeEvent("event-2", { action: "review-requested", at: "2026-11-20T11:03:00.000Z" })).ok).toBe(false);
  });
  it("refuses duplicate event identifier", () => {
    expect(appendGuidedEvent(doc([makeCase()], [], [makeEvent()]), makeEvent()).ok).toBe(false);
  });
  it("refuses backdated event", () => {
    expect(appendGuidedEvent(doc([makeCase()], [], [makeEvent()]), makeEvent("event-2", { at: "2026-11-20T11:01:00.000Z" })).ok).toBe(false);
  });
  it("returns only selected pack", () => {
    const rows = filterGuidedCases(doc([makeCase(), makeCase("case-2", { packId: "pack-b" })]), { packId: "pack-b" });
    expect(rows.map((r) => r.id)).toEqual(["case-2"]);
  });
  it("returns only selected condition", () => {
    const rows = filterGuidedCases(doc([makeCase(), makeCase("case-2", { condition: "storage" })]), { condition: "storage" });
    expect(rows.map((r) => r.id)).toEqual(["case-2"]);
  });
  it("supports simple case-title search", () => {
    expect(filterGuidedCases(doc([makeCase()]), { query: "INTERRUPTED" })).toHaveLength(1);
  });
  it("supports a no-match search", () => {
    expect(filterGuidedCases(doc([makeCase()]), { query: "unrelated" })).toHaveLength(0);
  });
  it("preserves an UNKNOWN count", () => {
    expect(guidedSummary(doc([makeCase()], [makeStep()])).unknown).toBe(2);
  });
  it("never turns the summary into a ready claim", () => {
    expect(guidedSummary(doc([makeCase()])).contentReady).toBe(false);
  });
  it("counts a disputed observation", () => {
    expect(guidedSummary(doc([makeCase()], [makeStep("step-1", { evidence: "disputed" })])).disputed).toBe(1);
  });
  it("sorts events chronologically", () => {
    const result = guidedEventsFor(doc([makeCase()], [], [makeEvent("event-2", { at: "2026-11-20T11:03:00.000Z" }), makeEvent()]), "case-1");
    expect(result.map((r) => r.id)).toEqual(["event-1", "event-2"]);
  });
  it("filters steps to their parent case", () => {
    expect(guidedStepsFor(doc([makeCase(), makeCase("case-2")], [makeStep(), makeStep("step-2", { caseId: "case-2" })]), "case-1")).toHaveLength(1);
  });
  it("uses deterministic next case identifier", () => {
    expect(nextGuidedId(doc([makeCase()]), "case")).toBe("case-2");
  });
  it("does not reuse a taken step identifier", () => {
    expect(nextGuidedId(doc([makeCase()], [makeStep()]), "step")).toBe("step-2");
  });
  it("summarizes a review-requested phase", () => {
    expect(guidedPhaseFromEvents([makeEvent("event-1", { action: "review-requested" })])).toBe("review");
  });
});
