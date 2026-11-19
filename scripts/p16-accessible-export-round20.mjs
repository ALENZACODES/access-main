/**
 * P16: a read-only, reproducible export of accessibility evidence records.
 * No fetching, disk writes, user content interpolation into markup, or tier inference.
 * Record input is untrusted. Invalid records are reported by stable field paths.
 */

export const EXPORT_LANGUAGES = Object.freeze(["en", "fr"]);
export const EXPORT_TIERS = Object.freeze(["primary", "secondary", "community", "unknown"]);
export const EXPORT_STATES = Object.freeze(["available", "unavailable", "unknown"]);
export const EXPORT_OFFLINE = Object.freeze(["cached", "not-cached", "unknown"]);
export const EXPORT_FIELDS = Object.freeze([
  "record_id", "language", "title", "summary", "state", "tier",
  "source_name", "source_url", "source_licence", "collected_on",
  "offline_state", "offline_path", "reviewed_on",
]);

const MAX_RECORDS = 20000;
const MAX_TITLE = 220;
const MAX_SUMMARY = 2500;
const MAX_ATTRIBUTION = 280;
const MAX_PATH = 1024;
const IDENTIFIER = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const ALLOWED_SOURCE_SCHEMES = new Set(["https:"]);

function object(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** A code-unit scan avoids control-code regular expressions. */
export function hasUnsafeCodeUnit(value) {
  if (typeof value !== "string") return true;
  for (let i = 0; i < value.length; i += 1) {
    const point = value.charCodeAt(i);
    if (point <= 31 || point === 127 || (point >= 128 && point <= 159)) return true;
  }
  return false;
}

/** Return null for invalid text; never coerce an object to user copy. */
export function textField(value, limit) {
  if (typeof value !== "string" || value.length > limit || hasUnsafeCodeUnit(value)) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed.normalize("NFC") : null;
}

export function validDate(value) {
  if (typeof value !== "string") return false;
  const parts = DATE.exec(value);
  if (!parts) return false;
  const year = Number(parts[1]);
  const month = Number(parts[2]);
  const day = Number(parts[3]);
  if (year < 1970 || year > 9999 || month < 1 || month > 12 || day < 1 || day > 31) return false;
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() + 1 === month && parsed.getUTCDate() === day;
}

export function safeSourceUrl(value) {
  if (typeof value !== "string" || value.length > 2048 || value.trim() !== value || hasUnsafeCodeUnit(value) || value.includes(" ")) return false;
  try {
    const url = new URL(value);
    if (!ALLOWED_SOURCE_SCHEMES.has(url.protocol) || !url.hostname) return false;
    if (url.username || url.password || url.hash) return false;
    if (url.hostname === "localhost" || url.hostname.endsWith(".localhost")) return false;
    if (/^(?:127(?:\.\d+){3}|0\.0\.0\.0|\[::1\])$/.test(url.hostname)) return false;
    return true;
  } catch {
    return false;
  }
}

/** Paths must remain inside a declared app cache prefix. */
export function safeAppPath(value, prefixes = ["/offline", "/cache/records"]) {
  if (typeof value !== "string" || value.length > MAX_PATH || hasUnsafeCodeUnit(value)) return false;
  if (!value.startsWith("/") || value.startsWith("//")) return false;
  if (value.includes("\\") || value.includes("?") || value.includes("#") || value.includes("%")) return false;
  const pieces = value.split("/").slice(1);
  if (pieces.some((piece) => !piece || piece === "." || piece === "..")) return false;
  return prefixes.some((prefix) => value.startsWith(`${prefix}/`) && value.length > prefix.length + 1);
}

function diagnostic(code, path) {
  return { code, path };
}

/**
 * Input schema: id, language, title, summary, state, tier, reviewedOn,
 * source {name,url,licence,collectedOn}, offline {state,path?}.
 * Every emitted row is an independent snapshot of a single language.
 */
export function inspectExportRecord(input, index, options = {}) {
  const prefix = `records[${index}]`;
  const findings = [];
  if (!object(input)) {
    return { row: null, findings: [diagnostic("record.object", prefix)] };
  }
  const id = textField(input.id, 128);
  if (id === null || !IDENTIFIER.test(id)) findings.push(diagnostic("record.id", `${prefix}.id`));
  const language = input.language;
  if (!EXPORT_LANGUAGES.includes(language)) findings.push(diagnostic("record.language", `${prefix}.language`));
  const title = textField(input.title, MAX_TITLE);
  if (title === null) findings.push(diagnostic("record.title", `${prefix}.title`));
  const summary = textField(input.summary, MAX_SUMMARY);
  if (summary === null) findings.push(diagnostic("record.summary", `${prefix}.summary`));
  if (!EXPORT_STATES.includes(input.state)) findings.push(diagnostic("record.state", `${prefix}.state`));
  if (!EXPORT_TIERS.includes(input.tier)) findings.push(diagnostic("record.tier", `${prefix}.tier`));
  if (input.state === "unknown" && input.tier !== "unknown") findings.push(diagnostic("record.unknown-tier", `${prefix}.tier`));
  if (!validDate(input.reviewedOn)) findings.push(diagnostic("record.reviewed-on", `${prefix}.reviewedOn`));
  const source = object(input.source) ? input.source : null;
  if (!source) findings.push(diagnostic("source.object", `${prefix}.source`));
  const name = source ? textField(source.name, MAX_ATTRIBUTION) : null;
  const licence = source ? textField(source.licence, MAX_ATTRIBUTION) : null;
  const sourceUrl = source?.url;
  const collectedOn = source?.collectedOn;
  if (source) {
    if (name === null) findings.push(diagnostic("source.name", `${prefix}.source.name`));
    if (licence === null) findings.push(diagnostic("source.licence", `${prefix}.source.licence`));
    if (!safeSourceUrl(sourceUrl)) findings.push(diagnostic("source.url", `${prefix}.source.url`));
    if (!validDate(collectedOn)) findings.push(diagnostic("source.collected-on", `${prefix}.source.collectedOn`));
    if (validDate(collectedOn) && validDate(input.reviewedOn) && input.reviewedOn < collectedOn) {
      findings.push(diagnostic("source.review-order", `${prefix}.reviewedOn`));
    }
  }
  const offline = object(input.offline) ? input.offline : null;
  if (!offline) findings.push(diagnostic("offline.object", `${prefix}.offline`));
  if (offline) {
    if (!EXPORT_OFFLINE.includes(offline.state)) findings.push(diagnostic("offline.state", `${prefix}.offline.state`));
    if (offline.state === "cached") {
      if (!safeAppPath(offline.path, options.prefixes)) findings.push(diagnostic("offline.path", `${prefix}.offline.path`));
    } else if (offline.path !== undefined && offline.path !== null) {
      findings.push(diagnostic("offline.unexpected-path", `${prefix}.offline.path`));
    }
  }
  if (findings.length > 0) return { row: null, findings };
  return {
    row: {
      record_id: id, language, title, summary, state: input.state, tier: input.tier,
      source_name: name, source_url: sourceUrl, source_licence: licence,
      collected_on: collectedOn, offline_state: offline.state,
      offline_path: offline.state === "cached" ? offline.path : "", reviewed_on: input.reviewedOn,
    },
    findings,
  };
}

/** Never mutate input, and never place data values inside finding paths. */
export function prepareEvidenceExport(records, options = {}) {
  if (!Array.isArray(records)) return { rows: [], findings: [diagnostic("set.array", "records")], counts: { accepted: 0, rejected: 0 } };
  if (records.length > MAX_RECORDS) return { rows: [], findings: [diagnostic("set.capacity", "records")], counts: { accepted: 0, rejected: records.length } };
  const findings = [];
  const rows = [];
  const idLanguages = new Set();
  const pairLanguages = new Map();
  const cacheOwners = new Map();
  let rejected = 0;
  for (const [index, input] of records.entries()) {
    const result = inspectExportRecord(input, index, options);
    findings.push(...result.findings);
    if (!result.row) { rejected += 1; continue; }
    const row = result.row;
    const idLanguage = JSON.stringify([row.record_id, row.language]);
    if (idLanguages.has(idLanguage)) {
      findings.push(diagnostic("set.duplicate", `records[${index}].id`));
      rejected += 1;
      continue;
    }
    idLanguages.add(idLanguage);
    if (row.offline_state === "cached") {
      const priorOwner = cacheOwners.get(row.offline_path);
      if (priorOwner && priorOwner !== row.record_id) {
        findings.push(diagnostic("set.cache-conflict", `records[${index}].offline.path`));
        rejected += 1;
        continue;
      }
      cacheOwners.set(row.offline_path, row.record_id);
    }
    const pair = pairLanguages.get(row.record_id) ?? new Set();
    pair.add(row.language);
    pairLanguages.set(row.record_id, pair);
    rows.push(row);
  }
  if (options.requireBothLanguages === true) {
    for (const [recordId, languages] of pairLanguages.entries()) {
      for (const language of EXPORT_LANGUAGES) {
        if (!languages.has(language)) {
          const rowIndex = rows.findIndex((row) => row.record_id === recordId);
          findings.push(diagnostic("set.missing-language", `accepted[${rowIndex}].language.${language}`));
        }
      }
    }
  }
  rows.sort((a, b) => a.record_id.localeCompare(b.record_id, "en") || a.language.localeCompare(b.language, "en"));
  findings.sort((a, b) => a.path.localeCompare(b.path, "en") || a.code.localeCompare(b.code, "en"));
  return { rows, findings, counts: { accepted: rows.length, rejected } };
}

/** Guard against spreadsheet formula evaluation even for quoted fields. */
export function safeCsvCell(value) {
  const original = String(value ?? "");
  const trimmedStart = original.trimStart();
  const guarded = /^[=+@-]/.test(trimmedStart) ? `'${original}` : original;
  return `"${guarded.replaceAll('"', '""')}"`;
}

/** No row data is exported unless all required record fields passed. */
export function evidenceCsv(result, options = {}) {
  if (!object(result) || !Array.isArray(result.rows) || !Array.isArray(result.findings)) {
    throw new TypeError("Expected an evidence export result");
  }
  if (options.requireClean === true && result.findings.length > 0) {
    throw new Error("Evidence export has outstanding diagnostics");
  }
  const lines = [EXPORT_FIELDS.map(safeCsvCell).join(",")];
  for (const row of result.rows) {
    if (!object(row) || EXPORT_FIELDS.some((field) => typeof row[field] !== "string")) {
      throw new TypeError("Evidence export contains a malformed row");
    }
    lines.push(EXPORT_FIELDS.map((field) => safeCsvCell(row[field])).join(","));
  }
  return `${lines.join("\r\n")}\r\n`;
}

/** Stable count-only output, no free-form record copy. */
export function summarizeExport(result) {
  if (!object(result) || !Array.isArray(result.findings)) throw new TypeError("Expected export diagnostics");
  const byCode = Object.create(null);
  for (const entry of result.findings) {
    if (typeof entry?.code !== "string") throw new TypeError("Invalid diagnostic code");
    byCode[entry.code] = (byCode[entry.code] ?? 0) + 1;
  }
  return Object.entries(byCode).sort(([a], [b]) => a.localeCompare(b, "en"))
    .map(([code, count]) => ({ code, count }));
}
