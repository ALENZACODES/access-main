import { describe, expect, it } from "vitest";
import {
  CHAIN_ACTIONS, CHAIN_LIMITS, CHAIN_PHASES, CHAIN_ROLES, CHAIN_STATES, CHAIN_TIERS,
  appendChainEvent, appendChainLink, appendChainNode, chainForPack,
  chainHasCycle, chainSummary, changeChainPhase, checkChainDocument,
  checkChainEvent, checkChainLink, checkChainNode, checkChainSource,
  emptyChain, filterChainNodes, nextChainId,
  type ChainDocument, type ChainEvent, type ChainLink, type ChainNode,
} from "./recoveryHandoffChain";

const source = { name: "Local field note", licence: "Example permission", retrievedOn: "2026-11-19", tier: "UNKNOWN" as const, reference: "local:note" };
const timestamp = "2026-11-19T12:00:00.000Z";
const node = (id = "node-1", changes: Partial<ChainNode> = {}): ChainNode => ({
  id, packId: "pack-a", role: "origin", title: "Recorded origin", state: "UNKNOWN",
  phase: "draft", note: "Manual observation", recordedAt: timestamp, source, ...changes,
});
const link = (id = "link-1", changes: Partial<ChainLink> = {}): ChainLink => ({
  id, fromId: "node-1", toId: "node-2", state: "UNKNOWN", note: "Transfer not confirmed",
  recordedAt: "2026-11-19T13:00:00.000Z", source, ...changes,
});
const event = (id = "event-1", changes: Partial<ChainEvent> = {}): ChainEvent => ({
  id, nodeId: "node-1", action: "noted", at: "2026-11-19T13:00:00.000Z", note: "User-directed note", source, ...changes,
});
const doc = (nodes: ChainNode[] = [], links: ChainLink[] = [], events: ChainEvent[] = []): ChainDocument => ({ ...emptyChain(), nodes, links, events });
const pair = doc([node(), node("node-2", { role: "recipient", title: "Receiver" })]);

// The test cases use only synthetic identifiers. No external place information is inferred.
describe("handoff-chain source validation", () => {
  it("accepts exact source metadata", () => { expect(checkChainSource(source).ok).toBe(true); });
  it("keeps UNKNOWN tier unchanged", () => { expect(checkChainSource(source)).toMatchObject({ ok: true, value: source }); });
  it("rejects absent source", () => { expect(checkChainSource(null)).toMatchObject({ ok: false, issue: "source" }); });
  it("rejects arrays as sources", () => { expect(checkChainSource([])).toMatchObject({ ok: false, issue: "source" }); });
  it("rejects an extra key", () => { expect(checkChainSource({ ...source, secret: "x" }).ok).toBe(false); });
  it("rejects missing licence", () => {
    const { licence: _discard, ...rest } = source;
    expect(checkChainSource(rest).ok).toBe(false);
    expect(_discard).toBe("Example permission");
  });
  it("rejects blank source name", () => { expect(checkChainSource({ ...source, name: "  " }).ok).toBe(false); });
  it("rejects blank licence", () => { expect(checkChainSource({ ...source, licence: "" }).ok).toBe(false); });
  it("rejects blank reference", () => { expect(checkChainSource({ ...source, reference: " " }).ok).toBe(false); });
  it("accepts a documented tier", () => { expect(checkChainSource({ ...source, tier: "documented" }).ok).toBe(true); });
  it("rejects a fabricated tier", () => { expect(checkChainSource({ ...source, tier: "certified" }).ok).toBe(false); });
  it("rejects localized unknown tier", () => { expect(checkChainSource({ ...source, tier: "inconnu" }).ok).toBe(false); });
  it("accepts leap date", () => { expect(checkChainSource({ ...source, retrievedOn: "2024-02-29" }).ok).toBe(true); });
  it("rejects impossible leap date", () => { expect(checkChainSource({ ...source, retrievedOn: "2025-02-29" }).ok).toBe(false); });
  it("rejects invalid month", () => { expect(checkChainSource({ ...source, retrievedOn: "2026-13-19" }).ok).toBe(false); });
  it("rejects invalid day", () => { expect(checkChainSource({ ...source, retrievedOn: "2026-11-32" }).ok).toBe(false); });
  it("rejects a future format", () => { expect(checkChainSource({ ...source, retrievedOn: "19/11/2026" }).ok).toBe(false); });
  it("rejects a control character", () => { expect(checkChainSource({ ...source, name: "bad\u0001name" }).ok).toBe(false); });
  it("accepts newline in ordinary notes only", () => { expect(checkChainSource({ ...source, name: "Line\nsource" }).ok).toBe(true); });
  it("rejects overlong name", () => { expect(checkChainSource({ ...source, name: "X".repeat(201) }).ok).toBe(false); });
  it("rejects overlong licence", () => { expect(checkChainSource({ ...source, licence: "X".repeat(201) }).ok).toBe(false); });
  it("rejects overlong reference", () => { expect(checkChainSource({ ...source, reference: "X".repeat(CHAIN_LIMITS.references + 1) }).ok).toBe(false); });
  it("accepts all declared tiers", () => {
    for (const tier of CHAIN_TIERS) expect(checkChainSource({ ...source, tier }).ok).toBe(true);
  });
});

