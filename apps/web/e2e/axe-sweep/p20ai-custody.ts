import { evidenceComplete, evidenceFindings, evidenceKey, known, unknownOrText,
  type Evidence, type Finding, type Locale } from "./p20ai-trace-model.ts";
import { COPY, typographyProblems } from "./p20ai-locale-input.ts";
/** Deterministic, local-only handoff: never upgrade missing evidence into a positive accessibility statement. */
export interface CustodyPacket {
  readonly route: string;
  readonly locale: Locale;
  readonly exportedAt: string | null;
  readonly records: readonly Evidence[];
  readonly notes: string | null;
  readonly consentToExport: boolean;
}
export type ExportFormat = "text" | "csv" | "json";
export interface ExportedPacket {
  readonly format: ExportFormat;
  readonly content: string;
  readonly filename: string;
  readonly mime: string;
  readonly complete: boolean;
  readonly warnings: readonly Finding[];
}
const issue = (code: string, detail: string): Finding => ({ code, detail, step: 0, severity: "error" });
const labels = {
  en: { heading: "Evidence notes", route: "Route", time: "Exported at", count: "Records",
    id: "ID", value: "Value", source: "Source", licence: "Licence", date: "Retrieved on", tier: "Evidence tier",
    notes: "Notes", missing: "Some details are UNKNOWN", denied: "Export not selected" },
  fr: { heading: "Notes sur les sources", route: "Page", time: "Date de l’exportation", count: "Fiches",
    id: "ID", value: "Valeur", source: "Source", licence: "Licence", date: "Date de consultation", tier: "Niveau de preuve",
    notes: "Notes", missing: "Certains détails sont UNKNOWN", denied: "Exportation non sélectionnée" },
} as const;
export function custodyLabels(locale: Locale): typeof labels[Locale] { return labels[locale]; }
export function custodyFindings(packet: CustodyPacket): Finding[] {
  const failures = evidenceFindings(packet.records, 0);
  if (!packet.consentToExport) failures.push(issue("export-not-selected", packet.route));
  if (!packet.route.startsWith("/") || packet.route.startsWith("//")) failures.push(issue("export-route-invalid", packet.route));
  if (packet.exportedAt !== null && !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(packet.exportedAt))
    failures.push(issue("export-time-invalid", packet.exportedAt));
  if (packet.locale === "fr" && packet.notes !== null) failures.push(...typographyProblems(packet.notes)
    .map((code) => issue(`fr-note-${code}`, packet.notes ?? "")));
  return failures;
}
export function safeCsvCell(input: string | null | undefined): string {
  const value = unknownOrText(input).replace(/\r\n|\r|\n/g, " ");
  const safe = /^[\s]*[=+@\-\t\r]/.test(value) ? `'${value}` : value;
  return `"${safe.replace(/"/g, '""')}"`;
}
export function csvPacket(packet: CustodyPacket): string {
  const t = labels[packet.locale];
  const header = [t.id, t.value, t.source, t.licence, t.date, t.tier].map(safeCsvCell).join(",");
  const body = packet.records.map((entry) => [entry.id, entry.value, entry.source, entry.licence,
    entry.retrievedOn, entry.tier].map(safeCsvCell).join(","));
  return "\uFEFF" + [header, ...body].join("\r\n") + "\r\n";
}
export function textPacket(packet: CustodyPacket): string {
  const t = labels[packet.locale];
  const colon = packet.locale === "fr" ? "\u00a0:" : ":";
  const lines = [`${t.heading}`, `${t.route}${colon} ${packet.route}`, `${t.time}${colon} ${unknownOrText(packet.exportedAt)}`,
    `${t.count}${colon} ${packet.records.length}`, ""];
  for (const [index, record] of packet.records.entries()) {
    lines.push(`${index + 1}. ${t.id}${colon} ${unknownOrText(record.id)}`,
      `   ${t.value}${colon} ${unknownOrText(record.value)}`,
      `   ${t.source}${colon} ${unknownOrText(record.source)}`,
      `   ${t.licence}${colon} ${unknownOrText(record.licence)}`,
      `   ${t.date}${colon} ${unknownOrText(record.retrievedOn)}`,
      `   ${t.tier}${colon} ${unknownOrText(record.tier)}`, "");
  }
  lines.push(`${t.notes}${colon} ${unknownOrText(packet.notes)}`);
  if (packet.records.some((item) => !evidenceComplete(item))) lines.push(t.missing);
  return lines.join("\n") + "\n";
}
export function jsonPacket(packet: CustodyPacket): string {
  return JSON.stringify({
    schema: "the-app-offline-evidence-v1", route: packet.route, locale: packet.locale,
    exportedAt: unknownOrText(packet.exportedAt), notes: unknownOrText(packet.notes),
    records: packet.records.map((item) => ({ id: unknownOrText(item.id),
      value: unknownOrText(item.value), source: unknownOrText(item.source),
      licence: unknownOrText(item.licence), retrievedOn: unknownOrText(item.retrievedOn),
      tier: unknownOrText(item.tier) })),
  }, null, 2) + "\n";
}
export function exportPacket(packet: CustodyPacket, format: ExportFormat): ExportedPacket {
  const warnings = custodyFindings(packet);
  if (!packet.consentToExport) return { format, content: "", mime: "text/plain", filename: "",
    warnings, complete: false };
  const stem = `evidence-${packet.locale}`;
  const metadata = format === "csv" ? { suffix: "csv", mime: "text/csv;charset=utf-8" } :
    format === "json" ? { suffix: "json", mime: "application/json;charset=utf-8" } :
      { suffix: "txt", mime: "text/plain;charset=utf-8" };
  const content = format === "csv" ? csvPacket(packet) : format === "json" ? jsonPacket(packet) : textPacket(packet);
  return { format, content, filename: `${stem}.${metadata.suffix}`, mime: metadata.mime,
    warnings, complete: packet.records.every(evidenceComplete) && warnings.length === 0 };
}
export function sourceLineage(before: CustodyPacket, after: CustodyPacket): Finding[] {
  const result: Finding[] = [];
  const indexed = new Map(after.records.map((item) => [item.id, item]));
  for (const previous of before.records) {
    const next = indexed.get(previous.id);
    if (!next) result.push(issue("handoff-record-lost", previous.id));
    else if (evidenceKey(previous) !== evidenceKey(next)) result.push(issue("handoff-source-modified", previous.id));
    else if (known(previous.value) && !known(next.value)) result.push(issue("handoff-value-lost", previous.id));
  }
  if (before.locale !== after.locale && before.route !== after.route)
    result.push(issue("handoff-route-lost", after.route));
  return result;
}
export function exportedIntegrity(packet: CustodyPacket, exported: ExportedPacket): Finding[] {
  const result: Finding[] = [];
  if (!packet.consentToExport && exported.content.length > 0) result.push(issue("unselected-data-export", exported.format));
  if (packet.consentToExport && !exported.content) result.push(issue("empty-export", exported.format));
  if (exported.complete && packet.records.some((item) => !evidenceComplete(item)))
    result.push(issue("incomplete-called-complete", exported.format));
  if (exported.format === "json" && exported.content) {
    try {
      const parsed: unknown = JSON.parse(exported.content);
      if (typeof parsed !== "object" || parsed === null || !Array.isArray((parsed as {records?: unknown}).records))
        result.push(issue("json-export-shape", exported.filename));
    } catch { result.push(issue("json-export-invalid", exported.filename)); }
  }
  if (packet.locale === "fr" && !COPY.fr.UNKNOWN) result.push(issue("locale-UNKNOWN-missing", packet.locale));
  return result;
}
