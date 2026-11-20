import { describe, expect, it } from "vitest";
import {
  CHAIN_LIMITS, appendChainEvent, appendChainLink, appendChainNode,
  chainForPack, checkChainDocument, compareChainPacks, emptyChain,
  mergeChainDocuments, parseChain, previewChainMerge, serializeChain,
  type ChainDocument, type ChainEvent, type ChainLink, type ChainNode,
} from "./recoveryHandoffChain";

const provenance = { name: "Sample log", licence: "Local sample", retrievedOn: "2026-11-19", tier: "UNKNOWN" as const, reference: "sample-1" };
const step = (id: string, changes: Partial<ChainNode> = {}): ChainNode => ({
  id, packId: "pack-a", role: "origin", title: "Offline step", state: "UNKNOWN",
  phase: "draft", note: "", recordedAt: "2026-11-19T08:00:00.000Z", source: provenance, ...changes,
});
const edge = (id: string, fromId: string, toId: string, changes: Partial<ChainLink> = {}): ChainLink => ({
  id, fromId, toId, state: "UNKNOWN", note: "Not established", recordedAt: "2026-11-19T10:00:00.000Z", source: provenance, ...changes,
});
const manual = (id: string, nodeId: string, changes: Partial<ChainEvent> = {}): ChainEvent => ({
  id, nodeId, action: "noted", at: "2026-11-19T11:00:00.000Z", note: "Manual note", source: provenance, ...changes,
});
const document = (nodes: ChainNode[] = [], links: ChainLink[] = [], events: ChainEvent[] = []): ChainDocument => ({ ...emptyChain(), nodes, links, events });
const first = step("node-1");
const second = step("node-2", { role: "recipient" });
const base = document([first, second], [edge("link-1", "node-1", "node-2")], [manual("event-1", "node-1")]);

function read<T>(value: { ok: true; value: T } | { ok: false; issue: string }): T {
  if (!value.ok) throw Error(`Unexpected failure: ${value.issue}`);
  return value.value;
}

