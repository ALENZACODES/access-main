import { describe, expect, it } from "vitest";
import {
  WITNESS_ACTIONS, WITNESS_CHANNELS, WITNESS_CONDITIONS, WITNESS_KINDS,
  WITNESS_LIMITS, WITNESS_PHASES, WITNESS_SCHEMA, WITNESS_TIERS,
  appendWitnessEvent, appendWitnessTransfer, emptyWitnessDocument,
  filterWitnessTransfers, mergeWitnessDocuments, nextWitnessId,
  nextWitnessPhase, parseWitnessDocument, previewWitnessMerge,
  serializeWitnessDocument, summarizeWitnessDocument, validateWitnessDocument,
  validateWitnessEvent, validateWitnessSource, validateWitnessTransfer,
  witnessContentReady, witnessEventsFor, type WitnessDocument,
  type WitnessEvent, type WitnessSource, type WitnessTransfer,
} from "./recoveryTransferWitness";

const time = "2026-11-20T09:00:00.000Z";
const next = "2026-11-20T10:00:00.000Z";
const source: WitnessSource = {
  name: "Local inspection notes",
  licence: "Example notes licence",
  retrievedOn: "2026-11-20",
  reference: "local-reference",
  tier: "UNKNOWN",
};
const transfer = (id = "witness-1", override: Partial<WitnessTransfer> = {}): WitnessTransfer => ({
  id,
  packId: "local-pack-1",
  label: "Manual transfer record",
  kind: "recovery-report",
  channel: "UNKNOWN",
  condition: "UNKNOWN",
  phase: "draft",
  recordedAt: time,
  source,
  note: "Reported observation only",
  suppliedBytes: null,
  suppliedDigest: null,
  ...override,
});
const event = (id = "witness-event-1", override: Partial<WitnessEvent> = {}): WitnessEvent => ({
  id,
  transferId: "witness-1",
  action: "note",
  at: next,
  note: "Manual follow-up",
  source,
  ...override,
});
const document = (transfers: WitnessTransfer[] = [], events: WitnessEvent[] = []): WitnessDocument => ({
  schema: WITNESS_SCHEMA, transfers, events,
});
const apply = (doc: WitnessDocument, action: WitnessEvent["action"], id: string, at = next) =>
  appendWitnessEvent(doc, event(id, { action, at }));

