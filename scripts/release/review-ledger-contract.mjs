/** Local evidence review ledger. Data is about reports, never a claim that a place is accessible. */
export const UNKNOWN = 'UNKNOWN';
export const SCHEMA = 1;
export const MAX_BYTES = 6_000_000;
export const MAX_ENTRIES = 10000;
export const FEATURES = Object.freeze(['entrance', 'washroom', 'parking', 'path', 'lift', 'door', 'other']);
export const STATES = Object.freeze(['UNKNOWN', 'reported', 'not-reported']);
export const TIERS = Object.freeze(['unknown', 'self-reported', 'documented', 'field-observed']);
export const ACTIONS = Object.freeze(['open', 'annotate', 'request-evidence', 'defer', 'close', 'reopen']);
export const DECISIONS = Object.freeze(['none', 'needs-review', 'insufficient-evidence', 'conflicting-evidence', 'reviewed']);
const ID = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/u;
const DATE = /^\d{4}-\d{2}-\d{2}$/u;
const SHA = /^[a-f0-9]{64}$/u;
const OWN = Object.prototype.hasOwnProperty;
const PROVENANCE = ['source', 'licence', 'retrievedOn', 'verificationTier'];
const baseFields = ['id', 'placeId', 'feature', 'status', ...PROVENANCE, 'summary', 'documentHash'];
const eventFields = ['id', 'caseId', 'action', 'date', 'reason', ...PROVENANCE, 'reference', 'decision'];
export function plain(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value) &&
    (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}