describe("handoff step validation", () => {
  it("accepts a synthetic step", () => { expect(checkChainNode(node()).ok).toBe(true); });
  it("accepts each declared role", () => { for (const role of CHAIN_ROLES) expect(checkChainNode(node("node-1", { role })).ok).toBe(true); });
  it("accepts each declared state", () => { for (const state of CHAIN_STATES) expect(checkChainNode(node("node-1", { state })).ok).toBe(true); });
  it("accepts each declared review phase", () => { for (const phase of CHAIN_PHASES) expect(checkChainNode(node("node-1", { phase })).ok).toBe(true); });
  it("rejects missing id", () => { expect(checkChainNode({ ...node(), id: "" }).ok).toBe(false); });
  it("rejects a whitespace id", () => { expect(checkChainNode({ ...node(), id: "foo bar" }).ok).toBe(false); });
  it("rejects invalid id punctuation", () => { expect(checkChainNode({ ...node(), id: "foo/../bar" }).ok).toBe(false); });
  it("rejects a blank pack identifier", () => { expect(checkChainNode({ ...node(), packId: "" }).ok).toBe(false); });
  it("rejects invalid pack path", () => { expect(checkChainNode({ ...node(), packId: "pack/a" }).ok).toBe(false); });
  it("rejects overlong id", () => { expect(checkChainNode({ ...node(), id: "x".repeat(97) }).ok).toBe(false); });
  it("rejects blank title", () => { expect(checkChainNode({ ...node(), title: "  " }).ok).toBe(false); });
  it("rejects overlong title", () => { expect(checkChainNode({ ...node(), title: "x".repeat(201) }).ok).toBe(false); });
  it("rejects overlong note", () => { expect(checkChainNode({ ...node(), note: "x".repeat(601) }).ok).toBe(false); });
  it("rejects control code in note", () => { expect(checkChainNode({ ...node(), note: "bad\u0000" }).ok).toBe(false); });
  it("rejects an unknown role", () => { expect(checkChainNode({ ...node(), role: "observer" }).ok).toBe(false); });
  it("rejects translated UNKNOWN condition", () => { expect(checkChainNode({ ...node(), state: "inconnu" }).ok).toBe(false); });
  it("rejects invented ready condition", () => { expect(checkChainNode({ ...node(), state: "ready" }).ok).toBe(false); });
  it("rejects invalid review phase", () => { expect(checkChainNode({ ...node(), phase: "approved" }).ok).toBe(false); });
  it("rejects missing recorded date", () => { expect(checkChainNode({ ...node(), recordedAt: "" }).ok).toBe(false); });
  it("rejects timestamp without timezone", () => { expect(checkChainNode({ ...node(), recordedAt: "2026-11-19T12:00:00" }).ok).toBe(false); });
  it("rejects timestamp without seconds", () => { expect(checkChainNode({ ...node(), recordedAt: "2026-11-19T12:00Z" }).ok).toBe(false); });
  it("rejects a retrieval date later than observation", () => {
    expect(checkChainNode({ ...node(), source: { ...source, retrievedOn: "2026-11-20" } })).toMatchObject({ ok: false, issue: "date" });
  });
  it("rejects missing source fields", () => { expect(checkChainNode({ ...node(), source: {} }).ok).toBe(false); });
  it("rejects unexplained extra object fields", () => { expect(checkChainNode({ ...node(), admin: true }).ok).toBe(false); });
  it("rejects null observation", () => { expect(checkChainNode(null).ok).toBe(false); });
  it("rejects array observation", () => { expect(checkChainNode([]).ok).toBe(false); });
  it("accepts UTC milliseconds", () => { expect(checkChainNode(node("node-1", { recordedAt: "2026-11-19T12:00:00.125Z" })).ok).toBe(true); });
});

