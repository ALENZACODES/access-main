import { describe, expect, it } from "vitest";
import {
  HISTORY_BYTE_LIMIT, HISTORY_LIMIT, amendHistoryEvent, appendHistoryEvent,
  candidateLatestCondition, countHistoryActions, emptyHistory, historyForCandidate,
  mergeTransferBundles, parseTransferBundle, prepareTransferBundle,
  previewTransferBundleMerge, reconcileTransferHistory, serializeTransferBundle,
  transferBundleHasCandidate, validateHistory, validateHistoryEvent, validateTransferBundle,
  type TransferBundle, type TransferHistory, type TransferHistoryEvent,
} from "./recoveryTransferHistory";
import {
  newTransferDocument, type TransferCandidate, type TransferDocument,
} from "./recoveryTransferPreflight";

const source = {
  name: "Public source", licence: "CC0-1.0", date: "2026-11-18", tier: "UNKNOWN" as const,
  reference: "source-reference",
};
const row = (patch: Partial<TransferCandidate> = {}): TransferCandidate => ({
  id: "transfer-1", packId: "region-1", kind: "download", condition: "unknown",
  stage: "draft", recordedAt: "2026-11-19T10:00:00.000Z",
  source, expectedBytes: null, availableBytes: null, note: "Manual observation", ...patch,
});
const event = (patch: Partial<TransferHistoryEvent> = {}): TransferHistoryEvent => ({
  id: "event-1", candidateId: "transfer-1", action: "add",
  at: "2026-11-19T10:00:00.000Z", note: "", ...patch,
});
const history = (events: TransferHistoryEvent[] = [event()]): TransferHistory => ({
  ...emptyHistory(), events,
});
const records = (candidates: TransferCandidate[] = [row()]): TransferDocument => ({
  ...newTransferDocument(), candidates,
});
const bundle = (candidates: TransferCandidate[] = [row()], events: TransferHistoryEvent[] = [event()]): TransferBundle => ({
  format: "local-transfer-bundle", version: 1, records: records(candidates), history: history(events),
});

describe("manual history event validation", () => {
  it("accepts a valid add event", () => {
    expect(validateHistoryEvent(event())).toBeNull();
  });
  it("accepts a review event", () => {
    expect(validateHistoryEvent(event({ action: "review" }))).toBeNull();
  });
  it("accepts a discarded note event", () => {
    expect(validateHistoryEvent(event({ action: "discard" }))).toBeNull();
  });
  it("accepts an import event", () => {
    expect(validateHistoryEvent(event({ action: "import" }))).toBeNull();
  });
  it("rejects a made-up event action", () => {
    expect(validateHistoryEvent({ ...event(), action: "download-now" })).not.toBeNull();
  });
  it("rejects a blank event identifier", () => {
    expect(validateHistoryEvent(event({ id: "" }))).not.toBeNull();
  });
  it("rejects a path-traversal event identifier", () => {
    expect(validateHistoryEvent(event({ id: "../unsafe" }))).not.toBeNull();
  });
  it("rejects a path-traversal candidate identifier", () => {
    expect(validateHistoryEvent(event({ candidateId: "../../unsafe" }))).not.toBeNull();
  });
  it("rejects an empty candidate identifier", () => {
    expect(validateHistoryEvent(event({ candidateId: "" }))).not.toBeNull();
  });
  it("rejects a space-containing identifier", () => {
    expect(validateHistoryEvent(event({ id: "event one" }))).not.toBeNull();
  });
  it("rejects an event ID exceeding its limit", () => {
    expect(validateHistoryEvent(event({ id: "x".repeat(97) }))).not.toBeNull();
  });
  it("rejects a non-UTC timestamp", () => {
    expect(validateHistoryEvent(event({ at: "2026-11-19T10:00:00-05:00" }))).not.toBeNull();
  });
  it("rejects a timestamp without seconds", () => {
    expect(validateHistoryEvent(event({ at: "2026-11-19T10:00Z" }))).not.toBeNull();
  });
  it("rejects an impossible calendar date", () => {
    expect(validateHistoryEvent(event({ at: "2026-02-31T10:00:00.000Z" }))).not.toBeNull();
  });
  it("accepts a timestamp without milliseconds", () => {
    expect(validateHistoryEvent(event({ at: "2026-11-19T10:00:00Z" }))).toBeNull();
  });
  it("accepts a timestamp with one fractional digit", () => {
    expect(validateHistoryEvent(event({ at: "2026-11-19T10:00:00.1Z" }))).toBeNull();
  });
  it("accepts a timestamp with two fractional digits", () => {
    expect(validateHistoryEvent(event({ at: "2026-11-19T10:00:00.12Z" }))).toBeNull();
  });
  it("accepts a timestamp with three fractional digits", () => {
    expect(validateHistoryEvent(event({ at: "2026-11-19T10:00:00.123Z" }))).toBeNull();
  });
  it("rejects a timestamp with excessive fractional digits", () => {
    expect(validateHistoryEvent(event({ at: "2026-11-19T10:00:00.1234Z" }))).not.toBeNull();
  });
  it("rejects an invalid timestamp token", () => {
    expect(validateHistoryEvent(event({ at: "UNKNOWN" }))).not.toBeNull();
  });
  it("rejects a newline inside a note", () => {
    expect(validateHistoryEvent(event({ note: "first\nsecond" }))).not.toBeNull();
  });
  it("rejects markup inside a note", () => {
    expect(validateHistoryEvent(event({ note: "<img>" }))).not.toBeNull();
  });
  it("rejects a note exceeding its bound", () => {
    expect(validateHistoryEvent(event({ note: "x".repeat(501) }))).not.toBeNull();
  });
  it("accepts an empty note", () => {
    expect(validateHistoryEvent(event({ note: "" }))).toBeNull();
  });
  it("rejects unexpected fields in events", () => {
    expect(validateHistoryEvent({ ...event(), privateToken: "hidden" })).not.toBeNull();
  });
  it("rejects a non-object event", () => {
    expect(validateHistoryEvent("event")).not.toBeNull();
  });
  it("rejects an array masquerading as an event", () => {
    expect(validateHistoryEvent([event()])).not.toBeNull();
  });
  it("rejects a null event", () => {
    expect(validateHistoryEvent(null)).not.toBeNull();
  });
});

