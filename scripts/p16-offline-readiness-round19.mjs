/**
 * P16: read-only, offline-first publication readiness assessment.
 * Caller-supplied records are never fetched, stored, modified, or enriched.
 * No raw title, description, URL, or identity is returned in diagnostics.
 */

export const LANGUAGES = Object.freeze(["en", "fr"]);
export const EVIDENCE_TIERS = Object.freeze(["primary", "secondary", "community", "unknown"]);
export const ACCESS_STATES = Object.freeze(["available", "limited", "unavailable", "unknown"]);
export const CACHE_STATES = Object.freeze(["stored", "absent", "unknown"]);
const DATE_FORMAT = /^(\d{4})-(\d{2})-(\d{2})$/;
const ID_FORMAT = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const ACCEPTABLE_LICENCES = new Set(["CC0-1.0", "CC-BY-4.0", "CC-BY-SA-4.0", "ODC-BY-1.0", "OGL-Canada-2.0", "MIT", "Apache-2.0"]);
const MAX_TEXT = 4000;

/** @param {unknown} value @returns {value is Record<string, any>} */
function plain(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/** ASCII control codes are rejected without embedding them in regex patterns. */
/** @param {unknown} value */
export function containsControl(value) {
  if (typeof value !== "string") return false;
  for (let index = 0; index < value.length; index += 1) {
    const unit = value.charCodeAt(index);
    if (unit <= 31 || unit === 127) return true;
  }
  return false;
}

/** @param {unknown} value @param {number} [limit] */
export function cleanText(value, limit = MAX_TEXT) {
  return typeof value === "string" && value.trim().length > 0 &&
    value.length <= limit && !containsControl(value);
}

/** A UTC ordinal prevents machine timezone changes from affecting comparisons. */
/** @param {unknown} value */
export function calendarOrdinal(value) {
  if (typeof value !== "string") return null;
  const match = DATE_FORMAT.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1970 || year > 9999 || month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() + 1 !== month || date.getUTCDate() !== day) return null;
  return Math.floor(date.getTime() / 86400000);
}

/** @param {unknown} value */
export function trustedAttributionUrl(value) {
  if (typeof value !== "string" || value.length > 2048 || value.trim() !== value || containsControl(value)) return false;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || !url.hostname || url.username || url.password || url.hash) return false;
    const hostname = url.hostname.toLowerCase();
    if (hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local")) return false;
    if (/^(?:127(?:\.\d+){3}|0\.0\.0\.0|10(?:\.\d+){3}|192\.168(?:\.\d+){2})$/.test(hostname)) return false;
    return true;
  } catch {
    return false;
  }
}

/** @param {unknown} value */
export function localCachePath(value) {
  if (typeof value !== "string" || value.length > 1024 || containsControl(value)) return false;
  if (!value.startsWith("/offline/") || value.includes("\\") || value.includes("?") || value.includes("#") || value.includes("%")) return false;
  const parts = value.split("/").slice(1);
  if (parts.some((part) => part === "" || part === "." || part === "..")) return false;
  return true;
}

/** @typedef {{code: string, path: string, severity: string}} Issue */
/** @param {Issue[]} issues @param {string} code @param {string} path @param {string} [severity] */
function diagnostic(issues, code, path, severity = "error") {
  issues.push({ code, path, severity });
}

/** @param {unknown} field @param {string} path @param {Issue[]} issues */
function inspectBilingual(field, path, issues) {
  if (!plain(field)) {
    diagnostic(issues, "text.object", path);
    return;
  }
  for (const language of LANGUAGES) {
    if (!cleanText(field[language])) diagnostic(issues, "text.language", `${path}.${language}`);
  }
  if (cleanText(field.en) && cleanText(field.fr) && field.en.trim() === field.fr.trim()) {
    diagnostic(issues, "text.same-language", path, "review");
  }
}