describe("handoff link validation", () => {
  it("accepts a valid link", () => { expect(checkChainLink(link()).ok).toBe(true); });
  it("keeps UNKNOWN state", () => { expect(checkChainLink(link())).toMatchObject({ ok: true, value: link() }); });
  it("accepts each state", () => { for (const state of CHAIN_STATES) expect(checkChainLink(link("link-1", { state })).ok).toBe(true); });
  it("rejects self-link", () => { expect(checkChainLink(link("link-1", { toId: "node-1" })).ok).toBe(false); });
  it("rejects missing source", () => { expect(checkChainLink({ ...link(), source: undefined }).ok).toBe(false); });
  it("rejects a blank ID", () => { expect(checkChainLink({ ...link(), id: "" }).ok).toBe(false); });
  it("rejects a blank from ID", () => { expect(checkChainLink({ ...link(), fromId: "" }).ok).toBe(false); });
  it("rejects a blank to ID", () => { expect(checkChainLink({ ...link(), toId: "" }).ok).toBe(false); });
  it("rejects an unrecognized status", () => { expect(checkChainLink({ ...link(), state: "complete" }).ok).toBe(false); });
  it("rejects an impossible timestamp", () => { expect(checkChainLink({ ...link(), recordedAt: "2026-11-19" }).ok).toBe(false); });
  it("rejects overlong note", () => { expect(checkChainLink({ ...link(), note: "x".repeat(601) }).ok).toBe(false); });
  it("rejects an extra unknown field", () => { expect(checkChainLink({ ...link(), next: "node-3" }).ok).toBe(false); });
  it("rejects a future source date", () => { expect(checkChainLink({ ...link(), source: { ...source, retrievedOn: "2026-11-20" } }).ok).toBe(false); });
});

describe("handoff event validation", () => {
  it("accepts an event", () => { expect(checkChainEvent(event()).ok).toBe(true); });
  it("accepts every manual action", () => { for (const action of CHAIN_ACTIONS) expect(checkChainEvent(event("event-1", { action })).ok).toBe(true); });
  it("rejects an invented action", () => { expect(checkChainEvent({ ...event(), action: "automated" }).ok).toBe(false); });
  it("rejects a blank event id", () => { expect(checkChainEvent({ ...event(), id: "" }).ok).toBe(false); });
  it("rejects a blank node reference", () => { expect(checkChainEvent({ ...event(), nodeId: "" }).ok).toBe(false); });
  it("rejects a malformed event timestamp", () => { expect(checkChainEvent({ ...event(), at: "tomorrow" }).ok).toBe(false); });
  it("rejects a control character", () => { expect(checkChainEvent({ ...event(), note: "x\u0008" }).ok).toBe(false); });
  it("rejects an oversized note", () => { expect(checkChainEvent({ ...event(), note: "x".repeat(601) }).ok).toBe(false); });
  it("rejects a missing source", () => { expect(checkChainEvent({ ...event(), source: null }).ok).toBe(false); });
  it("rejects extra fields", () => { expect(checkChainEvent({ ...event(), actor: "person" }).ok).toBe(false); });
  it("rejects a source retrieval after the event", () => { expect(checkChainEvent({ ...event(), source: { ...source, retrievedOn: "2026-11-20" } }).ok).toBe(false); });
});

