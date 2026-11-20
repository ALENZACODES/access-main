import { describe, expect, it } from "vitest";
import {
  chainPlanSummary, compareChainPlans, linkedChainNodes, planChainGaps,
  planChainOrder, uncertainChainLinks,
} from "./recoveryHandoffChainPlan";
import { emptyChain, type ChainDocument, type ChainEvent, type ChainLink, type ChainNode } from "./recoveryHandoffChain";

const source = { name: "Local test", licence: "Example licence", retrievedOn: "2026-11-19", tier: "UNKNOWN" as const, reference: "plan-test" };
const node = (id: string, change: Partial<ChainNode> = {}): ChainNode => ({
  id, packId: "pack-a", role: "intermediate", title: id, state: "UNKNOWN", phase: "draft",
  recordedAt: "2026-11-19T10:00:00.000Z", note: "", source, ...change,
});
const link = (id: string, fromId: string, toId: string, change: Partial<ChainLink> = {}): ChainLink => ({
  id, fromId, toId, state: "UNKNOWN", note: "", recordedAt: "2026-11-19T11:00:00.000Z", source, ...change,
});
const event = (id: string, nodeId: string, change: Partial<ChainEvent> = {}): ChainEvent => ({
  id, nodeId, action: "noted", at: "2026-11-19T12:00:00.000Z", note: "", source, ...change,
});
const doc = (nodes: ChainNode[], links: ChainLink[] = [], events: ChainEvent[] = []): ChainDocument => ({ ...emptyChain(), nodes, links, events });
const origin = node("origin", { role: "origin" });
const middle = node("middle");
const recipient = node("recipient", { role: "recipient" });
const connected = doc([origin, middle, recipient], [link("edge-1", "origin", "middle"), link("edge-2", "middle", "recipient")]);

describe("deterministic manual step ordering", () => {
  it("returns no steps for no records", () => { expect(planChainOrder(emptyChain(), "pack-a")).toEqual([]); });
  it("returns single step without edges", () => { expect(planChainOrder(doc([origin]), "pack-a")).toHaveLength(1); });
  it("orders a simple chain", () => { expect(planChainOrder(connected, "pack-a").map((x) => x.nodeId)).toEqual(["origin", "middle", "recipient"]); });
  it("starts order at one", () => { expect(planChainOrder(connected, "pack-a")[0]?.order).toBe(1); });
  it("ends order at node count", () => { expect(planChainOrder(connected, "pack-a")[2]?.order).toBe(3); });
  it("records incoming references", () => { expect(planChainOrder(connected, "pack-a")[1]?.preceding).toEqual(["origin"]); });
  it("records outgoing references", () => { expect(planChainOrder(connected, "pack-a")[1]?.following).toEqual(["recipient"]); });
  it("keeps origin's predecessors empty", () => { expect(planChainOrder(connected, "pack-a")[0]?.preceding).toEqual([]); });
  it("keeps recipient's successors empty", () => { expect(planChainOrder(connected, "pack-a")[2]?.following).toEqual([]); });
  it("sorts disconnected nodes by id", () => {
    const isolated = doc([node("z"), node("a")]);
    expect(planChainOrder(isolated, "pack-a").map((x) => x.nodeId)).toEqual(["a", "z"]);
  });
  it("records UNKNOWN concern", () => { expect(planChainOrder(doc([origin]), "pack-a")[0]?.concerns).toContain("unknown-observation"); });
  it("records dispute concern", () => { expect(planChainOrder(doc([node("x", { state: "disputed" })]), "pack-a")[0]?.concerns).toContain("disputed-observation"); });
  it("records unreviewed concern", () => { expect(planChainOrder(doc([origin]), "pack-a")[0]?.concerns).toContain("unreviewed"); });
  it("omits reviewed concern if documentation closed", () => { expect(planChainOrder(doc([node("x", { phase: "closed" })]), "pack-a")[0]?.concerns).not.toContain("unreviewed"); });
  it("flags uncertain links", () => { expect(planChainOrder(connected, "pack-a")[0]?.concerns).toContain("incomplete-link"); });
  it("does not invent uncertain link for observed link", () => {
    const observed = doc([origin, recipient], [link("link-1", "origin", "recipient", { state: "observed" })]);
    expect(planChainOrder(observed, "pack-a")[0]?.concerns).not.toContain("incomplete-link");
  });
  it("does not claim pack readiness", () => { expect(planChainOrder(connected, "pack-a").every((x) => x.contentReady === false)).toBe(true); });
  it("gives all plan entries stable identifiers", () => { expect(planChainOrder(connected, "pack-a")[0]?.id).toBe("step:pack-a:origin"); });
  it("ignores another pack", () => {
    const other = doc([...connected.nodes, node("other", { packId: "pack-b" })], [...connected.links]);
    expect(planChainOrder(other, "pack-a")).toHaveLength(3);
  });
  it("returns no sequence for cyclic raw input", () => {
    const cyclic = doc([origin, middle], [link("a", "origin", "middle"), link("b", "middle", "origin")]);
    expect(planChainOrder(cyclic, "pack-a")).toEqual([]);
  });
});

