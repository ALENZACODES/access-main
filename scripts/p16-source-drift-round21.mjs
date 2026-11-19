/**
 * P16 source-drift audit for bilingual offline information records.
 * Pure functions: no network access, persistence, locale fallback, or metadata inference.
 * Findings report structural paths and codes, never the supplied record content.
 */

export const LANGUAGES = Object.freeze(["en", "fr"]);
export const TIERS = Object.freeze(["primary", "secondary", "community", "unknown"]);
export const AVAILABILITY = Object.freeze(["available", "unavailable", "unknown"]);
export const CACHE_STATES = Object.freeze(["stored", "not-stored", "unknown"]);
const KEY = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** @param {unknown} value */
function plain(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === null || proto === Object.prototype;
}

/** @param {unknown} value */
export function hasControlCharacters(value) {
  if (typeof value !== "string") return false;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code <= 31 || code === 127) return true;
  }
  return false;
}

/** @param {unknown} value @param {number} [maximum] */
export function boundedText(value, maximum = 2048) {
  return typeof value === "string" && value.trim().length > 0 &&
    value.length <= maximum && !hasControlCharacters(value);
}

/** @param {unknown} value */
export function isoDay(value) {
  if (typeof value !== "string") return null;
  const parts = ISO_DATE.exec(value);
  if (!parts) return null;
  const year = Number(parts[1]);
  const month = Number(parts[2]);
  const day = Number(parts[3]);
  if (year < 1970 || year > 9999 || month < 1 || month > 12 || day < 1 || day > 31) return null;
  const d = new Date(Date.UTC(year, month - 1, day));
  if (d.getUTCFullYear() !== year || d.getUTCMonth() + 1 !== month || d.getUTCDate() !== day) return null;
  return Math.floor(d.getTime() / 86400000);
}

/** @param {unknown} value */
export function secureSource(value) {
  if (typeof value !== "string" || !boundedText(value, 2048) || value.trim() !== value || /\s/u.test(value)) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && Boolean(url.hostname) &&
      !url.username && !url.password && url.hash.length === 0 &&
      url.hostname !== "localhost" && url.hostname !== "127.0.0.1";
  } catch {
    return false;
  }
}

/** @param {unknown} value */
export function localAsset(value) {
  if (typeof value !== "string" || value.length > 1024 || hasControlCharacters(value)) return false;
  if (!value.startsWith("/offline/") || value.includes("\\") || value.includes("?") ||
    value.includes("#") || value.includes("%")) return false;
  const segments = value.slice(1).split("/");
  return segments.every((s) => s.length > 0 && s !== "." && s !== "..");
}

/** @param {Array<{code:string,path:string}>} output @param {string} code @param {string} path */
function finding(output, code, path) {
  output.push({ code, path });
}

/** @param {any} source @param {string} path @param {Array<{code:string,path:string}>} output @param {number} today */
function sourceMetadata(source, path, output, today) {
  if (!plain(source)) {
    finding(output, "source.object", path);
    return null;
  }
  if (!boundedText(source.name, 160)) finding(output, "source.name", `${path}.name`);
  if (!boundedText(source.licence, 160)) finding(output, "source.licence", `${path}.licence`);
  if (!secureSource(source.url)) finding(output, "source.url", `${path}.url`);
  if (!TIERS.includes(source.tier)) finding(output, "source.tier", `${path}.tier`);
  const collected = isoDay(source.collectedOn);
  if (collected === null) finding(output, "source.date", `${path}.collectedOn`);
  else if (collected > today) finding(output, "source.future-date", `${path}.collectedOn`);
  return collected;
}

/** @param {any} value @param {string} path @param {Array<{code:string,path:string}>} issues @param {number} today */
function checkRecord(value, path, issues, today) {
  if (!plain(value)) {
    finding(issues, "record.object", path);
    return null;
  }
  if (typeof value.id !== "string" || !KEY.test(value.id)) finding(issues, "record.id", `${path}.id`);
  if (typeof value.pairKey !== "string" || !KEY.test(value.pairKey)) finding(issues, "record.pair-key", `${path}.pairKey`);
  if (!LANGUAGES.includes(value.locale)) finding(issues, "record.locale", `${path}.locale`);
  if (!AVAILABILITY.includes(value.availability)) finding(issues, "record.availability", `${path}.availability`);
  if (!boundedText(value.title, 200)) finding(issues, "record.title", `${path}.title`);
  if (!boundedText(value.description)) finding(issues, "record.description", `${path}.description`);
  const collected = sourceMetadata(value.source, `${path}.source`, issues, today);
  const cache = value.cache;
  if (!plain(cache)) {
    finding(issues, "cache.object", `${path}.cache`);
  } else {
    if (!CACHE_STATES.includes(cache.state)) finding(issues, "cache.state", `${path}.cache.state`);
    if (cache.state === "stored") {
      if (!localAsset(cache.path)) finding(issues, "cache.path", `${path}.cache.path`);
      const cachedAt = isoDay(cache.capturedOn);
      if (cachedAt === null) finding(issues, "cache.capture-date", `${path}.cache.capturedOn`);
      else {
        if (cachedAt > today) finding(issues, "cache.future-date", `${path}.cache.capturedOn`);
        if (collected !== null && cachedAt < collected) finding(issues, "cache.predates-source", `${path}.cache.capturedOn`);
      }
    } else if (cache.path !== undefined || cache.capturedOn !== undefined) {
      finding(issues, "cache.unexpected-data", `${path}.cache`);
    }
  }
  return value;
}