describe("append-only transfer history", () => {
  it("starts empty", () => {
    expect(emptyHistory()).toEqual({ format: "local-transfer-history", version: 1, events: [] });
  });
  it("validates the empty history", () => {
    expect(validateHistory(emptyHistory()).ok).toBe(true);
  });
  it("validates a one-event history", () => {
    expect(validateHistory(history()).ok).toBe(true);
  });
  it("rejects an unsupported version", () => {
    expect(validateHistory({ ...history(), version: 2 as 1 }).ok).toBe(false);
  });
  it("rejects an unsupported format", () => {
    expect(validateHistory({ ...history(), format: "other" as "local-transfer-history" }).ok).toBe(false);
  });
  it("rejects unexpected history fields", () => {
    expect(validateHistory({ ...history(), deviceId: "private" }).ok).toBe(false);
  });
  it("rejects more than the event cap", () => {
    const events = Array.from({ length: HISTORY_LIMIT + 1 }, (_, i) => event({ id: `event-${i}` }));
    expect(validateHistory(history(events)).ok).toBe(false);
  });
  it("rejects duplicate event IDs", () => {
    expect(validateHistory(history([event(), event()])).ok).toBe(false);
  });
  it("rejects descending timestamp order", () => {
    const events = [event({ at: "2026-11-19T12:00:00.000Z" }), event({ id: "event-2", at: "2026-11-19T11:00:00.000Z" })];
    expect(validateHistory(history(events)).ok).toBe(false);
  });
  it("accepts equal-time events", () => {
    const events = [event(), event({ id: "event-2" })];
    expect(validateHistory(history(events)).ok).toBe(true);
  });
  it("appends a later review event", () => {
    const next = event({ id: "event-2", action: "review", at: "2026-11-19T12:00:00.000Z" });
    const result = appendHistoryEvent(history(), next);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.events).toHaveLength(2);
  });
  it("does not mutate the old history", () => {
    const original = history();
    appendHistoryEvent(original, event({ id: "event-2" }));
    expect(original.events).toHaveLength(1);
  });
  it("rejects appending a duplicate identifier", () => {
    expect(appendHistoryEvent(history(), event()).ok).toBe(false);
  });
  it("rejects an earlier event", () => {
    expect(appendHistoryEvent(history(), event({ id: "event-2", at: "2026-11-18T09:00:00.000Z" })).ok).toBe(false);
  });
  it("rejects appending invalid event metadata", () => {
    expect(appendHistoryEvent(history(), event({ id: "../bad" })).ok).toBe(false);
  });
  it("never allows historical events to be edited", () => {
    expect(amendHistoryEvent(history(), event({ note: "changed" })).ok).toBe(false);
  });
  it("counts add actions", () => {
    expect(countHistoryActions(history()).add).toBe(1);
  });
  it("counts review actions", () => {
    const events = [event(), event({ id: "event-2", action: "review" })];
    expect(countHistoryActions(history(events)).review).toBe(1);
  });
  it("counts discarded actions", () => {
    const events = [event(), event({ id: "event-2", action: "discard" })];
    expect(countHistoryActions(history(events)).discard).toBe(1);
  });
  it("counts imported actions", () => {
    const events = [event(), event({ id: "event-2", action: "import" })];
    expect(countHistoryActions(history(events)).import).toBe(1);
  });
  it("filters events by candidate", () => {
    const events = [event(), event({ id: "event-2", candidateId: "transfer-2" })];
    expect(historyForCandidate(history(events), "transfer-1")).toHaveLength(1);
  });
  it("returns an empty list for unmentioned candidates", () => {
    expect(historyForCandidate(history(), "missing")).toEqual([]);
  });
  it("does not alter the pack condition based on review history", () => {
    const original = row();
    expect(candidateLatestCondition(original, history([event({ action: "review" })]))).toBe("unknown");
  });
  it("does not alter a damaged condition", () => {
    expect(candidateLatestCondition(row({ condition: "damaged" }), history())).toBe("damaged");
  });
});