describe("portable handoff chain import and export", () => {
  it("exports the correct schema", () => {
    const text = read(serializeChain(emptyChain()));
    expect(text).toContain("the-app.recovery-handoff-chain.v1");
  });
  it("serializes a known synthetic record", () => {
    const text = read(serializeChain(document([first])));
    expect(text).toContain('"node-1"');
  });
  it("serializes source metadata", () => {
    const text = read(serializeChain(document([first])));
    expect(text).toContain('"retrievedOn"');
    expect(text).toContain('"licence"');
    expect(text).toContain('"reference"');
    expect(text).toContain('"tier"');
  });
  it("round-trips an empty document", () => {
    const encoded = read(serializeChain(emptyChain()));
    expect(read(parseChain(encoded))).toEqual(emptyChain());
  });
  it("round-trips nodes, links, and events", () => {
    const encoded = read(serializeChain(base));
    expect(read(parseChain(encoded))).toEqual(base);
  });
  it("round-trips unicode notes", () => {
    const unicode = document([step("node-1", { note: "Révision d’un transfert" })]);
    expect(read(parseChain(read(serializeChain(unicode))))).toEqual(unicode);
  });
  it("keeps literal UNKNOWN in JSON", () => {
    expect(read(serializeChain(base))).toContain('"UNKNOWN"');
  });
  it("preserves acknowledgement history", () => {
    const ack = document([first], [], [manual("event-1", "node-1", { action: "acknowledged" })]);
    expect(read(parseChain(read(serializeChain(ack)))).events[0]?.action).toBe("acknowledged");
  });
  it("does not serialize an invalid reference", () => {
    expect(serializeChain(document([], [], [manual("event-1", "missing")])).ok).toBe(false);
  });
  it("does not serialize duplicate node IDs", () => {
    expect(serializeChain(document([first, first])).ok).toBe(false);
  });
  it("does not serialize a cycle", () => {
    const cyclic = document([first, second], [edge("link-1", "node-1", "node-2"), edge("link-2", "node-2", "node-1")]);
    expect(serializeChain(cyclic)).toMatchObject({ ok: false, issue: "cycle" });
  });
  it("parses formatted JSON with whitespace", () => {
    const padded = `\n ${read(serializeChain(base))} \n`;
    expect(parseChain(padded).ok).toBe(true);
  });
  it("rejects malformed JSON", () => { expect(parseChain("{oops")).toMatchObject({ ok: false, issue: "schema" }); });
  it("rejects empty JSON string", () => { expect(parseChain("").ok).toBe(false); });
  it("rejects a JSON null", () => { expect(parseChain("null").ok).toBe(false); });
  it("rejects a JSON array", () => { expect(parseChain("[]").ok).toBe(false); });
  it("rejects a JSON number", () => { expect(parseChain("11").ok).toBe(false); });
  it("rejects a JSON object with no schema", () => { expect(parseChain("{}").ok).toBe(false); });
  it("rejects unexpected root keys", () => {
    expect(parseChain(JSON.stringify({ ...emptyChain(), extra: "no" })).ok).toBe(false);
  });
  it("rejects a changed schema version", () => {
    expect(parseChain(JSON.stringify({ ...emptyChain(), schema: "the-app.recovery-handoff-chain.v2" })).ok).toBe(false);
  });
  it("rejects invalid event references in JSON", () => {
    expect(parseChain(JSON.stringify(document([first], [], [manual("event-1", "missing")]))).ok).toBe(false);
  });
  it("rejects duplicate records in JSON", () => {
    expect(parseChain(JSON.stringify(document([first, first]))).ok).toBe(false);
  });
  it("rejects control characters escaped in JSON", () => {
    const invalid = document([step("node-1", { note: "x\u0003y" })]);
    expect(parseChain(JSON.stringify(invalid)).ok).toBe(false);
  });
  it("rejects files over configured bound", () => {
    expect(parseChain("X".repeat(CHAIN_LIMITS.bytes + 1))).toMatchObject({ ok: false, issue: "limit" });
  });
  it("has a bounded byte limit below a megabyte", () => {
    expect(CHAIN_LIMITS.bytes).toBeLessThan(1_000_000);
  });
  it("does not mistake the byte size for character count", () => {
    const payload = `"${"é".repeat(CHAIN_LIMITS.bytes)}"`;
    expect(parseChain(payload).ok).toBe(false);
  });
  it("reports a roundtrip with all three arrays", () => {
    const parsed = read(parseChain(read(serializeChain(base))));
    expect(parsed.nodes).toHaveLength(2);
    expect(parsed.links).toHaveLength(1);
    expect(parsed.events).toHaveLength(1);
  });
});

