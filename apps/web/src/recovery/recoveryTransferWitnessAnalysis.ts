import {
  type WitnessCondition, type WitnessDocument, type WitnessEvent, type WitnessFinding,
  type WitnessKind, type WitnessPhase, type WitnessSource, type WitnessTier,
  type WitnessTransfer, witnessEventsFor, summarizeWitnessDocument,
} from "./recoveryTransferWitness";

export interface WitnessPackSummary {
  readonly packId: string;
  readonly transfers: number;
  readonly open: number;
  readonly disputed: number;
  readonly unknown: number;
  readonly kinds: readonly WitnessKind[];
  readonly conditions: readonly WitnessCondition[];
  readonly contentReady: false;
}
export interface WitnessSourceSummary {
  readonly source: WitnessSource;
  readonly references: readonly string[];
  readonly transfers: number;
  readonly identifiers: readonly string[];
}
export interface WitnessTimelinePoint {
  readonly transferId: string;
  readonly at: string;
  readonly action: string;
  readonly phase: WitnessPhase;
  readonly source: string;
  readonly sourceTier: WitnessTier;
  readonly note: string;
}
export interface WitnessPeriodSummary {
  readonly day: string;
  readonly transfers: number;
  readonly events: number;
  readonly acknowledgements: number;
  readonly disputes: number;
}
export interface WitnessComparison {
  readonly added: readonly string[];
  readonly removed: readonly string[];
  readonly changed: readonly string[];
  readonly changedSources: readonly string[];
  readonly changedPhases: readonly string[];
  readonly contentReady: false;
}
export interface WitnessReviewStep {
  readonly transferId: string;
  readonly priority: "high" | "medium" | "low";
  readonly code: string;
  readonly explanation: string;
  readonly contentReady: false;
}
export interface WitnessCoverage {
  readonly total: number;
  readonly sourceTiers: Readonly<Record<WitnessTier, number>>;
  readonly conditionKnown: number;
  readonly conditionUnknown: number;
  readonly withDigest: number;
  readonly withBytes: number;
  readonly withEvents: number;
  readonly pendingReview: number;
  readonly contentReady: false;
}
export interface WitnessReport {
  readonly createdFor: string;
  readonly summary: ReturnType<typeof summarizeWitnessDocument>;
  readonly findings: readonly WitnessFinding[];
  readonly steps: readonly WitnessReviewStep[];
  readonly packs: readonly WitnessPackSummary[];
  readonly coverage: WitnessCoverage;
  readonly contentReady: false;
}
const alpha = (a: string, b: string): number => a < b ? -1 : a > b ? 1 : 0;
const unique = <T>(values: readonly T[]): T[] => [...new Set(values)];
const day = (value: string): string => value.slice(0, 10);

