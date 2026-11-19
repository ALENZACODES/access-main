import { describe, expect, it } from "vitest";
import {
  HANDOFF_CONDITIONS, HANDOFF_DECISIONS, HANDOFF_LICENCES, HANDOFF_LIMITS,
  HANDOFF_OPERATIONS, HANDOFF_TIERS, appendHandoffCase, appendHandoffEvent,
  currentHandoffDecision, exportHandoffDocument,
  newHandoffDocument, parseHandoffDocument,
  previewHandoffMerge, validHandoffSource, validateHandoffCase,
  validateHandoffDocument, validateHandoffEvent,
  type HandoffCase, type HandoffDocument, type HandoffEvent, type HandoffSource,
} from "./recoveryHandoff";

const source: HandoffSource = {
  name: "Local public source", licence: "CC0-1.0", date: "2026-11-19",
  tier: "UNKNOWN", reference: "",
};
const makeEvent = (patch: Partial<HandoffEvent> = {}): HandoffEvent => ({
  id: "event-1", at: "2026-11-19T12:00:01.000Z", decision: "review", note: "",
  ...patch,
});
const makeCase = (patch: Partial<HandoffCase> = {}): HandoffCase => ({
  id: "handoff-1", packId: "region-1", operation: "pack", condition: "UNKNOWN",
  openedAt: "2026-11-19T12:00:00.000Z", summary: "Missing information",
  source, events: [], ...patch,
});
const documentWith = (...cases: HandoffCase[]): HandoffDocument => ({
  format: "local-recovery-handoff", version: 1, cases,
});
const documented = documentWith(makeCase());

function accepted<T>(result: { ok: boolean; value?: T }): T {
  expect(result.ok).toBe(true);
  if (!("value" in result) || result.value === undefined) throw new Error("Expected a successful result");
  return result.value;
}

describe("local recovery handoff document", () => {
  it("starts with no cases", () => {
    expect(newHandoffDocument()).toEqual({ format: "local-recovery-handoff", version: 1, cases: [] });
  });
  it("accepts an empty report", () => {
    expect(validateHandoffDocument(newHandoffDocument()).ok).toBe(true);
  });
  it("does not start a pack repair", () => {
    expect(JSON.stringify(newHandoffDocument())).not.toContain("downloadRegion");
  });
  it("accepts a case with UNKNOWN condition", () => {
    expect(validateHandoffCase(makeCase())).toBeNull();
  });
  it("preserves original uncertainty", () => {
    const result = accepted(appendHandoffCase(newHandoffDocument(), makeCase()));
    expect(result.cases[0]?.condition).toBe("UNKNOWN");
    expect(currentHandoffDecision(result.cases[0]!)).toBe("UNKNOWN");
  });
  it("accepts each supported operation", () => {
    for (const operation of HANDOFF_OPERATIONS) {
      expect(validateHandoffCase(makeCase({ operation })), operation).toBeNull();
    }
  });
  it("accepts each supported condition", () => {
    for (const condition of HANDOFF_CONDITIONS) {
      expect(validateHandoffCase(makeCase({ condition })), condition).toBeNull();
    }
  });
  it("accepts each open licence", () => {
    for (const licence of HANDOFF_LICENCES) {
      expect(validHandoffSource({ ...source, licence }), licence).toBe(true);
    }
  });
  it("accepts every evidence tier without inference", () => {
    for (const tier of HANDOFF_TIERS) {
      expect(validHandoffSource({ ...source, tier }), tier).toBe(true);
    }
  });
  it("accepts every manual decision", () => {
    for (const decision of HANDOFF_DECISIONS) {
      expect(validateHandoffEvent(makeEvent({ decision }))).toBeNull();
    }
  });
  it("never infers a decision from the reported condition", () => {
    for (const condition of HANDOFF_CONDITIONS) {
      expect(currentHandoffDecision(makeCase({ condition }))).toBe("UNKNOWN");
    }
  });
  it("rejects a second case with the same ID", () => {
    expect(appendHandoffCase(documented, makeCase())).toEqual({ ok: false, issue: "duplicate" });
  });
  it("allows a second pack with a distinct ID", () => {
    const second = makeCase({ id: "handoff-2", packId: "region-2" });
    expect(accepted(appendHandoffCase(documented, second)).cases).toHaveLength(2);
  });
  it("retains the original history when adding a case", () => {
    const result = accepted(appendHandoffCase(documented, makeCase({ id: "handoff-2" })));
    expect(result.cases[0]).toEqual(makeCase());
  });
  it("returns a new document rather than mutating the original", () => {
    const result = accepted(appendHandoffCase(documented, makeCase({ id: "handoff-2" })));
    expect(result).not.toBe(documented);
    expect(documented.cases).toHaveLength(1);
  });
  it("rejects a malformed existing document before appending", () => {
    const invalid = { ...documented, version: 2 } as unknown as HandoffDocument;
    expect(appendHandoffCase(invalid, makeCase({ id: "handoff-2" }))).toEqual({ ok: false, issue: "format" });
  });
  it("enforces the case count limit", () => {
    const cases = Array.from({ length: HANDOFF_LIMITS.maxCases }, (_, i) => makeCase({ id: `case-${i}` }));
    expect(appendHandoffCase(documentWith(...cases), makeCase({ id: "extra" }))).toEqual({ ok: false, issue: "limit" });
  });
  it("does not mistake identical cases for different history", () => {
    expect(previewHandoffMerge(documented, documented)).toEqual({
      ok: true, value: { added: [], unchanged: ["handoff-1"], collisions: [] },
    });
  });
  it("rejects tampered documents on parsing", () => {
    expect(parseHandoffDocument('{"format":"unexpected","version":1,"cases":[]}')).toEqual({ ok: false, issue: "format" });
  });
  it("exports a newline-terminated JSON file", () => {
    const result = accepted(exportHandoffDocument(documented));
    expect(result.endsWith("\n")).toBe(true);
    expect(parseHandoffDocument(result).ok).toBe(true);
  });
  it("does not add source metadata to absent cases", () => {
    const invalid = { ...makeCase(), source: undefined };
    expect(validateHandoffCase(invalid)).toBe("source");
  });
});