describe("conflict-safe manual merges", () => {
  it("previews additions to empty journal", () => {
    expect(previewChainMerge(emptyChain(), base)).toMatchObject({ nodesAdded: 2, linksAdded: 1, eventsAdded: 1 });
  });
  it("previews idempotent imports", () => {
    expect(previewChainMerge(base, base)).toMatchObject({ nodesAdded: 0, linksAdded: 0, eventsAdded: 0 });
  });
  it("identifies a changed step as a conflict", () => {
    const incoming = document([step("node-1", { note: "Changed" })]);
    expect(previewChainMerge(document([first]), incoming).nodeConflicts).toBe(1);
  });
  it("identifies a changed link as a conflict", () => {
    const incoming = document([first, second], [edge("link-1", "node-1", "node-2", { state: "disputed" })]);
    expect(previewChainMerge(base, incoming).linkConflicts).toBe(1);
  });
  it("identifies a changed event as a conflict", () => {
    const incoming = document([first], [], [manual("event-1", "node-1", { note: "Changed" })]);
    expect(previewChainMerge(base, incoming).eventConflicts).toBe(1);
  });
  it("never claims content ready in a preview", () => {
    expect(previewChainMerge(base, base).contentReady).toBe(false);
  });
  it("refuses conflicting steps", () => {
    const changed = document([step("node-1", { state: "observed" })]);
    expect(mergeChainDocuments(document([first]), changed)).toMatchObject({ ok: false, issue: "conflict" });
  });
  it("refuses conflicting links", () => {
    const changed = document([first, second], [edge("link-1", "node-1", "node-2", { state: "missing" })]);
    expect(mergeChainDocuments(base, changed).ok).toBe(false);
  });
  it("refuses conflicting events", () => {
    const changed = document([first], [], [manual("event-1", "node-1", { action: "disputed" })]);
    expect(mergeChainDocuments(base, changed).ok).toBe(false);
  });
  it("merges new steps without rewriting existing ones", () => {
    const incoming = document([step("node-3")]);
    const merged = read(mergeChainDocuments(document([first]), incoming));
    expect(merged.nodes).toEqual([first, incoming.nodes[0]]);
  });
  it("merges a new link with already known steps", () => {
    const current = document([first, second]);
    const incoming = document([first, second], [edge("link-1", "node-1", "node-2")]);
    expect(read(mergeChainDocuments(current, incoming)).links).toHaveLength(1);
  });
  it("merges a new event with its step", () => {
    const current = document([first]);
    const incoming = document([first], [], [manual("event-1", "node-1")]);
    expect(read(mergeChainDocuments(current, incoming)).events).toHaveLength(1);
  });
  it("keeps duplicate matching nodes only once", () => {
    expect(read(mergeChainDocuments(document([first]), document([first]))).nodes).toHaveLength(1);
  });
  it("keeps duplicate matching links only once", () => {
    expect(read(mergeChainDocuments(base, base)).links).toHaveLength(1);
  });
  it("keeps duplicate matching events only once", () => {
    expect(read(mergeChainDocuments(base, base)).events).toHaveLength(1);
  });
  it("rejects invalid incoming document", () => {
    const invalid = document([first, first]);
    expect(mergeChainDocuments(base, invalid).ok).toBe(false);
  });
  it("rejects invalid current document", () => {
    const invalid = document([first, first]);
    expect(mergeChainDocuments(invalid, base).ok).toBe(false);
  });
  it("rejects a newly introduced cycle", () => {
    const current = document([first, second], [edge("link-1", "node-1", "node-2")]);
    const incoming = document([first, second], [edge("link-2", "node-2", "node-1")]);
    expect(mergeChainDocuments(current, incoming)).toMatchObject({ ok: false, issue: "cycle" });
  });
  it("rejects a cross-pack merged link", () => {
    const current = document([first]);
    const incoming = document([step("node-2", { packId: "pack-b" })]);
    const firstMerge = read(mergeChainDocuments(current, incoming));
    const invalid = document([first, step("node-2", { packId: "pack-b" })], [edge("link-1", "node-1", "node-2")]);
    expect(checkChainDocument(firstMerge).ok).toBe(true);
    expect(mergeChainDocuments(firstMerge, invalid).ok).toBe(false);
  });
  it("does not inject records from a rejected merge", () => {
    const current = document([first]);
    const conflict = document([step("node-1", { title: "Different" }), step("node-3")]);
    expect(mergeChainDocuments(current, conflict).ok).toBe(false);
    expect(current.nodes).toHaveLength(1);
  });
  it("merges independent packs", () => {
    const incoming = document([step("node-b", { packId: "pack-b" })]);
    expect(read(mergeChainDocuments(document([first]), incoming)).nodes).toHaveLength(2);
  });
  it("preserves incoming order deterministically", () => {
    const incoming = document([step("node-5"), step("node-3")]);
    const ids = read(mergeChainDocuments(document([first]), incoming)).nodes.map((n) => n.id);
    expect(ids).toEqual(["node-1", "node-5", "node-3"]);
  });
  it("does not mutate source inputs", () => {
    const current = document([first]);
    const incoming = document([step("node-2")]);
    mergeChainDocuments(current, incoming);
    expect(current.nodes).toHaveLength(1);
    expect(incoming.nodes).toHaveLength(1);
  });
  it("remains idempotent after repeated imports", () => {
    const once = read(mergeChainDocuments(document([first]), document([second])));
    const twice = read(mergeChainDocuments(once, document([second])));
    expect(twice).toEqual(once);
  });
  it("does not replace missing information with observed", () => {
    const current = document([step("node-1", { state: "UNKNOWN" })]);
    const changed = document([step("node-1", { state: "observed" })]);
    expect(mergeChainDocuments(current, changed).ok).toBe(false);
  });
  it("does not upgrade an unknown tier silently", () => {
    const changed = document([step("node-1", { source: { ...provenance, tier: "reviewed" } })]);
    expect(mergeChainDocuments(document([first]), changed).ok).toBe(false);
  });
  it("does not ignore conflicting licence metadata", () => {
    const changed = document([step("node-1", { source: { ...provenance, licence: "Different" } })]);
    expect(mergeChainDocuments(document([first]), changed).ok).toBe(false);
  });
});