describe("bundle schema and evidence boundaries", () => {
  it("accepts a complete transfer bundle", () => {
    expect(validateTransferBundle(bundle()).ok).toBe(true);
  });
  it("accepts an empty transfer bundle", () => {
    expect(validateTransferBundle(bundle([], [])).ok).toBe(true);
  });
  it("rejects orphan history events", () => {
    expect(validateTransferBundle(bundle([], [event()])).ok).toBe(false);
  });
  it("rejects an event associated with another candidate", () => {
    expect(validateTransferBundle(bundle([row()], [event({ candidateId: "transfer-2" })])).ok).toBe(false);
  });
  it("rejects a missing history", () => {
    const broken = { ...bundle(), history: undefined };
    expect(validateTransferBundle(broken).ok).toBe(false);
  });
  it("rejects a missing records field", () => {
    const broken = { ...bundle(), records: undefined };
    expect(validateTransferBundle(broken).ok).toBe(false);
  });
  it("rejects unexpected top-level fields", () => {
    expect(validateTransferBundle({ ...bundle(), userSecret: true }).ok).toBe(false);
  });
  it("rejects unknown format identifiers", () => {
    expect(validateTransferBundle({ ...bundle(), format: "unsupported" }).ok).toBe(false);
  });
  it("rejects unsupported version numbers", () => {
    expect(validateTransferBundle({ ...bundle(), version: 99 }).ok).toBe(false);
  });
  it("rejects an invalid candidate inside a bundle", () => {
    const broken = bundle([row({ packId: "../bad" })]);
    expect(validateTransferBundle(broken).ok).toBe(false);
  });
  it("rejects an invalid event inside a bundle", () => {
    const broken = bundle([row()], [event({ id: "../bad" })]);
    expect(validateTransferBundle(broken).ok).toBe(false);
  });
  it("prepares a bundle from the two validated models", () => {
    expect(prepareTransferBundle(records(), history()).ok).toBe(true);
  });
  it("fails closed if records are malformed", () => {
    expect(prepareTransferBundle({ ...records(), version: 2 as 1 }, history()).ok).toBe(false);
  });
  it("fails closed if events are malformed", () => {
    expect(prepareTransferBundle(records(), history([event({ id: "../bad" })])).ok).toBe(false);
  });
  it("serializes and reparses the bundle", () => {
    const encoded = serializeTransferBundle(bundle());
    expect(encoded.ok).toBe(true);
    if (encoded.ok) expect(parseTransferBundle(encoded.value)).toEqual({ ok: true, value: bundle() });
  });
  it("rejects invalid JSON input", () => {
    expect(parseTransferBundle("{").ok).toBe(false);
  });
  it("rejects an oversized bundle", () => {
    expect(parseTransferBundle(" ".repeat(HISTORY_BYTE_LIMIT + 1)).ok).toBe(false);
  });
  it("rejects bare primitive JSON input", () => {
    expect(parseTransferBundle("null").ok).toBe(false);
  });
  it("refuses to serialize an invalid bundle", () => {
    expect(serializeTransferBundle({ ...bundle(), version: 2 as 1 }).ok).toBe(false);
  });
  it("preserves UNKNOWN after JSON roundtrip", () => {
    const encoded = serializeTransferBundle(bundle());
    if (encoded.ok) {
      const result = parseTransferBundle(encoded.value);
      if (result.ok) expect(result.value.records.candidates[0]?.condition).toBe("unknown");
    }
  });
  it("preserves source metadata after JSON roundtrip", () => {
    const encoded = serializeTransferBundle(bundle());
    if (encoded.ok) {
      const result = parseTransferBundle(encoded.value);
      if (result.ok) expect(result.value.records.candidates[0]?.source).toEqual(source);
    }
  });
  it("preserves the event timeline after roundtrip", () => {
    const encoded = serializeTransferBundle(bundle());
    if (encoded.ok) {
      const result = parseTransferBundle(encoded.value);
      if (result.ok) expect(result.value.history.events).toEqual([event()]);
    }
  });
});

