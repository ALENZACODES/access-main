import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { isPlain, safeText, safeRelativePath, validDate, parseDossier, validateItem,
  exampleDossier, toDisplay, MAX_MANIFEST_BYTES, MAX_ITEMS, UNKNOWN } from './offline-dossier-contract.mjs';
const day = '2026-11-20';
const checksum = createHash('sha256').update('sample').digest('hex');
const original = () => structuredClone(exampleDossier(checksum, 6));
const parse = value => parseDossier(JSON.stringify(value), { today: day });
const record = updates => ({ ...original().items[0], ...updates });
test('plain objects only, not arrays or constructed objects', () => {
  assert.equal(isPlain({}), true);
  assert.equal(isPlain(Object.create(null)), true);
  for (const bad of [null, [], 4, new Date(), new Map(), 'x']) assert.equal(isPlain(bad), false);
});
test('dates validate leap days and impossible dates', () => {
  for (const x of ['2000-02-29','2024-02-29','2026-11-20']) assert.equal(validDate(x), true);
  for (const x of [null,'2026-02-29','1900-02-29','2026-11-31','2026-13-01','2026-1-1']) assert.equal(validDate(x), false);
});
test('control characters and invisible separators cannot enter source fields', () => {
  for (const bad of ['', ' space', 'space ', 'bad\u0000value', 'bad\u007fvalue','x\u2028y', 'x\u2029y']) assert.equal(safeText(bad), false);
  assert.equal(safeText('Waterloo; Ontario'), true);
  assert.equal(safeText('État d’accessibilité non confirmé'), true);
});
test('safe paths require relative portable segments', () => {
  for (const valid of ['sample.txt','evidence/door_01.json','a/b-c/1.png']) assert.equal(safeRelativePath(valid), true, valid);
  for (const bad of ['','/tmp/a','../a','a/../b','a/./b','a//b','a\\b','.private','a/.hidden','a b','a\n', 'a/'.repeat(300)]) assert.equal(safeRelativePath(bad), false, bad);
});
test('example is clearly fictional and UNKNOWN', () => {
  const example = original();
  assert.equal(parse(example).ok, true);
  assert.equal(example.items[0].status, 'unknown');
  assert.equal(example.items[0].verificationTier, 'unknown');
  assert.match(example.items[0].source, /Fictional/);
  assert.equal(UNKNOWN, 'UNKNOWN');
  assert.equal(toDisplay('unknown'), 'UNKNOWN');
  assert.equal(toDisplay('reported'), 'reported');
});
test('schema strictly refuses unknown fields', () => {
  const doc = original(); doc.extra = true;
  assert.ok(parse(doc).issues.some(x => x.code === 'UNRECOGNISED_FIELD'));
  assert.ok(validateItem(record({ secret: true }), 0, day).issues.some(x => x.code === 'UNRECOGNISED_FIELD'));
});
test('missing provenance fields all fail closed', () => {
  for (const key of ['source', 'licence', 'retrievedOn', 'verificationTier']) {
    const item = record({}); delete item[key];
    assert.equal(parse({schemaVersion:1, items:[item]}).ok, false, key);
  }
});
test('unknown remains unknown with high evidence tier', () => {
  const parsed = parse({schemaVersion:1,items:[record({verificationTier:'field-observed',note:'claimed accessible'})]});
  assert.equal(parsed.ok, true);
  assert.equal(parsed.value.items[0].status,'unknown');
});
test('unapproved inferred status is rejected', () => {
  for (const status of ['accessible','yes','guaranteed','verified']) assert.equal(parse({schemaVersion:1,items:[record({status})]}).ok,false);
});
test('invalid category and verification tiers fail', () => {
  assert.equal(parse({schemaVersion:1,items:[record({category:'restaurant'})]}).ok,false);
  assert.equal(parse({schemaVersion:1,items:[record({verificationTier:'verified'})]}).ok,false);
});
test('future retrieval dates are refused', () => {
  const parsed = parse({schemaVersion:1,items:[record({retrievedOn:'2026-11-21'})]});
  assert.ok(parsed.issues.some(x=>x.code==='INVALID_RETRIEVED_ON'));
});
test('bytes and hashes must be exact', () => {
  for (const bytes of [-1,1.5,Number.MAX_SAFE_INTEGER,NaN]) assert.equal(parse({schemaVersion:1,items:[record({bytes})]}).ok,false);
  for (const sha256 of [checksum.toUpperCase(),'f'.repeat(63),'f'.repeat(65),'']) assert.equal(parse({schemaVersion:1,items:[record({sha256})]}).ok,false);
});
test('item identifiers and place identifiers must be portable', () => {
  assert.equal(parse({schemaVersion:1,items:[record({id:'../x'})]}).ok,false);
  assert.equal(parse({schemaVersion:1,items:[record({placeId:'Toronto Place'})]}).ok,false);
});
test('duplicate ids and duplicate paths fail separately', () => {
  const first=record({});
  const dupId=parse({schemaVersion:1,items:[first, record({path:'other.txt'})]});
  assert.ok(dupId.issues.some(x=>x.code==='DUPLICATE_ID'));
  const dupPath=parse({schemaVersion:1,items:[first, record({id:'another'})]});
  assert.ok(dupPath.issues.some(x=>x.code==='DUPLICATE_PATH'));
});
test('empty inventory is a valid explicit manifest', () => assert.deepEqual(parse({schemaVersion:1,items:[]}).value,{schemaVersion:1,items:[]}));
test('size and count limits are enforced', () => {
  assert.equal(parseDossier('x'.repeat(MAX_MANIFEST_BYTES+1)).ok,false);
  assert.equal(parse({schemaVersion:1,items:Array(MAX_ITEMS+1).fill(null)}).ok,false);
});
test('bad root shapes and invalid JSON fail', () => {
  for (const raw of ['{','[]','null','4','{"schemaVersion":1}','{"schemaVersion":2,"items":[]}']) assert.equal(parseDossier(raw).ok,false,raw);
});
test('invalid today fails before parsing and invalid item produces issue', () => {
  assert.equal(parseDossier('{}',{today:'tomorrow'}).ok,false);
  assert.ok(parse({schemaVersion:1,items:[null]}).issues.some(x=>x.code==='ITEM_OBJECT_REQUIRED'));
});
test('schema produces stable normalized record with optional note', () => {
  const parsed=parse({schemaVersion:1,items:[record({note:'Self-reported, not checked'})]});
  assert.equal(parsed.value.items[0].note,'Self-reported, not checked');
  assert.equal(Object.hasOwn(parse(original()).value.items[0],'note'),false);
});
