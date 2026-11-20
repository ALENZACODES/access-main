import { describe, expect, it } from "vitest";
import {
  chainFindings, chainNarrative, chainPackStatus, chainPaths, chainReport,
  chainReviewActions, compareChainReports,
} from "./recoveryHandoffChainAnalysis";
import { emptyChain, type ChainDocument, type ChainEvent, type ChainLink, type ChainNode } from "./recoveryHandoffChain";

const source = { name: "Local sample", licence: "Sample licence", retrievedOn: "2026-11-19", tier: "UNKNOWN" as const, reference: "test-source" };
const node = (id: string, change: Partial<ChainNode> = {}): ChainNode => ({
  id, packId: "pack-a", role: "intermediate", title: `Step ${id}`,
  state: "UNKNOWN", phase: "draft", recordedAt: "2026-11-19T10:00:00.000Z", note: "Manual note", source, ...change,
});
const link = (id: string, fromId: string, toId: string, change: Partial<ChainLink> = {}): ChainLink => ({
  id, fromId, toId, state: "UNKNOWN", note: "Manual link", recordedAt: "2026-11-19T11:00:00.000Z", source, ...change,
});
const event = (id: string, nodeId: string, change: Partial<ChainEvent> = {}): ChainEvent => ({
  id, nodeId, action: "noted", at: "2026-11-19T12:00:00.000Z", note: "Manual event", source, ...change,
});
const doc = (nodes: ChainNode[], links: ChainLink[] = [], events: ChainEvent[] = []): ChainDocument => ({ ...emptyChain(), nodes, links, events });
const origin = node("node-1", { role: "origin", title: "Origin" });
const recipient = node("node-2", { role: "recipient", title: "Recipient" });
const pair = doc([origin, recipient], [link("link-1", "node-1", "node-2")]);
const asOf = "2026-11-20";

function codes(document: ChainDocument): string[] { return chainFindings(document, asOf).map((item) => item.code); }

