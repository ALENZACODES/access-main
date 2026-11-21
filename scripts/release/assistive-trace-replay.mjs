/** Replay the order of operator-captured events without simulating a browser. */
import { createHash } from 'node:crypto';
import { inspectTrace, TRACE_STATES } from './assistive-trace-contract.mjs';

export const REPLAY_ISSUES = Object.freeze([
  'STEP_START_MISSING', 'STEP_END_MISSING', 'STEP_END_EARLY',
  'STEP_START_LATE', 'DUPLICATE_START', 'DUPLICATE_END', 'KEY_MISSING',
  'FOCUS_MISSING', 'ANNOUNCEMENT_MISSING', 'ASSET_MISSING',
  'STORAGE_MISSING', 'RECORDED_FAILURE', 'STATE_UNKNOWN', 'EVENT_OUT_OF_ORDER',
  'FOCUS_BEFORE_KEY', 'ANNOUNCEMENT_BEFORE_FOCUS', 'STEP_OUTCOME_UNKNOWN',
  'STEP_OUTCOME_INCOMPLETE', 'OBSERVED_DISAGREEMENT',
]);
const SEVERITY = { error: 3, review: 2, information: 1 };

export function replayFinding(code, path, severity = 'review') {
  return { code, path, severity };
}
export function channelEvent(type) {
  return {
    keyboard: 'key', focus: 'focus', announcement: 'announce',
    offline: 'asset', storage: 'storage',
  }[type] ?? null;
}
export function stateFromFindings(findings) {
  if (findings.some((finding) => finding.severity === 'error')) return 'FAIL';
  if (findings.some((finding) => finding.severity === 'review')) return 'UNKNOWN';
  return 'PASS';
}
export function replayStep(step, path) {
  const events = step.events ?? [];
  const findings = [];
  const starts = events.filter((event) => event.type === 'step-start');
  const ends = events.filter((event) => event.type === 'step-end');
  if (starts.length === 0) findings.push(replayFinding('STEP_START_MISSING', path));
  if (ends.length === 0) findings.push(replayFinding('STEP_END_MISSING', path));
  if (starts.length > 1) findings.push(replayFinding('DUPLICATE_START', path, 'error'));
  if (ends.length > 1) findings.push(replayFinding('DUPLICATE_END', path, 'error'));
  if (starts.length && ends.length && starts[0].at > ends[0].at) findings.push(replayFinding('STEP_END_EARLY', path, 'error'));
  if (starts.length && events.length && starts[0].at > events[0].at) findings.push(replayFinding('STEP_START_LATE', path));
  if (ends.length && events.length && ends[0].at < events.at(-1).at) findings.push(replayFinding('EVENT_OUT_OF_ORDER', path));
  const targetType = channelEvent(step.channel);
  const actual = events.filter((event) => event.type === targetType);
  if (actual.length === 0) {
    const code = {
      keyboard: 'KEY_MISSING', focus: 'FOCUS_MISSING',
      announcement: 'ANNOUNCEMENT_MISSING', offline: 'ASSET_MISSING',
      storage: 'STORAGE_MISSING',
    }[step.channel];
    findings.push(replayFinding(code, path));
  }
  if (events.some((event) => event.state === 'FAIL')) findings.push(replayFinding('RECORDED_FAILURE', path, 'error'));
  if (events.some((event) => event.state === 'UNKNOWN')) findings.push(replayFinding('STATE_UNKNOWN', path));
  if (ends.some((event) => event.outcome === 'UNKNOWN')) findings.push(replayFinding('STEP_OUTCOME_UNKNOWN', path));
  if (ends.some((event) => event.outcome === 'incomplete')) findings.push(replayFinding('STEP_OUTCOME_INCOMPLETE', path, 'error'));
  const firstKey = events.find((event) => event.type === 'key');
  const firstFocus = events.find((event) => event.type === 'focus');
  const firstAnnounce = events.find((event) => event.type === 'announce');
  if (firstKey && firstFocus && firstFocus.at < firstKey.at && step.channel === 'keyboard') findings.push(replayFinding('FOCUS_BEFORE_KEY', path));
  if (firstAnnounce && firstFocus && firstAnnounce.at < firstFocus.at && step.channel === 'announcement') {
    findings.push(replayFinding('ANNOUNCEMENT_BEFORE_FOCUS', path));
  }
  const actualStatus = stateFromFindings(findings);
  if (step.expected === 'PASS' && actualStatus !== 'PASS') findings.push(replayFinding('OBSERVED_DISAGREEMENT', path));
  const state = stateFromFindings(findings);
  return {
    id: step.id, channel: step.channel, expected: step.expected, state,
    events: events.length, eventDigest: createHash('sha256').update(JSON.stringify(events)).digest('hex'), findings: findings.sort((a, b) => a.code.localeCompare(b.code, 'en')),
  };
}
export function replayJourney(journey, path) {
  const steps = journey.steps.map((step, index) => replayStep(step, `${path}/steps/${index}`));
  const findings = steps.flatMap((step) => step.findings);
  return {
    id: journey.id, locale: journey.locale, network: journey.network,
    state: stateFromFindings(findings), steps, findings,
  };
}
export function replayTrace(value, options = {}) {
  const check = inspectTrace(value, options);
  if (!check.ok) return { ok: false, problems: check.problems, result: null };
  const journeys = value.journeys.map((journey, index) => replayJourney(journey, `/journeys/${index}`))
    .sort((a, b) => a.id.localeCompare(b.id, 'en'));
  const counts = { PASS: 0, FAIL: 0, UNKNOWN: 0 };
  const stepCounts = { PASS: 0, FAIL: 0, UNKNOWN: 0 };
  for (const journey of journeys) {
    counts[journey.state] += 1;
    for (const step of journey.steps) stepCounts[step.state] += 1;
  }
  const findings = journeys.flatMap((journey) => journey.findings)
    .sort((a, b) => a.path.localeCompare(b.path, 'en') || a.code.localeCompare(b.code, 'en'));
  return {
    ok: true, problems: [], result: {
      status: counts.FAIL ? 'FAIL' : counts.UNKNOWN || journeys.length === 0 ? 'UNKNOWN' : 'PASS',
      counts, stepCounts, journeys, findings,
    },
  };
}
export function compareReplays(earlier, later, options = {}) {
  const a = replayTrace(earlier, options);
  const b = replayTrace(later, options);
  const problems = [
    ...a.problems.map((item) => ({ ...item, snapshot: 'earlier' })),
    ...b.problems.map((item) => ({ ...item, snapshot: 'later' })),
  ];
  if (problems.length) return { ok: false, problems, changes: null };
  const before = new Map(a.result.journeys.map((journey) => [journey.id, journey]));
  const after = new Map(b.result.journeys.map((journey) => [journey.id, journey]));
  const keys = [...new Set([...before.keys(), ...after.keys()])].sort((x, y) => x.localeCompare(y, 'en'));
  const changes = [];
  for (const id of keys) {
    const left = before.get(id);
    const right = after.get(id);
    if (!left) changes.push({ id, kind: 'added', before: 'UNKNOWN', after: right.state });
    else if (!right) changes.push({ id, kind: 'removed', before: left.state, after: 'UNKNOWN' });
    else if (left.state !== right.state) changes.push({ id, kind: 'state-changed', before: left.state, after: right.state });
    else if (JSON.stringify(left.steps) !== JSON.stringify(right.steps)) changes.push({ id, kind: 'evidence-changed', before: left.state, after: right.state });
  }
  return { ok: true, problems: [], changes };
}
export function severityScore(value) {
  return SEVERITY[value] ?? 0;
}
export function stateValid(value) {
  return TRACE_STATES.includes(value);
}
