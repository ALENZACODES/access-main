/**
 * P16 offline receipt reconciliation. Read-only, deterministic and dependency-free.
 * The caller owns persistence and supplies records from its trusted storage.
 * No network requests, clock reads, user identifiers, or hidden fallbacks.
 */

export const RECEIPT_LOCALES = Object.freeze(["en", "fr"]);
export const RECEIPT_TIERS = Object.freeze(["primary", "secondary", "community", "unknown"]);
export const RECEIPT_STATES = Object.freeze(["available", "unavailable", "unknown"]);
export const CACHE_STATES = Object.freeze(["stored", "missing", "stale", "unknown"]);

const ID = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MAX_TITLE = 200;
const MAX_DESCRIPTION = 2400;
const MAX_URL = 2048;
const MAX_ITEMS = 10000;

/** @param {unknown} value */
export function hasAsciiControl(value) {
  if (typeof value !== "string") return false;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code < 32 || code === 127) return true;
  }
  return false;
}

/** @param {unknown} value @returns {value is Record<string, any>} */
function isObject(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/** @param {unknown} value @param {number} limit @returns {value is string} */
function text(value, limit) {
  return typeof value === "string" && value.trim().length > 0 &&
    value.length <= limit && !hasAsciiControl(value);
}

/** @param {unknown} value */
function id(value) {
  return typeof value === "string" && value.length <= 96 && ID.test(value);
}

/** Returns days since the Unix epoch for an actual calendar day.
 * @param {unknown} value
 */
export function calendarOrdinal(value) {
  if (typeof value !== "string") return null;
  const match = DATE.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1970 || year > 9999 || month < 1 || month > 12 || day < 1 || day > 31) return null;
  const actual = new Date(Date.UTC(year, month - 1, day));
  if (actual.getUTCFullYear() !== year || actual.getUTCMonth() + 1 !== month || actual.getUTCDate() !== day) return null;
  return Math.floor(actual.getTime() / 86_400_000);
}

/** Only HTTPS public source references, without embedded credentials or fragments. */
/** @param {unknown} value */
export function sourceUrlAllowed(value) {
  if (!text(value, MAX_URL) || value !== value.trim()) return false;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || !url.hostname || url.username || url.password || url.hash) return false;
    const host = url.hostname.toLowerCase();
    if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) return false;
    if (host === "0.0.0.0" || host === "127.0.0.1" || host === "[::1]") return false;
    if (/^127(?:\.\d{1,3}){3}$/.test(host)) return false;
    return true;
  } catch {
    return false;
  }
}

/** Strict local asset key: no encoding, query, fragments, traversal or empty segments. */
/** @param {unknown} value */
export function offlineKeyAllowed(value) {
  if (typeof value !== "string" || value.length > 1024) return false;
  if (!value.startsWith("/offline/") || hasAsciiControl(value)) return false;
  if (value.includes("\\") || value.includes("%") || value.includes("?") || value.includes("#")) return false;
  const segments = value.split("/").slice(1);
  if (segments.some((segment) => segment === "" || segment === "." || segment === "..")) return false;
  return segments.every((segment) => /^[a-zA-Z0-9._-]+$/.test(segment));
}

/** @typedef {{code:string,path:string}} ReceiptFinding */
/** @param {ReceiptFinding[]} issues @param {string} code @param {string} path */
function add(issues, code, path) {
  issues.push({ code, path });
}

/**
 * A receipt is an observation about an existing offline copy; never evidence
 * that a location is physically accessible or that a source is current.
 *
 * Record:
 * { id, locale, title, description, availability, tier,
 *   source:{id,name,url,licence,collectedOn},
 *   cache:{state,key?,savedOn?,sourceCollectedOn?} }
 *
 * @param {unknown} value
 * @param {{asOf?:string, maxAgeDays?:number}} [options]
 * @param {string} [path]
 * @returns {ReceiptFinding[]}
 */
export function auditReceipt(value, options = {}, path = "receipt") {
  /** @type {ReceiptFinding[]} */
  const issues = [];
  const asOf = calendarOrdinal(options.asOf ?? "2026-11-19");
  if (asOf === null) throw new TypeError("asOf must be a real calendar date");
  const maxAge = options.maxAgeDays ?? 365;
  if (!Number.isSafeInteger(maxAge) || maxAge < 0 || maxAge > 36500) {
    throw new TypeError("maxAgeDays must be an integer between zero and 36500");
  }
  if (!isObject(value)) {
    add(issues, "receipt.object", path);
    return issues;
  }
  if (!id(value.id)) add(issues, "receipt.id", `${path}.id`);
  if (!RECEIPT_LOCALES.includes(value.locale)) add(issues, "receipt.locale", `${path}.locale`);
  if (!text(value.title, MAX_TITLE)) add(issues, "receipt.title", `${path}.title`);
  if (!text(value.description, MAX_DESCRIPTION)) add(issues, "receipt.description", `${path}.description`);
  if (!RECEIPT_STATES.includes(value.availability)) add(issues, "receipt.availability", `${path}.availability`);
  if (!RECEIPT_TIERS.includes(value.tier)) add(issues, "receipt.tier", `${path}.tier`);
  if (value.availability === "unknown" && value.tier !== "unknown") {
    add(issues, "receipt.unknown-tier", `${path}.tier`);
  }
  let collected = null;
  if (!isObject(value.source)) {
    add(issues, "source.object", `${path}.source`);
  } else {
    const source = value.source;
    if (!id(source.id)) add(issues, "source.id", `${path}.source.id`);
    if (!text(source.name, 160)) add(issues, "source.name", `${path}.source.name`);
    if (!text(source.licence, 160)) add(issues, "source.licence", `${path}.source.licence`);
    if (!sourceUrlAllowed(source.url)) add(issues, "source.url", `${path}.source.url`);
    collected = calendarOrdinal(source.collectedOn);
    if (collected === null) add(issues, "source.date", `${path}.source.collectedOn`);
    else {
      if (collected > asOf) add(issues, "source.future", `${path}.source.collectedOn`);
      if (asOf - collected > maxAge) add(issues, "source.age", `${path}.source.collectedOn`);
    }
  }
  if (!isObject(value.cache)) {
    add(issues, "cache.object", `${path}.cache`);
    return issues;
  }
  const cache = value.cache;
  if (!CACHE_STATES.includes(cache.state)) add(issues, "cache.state", `${path}.cache.state`);
  if (cache.state === "stored" || cache.state === "stale") {
    if (!offlineKeyAllowed(cache.key)) add(issues, "cache.key", `${path}.cache.key`);
    const saved = calendarOrdinal(cache.savedOn);
    if (saved === null) add(issues, "cache.saved-date", `${path}.cache.savedOn`);
    else {
      if (saved > asOf) add(issues, "cache.future", `${path}.cache.savedOn`);
      if (collected !== null && saved < collected) add(issues, "cache.before-source", `${path}.cache.savedOn`);
    }
    const sourceDate = calendarOrdinal(cache.sourceCollectedOn);
    if (sourceDate === null) add(issues, "cache.source-date", `${path}.cache.sourceCollectedOn`);
    else if (collected !== null && sourceDate !== collected) {
      add(issues, "cache.source-mismatch", `${path}.cache.sourceCollectedOn`);
    }
  } else if (cache.key !== undefined || cache.savedOn !== undefined || cache.sourceCollectedOn !== undefined) {
    add(issues, "cache.unexpected-fields", `${path}.cache`);
  }
  return issues;
}