export function validDay(value) {
  if (typeof value !== 'string' || !DATE.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}
export function validText(value, max = 1000, allowEmpty = false) {
  if (typeof value !== 'string' || value.length > max || value !== value.trim()) return false;
  if (!allowEmpty && value.length === 0) return false;
  for (const char of value) {
    const point = char.codePointAt(0);
    if ((point < 32 && point !== 10 && point !== 9) || point === 127) return false;
  }
  return true;
}
export function validId(value) { return validText(value, 128) && ID.test(value); }
export function error(code, path) { return { code, path }; }
export function exactKeys(input, required, optional = []) {
  if (!plain(input)) return [error('OBJECT_REQUIRED', '$')];
  const issues = [];
  const allowed = new Set([...required, ...optional]);
  for (const key of Object.keys(input)) if (!allowed.has(key)) issues.push(error('UNRECOGNISED_FIELD', key));
  for (const key of required) if (!OWN.call(input, key)) issues.push(error('MISSING_FIELD', key));
  return issues;
}
export function checkProvenance(input, prefix, today) {
  const issues = [];
  if (!validText(input.source, 500)) issues.push(error('SOURCE_REQUIRED', `${prefix}.source`));
  if (!validText(input.licence, 200)) issues.push(error('LICENCE_REQUIRED', `${prefix}.licence`));
  if (!validDay(input.retrievedOn) || input.retrievedOn > today) issues.push(error('RETRIEVAL_DATE_INVALID', `${prefix}.retrievedOn`));
  if (!TIERS.includes(input.verificationTier)) issues.push(error('TIER_INVALID', `${prefix}.verificationTier`));
  return issues;
}
export function checkObservation(input, index, today) {
  const path = `observations[${index}]`;
  if (!plain(input)) return { value: null, issues: [error('OBJECT_REQUIRED', path)] };
  const issues = exactKeys(input, baseFields, ['note']).map(x => error(x.code, `${path}.${x.path}`));
  if (!validId(input.id)) issues.push(error('ID_INVALID', `${path}.id`));
  if (!validId(input.placeId)) issues.push(error('PLACE_INVALID', `${path}.placeId`));
  if (!FEATURES.includes(input.feature)) issues.push(error('FEATURE_INVALID', `${path}.feature`));
  if (!STATES.includes(input.status)) issues.push(error('STATUS_INVALID', `${path}.status`));
  if (!validText(input.summary, 500)) issues.push(error('SUMMARY_INVALID', `${path}.summary`));
  if (input.documentHash !== null && (typeof input.documentHash !== 'string' || !SHA.test(input.documentHash))) issues.push(error('HASH_INVALID', `${path}.documentHash`));
  if (OWN.call(input, 'note') && !validText(input.note, 1000)) issues.push(error('NOTE_INVALID', `${path}.note`));
  issues.push(...checkProvenance(input, path, today));
  return { value: issues.length ? null : { ...input }, issues };
}
export function checkEvent(input, index, today) {
  const path = `events[${index}]`;
  if (!plain(input)) return { value: null, issues: [error('OBJECT_REQUIRED', path)] };
  const issues = exactKeys(input, eventFields).map(x => error(x.code, `${path}.${x.path}`));
  if (!validId(input.id)) issues.push(error('ID_INVALID', `${path}.id`));
  if (!validId(input.caseId)) issues.push(error('CASE_INVALID', `${path}.caseId`));
  if (!ACTIONS.includes(input.action)) issues.push(error('ACTION_INVALID', `${path}.action`));
  if (!validDay(input.date) || input.date > today) issues.push(error('EVENT_DATE_INVALID', `${path}.date`));
  if (!validText(input.reason, 1000)) issues.push(error('REASON_INVALID', `${path}.reason`));
  if (input.reference !== null && !validId(input.reference)) issues.push(error('REFERENCE_INVALID', `${path}.reference`));
  if (!DECISIONS.includes(input.decision)) issues.push(error('DECISION_INVALID', `${path}.decision`));
  issues.push(...checkProvenance(input, path, today));
  return { value: issues.length ? null : { ...input }, issues };
}
export function checkCase(input, index) {
  const path = `cases[${index}]`;
  if (!plain(input)) return { value: null, issues: [error('OBJECT_REQUIRED', path)] };
  const issues = exactKeys(input, ['id', 'placeId', 'feature', 'observationIds', 'createdOn']).map(x => error(x.code, `${path}.${x.path}`));
  if (!validId(input.id)) issues.push(error('ID_INVALID', `${path}.id`));
  if (!validId(input.placeId)) issues.push(error('PLACE_INVALID', `${path}.placeId`));
  if (!FEATURES.includes(input.feature)) issues.push(error('FEATURE_INVALID', `${path}.feature`));
  if (!Array.isArray(input.observationIds) || input.observationIds.length === 0 || input.observationIds.length > 100 || input.observationIds.some(x => !validId(x)) || new Set(input.observationIds).size !== input.observationIds.length) issues.push(error('OBSERVATIONS_INVALID', `${path}.observationIds`));
  if (!validDay(input.createdOn)) issues.push(error('CREATED_DATE_INVALID', `${path}.createdOn`));
  return { value: issues.length ? null : { ...input, observationIds: [...input.observationIds] }, issues };
}
export function emptyLedger() { return { schemaVersion: SCHEMA, observations: [], cases: [], events: [] }; }
export function validateLedger(input, { today = '2026-11-20' } = {}) {
  if (!validDay(today)) return { ok: false, issues: [error('TODAY_INVALID', '$')] };
  if (!plain(input)) return { ok: false, issues: [error('OBJECT_REQUIRED', '$')] };
  const issues = exactKeys(input, ['schemaVersion', 'observations', 'cases', 'events']);
  if (input.schemaVersion !== SCHEMA) issues.push(error('VERSION_INVALID', 'schemaVersion'));
  for (const field of ['observations', 'cases', 'events']) {
    if (!Array.isArray(input[field]) || input[field].length > MAX_ENTRIES) issues.push(error('ARRAY_INVALID', field));
  }
  if (issues.length) return { ok: false, issues };
  const observations = [], cases = [], events = [];
  const push = (name, checker, destination) => {
    const seen = new Set();
    input[name].forEach((row, index) => {
      const result = checker(row, index, today);
      issues.push(...result.issues);
      if (!result.value) return;
      if (seen.has(row.id)) issues.push(error('DUPLICATE_ID', `${name}[${index}].id`));
      seen.add(row.id);
      destination.push(result.value);
    });
  };
  push('observations', checkObservation, observations);
  push('cases', checkCase, cases);
  push('events', checkEvent, events);
  const observationById = new Map(observations.map(x => [x.id, x]));
  const caseById = new Map(cases.map(x => [x.id, x]));
  cases.forEach((row, index) => {
    if (row.createdOn > today) issues.push(error('FUTURE_CASE', `cases[${index}].createdOn`));
    for (const id of row.observationIds) {
      const target = observationById.get(id);
      if (!target) issues.push(error('MISSING_OBSERVATION', `cases[${index}].observationIds`));
      else if (target.placeId !== row.placeId || target.feature !== row.feature) issues.push(error('CROSS_PLACE_EVIDENCE', `cases[${index}].observationIds`));
      else if (target.retrievedOn > row.createdOn) issues.push(error('OBSERVATION_AFTER_CASE', `cases[${index}].observationIds`));
    }
  });
  events.forEach((row, index) => {
    const found = caseById.get(row.caseId);
    if (!found) issues.push(error('MISSING_CASE', `events[${index}].caseId`));
    else if (row.date < found.createdOn) issues.push(error('EVENT_BEFORE_CASE', `events[${index}].date`));
    if (row.reference && !observationById.has(row.reference)) issues.push(error('MISSING_REFERENCE', `events[${index}].reference`));
    if (row.reference && found && !found.observationIds.includes(row.reference)) issues.push(error('REFERENCE_NOT_IN_CASE', `events[${index}].reference`));
  });
  return { ok: !issues.length, issues, value: issues.length ? null : { schemaVersion: SCHEMA, observations, cases, events } };
}
export function parseLedger(text, options = {}) {
  if (typeof text !== 'string' || Buffer.byteLength(text, 'utf8') > MAX_BYTES) return { ok: false, issues: [error('INPUT_TOO_LARGE', '$')] };
  let object;
  try { object = JSON.parse(text); } catch { return { ok: false, issues: [error('INVALID_JSON', '$')] }; }
  return validateLedger(object, options);
}
export function exampleLedger() {
  const observation = { id: 'example-observation', placeId: 'fictional-place', feature: 'entrance', status: UNKNOWN, source: 'Fictional demonstration, not an observation of a real place', licence: 'CC0-1.0', retrievedOn: '2026-11-20', verificationTier: 'unknown', summary: 'No evidence supplied', documentHash: null };
  return { schemaVersion: SCHEMA, observations: [observation], cases: [{ id: 'example-case', placeId: 'fictional-place', feature: 'entrance', observationIds: [observation.id], createdOn: '2026-11-20' }], events: [] };
}