describe("source metadata and text policy", () => {
  it.each(["", " ", "\t", "\n", "<b>", "Name>sample", "a".repeat(181)])(
    "rejects source name %j", (name: string) => {
      expect(validHandoffSource({ ...source, name })).toBe(false);
    },
  );
  it.each(["private", "all-rights-reserved", "", "MIT", "GPL-3.0"])(
    "rejects unsupported licence %s", (licence: string) => {
      expect(validHandoffSource({ ...source, licence })).toBe(false);
    },
  );
  it.each(["", "yesterday", "2026-02-31", "2026-00-01", "2026-13-01", "2026-11-00"])(
    "rejects invalid source date %s", (date: string) => {
      expect(validHandoffSource({ ...source, date })).toBe(false);
    },
  );
  it.each(["", "guessed", "confirmed", "automatic"])(
    "rejects unsupported evidence tier %s", (tier: string) => {
      expect(validHandoffSource({ ...source, tier })).toBe(false);
    },
  );
  it("allows an empty optional reference", () => {
    expect(validHandoffSource({ ...source, reference: "" })).toBe(true);
  });
  it("accepts a short reference without interpreting it", () => {
    expect(validHandoffSource({ ...source, reference: "public-file-1" })).toBe(true);
  });
  it("rejects a long source reference", () => {
    expect(validHandoffSource({ ...source, reference: "x".repeat(HANDOFF_LIMITS.maxReference + 1) })).toBe(false);
  });
  it("rejects HTML and XML in references", () => {
    expect(validHandoffSource({ ...source, reference: "<metadata>" })).toBe(false);
  });
  it("rejects controls inside reference", () => {
    expect(validHandoffSource({ ...source, reference: "first\nsecond" })).toBe(false);
  });
  it("rejects additional metadata keys", () => {
    expect(validHandoffSource({ ...source, extra: "unexpected" })).toBe(false);
  });
  it("rejects missing licence", () => {
    const invalid = { ...source, licence: undefined };
    expect(validHandoffSource(invalid)).toBe(false);
  });
  it("rejects null source metadata", () => {
    expect(validHandoffSource(null)).toBe(false);
  });
  it("rejects array source metadata", () => {
    expect(validHandoffSource([])).toBe(false);
  });
  it("rejects a source claiming no name", () => {
    expect(validHandoffSource({ ...source, name: "  " })).toBe(false);
  });
  it("rejects a number for source name", () => {
    expect(validHandoffSource({ ...source, name: 5 })).toBe(false);
  });
  it("preserves supplied reference exactly", () => {
    const original = makeCase({ source: { ...source, reference: "  document-one  " } });
    const saved = accepted(appendHandoffCase(newHandoffDocument(), original));
    expect(saved.cases[0]?.source.reference).toBe("  document-one  ");
  });
  it("rejects carriage return in summary", () => {
    expect(validateHandoffCase(makeCase({ summary: "one\rtwo" }))).toBe("text");
  });
  it("rejects markup in summary", () => {
    expect(validateHandoffCase(makeCase({ summary: "<script>" }))).toBe("text");
  });
  it("rejects whitespace-only summary", () => {
    expect(validateHandoffCase(makeCase({ summary: " " }))).toBe("text");
  });
  it("rejects overlong summary", () => {
    expect(validateHandoffCase(makeCase({ summary: "x".repeat(HANDOFF_LIMITS.maxSummary + 1) }))).toBe("text");
  });
  it("does not rewrite source names", () => {
    const saved = accepted(appendHandoffCase(newHandoffDocument(), makeCase()));
    expect(saved.cases[0]?.source.name).toBe(source.name);
  });
  it("does not generate evidence tiers", () => {
    const saved = accepted(appendHandoffCase(newHandoffDocument(), makeCase()));
    expect(saved.cases[0]?.source.tier).toBe("UNKNOWN");
  });
});

