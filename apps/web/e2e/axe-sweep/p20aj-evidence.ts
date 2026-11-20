import { finding, type Evidence, type ExportPacket, type Finding, type Provenance } from "./p20aj-types.ts";

const UNKNOWN_WORDS = new Set(["", "unknown", "inconnu", "inconnue", "n/a", "—", "-", "null", "undefined"]);
/** Missing input is a sentinel, not a negative observation. */
export function normalizeValue(value: string | null | undefined): string {
  if (value === null || value === undefined) return "UNKNOWN";
  const normalized = value.trim().replace(/\s+/g, " ");
  return UNKNOWN_WORDS.has(normalized.toLocaleLowerCase("en")) ? "UNKNOWN" : normalized;
}
export function validCalendarDate(value: string | null): boolean {
  if (value === null || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parts = value.split("-").map(Number);
  const year = parts[0];
  const month = parts[1];
  const day = parts[2];
  if (year === undefined || month === undefined || day === undefined || year < 1 || month < 1 || day < 1) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() + 1 === month && date.getUTCDate() === day;
}
export function provenanceKnown(provenance: Provenance): boolean {
  return normalizeValue(provenance.source) !== "UNKNOWN" &&
    normalizeValue(provenance.licence) !== "UNKNOWN" &&
    normalizeValue(provenance.tier) !== "UNKNOWN" && validCalendarDate(provenance.retrievedOn);
}
export function evidenceKnown(evidence: Evidence): boolean {
  return !evidence.recordedUnknown && normalizeValue(evidence.value) !== "UNKNOWN" &&
    normalizeValue(evidence.label) !== "UNKNOWN" && provenanceKnown(evidence.provenance);
}
export function provenanceKey(evidence: Evidence): string {
  return JSON.stringify([evidence.id, normalizeValue(evidence.provenance.source),
    normalizeValue(evidence.provenance.licence), normalizeValue(evidence.provenance.retrievedOn),
    normalizeValue(evidence.provenance.tier)]);
}
export function evidenceFindings(records: readonly Evidence[], step: number): Finding[] {
  const problems: Finding[] = [];
  const ids = new Set<string>();
  for (const record of records) {
    const id = record.id.trim();
    if (!id) problems.push(finding("id-empty", "evidence", step, "Record is missing its ID"));
    if (ids.has(id)) problems.push(finding("id-duplicate", "evidence", step, id));
    ids.add(id);
    if (normalizeValue(record.label) === "UNKNOWN") problems.push(finding("label-unknown", "evidence", step, id, "information"));
    if (normalizeValue(record.provenance.source) === "UNKNOWN") problems.push(finding("source-unknown", "evidence", step, id, "information"));
    if (normalizeValue(record.provenance.licence) === "UNKNOWN") problems.push(finding("licence-unknown", "evidence", step, id, "information"));
    if (!validCalendarDate(record.provenance.retrievedOn)) problems.push(finding("date-unknown", "evidence", step, id, "information"));
    if (normalizeValue(record.provenance.tier) === "UNKNOWN") problems.push(finding("tier-unknown", "evidence", step, id, "information"));
    if (record.recordedUnknown && normalizeValue(record.value) !== "UNKNOWN") {
      problems.push(finding("unknown-promoted", "evidence", step, id));
    }
    if (!record.recordedUnknown && normalizeValue(record.value) === "UNKNOWN") {
      problems.push(finding("unsupported-known", "evidence", step, id));
    }
    if (record.value && record.value.length > 2000) problems.push(finding("value-oversized", "evidence", step, id));
  }
  return problems;
}
export function evidenceContinuity(before: readonly Evidence[], after: readonly Evidence[], step: number, preserve: boolean): Finding[] {
  if (!preserve) return [];
  const problems: Finding[] = [];
  const next = new Map(after.map((record) => [record.id, record]));
  for (const record of before) {
    const equivalent = next.get(record.id);
    if (!equivalent) {
      problems.push(finding("record-lost", "evidence", step, record.id));
      continue;
    }
    if (provenanceKey(record) !== provenanceKey(equivalent)) {
      problems.push(finding("provenance-drift", "evidence", step, record.id));
    }
    if (record.recordedUnknown !== equivalent.recordedUnknown) {
      problems.push(finding("certainty-drift", "evidence", step, record.id));
    }
    if (normalizeValue(record.value) !== normalizeValue(equivalent.value)) {
      problems.push(finding("value-drift", "evidence", step, record.id));
    }
  }
  return problems;
}
export function packetFindings(packet: ExportPacket, step: number): Finding[] {
  const problems = evidenceFindings(packet.records, step);
  if (!packet.title.trim()) problems.push(finding("packet-title", "evidence", step, "Export is unnamed"));
  if (packet.createdOn !== null && !validCalendarDate(packet.createdOn)) {
    problems.push(finding("packet-date", "evidence", step, normalizeValue(packet.createdOn)));
  }
  if (!["csv", "json", "text"].includes(packet.format)) {
    problems.push(finding("packet-format", "evidence", step, String(packet.format)));
  }
  return problems;
}
export function safeCsvCell(value: string): string {
  // Spreadsheet formula characters must be inert after opening in a spreadsheet.
  const text = value.replace(/\r\n?/g, "\n").replaceAll(String.fromCharCode(0), "");
  const safe = /^[\s]*[=+@-]/.test(text) ? `'${text}` : text;
  return `"${safe.replaceAll('"', '""')}"`;
}
export function exportCsv(packet: ExportPacket): string {
  const headings = packet.locale === "fr"
    ? ["Identifiant", "Nom", "Valeur", "Source", "Licence", "Consulté le", "Niveau"]
    : ["Identifier", "Name", "Value", "Source", "Licence", "Retrieved on", "Tier"];
  const rows = packet.records.map((record) => [record.id, normalizeValue(record.label),
    normalizeValue(record.value), normalizeValue(record.provenance.source),
    normalizeValue(record.provenance.licence), normalizeValue(record.provenance.retrievedOn),
    normalizeValue(record.provenance.tier)]);
  return "\ufeff" + [headings, ...rows].map((values) => values.map(safeCsvCell).join(",")).join("\r\n") + "\r\n";
}
export function exportText(packet: ExportPacket): string {
  const headings = packet.locale === "fr" ? {
    name: "Nom", value: "Valeur", source: "Source", licence: "Licence",
    date: "Consulté le", tier: "Niveau",
  } : { name: "Name", value: "Value", source: "Source", licence: "Licence", date: "Retrieved on", tier: "Tier" };
  const lines = [packet.title, ""];
  for (const record of packet.records) {
    lines.push(record.id);
    lines.push(`${headings.name}: ${normalizeValue(record.label)}`);
    lines.push(`${headings.value}: ${normalizeValue(record.value)}`);
    lines.push(`${headings.source}: ${normalizeValue(record.provenance.source)}`);
    lines.push(`${headings.licence}: ${normalizeValue(record.provenance.licence)}`);
    lines.push(`${headings.date}: ${normalizeValue(record.provenance.retrievedOn)}`);
    lines.push(`${headings.tier}: ${normalizeValue(record.provenance.tier)}`);
    lines.push("");
  }
  return lines.join("\n");
}
export function exportJson(packet: ExportPacket): string {
  return JSON.stringify({ version: 1, locale: packet.locale, title: packet.title,
    createdOn: normalizeValue(packet.createdOn), records: packet.records.map((record) => ({
      id: record.id, label: normalizeValue(record.label), value: normalizeValue(record.value),
      recordedUnknown: record.recordedUnknown, provenance: {
        source: normalizeValue(record.provenance.source), licence: normalizeValue(record.provenance.licence),
        retrievedOn: normalizeValue(record.provenance.retrievedOn), tier: normalizeValue(record.provenance.tier),
      },
    })) }, null, 2);
}
export function serializePacket(packet: ExportPacket): string {
  if (packet.format === "csv") return exportCsv(packet);
  if (packet.format === "json") return exportJson(packet);
  return exportText(packet);
}
export function packetRoundTrip(packet: ExportPacket): Finding[] {
  const problems = packetFindings(packet, 0);
  if (packet.format === "json") {
    const parsed = JSON.parse(exportJson(packet)) as { records: Array<{ id: string; recordedUnknown: boolean; provenance: Provenance }> };
    for (let index = 0; index < packet.records.length; index += 1) {
      const before = packet.records[index];
      const after = parsed.records[index];
      if (!before || !after || before.id !== after.id || before.recordedUnknown !== after.recordedUnknown) {
        problems.push(finding("roundtrip-record", "evidence", 0, String(index)));
        continue;
      }
      if (provenanceKey(before) !== provenanceKey({ ...before, provenance: after.provenance })) {
        problems.push(finding("roundtrip-source", "evidence", 0, before.id));
      }
    }
  }
  return problems;
}
