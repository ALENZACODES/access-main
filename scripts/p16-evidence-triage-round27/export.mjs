/** Deterministic, read-only, injection-safe publication intake exports. */
import { collectionIssues, dayOrdinal, plain, safeOfflinePath, validId } from "./contracts.mjs";
import { batchReadiness, policyOptions } from "./readiness.mjs";
import { compareSnapshots, countActions, resourceInventory } from "./changes.mjs";

export const HEADERS = Object.freeze([
  "record_id", "language", "translation_key", "kind", "access", "revision", "recorded_on",
  "source_id", "source_publisher", "source_url", "source_licence", "source_tier",
  "source_claim", "collected_on", "cache_state", "cache_path", "cache_date", "cache_bytes", "readiness",
]);

export function stripControls(value) {
  const text = typeof value === "string" ? value : value === null || value === undefined ? "" : String(value);
  let result = "";
  for (const character of text) {
    const code = character.charCodeAt(0);
    if (code < 32 || code === 127 || (code >= 128 && code <= 159)) continue;
    result += character;
  }
  return result;
}

export function csvSafeCell(value) {
  const text = stripControls(value);
  const trimmed = text.trimStart();
  return /^[=+@-]/.test(trimmed) ? `'${text}` : text;
}

export function csvQuote(value) {
  return `"${csvSafeCell(value).replaceAll('"', '""')}"`;
}

export function csvRow(fields) {
  return fields.map(csvQuote).join(",");
}

export function exportRows(records, options = {}) {
  const rules = policyOptions(options);
  const status = batchReadiness(records, rules);
  const findings = collectionIssues(records, rules);
  const rows = [];
  if (!Array.isArray(records) || findings.some((item) => item.severity === "error")) return { rows, findings, status: "HOLD" };
  const ordered = [...records].sort((a, b) => `${a.language}/${a.id}`.localeCompare(`${b.language}/${b.id}`, "en"));
  for (const record of ordered) {
    if (!plain(record) || !validId(record.id)) continue;
    const sourceList = [...record.sources].sort((a, b) => a.id.localeCompare(b.id, "en"));
    const pair = status.pairs.find((item) => item.translationKey === record.translationKey);
    for (const source of sourceList) {
      rows.push({
        record_id: record.id, language: record.language, translation_key: record.translationKey,
        kind: record.kind, access: record.access, revision: record.revision,
        recorded_on: record.recordedOn, source_id: source.id,
        source_publisher: source.publisher, source_url: source.url,
        source_licence: source.licence, source_tier: source.tier,
        source_claim: source.claim, collected_on: source.collectedOn,
        cache_state: record.cache.state, cache_path: record.cache.path ?? "",
        cache_date: record.cache.capturedOn ?? "", cache_bytes: record.cache.bytes ?? "",
        readiness: pair?.status ?? "UNKNOWN",
      });
    }
  }
  return { rows, findings, status: status.status };
}

export function exportCsv(records, options = {}) {
  const result = exportRows(records, options);
  if (result.findings.some((item) => item.severity === "error")) return { content: "", ...result };
  const lines = [csvRow(HEADERS), ...result.rows.map((record) => csvRow(HEADERS.map((key) => record[key])))];
  return { content: `${lines.join("\r\n")}\r\n`, ...result };
}

export function exportJsonLines(records, options = {}) {
  const result = exportRows(records, options);
  if (result.findings.some((item) => item.severity === "error")) return { content: "", ...result };
  return { content: result.rows.map((row) => JSON.stringify(row)).join("\n") + (result.rows.length ? "\n" : ""), ...result };
}

export function exportDecisionJson(records, options = {}) {
  const rules = policyOptions(options);
  const assessed = batchReadiness(records, rules);
  return JSON.stringify({ asOf: rules.asOf, status: assessed.status, totals: assessed.totals,
    findings: assessed.findings.map((item) => ({ code: item.code, path: item.path, severity: item.severity })),
    pairs: assessed.pairs.map((pair) => ({ key: pair.translationKey, status: pair.status, codes: pair.codes })) }, null, 2);
}

export function exportChangeCsv(before, after, options = {}) {
  const compared = compareSnapshots(before, after, options);
  const issues = collectionIssues(after, options);
  if (issues.some((item) => item.severity === "error")) return { content: "", compared };
  const headers = ["record_key", "action", "reason_codes"];
  const lines = [csvRow(headers), ...compared.changes.map((change) => csvRow([change.key, change.action, change.reasons.join("|")]))];
  return { content: `${lines.join("\r\n")}\r\n`, compared };
}