// These test inputs never contain real accessibility facts about public places.
describe("transfer witness schema and safe local document", () => {
  it("starts empty and versioned", () => {
    expect(emptyWitnessDocument()).toEqual({ schema: WITNESS_SCHEMA, transfers: [], events: [] });
  });
  it("never infers content readiness from an empty document", () => {
    expect(witnessContentReady(emptyWitnessDocument())).toBe(false);
  });
  it("never infers content readiness after a receipt", () => {
    expect(witnessContentReady(document([transfer("witness-1", { phase: "acknowledged" })]))).toBe(false);
  });
  it("provides a bounded manual JSON import size", () => {
    expect(WITNESS_LIMITS.bytes).toBeLessThanOrEqual(1_000_000);
  });
  it("has a finite entry limit", () => {
    expect(WITNESS_LIMITS.transfers).toBeGreaterThan(0);
    expect(WITNESS_LIMITS.transfers).toBeLessThan(1_000);
  });
  it("has a finite event limit", () => {
    expect(WITNESS_LIMITS.events).toBeGreaterThan(WITNESS_LIMITS.transfers);
    expect(WITNESS_LIMITS.events).toBeLessThan(5_000);
  });
  it("preserves literal UNKNOWN for channels", () => {
    expect(WITNESS_CHANNELS).toContain("UNKNOWN");
  });
  it("preserves literal UNKNOWN for conditions", () => {
    expect(WITNESS_CONDITIONS).toContain("UNKNOWN");
  });
  it("preserves literal UNKNOWN for evidence tiers", () => {
    expect(WITNESS_TIERS).toContain("UNKNOWN");
  });
  it("never has an inferred ready condition", () => {
    expect(WITNESS_CONDITIONS).not.toContain("ready");
  });
  it("supports manual evidence-list transfers", () => {
    expect(WITNESS_KINDS).toContain("evidence-list");
  });
  it("supports notes and reported acknowledgements", () => {
    expect(WITNESS_ACTIONS).toContain("note");
    expect(WITNESS_ACTIONS).toContain("acknowledged");
  });
  it("keeps withdrawn and disputed phases distinct", () => {
    expect(WITNESS_PHASES).toContain("withdrawn");
    expect(WITNESS_PHASES).toContain("disputed");
  });
  it("rejects a different schema version", () => {
    expect(validateWitnessDocument({ ...emptyWitnessDocument(), schema: "unknown" })).toMatchObject({ ok: false, issue: "format" });
  });
  it("rejects an object without events", () => {
    expect(validateWitnessDocument({ schema: WITNESS_SCHEMA, transfers: [] })).toMatchObject({ ok: false, issue: "format" });
  });
  it("rejects an object without transfers", () => {
    expect(validateWitnessDocument({ schema: WITNESS_SCHEMA, events: [] })).toMatchObject({ ok: false, issue: "format" });
  });
  it("rejects a null document", () => {
    expect(validateWitnessDocument(null)).toMatchObject({ ok: false, issue: "format" });
  });
  it("rejects an array document", () => {
    expect(validateWitnessDocument([])).toMatchObject({ ok: false, issue: "format" });
  });
  it("accepts an empty versioned document", () => {
    expect(validateWitnessDocument(emptyWitnessDocument()).ok).toBe(true);
  });
  it("rejects duplicate transfer identifiers", () => {
    expect(validateWitnessDocument(document([transfer(), transfer()]))).toMatchObject({ ok: false, issue: "duplicate" });
  });
  it("rejects duplicate event identifiers", () => {
    expect(validateWitnessDocument(document([transfer()], [event(), event()]))).toMatchObject({ ok: false, issue: "duplicate" });
  });
  it("rejects an event pointing to an absent transfer", () => {
    expect(validateWitnessDocument(document([transfer()], [event("event-2", { transferId: "missing" })]))).toMatchObject({ ok: false, issue: "reference" });
  });
  it("rejects an event before transfer creation", () => {
    expect(validateWitnessDocument(document([transfer()], [event("event-2", { at: "2026-11-19T10:00:00.000Z" })]))).toMatchObject({ ok: false, issue: "order" });
  });
  it("accepts an event at the transfer creation instant", () => {
    expect(validateWitnessDocument(document([transfer()], [event("event-2", { at: time })])).ok).toBe(true);
  });
  it("rejects excessive transfer entries", () => {
    const entries = Array.from({ length: WITNESS_LIMITS.transfers + 1 }, (_, i) => transfer(`record-${i + 1}`));
    expect(validateWitnessDocument(document(entries))).toMatchObject({ ok: false, issue: "size" });
  });
  it("rejects excessive event entries", () => {
    const events = Array.from({ length: WITNESS_LIMITS.events + 1 }, (_, i) => event(`event-${i + 1}`));
    expect(validateWitnessDocument(document([transfer()], events))).toMatchObject({ ok: false, issue: "size" });
  });
});