describe("handoff review findings", () => {
  it("returns no findings for an empty document", () => { expect(chainFindings(emptyChain(), asOf)).toEqual([]); });
  it("flags UNKNOWN steps", () => { expect(codes(doc([origin]))).toContain("unknown-observation"); });
  it("flags disputed steps", () => { expect(codes(doc([node("node-1", { state: "disputed" })]))).toContain("disputed-observation"); });
  it("flags missing steps", () => { expect(codes(doc([node("node-1", { state: "missing" })]))).toContain("missing-observation"); });
  it("flags interrupted steps", () => { expect(codes(doc([node("node-1", { state: "interrupted" })]))).toContain("missing-observation"); });
  it("does not label an observed step as unknown", () => { expect(codes(doc([node("node-1", { state: "observed" })]))).not.toContain("unknown-observation"); });
  it("flags draft review phase", () => { expect(codes(doc([origin]))).toContain("unreviewed"); });
  it("flags review phase not yet closed", () => { expect(codes(doc([node("node-1", { phase: "review" })]))).toContain("unreviewed"); });
  it("does not flag closed documentation phase as unreviewed", () => { expect(codes(doc([node("node-1", { phase: "closed" })]))).not.toContain("unreviewed"); });
  it("flags orphaned nodes", () => { expect(codes(doc([origin]))).toContain("unconnected"); });
  it("does not mark linked nodes as unconnected", () => { expect(codes(pair)).not.toContain("unconnected"); });
  it("flags a missing origin", () => { expect(codes(doc([recipient]))).toContain("missing-origin"); });
  it("flags a missing recipient", () => { expect(codes(doc([origin]))).toContain("missing-recipient"); });
  it("does not invent a missing origin when one is present", () => { expect(codes(pair)).not.toContain("missing-origin"); });
  it("does not invent a missing recipient when one is present", () => { expect(codes(pair)).not.toContain("missing-recipient"); });
  it("flags an unacknowledged recipient", () => { expect(codes(pair)).toContain("unacknowledged"); });
  it("recognizes explicit manual acknowledgement", () => {
    const acknowledged = doc([origin, recipient], [...pair.links], [event("event-1", "node-2", { action: "acknowledged" })]);
    expect(codes(acknowledged)).not.toContain("unacknowledged");
  });
  it("does not infer acknowledgement from unrelated notes", () => {
    const unrelated = doc([origin, recipient], [...pair.links], [event("event-1", "node-1", { action: "acknowledged" })]);
    expect(codes(unrelated)).toContain("unacknowledged");
  });
  it("flags UNKNOWN links", () => { expect(codes(pair)).toContain("incomplete-route"); });
  it("flags disputed links", () => {
    const disputed = doc([origin, recipient], [link("link-1", "node-1", "node-2", { state: "disputed" })]);
    expect(codes(disputed)).toContain("incomplete-route");
  });
  it("does not flag observed links as incomplete", () => {
    const observed = doc([origin, recipient], [link("link-1", "node-1", "node-2", { state: "observed" })]);
    expect(codes(observed)).not.toContain("incomplete-route");
  });
  it("flags contradictions between observed nodes and missing links", () => {
    const conflicting = doc([node("node-1", { role: "origin", state: "observed" }), recipient], [link("link-1", "node-1", "node-2", { state: "missing" })]);
    expect(codes(conflicting)).toContain("contradiction");
  });
  it("does not manufacture contradiction when both are UNKNOWN", () => { expect(codes(pair)).not.toContain("contradiction"); });
  it("flags an older retrieved source", () => {
    const old = node("node-1", { source: { ...source, retrievedOn: "2025-01-01" } });
    expect(codes(doc([old]))).toContain("stale-source");
  });
  it("does not flag a recent source", () => { expect(codes(doc([origin]))).not.toContain("stale-source"); });
  it("ignores aging if comparison date is invalid", () => {
    expect(chainFindings(doc([node("node-1", { source: { ...source, retrievedOn: "2025-01-01" } })]), "not-a-date").map((x) => x.code)).not.toContain("stale-source");
  });
  it("preserves explicit pack IDs", () => { expect(chainFindings(doc([origin]), asOf).every((item) => item.packId === "pack-a")).toBe(true); });
  it("never asserts content readiness", () => { expect(chainFindings(pair, asOf).every((item) => item.contentReady === false)).toBe(true); });
  it("prioritizes disputed findings as high", () => {
    const findings = chainFindings(doc([node("node-1", { state: "disputed" })]), asOf);
    expect(findings.find((item) => item.code === "disputed-observation")?.severity).toBe("high");
  });
  it("treats an UNKNOWN observation as medium priority", () => {
    expect(chainFindings(doc([origin]), asOf).find((item) => item.code === "unknown-observation")?.severity).toBe("medium");
  });
  it("sorts high findings before medium and low", () => {
    const ranks = { high: 0, medium: 1, low: 2 };
    const result = chainFindings(pair, asOf).map((item) => ranks[item.severity]);
    expect(result).toEqual([...result].sort((a, b) => a - b));
  });
});

describe("per-pack status without assumptions", () => {
  it("returns no packs for an empty document", () => { expect(chainPackStatus(emptyChain(), asOf)).toEqual([]); });
  it("counts observed packs", () => { expect(chainPackStatus(pair, asOf)).toHaveLength(1); });
  it("sorts packs by ID", () => {
    const many = doc([node("x", { packId: "z-pack" }), node("y", { packId: "a-pack" })]);
    expect(chainPackStatus(many, asOf).map((item) => item.packId)).toEqual(["a-pack", "z-pack"]);
  });
  it("counts nodes per pack", () => { expect(chainPackStatus(pair, asOf)[0]?.nodes).toBe(2); });
  it("counts links per pack", () => { expect(chainPackStatus(pair, asOf)[0]?.links).toBe(1); });
  it("counts UNKNOWN nodes and links", () => { expect(chainPackStatus(pair, asOf)[0]?.unknown).toBe(3); });
  it("counts disputed nodes", () => {
    expect(chainPackStatus(doc([node("x", { state: "disputed" })]), asOf)[0]?.disputed).toBe(1);
  });
  it("counts closed review steps", () => {
    expect(chainPackStatus(doc([node("x", { phase: "closed" })]), asOf)[0]?.reviewed).toBe(1);
  });
  it("counts links leaving an origin", () => { expect(chainPackStatus(pair, asOf)[0]?.linkedOrigins).toBe(1); });
  it("counts links arriving at recipient", () => { expect(chainPackStatus(pair, asOf)[0]?.linkedRecipients).toBe(1); });
  it("shows UNKNOWN readiness regardless of observations", () => {
    const observed = doc([node("x", { state: "observed", phase: "closed" })]);
    expect(chainPackStatus(observed, asOf)[0]?.readiness).toBe("UNKNOWN");
  });
  it("never claims pack content ready", () => { expect(chainPackStatus(pair, asOf)[0]?.contentReady).toBe(false); });
  it("counts all current findings", () => {
    expect(chainPackStatus(pair, asOf)[0]?.findings).toBe(chainFindings(pair, asOf).length);
  });
});

