/**
 * Read-only publication packet primitives. Every operation is deterministic and
 * receives its clock and data from a caller; no files, network, or storage.
 * Findings contain paths and codes, never untrusted descriptions or addresses.
 */
export const LOCALES = Object.freeze(["en", "fr"]);
export const TIERS = Object.freeze(["primary", "secondary", "community", "unknown"]);
export const ACCESS = Object.freeze(["available", "limited", "unavailable", "unknown"]);
export const OFFLINE = Object.freeze(["stored", "missing", "unknown"]);
export const DECISIONS = Object.freeze(["READY", "HOLD", "UNKNOWN"]);
export const KINDS = Object.freeze(["place", "service", "guide", "alert"]);
const ID = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MAX_RECORDS = 5000;

/** @param {unknown} x @returns {x is Record<string, any>} */
export function object(x) {
  if (x === null || typeof x !== "object" || Array.isArray(x)) return false;
  const prototype = Object.getPrototypeOf(x);
  return prototype === Object.prototype || prototype === null;
}

/** Scan code units without using any regex for control characters. */
/** @param {unknown} value */
export function hasControl(value) {
  if (typeof value !== "string") return false;
  for (let i = 0; i < value.length; i += 1) {
    const n = value.charCodeAt(i);
    if (n < 32 || (n >= 127 && n <= 159)) return true;
  }
  return false;
}

/** @param {unknown} value @param {number} [max] */
export function safeText(value, max = 2048) {
  return typeof value === "string" && value.trim().length > 0 &&
    value.length <= max && !hasControl(value);
}

/** @param {unknown} value */
export function validId(value) {
  return typeof value === "string" && value.length <= 96 && ID.test(value);
}

/** Strict date ordinal, excluding rolled-over calendar dates. */
/** @param {unknown} value */
export function day(value) {
  if (typeof value !== "string") return null;
  const parts = DATE.exec(value);
  if (!parts) return null;
  const year = Number(parts[1]);
  const month = Number(parts[2]);
  const date = Number(parts[3]);
  if (year < 1970 || year > 9999 || month < 1 || month > 12 || date < 1 || date > 31) return null;
  const actual = new Date(Date.UTC(year, month - 1, date));
  if (actual.getUTCFullYear() !== year || actual.getUTCMonth() + 1 !== month || actual.getUTCDate() !== date) return null;
  return Math.trunc(actual.getTime() / 86400000);
}

/** Only on-site cache entries. Encoded traversal is never accepted. */
/** @param {unknown} value */
export function cachePath(value) {
  if (typeof value !== "string" || value.length > 1024 || hasControl(value)) return false;
  if (!value.startsWith("/offline/") || value.includes("\\") || value.includes("%")) return false;
  if (value.includes("?") || value.includes("#") || value.includes(" ")) return false;
  const parts = value.split("/").slice(1);
  return parts.every((part) => part.length > 0 && part !== "." && part !== ".." && /^[a-zA-Z0-9._-]+$/.test(part));
}

/** Only public HTTPS sources without credentials or fragments. */
/** @param {unknown} value */
export function sourceUrl(value) {
  if (typeof value !== "string" || value.length > 2048 || hasControl(value) || value.includes(" ")) return false;
  if (value.trim() !== value) return false;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || !url.hostname || url.username || url.password || url.hash) return false;
    const host = url.hostname.toLowerCase();
    if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) return false;
    if (host === "0.0.0.0" || host === "127.0.0.1" || host === "[::1]") return false;
    if (/^127(?:\.\d+){3}$/.test(host)) return false;
    return true;
  } catch {
    return false;
  }
}

/** @typedef {{code:string,path:string,severity:'error'|'review'}} Finding */
/** @param {Finding[]} findings @param {string} code @param {string} path @param {'error'|'review'} [severity] */
export function add(findings, code, path, severity = "error") {
  findings.push({ code, path, severity });
}

/** Only stable diagnostics are emitted. */
/** @param {readonly Finding[]} findings */
export function sorted(findings) {
  return [...findings].sort((a, b) => a.path.localeCompare(b.path, "en") ||
    a.code.localeCompare(b.code, "en") || a.severity.localeCompare(b.severity, "en"));
}

/** @param {unknown} options */
export function policy(options = {}) {
  if (!object(options)) throw new TypeError("policy must be an object");
  const asOf = options.asOf ?? "2026-11-19";
  const today = day(asOf);
  if (today === null) throw new TypeError("asOf must be a real calendar date");
  const sourceMaxDays = options.sourceMaxDays ?? 365;
  const cacheMaxDays = options.cacheMaxDays ?? 90;
  const reviewMaxDays = options.reviewMaxDays ?? 180;
  for (const [name, value] of Object.entries({ sourceMaxDays, cacheMaxDays, reviewMaxDays })) {
    if (!Number.isSafeInteger(value) || value < 0 || value > 36500) throw new TypeError(`${name} must be a bounded integer`);
  }
  return Object.freeze({ asOf, today, sourceMaxDays, cacheMaxDays, reviewMaxDays });
}

/**
 * A publication record uses paired localized content with one source and one
 * cache observation. An unknown tier or access state stays unknown.
 * @param {unknown} value
 * @param {number} index
 * @param {ReturnType<typeof policy>} rules
 */