describe("transfer witness provenance and field validation", () => {
  it("accepts supplied source metadata", () => {
    expect(validateWitnessSource(source)).toBe(true);
  });
  it("rejects an empty source name", () => {
    expect(validateWitnessSource({ ...source, name: "" })).toBe(false);
  });
  it("rejects whitespace-only source names", () => {
    expect(validateWitnessSource({ ...source, name: "  " })).toBe(false);
  });
  it("rejects an empty licence", () => {
    expect(validateWitnessSource({ ...source, licence: "" })).toBe(false);
  });
  it("rejects a missing source reference", () => {
    expect(validateWitnessSource({ ...source, reference: "" })).toBe(false);
  });
  it("rejects an invalid February date", () => {
    expect(validateWitnessSource({ ...source, retrievedOn: "2026-02-30" })).toBe(false);
  });
  it("allows a leap day from a leap year", () => {
    expect(validateWitnessSource({ ...source, retrievedOn: "2024-02-29" })).toBe(true);
  });
  it("rejects an unsupported source tier", () => {
    expect(validateWitnessSource({ ...source, tier: "certain" })).toBe(false);
  });
  it("accepts an unknown source tier without upgrading it", () => {
    expect(validateWitnessSource({ ...source, tier: "UNKNOWN" })).toBe(true);
  });
  it("rejects a source with a NUL", () => {
    expect(validateWitnessSource({ ...source, name: "Bad\u0000source" })).toBe(false);
  });
  it("rejects a source with an escape control", () => {
    expect(validateWitnessSource({ ...source, name: "Bad\u001bsource" })).toBe(false);
  });
  it("accepts a source with a normal newline", () => {
    expect(validateWitnessSource({ ...source, name: "Local\nnotes" })).toBe(true);
  });
  it("rejects a very long source reference", () => {
    expect(validateWitnessSource({ ...source, reference: "a".repeat(WITNESS_LIMITS.label + 1) })).toBe(false);
  });
  it("rejects a transfer with unsafe identifier", () => {
    expect(validateWitnessTransfer(transfer("bad/id"))).toBe(false);
  });
  it("rejects an empty pack identifier", () => {
    expect(validateWitnessTransfer(transfer("witness-1", { packId: "" }))).toBe(false);
  });
  it("rejects an empty transfer label", () => {
    expect(validateWitnessTransfer(transfer("witness-1", { label: " " }))).toBe(false);
  });
  it("rejects negative reported bytes", () => {
    expect(validateWitnessTransfer(transfer("witness-1", { suppliedBytes: -1 }))).toBe(false);
  });
  it("rejects fractional reported bytes", () => {
    expect(validateWitnessTransfer(transfer("witness-1", { suppliedBytes: 1.5 }))).toBe(false);
  });
  it("accepts zero reported bytes as a supplied value", () => {
    expect(validateWitnessTransfer(transfer("witness-1", { suppliedBytes: 0 }))).toBe(true);
  });
  it("accepts absent reported bytes", () => {
    expect(validateWitnessTransfer(transfer())).toBe(true);
  });
  it("rejects an empty digest string", () => {
    expect(validateWitnessTransfer(transfer("witness-1", { suppliedDigest: "" }))).toBe(false);
  });
  it("accepts a supplied digest as an untrusted field", () => {
    expect(validateWitnessTransfer(transfer("witness-1", { suppliedDigest: "manual-fingerprint" }))).toBe(true);
  });
  it("rejects unsupported transfer kind", () => {
    expect(validateWitnessTransfer({ ...transfer(), kind: "network-probe" })).toBe(false);
  });
  it("rejects an impossible timestamp", () => {
    expect(validateWitnessTransfer(transfer("witness-1", { recordedAt: "yesterday" }))).toBe(false);
  });
  it("rejects an observation beyond the note limit", () => {
    expect(validateWitnessTransfer(transfer("witness-1", { note: "n".repeat(WITNESS_LIMITS.note + 1) }))).toBe(false);
  });
  it("accepts a manual event with provenance", () => {
    expect(validateWitnessEvent(event())).toBe(true);
  });
  it("rejects an event without source", () => {
    const { source: omitted, ...rest } = event();
    void omitted;
    expect(validateWitnessEvent(rest)).toBe(false);
  });
  it("rejects an event with an unsupported action", () => {
    expect(validateWitnessEvent({ ...event(), action: "automatic-download" })).toBe(false);
  });
  it("rejects an event with an invalid time", () => {
    expect(validateWitnessEvent({ ...event(), at: "not-a-time" })).toBe(false);
  });
  it("accepts a note even if its text is empty", () => {
    expect(validateWitnessEvent(event("witness-event-1", { note: "" }))).toBe(true);
  });
});

