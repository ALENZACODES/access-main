/**
 * P16 publication contract. All functions are pure, bounded and deterministic.
 * Callers bring their own licensed source records; no lookup or inference occurs.
 * Diagnostic output contains paths and codes, never supplied descriptions.
 */
export const LANGUAGES = Object.freeze(["en", "fr"]);
export const STATES = Object.freeze(["SUPPORTED", "UNSUPPORTED", "UNKNOWN"]);
export const TIERS = Object.freeze(["PRIMARY", "SECONDARY", "COMMUNITY", "UNKNOWN"]);
export const CACHE_STATES = Object.freeze(["PRESENT", "ABSENT", "UNKNOWN"]);
export const KINDS = Object.freeze(["entrance", "washroom", "route", "service", "notice"]);
export const MAX_RECORDS = 5000;
export const MAX_SOURCES = 16;
export const MAX_TEXT = 4000;
export const MAX_URL = 2048;
const ID_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const DAY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const PLACEHOLDERS = new Set(["n/a", "na", "todo", "tbd", "coming soon", "à venir", "unknown", "inconnu", "-"]);

export function plainObject(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

export function containsAsciiControl(value) {
  if (typeof value !== "string") return false;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code <= 31 || code === 127) return true;
  }
  return false;
}

export function canonicalIdentifier(value) {
  return typeof value === "string" && value.length <= 128 && ID_PATTERN.test(value);
}

export function safeText(value, limit = MAX_TEXT) {
  if (typeof value !== "string" || value.length > limit || value.trim() !== value) return false;
  if (value.length === 0 || containsAsciiControl(value)) return false;
  return !PLACEHOLDERS.has(value.toLocaleLowerCase("en-CA"));
}

export function calendarOrdinal(value) {
  if (typeof value !== "string") return null;
  const match = DAY_PATTERN.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1970 || year > 9999 || month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() + 1 !== month || date.getUTCDate() !== day) return null;
  return Math.floor(date.getTime() / 86400000);
}

export function secureSourceUrl(value) {
  if (typeof value !== "string" || value.length > MAX_URL || value.trim() !== value) return false;
  if (containsAsciiControl(value) || /\s/u.test(value) || value.includes("\\")) return false;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || !url.hostname || url.username || url.password || url.hash) return false;
    const host = url.hostname.toLowerCase();
    if (host === "localhost" || host === "0.0.0.0" || host === "[::1]" || host.endsWith(".localhost")) return false;
    if (/^127(?:\.\d{1,3}){3}$/.test(host)) return false;
    return true;
  } catch {
    return false;
  }
}