export function groupWitnessPacks(document: WitnessDocument): readonly WitnessPackSummary[] {
  return unique(document.transfers.map((item) => item.packId)).sort(alpha).map((packId) => {
    const transfers = document.transfers.filter((item) => item.packId === packId);
    return {
      packId,
      transfers: transfers.length,
      open: transfers.filter((item) => item.phase !== "acknowledged" && item.phase !== "withdrawn").length,
      disputed: transfers.filter((item) => item.phase === "disputed").length,
      unknown: transfers.filter((item) => item.condition === "UNKNOWN").length,
      kinds: unique(transfers.map((item) => item.kind)).sort(alpha),
      conditions: unique(transfers.map((item) => item.condition)).sort(alpha),
      contentReady: false,
    };
  });
}
export function groupWitnessSources(document: WitnessDocument): readonly WitnessSourceSummary[] {
  const groups = new Map<string, WitnessTransfer[]>();
  for (const transfer of document.transfers) {
    const key = JSON.stringify(transfer.source);
    groups.set(key, [...(groups.get(key) ?? []), transfer]);
  }
  return [...groups.entries()].map(([key, transfers]) => {
    const first = transfers[0];
    if (!first) throw new Error("A source group must have a transfer");
    return {
      source: first.source,
      references: unique(transfers.map((item) => item.source.reference)).sort(alpha),
      transfers: transfers.length,
      identifiers: transfers.map((item) => item.id).sort(alpha),
      key,
    };
  }).sort((a, b) => alpha(a.key, b.key)).map(({ source, references, transfers, identifiers }) =>
    ({ source, references, transfers, identifiers }));
}
export function witnessTimeline(document: WitnessDocument, transferId?: string): readonly WitnessTimelinePoint[] {
  const items = transferId === undefined ? document.transfers : document.transfers.filter((item) => item.id === transferId);
  const result: WitnessTimelinePoint[] = [];
  for (const item of items) {
    result.push({
      transferId: item.id,
      at: item.recordedAt,
      action: "created",
      phase: "draft",
      source: item.source.name,
      sourceTier: item.source.tier,
      note: item.note,
    });
    let phase: WitnessPhase = "draft";
    for (const event of witnessEventsFor(document, item.id)) {
      phase = event.action === "offered" ? "offered" :
        event.action === "acknowledged" ? "acknowledged" :
        event.action === "disputed" ? "disputed" :
        event.action === "withdrawn" ? "withdrawn" :
        event.action === "reopened" ? "draft" : phase;
      result.push({
        transferId: item.id,
        at: event.at,
        action: event.action,
        phase,
        source: event.source.name,
        sourceTier: event.source.tier,
        note: event.note,
      });
    }
  }
  return result.sort((a, b) => alpha(a.at, b.at) || alpha(a.transferId, b.transferId) || alpha(a.action, b.action));
}
export function witnessPeriods(document: WitnessDocument): readonly WitnessPeriodSummary[] {
  const dates = unique([
    ...document.transfers.map((item) => day(item.recordedAt)),
    ...document.events.map((event) => day(event.at)),
  ]).sort(alpha);
  return dates.map((date) => ({
    day: date,
    transfers: document.transfers.filter((item) => day(item.recordedAt) === date).length,
    events: document.events.filter((item) => day(item.at) === date).length,
    acknowledgements: document.events.filter((item) => day(item.at) === date && item.action === "acknowledged").length,
    disputes: document.events.filter((item) => day(item.at) === date && item.action === "disputed").length,
  }));
}
export function compareWitnessDocuments(left: WitnessDocument, right: WitnessDocument): WitnessComparison {
  const old = new Map(left.transfers.map((item) => [item.id, item]));
  const next = new Map(right.transfers.map((item) => [item.id, item]));
  const changed = right.transfers.filter((item) => old.has(item.id) && JSON.stringify(old.get(item.id)) !== JSON.stringify(item));
  return {
    added: right.transfers.filter((item) => !old.has(item.id)).map((item) => item.id).sort(alpha),
    removed: left.transfers.filter((item) => !next.has(item.id)).map((item) => item.id).sort(alpha),
    changed: changed.map((item) => item.id).sort(alpha),
    changedSources: changed.filter((item) => JSON.stringify(old.get(item.id)?.source) !== JSON.stringify(item.source))
      .map((item) => item.id).sort(alpha),
    changedPhases: changed.filter((item) => old.get(item.id)?.phase !== item.phase)
      .map((item) => item.id).sort(alpha),
    contentReady: false,
  };
}
export function witnessFindings(document: WitnessDocument, asOf: string): readonly WitnessFinding[] {
  const findings: WitnessFinding[] = [];
  const seen = new Map<string, Set<WitnessCondition>>();
  for (const item of document.transfers) {
    if (item.condition === "UNKNOWN") findings.push({ transferId: item.id, code: "unknown-condition", severity: "review", detail: "Condition remains UNKNOWN" });
    if (item.source.tier === "UNKNOWN") findings.push({ transferId: item.id, code: "unknown-tier", severity: "review", detail: "Source tier remains UNKNOWN" });
    if (item.phase === "offered") findings.push({ transferId: item.id, code: "no-receipt", severity: "attention", detail: "Offered without a recorded acknowledgement" });
    if (item.phase === "disputed") findings.push({ transferId: item.id, code: "disputed", severity: "attention", detail: "Receipt is disputed" });
    if (item.condition === "partial" || item.condition === "interrupted") findings.push({ transferId: item.id, code: "partial", severity: "attention", detail: "The reported transfer may be incomplete" });
    if (day(item.source.retrievedOn) > day(asOf) || item.source.retrievedOn > day(item.recordedAt)) findings.push({
      transferId: item.id, code: "stale-source", severity: "review", detail: "Source date requires a manual check",
    });
    if (item.recordedAt > `${asOf}T23:59:59.999Z` || document.events.some((event) => event.transferId === item.id && event.at > `${asOf}T23:59:59.999Z`)) findings.push({
      transferId: item.id, code: "future-event", severity: "review", detail: "A timestamp occurs after the report date",
    });
    const key = JSON.stringify([item.packId, item.kind, item.channel]);
    const conditions = seen.get(key) ?? new Set<WitnessCondition>();
    conditions.add(item.condition);
    seen.set(key, conditions);
  }
  for (const item of document.transfers) {
    const conditions = seen.get(JSON.stringify([item.packId, item.kind, item.channel]));
    if (conditions && conditions.size > 1) findings.push({
      transferId: item.id, code: "conflicting-transfer", severity: "attention", detail: "Different conditions are recorded for the same pack, kind and channel",
    });
  }
  return findings.sort((a, b) => alpha(a.transferId, b.transferId) || alpha(a.code, b.code));
}
export function witnessCoverage(document: WitnessDocument): WitnessCoverage {
  const tiers: Record<WitnessTier, number> = { UNKNOWN: 0, "self-reported": 0, documented: 0, reviewed: 0 };
  for (const item of document.transfers) tiers[item.source.tier] += 1;
  const eventIds = new Set(document.events.map((event) => event.transferId));
  return {
    total: document.transfers.length,
    sourceTiers: tiers,
    conditionKnown: document.transfers.filter((item) => item.condition !== "UNKNOWN").length,
    conditionUnknown: document.transfers.filter((item) => item.condition === "UNKNOWN").length,
    withDigest: document.transfers.filter((item) => item.suppliedDigest !== null).length,
    withBytes: document.transfers.filter((item) => item.suppliedBytes !== null).length,
    withEvents: document.transfers.filter((item) => eventIds.has(item.id)).length,
    pendingReview: document.transfers.filter((item) => !["acknowledged", "withdrawn"].includes(item.phase)).length,
    contentReady: false,
  };
}
export function witnessReviewSteps(document: WitnessDocument, asOf: string): readonly WitnessReviewStep[] {
  const findings = witnessFindings(document, asOf);
  const steps: WitnessReviewStep[] = findings.map((finding) => ({
    transferId: finding.transferId,
    priority: finding.severity === "attention" ? "high" : finding.code === "unknown-condition" ? "medium" : "low",
    code: finding.code,
    explanation: finding.detail,
    contentReady: false,
  }));
  const rank: Record<WitnessReviewStep["priority"], number> = { high: 0, medium: 1, low: 2 };
  return steps.sort((a, b) => rank[a.priority] - rank[b.priority] || alpha(a.transferId, b.transferId));
}
export function witnessReport(document: WitnessDocument, asOf: string): WitnessReport {
  return {
    createdFor: asOf,
    summary: summarizeWitnessDocument(document),
    findings: witnessFindings(document, asOf),
    steps: witnessReviewSteps(document, asOf),
    packs: groupWitnessPacks(document),
    coverage: witnessCoverage(document),
    contentReady: false,
  };
}
export function witnessTextReport(document: WitnessDocument, asOf: string, locale: "en" | "fr"): string {
  const result = witnessReport(document, asOf);
  if (locale === "fr") return [
    `Registre de transfert — ${asOf}`,
    `Transferts\u00a0: ${result.summary.total}`,
    `Évènements\u00a0: ${result.summary.events}`,
    `Conditions UNKNOWN\u00a0: ${result.coverage.conditionUnknown}`,
    `Dossiers en attente\u00a0: ${result.coverage.pendingReview}`,
    `Points à examiner\u00a0: ${result.findings.length}`,
    "Ce registre n’établit jamais qu’un ensemble peut être utilisé.",
  ].join("\n");
  return [
    `Recovery transfer register — ${asOf}`,
    `Transfers: ${result.summary.total}`,
    `Events: ${result.summary.events}`,
    `UNKNOWN conditions: ${result.coverage.conditionUnknown}`,
    `Pending review: ${result.coverage.pendingReview}`,
    `Review findings: ${result.findings.length}`,
    "This register never establishes that a pack can be used.",
  ].join("\n");
}
/** A reported acknowledgement is not a certificate of content integrity. */
export function witnessAcknowledgementIsAuthority(event: WitnessEvent): false {
  void event;
  return false;
}