describe("manual transfer creation and state transitions", () => {
  it("adds a draft transfer", () => {
    const result = appendWitnessTransfer(emptyWitnessDocument(), transfer());
    expect(result.ok && result.value.transfers).toHaveLength(1);
  });
  it("does not mutate the original document", () => {
    const old = emptyWitnessDocument();
    appendWitnessTransfer(old, transfer());
    expect(old.transfers).toHaveLength(0);
  });
  it("rejects duplicate transfer additions", () => {
    expect(appendWitnessTransfer(document([transfer()]), transfer())).toMatchObject({ ok: false, issue: "duplicate" });
  });
  it("rejects transfers that claim an initial acknowledgement", () => {
    expect(appendWitnessTransfer(emptyWitnessDocument(), transfer("witness-1", { phase: "acknowledged" }))).toMatchObject({ ok: false, issue: "transition" });
  });
  it("rejects transfers with malformed source data", () => {
    expect(appendWitnessTransfer(emptyWitnessDocument(), transfer("witness-1", { source: { ...source, licence: "" } }))).toMatchObject({ ok: false, issue: "format" });
  });
  it("rejects additions once the transfer capacity is reached", () => {
    const transfers = Array.from({ length: WITNESS_LIMITS.transfers }, (_, i) => transfer(`r-${i}`));
    expect(appendWitnessTransfer(document(transfers), transfer("more"))).toMatchObject({ ok: false, issue: "size" });
  });
  it("adds a note without changing the draft phase", () => {
    const result = apply(document([transfer()]), "note", "note-1");
    expect(result.ok && result.value.transfers[0]?.phase).toBe("draft");
  });
  it("moves a draft to offered", () => {
    const result = apply(document([transfer()]), "offered", "offer-1");
    expect(result.ok && result.value.transfers[0]?.phase).toBe("offered");
  });
  it("does not acknowledge a draft without an offer", () => {
    expect(apply(document([transfer()]), "acknowledged", "ack-1")).toMatchObject({ ok: false, issue: "transition" });
  });
  it("records an acknowledgement after an offer", () => {
    const offered = apply(document([transfer()]), "offered", "offer-1");
    if (!offered.ok) throw new Error("offer failed");
    const result = apply(offered.value, "acknowledged", "ack-1", "2026-11-20T11:00:00.000Z");
    expect(result.ok && result.value.transfers[0]?.phase).toBe("acknowledged");
  });
  it("allows an offered transfer to be disputed", () => {
    expect(nextWitnessPhase("offered", "disputed")).toBe("disputed");
  });
  it("allows a disputed transfer to be reopened", () => {
    expect(nextWitnessPhase("disputed", "reopened")).toBe("draft");
  });
  it("allows a withdrawn transfer to be reopened", () => {
    expect(nextWitnessPhase("withdrawn", "reopened")).toBe("draft");
  });
  it("does not offer an acknowledged transfer again", () => {
    expect(nextWitnessPhase("acknowledged", "offered")).toBeNull();
  });
  it("does not allow a new created action to rewrite history", () => {
    expect(nextWitnessPhase("draft", "created")).toBeNull();
  });
  it("permits manual notes after withdrawal", () => {
    expect(nextWitnessPhase("withdrawn", "note")).toBe("withdrawn");
  });
  it("does not silently retry a disputed transfer", () => {
    expect(nextWitnessPhase("disputed", "offered")).toBeNull();
  });
  it("rejects an event for an absent transfer", () => {
    expect(appendWitnessEvent(emptyWitnessDocument(), event())).toMatchObject({ ok: false, issue: "reference" });
  });
  it("rejects duplicate event additions", () => {
    expect(appendWitnessEvent(document([transfer()], [event()]), event())).toMatchObject({ ok: false, issue: "duplicate" });
  });
  it("rejects an event recorded before the transfer", () => {
    expect(appendWitnessEvent(document([transfer()]), event("event-1", { at: "2026-11-19T10:00:00.000Z" }))).toMatchObject({ ok: false, issue: "order" });
  });
  it("rejects a late-inserted event earlier than an existing event", () => {
    expect(appendWitnessEvent(document([transfer()], [event("event-1", { at: "2026-11-20T12:00:00.000Z" })]), event("event-2", { at: next }))).toMatchObject({ ok: false, issue: "order" });
  });
  it("preserves all events without overwriting an earlier note", () => {
    const result = appendWitnessEvent(document([transfer()], [event("event-1")]), event("event-2", { at: "2026-11-20T11:00:00.000Z" }));
    expect(result.ok && result.value.events.map((item) => item.id)).toEqual(["event-1", "event-2"]);
  });
  it("finds events only for the requested transfer", () => {
    const doc = document([transfer(), transfer("witness-2")], [event(), event("event-2", { transferId: "witness-2" })]);
    expect(witnessEventsFor(doc, "witness-2").map((item) => item.id)).toEqual(["event-2"]);
  });
  it("orders returned events chronologically", () => {
    const doc = document([transfer()], [event("event-2", { at: "2026-11-20T12:00:00.000Z" }), event("event-1")]);
    expect(witnessEventsFor(doc, "witness-1").map((item) => item.id)).toEqual(["event-1", "event-2"]);
  });
  it("provides deterministic next transfer IDs", () => {
    expect(nextWitnessId(document([transfer("witness-1")]), "transfer")).toBe("witness-2");
  });
  it("skips an already occupied transfer ID", () => {
    expect(nextWitnessId(document([transfer("witness-2")]), "transfer")).toBe("witness-1");
  });
  it("provides deterministic next event IDs", () => {
    expect(nextWitnessId(document([transfer()], [event("witness-event-1")]), "event")).toBe("witness-event-2");
  });
});

