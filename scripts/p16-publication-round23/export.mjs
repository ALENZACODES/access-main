/**
 * Presentation-safe exports of offline readiness and evidence. Exporters do
 * not generate, translate, or upgrade underlying claims; no side effects.
 */
import {
  LANGUAGES, auditCollection, calendarOrdinal, canonicalIdentifier,
  localCachePath, plainObject, secureSourceUrl, sortDiagnostics,
} from "./contract.mjs";
import { pairedReadiness, policyOptions, readinessSummary } from "./readiness.mjs";
import { actionCounts, compareSnapshots } from "./changes.mjs";

export const HEADERS = Object.freeze([
  "record_id", "translation_key", "language", "kind", "state", "revision",
  "recorded_on", "source_id", "source_url", "publisher", "licence",
  "collected_on", "tier", "offline_state", "offline_path",
  "captured_on", "bytes", "readiness",
]);

function stripControl(value) {
  let result = "";
  for (const character of String(value)) {
    const number = character.codePointAt(0);
    if (number >= 32 && number !== 127) result += character;
  }
  return result;
}

export function spreadsheetCell(value) {
  if (value === null || value === undefined) return "";
  const clean = stripControl(value).trim();
  if (clean === "") return "";
  if (/^[=+@\-]/.test(clean) || /^[\t\r\n]/.test(String(value))) return `'${clean}`;
  return clean;
}

export function csvQuote(value) {
  const safe = spreadsheetCell(value);
  return `"${safe.replaceAll('"', '""')}"`;
}

export function csvRow(values) {
  return values.map(csvQuote).join(",");
}

export function exportRows(records, options = {}) {
  const policy = policyOptions(options);
  const audit = auditCollection(records, { asOf: policy.asOf, requireBothLanguages: true });
  if (audit.findings.length) {
    return { rows: [], findings: audit.findings, decision: "HOLD", headers: HEADERS };
  }
  const result = pairedReadiness(records, policy);
  const lookup = new Map(result.records.map((entry) => [entry.translationKey, entry.decision]));
  const rows = [];
  for (const record of [...records].sort((a, b) => a.id.localeCompare(b.id) || a.language.localeCompare(b.language))) {
    const sources = [...record.sources].sort((a, b) => a.id.localeCompare(b.id));
    for (const source of sources) {
      rows.push([
        record.id, record.translationKey, record.language, record.kind, record.state,
        record.revision, record.recordedOn, source.id, source.url, source.publisher,
        source.licence, source.collectedOn, source.tier, record.cache.state,
        record.cache.state === "PRESENT" ? record.cache.path : "",
        record.cache.state === "PRESENT" ? record.cache.capturedOn : "",
        record.cache.state === "PRESENT" ? record.cache.bytes : "",
        lookup.get(record.translationKey) ?? "UNKNOWN",
      ]);
    }
  }
  return { rows, findings: [], decision: result.decision, headers: HEADERS };
}

export function exportEvidenceCsv(records, options = {}) {
  const result = exportRows(records, options);
  if (result.findings.length) return { ...result, csv: "" };
  const csv = [csvRow(HEADERS), ...result.rows.map(csvRow)].join("\r\n") + "\r\n";
  return { ...result, csv };
}

export function exportDecisionJson(records, options = {}) {
  const policy = policyOptions(options);
  const result = pairedReadiness(records, policy);
  const data = {
    asOf: policy.asOf,
    summary: readinessSummary(result),
    diagnostics: result.findings.map(({ code, path }) => ({ code, path })),
    decisions: result.records.map(({ translationKey, decision, reasons }) => ({ translationKey, decision, reasons })),
  };
  return JSON.stringify(data, null, 2) + "\n";
}

