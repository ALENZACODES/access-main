/** P16: bounded, read-only evidence contracts for offline publication intake. */
export const LOCALES = Object.freeze(["en", "fr"]);
export const ACCESS = Object.freeze(["SUPPORTED", "UNSUPPORTED", "UNKNOWN"]);
export const TIERS = Object.freeze(["PRIMARY", "SECONDARY", "COMMUNITY", "UNKNOWN"]);
export const CACHE = Object.freeze(["PRESENT", "ABSENT", "UNKNOWN"]);
export const SEVERITY = Object.freeze(["error", "review", "unknown"]);
export const TYPES = Object.freeze(["entrance", "washroom", "service", "route", "notice"]);
const ID = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MAX_RECORDS = 20000;

/** Test for executable ASCII control code units without a control regex. */
export function hasControl(value) {
  if (typeof value !== "string") return false;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code < 32 || code === 127 || (code >= 128 && code <= 159)) return true;
  }
  return false;
}

export function plain(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

export function validId(value) {
  return typeof value === "string" && value.length <= 96 && ID.test(value);
}

export function cleanText(value, limit = 2000) {
  return typeof value === "string" && value.length > 0 && value.length <= limit &&
    value.trim().length > 0 && !hasControl(value) && value === value.normalize("NFC");
}

export function dayOrdinal(value) {
  if (typeof value !== "string") return null;
  const matched = DATE.exec(value);
  if (!matched) return null;
  const year = Number(matched[1]);
  const month = Number(matched[2]);
  const day = Number(matched[3]);
  if (year < 1970 || year > 9999 || month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() + 1 !== month || date.getUTCDate() !== day) return null;
  return Math.floor(date.getTime() / 86400000);
}

export function safeSourceUrl(value) {
  if (typeof value !== "string" || !cleanText(value, 2048) || value.trim() !== value || /\s/.test(value)) return false;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || !url.hostname || url.username || url.password || url.hash) return false;
    const host = url.hostname.toLowerCase();
    if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) return false;
    if (host === "[::1]" || host === "0.0.0.0" || host === "127.0.0.1") return false;
    if (/^127(?:\.\d{1,3}){3}$/.test(host)) return false;
    if (/^10(?:\.\d{1,3}){3}$/.test(host)) return false;
    if (/^192\.168(?:\.\d{1,3}){2}$/.test(host)) return false;
    return true;
  } catch {
    return false;
  }
}

export function safeOfflinePath(value) {
  if (typeof value !== "string" || value.length > 1024 || hasControl(value)) return false;
  if (!value.startsWith("/offline/") || value.includes("\\")) return false;
  if (value.includes("?") || value.includes("#") || value.includes("%")) return false;
  const segments = value.split("/").slice(1);
  if (segments.some((segment) => !segment || segment === "." || segment === "..")) return false;
  return segments.every((segment) => /^[a-zA-Z0-9._-]+$/.test(segment));
}

/** Findings contain only codes and structural paths, never supplied record copy. */
export function finding(code, path, severity = "error") {
  return { code, path, severity };
}

export function sortFindings(items) {
  return [...items].sort((a, b) => a.path.localeCompare(b.path, "en") || a.code.localeCompare(b.code, "en"));
}

export function checkFrenchTypography(value) {
  if (typeof value !== "string" || !value) return [];
  const problems = [];
  if (value.includes("'")) problems.push("fr.apostrophe");
  for (let index = 0; index < value.length; index += 1) {
    const symbol = value[index];
    const prior = value[index - 1];
    const following = value[index + 1];
    if (symbol === ":" && prior !== "\u00a0") problems.push("fr.colon-space");
    if ([";", "!", "?"].includes(symbol) && prior !== "\u202f") problems.push("fr.narrow-space");
    if (symbol === "«" && following !== "\u202f") problems.push("fr.guillemet-open");
    if (symbol === "»" && prior !== "\u202f") problems.push("fr.guillemet-close");
  }
  return [...new Set(problems)];
}

