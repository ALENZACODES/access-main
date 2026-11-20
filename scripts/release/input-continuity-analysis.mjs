/** Conservative assessment of recorded task continuity, without executing the user journey. */
import { validate, STATES, INPUTS, TASKS, LANGUAGES, NETWORKS, fingerprint } from './input-continuity-contract.mjs';

export const RULES = Object.freeze(['ENTRY', 'NAVIGATION', 'ACTIVATION', 'INTERRUPTION', 'RESTORATION', 'CONFIRMATION', 'TARGET_SIZE', 'TASK_OUTCOME']);
export const RULE_STEPS = Object.freeze({ ENTRY: 'start', NAVIGATION: 'navigate', ACTIVATION: 'activate', INTERRUPTION: 'interrupt', RESTORATION: 'restore', CONFIRMATION: 'confirm' });
export const STATUS_RANK = Object.freeze({ FAIL: 0, UNKNOWN: 1, PASS: 2 });
export function aggregate(states) {
 if (!Array.isArray(states) || states.length === 0) return 'UNKNOWN';
 if (states.includes('FAIL')) return 'FAIL';
 if (states.includes('UNKNOWN')) return 'UNKNOWN';
 return states.every(x => x === 'PASS') ? 'PASS' : 'UNKNOWN';
}
export function ruleForSteps(steps, kind) {
 const found = steps.filter(s => s.kind === kind);
 return aggregate(found.map(x => x.state));
}
export function touchTarget(steps) {
 const targets = steps.filter(s => ['navigate', 'activate'].includes(s.kind) && (s.width !== undefined || s.height !== undefined));
 if (targets.length === 0) return 'UNKNOWN';
 return aggregate(targets.map(s => s.width === 'UNKNOWN' || s.height === 'UNKNOWN' || s.width === undefined || s.height === undefined ? 'UNKNOWN' : s.width >= 44 && s.height >= 44 ? 'PASS' : 'FAIL'));
}
export function interruptionPairs(steps) {
 const pairs = [];
 for (let index = 0; index < steps.length; index++) {
  const step = steps[index];
  if (step.kind !== 'interrupt') continue;
  const subsequent = steps.slice(index + 1);
  const restored = subsequent.find(s => s.kind === 'restore') ?? null;
  const confirmation = restored ? subsequent.find(s => s.order > restored.order && s.kind === 'confirm') ?? null : null;
  pairs.push({ interrupted: step.id, restored: restored?.id ?? null, confirmation: confirmation?.id ?? null, result: !restored || !confirmation ? 'UNKNOWN' : aggregate([step.state, restored.state, confirmation.state]) });
 }
 return pairs;
}
export function sessionReview(session) {
 const rules = Object.fromEntries(RULES.map(k => [k, 'UNKNOWN']));
 for (const [rule, kind] of Object.entries(RULE_STEPS)) rules[rule] = ruleForSteps(session.steps, kind);
 rules.TARGET_SIZE = touchTarget(session.steps);
 rules.TASK_OUTCOME = session.outcome;
 const evidence = [];
 if (session.steps.length === 0) evidence.push({ code: 'EMPTY_CAPTURE', state: 'UNKNOWN' });
 const pairs = interruptionPairs(session.steps);
 for (const pair of pairs) {
  if (!pair.restored) evidence.push({ code: 'RESTORE_NOT_CAPTURED', state: 'UNKNOWN', stepId: pair.interrupted });
  else if (!pair.confirmation) evidence.push({ code: 'CONFIRM_NOT_CAPTURED', state: 'UNKNOWN', stepId: pair.interrupted });
  else if (pair.result === 'FAIL') evidence.push({ code: 'RECORDED_RESUME_FAILURE', state: 'FAIL', stepId: pair.interrupted });
 }
 if (session.outcome === 'PASS' && Object.values(rules).includes('FAIL')) evidence.push({ code: 'OUTCOME_CONTRADICTION', state: 'FAIL' });
 if (session.outcome === 'PASS' && !session.steps.some(s => s.kind === 'confirm' && s.state === 'PASS')) evidence.push({ code: 'OUTCOME_WITHOUT_CONFIRMATION', state: 'UNKNOWN' });
 if (session.input !== 'touch') rules.TARGET_SIZE = 'UNKNOWN';
 const important = ['ENTRY', 'NAVIGATION', 'ACTIVATION', 'CONFIRMATION', 'TASK_OUTCOME'];
 const required = session.steps.some(x => x.kind === 'interrupt') ? [...important, 'RESTORATION'] : important;
 const overall = aggregate(required.map(rule => rules[rule]));
 const observed = Object.values(rules).filter(x => x !== 'UNKNOWN').length;
 return { id: session.id, language: session.language, input: session.input, task: session.task, network: session.network, recorded: session.outcome, status: overall, rules, evidence, interruptionPairs: pairs, observed, digest: fingerprint(session.steps), provenance: session.provenance };
}
export function compareStatus(before, after) {
 if (!STATES.includes(before) || !STATES.includes(after)) return 'invalid';
 if (before === after) return 'same';
 if (before === 'PASS' && after !== 'PASS') return 'regressed';
 if (before === 'UNKNOWN' && after === 'PASS') return 'needs-review';
 if (after === 'FAIL') return 'regressed';
 if (before === 'FAIL' && after !== 'FAIL') return 'needs-review';
 return 'changed';
}
export function analyze(document, options = {}) {
 const check = validate(document, options);
 if (!check.ok) return { ok: false, issues: check.issues, reviews: [], summary: null, fingerprint: null };
 const reviews = document.sessions.map(sessionReview).sort((a, b) => a.id.localeCompare(b.id));
 const states = { PASS: 0, FAIL: 0, UNKNOWN: 0 };
 for (const review of reviews) states[review.status] += 1;
 const inputCoverage = Object.fromEntries(INPUTS.map(input => [input, reviews.filter(r => r.input === input).length]));
 const languageCoverage = Object.fromEntries(LANGUAGES.map(language => [language, reviews.filter(r => r.language === language).length]));
 return { ok: true, issues: [], reviews, summary: { total: reviews.length, states, inputCoverage, languageCoverage, unknownRules: reviews.reduce((n, r) => n + Object.values(r.rules).filter(s => s === 'UNKNOWN').length, 0) }, fingerprint: fingerprint(document) };
}
export function coverage(document, expected = [], options = {}) {
 const result = analyze(document, options);
 if (!result.ok) return { ok: false, issues: result.issues, missing: [] };
 if (!Array.isArray(expected) || expected.length > 1000) return { ok: false, issues: [{ code: 'EXPECTATION_LIMIT', path: '/expected' }], missing: [] };
 const combos = expected.length ? expected : LANGUAGES.flatMap(language => TASKS.flatMap(task => INPUTS.map(input => ({ language, task, input, network: 'offline' }))));
 const missing = [];
 const seen = new Set();
 for (const [i, item] of combos.entries()) {
  if (!item || !LANGUAGES.includes(item.language) || !TASKS.includes(item.task) || !INPUTS.includes(item.input) || !NETWORKS.includes(item.network)) return { ok: false, issues: [{ code: 'EXPECTATION', path: `/expected/${i}` }], missing: [] };
  const key = [item.language, item.task, item.input, item.network].join('|');
  if (seen.has(key)) continue;
  seen.add(key);
  if (!result.reviews.some(r => [r.language, r.task, r.input, r.network].join('|') === key)) missing.push({ ...item, state: 'UNKNOWN', reason: 'not-recorded' });
 }
 missing.sort((a, b) => [a.language, a.task, a.input, a.network].join('|').localeCompare([b.language, b.task, b.input, b.network].join('|')));
 return { ok: true, issues: [], missing, recorded: result.reviews.length, expected: seen.size };
}
export function reviewTasks(document, options = {}) {
 const result = analyze(document, options);
 if (!result.ok) return { ok: false, issues: result.issues, tasks: [] };
 const tasks = [];
 for (const review of result.reviews) {
  for (const [rule, state] of Object.entries(review.rules)) {
   if (state === 'PASS') continue;
   tasks.push({ sessionId: review.id, language: review.language, input: review.input, task: review.task, rule, state, priority: state === 'FAIL' ? 'block' : 'review', source: review.provenance.source });
  }
  for (const issue of review.evidence) tasks.push({ sessionId: review.id, language: review.language, input: review.input, task: review.task, rule: issue.code, state: issue.state, priority: issue.state === 'FAIL' ? 'block' : 'review', source: review.provenance.source });
 }
 tasks.sort((a, b) => (a.priority === b.priority ? [a.sessionId, a.rule].join(':').localeCompare([b.sessionId, b.rule].join(':')) : a.priority === 'block' ? -1 : 1));
 return { ok: true, issues: [], tasks: tasks.map((task, index) => ({ order: index + 1, ...task })) };
}