describe("review gap planning", () => {
  it("returns empty list without nodes", () => { expect(planChainGaps(emptyChain(), "pack-a")).toEqual([]); });
  it("flags origin without outgoing link", () => { expect(planChainGaps(doc([origin]), "pack-a").map((x) => x.kind)).toContain("unlinked-origin"); });
  it("flags recipient without incoming link", () => { expect(planChainGaps(doc([recipient]), "pack-a").map((x) => x.kind)).toContain("unlinked-recipient"); });
  it("does not flag connected origin", () => { expect(planChainGaps(connected, "pack-a").map((x) => x.kind)).not.toContain("unlinked-origin"); });
  it("does not flag connected recipient", () => { expect(planChainGaps(connected, "pack-a").map((x) => x.kind)).not.toContain("unlinked-recipient"); });
  it("flags an unacknowledged recipient", () => { expect(planChainGaps(connected, "pack-a").map((x) => x.kind)).toContain("unacknowledged"); });
  it("removes acknowledgement gap after manual event", () => {
    const confirmed = doc([...connected.nodes], [...connected.links], [event("event-1", "recipient", { action: "acknowledged" })]);
    expect(planChainGaps(confirmed, "pack-a").map((x) => x.kind)).not.toContain("unacknowledged");
  });
  it("flags review phase not closed", () => { expect(planChainGaps(doc([origin]), "pack-a").map((x) => x.kind)).toContain("unreviewed"); });
  it("does not flag closed phase", () => { expect(planChainGaps(doc([node("x", { phase: "closed" })]), "pack-a").map((x) => x.kind)).not.toContain("unreviewed"); });
  it("flags UNKNOWN links", () => { expect(planChainGaps(connected, "pack-a").map((x) => x.kind)).toContain("unknown-link"); });
  it("flags disputed links", () => {
    const disputed = doc([origin, recipient], [link("link-1", "origin", "recipient", { state: "disputed" })]);
    expect(planChainGaps(disputed, "pack-a").map((x) => x.kind)).toContain("disputed-link");
  });
  it("does not flag observed links as unknown", () => {
    const observed = doc([origin, recipient], [link("link-1", "origin", "recipient", { state: "observed" })]);
    expect(planChainGaps(observed, "pack-a").map((x) => x.kind)).not.toContain("unknown-link");
  });
  it("preserves source pack in each gap", () => { expect(planChainGaps(connected, "pack-a").every((x) => x.packId === "pack-a")).toBe(true); });
  it("never indicates content readiness", () => { expect(planChainGaps(connected, "pack-a").every((x) => x.contentReady === false)).toBe(true); });
  it("includes a human next step", () => { expect(planChainGaps(connected, "pack-a").every((x) => x.nextStep.length > 5)).toBe(true); });
  it("provides stable IDs for gaps", () => { expect(new Set(planChainGaps(connected, "pack-a").map((x) => x.id)).size).toBe(planChainGaps(connected, "pack-a").length); });
  it("ignores other packs", () => {
    const other = doc([...connected.nodes, node("x", { packId: "pack-b", role: "origin" })], [...connected.links]);
    expect(planChainGaps(other, "pack-a")).toEqual(planChainGaps(connected, "pack-a"));
  });
  it("sorts gap descriptions by kind", () => {
    const kinds = planChainGaps(connected, "pack-a").map((x) => x.kind);
    expect(kinds).toEqual([...kinds].sort());
  });
});

describe("compact summaries and changes", () => {
  it("reports zero gaps for no data", () => { expect(chainPlanSummary(emptyChain(), "pack-a").gaps).toBe(0); });
  it("reports correct node count", () => { expect(chainPlanSummary(connected, "pack-a").steps).toBe(3); });
  it("reports all UNKNOWN nodes and links", () => { expect(chainPlanSummary(connected, "pack-a").unknown).toBe(5); });
  it("reports disputed links", () => {
    const disputed = doc([origin, recipient], [link("x", "origin", "recipient", { state: "disputed" })]);
    expect(chainPlanSummary(disputed, "pack-a").disputed).toBe(1);
  });
  it("reports actual gap count", () => { expect(chainPlanSummary(connected, "pack-a").gaps).toBe(planChainGaps(connected, "pack-a").length); });
  it("retains literal pack identifier", () => { expect(chainPlanSummary(connected, "pack-a").packId).toBe("pack-a"); });
  it("never claims content readiness", () => { expect(chainPlanSummary(connected, "pack-a").contentReady).toBe(false); });
  it("finds new gaps", () => {
    expect(compareChainPlans(emptyChain(), doc([origin]), "pack-a").addedGaps.length).toBeGreaterThan(0);
  });
  it("finds removed gaps", () => {
    expect(compareChainPlans(doc([origin]), emptyChain(), "pack-a").removedGaps.length).toBeGreaterThan(0);
  });
  it("reports no changes for same snapshot", () => {
    expect(compareChainPlans(connected, connected, "pack-a")).toMatchObject({ addedGaps: [], removedGaps: [] });
  });
  it("never marks comparison content ready", () => { expect(compareChainPlans(connected, connected, "pack-a").contentReady).toBe(false); });
  it("lists linked nodes", () => { expect(linkedChainNodes(connected, "pack-a")).toHaveLength(3); });
  it("does not list orphan node", () => { expect(linkedChainNodes(doc([origin]), "pack-a")).toEqual([]); });
  it("lists uncertain links", () => { expect(uncertainChainLinks(connected, "pack-a")).toHaveLength(2); });
  it("does not list observed links as uncertain", () => {
    const observed = doc([origin, recipient], [link("x", "origin", "recipient", { state: "observed" })]);
    expect(uncertainChainLinks(observed, "pack-a")).toEqual([]);
  });
});