export function localCachePath(value, prefix = "/offline/evidence") {
  if (typeof value !== "string" || value.length > 1024) return false;
  if (!value.startsWith(prefix + "/") || value.startsWith("//")) return false;
  if (containsAsciiControl(value) || /[?#%\\]/.test(value)) return false;
  const segments = value.slice(1).split("/");
  if (segments.some((segment) => segment === "" || segment === "." || segment === "..")) return false;
  return segments.every((segment) => /^[a-z0-9][a-z0-9._-]*$/i.test(segment));
}

export function bilingualCopy(value) {
  if (!plainObject(value)) return false;
  return LANGUAGES.every((language) => safeText(value[language]));
}

export function diagnostic(code, path, severity = "error") {
  return Object.freeze({ code, path, severity });
}

export function sortDiagnostics(values) {
  return [...values].sort((a, b) => a.path.localeCompare(b.path, "en") || a.code.localeCompare(b.code, "en"));
}

export function findSourceIssues(source, path = "source", asOf = "2026-11-19") {
  const issues = [];
  if (!plainObject(source)) return [diagnostic("source.object", path)];
  if (!canonicalIdentifier(source.id)) issues.push(diagnostic("source.id", `${path}.id`));
  if (!bilingualCopy(source.title)) issues.push(diagnostic("source.title", `${path}.title`));
  if (!safeText(source.publisher, 200)) issues.push(diagnostic("source.publisher", `${path}.publisher`));
  if (!safeText(source.licence, 200)) issues.push(diagnostic("source.licence", `${path}.licence`));
  if (!secureSourceUrl(source.url)) issues.push(diagnostic("source.url", `${path}.url`));
  if (!TIERS.includes(source.tier)) issues.push(diagnostic("source.tier", `${path}.tier`));
  const date = calendarOrdinal(source.collectedOn);
  if (date === null) issues.push(diagnostic("source.collectedOn", `${path}.collectedOn`));
  else if (date > calendarOrdinal(asOf)) issues.push(diagnostic("source.futureDate", `${path}.collectedOn`));
  if (source.updatedOn !== undefined) {
    const updated = calendarOrdinal(source.updatedOn);
    if (updated === null) issues.push(diagnostic("source.updatedOn", `${path}.updatedOn`));
    else if (date !== null && updated < date) issues.push(diagnostic("source.dateOrder", `${path}.updatedOn`));
  }
  if (source.tier === "UNKNOWN" && source.claim === "SUPPORTED") {
    issues.push(diagnostic("source.unknownSupport", `${path}.claim`));
  }
  return sortDiagnostics(issues);
}

export function findCacheIssues(cache, path = "cache", asOf = "2026-11-19") {
  const issues = [];
  if (!plainObject(cache)) return [diagnostic("cache.object", path)];
  if (!CACHE_STATES.includes(cache.state)) issues.push(diagnostic("cache.state", `${path}.state`));
  if (cache.state === "PRESENT") {
    if (!localCachePath(cache.path)) issues.push(diagnostic("cache.path", `${path}.path`));
    if (calendarOrdinal(cache.capturedOn) === null) issues.push(diagnostic("cache.capturedOn", `${path}.capturedOn`));
    else if (calendarOrdinal(cache.capturedOn) > calendarOrdinal(asOf)) {
      issues.push(diagnostic("cache.futureDate", `${path}.capturedOn`));
    }
    if (!Number.isSafeInteger(cache.bytes) || cache.bytes < 1 || cache.bytes > 100_000_000) {
      issues.push(diagnostic("cache.bytes", `${path}.bytes`));
    }
  } else {
    for (const field of ["path", "capturedOn", "bytes"]) {
      if (cache[field] !== undefined) issues.push(diagnostic("cache.unexpectedField", `${path}.${field}`));
    }
  }
  return sortDiagnostics(issues);
}

export function findRecordIssues(record, path = "record", options = {}) {
  const issues = [];
  const asOf = options.asOf ?? "2026-11-19";
  if (calendarOrdinal(asOf) === null) throw new TypeError("asOf must be a calendar date");
  if (!plainObject(record)) return [diagnostic("record.object", path)];
  if (!canonicalIdentifier(record.id)) issues.push(diagnostic("record.id", `${path}.id`));
  if (!canonicalIdentifier(record.translationKey)) issues.push(diagnostic("record.translationKey", `${path}.translationKey`));
  if (!LANGUAGES.includes(record.language)) issues.push(diagnostic("record.language", `${path}.language`));
  if (!KINDS.includes(record.kind)) issues.push(diagnostic("record.kind", `${path}.kind`));
  if (!STATES.includes(record.state)) issues.push(diagnostic("record.state", `${path}.state`));
  if (!bilingualCopy(record.title)) issues.push(diagnostic("record.title", `${path}.title`));
  if (!bilingualCopy(record.summary)) issues.push(diagnostic("record.summary", `${path}.summary`));
  if (!Number.isSafeInteger(record.revision) || record.revision < 1) {
    issues.push(diagnostic("record.revision", `${path}.revision`));
  }
  if (calendarOrdinal(record.recordedOn) === null) issues.push(diagnostic("record.recordedOn", `${path}.recordedOn`));
  else if (calendarOrdinal(record.recordedOn) > calendarOrdinal(asOf)) issues.push(diagnostic("record.futureDate", `${path}.recordedOn`));
  if (!Array.isArray(record.sources) || record.sources.length === 0 || record.sources.length > MAX_SOURCES) {
    issues.push(diagnostic("record.sources", `${path}.sources`));
  } else {
    const seen = new Set();
    record.sources.forEach((source, index) => {
      issues.push(...findSourceIssues(source, `${path}.sources[${index}]`, asOf));
      if (!plainObject(source) || !canonicalIdentifier(source.id)) return;
      if (seen.has(source.id)) issues.push(diagnostic("record.duplicateSource", `${path}.sources[${index}].id`));
      seen.add(source.id);
    });
  }
  issues.push(...findCacheIssues(record.cache, `${path}.cache`, asOf));
  if (record.state === "UNKNOWN") {
    if (plainObject(record.cache) && record.cache.state === "PRESENT" && record.cache.claim === "SUPPORTED") {
      issues.push(diagnostic("record.unknownCacheClaim", `${path}.cache.claim`));
    }
  }
  if (record.state === "SUPPORTED" && Array.isArray(record.sources) && record.sources.every((source) => source?.tier === "UNKNOWN")) {
    issues.push(diagnostic("record.unsourcedSupport", `${path}.state`));
  }
  return sortDiagnostics(issues);
}

export function auditCollection(records, options = {}) {
  if (!Array.isArray(records)) return { findings: [diagnostic("collection.array", "records")], count: 0, languages: LANGUAGES };
  if (records.length > MAX_RECORDS) return { findings: [diagnostic("collection.tooMany", "records")], count: records.length, languages: LANGUAGES };
  const findings = [];
  const seen = new Set();
  const pairs = new Map();
  const cachePaths = new Map();
  records.forEach((record, index) => {
    const path = `records[${index}]`;
    findings.push(...findRecordIssues(record, path, options));
    if (!plainObject(record)) return;
    if (canonicalIdentifier(record.id) && LANGUAGES.includes(record.language)) {
      const key = `${record.language}/${record.id}`;
      if (seen.has(key)) findings.push(diagnostic("collection.duplicateRecord", `${path}.id`));
      seen.add(key);
    }
    if (canonicalIdentifier(record.translationKey) && LANGUAGES.includes(record.language)) {
      const languages = pairs.get(record.translationKey) ?? new Set();
      if (languages.has(record.language)) findings.push(diagnostic("collection.duplicateLanguage", `${path}.language`));
      languages.add(record.language);
      pairs.set(record.translationKey, languages);
    }
    if (record.cache?.state === "PRESENT" && localCachePath(record.cache.path)) {
      const owner = cachePaths.get(record.cache.path);
      if (owner && owner !== record.translationKey) findings.push(diagnostic("collection.cacheConflict", `${path}.cache.path`));
      cachePaths.set(record.cache.path, record.translationKey);
    }
  });
  if (options.requireBothLanguages !== false) {
    for (const [key, languages] of pairs) {
      for (const language of LANGUAGES) {
        if (!languages.has(language)) findings.push(diagnostic("collection.missingLanguage", `translations.${key}.${language}`));
      }
    }
  }
  return { findings: sortDiagnostics(findings), count: records.length, languages: LANGUAGES };
}

export function summarizeIssues(findings) {
  const counts = new Map();
  for (const finding of findings) counts.set(finding.code, (counts.get(finding.code) ?? 0) + 1);
  return [...counts].sort(([left], [right]) => left.localeCompare(right, "en"))
    .map(([code, count]) => ({ code, count }));
}
