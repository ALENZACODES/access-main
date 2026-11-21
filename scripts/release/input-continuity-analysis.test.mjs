import assert from 'node:assert/strict';
import test from 'node:test';
import {
 RULES, RULE_STEPS, STATUS_RANK, aggregate, ruleForSteps, touchTarget,
 interruptionPairs, sessionReview, compareStatus, analyze, coverage, reviewTasks,
} from './input-continuity-analysis.mjs';
import { TODAY, session, step, document, complete, interrupted, pair, clone } from './input-continuity-fixtures.mjs';

const options = { today: TODAY };
const run = value => analyze(value, options);
const missing = value => coverage(value, [], options).missing;
const review = value => reviewTasks(value, options);
const failStep = kind => step('fail', { kind, state: 'FAIL' });

test('rule identifiers are unique and stable', () => {
 assert.equal(RULES.length, new Set(RULES).size);
 assert.ok(RULES.includes('TARGET_SIZE'));
 assert.ok(RULES.includes('RESTORATION'));
});
test('each step-backed rule has an explicit event type', () => {
 for (const [rule, kind] of Object.entries(RULE_STEPS)) {
  assert.ok(RULES.includes(rule));
  assert.ok(['start', 'navigate', 'activate', 'interrupt', 'restore', 'confirm'].includes(kind));
 }
});
test('tri-state priority never treats missing evidence as PASS', () => {
 assert.equal(STATUS_RANK.FAIL < STATUS_RANK.UNKNOWN, true);
 assert.equal(STATUS_RANK.UNKNOWN < STATUS_RANK.PASS, true);
});
test('empty aggregation is UNKNOWN', () => {
 assert.equal(aggregate([]), 'UNKNOWN');
 assert.equal(aggregate(null), 'UNKNOWN');
});
test('PASS requires every observed state to pass', () => {
 assert.equal(aggregate(['PASS']), 'PASS');
 assert.equal(aggregate(['PASS', 'PASS', 'PASS']), 'PASS');
});
test('FAIL dominates incomplete evidence', () => {
 for (const values of [['FAIL'], ['PASS', 'FAIL'], ['UNKNOWN', 'FAIL'], ['FAIL', 'PASS', 'UNKNOWN']]) assert.equal(aggregate(values), 'FAIL');
});
test('UNKNOWN prevents unsupported success', () => {
 assert.equal(aggregate(['UNKNOWN']), 'UNKNOWN');
 assert.equal(aggregate(['PASS', 'UNKNOWN']), 'UNKNOWN');
});
test('ruleForSteps ignores unrelated event kinds', () => {
 assert.equal(ruleForSteps([step('one')], 'activate'), 'UNKNOWN');
});
test('ruleForSteps retains explicit failure', () => {
 assert.equal(ruleForSteps([step('start'), failStep('activate')], 'activate'), 'FAIL');
});
test('ruleForSteps considers repeated observations conservatively', () => {
 assert.equal(ruleForSteps([step('first', { kind: 'activate' }), failStep('activate')], 'activate'), 'FAIL');
});
test('touch target requires both width and height evidence', () => {
 assert.equal(touchTarget([step('a', { kind: 'activate', width: 44 })]), 'UNKNOWN');
 assert.equal(touchTarget([step('a', { kind: 'activate', height: 44 })]), 'UNKNOWN');
});
test('touch target accepts an exactly 44 by 44 control', () => {
 assert.equal(touchTarget([step('a', { kind: 'activate', width: 44, height: 44 })]), 'PASS');
});
test('touch target rejects either dimension smaller than 44', () => {
 assert.equal(touchTarget([step('a', { kind: 'activate', width: 43, height: 44 })]), 'FAIL');
 assert.equal(touchTarget([step('a', { kind: 'navigate', width: 44, height: 43 })]), 'FAIL');
});
test('touch target returns UNKNOWN when no dimensions are captured', () => {
 assert.equal(touchTarget([step()]), 'UNKNOWN');
});
test('touch target combines multiple controls conservatively', () => {
 const steps = [step('a', { kind: 'activate', width: 50, height: 50 }), step('b', { kind: 'navigate', order: 2, width: 43, height: 50 })];
 assert.equal(touchTarget(steps), 'FAIL');
});
test('touch target treats unknown width as missing', () => {
 assert.equal(touchTarget([step('a', { kind: 'activate', width: 'UNKNOWN', height: 55 })]), 'UNKNOWN');
});
test('touch target accepts oversized controls', () => {
 assert.equal(touchTarget([step('a', { kind: 'activate', width: 88, height: 72 })]), 'PASS');
});
test('no interruption yields zero recovery pairs', () => {
 assert.deepEqual(interruptionPairs(complete().steps), []);
});
test('interruption must be followed by explicit restoration', () => {
 const steps = [step('a', { kind: 'interrupt' })];
 assert.deepEqual(interruptionPairs(steps), [{ interrupted: 'a', restored: null, confirmation: null, result: 'UNKNOWN' }]);
});
test('restoration without a confirmation is incomplete', () => {
 const steps = [step('a', { kind: 'interrupt' }), step('b', { kind: 'restore', order: 2 })];
 assert.equal(interruptionPairs(steps)[0].result, 'UNKNOWN');
 assert.equal(interruptionPairs(steps)[0].confirmation, null);
});
test('recorded complete resume links three event IDs', () => {
 const result = interruptionPairs(interrupted().steps)[0];
 assert.equal(result.interrupted, 'interrupt');
 assert.equal(result.restored, 'restore');
 assert.equal(result.confirmation, 'confirm');
 assert.equal(result.result, 'PASS');
});
test('failing resume confirmation defeats the recovery claim', () => {
 const value = interrupted();
 value.steps.at(-1).state = 'FAIL';
 assert.equal(interruptionPairs(value.steps)[0].result, 'FAIL');
});
test('a confirmation before restoration cannot establish recovery', () => {
 const steps = [step('a', { kind: 'interrupt' }), step('b', { kind: 'confirm', order: 2 }), step('c', { kind: 'restore', order: 3 })];
 assert.equal(interruptionPairs(steps)[0].confirmation, null);
});
test('consecutive interruptions generate independent review records', () => {
 const steps = [step('one', { kind: 'interrupt' }), step('two', { kind: 'interrupt', order: 2 })];
 assert.equal(interruptionPairs(steps).length, 2);
});
test('empty session leaves rule states UNKNOWN', () => {
 const result = sessionReview(session('empty', { steps: [] }));
 assert.equal(result.status, 'UNKNOWN');
 assert.ok(result.evidence.some(x => x.code === 'EMPTY_CAPTURE'));
});
test('fixture with a full observed task passes the required rules', () => {
 assert.equal(sessionReview(complete()).status, 'PASS');
});
test('baseline session is UNKNOWN, never a silent pass', () => {
 const result = sessionReview(session());
 assert.equal(result.status, 'UNKNOWN');
 assert.equal(result.recorded, 'UNKNOWN');
});
test('missing activation cannot result in PASS', () => {
 const value = complete(); value.steps = value.steps.filter(x => x.kind !== 'activate');
 assert.equal(sessionReview(value).status, 'UNKNOWN');
});
test('failed keyboard activation blocks a task', () => {
 const value = complete(); value.steps[2].state = 'FAIL';
 assert.equal(sessionReview(value).status, 'FAIL');
});
test('failed start is not ignored because later events passed', () => {
 const value = complete(); value.steps[0].state = 'FAIL';
 assert.equal(sessionReview(value).status, 'FAIL');
});
test('completed interruption and resume can pass', () => {
 assert.equal(sessionReview(interrupted()).status, 'PASS');
});
test('interrupted task without restore is UNKNOWN', () => {
 const value = interrupted(); value.steps = value.steps.filter(x => x.kind !== 'restore');
 assert.equal(sessionReview(value).status, 'UNKNOWN');
});
test('interrupted task without confirm is UNKNOWN', () => {
 const value = interrupted(); value.steps = value.steps.filter(x => x.kind !== 'confirm');
 assert.equal(sessionReview(value).status, 'UNKNOWN');
});
test('touch-only target check is NOT inferred for keyboard', () => {
 const result = sessionReview(complete());
 assert.equal(result.rules.TARGET_SIZE, 'UNKNOWN');
});
test('touch target failures are preserved in touch reviews', () => {
 const value = complete('touch', { input: 'touch' });
 value.steps[2].width = 42; value.steps[2].height = 47;
 assert.equal(sessionReview(value).rules.TARGET_SIZE, 'FAIL');
});
test('touch size is UNKNOWN when no measurement is supplied', () => {
 assert.equal(sessionReview(complete('touch', { input: 'touch' })).rules.TARGET_SIZE, 'UNKNOWN');
});
test('contradictory PASS claim creates a failing evidence note', () => {
 const value = complete(); value.steps[2].state = 'FAIL';
 assert.ok(sessionReview(value).evidence.some(x => x.code === 'OUTCOME_CONTRADICTION'));
});
test('PASS without confirmation creates an explicit review finding', () => {
 const value = session('claimed', { outcome: 'PASS', steps: [step('start')] });
 assert.ok(sessionReview(value).evidence.some(x => x.code === 'OUTCOME_WITHOUT_CONFIRMATION'));
});
test('session digest changes when event evidence changes', () => {
 const a = complete(), b = clone(a); b.steps[1].target = 'next';
 assert.notEqual(sessionReview(a).digest, sessionReview(b).digest);
});
test('session review preserves supplied provenance', () => {
 const value = complete(); assert.deepEqual(sessionReview(value).provenance, value.provenance);
});
test('status comparison detects loss of a pass', () => {
 for (const value of ['UNKNOWN', 'FAIL']) assert.equal(compareStatus('PASS', value), 'regressed');
});
test('status comparison requires review for an UNKNOWN to PASS change', () => {
 assert.equal(compareStatus('UNKNOWN', 'PASS'), 'needs-review');
});
test('status comparison does not claim FAIL to PASS is automatically safe', () => {
 assert.equal(compareStatus('FAIL', 'PASS'), 'needs-review');
});
test('status comparison detects a newly recorded failure', () => {
 assert.equal(compareStatus('UNKNOWN', 'FAIL'), 'regressed');
});
test('status comparison rejects invalid input', () => {
 assert.equal(compareStatus('YES', 'PASS'), 'invalid');
});
test('analysis accepts an empty capture without inventing evidence', () => {
 const result = run({ version: 1, sessions: [] });
 assert.equal(result.ok, true);
 assert.equal(result.summary.total, 0);
 assert.equal(result.summary.states.PASS, 0);
});
test('analysis rejects malformed source records', () => {
 const result = run(document(session('bad', { provenance: null })));
 assert.equal(result.ok, false);
 assert.deepEqual(result.reviews, []);
});
test('analysis preserves input order without mutating records', () => {
 const original = document(complete('z'), complete('a'));
 const snapshot = clone(original); run(original);
 assert.deepEqual(original, snapshot);
});
test('analysis sorts reviews deterministically by session ID', () => {
 assert.deepEqual(run(document(complete('z'), complete('a'))).reviews.map(x => x.id), ['a', 'z']);
});
test('summary outcome buckets count all sessions', () => {
 const result = run(document(complete('pass'), session('unknown'), complete('fail', { steps: [failStep('activate')] })));
 assert.equal(Object.values(result.summary.states).reduce((a, b) => a + b, 0), 3);
});
test('summary tracks the input-mode distribution', () => {
 const result = run(document(complete('keyboard'), complete('switch', { input: 'switch' })));
 assert.equal(result.summary.inputCoverage.keyboard, 1);
 assert.equal(result.summary.inputCoverage.switch, 1);
 assert.equal(result.summary.inputCoverage.voice, 0);
});
test('summary tracks language coverage without inferring French', () => {
 const result = run(document(complete('en')));
 assert.equal(result.summary.languageCoverage.fr, 0);
});
test('summary includes unknown rule observations', () => {
 assert.ok(run(document()).summary.unknownRules > 0);
});
test('fingerprint is stable for unchanged JSON', () => {
 assert.equal(run(document()).fingerprint, run(clone(document())).fingerprint);
});
test('default matrix exposes missing French offline cases', () => {
 assert.ok(missing(document()).some(x => x.language === 'fr' && x.network === 'offline'));
});
test('default matrix contains five input methods and six tasks in two languages', () => {
 const result = coverage({ version: 1, sessions: [] }, [], options);
 assert.equal(result.expected, 2 * 6 * 5);
 assert.equal(result.missing.length, 2 * 6 * 5);
});
test('recording a matching case removes only its coverage gap', () => {
 const before = coverage({ version: 1, sessions: [] }, [], options);
 const after = coverage(document(session()), [], options);
 assert.equal(before.missing.length - after.missing.length, 1);
});
test('online-only recording cannot fill an offline gap', () => {
 assert.equal(missing(document(complete('online', { network: 'online' }))).length, 60);
});
test('explicit expectation list suppresses irrelevant dimensions', () => {
 const result = coverage(document(), [{ language: 'en', task: 'search', input: 'keyboard', network: 'offline' }], options);
 assert.deepEqual(result.missing, []);
});
test('unrecorded custom expected case remains UNKNOWN', () => {
 const result = coverage(document(), [{ language: 'fr', task: 'save-offline', input: 'switch', network: 'limited' }], options);
 assert.equal(result.missing[0].state, 'UNKNOWN');
});
test('duplicate expected combinations do not double count', () => {
 const expected = [{ language: 'fr', task: 'search', input: 'touch', network: 'offline' }];
 assert.equal(coverage(document(), [...expected, ...expected], options).expected, 1);
});
test('malformed expectation returns a bounded error', () => {
 assert.equal(coverage(document(), [{ language: 'fr', input: 'bad' }], options).issues[0].code, 'EXPECTATION');
});
test('too many expectations fail safely', () => {
 assert.equal(coverage(document(), Array(1001).fill(null), options).issues[0].code, 'EXPECTATION_LIMIT');
});
test('coverage order is deterministic', () => {
 const a = coverage(pair(), [], options).missing;
 const b = coverage(pair(), [], options).missing;
 assert.deepEqual(a, b);
});
test('review tasks contain source attribution', () => {
 assert.ok(review(document()).tasks.every(t => t.source === 'https://example.org/public-notes'));
});
test('review tasks keep unresolved status rather than licensing it', () => {
 assert.ok(review(document()).tasks.some(t => t.state === 'UNKNOWN'));
});
test('review tasks order blocking items before review items', () => {
 const value = document(complete('pass', { steps: [failStep('start')] }), session('unknown'));
 const tasks = review(value).tasks;
 assert.equal(tasks[0].priority, 'block');
});
test('review tasks have consecutive order numbers', () => {
 const tasks = review(document()).tasks;
 assert.deepEqual(tasks.map(x => x.order), tasks.map((_, i) => i + 1));
});
test('malformed source cannot produce review worklist', () => {
 const result = review(document(session('a', { outcome: 'YES' })));
 assert.equal(result.ok, false);
 assert.deepEqual(result.tasks, []);
});
test('review task ordering stable across input order', () => {
 const a = review(document(session('b'), session('a'))).tasks;
 const b = review(document(session('a'), session('b'))).tasks;
 assert.deepEqual(a, b);
});