describe("manual origin-to-recipient paths", () => {
  it("returns no path for empty chain", () => { expect(chainPaths(emptyChain(), "pack-a")).toEqual([]); });
  it("returns no path without a link", () => { expect(chainPaths(doc([origin, recipient]), "pack-a")).toEqual([]); });
  it("finds direct origin-to-recipient path", () => { expect(chainPaths(pair, "pack-a")).toHaveLength(1); });
  it("includes exact node IDs", () => { expect(chainPaths(pair, "pack-a")[0]?.nodeIds).toEqual(["node-1", "node-2"]); });
  it("includes exact link IDs", () => { expect(chainPaths(pair, "pack-a")[0]?.linkIds).toEqual(["link-1"]); });
  it("preserves UNKNOWN from a node", () => { expect(chainPaths(pair, "pack-a")[0]?.hasUnknown).toBe(true); });
  it("marks disputed links", () => {
    const path = doc([origin, recipient], [link("link-1", "node-1", "node-2", { state: "disputed" })]);
    expect(chainPaths(path, "pack-a")[0]?.hasDispute).toBe(true);
  });
  it("reports all-observed path without UNKNOWN", () => {
    const path = doc([node("node-1", { role: "origin", state: "observed" }), node("node-2", { role: "recipient", state: "observed" })], [link("link-1", "node-1", "node-2", { state: "observed" })]);
    expect(chainPaths(path, "pack-a")[0]?.hasUnknown).toBe(false);
  });
  it("does not promote observed path to pack readiness", () => { expect(chainPaths(pair, "pack-a")[0]?.contentReady).toBe(false); });
  it("finds a two-link path", () => {
    const middle = node("middle", { role: "intermediate" });
    const route = doc([origin, middle, recipient], [link("a", "node-1", "middle"), link("b", "middle", "node-2")]);
    expect(chainPaths(route, "pack-a")[0]?.nodeIds).toEqual(["node-1", "middle", "node-2"]);
  });
  it("returns no route if links stop at intermediate", () => {
    const middle = node("middle");
    const partial = doc([origin, middle, recipient], [link("a", "node-1", "middle")]);
    expect(chainPaths(partial, "pack-a")).toEqual([]);
  });
  it("limits paths to the selected pack", () => {
    const other = node("other-1", { packId: "pack-b", role: "origin" });
    expect(chainPaths(doc([origin, recipient, other], [...pair.links]), "pack-b")).toEqual([]);
  });
  it("handles two independent recipients", () => {
    const second = node("node-3", { role: "recipient" });
    const split = doc([origin, recipient, second], [link("a", "node-1", "node-2"), link("b", "node-1", "node-3")]);
    expect(chainPaths(split, "pack-a")).toHaveLength(2);
  });
  it("tracks path destination correctly", () => { expect(chainPaths(pair, "pack-a")[0]?.toId).toBe("node-2"); });
  it("tracks path origin correctly", () => { expect(chainPaths(pair, "pack-a")[0]?.fromId).toBe("node-1"); });
  it("is stable under repeat evaluation", () => { expect(chainPaths(pair, "pack-a")).toEqual(chainPaths(pair, "pack-a")); });
});

