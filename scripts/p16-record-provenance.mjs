/**
 * P16: deterministic, dependency-free audits for accessible information cards.
 *
 * Input is untrusted content. The module never fetches, persists, translates,
 * ranks, or upgrades a record. It returns a stable list of actionable codes.
 */

export const SUPPORTED_LOCALES = Object.freeze(["en", "fr"]);
export const RECORD_TIERS = Object.freeze(["primary", "secondary", "community", "unknown"]);
export const RECORD_STATES = Object.freeze(["available", "unavailable", "unknown"]);
export const OFFLINE_STATES = Object.freeze(["cached", "not-cached", "unknown"]);

const ID = /^[a-z0-9][a-z0-9._:-]{0,127}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const CONTROL = /[\u0000-\u001f\u007f]/u;
const MAX_TITLE = 200;
const MAX_DESCRIPTION = 2000;
const MAX_SOURCE_NAME = 160;
const MAX_LICENCE = 160;

/** @param {unknown} input */
function isPlainObject(input) {
  if (input === null || typeof input !== "object" || Array.isArray(input)) return false;
  const prototype = Object.getPrototypeOf(input);
  return prototype === Object.prototype || prototype === null;
}

/** @param {unknown} value */
function isNonemptyString(value) {
  return typeof value === "string" && value.trim().length > 0 && !CONTROL.test(value);
}

/** @param {unknown} value @param {number} max */
function isBoundedString(value, max) {
  return isNonemptyString(value) && value.trim().length <= max;
}

/** @param {unknown} date */
export function isCalendarDate(date) {
  if (typeof date !== "string" || !DATE.test(date)) return false;
  const [year, month, day] = date.split("-").map(Number);
  if (year === undefined || month === undefined || day === undefined) return false;
  const actual = new Date(Date.UTC(year, month - 1, day));
  return actual.getUTCFullYear() === year && actual.getUTCMonth() === month - 1 && actual.getUTCDate() === day;
}

/** @param {unknown} raw */
export function isSecureSourceUrl(raw) {
  if (typeof raw !== "string" || raw.length > 2048 || CONTROL.test(raw)) return false;
  try {
    const url = new URL(raw);
    return url.protocol === "https:" && Boolean(url.hostname) && !url.username && !url.password;
  } catch {
    return false;
  }
}

/**
 * Cache keys must be absolute same-app paths, not external URLs or traversal.
 * @param {unknown} raw
 */
export function isSafeCacheKey(raw) {
  if (typeof raw !== "string" || raw.length > 1024) return false;
  if (!raw.startsWith("/") || raw.startsWith("//") || CONTROL.test(raw) || raw.includes("\\")) return false;
  if (raw.includes("?") || raw.includes("#") || raw.includes("%")) return false;
  return !raw.split("/").some((part) => part === "." || part === "..");
}

/**
 * Locale-independent path of an issue (no copy is read or rewritten).
 * @typedef {{code: string, path: string, recordId: string | null}} RecordFinding
 * @param {RecordFinding[]} findings
 * @param {string} code
 * @param {string} path
 * @param {string | null} recordId
 */
function issue(findings, code, path, recordId) {
  findings.push({ code, path, recordId });
}

/**
 * A complete card has a stable id, a language, accessible title/description,
 * source and licence attribution, collection date, reliability tier, and
 * offline availability. A missing value is not silently inferred.
 *
 * @param {unknown} record
 * @param {string} [path]
 * @returns {RecordFinding[]}
 */