describe("full handoff document invariants", () => {
  it("accepts empty chain", () => { expect(checkChainDocument(emptyChain()).ok).toBe(true); });
  it("accepts a pair with one link", () => { expect(checkChainDocument(doc([...pair.nodes], [link()])).ok).toBe(true); });
  it("accepts a pair with an event", () => { expect(checkChainDocument(doc([...pair.nodes], [link()], [event()])).ok).toBe(true); });
  it("rejects unknown schema", () => { expect(checkChainDocument({ ...emptyChain(), schema: "old" }).ok).toBe(false); });
  it("rejects array as document", () => { expect(checkChainDocument([]).ok).toBe(false); });
  it("rejects null document", () => { expect(checkChainDocument(null).ok).toBe(false); });
  it("rejects extra root keys", () => { expect(checkChainDocument({ ...emptyChain(), metadata: {} }).ok).toBe(false); });
  it("rejects missing links array", () => { expect(checkChainDocument({ schema: emptyChain().schema, nodes: [], events: [] }).ok).toBe(false); });
  it("rejects non-array nodes", () => { expect(checkChainDocument({ ...emptyChain(), nodes: {} }).ok).toBe(false); });
  it("rejects non-array links", () => { expect(checkChainDocument({ ...emptyChain(), links: 0 }).ok).toBe(false); });
  it("rejects non-array events", () => { expect(checkChainDocument({ ...emptyChain(), events: null }).ok).toBe(false); });
  it("rejects duplicate node id", () => { expect(checkChainDocument(doc([node(), node()])).ok).toBe(false); });
  it("rejects duplicate link id", () => { expect(checkChainDocument(doc([...pair.nodes], [link(), link()])).ok).toBe(false); });
  it("rejects duplicate event id", () => { expect(checkChainDocument(doc([node()], [], [event(), event()])).ok).toBe(false); });
  it("rejects link to unknown node", () => { expect(checkChainDocument(doc([node()], [link()])).ok).toBe(false); });
  it("rejects from unknown node", () => { expect(checkChainDocument(doc([node("node-2")], [link()])).ok).toBe(false); });
  it("rejects cross-pack edges", () => {
    const other = node("node-2", { packId: "pack-b" });
    expect(checkChainDocument(doc([node(), other], [link()])).ok).toBe(false);
  });
  it("rejects missing event node", () => { expect(checkChainDocument(doc([], [], [event()])).ok).toBe(false); });
  it("rejects link before its recipient", () => {
    const later = node("node-2", { recordedAt: "2026-11-19T14:00:00.000Z" });
    expect(checkChainDocument(doc([node(), later], [link()])).ok).toBe(false);
  });
  it("rejects an event before its step", () => {
    const earlier = event("event-1", { at: "2026-11-19T11:00:00.000Z" });
    expect(checkChainDocument(doc([node()], [], [earlier])).ok).toBe(false);
  });
  it("rejects self cycle at link validation", () => { expect(checkChainDocument(doc([node()], [link("link-1", { toId: "node-1" })])).ok).toBe(false); });
  it("rejects mutual cycle", () => {
    const backward = link("link-2", { fromId: "node-2", toId: "node-1" });
    expect(checkChainDocument(doc([...pair.nodes], [link(), backward]))).toMatchObject({ ok: false, issue: "cycle" });
  });
  it("rejects a three-step cycle", () => {
    const third = node("node-3");
    const two = link("link-2", { fromId: "node-2", toId: "node-3" });
    const three = link("link-3", { fromId: "node-3", toId: "node-1" });
    expect(checkChainDocument(doc([...pair.nodes, third], [link(), two, three])).ok).toBe(false);
  });
  it("accepts three-step path", () => {
    const third = node("node-3", { role: "recipient" });
    const second = link("link-2", { fromId: "node-2", toId: "node-3" });
    expect(checkChainDocument(doc([...pair.nodes, third], [link(), second])).ok).toBe(true);
  });
  it("accepts two unrelated packs", () => {
    expect(checkChainDocument(doc([node(), node("other-1", { packId: "pack-b" })])).ok).toBe(true);
  });
  it("refuses node count beyond cap", () => {
    const nodes = Array.from({ length: CHAIN_LIMITS.nodes + 1 }, (_, i) => node(`n-${i}`));
    expect(checkChainDocument(doc(nodes))).toMatchObject({ ok: false, issue: "limit" });
  });
  it("refuses event count beyond cap", () => {
    const events = Array.from({ length: CHAIN_LIMITS.events + 1 }, (_, i) => event(`e-${i}`));
    expect(checkChainDocument(doc([node()], [], events)).ok).toBe(false);
  });
  it("directly detects a graph cycle", () => {
    expect(chainHasCycle([...pair.nodes], [link(), link("link-2", { fromId: "node-2", toId: "node-1" })])).toBe(true);
  });
  it("does not mistake an acyclic pair for a cycle", () => { expect(chainHasCycle([...pair.nodes], [link()])).toBe(false); });
});