describe("manual witness filtering and summary", () => {
  const docs = document([
    transfer("witness-1"),
    transfer("witness-2", { packId: "local-pack-2", kind: "handoff-note", phase: "offered", condition: "interrupted", channel: "paper" }),
    transfer("witness-3", { packId: "local-pack-2", kind: "evidence-list", phase: "acknowledged", condition: "partial", channel: "manual-file", source: { ...source, tier: "documented" } }),
    transfer("witness-4", { packId: "local-pack-3", kind: "pack-metadata", phase: "disputed", condition: "not-accessible", channel: "conversation" }),
  ], [event()]);
  it("filters by pack identifier", () => {
    expect(filterWitnessTransfers(docs, { packId: "local-pack-2" })).toHaveLength(2);
  });
  it("filters by reported kind", () => {
    expect(filterWitnessTransfers(docs, { kind: "handoff-note" }).map((item) => item.id)).toEqual(["witness-2"]);
  });
  it("filters by channel without translating UNKNOWN", () => {
    expect(filterWitnessTransfers(docs, { channel: "UNKNOWN" }).map((item) => item.id)).toEqual(["witness-1"]);
  });
  it("filters by current phase", () => {
    expect(filterWitnessTransfers(docs, { phase: "disputed" }).map((item) => item.id)).toEqual(["witness-4"]);
  });
  it("filters by reported condition", () => {
    expect(filterWitnessTransfers(docs, { condition: "partial" }).map((item) => item.id)).toEqual(["witness-3"]);
  });
  it("supports case-insensitive label search", () => {
    expect(filterWitnessTransfers(docs, { query: "MANUAL TRANSFER" })).toHaveLength(4);
  });
  it("matches exact source references", () => {
    expect(filterWitnessTransfers(docs, { query: "LOCAL-REFERENCE" })).toHaveLength(4);
  });
  it("does not return unrelated packs", () => {
    expect(filterWitnessTransfers(docs, { packId: "missing-pack" })).toEqual([]);
  });
  it("combines independent filters", () => {
    expect(filterWitnessTransfers(docs, { packId: "local-pack-2", phase: "offered" })).toHaveLength(1);
  });
  it("reports the total number of transfers", () => {
    expect(summarizeWitnessDocument(docs).total).toBe(4);
  });
  it("counts only recorded events", () => {
    expect(summarizeWitnessDocument(docs).events).toBe(1);
  });
  it("counts unknown source tiers and conditions without replacing them", () => {
    expect(summarizeWitnessDocument(docs).unknown).toBe(3);
  });
  it("tracks independent pack identifiers", () => {
    expect(summarizeWitnessDocument(docs).distinctPacks).toBe(3);
  });
  it("tracks offered and disputed separately", () => {
    const summary = summarizeWitnessDocument(docs);
    expect(summary.offered).toBe(1);
    expect(summary.disputed).toBe(1);
  });
  it("does not count acknowledged transfers as missing receipts", () => {
    expect(summarizeWitnessDocument(docs).missingReceipt).toBe(3);
  });
  it("does not infer pack usability from any summary", () => {
    expect(summarizeWitnessDocument(docs).contentReady).toBe(false);
  });
});

