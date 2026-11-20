import assert from 'node:assert/strict';
import test from 'node:test';
import { Buffer } from 'node:buffer';
import {
 VERSION, STATES, LANGUAGES, NETWORKS, INPUTS, TASKS, STEPS, LIMITS,
 safeObject, boundedText, safeId, safeDate, safeUrl, frenchSpacing,
 problem, privateKeys, sha256, canonical, fingerprint, provenanceIssues,
 stepIssues, sessionIssues, validate, parse, serialize,
} from './input-continuity-contract.mjs';
import { TODAY, provenance, step, session, document, pair, complete, interrupted, clone } from './input-continuity-fixtures.mjs';

const inspect = value => validate(value, { today: TODAY });
const codes = value => inspect(value).issues.map(x => x.code);
const bad = (field, value) => document(session('case-one', { [field]: value }));
const badStep = (field, value) => document(session('case-one', { steps: [step('start', { [field]: value })] }));
const badProvenance = (field, value) => document(session('case-one', { provenance: provenance({ [field]: value }) }));

test('the schema is explicitly versioned and bounded', () => {
 assert.equal(VERSION, 1);
 assert.equal(LIMITS.sessions, 160);
 assert.equal(LIMITS.steps, 200);
 assert.ok(LIMITS.bytes < 50_000_000);
 assert.ok(LIMITS.issues < 5000);
});
test('state vocabulary preserves missing evidence', () => {
 assert.deepEqual(STATES, ['PASS', 'FAIL', 'UNKNOWN']);
 assert.ok(!STATES.includes('YES'));
 assert.ok(!STATES.includes('available'));
});
test('English and French are the only report languages', () => {
 assert.deepEqual(LANGUAGES, ['en', 'fr']);
 assert.ok(!LANGUAGES.includes('unknown'));
});
test('network vocabulary includes disconnected and limited conditions', () => {
 assert.ok(NETWORKS.includes('offline'));
 assert.ok(NETWORKS.includes('limited'));
 assert.ok(NETWORKS.includes('UNKNOWN'));
});
test('all input modes have distinct stable values', () => {
 assert.equal(new Set(INPUTS).size, INPUTS.length);
 for (const mode of ['keyboard', 'switch', 'voice', 'touch', 'screen-reader']) assert.ok(INPUTS.includes(mode));
});
test('task vocabulary covers unfinished and resumed work', () => {
 assert.ok(TASKS.includes('resume-task'));
 assert.ok(TASKS.includes('plan-journey'));
 assert.ok(TASKS.includes('save-offline'));
});
test('step vocabulary requires interruption and restoration to differ', () => {
 assert.ok(STEPS.includes('interrupt'));
 assert.ok(STEPS.includes('restore'));
 assert.notEqual(STEPS.indexOf('interrupt'), STEPS.indexOf('restore'));
});
test('plain-object guard excludes null, arrays and dates', () => {
 assert.equal(safeObject({}), true);
 assert.equal(safeObject(Object.create(null)), true);
 for (const value of [null, [], new Date(), 'x', 0, true]) assert.equal(safeObject(value), false);
});
test('text guard accepts bilingual printable content', () => {
 assert.equal(boundedText('Navigation'), true);
 assert.equal(boundedText('Enregistrer la séance'), true);
 assert.equal(boundedText('À pied'), true);
});
test('text guard rejects blank and too-long values', () => {
 for (const value of ['', ' ', '\t', 'a'.repeat(LIMITS.notes + 1), 45, null]) assert.equal(boundedText(value), false);
});
test('text guard rejects all ASCII control characters', () => {
 for (const n of [0, 1, 7, 9, 10, 13, 30, 31, 127]) assert.equal(boundedText(`note${String.fromCharCode(n)}`), false);
});
test('text guard rejects Unicode replacement symbol', () => {
 assert.equal(boundedText('unreadable\uFFFD'), false);
});
test('safe ID accepts meaningful ASCII identifiers', () => {
 for (const value of ['abc', 'a-1', 'a.b', 'step_one', 'a'.repeat(80)]) assert.equal(safeId(value), true);
});
test('safe ID rejects path traversal and problematic names', () => {
 for (const value of ['../x', '/root', '__proto__', 'constructor', 'prototype', '', '.hidden', 'A', 'a b', 'a/b', 'a\\b', 'a'.repeat(81), null]) assert.equal(safeId(value), false);
});
test('date validation handles leap years precisely', () => {
 for (const value of ['2000-02-29', '2024-02-29', '2026-11-20']) assert.equal(safeDate(value), true);
 for (const value of ['1900-02-29', '2025-02-29', '2026-11-31', '2026-13-01']) assert.equal(safeDate(value), false);
});
test('date validation disallows timestamps and informal dates', () => {
 for (const value of ['2026-11-20T10:00:00Z', 'Nov 20', '2026-1-2', '0000-01-01', 'tomorrow']) assert.equal(safeDate(value), false);
});
test('only HTTPS source URLs are admitted', () => {
 assert.equal(safeUrl('https://example.org/public-notes'), true);
 for (const value of ['http://example.org', 'file:///tmp/test', 'javascript:alert(1)', 'ftp://example.org']) assert.equal(safeUrl(value), false);
});
test('URL parser refuses credentials and anchors', () => {
 for (const value of ['https://u:p@example.org/path', 'https://example.org/#fragment', 'https://localhost/a', 'https://127.0.0.1/path']) assert.equal(safeUrl(value), false);
});
test('French uses a no-break space before the colon', () => {
 assert.equal(frenchSpacing('Source\u00a0: document'), true);
 assert.equal(frenchSpacing('Source : document'), false);
});
test('French punctuation rejects ordinary preceding spaces', () => {
 for (const value of ['Pourquoi ?', 'Oui !', 'Un ; deux']) assert.equal(frenchSpacing(value), false);
 assert.equal(frenchSpacing('Pourquoi\u202f? Oui\u202f!'), true);
});
test('French terminal punctuation requires a preceding narrow space', () => {
 assert.equal(frenchSpacing('Pourquoi?'), false);
 assert.equal(frenchSpacing('Pourquoi\u202f?'), true);
});
test('French guillemets use narrow spaces', () => {
 assert.equal(frenchSpacing('«\u202fétape\u202f»'), true);
 assert.equal(frenchSpacing('«étape»'), false);
});
test('French elision disallows straight apostrophe', () => {
 assert.equal(frenchSpacing('l’application'), true);
 assert.equal(frenchSpacing("l'application"), false);
});
test('problem records do not disclose input values', () => {
 assert.deepEqual(problem('TEST', '/field'), { code: 'TEST', path: '/field' });
});
test('private-key detection flags tokens and coordinates', () => {
 const findings = privateKeys({ accessToken: 'sensitive', contact: { latitude: 12, longitude: 34 } });
 assert.equal(findings.filter(x => x.code === 'PRIVATE_KEY').length, 3);
});
test('private-key detection examines arrays', () => {
 assert.ok(privateKeys({ sessions: [{ apiKey: 'private' }] }).some(x => x.path.includes('apiKey')));
});
test('private-key detection rejects cyclic objects', () => {
 const value = {}; value.self = value;
 assert.ok(privateKeys(value).some(x => x.code === 'UNSAFE_STRUCTURE'));
});
test('hash is deterministic 64-digit hexadecimal', () => {
 assert.match(sha256('same'), /^[a-f0-9]{64}$/u);
 assert.equal(sha256('same'), sha256('same'));
 assert.notEqual(sha256('same'), sha256('changed'));
});
test('canonical ordering is independent of object insertion', () => {
 assert.deepEqual(canonical({ b: 2, a: 1 }), { a: 1, b: 2 });
 assert.equal(fingerprint({ a: 1, b: 2 }), fingerprint({ b: 2, a: 1 }));
});
test('snapshot hash changes when observed outcomes change', () => {
 const old = document(); const next = clone(old); next.sessions[0].outcome = 'FAIL';
 assert.notEqual(fingerprint(old), fingerprint(next));
});
test('document fixture is valid with UNKNOWN outcome', () => {
 assert.equal(inspect(document()).ok, true);
 assert.equal(document().sessions[0].outcome, 'UNKNOWN');
});
test('English/French fixture validates', () => {
 assert.equal(inspect(pair()).ok, true);
});
test('complete and interrupted fixtures validate', () => {
 assert.equal(inspect(document(complete(), interrupted())).ok, true);
});
test('empty session collection is valid but contains no claims', () => {
 assert.deepEqual(inspect({ version: 1, sessions: [] }), { ok: true, issues: [] });
});
test('invalid root types fail safely', () => {
 for (const value of [null, 'text', 3, [], false]) assert.ok(codes(value).includes('DOCUMENT_OBJECT'));
});
test('unknown schema version is rejected', () => {
 assert.ok(codes({ version: 2, sessions: [] }).includes('VERSION'));
});
test('session IDs must be unique', () => {
 assert.ok(codes(document(session('duplicate'), session('duplicate'))).includes('DUPLICATE_SESSION'));
});
test('step IDs must be unique within a session', () => {
 const list = [step('same'), step('same', { kind: 'navigate', order: 2 })];
 assert.ok(codes(document(session('case-one', { steps: list }))).includes('DUPLICATE_STEP'));
});
test('step orders must ascend strictly', () => {
 const list = [step('later', { order: 2 }), step('earlier', { order: 1 })];
 assert.ok(codes(document(session('case-one', { steps: list }))).includes('ORDER_SEQUENCE'));
});
test('steps cannot share ordinal positions', () => {
 const list = [step('a'), step('b', { kind: 'activate' })];
 assert.ok(codes(document(session('case-one', { steps: list }))).includes('ORDER_SEQUENCE'));
});
test('step state must be explicit', () => {
 assert.ok(codes(badStep('state', 'YES')).includes('STEP_STATE'));
});
test('step category must be from the registry', () => {
 assert.ok(codes(badStep('kind', 'unknown-kind')).includes('STEP_KIND'));
});
test('step order must be a bounded positive integer', () => {
 for (const value of [0, -1, 2.5, 1000, '2']) assert.ok(codes(badStep('order', value)).includes('ORDER'));
});
test('step target must be a safe identifier', () => {
 assert.ok(codes(badStep('target', '../secret')).includes('TARGET'));
});
test('step note must be bounded and printable', () => {
 assert.ok(codes(badStep('observation', 'x'.repeat(600))).includes('OBSERVATION'));
});
test('step widths reject negative and nonfinite values', () => {
 for (const value of [-3, Infinity, '44', 30000]) assert.ok(codes(badStep('width', value)).includes('WIDTH'));
});
test('step heights reject malformed values', () => {
 for (const value of [-10, 'small', null]) assert.ok(codes(badStep('height', value)).includes('HEIGHT'));
});
test('explicit UNKNOWN dimensions validate as missing evidence', () => {
 assert.equal(inspect(badStep('width', 'UNKNOWN')).ok, true);
});
test('invalid session language fails', () => {
 assert.ok(codes(bad('language', 'es')).includes('LANGUAGE'));
});
test('invalid input method fails', () => {
 assert.ok(codes(bad('input', 'telepathy')).includes('INPUT'));
});
test('invalid journey category fails', () => {
 assert.ok(codes(bad('task', 'unlisted')).includes('TASK'));
});
test('invalid network mode fails', () => {
 assert.ok(codes(bad('network', 'wifi-5g')).includes('NETWORK'));
});
test('invalid outcome must not silently become UNKNOWN', () => {
 assert.ok(codes(bad('outcome', 'YES')).includes('OUTCOME'));
});
test('invalid French typography is rejected in labels', () => {
 assert.ok(codes(document(session('fr', { language: 'fr', label: 'Attention !' }))).includes('LABEL'));
});
test('curly-apostrophe French labels are permitted', () => {
 assert.equal(inspect(document(session('fr', { language: 'fr', label: 'L’application' }))).ok, true);
});
test('unlicensed source is not accepted', () => {
 assert.ok(codes(badProvenance('licence', 'closed')).includes('LICENCE'));
});
test('future retrieval date is rejected', () => {
 assert.ok(codes(badProvenance('retrievedOn', '2026-11-21')).includes('RETRIEVAL_DATE'));
});
test('invalid source review tier is rejected', () => {
 assert.ok(codes(badProvenance('tier', 5)).includes('TIER'));
});
test('unknown review tier can be recorded explicitly', () => {
 assert.equal(inspect(badProvenance('tier', 'UNKNOWN')).ok, true);
});
test('missing source cannot become trusted evidence', () => {
 assert.ok(codes(badProvenance('source', undefined)).includes('SOURCE'));
});
test('missing provenance is rejected', () => {
 assert.ok(codes(bad('provenance', null)).includes('PROVENANCE_REQUIRED'));
});
test('provenance checker does not mutate supplied value', () => {
 const p = provenance(); const before = clone(p); const issues = [];
 provenanceIssues(p, '/provenance', issues, TODAY);
 assert.deepEqual(p, before); assert.deepEqual(issues, []);
});
test('standalone step validator detects malformed records', () => {
 const issues = []; stepIssues(null, '/step', issues);
 assert.deepEqual(issues, [{ code: 'STEP_OBJECT', path: '/step' }]);
});
test('standalone session validator detects malformed records', () => {
 const issues = []; sessionIssues(null, '/session', issues, TODAY);
 assert.deepEqual(issues, [{ code: 'SESSION_OBJECT', path: '/session' }]);
});
test('session limit rejects oversized lists before deep validation', () => {
 assert.ok(codes({ version: 1, sessions: Array(LIMITS.sessions + 1).fill(null) }).includes('SESSIONS'));
});
test('step limit rejects excessive recorded actions', () => {
 assert.ok(codes(document(session('case-one', { steps: Array(LIMITS.steps + 1).fill(null) }))).includes('STEPS'));
});
test('byte limit rejects oversized input without leakage', () => {
 const value = document(session('case-one', { hugeExtra: 'x'.repeat(LIMITS.bytes + 1) }));
 assert.ok(codes(value).includes('BYTE_LIMIT'));
});
test('parser rejects malformed JSON', () => {
 const result = parse('{', { today: TODAY });
 assert.equal(result.ok, false); assert.equal(result.value, null);
});
test('parser refuses non-string input', () => {
 assert.equal(parse(null).ok, false);
});
test('parser enforces raw byte ceiling', () => {
 assert.equal(parse('x'.repeat(LIMITS.bytes + 1)).issues[0].code, 'BYTE_LIMIT');
});
test('parser admits safe JSON preserving UNKNOWN', () => {
 const result = parse(JSON.stringify(document()), { today: TODAY });
 assert.equal(result.ok, true); assert.equal(result.value.sessions[0].outcome, 'UNKNOWN');
});
test('serializer returns canonical JSON with newline', () => {
 const result = serialize(pair(), { today: TODAY });
 assert.equal(result.ok, true); assert.ok(result.text.endsWith('\n'));
 assert.deepEqual(JSON.parse(result.text), canonical(pair()));
});
test('serializer refuses private values', () => {
 const result = serialize(document(session('case-one', { accessToken: 'secret' })), { today: TODAY });
 assert.equal(result.ok, false); assert.equal(result.text, null);
});
test('serialized byte length is below documented input ceiling', () => {
 assert.ok(Buffer.byteLength(serialize(document(), { today: TODAY }).text) < LIMITS.bytes);
});
