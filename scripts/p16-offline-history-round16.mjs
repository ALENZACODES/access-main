/**
 * Immutable offline publication history inspection.
 * Input is caller-owned; no network, file writes, storage mutation or time reads.
 * A record's publication evidence is never inferred from its descriptive copy.
 */

const LANGUAGES = Object.freeze(["en", "fr"]);
const TIERS = Object.freeze(["primary", "secondary", "community", "unknown"]);
const STATES = Object.freeze(["cached", "not-cached", "unknown"]);
const ID = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** @param {unknown} value */
function object(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** @param {string} value */
export function containsAsciiControl(value) {
  for (let index = 0; index < value.length; index += 1) {
    const point = value.charCodeAt(index);
    if (point <= 31 || point === 127) return true;
  }
  return false;
}

/** @param {unknown} value */
function bounded(value) {
  return typeof value === "string" && value.trim().length > 0 &&
    value.length <= 512 && !containsAsciiControl(value);
}

/** @param {unknown} value */
export function canonicalDay(value) {
  if (typeof value !== "string") return false;
  const match = DATE.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1970 || year > 9999 || month < 1 || month > 12 || day < 1) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

/** @param {unknown} value */
export function localAssetPath(value) {
  if (typeof value !== "string" || value.length > 1024) return false;
  if (!value.startsWith("/offline/") || containsAsciiControl(value)) return false;
  if (value.includes("\\") || value.includes("%") || value.includes("?") || value.includes("#")) return false;
  if (value.split("/").some((item) => item === "." || item === "..")) return false;
  return value.split("/").slice(1).every((item) => item.length > 0);
}

/** @param {unknown} value */
export function secureAttribution(value) {
  if (typeof value !== "string" || value.length > 2048 || containsAsciiControl(value)) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && Boolean(url.hostname) && !url.username &&
      !url.password && !url.hash;
  } catch {
    return false;
  }
}

/** @typedef {{code: string, path: string}} Finding */
/**
 * @typedef {{id: string, locale: string, revision: number, capturedOn: string,
 *  cacheState: string, assetPath?: string, title: string,
 *  source: {name: string, url: string, licence: string, collectedOn: string, tier: string}}} Snapshot
 */

/**
 * @param {unknown} data
 * @param {{asOf: string, requireLanguages?: boolean}} options
 * @returns {{findings: Finding[], entries: number, current: ReadonlyArray<{id: string, locale: string, revision: number, cacheState: string, assetPath: string | null}>}}
 */
export function inspectOfflineHistory(data, options) {
  if (!object(options) || !canonicalDay(options.asOf)) throw new TypeError("asOf must be an ISO calendar day");
  /** @type {Finding[]} */
  const findings = [];
  const issue = (code, path) => { findings.push({ code, path }); };
  if (!Array.isArray(data)) {
    issue("history.not-array", "history");
    return { findings, entries: 0, current: [] };
  }
  /** @type {Map<string, Array<{record: Snapshot, path: string}>>} */
  const groups = new Map();
  const assetOwners = new Map();
  data.forEach((entry, index) => {
    const base = `history[${index}]`;
    if (!object(entry)) { issue("entry.not-object", base); return; }
    const id = entry.id;
    const locale = entry.locale;
    if (typeof id !== "string" || !ID.test(id)) issue("entry.id", `${base}.id`);
    if (!LANGUAGES.includes(locale)) issue("entry.locale", `${base}.locale`);
    if (!Number.isSafeInteger(entry.revision) || entry.revision < 1) issue("entry.revision", `${base}.revision`);
    if (!bounded(entry.title)) issue("entry.title", `${base}.title`);
    if (!canonicalDay(entry.capturedOn) || entry.capturedOn > options.asOf) issue("entry.captured-on", `${base}.capturedOn`);
    if (!STATES.includes(entry.cacheState)) issue("entry.cache-state", `${base}.cacheState`);
    if (entry.cacheState === "cached") {
      if (!localAssetPath(entry.assetPath)) issue("entry.asset-path", `${base}.assetPath`);
    } else if (entry.assetPath !== undefined && entry.assetPath !== null) {
      issue("entry.unexpected-asset", `${base}.assetPath`);
    }
    if (!object(entry.source)) {
      issue("source.not-object", `${base}.source`);
    } else {
      if (!bounded(entry.source.name)) issue("source.name", `${base}.source.name`);
      if (!secureAttribution(entry.source.url)) issue("source.url", `${base}.source.url`);
      if (!bounded(entry.source.licence)) issue("source.licence", `${base}.source.licence`);
      if (!canonicalDay(entry.source.collectedOn) || entry.source.collectedOn > options.asOf) {
        issue("source.collected-on", `${base}.source.collectedOn`);
      } else if (canonicalDay(entry.capturedOn) && entry.source.collectedOn > entry.capturedOn) {
        issue("source.collection-after-capture", `${base}.source.collectedOn`);
      }
      if (!TIERS.includes(entry.source.tier)) issue("source.tier", `${base}.source.tier`);
    }
    if (typeof id === "string" && ID.test(id) && LANGUAGES.includes(locale) &&
        Number.isSafeInteger(entry.revision) && entry.revision > 0) {
      const key = `${id}|${locale}`;
      const list = groups.get(key) ?? [];
      list.push({ record: /** @type {Snapshot} */ (entry), path: base });
      groups.set(key, list);
      if (entry.cacheState === "cached" && localAssetPath(entry.assetPath)) {
        const owner = assetOwners.get(entry.assetPath);
        if (owner !== undefined && owner !== key) issue("asset.shared-by-records", `${base}.assetPath`);
        else assetOwners.set(entry.assetPath, key);
      }
    }
  });
  /** @type {Array<{id: string, locale: string, revision: number, cacheState: string, assetPath: string | null}>} */
  const current = [];
  for (const [key, series] of groups) {
    series.sort((left, right) => left.record.revision - right.record.revision);
    for (let index = 0; index < series.length; index += 1) {
      const item = series[index];
      if (!item) continue;
      const prior = series[index - 1];
      if (prior?.record.revision === item.record.revision) issue("revision.duplicate", `${item.path}.revision`);
      if (prior && item.record.capturedOn < prior.record.capturedOn) issue("revision.date-regression", `${item.path}.capturedOn`);
      if (prior && item.record.revision > prior.record.revision + 1) issue("revision.gap", `${item.path}.revision`);
    }
    const latest = series.at(-1)?.record;
    if (!latest) continue;
    current.push({ id: latest.id, locale: latest.locale, revision: latest.revision,
      cacheState: latest.cacheState, assetPath: latest.cacheState === "cached" ? latest.assetPath ?? null : null });
    if (options.requireLanguages) {
      const partner = `${latest.id}|${latest.locale === "en" ? "fr" : "en"}`;
      if (!groups.has(partner)) issue("language.missing-counterpart", `records.${key}`);
    }
  }
  findings.sort((left, right) => left.path.localeCompare(right.path, "en") || left.code.localeCompare(right.code, "en"));
  current.sort((left, right) => left.id.localeCompare(right.id, "en") || left.locale.localeCompare(right.locale, "en"));
  return { findings, entries: data.length, current };
}

/** Use only typed paths and codes in logs. The content of records is not echoed. */
export function summary(result) {
  return {
    entries: result.entries,
    current: result.current.length,
    findings: result.findings.length,
    categories: [...new Set(result.findings.map(({ code }) => code))].sort(),
  };
}