describe("event validation and guarded transitions", () => {
  it("starts a case without events", () => {
    expect(makeCase().events).toHaveLength(0);
  });
  it("accepts a manual review note", () => {
    const result = accepted(appendHandoffEvent(documented, "handoff-1", makeEvent()));
    expect(result.cases[0]?.events).toHaveLength(1);
  });
  it("does not modify the original case", () => {
    appendHandoffEvent(documented, "handoff-1", makeEvent());
    expect(documented.cases[0]?.events).toHaveLength(0);
  });
  it("rejects a missing case ID", () => {
    expect(appendHandoffEvent(documented, "missing", makeEvent())).toEqual({ ok: false, issue: "unknown-pack" });
  });
  it("rejects an event before a case was opened", () => {
    const event = makeEvent({ at: "2026-11-19T11:59:59.000Z" });
    expect(appendHandoffEvent(documented, "handoff-1", event)).toEqual({ ok: false, issue: "sequence" });
  });
  it("rejects an invalid instant", () => {
    expect(validateHandoffEvent(makeEvent({ at: "tomorrow" }))).toBe("time");
  });
  it("rejects timestamps lacking milliseconds", () => {
    expect(validateHandoffEvent(makeEvent({ at: "2026-11-19T12:00:01Z" }))).toBe("time");
  });
  it("rejects invalid hours", () => {
    expect(validateHandoffEvent(makeEvent({ at: "2026-11-19T25:00:01.000Z" }))).toBe("time");
  });
  it("rejects unknown event decision", () => {
    expect(validateHandoffEvent({ ...makeEvent(), decision: "unsafe-ready" })).toBe("decision");
  });
  it("rejects note markup", () => {
    expect(validateHandoffEvent(makeEvent({ note: "<div>" }))).toBe("text");
  });
  it("allows a deliberately empty note", () => {
    expect(validateHandoffEvent(makeEvent({ note: "" }))).toBeNull();
  });
  it("rejects an overlong note", () => {
    expect(validateHandoffEvent(makeEvent({ note: "a".repeat(HANDOFF_LIMITS.maxNote + 1) }))).toBe("text");
  });
  it("rejects duplicate event IDs", () => {
    const doc = documentWith(makeCase({ condition: "failed", events: [makeEvent()] }));
    const result = appendHandoffEvent(doc, "handoff-1", makeEvent({ at: "2026-11-19T12:00:02.000Z" }));
    expect(result).toEqual({ ok: false, issue: "duplicate" });
  });
  it("allows an ordered second event", () => {
    const doc = documentWith(makeCase({ condition: "failed", events: [makeEvent()] }));
    const result = appendHandoffEvent(doc, "handoff-1", makeEvent({ id: "event-2", at: "2026-11-19T12:00:02.000Z" }));
    expect(result.ok).toBe(true);
  });
  it("rejects an out-of-order second event", () => {
    const doc = documentWith(makeCase({ condition: "failed", events: [makeEvent()] }));
    const result = appendHandoffEvent(doc, "handoff-1", makeEvent({ id: "event-2", at: "2026-11-19T12:00:00.000Z" }));
    expect(result).toEqual({ ok: false, issue: "sequence" });
  });
  it("rejects a retry request when the condition is UNKNOWN", () => {
    expect(appendHandoffEvent(documented, "handoff-1", makeEvent({ decision: "retry-requested" }))).toEqual({ ok: false, issue: "transition" });
  });
  it("permits a retry note only when a condition is stated", () => {
    const doc = documentWith(makeCase({ condition: "interrupted" }));
    expect(appendHandoffEvent(doc, "handoff-1", makeEvent({ decision: "retry-requested" })).ok).toBe(true);
  });
  it("does not issue the requested retry", () => {
    const doc = documentWith(makeCase({ condition: "interrupted" }));
    const result = accepted(appendHandoffEvent(doc, "handoff-1", makeEvent({ decision: "retry-requested" })));
    expect(result.cases[0]?.events[0]?.decision).toBe("retry-requested");
    expect(result.cases[0]?.condition).toBe("interrupted");
  });
  it("allows closing a case without declaring a pack ready", () => {
    const result = accepted(appendHandoffEvent(documented, "handoff-1", makeEvent({ decision: "closed" })));
    expect(result.cases[0]?.condition).toBe("UNKNOWN");
    expect(currentHandoffDecision(result.cases[0]!)).toBe("closed");
  });
  it("rejects further changes after closure", () => {
    const doc = documentWith(makeCase({ events: [makeEvent({ decision: "closed" })] }));
    const result = appendHandoffEvent(doc, "handoff-1", makeEvent({ id: "event-2", at: "2026-11-19T12:00:02.000Z" }));
    expect(result).toEqual({ ok: false, issue: "transition" });
  });
  it("enforces the event count limit", () => {
    const events = Array.from({ length: HANDOFF_LIMITS.maxEvents }, (_, i) => makeEvent({
      id: `event-${i}`, at: `2026-11-19T12:${String(i).padStart(2, "0")}:01.000Z`,
    }));
    const doc = documentWith(makeCase({ events }));
    expect(appendHandoffEvent(doc, "handoff-1", makeEvent({ id: "extra", at: "2026-11-19T13:00:01.000Z" }))).toEqual({ ok: false, issue: "limit" });
  });
  it("preserves the event note without interpretation", () => {
    const result = accepted(appendHandoffEvent(documented, "handoff-1", makeEvent({ note: "Local issue remains UNKNOWN" })));
    expect(result.cases[0]?.events[0]?.note).toBe("Local issue remains UNKNOWN");
  });
  it("returns UNKNOWN for a case with no decision history", () => {
    expect(currentHandoffDecision(makeCase())).toBe("UNKNOWN");
  });
  it("uses the latest decision from a valid event history", () => {
    const events = [makeEvent(), makeEvent({ id: "event-2", at: "2026-11-19T12:00:02.000Z", decision: "deferred" })];
    expect(currentHandoffDecision(makeCase({ events }))).toBe("deferred");
  });
});
