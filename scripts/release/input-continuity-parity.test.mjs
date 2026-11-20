import assert from 'node:assert/strict';
import test from 'node:test';
import {
 CORE_TASKS, CORE_INPUTS, parityKey, groupKey,
 modeSummaries, parityReview, criticalTaskGaps, inputEquivalence,
} from './input-continuity-parity.mjs';
import { analyze } from './input-continuity-analysis.mjs';
import { TODAY, document, session, complete, clone } from './input-continuity-fixtures.mjs';

const options = { today: TODAY, tasks: ['search'], inputs: ['keyboard'], networks: ['offline'] };
const run = value => parityReview(value, options);
const french = overrides => complete('fr', { language: 'fr', label: 'Parcours synthétique', ...overrides });
const english = overrides => complete('en', overrides);

test('core tasks include journey planning and offline saving', () => {
 assert.ok(CORE_TASKS.includes('plan-journey'));
 assert.ok(CORE_TASKS.includes('save-offline'));
});
test('core input methods include switch and screen readers', () => {
 assert.ok(CORE_INPUTS.includes('switch'));
 assert.ok(CORE_INPUTS.includes('screen-reader'));
});
test('key construction is deterministic and scoped', () => {
 assert.equal(parityKey('search', 'offline', 'keyboard'), 'search|offline|keyboard');
 assert.equal(groupKey('search', 'offline'), 'search|offline');
});
test('an empty trace has no inferred bilingual parity', () => {
 const result = run({ version: 1, sessions: [] });
 assert.equal(result.ok, true);
 assert.equal(result.records[0].parity, 'UNKNOWN');
});
test('missing French evidence remains UNKNOWN', () => {
 const result = run(document(english()));
 assert.equal(result.records[0].parity, 'UNKNOWN');
 assert.equal(result.records[0].languages.fr.state, 'UNKNOWN');
});
test('matching English/French PASS observations support parity', () => {
 const result = run(document(english(), french()));
 assert.equal(result.records[0].parity, 'MATCH');
 assert.equal(result.summary.matched, 1);
});
test('matching English/French FAIL does not hide blocking state', () => {
 const a = english(), b = french();
 a.steps[2].state = 'FAIL'; b.steps[2].state = 'FAIL';
 const result = run(document(a, b));
 assert.equal(result.records[0].parity, 'MATCH');
 assert.equal(result.records[0].priority, 'block');
});
test('different known states produce DIFFER', () => {
 const a = english(), b = french(); b.steps[2].state = 'FAIL';
 const result = run(document(a, b));
 assert.equal(result.records[0].parity, 'DIFFER');
 assert.equal(result.summary.different, 1);
});
test('different known states with FAIL create blocking priority', () => {
 const a = english(), b = french(); b.steps[2].state = 'FAIL';
 assert.equal(run(document(a, b)).records[0].priority, 'block');
});
test('UNKNOWN on either side prevents matching', () => {
 const a = english(), b = session('fr', { language: 'fr', label: 'Parcours synthétique' });
 assert.equal(run(document(a, b)).records[0].parity, 'UNKNOWN');
});
test('network mismatches cannot establish offline parity', () => {
 const a = english({ network: 'online' }), b = french({ network: 'online' });
 assert.equal(run(document(a, b)).records[0].parity, 'UNKNOWN');
});
test('touch captures cannot be substituted for keyboard evidence', () => {
 const a = english({ input: 'touch' }), b = french({ input: 'touch' });
 assert.equal(run(document(a, b)).records[0].parity, 'UNKNOWN');
});
test('switch evidence does not prove screen-reader parity', () => {
 const a = english({ input: 'switch' }), b = french({ input: 'switch' });
 const result = parityReview(document(a, b), { ...options, inputs: ['screen-reader'] });
 assert.equal(result.records[0].parity, 'UNKNOWN');
});
test('multiple identical recordings aggregate conservatively', () => {
 const a = english(), b = english({ id: 'en-second' }), f = french();
 b.steps[2].state = 'FAIL';
 assert.equal(run(document(a, b, f)).records[0].languages.en.state, 'FAIL');
});
test('duplicated input states are counted as captures', () => {
 const a = english(), b = english({ id: 'another' });
 assert.equal(run(document(a, b)).records[0].languages.en.captured, 2);
});
test('review entries preserve evidence presence separately from state', () => {
 const result = run(document(english()));
 assert.equal(result.records[0].languages.en.evidence, true);
 assert.equal(result.records[0].languages.fr.evidence, false);
});
test('records are sorted by a stable task/network/input key', () => {
 const result = parityReview({ version: 1, sessions: [] }, { today: TODAY, tasks: ['resume-task', 'search'], inputs: ['touch', 'keyboard'], networks: ['offline', 'online'] });
 const keys = result.records.map(x => x.key);
 assert.deepEqual(keys, [...keys].sort());
});
test('scope duplicates are deduplicated', () => {
 const result = parityReview(document(), { ...options, tasks: ['search', 'search'] });
 assert.equal(result.summary.total, 1);
});
test('non-array scopes are rejected before iteration', () => {
 const result = parityReview(document(), { ...options, tasks: null });
 assert.equal(result.ok, false);
 assert.equal(result.issues[0].code, 'PARITY_SCOPE');
});
test('invalid tasks are rejected as a scope error', () => {
 const result = parityReview(document(), { ...options, tasks: ['medical-clearance'] });
 assert.equal(result.ok, false);
 assert.equal(result.issues[0].code, 'PARITY_SCOPE');
});
test('invalid input vocabulary is rejected', () => {
 const result = parityReview(document(), { ...options, inputs: ['remote-control'] });
 assert.equal(result.ok, false);
});
test('invalid network vocabulary is rejected', () => {
 const result = parityReview(document(), { ...options, networks: ['wifi'] });
 assert.equal(result.ok, false);
});
test('invalid source document cannot create parity results', () => {
 const result = parityReview(document(session('bad', { provenance: null })), options);
 assert.equal(result.ok, false);
 assert.deepEqual(result.records, []);
});
test('summary counts partition the complete scope', () => {
 const result = run(document(english(), french()));
 assert.equal(result.summary.matched + result.summary.different + result.summary.unknown, result.summary.total);
});
test('summary records stable SHA-256 digest', () => {
 const digest = run(document(english(), french())).summary.digest;
 assert.match(digest, /^[a-f0-9]{64}$/u);
});
test('same input produces same digest', () => {
 const value = document(english(), french());
 assert.equal(run(value).summary.digest, run(clone(value)).summary.digest);
});
test('changed outcome changes parity evidence digest', () => {
 const value = document(english(), french());
 const modified = clone(value); modified.sessions[1].steps[2].state = 'FAIL';
 assert.notEqual(run(value).summary.digest, run(modified).summary.digest);
});
test('critical gaps include all missing French captures', () => {
 const result = criticalTaskGaps(document(english()), options);
 assert.equal(result.gaps.length, 1);
 assert.equal(result.gaps[0].fr, 'UNKNOWN');
});
test('critical gap status is UNKNOWN even if one language failed', () => {
 const value = english(); value.steps[2].state = 'FAIL';
 const result = criticalTaskGaps(document(value), options);
 assert.equal(result.gaps[0].state, 'UNKNOWN');
 assert.equal(result.gaps[0].priority, 'block');
});
test('matching PASS bilingual task yields no gap', () => {
 assert.deepEqual(criticalTaskGaps(document(english(), french()), options).gaps, []);
});
test('matching FAIL bilingual task remains a critical gap', () => {
 const en = english(), fr = french(); en.steps[2].state = 'FAIL'; fr.steps[2].state = 'FAIL';
 const result = criticalTaskGaps(document(en, fr), options);
 assert.equal(result.gaps.length, 1);
 assert.equal(result.gaps[0].priority, 'block');
});
test('critical gaps are stable across input order', () => {
 const a = criticalTaskGaps(document(english(), french()), options);
 const b = criticalTaskGaps(document(french(), english()), options);
 assert.deepEqual(a, b);
});
test('input equivalence reports keyboard success separately from switch absence', () => {
 const result = inputEquivalence(document(english()), { today: TODAY, task: 'search', language: 'en', inputs: ['keyboard', 'switch'] });
 assert.equal(result.states.keyboard, 'PASS');
 assert.equal(result.states.switch, 'UNKNOWN');
 assert.equal(result.status, 'UNKNOWN');
});
test('all requested modes are needed for equivalence PASS', () => {
 const value = document(english(), complete('switch-en', { input: 'switch' }));
 const result = inputEquivalence(value, { today: TODAY, task: 'search', language: 'en', inputs: ['keyboard', 'switch'] });
 assert.equal(result.status, 'PASS');
});
test('failing switch task defeats input equivalence', () => {
 const value = complete('switch', { input: 'switch' }); value.steps[2].state = 'FAIL';
 const result = inputEquivalence(document(english(), value), { today: TODAY, task: 'search', language: 'en', inputs: ['keyboard', 'switch'] });
 assert.equal(result.status, 'FAIL');
});
test('French equivalence cannot borrow English successes', () => {
 const result = inputEquivalence(document(english()), { today: TODAY, task: 'search', language: 'fr', inputs: ['keyboard'] });
 assert.equal(result.status, 'UNKNOWN');
});
test('online task cannot fill offline equivalence', () => {
 const result = inputEquivalence(document(english({ network: 'online' })), { today: TODAY, task: 'search', language: 'en', inputs: ['keyboard'] });
 assert.equal(result.status, 'UNKNOWN');
});
test('invalid language fails safely', () => {
 assert.equal(inputEquivalence(document(), { today: TODAY, task: 'search', language: 'es' }).ok, false);
});
test('invalid task fails safely', () => {
 assert.equal(inputEquivalence(document(), { today: TODAY, task: 'unknown', language: 'en' }).ok, false);
});
test('input equivalence lists all missing methods', () => {
 const result = inputEquivalence(document(), { today: TODAY, task: 'search', language: 'fr', inputs: ['switch', 'keyboard'] });
 assert.deepEqual(result.absent.sort(), ['keyboard', 'switch']);
});
test('mode summaries distinguish language and input', () => {
 const summaries = modeSummaries(analyze(document(english(), french()), { today: TODAY }).reviews);
 assert.equal(summaries.get('search|offline|keyboard|en').length, 1);
 assert.equal(summaries.get('search|offline|keyboard|fr').length, 1);
});
test('input scope duplicates are not counted twice', () => {
 const result = inputEquivalence(document(english()), { today: TODAY, task: 'search', language: 'en', inputs: ['keyboard', 'keyboard'] });
 assert.equal(Object.keys(result.states).length, 1);
});
