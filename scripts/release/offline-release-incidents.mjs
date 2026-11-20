import { URL } from 'node:url';
import { Buffer } from 'node:buffer';
/**
 * Fail-closed incident register for reviewing offline release evidence.
 * Incidents describe inspection work, not whether a real place is accessible.
 * A closed incident is not proof that the underlying concern has been fixed.
 */
import { createHash } from 'node:crypto';
import { isOpenLicence, isValidDate } from './site-audit.mjs';

export const INCIDENT_VERSION = 1;
export const INCIDENT_STATUSES = Object.freeze(['open', 'triaged', 'blocked', 'resolved', 'closed']);
export const INCIDENT_SEVERITIES = Object.freeze(['critical', 'high', 'moderate', 'low']);
export const INCIDENT_AREAS = Object.freeze([
  'keyboard', 'focus', 'screen-reader', 'touch-target', 'colour-contrast',
  'translation', 'offline', 'provenance', 'privacy', 'integrity',
]);
export const INCIDENT_ACTIONS = Object.freeze([
  'triage', 'block', 'unblock', 'resolve', 'reopen', 'close',
]);
export const INCIDENT_LIMITS = Object.freeze({
  maxIncidents: 10_000, maxEvents: 100, maxSources: 20,
  maxText: 2048, maxInputBytes: 8_000_000, maxIssues: 500,
});
const statusSet = new Set(INCIDENT_STATUSES);
const areaSet = new Set(INCIDENT_AREAS);
const severitySet = new Set(INCIDENT_SEVERITIES);
const actionSet = new Set(INCIDENT_ACTIONS);
const idPattern = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/;
const forbiddenFields = new Set([
  'email', 'phone', 'address', 'personname', 'healthcard', 'ohip', 'diagnosis',
  'medication', 'password', 'token', 'apikey', 'secret', 'cookie', 'session',
  'birthdate', 'locationhistory', 'gps', 'bearertoken', 'accesstoken',
]);
const allowedRegister = new Set(['version', 'incidents']);
const allowedIncident = new Set([
  'id', 'area', 'severity', 'status', 'title', 'summary', 'createdOn',
  'updatedOn', 'sourceRefs', 'sources', 'claimState', 'history', 'relatedIds',
]);
const allowedSource = new Set(['id', 'source', 'licence', 'retrievedOn', 'tier', 'note']);
const allowedEvent = new Set(['action', 'on', 'from', 'to', 'sourceRefs']);
const allowedText = new Set(['en', 'fr']);
const tiers = new Set([0, 1, 2, 3, 4, 'E']);