describe("review actions and reports", () => {
  it("returns no actions for empty document", () => { expect(chainReviewActions(emptyChain(), asOf)).toEqual([]); });
  it("generates review actions for UNKNOWN", () => { expect(chainReviewActions(pair, asOf).length).toBeGreaterThan(0); });
  it("does not duplicate identical actions", () => {
    const actions = chainReviewActions(pair, asOf);
    expect(new Set(actions.map((item) => item.id)).size).toBe(actions.length);
  });
  it("retains the source pack ID", () => { expect(chainReviewActions(pair, asOf).every((item) => item.packId === "pack-a")).toBe(true); });
  it("never authorizes pack use in actions", () => { expect(chainReviewActions(pair, asOf).every((item) => item.contentReady === false)).toBe(true); });
  it("orders urgent reviews first", () => {
    const actions = chainReviewActions(pair, asOf);
    const ranks = { high: 0, medium: 1, low: 2 };
    expect(actions.map((item) => ranks[item.priority])).toEqual(actions.map((item) => ranks[item.priority]).sort((a, b) => a - b));
  });
  it("reports generated date", () => { expect(chainReport(pair, asOf).generatedFor).toBe(asOf); });
  it("reports accurate node count", () => { expect(chainReport(pair, asOf).totalNodes).toBe(2); });
  it("reports accurate link count", () => { expect(chainReport(pair, asOf).totalLinks).toBe(1); });
  it("reports a pack list", () => { expect(chainReport(pair, asOf).packs).toHaveLength(1); });
  it("reports manual findings", () => { expect(chainReport(pair, asOf).findings.length).toBeGreaterThan(0); });
  it("reports review actions", () => { expect(chainReport(pair, asOf).actions.length).toBeGreaterThan(0); });
  it("keeps contentReady false", () => { expect(chainReport(pair, asOf).contentReady).toBe(false); });
  it("narrates UNKNOWN in English", () => { expect(chainNarrative(pair, asOf, "en")).toContain("UNKNOWN"); });
  it("narrates UNKNOWN in French", () => { expect(chainNarrative(pair, asOf, "fr")).toContain("UNKNOWN"); });
  it("includes English disclaimer", () => { expect(chainNarrative(pair, asOf, "en")).toContain("does not authorize"); });
  it("includes French disclaimer", () => { expect(chainNarrative(pair, asOf, "fr")).toContain("n’autorise pas"); });
  it("uses French nonbreaking colon", () => { expect(chainNarrative(pair, asOf, "fr")).toContain("\u00a0:"); });
  it("does not include a ready claim in English", () => { expect(chainNarrative(pair, asOf, "en")).not.toContain("Pack is ready"); });
  it("includes manual pack review counts", () => { expect(chainNarrative(pair, asOf, "en")).toContain("Reviews needed:"); });
});

describe("comparison between manual review snapshots", () => {
  it("reports no change for identical documents", () => {
    expect(compareChainReports(pair, pair, asOf)).toMatchObject({ newFindings: [], clearedFindings: [], changedPacks: [] });
  });
  it("keeps contentReady false", () => { expect(compareChainReports(pair, pair, asOf).contentReady).toBe(false); });
  it("detects added UNKNOWN findings", () => {
    const older = doc([node("node-1", { role: "origin", state: "observed", phase: "closed" })]);
    const newer = doc([origin]);
    expect(compareChainReports(older, newer, asOf).newFindings).toContain("unknown-observation");
  });
  it("detects cleared UNKNOWN findings", () => {
    const newer = doc([node("node-1", { role: "origin", state: "observed", phase: "closed" })]);
    expect(compareChainReports(doc([origin]), newer, asOf).clearedFindings).toContain("unknown-observation");
  });
  it("identifies changed pack", () => {
    const older = doc([origin]);
    const newer = doc([node("node-1", { role: "origin", state: "observed", phase: "closed" })]);
    expect(compareChainReports(older, newer, asOf).changedPacks).toContain("pack-a");
  });
  it("does not change an unrelated pack", () => {
    const unrelated = node("other", { packId: "pack-b", role: "origin" });
    const older = doc([origin, unrelated]);
    const newer = doc([node("node-1", { role: "origin", state: "observed", phase: "closed" }), unrelated]);
    expect(compareChainReports(older, newer, asOf).changedPacks).not.toContain("pack-b");
  });
  it("sorts affected pack IDs", () => {
    const older = doc([node("z", { packId: "z-pack", role: "origin" }), node("a", { packId: "a-pack", role: "origin" })]);
    const newer = emptyChain();
    expect(compareChainReports(older, newer, asOf).changedPacks).toEqual(["a-pack", "z-pack"]);
  });
});