export function exportChangeJson(before, after, options = {}) {
  const compared = compareSnapshots(before, after, options);
  return JSON.stringify({ status: compared.status, counts: countActions(compared.changes),
    changes: compared.changes, findings: compared.findings }, null, 2);
}

export function exportInventory(records, options = {}) {
  const result = batchReadiness(records, options);
  const inventory = resourceInventory(records);
  const sourceIds = new Set();
  const sourceUrls = new Set();
  if (Array.isArray(records)) {
    for (const record of records) {
      if (!Array.isArray(record?.sources)) continue;
      for (const source of record.sources) {
        if (validId(source?.id)) sourceIds.add(source.id);
        if (typeof source?.url === "string") sourceUrls.add(source.url);
      }
    }
  }
  return { status: result.status, records: Array.isArray(records) ? records.length : 0,
    translationPairs: result.pairs.length, sourceIds: sourceIds.size, sourceUrls: sourceUrls.size,
    cachedPaths: inventory.count, totalBytes: inventory.bytes, cacheConflicts: inventory.conflicts.length,
    ...result.totals };
}

export function exportDateRange(records) {
  if (!Array.isArray(records)) return { first: null, last: null, count: 0 };
  const days = records.map((record) => record?.recordedOn).filter((date) => dayOrdinal(date) !== null).sort();
  return { first: days[0] ?? null, last: days.at(-1) ?? null, count: days.length };
}

export function exportAttributionSummary(records) {
  const sources = new Map();
  if (!Array.isArray(records)) return [];
  for (const record of records) {
    if (!Array.isArray(record?.sources)) continue;
    for (const source of record.sources) {
      if (!validId(source?.id)) continue;
      const prior = sources.get(source.id) ?? { id: source.id, records: 0, tier: source.tier, collectedOn: source.collectedOn };
      prior.records += 1;
      if (prior.tier !== source.tier) prior.tier = "UNKNOWN";
      if (prior.collectedOn !== source.collectedOn) prior.collectedOn = null;
      sources.set(source.id, prior);
    }
  }
  return [...sources.values()].sort((a, b) => a.id.localeCompare(b.id, "en"));
}

export function exportOfflineSummary(records) {
  const counts = { PRESENT: 0, ABSENT: 0, UNKNOWN: 0, invalid: 0, bytes: 0 };
  if (!Array.isArray(records)) return counts;
  for (const record of records) {
    const cache = record?.cache;
    if (cache?.state in counts && cache.state !== "invalid" && cache.state !== "bytes") counts[cache.state] += 1;
    else counts.invalid += 1;
    if (cache?.state === "PRESENT" && safeOfflinePath(cache.path) && Number.isSafeInteger(cache.bytes) && cache.bytes > 0) {
      counts.bytes += cache.bytes;
    }
  }
  return counts;
}

export function exportBilingualSummary(records) {
  const result = batchReadiness(records);
  return result.pairs.map((pair) => ({ translationKey: pair.translationKey, status: pair.status,
    en: Array.isArray(records) && records.some((item) => item?.translationKey === pair.translationKey && item.language === "en"),
    fr: Array.isArray(records) && records.some((item) => item?.translationKey === pair.translationKey && item.language === "fr") }));
}

export function exportDiagnosticCsv(records, options = {}) {
  const issues = collectionIssues(records, options);
  const lines = [csvRow(["code", "path", "severity"]), ...issues.map((issue) => csvRow([issue.code, issue.path, issue.severity]))];
  return `${lines.join("\r\n")}\r\n`;
}

export function publicSummary(records, options = {}) {
  const inventory = exportInventory(records, options);
  const dateRange = exportDateRange(records);
  const sourceList = exportAttributionSummary(records);
  const offline = exportOfflineSummary(records);
  return { status: inventory.status, records: inventory.records,
    pairs: inventory.translationPairs, firstDate: dateRange.first, lastDate: dateRange.last,
    sourceCount: sourceList.length, cachedCount: offline.PRESENT, unknownCacheCount: offline.UNKNOWN,
    unknownPairs: inventory.UNKNOWN, bytes: inventory.totalBytes };
}