export function textIssues(value, location, options = {}) {
  const findings = [];
  if (!plain(value)) return [finding("text.object", location)];
  for (const language of LOCALES) {
    const content = value[language];
    if (!cleanText(content, options.maxLength ?? 2000)) {
      findings.push(finding("text.missing-or-invalid", `${location}.${language}`));
      continue;
    }
    if (options.frenchTypography && language === "fr") {
      for (const code of checkFrenchTypography(content)) findings.push(finding(code, `${location}.fr`, "review"));
    }
  }
  return findings;
}

export function sourceIssues(value, location, asOf) {
  if (!plain(value)) return [finding("source.object", location)];
  const findings = [];
  if (!validId(value.id)) findings.push(finding("source.id", `${location}.id`));
  if (!cleanText(value.publisher, 240)) findings.push(finding("source.publisher", `${location}.publisher`));
  if (!cleanText(value.licence, 160)) findings.push(finding("source.licence", `${location}.licence`));
  if (!safeSourceUrl(value.url)) findings.push(finding("source.url", `${location}.url`));
  if (!TIERS.includes(value.tier)) findings.push(finding("source.tier", `${location}.tier`));
  else if (value.tier === "UNKNOWN") findings.push(finding("source.unknown-tier", `${location}.tier`, "unknown"));
  const collected = dayOrdinal(value.collectedOn);
  if (collected === null) findings.push(finding("source.collection-date", `${location}.collectedOn`));
  else if (collected > asOf) findings.push(finding("source.future-date", `${location}.collectedOn`));
  if (value.reviewedOn !== undefined) {
    const reviewed = dayOrdinal(value.reviewedOn);
    if (reviewed === null) findings.push(finding("source.review-date", `${location}.reviewedOn`));
    else if (collected !== null && reviewed < collected) findings.push(finding("source.review-before-collection", `${location}.reviewedOn`));
    else if (reviewed > asOf) findings.push(finding("source.future-review", `${location}.reviewedOn`));
  }
  if (value.claim === "UNKNOWN") findings.push(finding("source.unknown-claim", `${location}.claim`, "unknown"));
  else if (value.claim === "UNSUPPORTED") findings.push(finding("source.unsupported-claim", `${location}.claim`, "review"));
  else if (value.claim !== "SUPPORTED") findings.push(finding("source.claim", `${location}.claim`));
  return findings;
}

export function cacheIssues(value, location, asOf) {
  if (!plain(value)) return [finding("cache.object", location)];
  const findings = [];
  if (!CACHE.includes(value.state)) findings.push(finding("cache.state", `${location}.state`));
  else if (value.state === "UNKNOWN") findings.push(finding("cache.unknown", `${location}.state`, "unknown"));
  else if (value.state === "ABSENT") findings.push(finding("cache.absent", `${location}.state`, "review"));
  if (value.state === "PRESENT") {
    if (!safeOfflinePath(value.path)) findings.push(finding("cache.path", `${location}.path`));
    const captured = dayOrdinal(value.capturedOn);
    if (captured === null) findings.push(finding("cache.capture-date", `${location}.capturedOn`));
    else if (captured > asOf) findings.push(finding("cache.future-capture", `${location}.capturedOn`));
    if (!Number.isSafeInteger(value.bytes) || value.bytes <= 0) findings.push(finding("cache.bytes", `${location}.bytes`));
    if (!Number.isSafeInteger(value.revision) || value.revision <= 0) findings.push(finding("cache.revision", `${location}.revision`));
  } else if (value.path !== undefined || value.capturedOn !== undefined || value.bytes !== undefined) {
    findings.push(finding("cache.unexpected-payload", location));
  }
  return findings;
}

