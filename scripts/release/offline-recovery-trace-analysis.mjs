/** Conservative evaluation of recorded error and recovery sequences. */
import { createHash } from 'node:crypto';
import { inspectTraceDocument, TRACE_CATEGORIES, TRACE_MODES } from './offline-recovery-trace-contract.mjs';

export const RECOVERY_KINDS = Object.freeze([
  'unlinked-failure', 'unlinked-recovery', 'recovery-unknown', 'recovery-failed',
  'check-missing', 'check-unknown', 'check-failed', 'complete', 'conflict',
]);
export const REVIEW_STATES = Object.freeze(['PASS', 'FAIL', 'UNKNOWN']);
const KIND_RANK = new Map(RECOVERY_KINDS.map((kind, index) => [kind, index]));

export function finding(code, traceId, stepId = null, kind = 'review') {
  return Object.freeze({ code, traceId, stepId, kind });
}
export function eventDigest(trace) {
  const serial = trace.steps.map((step) => [step.id, step.at, step.kind, step.code,
    step.outcome, step.linkedTo ?? null]);
  return createHash('sha256').update(JSON.stringify(serial)).digest('hex');
}
export function matchingChecks(recovery, steps) {
  return steps.filter((step) => step.kind === 'check' && step.linkedTo === recovery.id &&
    step.at > recovery.at);
}
export function recoveryForFailure(failure, steps) {
  return steps.filter((step) => step.kind === 'recovery' && step.linkedTo === failure.id &&
    step.at > failure.at);
}
export function failureOutcome(failure, steps) {
  const recoveries = recoveryForFailure(failure, steps);
  if (!recoveries.length) {
    return { state: 'UNKNOWN', code: 'unlinked-failure', recoveryIds: [], checkIds: [] };
  }
  const stateCandidates = [];
  const checkIds = [];
  for (const recovery of recoveries) {
    if (recovery.outcome === 'FAIL') {
      stateCandidates.push('FAIL');
      continue;
    }
    const checks = matchingChecks(recovery, steps);
    if (!checks.length) { stateCandidates.push('UNKNOWN'); continue; }
    checkIds.push(...checks.map((check) => check.id));
    if (checks.some((check) => check.outcome === 'FAIL')) stateCandidates.push('FAIL');
    else if (checks.some((check) => check.outcome === 'UNKNOWN') || recovery.outcome === 'UNKNOWN') {
      stateCandidates.push('UNKNOWN');
    } else stateCandidates.push('PASS');
  }
  const state = stateCandidates.includes('FAIL') ? 'FAIL' :
    stateCandidates.every((value) => value === 'PASS') ? 'PASS' : 'UNKNOWN';
  return {
    state, code: state === 'FAIL' ? 'recovery-failed' :
      state === 'UNKNOWN' ? 'recovery-unknown' : 'complete',
    recoveryIds: recoveries.map((step) => step.id), checkIds,
  };
}
export function evaluateTrace(trace) {
  const outcomes = [];
  const issues = [];
  const failures = trace.steps.filter((step) => step.kind === 'failure');
  const recoveries = trace.steps.filter((step) => step.kind === 'recovery');
  const checks = trace.steps.filter((step) => step.kind === 'check');
  const actions = trace.steps.filter((step) => step.kind === 'action');
  const claimedRecoveries = new Set();
  for (const failure of failures) {
    const result = failureOutcome(failure, trace.steps);
    result.recoveryIds.forEach((id) => claimedRecoveries.add(id));
    outcomes.push({ failureId: failure.id, failureCode: failure.code,
      state: result.state, reason: result.code,
      recoveryIds: result.recoveryIds, checkIds: result.checkIds });
    if (result.state !== 'PASS') {
      issues.push(finding(result.code.toUpperCase().replace(/-/gu, '_'), trace.id, failure.id));
    }
  }
  for (const recovery of recoveries) {
    if (!claimedRecoveries.has(recovery.id)) issues.push(finding('UNLINKED_RECOVERY', trace.id, recovery.id));
  }
  for (const check of checks) {
    if (!recoveries.some((step) => step.id === check.linkedTo)) {
      issues.push(finding('UNLINKED_CHECK', trace.id, check.id));
    }
  }
  if (!failures.length) {
    issues.push(finding('NO_FAILURE_CAPTURE', trace.id));
  }
  if (!actions.length) issues.push(finding('NO_ACTION_CAPTURE', trace.id));
  const state = issues.some((item) => item.code === 'RECOVERY_FAILED') ? 'FAIL' :
    outcomes.length && outcomes.every((item) => item.state === 'PASS') &&
    issues.length === 0 ? 'PASS' : 'UNKNOWN';
  return {
    id: trace.id, route: trace.route, locale: trace.locale, mode: trace.mode,
    category: trace.category, label: trace.label, source: trace.source,
    digest: eventDigest(trace), state, events: trace.steps.length,
    failures: failures.length, recovered: outcomes.filter((entry) => entry.state === 'PASS').length,
    outcomes, findings: issues,
  };
}
export function analyzeRecoveryTraces(value, options = {}) {
  const validation = inspectTraceDocument(value, options);
  if (!validation.ok) return { ok: false, problems: validation.problems, report: null };
  const reports = validation.traces.map(evaluateTrace);
  const summary = {
    traces: reports.length,
    PASS: reports.filter((item) => item.state === 'PASS').length,
    FAIL: reports.filter((item) => item.state === 'FAIL').length,
    UNKNOWN: reports.filter((item) => item.state === 'UNKNOWN').length,
    failures: reports.reduce((sum, item) => sum + item.failures, 0),
    recovered: reports.reduce((sum, item) => sum + item.recovered, 0),
    findings: reports.reduce((sum, item) => sum + item.findings.length, 0),
  };
  return { ok: true, problems: [], report: { version: 1,
    releaseId: value.releaseId, recordedOn: value.recordedOn, summary, traces: reports } };
}
export function coverageKeys(traces) {
  const keys = new Set(traces.map((trace) => `${trace.locale}|${trace.mode}|${trace.category}`));
  return [...keys].sort();
}
export function coverageGaps(value, options = {}) {
  const check = analyzeRecoveryTraces(value, options);
  if (!check.ok) return { ok: false, problems: check.problems, gaps: null, summary: null };
  const locales = options.locales ?? ['en', 'fr'];
  const modes = options.modes ?? ['offline', 'online'];
  const categories = options.categories ?? TRACE_CATEGORIES;
  if (![locales, modes, categories].every(Array.isArray) ||
    !locales.every((v) => ['en', 'fr'].includes(v)) ||
    !modes.every((v) => TRACE_MODES.includes(v)) ||
    !categories.every((v) => TRACE_CATEGORIES.includes(v))) {
    return { ok: false, problems: [{ code: 'COVERAGE_OPTIONS', path: '/' }], gaps: null, summary: null };
  }
  const found = new Map();
  for (const trace of check.report.traces) {
    const key = `${trace.locale}|${trace.mode}|${trace.category}`;
    if (!found.has(key)) found.set(key, []);
    found.get(key).push(trace);
  }
  const gaps = [];
  for (const locale of locales) {
    for (const mode of modes) {
      for (const category of categories) {
        const key = `${locale}|${mode}|${category}`;
        const rows = found.get(key) ?? [];
        if (!rows.length) gaps.push({ locale, mode, category, state: 'UNKNOWN', reason: 'MISSING_TRACE' });
        else if (!rows.some((item) => item.state === 'PASS')) {
          gaps.push({ locale, mode, category, state: rows.some((item) => item.state === 'FAIL') ? 'FAIL' : 'UNKNOWN',
            reason: 'NO_PASSING_TRACE' });
        }
      }
    }
  }
  return { ok: true, problems: [], gaps, summary: {
    expected: locales.length * modes.length * categories.length,
    missing: gaps.filter((g) => g.reason === 'MISSING_TRACE').length,
    notPassing: gaps.filter((g) => g.reason === 'NO_PASSING_TRACE').length,
  } };
}
export function classifyFinding(value) {
  if (value.code === 'RECOVERY_FAILED') return 'block';
  if (value.code === 'NO_FAILURE_CAPTURE' || value.code === 'NO_ACTION_CAPTURE') return 'information';
  return 'review';
}
export function triageRecoveryTraces(value, options = {}) {
  const result = analyzeRecoveryTraces(value, options);
  if (!result.ok) return { ok: false, problems: result.problems, tasks: null };
  const tasks = result.report.traces.flatMap((trace) => trace.findings.map((entry) => ({
    id: `${trace.id}:${entry.stepId ?? 'trace'}:${entry.code}`,
    traceId: trace.id, category: trace.category, route: trace.route,
    severity: classifyFinding(entry), source: trace.source,
    state: trace.state, code: entry.code,
  })));
  const rank = { block: 0, review: 1, information: 2 };
  tasks.sort((a, b) => rank[a.severity] - rank[b.severity] ||
    a.route.localeCompare(b.route) || a.id.localeCompare(b.id));
  return { ok: true, problems: [], tasks };
}
export function outcomeKinds(value) { return RECOVERY_KINDS.includes(value) && KIND_RANK.has(value); }
