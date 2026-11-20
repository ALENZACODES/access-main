import {
  chainForPack, chainSummary, type ChainDocument, type ChainLink,
  type ChainNode, type ChainPhase, type ChainSource, type ChainState,
} from "./recoveryHandoffChain";

/** Results describe documents, never accessibility or pack readiness. */
export type ChainFindingCode = "unknown-observation" | "disputed-observation" | "missing-observation" | "unreviewed" | "unconnected" | "contradiction" | "missing-recipient" | "missing-origin" | "incomplete-route" | "stale-source" | "unacknowledged";
export interface ChainFinding {
  readonly code: ChainFindingCode;
  readonly packId: string;
  readonly nodeId: string | null;
  readonly severity: "high" | "medium" | "low";
  readonly detail: string;
  readonly contentReady: false;
}
export interface ChainPackStatus {
  readonly packId: string;
  readonly nodes: number;
  readonly links: number;
  readonly unknown: number;
  readonly disputed: number;
  readonly reviewed: number;
  readonly linkedOrigins: number;
  readonly linkedRecipients: number;
  readonly findings: number;
  readonly readiness: "UNKNOWN";
  readonly contentReady: false;
}
export interface ChainPath {
  readonly packId: string;
  readonly fromId: string;
  readonly toId: string;
  readonly nodeIds: readonly string[];
  readonly linkIds: readonly string[];
  readonly hasUnknown: boolean;
  readonly hasDispute: boolean;
  readonly contentReady: false;
}
export interface ChainReviewAction {
  readonly id: string;
  readonly packId: string;
  readonly nodeId: string | null;
  readonly priority: "high" | "medium" | "low";
  readonly reason: string;
  readonly contentReady: false;
}
export interface ChainAnalysisReport {
  readonly generatedFor: string;
  readonly packs: readonly ChainPackStatus[];
  readonly findings: readonly ChainFinding[];
  readonly actions: readonly ChainReviewAction[];
  readonly totalNodes: number;
  readonly totalLinks: number;
  readonly contentReady: false;
}
const byId = (a: string, b: string): number => a.localeCompare(b);
const unique = <T>(values: readonly T[]): T[] => [...new Set(values)];
const severityRank: Record<ChainFinding["severity"], number> = { high: 0, medium: 1, low: 2 };
const stateNeedsReview = (state: ChainState): boolean => state !== "observed";
const phaseNeedsReview = (phase: ChainPhase): boolean => phase !== "closed";
const sourceAge = (source: ChainSource, date: string): number | null => {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(date)) return null;
  const newer = new Date(`${date}T00:00:00Z`).valueOf();
  const older = new Date(`${source.retrievedOn}T00:00:00Z`).valueOf();
  if (!Number.isFinite(newer) || !Number.isFinite(older) || newer < older) return null;
  return Math.round((newer - older) / 86_400_000);
};
function finding(code: ChainFindingCode, packId: string, nodeId: string | null, severity: ChainFinding["severity"], detail: string): ChainFinding {
  return { code, packId, nodeId, severity, detail, contentReady: false };
}
export function chainFindings(document: ChainDocument, asOf: string): readonly ChainFinding[] {
  const findings: ChainFinding[] = [];
  const groups = unique(document.nodes.map((node) => node.packId));
  for (const packId of groups) {
    const subset = chainForPack(document, packId);
    const connected = new Set(subset.links.flatMap((link) => [link.fromId, link.toId]));
    if (!subset.nodes.some((node) => node.role === "origin")) findings.push(finding("missing-origin", packId, null, "high", "No documented origin in the handoff graph"));
    if (!subset.nodes.some((node) => node.role === "recipient")) findings.push(finding("missing-recipient", packId, null, "high", "No documented recipient in the handoff graph"));
    for (const node of subset.nodes) {
      if (node.state === "UNKNOWN") findings.push(finding("unknown-observation", packId, node.id, "medium", "Observed state is UNKNOWN"));
      if (node.state === "disputed") findings.push(finding("disputed-observation", packId, node.id, "high", "An observation remains disputed"));
      if (node.state === "missing" || node.state === "interrupted") findings.push(finding("missing-observation", packId, node.id, "high", "A step is missing or interrupted"));
      if (phaseNeedsReview(node.phase)) findings.push(finding("unreviewed", packId, node.id, "low", "Documentation review has not been closed"));
      if (!connected.has(node.id)) findings.push(finding("unconnected", packId, node.id, "medium", "No documented link joins this step"));
      const days = sourceAge(node.source, asOf);
      if (days !== null && days > 180) findings.push(finding("stale-source", packId, node.id, "medium", "Source retrieval predates this report by more than 180 days"));
      const events = subset.events.filter((event) => event.nodeId === node.id);
      if (node.role === "recipient" && !events.some((event) => event.action === "acknowledged")) findings.push(finding("unacknowledged", packId, node.id, "medium", "No manual acknowledgment was recorded"));
    }
    for (const link of subset.links) {
      if (stateNeedsReview(link.state)) findings.push(finding("incomplete-route", packId, link.toId, link.state === "disputed" ? "high" : "medium", `Link ${link.id} has state ${link.state}`));
      const days = sourceAge(link.source, asOf);
      if (days !== null && days > 180) findings.push(finding("stale-source", packId, link.toId, "medium", `Link ${link.id} has an older source`));
    }
    for (const node of subset.nodes) {
      const touching = subset.links.filter((link) => link.fromId === node.id || link.toId === node.id);
      if (node.state === "observed" && touching.some((link) => link.state === "disputed" || link.state === "missing")) {
        findings.push(finding("contradiction", packId, node.id, "high", "Observed node is attached to an unresolved link"));
      }
    }
  }
  return findings.sort((a, b) => severityRank[a.severity] - severityRank[b.severity] || byId(a.packId, b.packId) || byId(a.nodeId ?? "", b.nodeId ?? "") || byId(a.code, b.code));
}
export function chainPackStatus(document: ChainDocument, asOf: string): readonly ChainPackStatus[] {
  const findings = chainFindings(document, asOf);
  return unique(document.nodes.map((node) => node.packId)).sort(byId).map((packId) => {
    const subset = chainForPack(document, packId);
    const linkedOrigins = subset.links.filter((link) => subset.nodes.some((node) => node.id === link.fromId && node.role === "origin")).length;
    const linkedRecipients = subset.links.filter((link) => subset.nodes.some((node) => node.id === link.toId && node.role === "recipient")).length;
    return {
      packId,
      nodes: subset.nodes.length,
      links: subset.links.length,
      unknown: subset.nodes.filter((node) => node.state === "UNKNOWN").length + subset.links.filter((link) => link.state === "UNKNOWN").length,
      disputed: subset.nodes.filter((node) => node.state === "disputed").length + subset.links.filter((link) => link.state === "disputed").length,
      reviewed: subset.nodes.filter((node) => node.phase === "closed").length,
      linkedOrigins,
      linkedRecipients,
      findings: findings.filter((item) => item.packId === packId).length,
      readiness: "UNKNOWN",
      contentReady: false,
    };
  });
}
export function chainPaths(document: ChainDocument, packId: string): readonly ChainPath[] {
  const subset = chainForPack(document, packId);
  const edges = new Map<string, ChainLink[]>();
  for (const link of subset.links) edges.set(link.fromId, [...(edges.get(link.fromId) ?? []), link]);
  const paths: ChainPath[] = [];
  function traverse(current: ChainNode, visited: string[], used: ChainLink[]): void {
    if (visited.length > subset.nodes.length) return;
    if (current.role === "recipient" && used.length) {
      const nodesOnPath = subset.nodes.filter((node) => visited.includes(node.id));
      paths.push({
        packId, fromId: visited[0] ?? current.id, toId: current.id,
        nodeIds: visited, linkIds: used.map((link) => link.id),
        hasUnknown: nodesOnPath.some((node) => node.state === "UNKNOWN") || used.some((link) => link.state === "UNKNOWN"),
        hasDispute: nodesOnPath.some((node) => node.state === "disputed") || used.some((link) => link.state === "disputed"),
        contentReady: false,
      });
      return;
    }
    for (const link of edges.get(current.id) ?? []) {
      if (visited.includes(link.toId)) continue;
      const next = subset.nodes.find((node) => node.id === link.toId);
      if (next) traverse(next, [...visited, next.id], [...used, link]);
    }
  }
  for (const origin of subset.nodes.filter((node) => node.role === "origin")) traverse(origin, [origin.id], []);
  return paths.sort((a, b) => byId(a.fromId, b.fromId) || byId(a.toId, b.toId) || byId(a.linkIds.join(","), b.linkIds.join(",")));
}
export function chainReviewActions(document: ChainDocument, asOf: string): readonly ChainReviewAction[] {
  const findings = chainFindings(document, asOf);
  const actions = new Map<string, ChainReviewAction>();
  for (const item of findings) {
    const key = `${item.packId}:${item.nodeId ?? "all"}:${item.code}`;
    actions.set(key, {
      id: `review:${key}`,
      packId: item.packId,
      nodeId: item.nodeId,
      priority: item.severity,
      reason: item.detail,
      contentReady: false,
    });
  }
  return [...actions.values()].sort((a, b) => severityRank[a.priority] - severityRank[b.priority] || byId(a.id, b.id));
}
export function chainReport(document: ChainDocument, asOf: string): ChainAnalysisReport {
  const summary = chainSummary(document);
  return {
    generatedFor: asOf,
    packs: chainPackStatus(document, asOf),
    findings: chainFindings(document, asOf),
    actions: chainReviewActions(document, asOf),
    totalNodes: summary.nodes,
    totalLinks: summary.links,
    contentReady: false,
  };
}
export function chainNarrative(document: ChainDocument, asOf: string, locale: "en" | "fr"): string {
  const report = chainReport(document, asOf);
  const summary = chainSummary(document);
  if (locale === "fr") {
    return [
      `Chaîne de transfert — ${asOf}`,
      `Étapes\u00a0: ${report.totalNodes}`,
      `Liens\u00a0: ${report.totalLinks}`,
      `Conditions UNKNOWN\u00a0: ${summary.unknown}`,
      `Litiges\u00a0: ${summary.disputed}`,
      `Examens à faire\u00a0: ${report.actions.length}`,
      "L’état de disponibilité reste UNKNOWN. Ce journal n’autorise pas l’utilisation des ensembles.",
    ].join("\n");
  }
  return [
    `Recovery handoff chain — ${asOf}`,
    `Steps: ${report.totalNodes}`,
    `Links: ${report.totalLinks}`,
    `UNKNOWN conditions: ${summary.unknown}`,
    `Disputes: ${summary.disputed}`,
    `Reviews needed: ${report.actions.length}`,
    "Availability remains UNKNOWN. This journal does not authorize pack use.",
  ].join("\n");
}
export function compareChainReports(left: ChainDocument, right: ChainDocument, asOf: string): { readonly newFindings: readonly ChainFindingCode[]; readonly clearedFindings: readonly ChainFindingCode[]; readonly changedPacks: readonly string[]; readonly contentReady: false } {
  const oldFindings = chainFindings(left, asOf);
  const newFindings = chainFindings(right, asOf);
  const sig = (item: ChainFinding): string => `${item.packId}|${item.nodeId ?? ""}|${item.code}`;
  const oldKeys = new Set(oldFindings.map(sig));
  const newKeys = new Set(newFindings.map(sig));
  const changed = unique([...oldFindings, ...newFindings].filter((item) => oldKeys.has(sig(item)) !== newKeys.has(sig(item))).map((item) => item.packId));
  return {
    newFindings: unique(newFindings.filter((item) => !oldKeys.has(sig(item))).map((item) => item.code)).sort(byId),
    clearedFindings: unique(oldFindings.filter((item) => !newKeys.has(sig(item))).map((item) => item.code)).sort(byId),
    changedPacks: changed.sort(byId),
    contentReady: false,
  };
}
