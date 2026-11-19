/**
 * P16 offline evidence discrepancy casebook. All functions are pure and do not
 * read storage, make network requests, or mutate their caller's records.
 */
import {
  cleanText, validId, dayOrdinal, safeOfflinePath, safeSourceUrl,
  checkFrenchTypography, sortFindings,
} from "../p16-evidence-triage-round27/contracts.mjs";

export const CASE_STATES = Object.freeze(["OPEN", "NEEDS_SOURCE", "NEEDS_LANGUAGE", "NEEDS_CACHE", "RESOLVED", "UNKNOWN"]);
export const SEVERITIES = Object.freeze(["critical", "high", "normal", "low", "unknown"]);
export const EVENTS = Object.freeze(["OPEN", "NOTE", "SOURCE_ADDED", "LANGUAGE_FIXED", "CACHE_REPLACED", "REVIEW", "RESOLVE", "REOPEN"]);
export const EVIDENCE_STATES = Object.freeze(["SUPPORTED", "UNSUPPORTED", "UNKNOWN"]);
export const SOURCE_TIERS = Object.freeze(["PRIMARY", "SECONDARY", "COMMUNITY", "UNKNOWN"]);
const MAX_CASES = 10000;
const MAX_TEXT = 1200;
const DAY = "2026-11-19";

/** @param {unknown} v @returns {v is Record<string, any>} */
export function object(v) {
  if (v === null || typeof v !== "object" || Array.isArray(v)) return false;
  const prototype = Object.getPrototypeOf(v);
  return prototype === Object.prototype || prototype === null;
}

/** @param {unknown} v */
export function safeId(v) {
  return typeof v === "string" && v.length <= 96 && validId(v);
}

/** @param {unknown} v */
export function safeDescription(v) {
  return typeof v === "string" && v.length <= MAX_TEXT && cleanText(v, MAX_TEXT);
}

/** @param {unknown} v */
export function safeDate(v) {
  return dayOrdinal(v) !== null;
}

/** @param {unknown} v */
export function copyIssues(v, path = "copy") {
  const results = [];
  if (!object(v)) return [{ code: "copy.object", path }];
  for (const locale of ["en", "fr"]) {
    if (!safeDescription(v[locale])) {
      results.push({ code: "copy.missing", path: `${path}.${locale}` });
    }
  }
  if (safeDescription(v.fr)) {
    for (const code of checkFrenchTypography(v.fr)) results.push({ code, path: `${path}.fr` });
  }
  return results;
}

/** @param {unknown} value @param {string} path */
export function referenceIssues(value, path = "reference") {
  const findings = [];
  if (!object(value)) return [{ code: "reference.object", path }];
  if (!safeId(value.id)) findings.push({ code: "reference.id", path: `${path}.id` });
  if (!safeDescription(value.publisher)) findings.push({ code: "reference.publisher", path: `${path}.publisher` });
  if (!safeDescription(value.licence)) findings.push({ code: "reference.licence", path: `${path}.licence` });
  if (!safeSourceUrl(value.url)) findings.push({ code: "reference.url", path: `${path}.url` });
  if (!safeDate(value.collectedOn)) findings.push({ code: "reference.date", path: `${path}.collectedOn` });
  if (!SOURCE_TIERS.includes(value.tier)) findings.push({ code: "reference.tier", path: `${path}.tier` });
  if (value.claim !== undefined && !EVIDENCE_STATES.includes(value.claim)) findings.push({ code: "reference.claim", path: `${path}.claim` });
  return findings;
}

/** @param {unknown} value @param {string} path */
export function cacheIssues(value, path = "cache") {
  const findings = [];
  if (!object(value)) return [{ code: "cache.object", path }];
  if (!["PRESENT", "ABSENT", "UNKNOWN"].includes(value.state)) findings.push({ code: "cache.state", path: `${path}.state` });
  if (value.state === "PRESENT") {
    if (!safeOfflinePath(value.path)) findings.push({ code: "cache.path", path: `${path}.path` });
    if (!safeDate(value.capturedOn)) findings.push({ code: "cache.date", path: `${path}.capturedOn` });
    if (!Number.isSafeInteger(value.bytes) || value.bytes < 0) findings.push({ code: "cache.bytes", path: `${path}.bytes` });
  } else if (value.path !== undefined || value.capturedOn !== undefined) {
    findings.push({ code: "cache.unexpectedMetadata", path });
  }
  return findings;
}

/**
 * Case record is a source-backed observation, not a physical accessibility
 * determination. It has an explicit UNKNOWN state when evidence is lacking.
 * @param {unknown} value @param {string} [path] @param {string} [asOf]
 */