describe("bounded transfer witness JSON and conflict-safe merges", () => {
  const left = document([transfer("witness-1")], [event("event-1")]);
  const identical = document([transfer("witness-1")], [event("event-1")]);
  const additional = document([transfer("witness-2", { packId: "local-pack-2" })], [event("event-2", { transferId: "witness-2" })]);
  it("serializes a valid local document", () => {
    const result = serializeWitnessDocument(left);
    expect(result.ok).toBe(true);
    if (result.ok) expect(JSON.parse(result.value)).toMatchObject({ schema: WITNESS_SCHEMA });
  });
  it("round-trips a supplied source without editing the licence", () => {
    const result = serializeWitnessDocument(left);
    if (!result.ok) throw new Error(result.issue);
    const parsed = parseWitnessDocument(result.value);
    expect(parsed.ok && parsed.value.transfers[0]?.source.licence).toBe(source.licence);
  });
  it("keeps the literal UNKNOWN through JSON export", () => {
    const result = serializeWitnessDocument(left);
    expect(result.ok && result.value.includes('"UNKNOWN"')).toBe(true);
  });
  it("rejects malformed JSON", () => {
    expect(parseWitnessDocument("{not valid")).toMatchObject({ ok: false, issue: "format" });
  });
  it("rejects JSON without the expected schema", () => {
    expect(parseWitnessDocument('{"transfers":[],"events":[]}')).toMatchObject({ ok: false, issue: "format" });
  });
  it("rejects an oversized imported file", () => {
    expect(parseWitnessDocument("x".repeat(WITNESS_LIMITS.bytes + 1))).toMatchObject({ ok: false, issue: "size" });
  });
  it("does not merge duplicate transfer copies twice", () => {
    const merged = mergeWitnessDocuments(left, identical);
    expect(merged.ok && merged.value.transfers).toHaveLength(1);
  });
  it("does not merge duplicate event copies twice", () => {
    const merged = mergeWitnessDocuments(left, identical);
    expect(merged.ok && merged.value.events).toHaveLength(1);
  });
  it("identifies new transfer counts before import", () => {
    expect(previewWitnessMerge(left, additional).added).toBe(1);
  });
  it("identifies new event counts before import", () => {
    expect(previewWitnessMerge(left, additional).addedEvents).toBe(1);
  });
  it("reports identical content without treating it as a conflict", () => {
    expect(previewWitnessMerge(left, identical)).toMatchObject({ unchanged: 1, unchangedEvents: 1, conflicts: [], eventConflicts: [] });
  });
  it("detects conflicting transfer observations", () => {
    const changed = document([transfer("witness-1", { condition: "interrupted" })]);
    expect(previewWitnessMerge(left, changed).conflicts).toEqual(["witness-1"]);
  });
  it("detects conflicting event notes", () => {
    const changed = document([transfer("witness-1")], [event("event-1", { note: "Different note" })]);
    expect(previewWitnessMerge(left, changed).eventConflicts).toEqual(["event-1"]);
  });
  it("fails closed rather than overwriting a changed transfer", () => {
    const changed = document([transfer("witness-1", { condition: "partial" })]);
    expect(mergeWitnessDocuments(left, changed)).toMatchObject({ ok: false, issue: "conflict" });
  });
  it("fails closed rather than overwriting a changed event", () => {
    const changed = document([transfer("witness-1")], [event("event-1", { note: "Other text" })]);
    expect(mergeWitnessDocuments(left, changed)).toMatchObject({ ok: false, issue: "conflict" });
  });
  it("merges distinct records together", () => {
    const merged = mergeWitnessDocuments(left, additional);
    expect(merged.ok && merged.value.transfers).toHaveLength(2);
  });
  it("merges distinct events with their corresponding transfers", () => {
    const merged = mergeWitnessDocuments(left, additional);
    expect(merged.ok && merged.value.events).toHaveLength(2);
  });
  it("rejects imports with broken references", () => {
    const broken = document([], [event()]);
    expect(mergeWitnessDocuments(left, broken)).toMatchObject({ ok: false, issue: "reference" });
  });
  it("rejects imports with duplicate record identifiers", () => {
    const duplicates = document([transfer(), transfer()]);
    expect(mergeWitnessDocuments(left, duplicates)).toMatchObject({ ok: false, issue: "duplicate" });
  });
  it("leaves the input unchanged on a merge failure", () => {
    const original = JSON.stringify(left);
    mergeWitnessDocuments(left, document([transfer("witness-1", { condition: "partial" })]));
    expect(JSON.stringify(left)).toBe(original);
  });
  it("retains the versioned schema after a successful merge", () => {
    const merged = mergeWitnessDocuments(left, additional);
    expect(merged.ok && merged.value.schema).toBe(WITNESS_SCHEMA);
  });
});