describe("pack-to-pack comparisons", () => {
  it("finds newly added steps", () => {
    const older = document([first]);
    const newer = document([first, second]);
    expect(compareChainPacks(older, newer, "pack-a").added).toEqual(["node-2"]);
  });
  it("finds removed steps", () => {
    expect(compareChainPacks(document([first]), emptyChain(), "pack-a").removed).toEqual(["node-1"]);
  });
  it("finds changed observations", () => {
    const newer = document([step("node-1", { note: "Changed" })]);
    expect(compareChainPacks(document([first]), newer, "pack-a").changed).toEqual(["node-1"]);
  });
  it("does not consider unrelated packs", () => {
    const newer = document([first, step("node-3", { packId: "pack-b" })]);
    expect(compareChainPacks(document([first]), newer, "pack-a").added).toEqual([]);
  });
  it("returns empty arrays if packs are absent", () => {
    expect(compareChainPacks(emptyChain(), emptyChain(), "none")).toMatchObject({ added: [], removed: [], changed: [] });
  });
  it("preserves contentReady false", () => {
    expect(compareChainPacks(document([first]), document([second]), "pack-a").contentReady).toBe(false);
  });
  it("sorts multiple added IDs", () => {
    const newer = document([first, step("node-z"), step("node-b")]);
    expect(compareChainPacks(document([first]), newer, "pack-a").added).toEqual(["node-b", "node-z"]);
  });
  it("sorts multiple removed IDs", () => {
    const older = document([first, step("node-z"), step("node-b")]);
    expect(compareChainPacks(older, document([first]), "pack-a").removed).toEqual(["node-b", "node-z"]);
  });
  it("keeps identical steps stable", () => {
    expect(compareChainPacks(base, base, "pack-a")).toMatchObject({ added: [], removed: [], changed: [] });
  });
  it("treats changed source dates as a changed record", () => {
    const newer = document([step("node-1", { source: { ...provenance, retrievedOn: "2026-11-18" } })]);
    expect(compareChainPacks(document([first]), newer, "pack-a").changed).toEqual(["node-1"]);
  });
});

describe("independent operation composition", () => {
  it("can append two nodes, a link, and an event", () => {
    const a = read(appendChainNode(emptyChain(), first));
    const b = read(appendChainNode(a, second));
    const c = read(appendChainLink(b, edge("link-1", "node-1", "node-2")));
    const d = read(appendChainEvent(c, manual("event-1", "node-1")));
    expect(d).toEqual(base);
  });
  it("does not add an event to absent node during compose", () => {
    const firstStage = read(appendChainNode(emptyChain(), first));
    expect(appendChainEvent(firstStage, manual("event-1", "none")).ok).toBe(false);
  });
  it("accepts manually acknowledged recipient", () => {
    const receipt = manual("event-2", "node-2", { action: "acknowledged" });
    const next = read(appendChainEvent(base, receipt));
    expect(chainForPack(next, "pack-a").events).toHaveLength(2);
  });
  it("disallows a new edge that loops back", () => {
    const backward = edge("link-2", "node-2", "node-1");
    expect(appendChainLink(base, backward).ok).toBe(false);
  });
  it("preserves the original after a failed append", () => {
    const failure = appendChainLink(base, edge("link-2", "node-2", "node-1"));
    expect(failure.ok).toBe(false);
    expect(base.links).toHaveLength(1);
  });
});
