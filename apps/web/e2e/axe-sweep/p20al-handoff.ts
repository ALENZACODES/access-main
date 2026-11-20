import {
  UNKNOWN, isUnknown, valueOrUnknown, calendarDate, safePath, sourceKnown,
  type Finding, type Locale, type SourceRecord, type Replay, type Screen, finding,
} from "./p20al-contract.ts";
import { localizedMessage } from "./p20al-language.ts";

/** A privacy-preserving take-along report constructed entirely in memory. */
export interface Handoff {
  readonly version: "p20al-1";
  readonly locale: Locale;
  readonly route: string;
  readonly records: readonly SourceRecord[];
  readonly findings: readonly Finding[];
  readonly offline: boolean | null;
  readonly createdAt: string | null;
}
export interface HandoffReview {
  readonly errors: readonly Finding[];
  readonly warnings: readonly Finding[];
  readonly information: readonly Finding[];
  readonly knownRecords: number;
  readonly unknownRecords: number;
}
export interface HandoffComparison {
  readonly added: readonly string[];
  readonly removed: readonly string[];
  readonly metadataChanged: readonly string[];
  readonly valueChanged: readonly string[];
  readonly statusChanged: readonly string[];
}
export interface RenderedFile {
  readonly name: string;
  readonly mime: string;
  readonly content: string;
}
const csvHeader = ["id", "title", "value", "source", "licence", "retrievedOn", "tier", "status"] as const;
const csvHeaders: Readonly<Record<Locale, readonly string[]>> = {
  en: ["Identifier", "Title", "Value", "Source", "Licence", "Retrieved on", "Evidence tier", "Status"],
  fr: ["Identifiant", "Titre", "Valeur", "Source", "Licence", "Date de consultation", "Niveau de preuve", "État"],
};
function csvEscape(raw: string): string {
  const safe = /^[=+@\-\t\r]/.test(raw) ? `'${raw}` : raw;
  return `"${safe.replaceAll('"', '""')}"`;
}
function recordRow(record: SourceRecord): string[] {
  return [record.id, record.title, valueOrUnknown(record.value), valueOrUnknown(record.source),
    valueOrUnknown(record.licence), valueOrUnknown(record.retrievedOn), valueOrUnknown(record.tier), record.state];
}
export function handoffFromScreen(screen: Screen, findings: readonly Finding[] = [], createdAt: string | null = null): Handoff {
  return {
    version: "p20al-1",
    locale: screen.locale,
    route: screen.route,
    records: screen.records.map((record) => ({ ...record })),
    findings: findings.map((item) => ({ ...item })),
    offline: screen.network === "offline" ? true : screen.network === "online" ? false : null,
    createdAt,
  };
}
export function handoffFromReplay(replay: Replay, findings: readonly Finding[] = [], createdAt: string | null = null): Handoff {
  const last = replay.steps[replay.steps.length - 1]?.after ?? replay.start;
  return handoffFromScreen(last, findings, createdAt);
}
export function handoffProblems(handoff: Handoff): Finding[] {
  const problems: Finding[] = [];
  if (handoff.version !== "p20al-1") problems.push(finding("handoff-version", handoff.route, "Unsupported version"));
  if (!safePath(handoff.route)) problems.push(finding("handoff-path-invalid", handoff.route, "Unsafe route"));
  if (handoff.createdAt !== null && !calendarDate(handoff.createdAt)) problems.push(finding("handoff-date-invalid", handoff.route, "Unusable creation date"));
  const ids = new Set<string>();
  for (const record of handoff.records) {
    if (ids.has(record.id)) problems.push(finding("handoff-duplicate-id", handoff.route, record.id));
    ids.add(record.id);
    if (!record.id.trim()) problems.push(finding("handoff-empty-id", handoff.route, UNKNOWN));
    if (record.state === "KNOWN" && !sourceKnown(record)) problems.push(finding("handoff-overclaim", handoff.route, record.id));
    if (record.state === "UNKNOWN" && sourceKnown(record)) problems.push(finding("handoff-unknown-preserved", handoff.route, record.id, "information"));
  }
  for (const row of handoff.findings) {
    if (!row.code.trim()) problems.push(finding("handoff-finding-code-empty", handoff.route, UNKNOWN));
    if (!row.scope.trim()) problems.push(finding("handoff-finding-scope-empty", handoff.route, UNKNOWN));
  }
  return problems;
}
export function reviewHandoff(handoff: Handoff): HandoffReview {
  const findings = [...handoffProblems(handoff), ...handoff.findings];
  return {
    errors: findings.filter((item) => item.severity === "error"),
    warnings: findings.filter((item) => item.severity === "warning"),
    information: findings.filter((item) => item.severity === "information"),
    knownRecords: handoff.records.filter((item) => item.state === "KNOWN" && sourceKnown(item)).length,
    unknownRecords: handoff.records.filter((item) => item.state === "UNKNOWN" || !sourceKnown(item)).length,
  };
}
export function toHandoffText(handoff: Handoff): RenderedFile {
  const headline = handoff.locale === "en" ? "Offline journey evidence" : "Renseignements sur le parcours hors ligne";
  const label = (en: string, fr: string): string => handoff.locale === "en" ? en : fr;
  const header = [headline, `${label("Route", "Page")} : ${handoff.route}`,
    `${label("Date", "Date")} : ${valueOrUnknown(handoff.createdAt)}`,
    `${label("Offline", "Hors ligne")} : ${handoff.offline === null ? UNKNOWN : String(handoff.offline)}`];
  const rows = handoff.records.flatMap((record) => [
    "", `${label("Record", "Dossier")} : ${record.id}`,
    `${label("Title", "Titre")} : ${valueOrUnknown(record.title)}`,
    `${label("Value", "Valeur")} : ${valueOrUnknown(record.value)}`,
    `${label("Source", "Source")} : ${valueOrUnknown(record.source)}`,
    `${label("Licence", "Licence")} : ${valueOrUnknown(record.licence)}`,
    `${label("Retrieved on", "Date de consultation")} : ${valueOrUnknown(record.retrievedOn)}`,
    `${label("Evidence tier", "Niveau de preuve")} : ${valueOrUnknown(record.tier)}`,
    `${label("Status", "État")} : ${record.state}`,
  ]);
  const findings = handoff.findings.flatMap((item) => ["", `${item.severity} ${item.code}`, `${item.scope} : ${item.detail}`]);
  // The text format intentionally contains only the submitted records, not page storage.
  return { name: `p20al-${handoff.locale}.txt`, mime: "text/plain;charset=utf-8", content: [...header, ...rows, ...findings].join("\n") + "\n" };
}
export function toHandoffCsv(handoff: Handoff): RenderedFile {
  const titleRow = csvHeaders[handoff.locale];
  const rows = handoff.records.map(recordRow);
  const content = "\ufeff" + [titleRow, ...rows].map((row) => row.map(csvEscape).join(",")).join("\r\n") + "\r\n";
  return { name: `p20al-${handoff.locale}.csv`, mime: "text/csv;charset=utf-8", content };
}
export function toHandoffJson(handoff: Handoff): RenderedFile {
  const normalized: Handoff = {
    ...handoff,
    records: handoff.records.map((record) => ({
      ...record,
      value: valueOrUnknown(record.value),
      source: valueOrUnknown(record.source),
      licence: valueOrUnknown(record.licence),
      retrievedOn: valueOrUnknown(record.retrievedOn),
      tier: valueOrUnknown(record.tier),
      state: record.state === "KNOWN" && !sourceKnown(record) ? UNKNOWN : record.state,
    })),
  };
  return { name: `p20al-${handoff.locale}.json`, mime: "application/json;charset=utf-8", content: JSON.stringify(normalized, null, 2) + "\n" };
}
export function compareHandoffs(before: Handoff, after: Handoff): HandoffComparison {
  const a = new Map(before.records.map((record) => [record.id, record]));
  const b = new Map(after.records.map((record) => [record.id, record]));
  const added: string[] = [];
  const removed: string[] = [];
  const metadataChanged: string[] = [];
  const valueChanged: string[] = [];
  const statusChanged: string[] = [];
  for (const record of after.records) if (!a.has(record.id)) added.push(record.id);
  for (const record of before.records) {
    const next = b.get(record.id);
    if (!next) { removed.push(record.id); continue; }
    if (["source", "licence", "retrievedOn", "tier"].some((key) =>
      record[key as keyof SourceRecord] !== next[key as keyof SourceRecord])) metadataChanged.push(record.id);
    if (valueOrUnknown(record.value) !== valueOrUnknown(next.value)) valueChanged.push(record.id);
    if (record.state !== next.state) statusChanged.push(record.id);
  }
  return { added, removed, metadataChanged, valueChanged, statusChanged };
}
export function handedOffDataIsUnknown(record: SourceRecord): boolean {
  return record.state === "UNKNOWN" || isUnknown(record.value) || !sourceKnown(record);
}
export function reportTitle(locale: Locale): string {
  return localizedMessage(locale, "localOnly");
}
export function importHandoffJson(text: string): Handoff | null {
  let raw: unknown;
  try { raw = JSON.parse(text) as unknown; } catch { return null; }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const object = raw as Record<string, unknown>;
  if (object.version !== "p20al-1" || !["en", "fr"].includes(String(object.locale)) || !Array.isArray(object.records)) return null;
  if (typeof object.route !== "string" || !safePath(object.route)) return null;
  const records: SourceRecord[] = [];
  for (const row of object.records) {
    if (!row || typeof row !== "object" || Array.isArray(row)) return null;
    const item = row as Record<string, unknown>;
    if (typeof item.id !== "string" || typeof item.title !== "string") return null;
    if (item.state !== "KNOWN" && item.state !== "UNKNOWN") return null;
    const optional = (key: string): string | null | undefined => {
      const value = item[key];
      return typeof value === "string" ? value : value === null ? null : undefined;
    };
    const value = optional("value");
    const source = optional("source");
    const licence = optional("licence");
    const retrievedOn = optional("retrievedOn");
    const tier = optional("tier");
    if ([value, source, licence, retrievedOn, tier].includes(undefined)) return null;
    records.push({ id: item.id, title: item.title, value: value ?? null, source: source ?? null,
      licence: licence ?? null, retrievedOn: retrievedOn ?? null, tier: tier ?? null, state: item.state });
  }
  const findings: Finding[] = [];
  if (Array.isArray(object.findings)) {
    for (const item of object.findings) {
      if (!item || typeof item !== "object") return null;
      const f = item as Record<string, unknown>;
      if (typeof f.code !== "string" || typeof f.scope !== "string" || typeof f.detail !== "string" ||
        !["error", "warning", "information"].includes(String(f.severity))) return null;
      findings.push({ code: f.code, scope: f.scope, detail: f.detail, severity: f.severity as Finding["severity"] });
    }
  }
  if (object.createdAt !== null && object.createdAt !== undefined && typeof object.createdAt !== "string") return null;
  if (object.offline !== null && object.offline !== undefined && typeof object.offline !== "boolean") return null;
  return { version: "p20al-1", locale: object.locale as Locale, route: object.route,
    records, findings, createdAt: typeof object.createdAt === "string" ? object.createdAt : null,
    offline: typeof object.offline === "boolean" ? object.offline : null };
}
export function handoffRoundtripFindings(handoff: Handoff): Finding[] {
  const encoded = toHandoffJson(handoff);
  const parsed = importHandoffJson(encoded.content);
  if (!parsed) return [finding("handoff-unreadable", handoff.route, "JSON could not be imported")];
  const comparison = compareHandoffs(handoff, parsed);
  const failures: Finding[] = [];
  for (const id of comparison.added) failures.push(finding("handoff-roundtrip-added", handoff.route, id));
  for (const id of comparison.removed) failures.push(finding("handoff-roundtrip-removed", handoff.route, id));
  for (const id of comparison.metadataChanged) failures.push(finding("handoff-roundtrip-metadata", handoff.route, id));
  for (const id of comparison.valueChanged) failures.push(finding("handoff-roundtrip-value", handoff.route, id));
  for (const id of comparison.statusChanged) {
    if (!handedOffDataIsUnknown(handoff.records.find((r) => r.id === id)!)) failures.push(finding("handoff-roundtrip-state", handoff.route, id));
  }
  return failures;
}
export function sortedHandoffRecords(records: readonly SourceRecord[]): SourceRecord[] {
  return [...records].sort((a, b) => a.id.localeCompare(b.id));
}
export function redactUnnecessaryRecordFields(record: SourceRecord): SourceRecord {
  // The contract only transports evidence provenance fields; no user account fields exist.
  return { id: record.id, title: record.title, value: record.value, source: record.source,
    licence: record.licence, retrievedOn: record.retrievedOn, tier: record.tier, state: record.state };
}
export function minimalHandoff(handoff: Handoff): Handoff {
  return { ...handoff, records: handoff.records.map(redactUnnecessaryRecordFields), findings: handoff.findings.map((item) => ({ ...item })) };
}
export const HANDOFF_COLUMNS = csvHeader;
