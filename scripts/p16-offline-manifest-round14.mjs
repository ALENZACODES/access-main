/** Read-only checks for a bilingual accessibility record cache manifest. */
export const LANGUAGES = Object.freeze(["en", "fr"]);
export const TIERS = Object.freeze(["primary", "secondary", "community", "unknown"]);
export const STATES = Object.freeze(["available", "unavailable", "unknown"]);
export const CACHE_STATES = Object.freeze(["cached", "not-cached", "unknown"]);
const KEY = /^[a-z][a-z0-9._-]{0,95}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

function object(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value) &&
    (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}

/** Input safety uses code points rather than a control-character regex. */
export function hasUnsafeCodePoint(value) {
  if (typeof value !== "string") return true;
  for (const character of value) {
    const code = character.codePointAt(0);
    if (code === undefined || code <= 31 || (code >= 127 && code <= 159)) return true;
  }
  return false;
}

export function safeText(value, length = 240) {
  return typeof value === "string" && value.trim().length > 0 &&
    value.length <= length && !hasUnsafeCodePoint(value);
}

export function calendarDay(value) {
  if (typeof value !== "string" || !DATE.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  if (year === undefined || month === undefined || day === undefined || year < 100) return false;
  const result = new Date(0);
  result.setUTCHours(0, 0, 0, 0);
  result.setUTCFullYear(year, month - 1, day);
  return result.getUTCFullYear() === year && result.getUTCMonth() === month - 1 && result.getUTCDate() === day;
}

/** Only HTTPS URLs without embedded credentials may be referenced. */
export function safeAttributionUrl(value) {
  if (typeof value !== "string" || value.length > 2048 || hasUnsafeCodePoint(value)) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && Boolean(url.hostname) && !url.username &&
      !url.password && !url.hash && url.origin !== "null";
  } catch {
    return false;
  }
}

/** Cache keys describe resources inside the application, never network endpoints. */
export function safeOfflinePath(value) {
  if (typeof value !== "string" || value.length > 1024 || hasUnsafeCodePoint(value)) return false;
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\") ||
      value.includes("?") || value.includes("#") || value.includes("%")) return false;
  return value.split("/").every((segment) => segment !== "." && segment !== "..");
}

function add(issues, code, path) {
  issues.push(Object.freeze({ code, path }));
}

/**
 * A record is a declaration, not a judgement about any physical location.
 * Never change data in place or infer an unknown state from another field.
 */
export function auditOfflineRecord(record, path = "record") {
  const issues = [];
  if (!object(record)) {
    add(issues, "record.object", path);
    return issues;
  }
  if (!safeText(record.key, 96) || !KEY.test(record.key)) add(issues, "record.key", `${path}.key`);
  if (!LANGUAGES.includes(record.language)) add(issues, "record.language", `${path}.language`);
  if (!safeText(record.title, 200)) add(issues, "record.title", `${path}.title`);
  if (!safeText(record.description, 2000)) add(issues, "record.description", `${path}.description`);
  if (!STATES.includes(record.state)) add(issues, "record.state", `${path}.state`);
  if (!TIERS.includes(record.tier)) add(issues, "record.tier", `${path}.tier`);
  if (record.state === "unknown" && record.tier !== "unknown") {
    add(issues, "record.unknown-tier", `${path}.tier`);
  }
  if (!object(record.attribution)) {
    add(issues, "attribution.object", `${path}.attribution`);
  } else {
    if (!safeText(record.attribution.source, 160)) add(issues, "attribution.source", `${path}.attribution.source`);
    if (!safeAttributionUrl(record.attribution.url)) add(issues, "attribution.url", `${path}.attribution.url`);
    if (!safeText(record.attribution.licence, 160)) add(issues, "attribution.licence", `${path}.attribution.licence`);
    if (!calendarDay(record.attribution.collectedOn)) add(issues, "attribution.date", `${path}.attribution.collectedOn`);
  }
  if (!object(record.offline)) {
    add(issues, "offline.object", `${path}.offline`);
  } else {
    if (!CACHE_STATES.includes(record.offline.state)) add(issues, "offline.state", `${path}.offline.state`);
    if (record.offline.state === "cached") {
      if (!safeOfflinePath(record.offline.path)) add(issues, "offline.path", `${path}.offline.path`);
    } else if (record.offline.path !== undefined && record.offline.path !== null) {
      add(issues, "offline.unexpected-path", `${path}.offline.path`);
    }
  }
  return issues;
}

/**
 * Each translation pair has independent metadata: one language cannot borrow
 * another language's attribution, date, licence, tier, or offline status.
 */
export function auditOfflineManifest(records, options = {}) {
  const issues = [];
  if (!Array.isArray(records)) {
    add(issues, "manifest.array", "records");
    return issues;
  }
  const seen = new Set();
  const groups = new Map();
  records.forEach((record, index) => {
    const path = `records[${index}]`;
    issues.push(...auditOfflineRecord(record, path));
    if (!object(record)) return;
    if (typeof record.key !== "string" || !KEY.test(record.key) || !LANGUAGES.includes(record.language)) return;
    const identity = JSON.stringify([record.key, record.language]);
    if (seen.has(identity)) add(issues, "manifest.duplicate", `${path}.key`);
    seen.add(identity);
    const set = groups.get(record.key) ?? new Set();
    set.add(record.language);
    groups.set(record.key, set);
  });
  if (options.requireBothLanguages === true) {
    for (const [key, languages] of groups) {
      for (const language of LANGUAGES) {
        if (!languages.has(language)) add(issues, "manifest.missing-language", `languages.${key}.${language}`);
      }
    }
  }
  return issues;
}

/**
 * Return immutable, bounded, data-free counts. Do not expose user text in
 * diagnostics or turn audit results into claims about live availability.
 */
export function summarizeOfflineIssues(issues) {
  const counts = new Map();
  for (const issue of issues) {
    if (!object(issue) || typeof issue.code !== "string") continue;
    counts.set(issue.code, (counts.get(issue.code) ?? 0) + 1);
  }
  return Object.freeze([...counts].sort(([a], [b]) => a.localeCompare(b))
    .map(([code, count]) => Object.freeze({ code, count })));
}

/**
 * A stable inventory for human review, without record descriptions or
 * attribution URLs, sorted by key and language.
 */
export function manifestInventory(records) {
  if (!Array.isArray(records)) return [];
  const inventory = [];
  for (const record of records) {
    if (!object(record) || typeof record.key !== "string" || !KEY.test(record.key) ||
        !LANGUAGES.includes(record.language)) continue;
    inventory.push(Object.freeze({ key: record.key, language: record.language,
      tier: TIERS.includes(record.tier) ? record.tier : "unknown",
      state: STATES.includes(record.state) ? record.state : "unknown",
      offline: object(record.offline) && CACHE_STATES.includes(record.offline.state)
        ? record.offline.state : "unknown" }));
  }
  inventory.sort((a, b) => a.key.localeCompare(b.key) || a.language.localeCompare(b.language));
  return Object.freeze(inventory);
}