function issue(code, path) { return Object.freeze({ code, path }); }
export function plain(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
export function pointer(value) {
  return String(value).replace(/~/g, '~0').replace(/\//g, '~1');
}
export function validId(value) {
  return typeof value === 'string' && idPattern.test(value) &&
    !['constructor', 'prototype', '__proto__'].includes(value);
}
export function safeUrl(value) {
  if (typeof value !== 'string' || value.length > 2048) return false;
  if ([...value].some((char) => char.codePointAt(0) < 32)) return false;
  try {
    const parsed = new URL(value);
    const host = parsed.hostname.toLowerCase();
    return parsed.protocol === 'https:' && host.length > 0 &&
      !parsed.username && !parsed.password && !parsed.hash &&
      host !== 'localhost' && !host.endsWith('.localhost') &&
      !/^127\./u.test(host) && host !== '[::1]';
  } catch { return false; }
}
export function unicodeIssues(value, path) {
  if (typeof value !== 'string') return [issue('TEXT_INVALID', path)];
  const issues = [];
  for (let i = 0; i < value.length; i += 1) {
    const chr = value[i];
    if (chr === ':' && i > 0 && value[i - 1] !== '\u00A0') {
      issues.push(issue('FR_COLON_NBSP', `${path}/${i}`));
    }
    if (';!?'.includes(chr) && value[i - 1] !== '\u202F') {
      issues.push(issue('FR_NARROW_SPACE', `${path}/${i}`));
    }
    if (chr === '«' && value[i + 1] !== '\u202F') {
      issues.push(issue('FR_GUILLEMET', `${path}/${i}`));
    }
    if (chr === '»' && value[i - 1] !== '\u202F') {
      issues.push(issue('FR_GUILLEMET', `${path}/${i}`));
    }
    if (chr === "'" && /[A-Za-zÀ-ÿ]/u.test(value[i - 1] ?? '') &&
      /[A-Za-zÀ-ÿ]/u.test(value[i + 1] ?? '')) {
      issues.push(issue('FR_APOSTROPHE', `${path}/${i}`));
    }
  }
  return issues;
}
export function textIssues(value, path, maxText = INCIDENT_LIMITS.maxText) {
  if (!plain(value) || Object.keys(value).length !== 2 ||
      ![...allowedText].every((key) =>
        typeof value[key] === 'string' && value[key].trim().length > 0 &&
        value[key].length <= maxText)) {
    return [issue('BILINGUAL_TEXT_REQUIRED', path)];
  }
  return unicodeIssues(value.fr, `${path}/fr`);
}
export function findPrivateKeys(value, path = '', seen = new WeakSet(), depth = 0) {
  if (!value || typeof value !== 'object') return [];
  if (depth > 24) return [issue('DEPTH_LIMIT', path || '/')];
  if (seen.has(value)) return [issue('CYCLE', path || '/')];
  seen.add(value);
  const found = [];
  const entries = Array.isArray(value) ? value.entries() : Object.entries(value);
  for (const [key, child] of entries) {
    const next = `${path}/${pointer(key)}`;
    const normalized = String(key).replace(/[-_]/gu, '').toLowerCase();
    if (forbiddenFields.has(normalized) || ['__proto__', 'constructor', 'prototype'].includes(key)) {
      found.push(issue('PRIVATE_FIELD', next));
    } else {
      found.push(...findPrivateKeys(child, next, seen, depth + 1));
    }
  }
  seen.delete(value);
  return found;
}
function extraKeys(value, allowed, path) {
  return Object.keys(value).filter((key) => !allowed.has(key))
    .map((key) => issue('EXTRA_FIELD', `${path}/${pointer(key)}`));
}
export function sourceIssues(value, path, today) {
  if (!plain(value)) return [issue('SOURCE_INVALID', path)];
  const problems = extraKeys(value, allowedSource, path);
  if (!validId(value.id)) problems.push(issue('SOURCE_ID', `${path}/id`));
  if (!safeUrl(value.source)) problems.push(issue('SOURCE_URL', `${path}/source`));
  if (!isOpenLicence(value.licence)) problems.push(issue('OPEN_LICENCE_REQUIRED', `${path}/licence`));
  if (!isValidDate(value.retrievedOn) || isValidDate(today) && value.retrievedOn > today) {
    problems.push(issue('RETRIEVAL_DATE_REQUIRED', `${path}/retrievedOn`));
  }
  if (!tiers.has(value.tier)) problems.push(issue('TIER_REQUIRED', `${path}/tier`));
  if (value.note !== undefined) problems.push(...textIssues(value.note, `${path}/note`));
  return problems;
}
export function eventIssues(value, path, previousStatus, previousDate, sources, today) {
  if (!plain(value)) return [issue('EVENT_INVALID', path)];
  const problems = extraKeys(value, allowedEvent, path);
  if (!actionSet.has(value.action)) problems.push(issue('EVENT_ACTION', `${path}/action`));
  if (value.from !== previousStatus || !statusSet.has(value.to)) {
    problems.push(issue('EVENT_STATUS', `${path}/to`));
  }
  if (!isValidDate(value.on) || value.on < previousDate ||
      isValidDate(today) && value.on > today) {
    problems.push(issue('EVENT_DATE', `${path}/on`));
  }
  if (!Array.isArray(value.sourceRefs) ||
      value.sourceRefs.some((ref) => !validId(ref) || !sources.has(ref))) {
    problems.push(issue('EVENT_SOURCES', `${path}/sourceRefs`));
  }
  const intended = TRANSITIONS[previousStatus]?.[value.action];
  if (intended !== value.to) problems.push(issue('ILLEGAL_TRANSITION', `${path}/action`));
  return problems;
}
export const TRANSITIONS = Object.freeze({
  open: Object.freeze({ triage: 'triaged', block: 'blocked', close: 'closed' }),
  triaged: Object.freeze({ block: 'blocked', resolve: 'resolved', close: 'closed' }),
  blocked: Object.freeze({ unblock: 'triaged', close: 'closed' }),
  resolved: Object.freeze({ reopen: 'open', close: 'closed' }),
  closed: Object.freeze({ reopen: 'open' }),
});
export function incidentIssues(value, path, today) {
  if (!plain(value)) return [issue('INCIDENT_INVALID', path)];
  const problems = extraKeys(value, allowedIncident, path);
  if (!validId(value.id)) problems.push(issue('INCIDENT_ID', `${path}/id`));
  if (!areaSet.has(value.area)) problems.push(issue('INCIDENT_AREA', `${path}/area`));
  if (!severitySet.has(value.severity)) problems.push(issue('INCIDENT_SEVERITY', `${path}/severity`));
  if (!statusSet.has(value.status)) problems.push(issue('INCIDENT_STATUS', `${path}/status`));
  for (const field of ['title', 'summary']) problems.push(...textIssues(value[field], `${path}/${field}`));
  if (!isValidDate(value.createdOn) || isValidDate(today) && value.createdOn > today) {
    problems.push(issue('CREATED_ON', `${path}/createdOn`));
  }
  if (!isValidDate(value.updatedOn) || value.updatedOn < value.createdOn ||
      isValidDate(today) && value.updatedOn > today) {
    problems.push(issue('UPDATED_ON', `${path}/updatedOn`));
  }
  if (value.claimState !== 'UNKNOWN') problems.push(issue('UNKNOWN_REQUIRED', `${path}/claimState`));
  if (!Array.isArray(value.sources) || !value.sources.length ||
      value.sources.length > INCIDENT_LIMITS.maxSources) {
    problems.push(issue('SOURCES_REQUIRED', `${path}/sources`));
  }
  const sources = new Set();
  for (const [index, source] of (Array.isArray(value.sources) ? value.sources : []).entries()) {
    problems.push(...sourceIssues(source, `${path}/sources/${index}`, today));
    if (sources.has(source?.id)) problems.push(issue('DUPLICATE_SOURCE', `${path}/sources/${index}/id`));
    sources.add(source?.id);
  }
  if (!Array.isArray(value.sourceRefs) || !value.sourceRefs.length ||
      value.sourceRefs.some((ref) => !validId(ref) || !sources.has(ref))) {
    problems.push(issue('SOURCE_REFS', `${path}/sourceRefs`));
  }
  if (!Array.isArray(value.relatedIds) ||
      value.relatedIds.some((ref) => !validId(ref) || ref === value.id)) {
    problems.push(issue('RELATED_IDS', `${path}/relatedIds`));
  }
  if (!Array.isArray(value.history) || value.history.length > INCIDENT_LIMITS.maxEvents) {
    problems.push(issue('EVENT_LIMIT', `${path}/history`));
  } else {
    let current = 'open';
    let date = value.createdOn;
    for (const [index, event] of value.history.entries()) {
      const here = `${path}/history/${index}`;
      problems.push(...eventIssues(event, here, current, date, sources, today));
      current = event?.to;
      date = event?.on;
    }
    if (current !== value.status) problems.push(issue('HISTORY_STATUS_MISMATCH', `${path}/status`));
    if (value.history.length > 0 && date !== value.updatedOn) {
      problems.push(issue('HISTORY_DATE_MISMATCH', `${path}/updatedOn`));
    }
    if (value.history.length === 0 && value.updatedOn !== value.createdOn) {
      problems.push(issue('UNEXPLAINED_UPDATE', `${path}/updatedOn`));
    }
  }
  return problems;
}
export function inspectIncidentRegister(value, options = {}) {
  const issues = findPrivateKeys(value);
  if (!plain(value) || value.version !== INCIDENT_VERSION || !Array.isArray(value.incidents)) {
    return { ok: false, problems: [...issues, issue('REGISTER_INVALID', '/')], register: null };
  }
  issues.push(...extraKeys(value, allowedRegister, ''));
  if (value.incidents.length > INCIDENT_LIMITS.maxIncidents) {
    issues.push(issue('INCIDENT_LIMIT', '/incidents'));
  }
  const ids = new Set();
  const limit = Math.min(value.incidents.length, INCIDENT_LIMITS.maxIncidents);
  for (let index = 0; index < limit; index += 1) {
    const entry = value.incidents[index];
    issues.push(...incidentIssues(entry, `/incidents/${index}`, options.today));
    if (ids.has(entry?.id)) issues.push(issue('DUPLICATE_INCIDENT', `/incidents/${index}/id`));
    ids.add(entry?.id);
  }
  for (let index = 0; index < limit; index += 1) {
    for (const ref of (Array.isArray(value.incidents[index]?.relatedIds) ? value.incidents[index].relatedIds : [])) {
      if (!ids.has(ref)) issues.push(issue('MISSING_RELATED', `/incidents/${index}/relatedIds`));
    }
  }
  return { ok: issues.length === 0, problems: issues, register: issues.length ? null : value };
}
export function newIncidentRegister() { return { version: INCIDENT_VERSION, incidents: [] }; }
export function canonicalIncident(value) {
  return {
    id: value.id, area: value.area, severity: value.severity, status: value.status,
    title: { en: value.title.en, fr: value.title.fr },
    summary: { en: value.summary.en, fr: value.summary.fr },
    createdOn: value.createdOn, updatedOn: value.updatedOn,
    sourceRefs: [...value.sourceRefs].sort(),
    sources: [...value.sources].sort((a, b) => a.id.localeCompare(b.id, 'en')),
    claimState: 'UNKNOWN', relatedIds: [...value.relatedIds].sort(),
    history: value.history.map((event) => ({
      action: event.action, on: event.on, from: event.from, to: event.to,
      sourceRefs: [...event.sourceRefs].sort(),
    })),
  };
}
export function canonicalRegister(value) {
  return { version: INCIDENT_VERSION, incidents: [...value.incidents]
    .sort((a, b) => a.id.localeCompare(b.id, 'en')).map(canonicalIncident) };
}
export function incidentFingerprint(value, options = {}) {
  const check = inspectIncidentRegister(value, options);
  if (!check.ok) return { ok: false, fingerprint: null, problems: check.problems };
  const payload = JSON.stringify(canonicalRegister(value));
  if (Buffer.byteLength(payload, 'utf8') > INCIDENT_LIMITS.maxInputBytes) {
    return { ok: false, fingerprint: null, problems: [issue('INPUT_LIMIT', '/')] };
  }
  return { ok: true, fingerprint: `sha256:${createHash('sha256').update(payload).digest('hex')}`, problems: [] };
}
export function parseIncidents(text, options = {}) {
  if (typeof text !== 'string' || Buffer.byteLength(text, 'utf8') > INCIDENT_LIMITS.maxInputBytes) {
    return { ok: false, register: null, problems: [issue('INPUT_LIMIT', '/')] };
  }
  try { return inspectIncidentRegister(JSON.parse(text), options); }
  catch { return { ok: false, register: null, problems: [issue('INVALID_JSON', '/')] }; }
}
export function serializeIncidents(value, options = {}) {
  const check = inspectIncidentRegister(value, options);
  if (!check.ok) return { ok: false, text: null, problems: check.problems };
  return { ok: true, text: `${JSON.stringify(canonicalRegister(value), null, 2)}\n`, problems: [] };
}
export function appendIncident(value, candidate, options = {}) {
  const checked = inspectIncidentRegister(value, options);
  if (!checked.ok) return { ok: false, register: value, problems: checked.problems };
  if (!plain(candidate)) return { ok: false, register: value, problems: [issue('INCIDENT_INVALID', '/candidate')] };
  const next = { version: INCIDENT_VERSION, incidents: [...value.incidents, globalThis.structuredClone(candidate)] };
  const result = inspectIncidentRegister(next, options);
  return { ok: result.ok, register: result.ok ? next : value, problems: result.problems };
}
export function transitionIncident(value, id, action, on, sourceRefs, options = {}) {
  const checked = inspectIncidentRegister(value, options);
  if (!checked.ok) return { ok: false, register: value, problems: checked.problems };
  const index = value.incidents.findIndex((entry) => entry.id === id);
  if (index < 0) return { ok: false, register: value, problems: [issue('INCIDENT_NOT_FOUND', '/id')] };
  const entry = value.incidents[index];
  const nextStatus = TRANSITIONS[entry.status]?.[action];
  if (!nextStatus || !actionSet.has(action)) {
    return { ok: false, register: value, problems: [issue('ILLEGAL_TRANSITION', '/action')] };
  }
  const next = globalThis.structuredClone(value);
  const updated = next.incidents[index];
  updated.history.push({ action, on, from: entry.status, to: nextStatus, sourceRefs });
  updated.status = nextStatus;
  updated.updatedOn = on;
  const check = inspectIncidentRegister(next, options);
  return { ok: check.ok, register: check.ok ? next : value, problems: check.problems };
}
export function incidentSummary(value, options = {}) {
  const inspected = inspectIncidentRegister(value, options);
  if (!inspected.ok) return { ok: false, summary: null, problems: inspected.problems };
  const byStatus = Object.fromEntries(INCIDENT_STATUSES.map((key) => [key, 0]));
  const byArea = Object.fromEntries(INCIDENT_AREAS.map((key) => [key, 0]));
  const bySeverity = Object.fromEntries(INCIDENT_SEVERITIES.map((key) => [key, 0]));
  const sourceIds = new Set();
  for (const entry of value.incidents) {
    byStatus[entry.status] += 1;
    byArea[entry.area] += 1;
    bySeverity[entry.severity] += 1;
    for (const source of entry.sources) sourceIds.add(source.id);
  }
  return { ok: true, problems: [], summary: {
    total: value.incidents.length, byStatus, byArea, bySeverity,
    distinctSourceIds: sourceIds.size, claimState: 'UNKNOWN',
  } };
}
