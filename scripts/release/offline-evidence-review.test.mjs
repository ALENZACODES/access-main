import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parse, day, validateRecord, publicExample, MAX_BYTES } from './offline-evidence-review-contract.mjs';
import { compare, summary, filter, groupByPlace, risks } from './offline-evidence-review-analysis.mjs';
import { render, escapeHtml } from './offline-evidence-review-report.mjs';
import { run, safeRead, safeWrite, parseArgs } from './offline-evidence-review-cli.mjs';
const TODAY = '2026-11-20';
const base = () => structuredClone(publicExample());
const record = (changes = {}) => ({ ...base().records[0], ...changes });
const inventory = (...records) => ({ schemaVersion: 1, records });
const codes = result => result.issues.map(x => x.code);
function output() { const printed = { out: '', err: '' }; return { printed, streams: { stdout: { write: s => { printed.out += s; } }, stderr: { write: s => { printed.err += s; } } } }; }
test('known dates validate precisely including leap years', () => {
  for (const d of ['2024-02-29', '2026-11-20', '2000-02-29']) assert.equal(day(d), true);
  for (const d of ['2026-02-29', '2026-13-01', '2026-11-31', '', null, '2026-1-1', '0000-00-00']) assert.equal(day(d), false);
});
test('example is entirely fictional, sourced and unknown', () => {
  const x = base(); assert.equal(parse(JSON.stringify(x), { today: TODAY }).ok, true);
  assert.equal(x.records[0].status, 'unknown'); assert.equal(x.records[0].verificationTier, 'unknown');
  assert.match(x.records[0].source, /Example only/);
});
test('unknown is not upgraded by tier or description', () => {
  const x = record({ verificationTier: 'field-observed', note: 'accessible', status: 'unknown' });
  assert.equal(parse(JSON.stringify(inventory(x)), { today: TODAY }).value.records[0].status, 'unknown');
});
test('all mandatory provenance fields fail closed', () => {
  for (const name of ['source', 'licence', 'retrievedOn', 'verificationTier']) {
    const x = record(); delete x[name];
    assert.equal(parse(JSON.stringify(inventory(x)), { today: TODAY }).ok, false, name);
  }
});
test('future retrieval dates rejected', () => {
  assert.ok(codes(parse(JSON.stringify(inventory(record({ retrievedOn: '2026-11-21' }))), { today: TODAY })).includes('INVALID_RETRIEVAL_DATE'));
});
test('invalid enum values rejected', () => {
  for (const [name, value] of [['type', 'automatic'], ['status', 'yes'], ['verificationTier', 'verified']]) {
    assert.equal(parse(JSON.stringify(inventory(record({ [name]: value }))), { today: TODAY }).ok, false);
  }
});
test('unknown properties are rejected', () => {
  assert.ok(codes(parse(JSON.stringify({ schemaVersion: 1, records: [], secret: 1 }), { today: TODAY })).includes('UNRECOGNISED_FIELD'));
  assert.ok(codes(parse(JSON.stringify(inventory(record({ extra: 'foo' }))), { today: TODAY })).includes('UNRECOGNISED_FIELD'));
});
test('duplicate ids rejected', () => {
  assert.ok(codes(parse(JSON.stringify(inventory(record(), record())), { today: TODAY })).includes('DUPLICATE_ID'));
});
test('missing or invalid schema rejected', () => {
  for (const x of ['bad', '[]', '{}', '{"schemaVersion":2,"records":[]}', '{"schemaVersion":1,"records":{}}']) {
    assert.equal(parse(x, { today: TODAY }).ok, false, x);
  }
});
test('oversize input and invalid local date rejected', () => {
  assert.ok(codes(parse('x'.repeat(MAX_BYTES + 1))).includes('INPUT_TOO_LARGE'));
  assert.ok(codes(parse('{}', { today: 'yesterday' })).includes('INVALID_TODAY'));
});
test('malformed records are rejected not coerced', () => {
  for (const x of [null, 42, [], 'str', record({ id: '../a' }), record({ placeId: '' }), record({ label: '' }), record({ note: '' })]) {
    assert.equal(validateRecord(x, 0, TODAY).issues.length > 0, true);
  }
});
test('diff sorts records and preserves every change', () => {
  const before = inventory(record({ id: 'z' }), record({ id: 'b', status: 'reported' }));
  const after = inventory(record({ id: 'b', status: 'unknown' }), record({ id: 'a' }));
  const x = compare(before, after);
  assert.deepEqual(x.changes.map(y => [y.id, y.kind]), [['a', 'added'], ['b', 'changed'], ['z', 'removed']]);
  assert.deepEqual(x.changes[1].fields, ['status']);
  assert.equal(x.counts.unknown, 2);
});
test('unchanged records are included in diff', () => {
  assert.equal(compare(inventory(record()), inventory(record())).counts.unchanged, 1);
});
test('summary treats every reported state distinctly', () => {
  const x = summary(inventory(record(), record({ id: 'b', status: 'reported', retrievedOn: '2024-01-01' }), record({ id: 'c', status: 'not-reported' })));
  assert.deepEqual([x.total, x.unknown, x.reported, x['not-reported']], [3, 1, 1, 1]);
  assert.equal(x.oldestRetrievedOn, '2024-01-01');
});
test('empty inventory is legitimate and accurately described', () => {
  assert.equal(summary(inventory()).oldestRetrievedOn, null);
  assert.equal(render(inventory(), { language: 'fr' }).ok, true);
});
test('place filtering and grouping remain stable', () => {
  const rows = [record({ id: 'c', placeId: 'p2' }), record({ id: 'b', placeId: 'p1' }), record({ id: 'a', placeId: 'p1', status: 'reported' })];
  assert.deepEqual(groupByPlace(rows).map(x => [x.placeId, x.rows.map(r => r.id)]), [['p1', ['a', 'b']], ['p2', ['c']]]);
  assert.deepEqual(filter(rows, { placeId: 'p1', status: 'reported' }).map(r => r.id), ['a']);
});
test('stale, unknown and unknown-tier flags are explicit', () => {
  const x = risks(inventory(record({ retrievedOn: '2023-01-01' })), TODAY);
  assert.deepEqual(x.map(y => y.code), ['UNKNOWN', 'TIER_UNKNOWN', 'OLDER_THAN_YEAR']);
});
test('HTML escapes attacker-controlled strings', () => {
  const x = render(inventory(record({ label: '<script>alert(1)</script>', source: '" onclick="bad()', note: '<img src=x>' })), { today: TODAY }).text;
  assert.doesNotMatch(x, /<script>|<img|onclick="bad/);
  assert.match(x, /&lt;script&gt;/);
  assert.match(x, /lang="en"/);
  assert.match(x, /href="#main"/);
  assert.match(x, /focus-visible/);
  assert.equal(escapeHtml(`&<>"'`), '&amp;&lt;&gt;&quot;&#39;');
});
test('French output has explicit language and honest caution', () => {
  const x = render(inventory(record()), { language: 'fr', today: TODAY }).text;
  assert.match(x, /lang="fr"/);
  assert.match(x, /UNKNOWN reste UNKNOWN/);
  assert.match(x, /Confirmez les détails/);
});
test('all export formats contain provenance', () => {
  for (const format of ['json', 'csv', 'text', 'html']) {
    const result = render(inventory(record()), { format, today: TODAY });
    assert.equal(result.ok, true, format);
    assert.match(result.text, /CC0-1.0/);
    assert.match(result.text, /2026-11-20/);
  }
});
test('invalid report options rejected', () => {
  assert.equal(render(inventory(), { language: 'xx' }).ok, false);
  assert.equal(render(inventory(), { format: 'pdf' }).ok, false);
});
test('argument parser rejects bad inputs', () => {
  for (const x of [[], ['--after'], ['--after', 'file', '--after', 'other'], ['--after', 'file', '--format', 'pdf'], ['--after', 'file', '--language', 'de'], ['--after', 'file', '--unknown', 'x']]) {
    assert.equal(parseArgs(x).ok, false, JSON.stringify(x));
  }
  assert.equal(parseArgs(['--after', 'file', '--language', 'fr']).ok, true);
});
test('CLI never overwrites output and reads valid inventory', async () => {
  const root = await mkdtemp(join(tmpdir(), 'p19-evidence-'));
  try {
    const input = join(root, 'input.json'), out = join(root, 'review.html');
    await writeFile(input, JSON.stringify(base()));
    const streams = output();
    assert.equal(await run(['--after', input, '--output', out, '--today', TODAY], streams.streams), 0);
    assert.match(await readFile(out, 'utf8'), /Offline evidence review/);
    assert.equal(await run(['--after', input, '--output', out, '--today', TODAY], streams.streams), 2);
  } finally { await rm(root, { recursive: true, force: true }); }
});
test('CLI rejects invalid inventory without producing a report', async () => {
  const root = await mkdtemp(join(tmpdir(), 'p19-evidence-'));
  try {
    const input = join(root, 'bad.json'); await writeFile(input, '{not json');
    const x = output(); assert.equal(await run(['--after', input, '--today', TODAY], x.streams), 2);
    assert.match(x.printed.err, /INVALID_AFTER/);
  } finally { await rm(root, { recursive: true, force: true }); }
});
test('CLI refuses input symlinks', async () => {
  const root = await mkdtemp(join(tmpdir(), 'p19-evidence-'));
  try {
    const input = join(root, 'input.json'), linked = join(root, 'link.json');
    await writeFile(input, JSON.stringify(base())); await symlink(input, linked);
    await assert.rejects(safeRead(linked), /UNSAFE_INPUT/);
  } finally { await rm(root, { recursive: true, force: true }); }
});
test('CLI does not overwrite a pre-existing file', async () => {
  const root = await mkdtemp(join(tmpdir(), 'p19-evidence-'));
  try {
    const file = join(root, 'out'); await writeFile(file, 'original');
    await assert.rejects(safeWrite(file, 'replaced'), { code: 'EEXIST' });
    assert.equal(await readFile(file, 'utf8'), 'original');
  } finally { await rm(root, { recursive: true, force: true }); }
});
test('CLI can compare two valid inventories and print a French report', async () => {
  const root = await mkdtemp(join(tmpdir(), 'p19-evidence-'));
  try {
    const before = join(root, 'before.json'), after = join(root, 'after.json');
    await writeFile(before, JSON.stringify(inventory(record({ status: 'reported' }))));
    await writeFile(after, JSON.stringify(base()));
    const x = output();
    assert.equal(await run(['--before', before, '--after', after, '--language', 'fr', '--today', TODAY], x.streams), 0);
    assert.match(x.printed.out, /Modifications depuis/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('visible UNKNOWN token is consistent across HTML and text in both languages', () => {
  for (const language of ['en', 'fr']) {
    for (const format of ['html', 'text']) {
      const result = render(inventory(record()), { language, format, today: TODAY });
      assert.equal(result.ok, true);
      assert.match(result.text, /UNKNOWN/);
      assert.doesNotMatch(result.text, /\b(?:Unknown|Inconnu|inconnu)\b/u);
    }
  }
});
test('control character check rejects C0 controls while permitting tab newline and carriage return', () => {
  for (const code of [0, 1, 8, 11, 12, 14, 31]) {
    const item = record({ label: `label${String.fromCharCode(code)}` });
    assert.ok(validateRecord(item, 0, TODAY).issues.some(issue => issue.code === 'INVALID_LABEL'));
  }
  for (const code of [9, 10, 13]) {
    const item = record({ label: `label${String.fromCharCode(code)}more` });
    assert.equal(validateRecord(item, 0, TODAY).issues.length, 0);
  }
});