/** @param {unknown} source @param {string} path @param {Issue[]} issues @param {number} today @param {number} maxAgeDays */
function inspectSource(source, path, issues, today, maxAgeDays) {
  if (!plain(source)) {
    diagnostic(issues, "source.object", path);
    return null;
  }
  if (!cleanText(source.publisher, 200)) diagnostic(issues, "source.publisher", `${path}.publisher`);
  if (!trustedAttributionUrl(source.url)) diagnostic(issues, "source.url", `${path}.url`);
  if (!cleanText(source.licence, 100)) diagnostic(issues, "source.licence", `${path}.licence`);
  else if (!ACCEPTABLE_LICENCES.has(source.licence)) diagnostic(issues, "source.licence-review", `${path}.licence`, "review");
  if (!EVIDENCE_TIERS.includes(source.tier)) diagnostic(issues, "source.tier", `${path}.tier`);
  else if (source.tier === "unknown") diagnostic(issues, "source.unknown-tier", `${path}.tier`, "review");
  const collected = calendarOrdinal(source.collectedOn);
  if (collected === null) diagnostic(issues, "source.date", `${path}.collectedOn`);
  else {
    if (collected > today) diagnostic(issues, "source.future", `${path}.collectedOn`);
    if (today - collected > maxAgeDays) diagnostic(issues, "source.stale", `${path}.collectedOn`, "review");
  }
  return collected;
}

/**
 * Inspects one bilingual publication card. The response contains only issue
 * codes and structural field paths, never text supplied inside a record.
 *
 * @param {unknown} input
 * @param {{asOf?: string, maxAgeDays?: number}} [options]
 */
export function inspectReadiness(input, options = {}) {
  /** @type {Issue[]} */
  const issues = [];
  const today = calendarOrdinal(options.asOf ?? "2026-11-19");
  if (today === null) throw new TypeError("asOf must be a calendar date");
  const maxAgeDays = options.maxAgeDays ?? 365;
  if (!Number.isSafeInteger(maxAgeDays) || maxAgeDays < 0 || maxAgeDays > 36500) {
    throw new RangeError("maxAgeDays must be an integer from 0 through 36500");
  }
  if (!plain(input)) {
    diagnostic(issues, "record.object", "record");
    return { issues, status: "blocked", sourceDate: null, cacheDate: null };
  }
  if (typeof input.key !== "string" || !ID_FORMAT.test(input.key)) diagnostic(issues, "record.key", "record.key");
  if (!ACCESS_STATES.includes(input.state)) diagnostic(issues, "record.state", "record.state");
  inspectBilingual(input.title, "record.title", issues);
  inspectBilingual(input.summary, "record.summary", issues);
  inspectBilingual(input.accessInstructions, "record.accessInstructions", issues);
  const sourceDate = inspectSource(input.source, "record.source", issues, today, maxAgeDays);
  let cacheDate = null;
  if (!plain(input.offline)) {
    diagnostic(issues, "offline.object", "record.offline");
  } else if (!CACHE_STATES.includes(input.offline.state)) {
    diagnostic(issues, "offline.state", "record.offline.state");
  } else if (input.offline.state === "stored") {
    if (!localCachePath(input.offline.path)) diagnostic(issues, "offline.path", "record.offline.path");
    cacheDate = calendarOrdinal(input.offline.capturedOn);
    if (cacheDate === null) diagnostic(issues, "offline.date", "record.offline.capturedOn");
    else {
      if (cacheDate > today) diagnostic(issues, "offline.future", "record.offline.capturedOn");
      if (sourceDate !== null && cacheDate < sourceDate) diagnostic(issues, "offline.outdated", "record.offline.capturedOn", "review");
      if (today - cacheDate > maxAgeDays) diagnostic(issues, "offline.stale", "record.offline.capturedOn", "review");
    }
  } else if (input.offline.path !== undefined || input.offline.capturedOn !== undefined) {
    diagnostic(issues, "offline.unexpected", "record.offline");
  }
  if (input.state === "available" && plain(input.offline) && input.offline.state === "absent") {
    diagnostic(issues, "offline.unavailable", "record.offline.state", "review");
  }
  issues.sort((a, b) => a.path.localeCompare(b.path, "en") || a.code.localeCompare(b.code, "en"));
  const status = issues.some((issue) => issue.severity === "error") ? "blocked" : issues.length > 0 ? "review" : "ready";
  return { issues, status, sourceDate, cacheDate };
}