export function caseIssues(value, path = "case", asOf = DAY) {
  const findings = [];
  if (!object(value)) return [{ code: "case.object", path }];
  if (!safeId(value.id)) findings.push({ code: "case.id", path: `${path}.id` });
  if (!safeId(value.recordKey)) findings.push({ code: "case.recordKey", path: `${path}.recordKey` });
  if (!CASE_STATES.includes(value.state)) findings.push({ code: "case.state", path: `${path}.state` });
  if (!SEVERITIES.includes(value.severity)) findings.push({ code: "case.severity", path: `${path}.severity` });
  if (!EVIDENCE_STATES.includes(value.evidence)) findings.push({ code: "case.evidence", path: `${path}.evidence` });
  if (!safeDate(value.createdOn)) findings.push({ code: "case.createdOn", path: `${path}.createdOn` });
  if (!safeDate(value.updatedOn)) findings.push({ code: "case.updatedOn", path: `${path}.updatedOn` });
  const now = dayOrdinal(asOf);
  if (now === null) throw new TypeError("asOf must be a real calendar date");
  const created = dayOrdinal(value.createdOn);
  const updated = dayOrdinal(value.updatedOn);
  if (created !== null && created > now) findings.push({ code: "case.futureCreated", path: `${path}.createdOn` });
  if (updated !== null && updated > now) findings.push({ code: "case.futureUpdated", path: `${path}.updatedOn` });
  if (created !== null && updated !== null && created > updated) findings.push({ code: "case.reverseDates", path: `${path}.updatedOn` });
  findings.push(...copyIssues(value.title, `${path}.title`));
  findings.push(...copyIssues(value.summary, `${path}.summary`));
  if (!Array.isArray(value.references) || value.references.length === 0) findings.push({ code: "case.references", path: `${path}.references` });
  else {
    const seen = new Set();
    value.references.forEach((reference, index) => {
      findings.push(...referenceIssues(reference, `${path}.references[${index}]`));
      if (safeId(reference?.id)) {
        if (seen.has(reference.id)) findings.push({ code: "case.duplicateReference", path: `${path}.references[${index}].id` });
        seen.add(reference.id);
      }
    });
  }
  findings.push(...cacheIssues(value.cache, `${path}.cache`));
  if (value.state === "RESOLVED" && value.evidence === "UNKNOWN") findings.push({ code: "case.unknownResolved", path: `${path}.state` });
  if (value.state === "RESOLVED" && value.cache?.state === "UNKNOWN") findings.push({ code: "case.cacheUnknownResolved", path: `${path}.cache` });
  return findings;
}

/** @param {unknown} values @param {{asOf?:string, maxCases?:number}} [options] */
export function auditCasebook(values, options = {}) {
  const { asOf = DAY, maxCases = MAX_CASES } = options;
  if (dayOrdinal(asOf) === null) throw new TypeError("Invalid assessment date");
  if (!Number.isSafeInteger(maxCases) || maxCases < 1 || maxCases > MAX_CASES) throw new TypeError("Invalid case limit");
  if (!Array.isArray(values)) return { findings: [{ code: "book.array", path: "cases" }], count: 0 };
  if (values.length > maxCases) return { findings: [{ code: "book.limit", path: "cases" }], count: values.length };
  const findings = [];
  const ids = new Set();
  const activeCacheOwners = new Map();
  values.forEach((value, index) => {
    const path = `cases[${index}]`;
    findings.push(...caseIssues(value, path, asOf));
    if (!object(value)) return;
    if (safeId(value.id)) {
      if (ids.has(value.id)) findings.push({ code: "book.duplicateId", path: `${path}.id` });
      ids.add(value.id);
    }
    const cachePath = value.cache?.state === "PRESENT" ? value.cache.path : null;
    if (safeOfflinePath(cachePath)) {
      const prior = activeCacheOwners.get(cachePath);
      if (prior && prior !== value.recordKey) findings.push({ code: "book.sharedCache", path: `${path}.cache.path` });
      activeCacheOwners.set(cachePath, value.recordKey);
    }
  });
  return { findings: sortFindings(findings.map(f => ({...f, severity: "error"}))).map(({code,path})=>({code,path})), count: values.length };
}

/** @param {unknown} cases */
export function casebookInventory(cases) {
  const states = Object.fromEntries(CASE_STATES.map(state => [state,0]));
  const severities = Object.fromEntries(SEVERITIES.map(severity => [severity,0]));
  if (!Array.isArray(cases)) return { count: 0, states, severities, unknown: 0 };
  let unknown = 0;
  for (const item of cases) {
    if (!object(item)) continue;
    if (CASE_STATES.includes(item.state)) states[item.state] += 1;
    if (SEVERITIES.includes(item.severity)) severities[item.severity] += 1;
    if (item.evidence === "UNKNOWN" || item.cache?.state === "UNKNOWN") unknown += 1;
  }
  return { count: cases.length, states, severities, unknown };
}

/** @param {unknown} cases */
export function casebookGroups(cases) {
  if (!Array.isArray(cases)) return [];
  const groups = new Map();
  for (const item of cases) {
    if (!object(item) || !safeId(item.recordKey)) continue;
    const group = groups.get(item.recordKey) ?? [];
    group.push(item);
    groups.set(item.recordKey, group);
  }
  return [...groups.entries()].sort(([a],[b])=>a.localeCompare(b,"en"))
    .map(([recordKey, items])=>({recordKey, cases: items.map(item=>item.id).sort(), count:items.length}));
}