describe("conflict-safe bundle comparisons", () => {
  it("detects a new candidate", () => {
    const incoming = bundle([row({ id: "transfer-2" })], []);
    const preview = previewTransferBundleMerge(bundle(), incoming);
    if (preview.ok) expect(preview.value.addedCandidates).toBe(1);
  });
  it("detects a new event", () => {
    const incoming = bundle([row()], [event(), event({ id: "event-2", action: "review" })]);
    const preview = previewTransferBundleMerge(bundle(), incoming);
    if (preview.ok) expect(preview.value.newEvents).toBe(1);
  });
  it("reports candidate history conflicts", () => {
    const incoming = bundle([row({ note: "changed" })], [event()]);
    const preview = previewTransferBundleMerge(bundle(), incoming);
    if (preview.ok) expect(preview.value.conflicts).toContain("transfer-1");
  });
  it("reports event history conflicts", () => {
    const incoming = bundle([row()], [event({ note: "changed" })]);
    const preview = previewTransferBundleMerge(bundle(), incoming);
    if (preview.ok) expect(preview.value.conflicts).toContain("event-1");
  });
  it("rejects the conflicting merge", () => {
    const incoming = bundle([row({ note: "changed" })], [event()]);
    expect(mergeTransferBundles(bundle(), incoming).ok).toBe(false);
  });
  it("leaves existing records unchanged", () => {
    const original = bundle();
    mergeTransferBundles(original, bundle([row({ id: "transfer-2" })], []));
    expect(original.records.candidates).toHaveLength(1);
  });
  it("leaves existing event history unchanged", () => {
    const original = bundle();
    mergeTransferBundles(original, bundle([row({ id: "transfer-2" })], []));
    expect(original.history.events).toHaveLength(1);
  });
  it("combines non-conflicting candidates", () => {
    const incoming = bundle([row({ id: "transfer-2" })], []);
    const result = mergeTransferBundles(bundle(), incoming);
    if (result.ok) expect(result.value.records.candidates).toHaveLength(2);
  });
  it("retains the original event after merge", () => {
    const result = mergeTransferBundles(bundle(), bundle([row({ id: "transfer-2" })], []));
    if (result.ok) expect(result.value.history.events[0]).toEqual(event());
  });
  it("rejects invalid incoming bundles during merge", () => {
    const incoming = { ...bundle(), version: 2 as 1 };
    expect(mergeTransferBundles(bundle(), incoming).ok).toBe(false);
  });
  it("rejects invalid existing bundles during merge", () => {
    const existing = { ...bundle(), version: 2 as 1 };
    expect(mergeTransferBundles(existing, bundle()).ok).toBe(false);
  });
  it("rejects histories that refer to nonexisting packs", () => {
    const incoming = bundle([], [event()]);
    expect(previewTransferBundleMerge(bundle(), incoming).ok).toBe(false);
  });
  it("returns UNKNOWN when there are no events", () => {
    const result = reconcileTransferHistory(records(), emptyHistory());
    if (result.ok) expect(result.value.get("transfer-1")?.lastAction).toBe("UNKNOWN");
  });
  it("returns the most recent reported review action", () => {
    const sequence = history([event(), event({ id: "event-2", action: "review" })]);
    const result = reconcileTransferHistory(records(), sequence);
    if (result.ok) expect(result.value.get("transfer-1")?.lastAction).toBe("review");
  });
  it("keeps unknown condition after a reported review", () => {
    const sequence = history([event(), event({ id: "event-2", action: "review" })]);
    const result = reconcileTransferHistory(records(), sequence);
    if (result.ok) expect(result.value.get("transfer-1")?.candidate.condition).toBe("unknown");
  });
  it("returns a separate record per candidate", () => {
    const inputs = records([row(), row({ id: "transfer-2" })]);
    const result = reconcileTransferHistory(inputs, history());
    if (result.ok) expect(result.value.size).toBe(2);
  });
  it("finds a candidate by its immutable identifier", () => {
    expect(transferBundleHasCandidate(bundle(), row())).toBe(true);
  });
  it("does not find a missing candidate", () => {
    expect(transferBundleHasCandidate(bundle(), row({ id: "transfer-2" }))).toBe(false);
  });
  it("rejects an invalid candidate lookup", () => {
    expect(transferBundleHasCandidate(bundle(), { ...row(), id: "../bad" })).toBe(false);
  });
  it("rejects candidate lookup in an invalid bundle", () => {
    expect(transferBundleHasCandidate({ ...bundle(), version: 2 as 1 }, row())).toBe(false);
  });
});