export function recordIssues(value, location = "record", options = {}) {
  const asOf = dayOrdinal(options.asOf ?? "2026-11-19");
  if (asOf === null) throw new TypeError("asOf must be a calendar date");
  if (!plain(value)) return [finding("record.object", location)];
  const findings = [];
  if (!validId(value.id)) findings.push(finding("record.id", `${location}.id`));
  if (!validId(value.translationKey)) findings.push(finding("record.translation-key", `${location}.translationKey`));
  if (!LOCALES.includes(value.language)) findings.push(finding("record.language", `${location}.language`));
  if (!TYPES.includes(value.kind)) findings.push(finding("record.kind", `${location}.kind`));
  if (!ACCESS.includes(value.access)) findings.push(finding("record.access", `${location}.access`));
  else if (value.access === "UNKNOWN") findings.push(finding("record.unknown-access", `${location}.access`, "unknown"));
  else if (value.access === "UNSUPPORTED") findings.push(finding("record.unsupported-access", `${location}.access`, "review"));
  if (!Number.isSafeInteger(value.revision) || value.revision < 1) findings.push(finding("record.revision", `${location}.revision`));
  const recorded = dayOrdinal(value.recordedOn);
  if (recorded === null) findings.push(finding("record.date", `${location}.recordedOn`));
  else if (recorded > asOf) findings.push(finding("record.future-date", `${location}.recordedOn`));
  findings.push(...textIssues(value.title, `${location}.title`, options));
  findings.push(...textIssues(value.summary, `${location}.summary`, options));
  if (!Array.isArray(value.sources) || value.sources.length === 0 || value.sources.length > 40) {
    findings.push(finding("record.sources", `${location}.sources`));
  } else {
    const seen = new Set();
    value.sources.forEach((source, index) => {
      findings.push(...sourceIssues(source, `${location}.sources[${index}]`, asOf));
      if (validId(source?.id)) {
        if (seen.has(source.id)) findings.push(finding("source.duplicate-id", `${location}.sources[${index}].id`));
        seen.add(source.id);
      }
    });
  }
  findings.push(...cacheIssues(value.cache, `${location}.cache`, asOf));
  if (value.cache?.state === "PRESENT" && Number.isSafeInteger(value.cache.revision) &&
    Number.isSafeInteger(value.revision) && value.cache.revision !== value.revision) {
    findings.push(finding("cache.revision-mismatch", `${location}.cache.revision`));
  }
  return sortFindings(findings);
}

export function collectionIssues(records, options = {}) {
  if (!Array.isArray(records) || records.length > MAX_RECORDS) return [finding("collection.array", "records")];
  const findings = [];
  const ids = new Map();
  const translations = new Map();
  const assets = new Map();
  records.forEach((record, index) => {
    const location = `records[${index}]`;
    findings.push(...recordIssues(record, location, options));
    if (!plain(record)) return;
    if (validId(record.id) && LOCALES.includes(record.language)) {
      const key = `${record.language}/${record.id}`;
      if (ids.has(key)) {
        findings.push(finding("record.duplicate", `${location}.id`));
        findings.push(finding("record.duplicate", `records[${ids.get(key)}].id`));
      } else ids.set(key, index);
    }
    if (validId(record.translationKey) && LOCALES.includes(record.language)) {
      const pair = translations.get(record.translationKey) ?? new Map();
      if (pair.has(record.language)) findings.push(finding("translation.duplicate", `${location}.translationKey`));
      else pair.set(record.language, index);
      translations.set(record.translationKey, pair);
    }
    if (record.cache?.state === "PRESENT" && safeOfflinePath(record.cache.path)) {
      if (assets.has(record.cache.path)) findings.push(finding("cache.duplicate-owner", `${location}.cache.path`));
      else assets.set(record.cache.path, index);
    }
  });
  if (options.requirePairs !== false) {
    for (const [translationKey, pair] of translations) {
      for (const language of LOCALES) {
        if (!pair.has(language)) findings.push(finding("translation.missing", `translations.${translationKey}.${language}`));
      }
    }
  }
  return sortFindings(findings);
}

export function issueSummary(items) {
  const counts = { error: 0, review: 0, unknown: 0 };
  for (const item of items) if (item.severity in counts) counts[item.severity] += 1;
  return { ...counts, total: items.length };
}

export function groupIssues(items) {
  const groups = new Map();
  for (const item of sortFindings(items)) {
    const existing = groups.get(item.code) ?? { code: item.code, count: 0, severity: item.severity };
    existing.count += 1;
    groups.set(item.code, existing);
  }
  return [...groups.values()].sort((a, b) => a.code.localeCompare(b.code, "en"));
}
