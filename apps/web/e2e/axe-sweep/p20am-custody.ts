import { calendarDate, canonicalRoute, finding, known, recordKnown, reportFindings,
  textOrUnknown, type Finding, type Language, type SourceRecord, type Trace,
  type CoverageCell, WIDTHS, LANGUAGES, recordIdentity } from "./p20am-model.ts";
import { copy } from "./p20am-copy.ts";

export type ExportFormat = "text" | "csv" | "json";
export interface ExportEnvelope {
  readonly language: Language;
  readonly format: ExportFormat;
  readonly route: string;
  readonly records: readonly SourceRecord[];
  readonly retrievedAt: string | null;
  readonly heading: string;
}
export interface ExportedArtifact {
  readonly content: string;
  readonly mime: string;
  readonly suffix: string;
  readonly recordIds: readonly string[];
  readonly hasUnknown: boolean;
}
export interface TraceGate {
  readonly requiredRoutes: readonly string[];
  readonly requiredLanguages: readonly Language[];
  readonly requiredWidths: readonly (320 | 1280)[];
  readonly requireOffline: boolean;
}
export interface TraceCell {
  readonly route: string;
  readonly language: Language;
  readonly width: 320 | 1280;
  readonly offline: boolean;
  readonly traceId: string;
}
export function csvCell(value: string): string {
  const protectedValue = /^[\s]*[=+@\-\t\r]/.test(value) ? `'${value}` : value;
  return `"${protectedValue.replaceAll('"', '""')}"`;
}
export function csvRow(values: readonly string[]): string {
  return values.map(csvCell).join(",");
}
export interface NormalizedRecord {
  readonly id: string; readonly label: string; readonly value: string;
  readonly source: string; readonly licence: string; readonly retrievedOn: string;
  readonly tier: string; readonly status: string;
}
export function normalizedRecord(record: SourceRecord): NormalizedRecord {
  return {
    id: record.id,
    label: textOrUnknown(record.label),
    value: textOrUnknown(record.value),
    source: textOrUnknown(record.source),
    licence: textOrUnknown(record.licence),
    retrievedOn: calendarDate(record.retrievedOn) ? record.retrievedOn! : "UNKNOWN",
    tier: textOrUnknown(record.tier),
    status: recordKnown(record) ? record.declared : "UNKNOWN",
  };
}
export function exportHeaders(language: Language): readonly string[] {
  return ["ID", language === "fr" ? "Libellé" : "Label", language === "fr" ? "Valeur" : "Value",
    copy(language, "source"), copy(language, "licence"), copy(language, "retrievedOn"),
    copy(language, "tier"), language === "fr" ? "État" : "Status"];
}
export function exportText(envelope: ExportEnvelope): string {
  const separator = envelope.language === "fr" ? "\u00a0: " : ": ";
  const statusLabel = envelope.language === "fr" ? "État" : "Status";
  const lines = [envelope.heading, `${copy(envelope.language, "retrievedOn")}${separator}${textOrUnknown(envelope.retrievedAt)}`,
    `${envelope.route}`, ""];
  for (const record of envelope.records) {
    const item = normalizedRecord(record);
    lines.push(`${item.id} — ${item.label}`, `${item.value}`,
      `${copy(envelope.language, "source")}${separator}${item.source}`,
      `${copy(envelope.language, "licence")}${separator}${item.licence}`,
      `${copy(envelope.language, "retrievedOn")}${separator}${item.retrievedOn}`,
      `${copy(envelope.language, "tier")}${separator}${item.tier}`, `${statusLabel}${separator}${item.status}`, "");
  }
  return lines.join("\n").trimEnd() + "\n";
}
export function exportCsv(envelope: ExportEnvelope): string {
  const rows = [exportHeaders(envelope.language)];
  for (const record of envelope.records) {
    const item = normalizedRecord(record);
    rows.push([item.id, item.label, item.value, item.source, item.licence,
      item.retrievedOn, item.tier, item.status]);
  }
  return "\uFEFF" + rows.map(csvRow).join("\r\n") + "\r\n";
}
export function exportJson(envelope: ExportEnvelope): string {
  return JSON.stringify({
    format: "offline-evidence-v1", language: envelope.language,
    route: envelope.route, heading: envelope.heading,
    retrievedAt: textOrUnknown(envelope.retrievedAt),
    records: envelope.records.map(normalizedRecord),
  }, null, 2) + "\n";
}
export function artifact(envelope: ExportEnvelope): ExportedArtifact {
  const content = envelope.format === "json" ? exportJson(envelope) :
    envelope.format === "csv" ? exportCsv(envelope) : exportText(envelope);
  const mime = envelope.format === "json" ? "application/json;charset=utf-8" :
    envelope.format === "csv" ? "text/csv;charset=utf-8" : "text/plain;charset=utf-8";
  return { content, mime, suffix: envelope.format, recordIds: envelope.records.map((record) => record.id),
    hasUnknown: envelope.records.some((record) => !recordKnown(record)) };
}
export function exportFindings(envelope: ExportEnvelope): Finding[] {
  const issues: Finding[] = [];
  if (canonicalRoute(envelope.route) === null) issues.push(finding("export-route-unsafe", 0, envelope.route));
  if (!envelope.heading.trim()) issues.push(finding("export-heading-empty", 0, envelope.format));
  if (envelope.retrievedAt !== null && !calendarDate(envelope.retrievedAt)) {
    issues.push(finding("export-date-UNKNOWN", 0, envelope.format, "information"));
  }
  const ids = new Set<string>();
  for (const record of envelope.records) {
    if (ids.has(record.id)) issues.push(finding("export-record-duplicate", 0, record.id));
    ids.add(record.id);
    if (!record.id.trim()) issues.push(finding("export-record-id-empty", 0, "Missing record ID"));
    if (record.declared === "KNOWN" && !recordKnown(record)) {
      issues.push(finding("export-record-overclaim", 0, record.id));
    }
  }
  return issues;
}
export function importJson(text: string): ExportEnvelope | null {
  let parsed: unknown;
  try { parsed = JSON.parse(text) as unknown; } catch { return null; }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  const value = parsed as Record<string, unknown>;
  if (value.format !== "offline-evidence-v1") return null;
  if (value.language !== "en" && value.language !== "fr") return null;
  if (typeof value.route !== "string" || canonicalRoute(value.route) === null) return null;
  if (typeof value.heading !== "string" || !Array.isArray(value.records)) return null;
  const records: SourceRecord[] = [];
  for (const raw of value.records) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    const row = raw as Record<string, unknown>;
    const fields = ["id", "label", "value", "source", "licence", "retrievedOn", "tier", "status"];
    if (!fields.every((key) => typeof row[key] === "string")) return null;
    const id = row.id as string;
    const status = row.status;
    if (!id.trim() || (status !== "KNOWN" && status !== "UNKNOWN")) return null;
    records.push({ id, label: row.label as string, value: row.value as string,
      source: row.source as string, licence: row.licence as string,
      retrievedOn: row.retrievedOn as string, tier: row.tier as string,
      declared: status });
  }
  return { language: value.language, format: "json", route: value.route,
    heading: value.heading, retrievedAt: typeof value.retrievedAt === "string" ? value.retrievedAt : null,
    records };
}
export function compareExports(before: ExportEnvelope, after: ExportEnvelope): Finding[] {
  const issues: Finding[] = [];
  if (before.route !== after.route) issues.push(finding("export-route-drift", 0, after.route));
  const afterIds = new Map(after.records.map((record) => [record.id, record]));
  for (const record of before.records) {
    const next = afterIds.get(record.id);
    if (!next) issues.push(finding("export-lost-record", 0, record.id));
    else if (recordIdentity(record) !== recordIdentity(next)) {
      issues.push(finding("export-provenance-drift", 0, record.id));
    }
  }
  return issues;
}
export function requiredCoverage(routes: readonly string[], requireOffline = true): CoverageCell[] {
  return routes.flatMap((route) => LANGUAGES.flatMap((language) => WIDTHS.flatMap((width) =>
    (requireOffline ? ["online", "offline"] : ["online"]).map((connection) => ({
      route, language, width, connection: connection as "online" | "offline",
    })))));
}
export function coverageKey(cell: CoverageCell): string {
  return `${cell.route}|${cell.language}|${cell.width}|${cell.connection}`;
}
export function coverageFindings(expected: readonly CoverageCell[], actual: readonly CoverageCell[]): Finding[] {
  const issues: Finding[] = [];
  const required = new Set(expected.map(coverageKey));
  const seen = new Set<string>();
  for (const cell of actual) {
    const key = coverageKey(cell);
    if (seen.has(key)) issues.push(finding("coverage-duplicate", 0, key));
    seen.add(key);
    if (!required.has(key)) issues.push(finding("coverage-unexpected", 0, key));
  }
  for (const cell of expected) {
    const key = coverageKey(cell);
    if (!seen.has(key)) issues.push(finding("coverage-missing", 0, key));
  }
  return issues;
}
export function traceCoverage(trace: Trace, width: 320 | 1280): TraceCell[] {
  const snapshots = [trace.initial, ...trace.actions.map((action) => action.after)];
  const seen = new Set<string>();
  const cells: TraceCell[] = [];
  for (const snapshot of snapshots) {
    const cell = { route: snapshot.route, language: snapshot.language, width,
      offline: snapshot.connection === "offline", traceId: trace.id };
    const key = `${cell.route}|${cell.language}|${cell.width}|${cell.offline}`;
    if (!seen.has(key)) cells.push(cell);
    seen.add(key);
  }
  return cells;
}
export function coverageFromTraceCells(cells: readonly TraceCell[]): CoverageCell[] {
  return cells.map((item) => ({ route: item.route, language: item.language,
    width: item.width, connection: item.offline ? "offline" : "online" }));
}
export function custodySummary(items: readonly Finding[], limit = 15): string { return reportFindings(items, limit); }
export function recordNames(envelope: ExportEnvelope): string[] { return envelope.records.map((item) => textOrUnknown(item.label)); }
export function hasUnknownValues(envelope: ExportEnvelope): boolean {
  return envelope.records.some((item) => !known(item.value) || !known(item.source) || !known(item.licence));
}
export function formatEnvelope(language: Language, route: string, records: readonly SourceRecord[], format: ExportFormat): ExportEnvelope {
  return { language, route, records, format, heading: copy(language, "export"), retrievedAt: null };
}