export function auditRecord(record, path = "record") {
  /** @type {RecordFinding[]} */
  const findings = [];
  if (!isPlainObject(record)) {
    issue(findings, "record.object", path, null);
    return findings;
  }
  const id = typeof record.id === "string" && ID.test(record.id) ? record.id : null;
  if (!id) issue(findings, "record.id", `${path}.id`, null);
  if (!SUPPORTED_LOCALES.includes(record.locale)) issue(findings, "record.locale", `${path}.locale`, id);
  if (!isBoundedString(record.title, MAX_TITLE)) issue(findings, "record.title", `${path}.title`, id);
  if (!isBoundedString(record.description, MAX_DESCRIPTION)) issue(findings, "record.description", `${path}.description`, id);
  if (!RECORD_TIERS.includes(record.tier)) issue(findings, "record.tier", `${path}.tier`, id);
  if (!RECORD_STATES.includes(record.state)) issue(findings, "record.state", `${path}.state`, id);
  if (record.state === "unknown" && record.tier !== "unknown") {
    issue(findings, "record.unknown-tier", `${path}.tier`, id);
  }

  if (!isPlainObject(record.source)) {
    issue(findings, "source.object", `${path}.source`, id);
  } else {
    if (!isBoundedString(record.source.name, MAX_SOURCE_NAME)) issue(findings, "source.name", `${path}.source.name`, id);
    if (!isSecureSourceUrl(record.source.url)) issue(findings, "source.url", `${path}.source.url`, id);
    if (!isBoundedString(record.source.licence, MAX_LICENCE)) issue(findings, "source.licence", `${path}.source.licence`, id);
    if (!isCalendarDate(record.source.collectedOn)) issue(findings, "source.collected-on", `${path}.source.collectedOn`, id);
    if (record.source.lastReviewedOn !== undefined && !isCalendarDate(record.source.lastReviewedOn)) {
      issue(findings, "source.last-reviewed-on", `${path}.source.lastReviewedOn`, id);
    }
    if (isCalendarDate(record.source.collectedOn) && isCalendarDate(record.source.lastReviewedOn) &&
      record.source.lastReviewedOn < record.source.collectedOn) {
      issue(findings, "source.review-before-collection", `${path}.source.lastReviewedOn`, id);
    }
  }

  if (!isPlainObject(record.offline)) {
    issue(findings, "offline.object", `${path}.offline`, id);
  } else {
    if (!OFFLINE_STATES.includes(record.offline.state)) issue(findings, "offline.state", `${path}.offline.state`, id);
    if (record.offline.state === "cached") {
      if (!isSafeCacheKey(record.offline.key)) issue(findings, "offline.cache-key", `${path}.offline.key`, id);
    } else if (record.offline.key !== undefined && record.offline.key !== null) {
      issue(findings, "offline.unexpected-key", `${path}.offline.key`, id);
    }
  }
  return findings;
}

/**
 * Audits a collection without rewriting its data. Translation grouping is
 * explicit, so an absent counterpart is a finding rather than a fallback.
 * @param {unknown} input
 * @param {{requireBothLocales?: boolean}} [options]
 * @returns {RecordFinding[]}
 */
export function auditRecordSet(input, options = {}) {
  /** @type {RecordFinding[]} */
  const findings = [];
  if (!Array.isArray(input)) {
    issue(findings, "set.array", "records", null);
    return findings;
  }
  const seen = new Set();
  /** @type {Map<string, Set<string>>} */
  const translations = new Map();
  input.forEach((record, index) => {
    findings.push(...auditRecord(record, `records[${index}]`));
    if (!isPlainObject(record)) return;
    const { id, locale, translationKey } = record;
    if (typeof id === "string" && ID.test(id) && SUPPORTED_LOCALES.includes(locale)) {
      const pair = `${locale}\u0000${id}`;
      if (seen.has(pair)) issue(findings, "set.duplicate-id", `records[${index}].id`, id);
      seen.add(pair);
    }
    if (options.requireBothLocales) {
      if (typeof translationKey !== "string" || !ID.test(translationKey)) {
        issue(findings, "set.translation-key", `records[${index}].translationKey`, typeof id === "string" ? id : null);
      } else if (SUPPORTED_LOCALES.includes(locale)) {
        const locales = translations.get(translationKey) ?? new Set();
        if (locales.has(locale)) issue(findings, "set.duplicate-translation", `records[${index}].translationKey`, typeof id === "string" ? id : null);
        locales.add(locale);
        translations.set(translationKey, locales);
      }
    }
  });
  if (options.requireBothLocales) {
    for (const [translationKey, locales] of translations) {
      for (const locale of SUPPORTED_LOCALES) {
        if (!locales.has(locale)) issue(findings, "set.missing-translation", `translations.${translationKey}.${locale}`, null);
      }
    }
  }
  return findings;
}

/**
 * Produces a presentation-safe summary, rather than concatenating arbitrary
 * input data into diagnostics or an HTML fragment.
 * @param {readonly RecordFinding[]} findings
 */
export function summarizeFindings(findings) {
  const counts = Object.create(null);
  for (const finding of findings) counts[finding.code] = (counts[finding.code] ?? 0) + 1;
  return Object.entries(counts)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([code, count]) => ({ code, count }));
}
