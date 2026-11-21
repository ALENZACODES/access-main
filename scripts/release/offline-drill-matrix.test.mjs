import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DRILL_SEVERITY, GATE_STATUSES, inspectCaptureState,
  evaluateDrill, gateMatrix, summarizeGates, compareDrills,
  findingSeverity,
} from './offline-drill-matrix.mjs';
import { source, control, claim, asset, capture, document, provenance } from './offline-drill-fixtures.mjs';

const run = (changes = {}) => evaluateDrill(document(capture('a', changes)));
const own = (changes = {}) => inspectCaptureState(capture('a', changes), [source()]);
const codes = (issues) => issues.map((issue) => issue.code);
const kind = (changes, expected) => assert.ok(codes(own(changes)).includes(expected), expected);

test('severity vocabulary has deterministic priority', () => {
  assert.deepEqual(DRILL_SEVERITY, ['block', 'review', 'information']);
  assert.deepEqual(GATE_STATUSES, ['PASS', 'FAIL', 'UNKNOWN']);
  assert.equal(findingSeverity('block'), 3);
  assert.equal(findingSeverity('review'), 2);
  assert.equal(findingSeverity('information'), 1);
  assert.equal(findingSeverity('other'), null);
});
test('valid synthetic environment reports only an informational UNKNOWN claim', () => {
  const result = run();
  assert.equal(result.ok, true);
  assert.equal(result.summary.blocks, 0);
  assert.equal(result.summary.reviews, 0);
  assert.equal(result.summary.information, 1);
  assert.ok(codes(result.findings).includes('CLAIM_UNKNOWN'));
  assert.equal(result.captures[0].state, 'PASS');
});
test('offline missing shell blocks the drill', () => {
  kind({ shell: 'FAIL' }, 'OFFLINE_SHELL_FAIL');
  assert.equal(run({ shell: 'FAIL' }).summary.status, 'FAIL');
});
test('offline unknown shell needs review rather than pass', () => {
  kind({ shell: 'UNKNOWN' }, 'OFFLINE_SHELL_UNKNOWN');
  assert.equal(run({ shell: 'UNKNOWN' }).summary.status, 'UNKNOWN');
});
test('online shell failure is still reported', () => {
  kind({ network: 'online', shell: 'FAIL' }, 'SHELL_FAIL');
});
test('unknown network is not interpreted as offline or online', () => {
  kind({ network: 'UNKNOWN' }, 'NETWORK_UNKNOWN');
  assert.equal(run({ network: 'UNKNOWN' }).summary.status, 'UNKNOWN');
});
test('blocked persistence produces a blocking finding', () => {
  kind({ storage: 'blocked' }, 'STORAGE_BLOCKED');
  assert.equal(run({ storage: 'blocked' }).summary.blocks, 1);
});
test('unknown persistence remains a review finding', () => {
  kind({ storage: 'UNKNOWN' }, 'STORAGE_UNKNOWN');
  assert.equal(run({ storage: 'UNKNOWN' }).summary.unknown, 1);
});
test('failed privacy boundary cannot become pass', () => {
  kind({ privacy: 'FAIL' }, 'PRIVACY_FAIL');
  assert.equal(run({ privacy: 'FAIL' }).summary.fail, 1);
});
test('unobserved privacy boundary cannot become pass', () => {
  kind({ privacy: 'UNKNOWN' }, 'PRIVACY_UNKNOWN');
  assert.equal(run({ privacy: 'UNKNOWN' }).summary.unknown, 1);
});
test('failed consent boundary is blocking', () => {
  kind({ consent: 'FAIL' }, 'CONSENT_FAIL');
});
test('unobserved consent boundary is marked for review', () => {
  kind({ consent: 'UNKNOWN' }, 'CONSENT_UNKNOWN');
});
test('keyboard failure is blocking for controls', () => {
  kind({ controls: [control('x', { keyboard: 'FAIL' })] }, 'KEYBOARD_FAIL');
});
test('keyboard UNKNOWN is never treated as a pass', () => {
  kind({ controls: [control('x', { keyboard: 'UNKNOWN' })] }, 'KEYBOARD_UNKNOWN');
  assert.equal(run({ controls: [control('x', { keyboard: 'UNKNOWN' })] }).summary.status, 'UNKNOWN');
});
test('missing focus indicator is blocking', () => {
  kind({ controls: [control('x', { focus: 'FAIL' })] }, 'FOCUS_FAIL');
});
test('unmeasured focus visibility must be reviewed', () => {
  kind({ controls: [control('x', { focus: 'UNKNOWN' })] }, 'FOCUS_UNKNOWN');
});
test('keyboard success cannot excuse invisible focus', () => {
  const result = own({ controls: [control('x', { keyboard: 'PASS', focus: 'FAIL' })] });
  assert.ok(codes(result).includes('FOCUS_KEYBOARD_CONFLICT'));
  assert.ok(codes(result).includes('FOCUS_FAIL'));
});
test('44 by 44 is accepted as minimum target', () => {
  const result = own({ controls: [control('x', { target: { width: 44, height: 44 } })] });
  assert.equal(codes(result).includes('TARGET_SMALL'), false);
});
test('either dimension below 44 triggers a target finding', () => {
  for (const target of [{ width: 43, height: 44 },
    { width: 44, height: 43 }, { width: 1, height: 100 }]) {
    kind({ controls: [control('x', { target })] }, 'TARGET_SMALL');
  }
});
test('a missing local asset is a blocking finding', () => {
  kind({ assets: [asset('offline/a.js', { available: 'NO' })] }, 'ASSET_ABSENT');
});
test('unmeasured local asset cannot count as available', () => {
  kind({ assets: [asset('offline/a.js', { available: 'UNKNOWN' })] }, 'ASSET_UNKNOWN');
});
test('offline shell asset missing adds a dependent finding', () => {
  const result = own({ assets: [asset('offline/a.js', { available: 'NO' })] });
  assert.ok(codes(result).includes('ASSET_ABSENT'));
  assert.ok(codes(result).includes('SHELL_ASSET_UNAVAILABLE'));
});
test('non-shell asset does not trigger the shell dependency rule', () => {
  const result = own({ assets: [asset('offline/a.js', { shell: false, available: 'UNKNOWN' })] });
  assert.ok(!codes(result).includes('SHELL_ASSET_UNAVAILABLE'));
});
test('UNKNOWN digest adds a review finding', () => {
  kind({ assets: [asset('offline/a.js', { sha256: null })] }, 'ASSET_DIGEST_UNKNOWN');
});
test('captured UNKNOWN remains explicitly informational', () => {
  const result = own({ claims: [claim('c', { state: 'UNKNOWN' })] });
  assert.ok(result.some((x) => x.code === 'CLAIM_UNKNOWN' && x.severity === 'information'));
});
test('YES and NO both require human assessment, never automatic promotion', () => {
  for (const state of ['YES', 'NO']) {
    const result = own({ claims: [claim('c', { state })] });
    assert.ok(result.some((x) => x.code === 'CLAIM_REVIEW' && x.severity === 'review'));
  }
});
test('source retrieved after capture produces a review signal', () => {
  const later = source('source-a', { provenance: provenance({ retrievedOn: '2026-11-20' }) });
  const result = inspectCaptureState(capture(), [later]);
  assert.ok(codes(result).includes('SOURCE_AFTER_CAPTURE'));
});
test('source types with connectivity context require manual review offline', () => {
  const newer = source('source-a', { provenance: provenance({ tier: 4 }) });
  const result = inspectCaptureState(capture(), [newer]);
  assert.ok(codes(result).includes('NETWORK_SOURCE_CONTEXT'));
});
test('source connectivity context is not signaled for online capture', () => {
  const newer = source('source-a', { provenance: provenance({ tier: 4 }) });
  const result = inspectCaptureState(capture('a', { network: 'online' }), [newer]);
  assert.ok(!codes(result).includes('NETWORK_SOURCE_CONTEXT'));
});
test('missing source is visible to an inspection function', () => {
  const result = inspectCaptureState(capture(), []);
  assert.ok(codes(result).includes('SOURCE_NOT_FOUND'));
});
test('input validation failures return no apparently clean summary', () => {
  const input = document();
  input.captures[0].claims[0].state = true;
  const result = evaluateDrill(input);
  assert.equal(result.ok, false);
  assert.equal(result.summary, null);
  assert.deepEqual(result.captures, []);
});
test('findings are ordered by severity then capture and path', () => {
  const result = run({ shell: 'FAIL', storage: 'UNKNOWN', privacy: 'FAIL',
    controls: [control('x', { keyboard: 'FAIL' })] });
  const weights = { block: 3, review: 2, information: 1 };
  const values = result.findings.map((x) => weights[x.severity]);
  assert.deepEqual(values, [...values].sort((a, b) => b - a));
});
test('evaluation keeps captures sorted independently of input order', () => {
  const result = evaluateDrill(document(capture('z'), capture('a')));
  assert.deepEqual(result.captures.map((x) => x.id), ['a', 'z']);
});
test('summary counts PASS, FAIL and UNKNOWN captures separately', () => {
  const input = document(
    capture('pass'),
    capture('fail', { shell: 'FAIL' }),
    capture('unknown', { storage: 'UNKNOWN' }),
  );
  const result = evaluateDrill(input);
  assert.deepEqual([result.summary.pass, result.summary.fail, result.summary.unknown], [1, 1, 1]);
  assert.equal(result.summary.status, 'FAIL');
});
test('gate matrix contains each required audit category', () => {
  const input = document();
  const result = evaluateDrill(input);
  const rows = gateMatrix(result, input);
  assert.equal(rows.length, 1);
  for (const key of ['SOURCE_METADATA', 'UNKNOWN_PRESERVED', 'LOCAL_ASSET',
    'OFFLINE_SHELL', 'KEYBOARD_REACHABLE', 'FOCUS_VISIBLE', 'TARGET_SIZE',
    'LANGUAGE_COPY', 'PRIVACY_LIMIT', 'CONSENT_BOUNDARY',
    'NETWORK_DISCLOSURE', 'STORAGE_DISCLOSURE']) assert.ok(key in rows[0].checks);
});
test('matrix exposes a small control and does not hide it in averages', () => {
  const input = document(capture('a', { controls: [control('x', { target: { width: 20, height: 20 } })] }));
  const rows = gateMatrix(evaluateDrill(input), input);
  assert.equal(rows[0].checks.TARGET_SIZE, 'FAIL');
});
test('matrix exposes UNKNOWN keyboard without creating a PASS', () => {
  const input = document(capture('a', { controls: [control('x', { keyboard: 'UNKNOWN' })] }));
  const rows = gateMatrix(evaluateDrill(input), input);
  assert.equal(rows[0].checks.KEYBOARD_REACHABLE, 'UNKNOWN');
});
test('matrix exposes unknown networking as UNKNOWN', () => {
  const input = document(capture('a', { network: 'UNKNOWN' }));
  const rows = gateMatrix(evaluateDrill(input), input);
  assert.equal(rows[0].checks.NETWORK_DISCLOSURE, 'UNKNOWN');
});
test('matrix exposes blocked storage as FAIL', () => {
  const input = document(capture('a', { storage: 'blocked' }));
  const rows = gateMatrix(evaluateDrill(input), input);
  assert.equal(rows[0].checks.STORAGE_DISCLOSURE, 'FAIL');
});
test('gate matrix refuses invalid evaluation results', () => {
  assert.equal(gateMatrix({ ok: false }, document()), null);
  assert.equal(gateMatrix(null, document()), null);
});
test('gate summary preserves count totals for each gate', () => {
  const input = document(capture('a'), capture('b', { shell: 'FAIL' }));
  const gates = summarizeGates(gateMatrix(evaluateDrill(input), input));
  assert.ok(gates.every((g) => g.pass + g.fail + g.unknown === 2));
  assert.equal(gates.find((g) => g.rule === 'OFFLINE_SHELL').status, 'FAIL');
});
test('empty gate matrix does not invent failures', () => {
  const result = summarizeGates([]);
  assert.ok(result.every((g) => g.pass === 0 && g.fail === 0 && g.unknown === 0));
});
test('earlier and later identical drills have no changes', () => {
  const input = document();
  const result = compareDrills(input, JSON.parse(JSON.stringify(input)));
  assert.equal(result.ok, true);
  assert.deepEqual(result.changes, []);
});
test('adding one capture is shown as an addition', () => {
  const result = compareDrills(document(capture('a')), document(capture('a'), capture('b')));
  assert.deepEqual(result.changes.map((x) => x.kind), ['added']);
  assert.equal(result.summary.added, 1);
});
test('removing one capture does not hide the deletion', () => {
  const result = compareDrills(document(capture('a'), capture('b')), document(capture('a')));
  assert.deepEqual(result.changes.map((x) => x.kind), ['removed']);
  assert.equal(result.summary.removed, 1);
});
test('state change from PASS to FAIL is explicit', () => {
  const result = compareDrills(document(capture('a')), document(capture('a', { shell: 'FAIL' })));
  assert.deepEqual(result.changes.map((x) => x.kind), ['state-changed']);
  assert.equal(result.changes[0].before, 'PASS');
  assert.equal(result.changes[0].after, 'FAIL');
});
test('state change from PASS to UNKNOWN is not mislabelled as PASS', () => {
  const result = compareDrills(document(capture('a')), document(capture('a', { shell: 'UNKNOWN' })));
  assert.equal(result.changes[0].after, 'UNKNOWN');
});
test('changed finding count with same status remains observable', () => {
  const original = document(capture('a', { shell: 'FAIL' }));
  const changed = document(capture('a', { shell: 'FAIL', storage: 'blocked' }));
  const result = compareDrills(original, changed);
  assert.equal(result.changes[0].kind, 'findings-changed');
});
test('invalid earlier input produces no comparison changes', () => {
  const older = document();
  older.captures[0].controls[0].keyboard = true;
  const result = compareDrills(older, document());
  assert.equal(result.ok, false);
  assert.deepEqual(result.changes, []);
  assert.ok(result.problems.some((p) => p.run === 'earlier'));
});
test('invalid later input is also a comparison failure', () => {
  const later = document();
  later.sources[0].provenance.licence = null;
  const result = compareDrills(document(), later);
  assert.equal(result.ok, false);
  assert.ok(result.problems.some((p) => p.run === 'later'));
});
test('comparison order is independent of capture insertion order', () => {
  const earlier = document(capture('a'), capture('b'));
  const later = document(capture('b', { shell: 'FAIL' }), capture('a', { storage: 'UNKNOWN' }));
  const reverse = document(capture('a', { storage: 'UNKNOWN' }), capture('b', { shell: 'FAIL' }));
  assert.deepEqual(compareDrills(earlier, later), compareDrills(earlier, reverse));
});
test('metadata is included in the informational claim finding', () => {
  const result = run({ claims: [claim('x', { state: 'UNKNOWN' })] });
  const info = result.findings.find((x) => x.code === 'CLAIM_UNKNOWN');
  assert.equal(info.source.licence, 'CC0-1.0');
  assert.equal(info.source.tier, 0);
});
test('no result asserts external support or current field conditions', () => {
  const result = run();
  assert.equal(result.summary.status, 'PASS');
  assert.equal(result.findings[0].detail.includes('UNKNOWN'), true);
});