/**
 * A collection audit additionally detects duplicate IDs, cache-path ownership,
 * missing language variants and mismatched evidence across language copies.
 * No network, storage, or DOM access is performed.
 *
 * @param {unknown} input
 * @param {{asOf?: string, maxAgeDays?: number, requireBothLanguages?: boolean}} [options]
 */
export function inspectReadinessSet(input, options = {}) {
  if (!Array.isArray(input)) {
    return { issues: [{ code: "set.array", path: "records", severity: "error" }], status: "blocked", recordCount: 0 };
  }
  /** @type {Issue[]} */
  const issues = [];
  const ids = new Set();
  const cacheOwners = new Map();
  const translationGroups = new Map();
  input.forEach((record, index) => {
    const prefix = `records[${index}]`;
    const one = inspectReadiness(record, options);
    for (const issue of one.issues) {
      issues.push({ ...issue, path: issue.path.replace(/^record/, prefix) });
    }
    if (!plain(record)) return;
    if (typeof record.key === "string" && ID_FORMAT.test(record.key)) {
      if (ids.has(record.key)) diagnostic(issues, "set.duplicate-key", `${prefix}.key`);
      ids.add(record.key);
    }
    if (plain(record.offline) && record.offline.state === "stored" && localCachePath(record.offline.path)) {
      const previous = cacheOwners.get(record.offline.path);
      if (previous !== undefined && previous !== record.key) diagnostic(issues, "set.cache-collision", `${prefix}.offline.path`);
      cacheOwners.set(record.offline.path, record.key);
    }
    if (options.requireBothLanguages) {
      if (typeof record.translationKey !== "string" || !ID_FORMAT.test(record.translationKey)) {
        diagnostic(issues, "set.translation-key", `${prefix}.translationKey`);
      } else if (!translationGroups.has(record.translationKey)) {
        translationGroups.set(record.translationKey, new Set());
      }
      if (typeof record.translationKey === "string" && translationGroups.has(record.translationKey)) {
        const group = translationGroups.get(record.translationKey);
        if (!LANGUAGES.includes(record.locale)) diagnostic(issues, "set.locale", `${prefix}.locale`);
        else {
          if (group.has(record.locale)) diagnostic(issues, "set.duplicate-translation", `${prefix}.locale`);
          group.add(record.locale);
        }
      }
    }
  });
  if (options.requireBothLanguages) {
    for (const [key, group] of translationGroups) {
      for (const language of LANGUAGES) {
        if (!group.has(language)) diagnostic(issues, "set.missing-translation", `translations.${key}.${language}`);
      }
    }
  }
  issues.sort((a, b) => a.path.localeCompare(b.path, "en") || a.code.localeCompare(b.code, "en"));
  const status = issues.some((issue) => issue.severity === "error") ? "blocked" : issues.length > 0 ? "review" : "ready";
  return { issues, status, recordCount: input.length };
}

/** Count issues by code without including record contents. */
/** @param {{issues: readonly Issue[]}} result */
export function summarizeReadiness(result) {
  const count = new Map();
  for (const issue of result.issues) count.set(issue.code, (count.get(issue.code) ?? 0) + 1);
  return [...count].sort(([left], [right]) => left.localeCompare(right, "en"))
    .map(([code, occurrences]) => ({ code, occurrences }));
}

/** Ensure per-card assessments do not mutate caller-owned source objects. */
/** @param {unknown} input @param {{asOf?: string, maxAgeDays?: number, requireBothLanguages?: boolean}} [options] */
export function auditSnapshotConsistency(input, options = {}) {
  const before = JSON.stringify(input);
  const result = inspectReadinessSet(input, options);
  if (JSON.stringify(input) !== before) throw new Error("Read-only audit modified input");
  return result;
}
