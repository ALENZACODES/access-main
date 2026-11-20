import {
  packetEventsFor, packetFindings, packetSummary, type PacketCondition,
  type PacketDocument, type PacketEntry, type PacketFinding,
  type PacketFindingCode, type PacketOperation, type PacketSource, type PacketTier,
} from "./recoveryEvidencePacket";

export interface EvidencePackGroup {
  readonly packId: string;
  readonly entries: number;
  readonly conditions: readonly PacketCondition[];
  readonly tiers: readonly PacketTier[];
  readonly unresolved: number;
  readonly operations: readonly PacketOperation[];
  readonly hasConflict: boolean;
  readonly contentReady: false;
}
export interface EvidenceDateRange {
  readonly earliest: string | null;
  readonly latest: string | null;
  readonly retrievalEarliest: string | null;
  readonly retrievalLatest: string | null;
}
export interface EvidenceTrend {
  readonly date: string;
  readonly added: number;
  readonly events: number;
  readonly unresolved: number;
}
export interface EvidenceFindingGroup {
  readonly code: PacketFindingCode;
  readonly count: number;
  readonly entryIds: readonly string[];
}
export interface EvidenceOperationGroup {
  readonly operation: PacketOperation;
  readonly entries: number;
  readonly open: number;
  readonly unknown: number;
}
export interface EvidenceSourceGroup {
  readonly key: string;
  readonly source: PacketSource;
  readonly count: number;
  readonly entries: readonly string[];
}
export interface EvidenceInvestigation {
  readonly id: string;
  readonly packId: string;
  readonly priority: "high" | "medium" | "low";
  readonly reason: string;
  readonly entryIds: readonly string[];
  readonly contentReady: false;
}
export interface EvidenceReport {
  readonly generatedFor: string;
  readonly entries: number;
  readonly events: number;
  readonly unknown: number;
  readonly unfinished: number;
  readonly findings: readonly PacketFinding[];
  readonly packs: readonly EvidencePackGroup[];
  readonly actions: readonly EvidenceInvestigation[];
  readonly contentReady: false;
}
export interface EvidenceComparison {
  readonly packId: string;
  readonly leftEntries: number;
  readonly rightEntries: number;
  readonly addedIds: readonly string[];
  readonly removedIds: readonly string[];
  readonly changedIds: readonly string[];
  readonly contentReady: false;
}

const operations: readonly PacketOperation[] = ["pack", "download", "export", "handoff"];
const uniq = <T>(values: readonly T[]): T[] => [...new Set(values)];
const alpha = (a: string, b: string): number => a.localeCompare(b);
const byId = (a: PacketEntry, b: PacketEntry): number => alpha(a.id, b.id);
const isoDay = (value: string): string => value.slice(0, 10);

