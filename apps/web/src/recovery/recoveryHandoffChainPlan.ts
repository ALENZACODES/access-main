import { chainForPack, type ChainDocument, type ChainLink, type ChainNode, type ChainState } from "./recoveryHandoffChain";

/** Descriptive planning only: no writes, network calls, automatic retries or readiness claims. */
export interface ChainStepPlan {
  readonly id: string;
  readonly packId: string;
  readonly nodeId: string;
  readonly order: number;
  readonly preceding: readonly string[];
  readonly following: readonly string[];
  readonly concerns: readonly string[];
  readonly contentReady: false;
}
export interface ChainGap {
  readonly id: string;
  readonly packId: string;
  readonly kind: "unlinked-origin" | "unlinked-recipient" | "unknown-link" | "disputed-link" | "unacknowledged" | "unreviewed";
  readonly nodeId: string | null;
  readonly linkId: string | null;
  readonly nextStep: string;
  readonly contentReady: false;
}
export interface ChainPlanSummary {
  readonly packId: string;
  readonly steps: number;
  readonly gaps: number;
  readonly unknown: number;
  readonly disputed: number;
  readonly contentReady: false;
}
const sortText = (a: string, b: string): number => a.localeCompare(b);
const isIssue = (s: ChainState): boolean => s !== "observed";

/** Kahn's order resolves an acyclic graph with stable IDs, without implying execution order. */
export function planChainOrder(document: ChainDocument, packId: string): readonly ChainStepPlan[] {
  const subset = chainForPack(document, packId);
  const adjacency = new Map<string, string[]>();
  const indegree = new Map<string, number>();
  for (const node of subset.nodes) { adjacency.set(node.id, []); indegree.set(node.id, 0); }
  for (const link of subset.links) {
    if (!adjacency.has(link.fromId) || !indegree.has(link.toId)) continue;
    adjacency.get(link.fromId)?.push(link.toId);
    indegree.set(link.toId, (indegree.get(link.toId) ?? 0) + 1);
  }
  const pending = subset.nodes.filter((node) => (indegree.get(node.id) ?? 0) === 0).map((node) => node.id).sort(sortText);
  const ordered: string[] = [];
  while (pending.length) {
    const id = pending.shift();
    if (!id) continue;
    ordered.push(id);
    for (const next of adjacency.get(id) ?? []) {
      const count = (indegree.get(next) ?? 0) - 1;
      indegree.set(next, count);
      if (count === 0) { pending.push(next); pending.sort(sortText); }
    }
  }
  // An invalid or partial graph is not silently promoted to a complete plan.
  const result = ordered.length === subset.nodes.length ? ordered : [];
  return result.map((id, index) => {
    const node = subset.nodes.find((item) => item.id === id);
    const incoming = subset.links.filter((link) => link.toId === id);
    const outgoing = subset.links.filter((link) => link.fromId === id);
    const concerns: string[] = [];
    if (node?.state === "UNKNOWN") concerns.push("unknown-observation");
    if (node?.state === "disputed") concerns.push("disputed-observation");
    if (node?.phase !== "closed") concerns.push("unreviewed");
    if ([...incoming, ...outgoing].some((link) => isIssue(link.state))) concerns.push("incomplete-link");
    return {
      id: `step:${packId}:${id}`, packId, nodeId: id, order: index + 1,
      preceding: incoming.map((link) => link.fromId).sort(sortText),
      following: outgoing.map((link) => link.toId).sort(sortText),
      concerns, contentReady: false,
    };
  });
}
export function planChainGaps(document: ChainDocument, packId: string): readonly ChainGap[] {
  const subset = chainForPack(document, packId);
  const result: ChainGap[] = [];
  const entry = (kind: ChainGap["kind"], nodeId: string | null, linkId: string | null, nextStep: string): void => {
    result.push({ id: `gap:${packId}:${kind}:${nodeId ?? linkId ?? "all"}`, packId, kind, nodeId, linkId, nextStep, contentReady: false });
  };
  for (const node of subset.nodes) {
    if (node.role === "origin" && !subset.links.some((link) => link.fromId === node.id)) {
      entry("unlinked-origin", node.id, null, "Record a recipient link or preserve the unknown handoff");
    }
    if (node.role === "recipient" && !subset.links.some((link) => link.toId === node.id)) {
      entry("unlinked-recipient", node.id, null, "Document the source of this recipient handoff");
    }
    if (node.phase !== "closed") entry("unreviewed", node.id, null, "Review documentation manually");
    if (node.role === "recipient" && !subset.events.some((event) => event.nodeId === node.id && event.action === "acknowledged")) {
      entry("unacknowledged", node.id, null, "Seek explicit manual acknowledgment");
    }
  }
  for (const link of subset.links) {
    if (link.state === "UNKNOWN") entry("unknown-link", null, link.id, "Record evidence or retain UNKNOWN");
    if (link.state === "disputed") entry("disputed-link", null, link.id, "Record the disagreement; do not infer a resolution");
  }
  return result.sort((a, b) => sortText(a.kind, b.kind) || sortText(a.id, b.id));
}
export function chainPlanSummary(document: ChainDocument, packId: string): ChainPlanSummary {
  const subset = chainForPack(document, packId);
  return {
    packId, steps: subset.nodes.length,
    gaps: planChainGaps(document, packId).length,
    unknown: subset.nodes.filter((node) => node.state === "UNKNOWN").length + subset.links.filter((link) => link.state === "UNKNOWN").length,
    disputed: subset.nodes.filter((node) => node.state === "disputed").length + subset.links.filter((link) => link.state === "disputed").length,
    contentReady: false,
  };
}
export function compareChainPlans(left: ChainDocument, right: ChainDocument, packId: string): {
  readonly addedGaps: readonly string[];
  readonly removedGaps: readonly string[];
  readonly contentReady: false;
} {
  const previous = new Set(planChainGaps(left, packId).map((item) => item.id));
  const current = new Set(planChainGaps(right, packId).map((item) => item.id));
  return {
    addedGaps: [...current].filter((id) => !previous.has(id)).sort(sortText),
    removedGaps: [...previous].filter((id) => !current.has(id)).sort(sortText),
    contentReady: false,
  };
}
export function linkedChainNodes(document: ChainDocument, packId: string): readonly ChainNode[] {
  const subset = chainForPack(document, packId);
  const ids = new Set<string>();
  for (const link of subset.links) { ids.add(link.fromId); ids.add(link.toId); }
  return subset.nodes.filter((node) => ids.has(node.id)).sort((a, b) => sortText(a.id, b.id));
}
export function uncertainChainLinks(document: ChainDocument, packId: string): readonly ChainLink[] {
  return chainForPack(document, packId).links.filter((link) => isIssue(link.state)).sort((a, b) => sortText(a.id, b.id));
}