describe("manual edits and document summaries", () => {
  it("appends a validated step", () => { expect(appendChainNode(emptyChain(), node()).ok).toBe(true); });
  it("refuses duplicate appended step", () => { expect(appendChainNode(doc([node()]), node()).ok).toBe(false); });
  it("refuses invalid step before appending", () => { expect(appendChainNode(emptyChain(), node("bad id")).ok).toBe(false); });
  it("appends a directed link", () => { expect(appendChainLink(pair, link()).ok).toBe(true); });
  it("rejects a link with no recipient", () => { expect(appendChainLink(doc([node()]), link()).ok).toBe(false); });
  it("appends user-created events", () => { expect(appendChainEvent(doc([node()]), event()).ok).toBe(true); });
  it("rejects an event with absent step", () => { expect(appendChainEvent(emptyChain(), event()).ok).toBe(false); });
  it("moves a draft to review", () => { const result = changeChainPhase(doc([node()]), "node-1", "review");
    if (!result.ok) throw Error(result.issue);
    expect(result.value.nodes[0]?.phase).toBe("review"); });
  it("does not skip review when closing", () => { expect(changeChainPhase(doc([node()]), "node-1", "closed").ok).toBe(false); });
  it("closes a reviewed document", () => { expect(changeChainPhase(doc([node("node-1", { phase: "review" })]), "node-1", "closed").ok).toBe(true); });
  it("reopens a closed document for review", () => { expect(changeChainPhase(doc([node("node-1", { phase: "closed" })]), "node-1", "review").ok).toBe(true); });
  it("rejects reopening a closed document to draft", () => { expect(changeChainPhase(doc([node("node-1", { phase: "closed" })]), "node-1", "draft").ok).toBe(false); });
  it("rejects a reviewed step becoming draft", () => { expect(changeChainPhase(doc([node("node-1", { phase: "review" })]), "node-1", "draft").ok).toBe(false); });
  it("returns same document for redundant phase", () => {
    const initial = doc([node()]);
    expect(changeChainPhase(initial, "node-1", "draft")).toMatchObject({ ok: true, value: initial });
  });
  it("rejects phase change to unknown step", () => { expect(changeChainPhase(emptyChain(), "missing", "review").ok).toBe(false); });
  it("generates first node id", () => { expect(nextChainId(emptyChain(), "node")).toBe("node-1"); });
  it("generates next available id", () => { expect(nextChainId(doc([node()]), "node")).toBe("node-2"); });
  it("reuses smallest available id gap", () => { expect(nextChainId(doc([node("node-2")]), "node")).toBe("node-1"); });
  it("generates link ids independently", () => { expect(nextChainId(doc([...pair.nodes], [link()]), "link")).toBe("link-2"); });
  it("generates event ids independently", () => { expect(nextChainId(doc([node()], [], [event()]), "event")).toBe("event-2"); });
  it("counts empty packs as zero", () => { expect(chainSummary(emptyChain()).packs).toBe(0); });
  it("counts distinct packs", () => { expect(chainSummary(doc([node(), node("x", { packId: "pack-b" })])).packs).toBe(2); });
  it("counts UNKNOWN nodes and links", () => { expect(chainSummary(doc([...pair.nodes], [link()])).unknown).toBe(3); });
  it("counts disputed observations", () => { expect(chainSummary(doc([node("node-1", { state: "disputed" })])).disputed).toBe(1); });
  it("counts unresolved review steps", () => { expect(chainSummary(doc([node(), node("node-2", { phase: "closed" })])).unresolved).toBe(1); });
  it("counts nodes with no links", () => { expect(chainSummary(doc([node(), node("node-2")])).orphanNodes).toBe(2); });
  it("does not count linked nodes as orphans", () => { expect(chainSummary(doc([...pair.nodes], [link()])).orphanNodes).toBe(0); });
  it("never marks content ready", () => { expect(chainSummary(doc([node()])).contentReady).toBe(false); });
  it("filters by pack id", () => { expect(filterChainNodes(doc([node(), node("x", { packId: "pack-b" })]), { packId: "pack-b" }).map((n) => n.id)).toEqual(["x"]); });
  it("filters by node role", () => { expect(filterChainNodes(pair, { role: "recipient" }).map((n) => n.id)).toEqual(["node-2"]); });
  it("filters by UNKNOWN", () => { expect(filterChainNodes(pair, { state: "UNKNOWN" })).toHaveLength(2); });
  it("filters by review phase", () => { expect(filterChainNodes(doc([node(), node("x", { phase: "closed" })]), { phase: "closed" })).toHaveLength(1); });
  it("filters by case-insensitive text", () => { expect(filterChainNodes(pair, { text: "RECEIVER" }).map((n) => n.id)).toEqual(["node-2"]); });
  it("returns no match for unknown text", () => { expect(filterChainNodes(pair, { text: "not here" })).toEqual([]); });
  it("isolates one pack's nodes", () => { expect(chainForPack(doc([node(), node("x", { packId: "pack-b" })]), "pack-a").nodes).toHaveLength(1); });
  it("isolates one pack's link history", () => { expect(chainForPack(doc([...pair.nodes], [link()], [event()]), "pack-a").links).toHaveLength(1); });
  it("isolates one pack's manual events", () => { expect(chainForPack(doc([...pair.nodes], [link()], [event()]), "pack-a").events).toHaveLength(1); });
  it("keeps UNKNOWN when pack cannot be found", () => { expect(chainForPack(doc([node()]), "missing").nodes).toEqual([]); });
});