export function auditRecord(value, index, rules) {
  /** @type {Finding[]} */
  const findings = [];
  const root = `records[${index}]`;
  if (!object(value)) {
    add(findings, "record.object", root);
    return { findings, record: null };
  }
  if (!validId(value.id)) add(findings, "record.id", `${root}.id`);
  if (!KINDS.includes(value.kind)) add(findings, "record.kind", `${root}.kind`);
  if (!ACCESS.includes(value.access)) add(findings, "record.access", `${root}.access`);
  if (!TIERS.includes(value.tier)) add(findings, "record.tier", `${root}.tier`);
  if (value.access === "unknown" && value.tier !== "unknown") add(findings, "record.unknown-tier", `${root}.tier`);
  for (const field of ["title", "summary"]) {
    if (!object(value[field])) {
      add(findings, "locale.object", `${root}.${field}`);
      continue;
    }
    for (const lang of LOCALES) {
      if (!safeText(value[field][lang], field === "title" ? 220 : 2400)) {
        add(findings, "locale.text", `${root}.${field}.${lang}`);
      }
    }
  }
  let collected = null;
  if (!object(value.source)) {
    add(findings, "source.object", `${root}.source`);
  } else {
    if (!validId(value.source.id)) add(findings, "source.id", `${root}.source.id`);
    if (!safeText(value.source.publisher, 180)) add(findings, "source.publisher", `${root}.source.publisher`);
    if (!safeText(value.source.licence, 180)) add(findings, "source.licence", `${root}.source.licence`);
    if (!sourceUrl(value.source.url)) add(findings, "source.url", `${root}.source.url`);
    collected = day(value.source.collectedOn);
    if (collected === null) add(findings, "source.date", `${root}.source.collectedOn`);
    else {
      if (collected > rules.today) add(findings, "source.future", `${root}.source.collectedOn`);
      if (rules.today - collected > rules.sourceMaxDays) add(findings, "source.stale", `${root}.source.collectedOn`, "review");
    }
  }
  const reviewed = day(value.reviewedOn);
  if (reviewed === null) add(findings, "record.review-date", `${root}.reviewedOn`);
  else {
    if (reviewed > rules.today) add(findings, "record.future-review", `${root}.reviewedOn`);
    if (rules.today - reviewed > rules.reviewMaxDays) add(findings, "record.stale-review", `${root}.reviewedOn`, "review");
    if (collected !== null && reviewed < collected) add(findings, "record.review-before-source", `${root}.reviewedOn`);
  }
  if (!object(value.cache)) {
    add(findings, "cache.object", `${root}.cache`);
  } else {
    if (!OFFLINE.includes(value.cache.state)) add(findings, "cache.state", `${root}.cache.state`);
    if (value.cache.state === "stored") {
      if (!cachePath(value.cache.path)) add(findings, "cache.path", `${root}.cache.path`);
      const saved = day(value.cache.savedOn);
      if (saved === null) add(findings, "cache.saved-date", `${root}.cache.savedOn`);
      else {
        if (saved > rules.today) add(findings, "cache.future", `${root}.cache.savedOn`);
        if (rules.today - saved > rules.cacheMaxDays) add(findings, "cache.stale", `${root}.cache.savedOn`, "review");
        if (collected !== null && saved < collected) add(findings, "cache.before-source", `${root}.cache.savedOn`);
      }
    } else if (value.cache.path !== undefined || value.cache.savedOn !== undefined) {
      add(findings, "cache.unexpected-location", `${root}.cache`);
    }
  }
  const revision = value.revision;
  if (!Number.isSafeInteger(revision) || revision < 1 || revision > 1000000) {
    add(findings, "record.revision", `${root}.revision`);
  }
  return { findings: sorted(findings), record: findings.some((item) => item.severity === "error") ? null : value };
}

/**
 * @param {unknown} input
 * @param {unknown} [options]
 */
export function auditCollection(input, options = {}) {
  const rules = policy(options);
  /** @type {Finding[]} */
  const findings = [];
  if (!Array.isArray(input)) {
    add(findings, "collection.array", "records");
    return { rules, findings, records: [], validCount: 0 };
  }
  if (input.length > MAX_RECORDS) {
    add(findings, "collection.limit", "records");
    return { rules, findings, records: [], validCount: 0 };
  }
  const ids = new Map();
  const keys = new Map();
  const sources = new Map();
  /** @type {any[]} */
  const valid = [];
  input.forEach((value, index) => {
    const result = auditRecord(value, index, rules);
    findings.push(...result.findings);
    if (!object(value)) return;
    if (validId(value.id)) {
      if (ids.has(value.id)) {
        add(findings, "collection.duplicate-id", `records[${index}].id`);
        add(findings, "collection.duplicate-id", `records[${ids.get(value.id)}].id`);
      } else ids.set(value.id, index);
    }
    if (object(value.cache) && value.cache.state === "stored" && cachePath(value.cache.path)) {
      const previous = keys.get(value.cache.path);
      if (previous !== undefined && previous !== value.id) add(findings, "collection.cache-collision", `records[${index}].cache.path`);
      keys.set(value.cache.path, value.id);
    }
    if (object(value.source) && validId(value.source.id)) {
      const previous = sources.get(value.source.id);
      const current = JSON.stringify([value.source.url, value.source.licence, value.source.collectedOn]);
      if (previous !== undefined && previous !== current) add(findings, "collection.source-conflict", `records[${index}].source.id`);
      sources.set(value.source.id, current);
    }
    if (result.record !== null) valid.push(result.record);
  });
  const failedIndices = new Set(findings.filter((finding) => finding.severity === "error")
    .map((finding) => /^records\[(\d+)\]/.exec(finding.path)?.[1]).filter((value) => value !== undefined));
  const records = valid.filter((record) => {
    const index = input.indexOf(record);
    return !failedIndices.has(String(index));
  });
  return { rules, findings: sorted(findings), records, validCount: records.length };
}