/**
 * Audit a bilingual set, detecting duplicates, missing counterparts and
 * inconsistent source metadata. No translation or fallback is synthesized.
 *
 * @param {unknown} input
 * @param {{asOf?:string,maxAgeDays?:number,requireBothLocales?:boolean}} [options]
 * @returns {ReceiptFinding[]}
 */
export function auditReceiptSet(input, options = {}) {
  /** @type {ReceiptFinding[]} */
  const issues = [];
  if (!Array.isArray(input)) {
    add(issues, "set.array", "receipts");
    return issues;
  }
  if (input.length > MAX_ITEMS) {
    add(issues, "set.too-large", "receipts");
    return issues;
  }
  const seen = new Set();
  const locales = new Map();
  const cacheOwners = new Map();
  const sourceById = new Map();
  input.forEach((value, index) => {
    const at = `receipts[${index}]`;
    issues.push(...auditReceipt(value, options, at));
    if (!isObject(value) || !id(value.id)) return;
    const locale = value.locale;
    if (RECEIPT_LOCALES.includes(locale)) {
      const name = `${value.id}/${locale}`;
      if (seen.has(name)) add(issues, "set.duplicate", `${at}.id`);
      seen.add(name);
      const group = locales.get(value.id) ?? new Set();
      group.add(locale);
      locales.set(value.id, group);
    }
    if (isObject(value.cache) && offlineKeyAllowed(value.cache.key) &&
      (value.cache.state === "stored" || value.cache.state === "stale")) {
      const owner = cacheOwners.get(value.cache.key);
      if (owner !== undefined && owner !== `${value.id}/${locale}`) {
        add(issues, "set.cache-collision", `${at}.cache.key`);
      } else cacheOwners.set(value.cache.key, `${value.id}/${locale}`);
    }
    if (isObject(value.source) && id(value.source.id)) {
      const source = value.source;
      const meta = JSON.stringify([source.name, source.url, source.licence, source.collectedOn]);
      const existing = sourceById.get(source.id);
      if (existing !== undefined && existing !== meta) {
        add(issues, "set.source-inconsistent", `${at}.source`);
      } else sourceById.set(source.id, meta);
    }
  });
  if (options.requireBothLocales) {
    for (const [recordId, observed] of locales) {
      for (const locale of RECEIPT_LOCALES) {
        if (!observed.has(locale)) add(issues, "set.missing-locale", `records.${recordId}.${locale}`);
      }
    }
  }
  return issues.sort((a, b) => a.path.localeCompare(b.path, "en") || a.code.localeCompare(b.code, "en"));
}

/** The cached entry may be used offline only if both metadata and receipt agree. */
/** @param {unknown} receipt @param {{asOf?:string,maxAgeDays?:number}} [options] */
export function offlineEligibility(receipt, options = {}) {
  const findings = auditReceipt(receipt, options);
  const cache = isObject(receipt) && isObject(receipt.cache) ? receipt.cache : null;
  const source = isObject(receipt) && isObject(receipt.source) ? receipt.source : null;
  const metadataSafe = findings.length === 0 && cache !== null && source !== null;
  if (!metadataSafe || cache.state !== "stored") {
    return { eligible: false, state: cache?.state ?? "unknown", key: null, reason: findings.length ? "invalid-metadata" : "not-stored" };
  }
  return { eligible: true, state: "stored", key: cache.key, reason: "ready" };
}

/** Locale-independent, deterministic counts for logs; never includes source copy. */
/** @param {readonly ReceiptFinding[]} findings */
export function receiptSummary(findings) {
  const counts = Object.create(null);
  for (const finding of findings) {
    if (!finding || typeof finding.code !== "string") continue;
    counts[finding.code] = (counts[finding.code] ?? 0) + 1;
  }
  return Object.entries(counts).sort(([a], [b]) => a.localeCompare(b, "en"))
    .map(([code, count]) => ({ code, count }));
}
