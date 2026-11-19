/**
 * Offline evidence source register.
 *
 * Source lifecycle information is administrative metadata only. A source being
 * active, retired, or reviewed does not establish a physical access fact.
 * No network, clock, storage, individual identity, or automatic claims.
 */
import { createHash } from 'node:crypto';
import { validDate, validId, safeUrl, privateKeyIssues } from './offline-review-queue.mjs';

export const REGISTER_VERSION = 1;
export const SOURCE_STATES = Object.freeze(['listed', 'needs-review', 'withdrawn', 'retired']);
export const SOURCE_ACTIONS = Object.freeze(['request-review', 'restore', 'withdraw', 'retire']);
export const SOURCE_TYPES = Object.freeze(['open-data', 'publisher-document', 'field-note', 'community-report']);
export const CLAIM_STATES = Object.freeze(['YES', 'NO', 'UNKNOWN']);
export const REGISTER_LIMITS = Object.freeze({ sources: 10000, references: 50000, history: 128, text: 2048, bytes: 8_000_000 });
const STATES = new Set(SOURCE_STATES);
const ACTIONS = new Set(SOURCE_ACTIONS);
const TYPES = new Set(SOURCE_TYPES);
const CLAIMS = new Set(CLAIM_STATES);
const LICENCES = new Set(['CC0-1.0', 'CC-BY-4.0', 'CC-BY-SA-4.0', 'ODbL-1.0', 'OGL-Canada-2.0', 'OGL-Canada-3.0', 'OGL-Ontario-1.0']);
const TIERS = new Set([0, 1, 2, 3, 4, 'E']);
const ALLOWED_KEYS = new Set(['version', 'sources', 'references']);
const SOURCE_KEYS = new Set(['id', 'title', 'type', 'url', 'licence', 'retrievedOn', 'sourceDate', 'tier', 'state', 'history', 'description']);
const REFERENCE_KEYS = new Set(['id', 'sourceId', 'recordId', 'field', 'state', 'observedOn']);
const HISTORY_KEYS = new Set(['action', 'from', 'to', 'on']);
const TRANSLATION_KEYS = new Set(['en', 'fr']);
const TRANSITIONS = Object.freeze({
  listed: Object.freeze({ 'request-review': 'needs-review', withdraw: 'withdrawn', retire: 'retired' }),
  'needs-review': Object.freeze({ restore: 'listed', withdraw: 'withdrawn', retire: 'retired' }),
  withdrawn: Object.freeze({ 'request-review': 'needs-review', retire: 'retired' }),
  retired: Object.freeze({ restore: 'needs-review' }),
});

