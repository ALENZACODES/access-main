import { LOCALES, auditCollection, object, policy } from "./core.mjs";
import { assessPacket, publicationCounts } from "./readiness.mjs";
import { exportPlanRows, operationCounts } from "./changes.mjs";

export const HEADERS = Object.freeze([
  "record_id", "locale", "title", "summary", "access_state", "evidence_tier",
  "source_id", "source_publisher", "source_url", "source_licence", "source_collected_on",
  "reviewed_on", "cache_state", "cache_path", "cache_saved_on", "revision", "publication_status",
]);

/** Formula-safe spreadsheet cell. Quoting is applied after shielding. */
/** @param {unknown} value */
export function csvCell(value) {
  if (value === null || value === undefined) return "";
  const str = String(value).normalize("NFC");
  const dangerous = /^[\s]*[=+@-]/.test(str);
  const safe = dangerous ? `'${str}` : str;
  return `"${safe.replaceAll('"', '""')}"`;
}

/** @param {readonly unknown[]} row */
export function csvLine(row) {
  return row.map(csvCell).join(",");
}

/** Stable public shape: no unpublished metadata or untrusted object traversal. */
/** @param {any} record @param {string} status */
export function publicRows(record, status) {
  if (!object(record)) return [];
  return LOCALES.map((locale) => ({
    record_id: record.id,
    locale,
    title: record.title?.[locale] ?? "",
    summary: record.summary?.[locale] ?? "",
    access_state: record.access ?? "unknown",
    evidence_tier: record.tier ?? "unknown",
    source_id: record.source?.id ?? "",
    source_publisher: record.source?.publisher ?? "",
    source_url: record.source?.url ?? "",
    source_licence: record.source?.licence ?? "",
    source_collected_on: record.source?.collectedOn ?? "",
    reviewed_on: record.reviewedOn ?? "",
    cache_state: record.cache?.state ?? "unknown",
    cache_path: record.cache?.state === "stored" ? record.cache.path : "",
    cache_saved_on: record.cache?.state === "stored" ? record.cache.savedOn : "",
    revision: record.revision ?? "",
    publication_status: status,
  }));
}

/**
 * Refuse to include failed records. Findings contain only structural paths.
 * An empty successful export still includes column headers.
 */
/** @param {unknown} input @param {unknown} [options] */
export function buildPublicationExport(input, options = {}) {
  const rules = policy(options);
  const audit = auditCollection(input, options);
  const readiness = assessPacket(input, options);
  const unsafe = audit.findings.some((item) => item.severity === "error");
  const records = unsafe ? [] : audit.records;
  const rows = records.flatMap((record, index) => publicRows(record, readiness.decisions[index]?.status ?? "UNKNOWN"));
  const findings = [...audit.findings, ...readiness.findings].sort((a, b) =>
    a.path.localeCompare(b.path, "en") || a.code.localeCompare(b.code, "en"));
  return {
    status: unsafe ? "HOLD" : readiness.status,
    asOf: rules.asOf,
    fields: [...HEADERS],
    rows,
    findings: findings.map((item) => ({ code: item.code, path: item.path, severity: item.severity })),
  };
}

/** @param {ReturnType<typeof buildPublicationExport>} packet */
export function publicationCsv(packet) {
  const lines = [csvLine(HEADERS)];
  for (const row of packet.rows) lines.push(csvLine(HEADERS.map((field) => row[field] ?? "")));
  return `${lines.join("\r\n")}\r\n`;
}

/** JSONL is stable and contains no implicit timestamp. */
/** @param {ReturnType<typeof buildPublicationExport>} packet */
export function publicationJsonl(packet) {
  return packet.rows.map((row) => JSON.stringify(row)).join("\n") + (packet.rows.length ? "\n" : "");
}

/** @param {ReturnType<typeof buildPublicationExport>} packet */
export function publicationJson(packet) {
  return JSON.stringify({ status: packet.status, asOf: packet.asOf, rows: packet.rows }, null, 2) + "\n";
}

/** @param {ReturnType<typeof buildPublicationExport>} packet */
export function exportManifest(packet) {
  return {
    status: packet.status,
    asOf: packet.asOf,
    localeCount: LOCALES.length,
    recordCount: packet.rows.length / LOCALES.length,
    rowCount: packet.rows.length,
    findingCount: packet.findings.length,
    formats: ["csv", "json", "jsonl"],
    noNetworkRequired: true,
  };
}

/** Safe text report for audits. It never includes record titles or URLs. */
/** @param {ReturnType<typeof buildPublicationExport>} packet */
export function exportDiagnosticText(packet) {
  const lines = [`status=${packet.status}`, `asOf=${packet.asOf}`, `rows=${packet.rows.length}`];
  for (const finding of packet.findings) lines.push(`${finding.severity}:${finding.code}:${finding.path}`);
  return lines.join("\n") + "\n";
}

/** @param {ReturnType<typeof buildPublicationExport>} packet */
export function exportLanguageStats(packet) {
  const result = { en: 0, fr: 0 };
  for (const row of packet.rows) {
    if (row.locale === "en" || row.locale === "fr") result[row.locale] += 1;
  }
  return result;
}

/** @param {ReturnType<typeof buildPublicationExport>} packet */
export function exportStatusStats(packet) {
  const result = { READY: 0, HOLD: 0, UNKNOWN: 0 };
  for (const row of packet.rows) {
    if (Object.hasOwn(result, row.publication_status)) result[row.publication_status] += 1;
  }
  return result;
}

/** @param {ReturnType<typeof buildPublicationExport>} packet */
export function exportSizeEstimate(packet) {
  const csv = publicationCsv(packet);
  const json = publicationJson(packet);
  const jsonl = publicationJsonl(packet);
  return { csv: new TextEncoder().encode(csv).length, json: new TextEncoder().encode(json).length, jsonl: new TextEncoder().encode(jsonl).length };
}

/** @param {ReturnType<typeof import('./changes.mjs').planSnapshotTransition>} plan */
export function planCsv(plan) {
  const fields = ["action", "record_id", "previous_revision", "next_revision", "reason_code", "cache_path"];
  const lines = [csvLine(fields)];
  for (const row of exportPlanRows(plan)) lines.push(csvLine(fields.map((key) => row[key] ?? "")));
  return lines.join("\r\n") + "\r\n";
}

/** @param {ReturnType<typeof import('./changes.mjs').planSnapshotTransition>} plan */
export function planReport(plan) {
  return { status: plan.status, counts: operationCounts(plan), findings: plan.findings.map((f) => ({ code: f.code, path: f.path })) };
}

/** @param {unknown} input @param {unknown} [options] */
export function overview(input, options = {}) {
  const summary = publicationCounts(input, options);
  const packet = buildPublicationExport(input, options);
  return { status: packet.status, summary, manifest: exportManifest(packet), languages: exportLanguageStats(packet) };
}
