import { ACTIONS, DECISIONS, UNKNOWN, validateLedger, error, validDay, validId } from './review-ledger-contract.mjs';

/** Recover a case's state from its immutable chronological events. */
export function reduceCase(record, events) {
  let state = 'new';
  let decision = 'none';
  let lastDate = record.createdOn;
  let lastAction = null;
  const issues = [];
  const transitions = [];
  for (const event of events) {
    if (event.date < lastDate) { issues.push(error('EVENT_OUT_OF_ORDER', event.id)); continue; }
    const allowed = {
      new: ['open'],
      open: ['annotate', 'request-evidence', 'defer', 'close'],
      waiting: ['annotate', 'request-evidence', 'defer', 'close'],
      deferred: ['annotate', 'request-evidence', 'close'],
      closed: ['reopen']
    }[state];
    if (!allowed?.includes(event.action)) { issues.push(error('TRANSITION_INVALID', event.id)); continue; }
    if (event.action === 'open' || event.action === 'reopen') {
      if (event.decision !== 'none') { issues.push(error('DECISION_UNEXPECTED', event.id)); continue; }
      state = 'open'; decision = 'none';
    } else if (event.action === 'request-evidence') {
      if (event.decision !== 'needs-review') { issues.push(error('DECISION_INVALID_FOR_ACTION', event.id)); continue; }
      state = 'waiting'; decision = 'needs-review';
    } else if (event.action === 'defer') {
      if (!['needs-review', 'insufficient-evidence'].includes(event.decision)) { issues.push(error('DECISION_INVALID_FOR_ACTION', event.id)); continue; }
      state = 'deferred'; decision = event.decision;
    } else if (event.action === 'close') {
      if (!['reviewed', 'insufficient-evidence', 'conflicting-evidence'].includes(event.decision)) { issues.push(error('DECISION_INVALID_FOR_ACTION', event.id)); continue; }
      state = 'closed'; decision = event.decision;
    } else if (event.action === 'annotate') {
      if (event.decision !== decision) { issues.push(error('ANNOTATION_CANNOT_CHANGE_DECISION', event.id)); continue; }
    }
    lastDate = event.date;
    lastAction = event.action;
    transitions.push({ id: event.id, action: event.action, date: event.date, state, decision });
  }
  return { caseId: record.id, state, decision, lastDate, lastAction, transitions, issues };
}
export function replay(ledger, { today = '2026-11-20' } = {}) {
  const checked = validateLedger(ledger, { today });
  if (!checked.ok) return { ok: false, issues: checked.issues, cases: [] };
  const eventsByCase = new Map();
  for (const row of checked.value.events) {
    if (!eventsByCase.has(row.caseId)) eventsByCase.set(row.caseId, []);
    eventsByCase.get(row.caseId).push(row);
  }
  const cases = [], issues = [];
  for (const record of checked.value.cases) {
    const result = reduceCase(record, eventsByCase.get(record.id) ?? []);
    cases.push(result);
    issues.push(...result.issues);
  }
  return { ok: issues.length === 0, issues, cases };
}
export function addEvent(ledger, event, { today = '2026-11-20' } = {}) {
  const before = replay(ledger, { today });
  if (!before.ok) return { ok: false, issues: before.issues };
  if (!validDay(today)) return { ok: false, issues: [error('TODAY_INVALID', '$')] };
  if (!event || !validId(event.id)) return { ok: false, issues: [error('EVENT_ID_INVALID', '$')] };
  if (ledger.events.some(x => x.id === event.id)) return { ok: false, issues: [error('DUPLICATE_ID', event.id)] };
  const next = { schemaVersion: ledger.schemaVersion, observations: ledger.observations.map(x => ({ ...x })), cases: ledger.cases.map(x => ({ ...x, observationIds: [...x.observationIds] })), events: [...ledger.events.map(x => ({ ...x })), { ...event }] };
  const after = replay(next, { today });
  if (!after.ok) return { ok: false, issues: after.issues };
  return { ok: true, issues: [], value: next };
}
export function createCase(ledger, caseRecord, { today = '2026-11-20' } = {}) {
  const previous = replay(ledger, { today });
  if (!previous.ok) return { ok: false, issues: previous.issues };
  if (ledger.cases.some(x => x.id === caseRecord?.id)) return { ok: false, issues: [error('DUPLICATE_ID', String(caseRecord.id))] };
  const next = { ...ledger, cases: [...ledger.cases, caseRecord] };
  const after = replay(next, { today });
  return after.ok ? { ok: true, issues: [], value: next } : { ok: false, issues: after.issues };
}
export function addObservation(ledger, observation, { today = '2026-11-20' } = {}) {
  const previous = validateLedger(ledger, { today });
  if (!previous.ok) return { ok: false, issues: previous.issues };
  if (ledger.observations.some(x => x.id === observation?.id)) return { ok: false, issues: [error('DUPLICATE_ID', String(observation.id))] };
  const next = { ...ledger, observations: [...ledger.observations, observation] };
  const after = validateLedger(next, { today });
  return after.ok ? { ok: true, issues: [], value: next } : { ok: false, issues: after.issues };
}
export function caseObservations(ledger, record) {
  const byId = new Map(ledger.observations.map(x => [x.id, x]));
  return record.observationIds.map(id => byId.get(id)).filter(Boolean);
}
export function observedStatuses(rows) {
  const counts = { UNKNOWN: 0, reported: 0, 'not-reported': 0 };
  for (const row of rows) counts[row.status] += 1;
  const explicit = rows.filter(row => row.status !== UNKNOWN);
  const distinct = new Set(explicit.map(row => row.status));
  return { counts, hasConflict: distinct.size > 1, status: explicit.length === 0 || distinct.size > 1 ? UNKNOWN : explicit[0].status };
}
export function caseDetail(ledger, record, replayResult = null) {
  const observations = caseObservations(ledger, record);
  const statuses = observedStatuses(observations);
  const state = replayResult ?? reduceCase(record, ledger.events.filter(x => x.caseId === record.id));
  return {
    id: record.id,
    placeId: record.placeId,
    feature: record.feature,
    observationIds: [...record.observationIds],
    createdOn: record.createdOn,
    observationCount: observations.length,
    statuses,
    workflow: { state: state.state, decision: state.decision, lastDate: state.lastDate },
    evidence: observations.map(x => ({ ...x }))
  };
}
export function analyzeLedger(ledger, options = {}) {
  const history = replay(ledger, options);
  if (!history.ok) return { ok: false, issues: history.issues };
  const cases = ledger.cases.map((row, i) => caseDetail(ledger, row, history.cases[i]));
  const totals = {
    cases: cases.length, observations: ledger.observations.length, events: ledger.events.length,
    new: 0, open: 0, waiting: 0, deferred: 0, closed: 0,
    conflicting: 0, UNKNOWN: 0, reported: 0, 'not-reported': 0
  };
  for (const item of cases) {
    totals[item.workflow.state] += 1;
    if (item.statuses.hasConflict) totals.conflicting += 1;
    totals[item.statuses.status] += 1;
  }
  return { ok: true, issues: [], cases, totals };
}
export function pendingCases(ledger, options = {}) {
  const output = analyzeLedger(ledger, options);
  if (!output.ok) return output;
  return { ok: true, cases: output.cases.filter(x => x.workflow.state !== 'closed') };
}
export function timeline(ledger, caseId, options = {}) {
  const checked = replay(ledger, options);
  if (!checked.ok) return { ok: false, issues: checked.issues };
  const result = checked.cases.find(x => x.caseId === caseId);
  if (!result) return { ok: false, issues: [error('CASE_NOT_FOUND', caseId)] };
  return { ok: true, events: result.transitions, state: result.state, decision: result.decision };
}
export function canPerform(state, action) {
  if (!ACTIONS.includes(action)) return false;
  const transitions = {
    new: ['open'], open: ['annotate', 'request-evidence', 'defer', 'close'],
    waiting: ['annotate', 'request-evidence', 'defer', 'close'],
    deferred: ['annotate', 'request-evidence', 'close'], closed: ['reopen']
  };
  return (transitions[state] ?? []).includes(action);
}
export function decisionAllowed(action, decision) {
  if (!DECISIONS.includes(decision)) return false;
  if (['open', 'reopen'].includes(action)) return decision === 'none';
  if (action === 'request-evidence') return decision === 'needs-review';
  if (action === 'defer') return ['needs-review', 'insufficient-evidence'].includes(decision);
  if (action === 'close') return ['reviewed', 'insufficient-evidence', 'conflicting-evidence'].includes(decision);
  return action === 'annotate';
}
