import { issue, textOrUnknown, validDate, UNKNOWN, type AuditReceipt, type EvidenceClaim, type Finding, type JourneyEvent, type Locale } from "./p20ak-types.ts";

/** All evidence here is observed from supplied data. No local place facts are created. */
export function provenanceComplete(record: EvidenceClaim): boolean {
  const p = record.provenance;
  return textOrUnknown(p.source) !== UNKNOWN && textOrUnknown(p.licence) !== UNKNOWN &&
    validDate(p.retrievedOn) && textOrUnknown(p.tier) !== UNKNOWN;
}
export function evidenceKnown(record: EvidenceClaim): boolean {
  return record.certainty !== UNKNOWN && textOrUnknown(record.value) !== UNKNOWN &&
    textOrUnknown(record.label) !== UNKNOWN && provenanceComplete(record);
}
export function provenanceSignature(record: EvidenceClaim): string {
  const p = record.provenance;
  return JSON.stringify([record.id, p.source, p.licence, p.retrievedOn, p.tier]);
}
export function evidenceSignature(record: EvidenceClaim): string {
  return JSON.stringify([provenanceSignature(record), record.value, record.certainty]);
}
export function evidenceFindings(records: readonly EvidenceClaim[], step = 0): Finding[] {
  const findings: Finding[] = [];
  const ids = new Set<string>();
  for (const record of records) {
    const scope = `evidence/${record.id || "UNKNOWN"}`;
    if (!record.id.trim()) findings.push(issue("evidence-id-missing", scope, "Record identifier missing", step));
    if (ids.has(record.id)) findings.push(issue("evidence-id-duplicate", scope, "Record identifier repeated", step));
    ids.add(record.id);
    if (textOrUnknown(record.label) === UNKNOWN) findings.push(issue("evidence-label-unknown", scope, "Label UNKNOWN", step, "information"));
    if (textOrUnknown(record.value) === UNKNOWN && record.certainty !== UNKNOWN) findings.push(issue("evidence-claim-without-value", scope, "Claimed observed value is UNKNOWN", step));
    if (record.certainty === UNKNOWN && textOrUnknown(record.value) !== UNKNOWN) findings.push(issue("evidence-uncertain-value", scope, "Observed value cannot be asserted as a fact", step, "warning"));
    if (textOrUnknown(record.provenance.source) === UNKNOWN) findings.push(issue("source-unknown", scope, "Source UNKNOWN", step, "information"));
    if (textOrUnknown(record.provenance.licence) === UNKNOWN) findings.push(issue("licence-unknown", scope, "Licence UNKNOWN", step, "information"));
    if (!validDate(record.provenance.retrievedOn)) findings.push(issue("retrieval-date-unknown", scope, "Retrieval date UNKNOWN", step, "information"));
    if (textOrUnknown(record.provenance.tier) === UNKNOWN) findings.push(issue("tier-unknown", scope, "Evidence tier UNKNOWN", step, "information"));
  }
  return findings;
}
export function evidenceContinuity(before: readonly EvidenceClaim[], after: readonly EvidenceClaim[], preserve: boolean, step = 0): Finding[] {
  if (!preserve) return [];
  const findings: Finding[] = [];
  const next = new Map(after.map((item) => [item.id, item]));
  for (const previous of before) {
    const current = next.get(previous.id);
    if (!current) {
      findings.push(issue("evidence-lost", previous.id, "Preserving transition dropped evidence", step));
      continue;
    }
    if (provenanceSignature(previous) !== provenanceSignature(current)) {
      findings.push(issue("provenance-changed", previous.id, "Source metadata changed through a preserving transition", step));
    }
    if (previous.certainty === UNKNOWN && current.certainty !== UNKNOWN && textOrUnknown(current.value) !== UNKNOWN) {
      findings.push(issue("unknown-promoted", previous.id, "UNKNOWN cannot become a claimed observation without new evidence", step));
    }
  }
  return findings;
}
export function evidenceEventFindings(event: JourneyEvent, index: number): Finding[] {
  return evidenceContinuity(event.before.evidence, event.after.evidence, event.preserveEvidence ??
    ["language", "back", "forward", "disconnect", "reconnect", "focus", "open", "close"].includes(event.action), index);
}
export function receiptFindings(receipt: AuditReceipt): Finding[] {
  const findings: Finding[] = [];
  if (!receipt.traceId.trim()) findings.push(issue("receipt-id-empty", "receipt", "Trace identifier required"));
  if (!receipt.route.startsWith("/") || receipt.route.startsWith("//")) findings.push(issue("receipt-route", "receipt", "Invalid route"));
  if (receipt.locale !== "en" && receipt.locale !== "fr" && receipt.locale !== UNKNOWN) findings.push(issue("receipt-locale", "receipt", "Invalid language"));
  if (receipt.observedAt !== null && (!Number.isFinite(receipt.observedAt) || receipt.observedAt < 0)) findings.push(issue("receipt-time", "receipt", "Invalid timestamp"));
  if (receipt.result === "pass" && receipt.errors > 0) findings.push(issue("receipt-overclaim", "receipt", "Pass conflicts with errors"));
  if (receipt.result === "pass" && receipt.unknowns > 0) findings.push(issue("receipt-unknown-overclaim", "receipt", "Pass conflicts with UNKNOWN outcome", 0, "warning"));
  findings.push(...evidenceFindings(receipt.evidence));
  return findings;
}
export function reconcileReceipts(previous: AuditReceipt, next: AuditReceipt): Finding[] {
  const findings: Finding[] = [];
  if (previous.traceId !== next.traceId) findings.push(issue("receipt-trace-changed", "receipt", "Different trace IDs"));
  if (previous.route !== next.route) findings.push(issue("receipt-route-changed", "receipt", "Different routes"));
  findings.push(...evidenceContinuity(previous.evidence, next.evidence, true));
  if (previous.result === "fail" && next.result === "pass" && next.findings.length > 0) findings.push(issue("receipt-result-unexplained", "receipt", "Result improved without resolving findings"));
  return findings;
}
export function escapeCsv(value: string): string {
  const protectedCell = /^[\s]*[=+@-]/.test(value) ? `'${value}` : value;
  return `"${protectedCell.replaceAll('"', '""')}"`;
}
export function csvHeader(locale: Locale): readonly string[] {
  return locale === "fr"
    ? ["Identifiant", "Libellé", "Valeur", "Certitude", "Source", "Licence", "Date de consultation", "Niveau de preuve"]
    : ["Identifier", "Label", "Value", "Certainty", "Source", "Licence", "Retrieved on", "Evidence tier"];
}
export function exportEvidenceCsv(records: readonly EvidenceClaim[], locale: Locale): string {
  const rows = [csvHeader(locale).map(escapeCsv).join(",")];
  for (const record of records) {
    const p = record.provenance;
    rows.push([record.id, textOrUnknown(record.label), textOrUnknown(record.value), record.certainty,
      textOrUnknown(p.source), textOrUnknown(p.licence), validDate(p.retrievedOn) ? p.retrievedOn! : UNKNOWN,
      textOrUnknown(p.tier)].map(escapeCsv).join(","));
  }
  return `\uFEFF${rows.join("\r\n")}\r\n`;
}
export function exportEvidenceText(records: readonly EvidenceClaim[], locale: Locale): string {
  const labels = csvHeader(locale);
  const output: string[] = [];
  for (const record of records) {
    const values = [record.id, textOrUnknown(record.label), textOrUnknown(record.value), record.certainty,
      textOrUnknown(record.provenance.source), textOrUnknown(record.provenance.licence),
      validDate(record.provenance.retrievedOn) ? record.provenance.retrievedOn! : UNKNOWN,
      textOrUnknown(record.provenance.tier)];
    output.push(values.map((value, index) => `${labels[index] ?? UNKNOWN}: ${value}`).join("\n"));
  }
  return output.join("\n\n");
}
export function exportEvidenceJson(records: readonly EvidenceClaim[]): string {
  return JSON.stringify({ format: "the-app-evidence-v1", records: records.map((record) => ({
    ...record, label: textOrUnknown(record.label), value: textOrUnknown(record.value),
    provenance: { source: textOrUnknown(record.provenance.source), licence: textOrUnknown(record.provenance.licence),
      retrievedOn: validDate(record.provenance.retrievedOn) ? record.provenance.retrievedOn : UNKNOWN,
      tier: textOrUnknown(record.provenance.tier) },
  })) }, null, 2);
}
export function exportIntegrity(records: readonly EvidenceClaim[], exported: string, format: "csv" | "text" | "json", locale: Locale): Finding[] {
  const expected = format === "csv" ? exportEvidenceCsv(records, locale) : format === "text" ? exportEvidenceText(records, locale) : exportEvidenceJson(records);
  if (exported === expected) return [];
  const findings = [issue("export-content-drift", "export", "Export differs from deterministic representation")];
  if (records.some((record) => record.certainty === UNKNOWN) && !exported.includes(UNKNOWN)) {
    findings.push(issue("export-unknown-lost", "export", "UNKNOWN sentinel missing"));
  }
  for (const record of records) {
    if (textOrUnknown(record.provenance.source) !== UNKNOWN && !exported.includes(record.provenance.source!)) {
      findings.push(issue("export-source-lost", record.id, "Source omitted"));
    }
    if (validDate(record.provenance.retrievedOn) && !exported.includes(record.provenance.retrievedOn!)) {
      findings.push(issue("export-date-lost", record.id, "Retrieval date omitted"));
    }
  }
  return findings;
}
export function summarizeEvidence(records: readonly EvidenceClaim[]): { known: number; unknown: number; incomplete: number; total: number } {
  let known = 0;
  let unknown = 0;
  let incomplete = 0;
  for (const record of records) {
    if (evidenceKnown(record)) known += 1;
    else if (record.certainty === UNKNOWN) unknown += 1;
    else incomplete += 1;
  }
  return { known, unknown, incomplete, total: records.length };
}
export function compareEvidenceIds(left: readonly EvidenceClaim[], right: readonly EvidenceClaim[]): { added: string[]; removed: string[]; common: string[] } {
  const before = new Set(left.map((record) => record.id));
  const after = new Set(right.map((record) => record.id));
  return { added: [...after].filter((id) => !before.has(id)), removed: [...before].filter((id) => !after.has(id)), common: [...before].filter((id) => after.has(id)) };
}
