import assert from 'node:assert/strict';
import test from 'node:test';
import { CHANGE_KINDS, sessionChanges, compare } from './input-continuity-delta.mjs';
import { analyze } from './input-continuity-analysis.mjs';
import { TODAY, provenance, session, document, complete, interrupted, clone } from './input-continuity-fixtures.mjs';
const options = { today: TODAY };
const diff = (before, after) => compare(before, after, options);
const kinds = result => result.changes.map(x => x.kind);

test('change kinds are stable and nonduplicated', () => {
 assert.equal(new Set(CHANGE_KINDS).size, CHANGE_KINDS.length);
 assert.ok(CHANGE_KINDS.includes('coverage-lost'));
 assert.ok(CHANGE_KINDS.includes('source'));
});
test('identical inputs yield no changes', () => {
 const value = document(complete());
 const result = diff(value, clone(value));
 assert.equal(result.ok, true);
 assert.deepEqual(result.changes, []);
 assert.equal(result.summary.total, 0);
});
test('changed object key ordering is not a release difference', () => {
 const value = document(complete());
 const reordered = { sessions: value.sessions, version: 1 };
 assert.deepEqual(diff(value, reordered).changes, []);
});
test('added session is visible without inventing older evidence', () => {
 const result = diff(document(complete('a')), document(complete('a'), complete('b')));
 assert.ok(kinds(result).includes('session-added'));
 assert.ok(!kinds(result).includes('session-removed'));
});
test('removed session is blocking', () => {
 const result = diff(document(complete('a'), complete('b')), document(complete('a')));
 assert.ok(result.changes.some(x => x.kind === 'session-removed' && x.priority === 'block'));
});
test('PASS to UNKNOWN regression is blocking', () => {
 const old = document(complete('a'));
 const next = document(session('a'));
 assert.ok(resultHas(diff(old, next), 'status', 'block'));
});
function resultHas(result, kind, priority) { return result.changes.some(x => x.kind === kind && x.priority === priority); }
test('UNKNOWN to PASS requires review instead of automatic endorsement', () => {
 const result = diff(document(session('a')), document(complete('a')));
 assert.ok(resultHas(result, 'status', 'review'));
});
test('PASS to FAIL is blocking', () => {
 const before = document(complete('a'));
 const after = clone(before);
 after.sessions[0].steps[2].state = 'FAIL';
 assert.ok(resultHas(diff(before, after), 'status', 'block'));
});
test('recorded outcome changes are reported distinctly', () => {
 const before = document(complete('a'));
 const after = clone(before);
 after.sessions[0].outcome = 'UNKNOWN';
 assert.ok(kinds(diff(before, after)).includes('recorded-outcome'));
});
test('changed captured action IDs changes event digest', () => {
 const before = document(complete('a'));
 const after = clone(before);
 after.sessions[0].steps[1].id = 'updated';
 assert.ok(kinds(diff(before, after)).includes('trace-bytes'));
});
test('changed event observation remains detectable with same final status', () => {
 const before = document(complete('a'));
 const after = clone(before);
 after.sessions[0].steps[1].observation = 'Different recorded note';
 assert.ok(kinds(diff(before, after)).includes('trace-bytes'));
 assert.equal(after.sessions[0].outcome, 'PASS');
});
test('changed width is visible as an event-byte difference', () => {
 const before = document(complete('touch', { input: 'touch' }));
 const after = clone(before);
 after.sessions[0].steps[2].width = 43;
 assert.ok(kinds(diff(before, after)).includes('trace-bytes'));
});
test('changed step result creates rule-level review', () => {
 const before = document(complete('a'));
 const after = clone(before);
 after.sessions[0].steps[1].state = 'UNKNOWN';
 assert.ok(kinds(diff(before, after)).includes('rule'));
});
test('changing source URL creates provenance review', () => {
 const before = document(complete('a'));
 const after = clone(before);
 after.sessions[0].provenance.source = 'https://example.net/second';
 assert.ok(kinds(diff(before, after)).includes('source'));
});
test('changing open licence is not silently accepted', () => {
 const before = document(complete('a'));
 const after = clone(before);
 after.sessions[0].provenance.licence = 'MIT';
 assert.ok(kinds(diff(before, after)).includes('licence'));
});
test('changing retrieval date creates a separate review change', () => {
 const before = document(complete('a'));
 const after = clone(before);
 after.sessions[0].provenance.retrievedOn = '2026-11-19';
 assert.ok(kinds(diff(before, after)).includes('retrieval-date'));
});
test('changing tier does not automatically improve the outcome', () => {
 const before = document(complete('a'));
 const after = clone(before);
 after.sessions[0].provenance.tier = 1;
 assert.ok(kinds(diff(before, after)).includes('tier'));
 assert.equal(diff(before, after).summary.blocking, 0);
});
test('changing a task name changes evidence coverage', () => {
 const before = document(complete('a'));
 const after = clone(before);
 after.sessions[0].task = 'save-offline';
 const result = diff(before, after);
 assert.ok(kinds(result).includes('coverage-lost'));
 assert.ok(kinds(result).includes('coverage-added'));
});
test('changing language changes evidence coverage', () => {
 const before = document(complete('a'));
 const after = clone(before);
 after.sessions[0].language = 'fr';
 after.sessions[0].label = 'Parcours synthétique';
 assert.ok(kinds(diff(before, after)).includes('coverage-lost'));
});
test('changing input method changes coverage', () => {
 const before = document(complete('a'));
 const after = clone(before);
 after.sessions[0].input = 'switch';
 assert.ok(kinds(diff(before, after)).includes('coverage-added'));
});
test('changing network from offline to limited loses offline evidence', () => {
 const before = document(complete('a'));
 const after = clone(before);
 after.sessions[0].network = 'limited';
 assert.ok(kinds(diff(before, after)).includes('coverage-lost'));
});
test('keeping identical coverage does not create a phantom loss', () => {
 const before = document(complete('a'));
 const after = document(complete('b'));
 assert.ok(!kinds(diff(before, after)).includes('coverage-lost'));
});
test('comparison of invalid before source is fail closed', () => {
 const old = document(session('a', { provenance: null }));
 const result = diff(old, document());
 assert.equal(result.ok, false);
 assert.deepEqual(result.changes, []);
 assert.ok(result.issues.every(x => x.side === 'before'));
});
test('comparison of invalid after source is fail closed', () => {
 const next = document(session('a', { outcome: 'YES' }));
 const result = diff(document(), next);
 assert.equal(result.ok, false);
 assert.ok(result.issues.every(x => x.side === 'after'));
});
test('comparison reports errors from both invalid sources', () => {
 const old = document(session('a', { outcome: 'YES' }));
 const next = document(session('b', { outcome: 'NO' }));
 const result = diff(old, next);
 assert.ok(new Set(result.issues.map(x => x.side)).has('before'));
 assert.ok(new Set(result.issues.map(x => x.side)).has('after'));
});
test('session change helper does not mutate input results', () => {
 const before = analyze(document(complete('a')), options);
 const after = analyze(document(interrupted('a')), options);
 const snapshot = clone([before, after]);
 sessionChanges(before, after);
 assert.deepEqual([before, after], snapshot);
});
test('repeated comparison is deterministic', () => {
 const before = document(session('a'));
 const after = document(complete('a'));
 assert.deepEqual(diff(before, after), diff(before, after));
});
test('comparison summary counts match emitted changes', () => {
 const result = diff(document(session('a')), document(complete('a')));
 assert.equal(result.summary.total, result.changes.length);
 assert.equal(result.summary.blocking + result.summary.review, result.changes.length);
});
test('diff digest uses SHA-256 and is stable', () => {
 const a = diff(document(session('a')), document(complete('a'))).summary.digest;
 const b = diff(document(session('a')), document(complete('a'))).summary.digest;
 assert.match(a, /^[a-f0-9]{64}$/u);
 assert.equal(a, b);
});
test('changed captured content updates after fingerprint', () => {
 const before = document(complete('a'));
 const after = clone(before);
 after.sessions[0].steps[2].state = 'UNKNOWN';
 const result = diff(before, after);
 assert.notEqual(result.summary.before, result.summary.after);
});
test('two independent sessions produce individually attributable changes', () => {
 const before = document(complete('a'), complete('b'));
 const after = clone(before);
 after.sessions[1].steps[2].state = 'FAIL';
 assert.ok(diff(before, after).changes.some(x => x.id.startsWith('b')));
});
test('outcome changes are not omitted when the trace itself is unchanged', () => {
 const before = document(complete('a'));
 const after = clone(before);
 after.sessions[0].outcome = 'FAIL';
 const result = diff(before, after);
 assert.ok(kinds(result).includes('recorded-outcome'));
 assert.ok(!kinds(result).includes('trace-bytes'));
});
test('newly missing French coverage remains UNKNOWN', () => {
 const before = document(complete('en'), complete('fr', { language: 'fr', label: 'Parcours synthétique' }));
 const after = document(complete('en'));
 assert.ok(diff(before, after).changes.some(x => x.kind === 'coverage-lost' && x.id.startsWith('fr|')));
});
test('merely changing a public provenance source does not convert UNKNOWN to PASS', () => {
 const before = document(session('a'));
 const after = clone(before);
 after.sessions[0].provenance = provenance({ source: 'https://example.org/updated' });
 assert.equal(analyze(after, options).reviews[0].status, 'UNKNOWN');
});
test('every emitted kind belongs to declared vocabulary', () => {
 const before = document(session('a'));
 const after = document(complete('a'));
 assert.ok(diff(before, after).changes.every(x => CHANGE_KINDS.includes(x.kind)));
});