function problem(code, path) { return { code, path }; }
function plain(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}
function keys(object, allowed, path) {
  return Object.keys(object).filter((key) => !allowed.has(key))
    .map((key) => problem('UNEXPECTED_FIELD', `${path}/${pointer(key)}`));
}
function pointer(value) { return String(value).replace(/~/g, '~0').replace(/\//g, '~1'); }
function text(value) { return typeof value === 'string' && value.trim().length > 0 && value.length <= REGISTER_LIMITS.text; }
function translation(value) {
  return plain(value) && Object.keys(value).length === 2 &&
    [...TRANSLATION_KEYS].every((lang) => text(value[lang]));
}
function punctuationIssues(value, path) {
  if (!text(value)) return [problem('TEXT_REQUIRED', path)];
  const issues = [];
  for (let i = 0; i < value.length; i += 1) {
    const ch = value[i];
    if (ch === ':' && i > 0 && value[i - 1] !== '\u00A0') issues.push(problem('FR_COLON', `${path}/${i}`));
    if (';!?'.includes(ch) && i > 0 && value[i - 1] !== '\u202F') {
      issues.push(problem('FR_NARROW', `${path}/${i}`));
    }
    if (ch === '«' && value[i + 1] !== '\u202F') issues.push(problem('FR_GUILLEMET', `${path}/${i}`));
    if (ch === '»' && value[i - 1] !== '\u202F') issues.push(problem('FR_GUILLEMET', `${path}/${i}`));
  }
  if (/(?:\b[ldjscn]|\bqu)'(?=\p{L})/iu.test(value)) issues.push(problem('FR_APOSTROPHE', path));
  return issues;
}

/** Validate a source independently. The date bound must be supplied explicitly. */
export function inspectSource(value, index = 0, options = {}) {
  const path = `/sources/${index}`;
  if (!plain(value)) return [problem('SOURCE_OBJECT', path)];
  const issues = keys(value, SOURCE_KEYS, path);
  if (!validId(value.id)) issues.push(problem('SOURCE_ID', `${path}/id`));
  if (!translation(value.title)) issues.push(problem('SOURCE_TITLE', `${path}/title`));
  else issues.push(...punctuationIssues(value.title.fr, `${path}/title/fr`));
  if (value.description !== undefined) {
    if (!translation(value.description)) issues.push(problem('SOURCE_DESCRIPTION', `${path}/description`));
    else issues.push(...punctuationIssues(value.description.fr, `${path}/description/fr`));
  }
  if (!TYPES.has(value.type)) issues.push(problem('SOURCE_TYPE', `${path}/type`));
  if (!safeUrl(value.url)) issues.push(problem('SOURCE_URL', `${path}/url`));
  if (!LICENCES.has(value.licence)) issues.push(problem('SOURCE_LICENCE', `${path}/licence`));
  if (!validDate(value.retrievedOn)) issues.push(problem('SOURCE_DATE', `${path}/retrievedOn`));
  if (value.sourceDate !== undefined && !validDate(value.sourceDate)) {
    issues.push(problem('OBSERVATION_DATE', `${path}/sourceDate`));
  }
  if (validDate(value.sourceDate) && validDate(value.retrievedOn) && value.sourceDate > value.retrievedOn) {
    issues.push(problem('SOURCE_AFTER_RETRIEVAL', `${path}/sourceDate`));
  }
  if (validDate(options.today) && validDate(value.retrievedOn) && value.retrievedOn > options.today) {
    issues.push(problem('FUTURE_RETRIEVAL', `${path}/retrievedOn`));
  }
  if (!TIERS.has(value.tier)) issues.push(problem('SOURCE_TIER', `${path}/tier`));
  if (!STATES.has(value.state)) issues.push(problem('SOURCE_STATE', `${path}/state`));
  if (!Array.isArray(value.history) || value.history.length > REGISTER_LIMITS.history) {
    issues.push(problem('HISTORY_LIMIT', `${path}/history`));
  } else {
    let prior = value.retrievedOn;
    let state = 'listed';
    for (const [n, event] of value.history.entries()) {
      const here = `${path}/history/${n}`;
      if (!plain(event)) { issues.push(problem('EVENT_OBJECT', here)); continue; }
      issues.push(...keys(event, HISTORY_KEYS, here));
      if (!ACTIONS.has(event.action) || !STATES.has(event.from) || !STATES.has(event.to) || !validDate(event.on)) {
        issues.push(problem('EVENT_INVALID', here));
        continue;
      }
      if (validDate(prior) && event.on < prior) issues.push(problem('EVENT_ORDER', `${here}/on`));
      if (validDate(options.today) && event.on > options.today) issues.push(problem('FUTURE_EVENT', `${here}/on`));
      if (event.from !== state || TRANSITIONS[event.from]?.[event.action] !== event.to) {
        issues.push(problem('EVENT_TRANSITION', here));
      }
      state = event.to;
      prior = event.on;
    }
    if (STATES.has(value.state) && state !== value.state) issues.push(problem('HISTORY_STATE', `${path}/state`));
  }
  return issues;
}

/** A reference retains a literal claim status and never implies endorsement. */
export function inspectReference(value, index = 0, sourceIds = new Set(), options = {}) {
  const path = `/references/${index}`;
  if (!plain(value)) return [problem('REFERENCE_OBJECT', path)];
  const issues = keys(value, REFERENCE_KEYS, path);
  for (const field of ['id', 'sourceId', 'recordId', 'field']) {
    if (!validId(value[field])) issues.push(problem('REFERENCE_ID', `${path}/${field}`));
  }
  if (validId(value.sourceId) && !sourceIds.has(value.sourceId)) {
    issues.push(problem('SOURCE_NOT_FOUND', `${path}/sourceId`));
  }
  if (!CLAIMS.has(value.state)) issues.push(problem('CLAIM_STATE', `${path}/state`));
  if (!validDate(value.observedOn)) issues.push(problem('REFERENCE_DATE', `${path}/observedOn`));
  if (validDate(options.today) && validDate(value.observedOn) && value.observedOn > options.today) {
    issues.push(problem('FUTURE_REFERENCE', `${path}/observedOn`));
  }
  return issues;
}

/** Every record remains attached to source, licence, date and tier via sourceId. */
export function validateRegister(value, options = {}) {
  const problems = privateKeyIssues(value);
  if (!plain(value) || value.version !== REGISTER_VERSION || !Array.isArray(value.sources) ||
      !Array.isArray(value.references)) {
    return { ok: false, problems: [...problems, problem('REGISTER_OBJECT', '/')] };
  }
  problems.push(...keys(value, ALLOWED_KEYS, ''));
  if (value.sources.length > REGISTER_LIMITS.sources) problems.push(problem('SOURCE_LIMIT', '/sources'));
  if (value.references.length > REGISTER_LIMITS.references) problems.push(problem('REFERENCE_LIMIT', '/references'));
  const sources = new Set();
  const refs = new Set();
  for (const [i, source] of value.sources.slice(0, REGISTER_LIMITS.sources).entries()) {
    problems.push(...inspectSource(source, i, options));
    if (validId(source?.id)) {
      if (sources.has(source.id)) problems.push(problem('DUPLICATE_SOURCE', `/sources/${i}/id`));
      sources.add(source.id);
    }
  }
  for (const [i, reference] of value.references.slice(0, REGISTER_LIMITS.references).entries()) {
    problems.push(...inspectReference(reference, i, sources, options));
    if (validId(reference?.id)) {
      if (refs.has(reference.id)) problems.push(problem('DUPLICATE_REFERENCE', `/references/${i}/id`));
      refs.add(reference.id);
    }
    const source = value.sources.find((entry) => entry?.id === reference?.sourceId);
    if (source && validDate(source.retrievedOn) && validDate(reference?.observedOn) &&
        reference.observedOn > source.retrievedOn) {
      problems.push(problem('REFERENCE_AFTER_RETRIEVAL', `/references/${i}/observedOn`));
    }
  }
  return { ok: problems.length === 0, problems };
}

export function emptyRegister() { return { version: REGISTER_VERSION, sources: [], references: [] }; }
function clone(value) { return JSON.parse(JSON.stringify(value)); }
function rejected(register, problems) { return { ok: false, register, problems }; }

export function addSource(register, source, options = {}) {
  const current = validateRegister(register, options);
  if (!current.ok) return rejected(register, current.problems);
  const candidate = { ...register, sources: [...register.sources, clone(source)] };
  const next = validateRegister(candidate, options);
  return next.ok ? { ok: true, register: candidate, problems: [] } : rejected(register, next.problems);
}

export function addReference(register, reference, options = {}) {
  const current = validateRegister(register, options);
  if (!current.ok) return rejected(register, current.problems);
  const candidate = { ...register, references: [...register.references, clone(reference)] };
  const next = validateRegister(candidate, options);
  return next.ok ? { ok: true, register: candidate, problems: [] } : rejected(register, next.problems);
}

export function transitionSource(register, id, action, on, options = {}) {
  const current = validateRegister(register, options);
  if (!current.ok) return rejected(register, current.problems);
  if (!validId(id) || !ACTIONS.has(action) || !validDate(on)) return rejected(register, [problem('ACTION_INVALID', '/action')]);
  if (validDate(options.today) && on > options.today) return rejected(register, [problem('FUTURE_EVENT', '/on')]);
  const original = register.sources.find((source) => source.id === id);
  if (!original) return rejected(register, [problem('SOURCE_NOT_FOUND', '/id')]);
  const to = TRANSITIONS[original.state]?.[action];
  if (!to) return rejected(register, [problem('ACTION_NOT_ALLOWED', '/action')]);
  const prior = original.history.at(-1)?.on ?? original.retrievedOn;
  if (on < prior) return rejected(register, [problem('EVENT_ORDER', '/on')]);
  if (original.history.length >= REGISTER_LIMITS.history) return rejected(register, [problem('HISTORY_LIMIT', '/history')]);
  const changed = {
    ...original, state: to,
    history: [...original.history, { action, from: original.state, to, on }],
  };
  const candidate = {
    ...register,
    sources: register.sources.map((source) => source.id === id ? changed : source),
  };
  const next = validateRegister(candidate, options);
  return next.ok ? { ok: true, register: candidate, problems: [] } : rejected(register, next.problems);
}

export function sourceDependents(register, sourceId, options = {}) {
  const checked = validateRegister(register, options);
  if (!checked.ok) return { ok: false, problems: checked.problems, dependents: null };
  return { ok: true, problems: [], dependents: register.references
    .filter((entry) => entry.sourceId === sourceId)
    .map((entry) => ({ id: entry.id, recordId: entry.recordId, field: entry.field, state: entry.state }))
    .sort((a, b) => a.id.localeCompare(b.id, 'en')) };
}

export function sourceHealth(register, options = {}) {
  const checked = validateRegister(register, options);
  if (!checked.ok) return { ok: false, problems: checked.problems, summary: null };
  const status = Object.fromEntries(SOURCE_STATES.map((state) => [state, 0]));
  const claims = { YES: 0, NO: 0, UNKNOWN: 0 };
  const dependencies = Object.fromEntries(register.sources.map((source) => [source.id, 0]));
  for (const source of register.sources) status[source.state] += 1;
  for (const ref of register.references) {
    claims[ref.state] += 1;
    dependencies[ref.sourceId] += 1;
  }
  const reviewNeeded = register.sources.filter((source) => source.state !== 'listed')
    .flatMap((source) => register.references.filter((ref) => ref.sourceId === source.id)
      .map((ref) => ({ sourceId: source.id, referenceId: ref.id, state: ref.state, reason: source.state })));
  reviewNeeded.sort((a, b) => a.sourceId.localeCompare(b.sourceId, 'en') ||
    a.referenceId.localeCompare(b.referenceId, 'en'));
  return { ok: true, problems: [], summary: {
    sources: register.sources.length, references: register.references.length,
    status, claims, dependencies, reviewNeeded,
  } };
}

function canonicalSource(value) {
  return {
    id: value.id, title: { en: value.title.en, fr: value.title.fr }, type: value.type,
    url: value.url, licence: value.licence, retrievedOn: value.retrievedOn,
    ...(value.sourceDate === undefined ? {} : { sourceDate: value.sourceDate }),
    tier: value.tier, state: value.state,
    history: value.history.map((event) => ({ action: event.action, from: event.from, to: event.to, on: event.on })),
    ...(value.description === undefined ? {} : { description: { en: value.description.en, fr: value.description.fr } }),
  };
}
function canonicalReference(value) {
  return { id: value.id, sourceId: value.sourceId, recordId: value.recordId,
    field: value.field, state: value.state, observedOn: value.observedOn };
}
export function canonicalRegister(register) {
  return {
    version: REGISTER_VERSION,
    sources: [...register.sources].sort((a, b) => a.id.localeCompare(b.id, 'en')).map(canonicalSource),
    references: [...register.references].sort((a, b) => a.id.localeCompare(b.id, 'en')).map(canonicalReference),
  };
}
export function registerFingerprint(register, options = {}) {
  const checked = validateRegister(register, options);
  if (!checked.ok) return { ok: false, problems: checked.problems, fingerprint: null };
  const payload = JSON.stringify(canonicalRegister(register));
  if (Buffer.byteLength(payload) > REGISTER_LIMITS.bytes) {
    return { ok: false, problems: [problem('INPUT_LIMIT', '/')], fingerprint: null };
  }
  return { ok: true, problems: [], fingerprint: 'sha256:' + createHash('sha256').update(payload).digest('hex') };
}

export function serializeRegister(register, options = {}) {
  const hash = registerFingerprint(register, options);
  if (!hash.ok) return { ok: false, problems: hash.problems, text: null };
  return { ok: true, problems: [], text: JSON.stringify(canonicalRegister(register), null, 2) + '\n' };
}
export function parseRegister(source, options = {}) {
  if (typeof source !== 'string' || Buffer.byteLength(source) > REGISTER_LIMITS.bytes) {
    return { ok: false, problems: [problem('INPUT_LIMIT', '/')], register: null };
  }
  let record;
  try { record = JSON.parse(source); } catch { return { ok: false, problems: [problem('INVALID_JSON', '/')], register: null }; }
  const checked = validateRegister(record, options);
  return { ok: checked.ok, problems: checked.problems, register: checked.ok ? record : null };
}

/** Non-destructive three-way merge; conflicts are explicit, never last-write-wins. */
export function mergeRegisters(base, local, remote, options = {}) {
  const inputs = [['base', base], ['local', local], ['remote', remote]];
  const problems = inputs.flatMap(([name, value]) => validateRegister(value, options).problems
    .map((issue) => ({ ...issue, snapshot: name })));
  if (problems.length) return { ok: false, problems, conflicts: [], register: null };
  const conflict = [];
  const result = { version: REGISTER_VERSION, sources: [], references: [] };
  for (const field of ['sources', 'references']) {
    const map = (list) => new Map(list.map((entry) => [entry.id, entry]));
    const origin = map(base[field]);
    const left = map(local[field]);
    const right = map(remote[field]);
    const ids = [...new Set([...origin.keys(), ...left.keys(), ...right.keys()])].sort();
    for (const id of ids) {
      const a = origin.get(id);
      const b = left.get(id);
      const c = right.get(id);
      const same = (x, y) => JSON.stringify(x ?? null) === JSON.stringify(y ?? null);
      if (same(b, c)) { if (b) result[field].push(clone(b)); continue; }
      if (same(a, b)) { if (c) result[field].push(clone(c)); continue; }
      if (same(a, c)) { if (b) result[field].push(clone(b)); continue; }
      conflict.push({ collection: field, id, code: 'CONCURRENT_EDIT' });
    }
  }
  if (conflict.length) return { ok: false, problems: [problem('MERGE_CONFLICT', '/')], conflicts: conflict, register: null };
  const verified = validateRegister(result, options);
  return verified.ok ? { ok: true, problems: [], conflicts: [], register: result } :
    { ok: false, problems: verified.problems, conflicts: [], register: null };
}