/** @param {any} source */
function normalizedSource(source) {
  if (!plain(source)) return null;
  // Comparing only documented source fields prevents locale-specific copy from
  // leaking into an audit, while identifying different evidence behind a pair.
  return [source.url, source.licence, source.collectedOn, source.tier].map(String);
}

/** @param {any} first @param {any} second @param {string} base @param {Array<{code:string,path:string}>} issues */
function checkPair(first, second, base, issues) {
  if (first.availability !== second.availability) finding(issues, "pair.availability", `${base}.availability`);
  const left = normalizedSource(first.source);
  const right = normalizedSource(second.source);
  if (left && right) {
    for (let index = 0; index < left.length; index += 1) {
      if (left[index] !== right[index]) {
        const field = ["url", "licence", "collectedOn", "tier"][index];
        finding(issues, "pair.source-drift", `${base}.source.${field}`);
      }
    }
  }
  if (plain(first.cache) && plain(second.cache)) {
    if (first.cache.state !== second.cache.state) finding(issues, "pair.cache-state", `${base}.cache.state`);
    if (first.cache.state === "stored" && second.cache.state === "stored") {
      if (first.cache.capturedOn !== second.cache.capturedOn) finding(issues, "pair.cache-date", `${base}.cache.capturedOn`);
      if (first.cache.path === second.cache.path) finding(issues, "pair.shared-asset", `${base}.cache.path`);
    }
  }
}

/**
 * @param {unknown} input - Current bilingual records.
 * @param {{asOf: string, requireBothLocales?: boolean}} options
 * @returns {{findings: Array<{code:string,path:string}>, records:number, pairs:number, stored:number}}
 */
export function auditSourceDrift(input, options) {
  const date = isoDay(options?.asOf);
  if (date === null) throw new TypeError("asOf must be an ISO calendar date");
  /** @type {Array<{code:string,path:string}>} */
  const issues = [];
  if (!Array.isArray(input)) {
    finding(issues, "set.array", "records");
    return { findings: issues, records: 0, pairs: 0, stored: 0 };
  }
  /** @type {Set<string>} */
  const seenIds = new Set();
  /** @type {Map<string,string>} */
  const cacheOwners = new Map();
  /** @type {Map<string,Map<string,any>>} */
  const groups = new Map();
  let stored = 0;
  input.forEach((raw, i) => {
    const path = `records[${i}]`;
    const record = checkRecord(raw, path, issues, date);
    if (!record) return;
    if (typeof record.id === "string" && KEY.test(record.id)) {
      if (seenIds.has(record.id)) finding(issues, "set.duplicate-id", `${path}.id`);
      seenIds.add(record.id);
    }
    if (plain(record.cache) && record.cache.state === "stored") {
      stored += 1;
      if (localAsset(record.cache.path)) {
        const owner = cacheOwners.get(record.cache.path);
        if (owner !== undefined && owner !== record.id) finding(issues, "set.asset-conflict", `${path}.cache.path`);
        else cacheOwners.set(record.cache.path, record.id);
      }
    }
    if (typeof record.pairKey === "string" && KEY.test(record.pairKey) && LANGUAGES.includes(record.locale)) {
      const group = groups.get(record.pairKey) ?? new Map();
      if (group.has(record.locale)) finding(issues, "pair.duplicate-locale", `${path}.locale`);
      else group.set(record.locale, record);
      groups.set(record.pairKey, group);
    }
  });
  for (const [pairKey, group] of groups) {
    const first = group.get("en");
    const second = group.get("fr");
    if (options?.requireBothLocales !== false) {
      if (!first) finding(issues, "pair.missing-en", `pairs.${pairKey}.en`);
      if (!second) finding(issues, "pair.missing-fr", `pairs.${pairKey}.fr`);
    }
    if (first && second) checkPair(first, second, `pairs.${pairKey}`, issues);
  }
  issues.sort((a, b) => a.path.localeCompare(b.path, "en") || a.code.localeCompare(b.code, "en"));
  return { findings: issues, records: input.length, pairs: groups.size, stored };
}

/** @param {Array<{code:string,path:string}>} findings */
export function findingCounts(findings) {
  /** @type {Record<string,number>} */
  const counts = Object.create(null);
  for (const item of findings) {
    counts[item.code] = (counts[item.code] ?? 0) + 1;
  }
  return Object.entries(counts).sort(([a], [b]) => a.localeCompare(b, "en"))
    .map(([code, count]) => ({ code, count }));
}