export function groupEvidencePacks(document: PacketDocument): readonly EvidencePackGroup[] {
  const ids = uniq(document.entries.map((entry) => entry.packId)).sort(alpha);
  return ids.map((packId) => {
    const entries = document.entries.filter((entry) => entry.packId === packId);
    const conditions = uniq(entries.map((entry) => entry.observation.condition));
    return {
      packId,
      entries: entries.length,
      conditions: conditions.sort(alpha),
      tiers: uniq(entries.map((entry) => entry.source.tier)).sort(alpha),
      unresolved: entries.filter((entry) => entry.stage !== "closed").length,
      operations: uniq(entries.map((entry) => entry.operation)).sort(alpha),
      hasConflict: operations.some((operation) => new Set(entries.filter((entry) => entry.operation === operation).map((entry) => entry.observation.condition)).size > 1),
      contentReady: false,
    };
  });
}
export function evidenceDateRange(document: PacketDocument): EvidenceDateRange {
  const recorded = document.entries.map((entry) => entry.recordedAt).concat(document.events.map((event) => event.at)).sort(alpha);
  const retrieved = document.entries.map((entry) => entry.source.retrievedOn).sort(alpha);
  return {
    earliest: recorded[0] ?? null,
    latest: recorded[recorded.length - 1] ?? null,
    retrievalEarliest: retrieved[0] ?? null,
    retrievalLatest: retrieved[retrieved.length - 1] ?? null,
  };
}
export function evidenceTrends(document: PacketDocument): readonly EvidenceTrend[] {
  const dates = uniq(document.entries.map((entry) => isoDay(entry.recordedAt)).concat(document.events.map((event) => isoDay(event.at)))).sort(alpha);
  return dates.map((date) => ({
    date,
    added: document.entries.filter((entry) => isoDay(entry.recordedAt) === date).length,
    events: document.events.filter((event) => isoDay(event.at) === date).length,
    unresolved: document.entries.filter((entry) => isoDay(entry.recordedAt) <= date && entry.stage !== "closed").length,
  }));
}
export function groupEvidenceFindings(findings: readonly PacketFinding[]): readonly EvidenceFindingGroup[] {
  const codes = uniq(findings.map((item) => item.code)).sort(alpha);
  return codes.map((code) => {
    const items = findings.filter((item) => item.code === code);
    return { code, count: items.length, entryIds: uniq(items.map((item) => item.entryId)).sort(alpha) };
  });
}
export function groupEvidenceOperations(document: PacketDocument): readonly EvidenceOperationGroup[] {
  return operations.map((operation) => {
    const entries = document.entries.filter((entry) => entry.operation === operation);
    return {
      operation,
      entries: entries.length,
      open: entries.filter((entry) => entry.stage !== "closed").length,
      unknown: entries.filter((entry) => entry.observation.condition === "UNKNOWN").length,
    };
  });
}
export function groupEvidenceSources(document: PacketDocument): readonly EvidenceSourceGroup[] {
  const entriesBySource = new Map<string, PacketEntry[]>();
  for (const entry of document.entries) {
    const source = entry.source;
    const key = JSON.stringify([source.name, source.licence, source.retrievedOn, source.reference, source.tier]);
    entriesBySource.set(key, [...(entriesBySource.get(key) ?? []), entry]);
  }
  return [...entriesBySource.entries()].map(([key, entries]) => ({
    key,
    source: entries[0]!.source,
    count: entries.length,
    entries: entries.map((entry) => entry.id).sort(alpha),
  })).sort((a, b) => alpha(a.key, b.key));
}
export function evidenceActivity(document: PacketDocument, entryId: string): readonly string[] {
  const entry = document.entries.find((item) => item.id === entryId);
  if (!entry) return [];
  return [
    `${entry.recordedAt} | created | ${entry.id}`,
    ...packetEventsFor(document, entryId).map((event) => `${event.at} | ${event.action} | ${event.note}`),
  ];
}
export function investigateEvidence(document: PacketDocument, asOf: string): readonly EvidenceInvestigation[] {
  const findings = packetFindings(document, asOf);
  const byPack = new Map<string, PacketFinding[]>();
  for (const finding of findings) {
    const entry = document.entries.find((item) => item.id === finding.entryId);
    if (!entry) continue;
    byPack.set(entry.packId, [...(byPack.get(entry.packId) ?? []), finding]);
  }
  const result: EvidenceInvestigation[] = [];
  for (const [packId, items] of byPack) {
    const severe = items.some((item) => item.code === "conflicting-observation" || item.code === "missing-source" || item.code === "out-of-order");
    const unknown = items.some((item) => item.code === "unknown-condition" || item.code === "unknown-tier");
    const priority = severe ? "high" : unknown ? "medium" : "low";
    result.push({
      id: `investigate:${packId}`,
      packId,
      priority,
      reason: uniq(items.map((item) => item.code)).sort(alpha).join(", "),
      entryIds: uniq(items.map((item) => item.entryId)).sort(alpha),
      contentReady: false,
    });
  }
  const rank = { high: 0, medium: 1, low: 2 };
  return result.sort((a, b) => rank[a.priority] - rank[b.priority] || alpha(a.packId, b.packId));
}
export function evidenceReport(document: PacketDocument, asOf: string): EvidenceReport {
  const summary = packetSummary(document);
  return {
    generatedFor: asOf,
    entries: summary.total,
    events: summary.events,
    unknown: summary.unknown,
    unfinished: summary.drafts + summary.reviews,
    findings: packetFindings(document, asOf),
    packs: groupEvidencePacks(document),
    actions: investigateEvidence(document, asOf),
    contentReady: false,
  };
}
export function compareEvidencePack(left: PacketDocument, right: PacketDocument, packId: string): EvidenceComparison {
  const a = left.entries.filter((entry) => entry.packId === packId).sort(byId);
  const b = right.entries.filter((entry) => entry.packId === packId).sort(byId);
  const leftMap = new Map(a.map((entry) => [entry.id, JSON.stringify(entry)]));
  const rightMap = new Map(b.map((entry) => [entry.id, JSON.stringify(entry)]));
  return {
    packId,
    leftEntries: a.length,
    rightEntries: b.length,
    addedIds: b.filter((item) => !leftMap.has(item.id)).map((item) => item.id),
    removedIds: a.filter((item) => !rightMap.has(item.id)).map((item) => item.id),
    changedIds: b.filter((item) => leftMap.has(item.id) && leftMap.get(item.id) !== rightMap.get(item.id)).map((item) => item.id),
    contentReady: false,
  };
}
export function evidenceNarrative(document: PacketDocument, asOf: string, locale: "en" | "fr"): string {
  const report = evidenceReport(document, asOf);
  if (locale === "fr") {
    return [
      `Dossier de récupération — ${report.generatedFor}`,
      `Observations\u00a0: ${report.entries}`,
      `Évènements\u00a0: ${report.events}`,
      `Conditions UNKNOWN\u00a0: ${report.unknown}`,
      `Révisions en attente\u00a0: ${report.unfinished}`,
      `Alertes de contrôle\u00a0: ${report.findings.length}`,
      "Ce document ne confirme jamais qu’un ensemble est utilisable.",
    ].join("\n");
  }
  return [
    `Recovery evidence packet — ${report.generatedFor}`,
    `Entries: ${report.entries}`,
    `Events: ${report.events}`,
    `UNKNOWN conditions: ${report.unknown}`,
    `Pending reviews: ${report.unfinished}`,
    `Review findings: ${report.findings.length}`,
    "This document never confirms a pack can be used.",
  ].join("\n");
}