export function exportChangeCsv(beforeRecords, afterRecords, options = {}) {
  const result = compareSnapshots(beforeRecords, afterRecords, options);
  if (result.findings.length) return { csv: "", findings: result.findings, summary: result.summary };
  const rows = result.changes.map((entry) => [entry.key, entry.action, entry.decision, entry.reasons.join(";")]);
  const csv = [csvRow(["record_key", "action", "decision", "reason_codes"]), ...rows.map(csvRow)].join("\r\n") + "\r\n";
  return { csv, findings: [], summary: result.summary };
}

export function exportInventory(records, options = {}) {
  const policy = policyOptions(options);
  const result = pairedReadiness(records, policy);
  const paths = new Set();
  const sources = new Set();
  let totalBytes = 0;
  if (Array.isArray(records)) {
    for (const record of records) {
      for (const source of record?.sources ?? []) {
        if (canonicalIdentifier(source?.id) && secureSourceUrl(source?.url)) sources.add(source.url);
      }
      const cache = record?.cache;
      if (cache?.state === "PRESENT" && localCachePath(cache.path) && !paths.has(cache.path)) {
        paths.add(cache.path);
        if (Number.isSafeInteger(cache.bytes) && cache.bytes > 0) totalBytes += cache.bytes;
      }
    }
  }
  return {
    decision: result.decision,
    records: Array.isArray(records) ? records.length : 0,
    translationPairs: result.records.length,
    sourceUrls: sources.size,
    cachedPaths: paths.size,
    totalBytes,
    latestDate: policy.asOf,
    diagnostics: result.findings.length,
  };
}

export function exportBilingualStatus(records, options = {}) {
  const policy = policyOptions(options);
  const result = pairedReadiness(records, policy);
  const byTranslation = new Map();
  if (Array.isArray(records)) {
    for (const record of records) {
      if (!plainObject(record) || !canonicalIdentifier(record.translationKey)) continue;
      const found = byTranslation.get(record.translationKey) ?? new Set();
      if (LANGUAGES.includes(record.language)) found.add(record.language);
      byTranslation.set(record.translationKey, found);
    }
  }
  return result.records.map((item) => ({
    translationKey: item.translationKey,
    decision: item.decision,
    en: byTranslation.get(item.translationKey)?.has("en") ?? false,
    fr: byTranslation.get(item.translationKey)?.has("fr") ?? false,
    reasons: item.reasons,
  }));
}

export function exportAuditSummary(records, options = {}) {
  const result = exportRows(records, options);
  const issues = sortDiagnostics(result.findings);
  const byCode = new Map();
  for (const issue of issues) byCode.set(issue.code, (byCode.get(issue.code) ?? 0) + 1);
  return {
    decision: result.decision,
    rows: result.rows.length,
    errorCount: issues.length,
    errors: [...byCode].sort(([a], [b]) => a.localeCompare(b)).map(([code, count]) => ({ code, count })),
  };
}

export function safeJsonLines(records, options = {}) {
  const result = exportRows(records, options);
  if (result.findings.length) return { content: "", findings: result.findings };
  const lines = result.rows.map((row) => {
    const record = Object.fromEntries(HEADERS.map((name, index) => [name, row[index]]));
    return JSON.stringify(record);
  });
  return { content: lines.length ? `${lines.join("\n")}\n` : "", findings: [] };
}

export function publishedDateRange(records) {
  const days = [];
  if (!Array.isArray(records)) return { first: null, last: null, count: 0 };
  for (const record of records) {
    const ordinal = calendarOrdinal(record?.recordedOn);
    if (ordinal !== null) days.push({ date: record.recordedOn, ordinal });
  }
  days.sort((a, b) => a.ordinal - b.ordinal);
  return { first: days[0]?.date ?? null, last: days[days.length - 1]?.date ?? null, count: days.length };
}

export function publicSummary(records, options = {}) {
  const inventory = exportInventory(records, options);
  return {
    status: inventory.decision,
    recordCount: inventory.records,
    bilingualPairs: inventory.translationPairs,
    cachedResources: inventory.cachedPaths,
    evidenceSources: inventory.sourceUrls,
    diagnosticCount: inventory.diagnostics,
  };
}
