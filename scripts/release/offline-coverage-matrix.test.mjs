import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm, symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { parseInventory, matrix, validDate, validText, FEATURE_TYPES } from './offline-coverage-matrix.mjs';
import { exportMatrix, csvField } from './offline-coverage-report.mjs';
import { parseArgs, readSafe, writeSafe, run } from './offline-coverage-cli.mjs';
const today = '2026-11-20';
const record = (changes = {}) => ({ id: 'r1', placeId: 'fictional-a', type: 'entrance', label: 'Fictional example', status: 'unknown', source: 'Fictional illustration', licence: 'CC0-1.0', retrievedOn: '2026-11-20', verificationTier: 'unknown', ...changes });
const inventory = (...records) => ({ schemaVersion: 1, records });
const parse = data => parseInventory(JSON.stringify(data), { today });
const m = (...records) => matrix(parse(inventory(...records)).value, { today });
test('calendar validation handles leap years and invalid dates', () => {
  for (const x of ['2024-02-29', '2000-02-29', today]) assert.equal(validDate(x), true);
  for (const x of ['2026-02-29', '2026-13-01', '2026-11-31', '2026-1-01', null, '', '0000-00-00']) assert.equal(validDate(x), false);
});
test('text validation blocks controls without regex lint violations', () => {
  assert.equal(validText('fine\nnotes', 20), true);
  assert.equal(validText('bad\0value', 20), false);
  assert.equal(validText(' bad', 20), false);
  assert.equal(validText('', 20), false);
});
test('valid fictional record parses without inventing a condition', () => {
  const data = parse(inventory(record()));
  assert.equal(data.ok, true);
  assert.equal(data.value.records[0].status, 'unknown');
});
test('missing each provenance field is rejected', () => {
  for (const key of ['source','licence','retrievedOn','verificationTier']) {
    const r = record(); delete r[key];
    assert.equal(parse(inventory(r)).ok, false, key);
  }
});
test('future retrieval is rejected', () => assert.equal(parse(inventory(record({ retrievedOn: '2026-11-21' }))).ok, false));
test('empty records is valid but does not generate made-up places', () => {
  assert.deepEqual(m().summary, { places: 0, cells: 0, unknownCells: 0, evidencePresentCells: 0, staleCells: 0, unknownTierCells: 0 });
});
test('unknown feature cells remain unknown rather than inferred', () => {
  const data = m(record());
  assert.equal(data.rows.length, FEATURE_TYPES.length);
  assert.equal(data.rows.find(r => r.type === 'entrance').state, 'unknown');
  assert.equal(data.rows.find(r => r.type === 'washroom').state, 'unknown');
  assert.equal(data.summary.unknownCells, FEATURE_TYPES.length);
});
test('reported evidence means presence only, not accessible', () => {
  const data = m(record({ status: 'reported' }));
  assert.equal(data.rows.find(r => r.type === 'entrance').state, 'evidence-present');
  assert.equal(JSON.stringify(data).includes('accessible'), false);
});
test('not-reported state counts as evidence without positive inference', () => {
  assert.equal(m(record({ status: 'not-reported' })).summary.evidencePresentCells, 1);
});
test('multiple records are counted and sorted deterministically', () => {
  const data = m(record({ id: 'z' }), record({ id: 'a' }));
  assert.deepEqual(data.rows.find(r => r.type === 'entrance').recordIds, ['a','z']);
});
test('places are sorted consistently', () => {
  const data = m(record({ placeId: 'z' }), record({ id: 'r2', placeId: 'a' }));
  assert.deepEqual([...new Set(data.rows.map(x => x.placeId))], ['a','z']);
});
test('stale evidence is flagged by exact day difference', () => {
  const data = m(record({ retrievedOn: '2024-01-01' }));
  assert.deepEqual(data.rows.find(r => r.type === 'entrance').staleIds, ['r1']);
});
test('stale boundary is exclusive', () => {
  const data = matrix(parse(inventory(record({ retrievedOn: '2026-11-19' }))).value, { today, staleDays: 1 });
  assert.deepEqual(data.rows[0].staleIds, []);
});
test('unknown verification tier is flagged independently', () => {
  assert.deepEqual(m(record()).rows.find(r => r.type === 'entrance').unknownTierIds, ['r1']);
});
test('documented verification tier does not alter unknown status', () => {
  const data = m(record({ verificationTier: 'documented' }));
  assert.equal(data.rows[1].state, 'unknown');
  assert.deepEqual(data.rows[1].unknownTierIds, []);
});
test('invalid duplicate record ids rejected', () => assert.equal(parse(inventory(record(), record())).ok, false));
test('unknown keys fail closed', () => assert.equal(parse(inventory(record({ secret: 1 }))).ok, false));
test('unsupported record and root objects rejected', () => {
  for (const x of ['[]','{}','null','{bad json','{"schemaVersion":1,"records":{}}']) assert.equal(parseInventory(x,{today}).ok,false);
});
test('oversized inventory is rejected', () => assert.equal(parseInventory('x'.repeat(6_000_001),{today}).ok,false));
test('invalid matrix options rejected', () => {
  const data = parse(inventory()).value;
  for (const opts of [{ today: 'bad' }, { today, staleDays: -1 }, { today, types: [] }, { today, types: ['entrance','entrance'] }, { today, types: ['stairs'] }]) assert.throws(() => matrix(data,opts));
});
test('subset feature matrix is supported', () => {
  assert.deepEqual(matrix(parse(inventory(record())).value,{today,types:['entrance']}).rows.map(x=>x.type),['entrance']);
});
test('html uses bilingual language and skip link', () => {
  for (const lang of ['en','fr']) {
    const html = exportMatrix(m(record()),{language:lang});
    assert.match(html,new RegExp(`lang="${lang}"`));
    assert.match(html,/href="#main"/);
    assert.match(html,/focus-visible/);
    assert.match(html,/min-height:44px/);
  }
});
test('html escapes untrusted source strings', () => {
  const html = exportMatrix(m(record({ source: '<img src=x onerror=bad>' })));
  assert.doesNotMatch(html,/<img/);
  assert.match(html,/&lt;img/);
});
test('French punctuation uses NBSP colon and narrow NBSP semicolon', () => {
  const txt = exportMatrix(m(record()), { format:'text', language:'fr' });
  assert.match(txt,/\u00a0:/u);
  assert.match(txt,/\u202f;/u);
  assert.doesNotMatch(txt,/[^\u202f];/u);
});
test('CSV exports UNKNOWN rather than lowercase unknown', () => {
  const csv = exportMatrix(m(record()),{format:'csv',language:'fr'});
  assert.match(csv, /"UNKNOWN"/);
  assert.doesNotMatch(csv,/"unknown"/);
});
test('CSV neutralises spreadsheet formula injection', () => {
  for (const str of ['=SUM(1,2)','+1','-4','@cmd',' =evil']) assert.match(csvField(str),/^"'/);
});
test('JSON keeps internal unknown while presenting explicit display UNKNOWN', () => {
  const data = JSON.parse(exportMatrix(m(record()), { format:'json' }));
  assert.equal(data.rows.find(r => r.type === 'entrance').displayState,'UNKNOWN');
  assert.equal(data.rows.find(r => r.type === 'entrance').evidence[0].status,'unknown');
  assert.equal(data.rows.find(r => r.type === 'entrance').evidence[0].displayStatus,'UNKNOWN');
});
test('every export format retains provenance', () => {
  for (const format of ['csv','json','html','text']) {
    const result = exportMatrix(m(record()),{format});
    assert.match(result,/Fictional illustration/);
    assert.ok(result.length > 10);
  }
});
test('invalid export options rejected', () => {
  assert.throws(()=>exportMatrix(m(), {format:'pdf'}));
  assert.throws(()=>exportMatrix(m(), {language:'de'}));
});
test('argument parser requires input and date', () => {
  for (const args of [[], ['--input','x'], ['--today',today], ['--input','x','--today','wrong'],['--input','x','--today',today,'--language','de'], ['--input','x','--today',today,'--format','pdf'], ['--input','x','--today',today,'--stale-days','-1']]) assert.equal(parseArgs(args),null);
});
test('duplicate command line flag rejected', () => assert.equal(parseArgs(['--input','x','--today',today,'--input','y']),null));
test('valid command options parsed', () => assert.equal(parseArgs(['--input','x','--today',today,'--format','csv'])['--format'],'csv'));
test('CLI writes a new offline report and refuses overwrite', async () => {
  const root = await mkdtemp(join(tmpdir(),'p19-coverage-'));
  try {
    const input=join(root,'input.json'), output=join(root,'result.csv');
    await writeFile(input,JSON.stringify(inventory(record())));
    const streams={stdout:{write:()=>{}},stderr:{write:()=>{}}};
    assert.equal(await run(['--input',input,'--today',today,'--output',output,'--format','csv'],streams),0);
    assert.match(await readFile(output,'utf8'),/UNKNOWN/);
    assert.equal(await run(['--input',input,'--today',today,'--output',output],streams),2);
  } finally { await rm(root,{recursive:true,force:true}); }
});
test('unsafe symbolic links are rejected', async () => {
  const root=await mkdtemp(join(tmpdir(),'p19-coverage-'));
  try {
    const file=join(root,'real.json'), link=join(root,'link.json');
    await writeFile(file,'{}'); await symlink(file,link);
    await assert.rejects(readSafe(link),/UNSAFE_INPUT/);
  } finally { await rm(root,{recursive:true,force:true}); }
});
test('safe output mode does not replace existing file', async () => {
  const root=await mkdtemp(join(tmpdir(),'p19-coverage-'));
  try { const file=join(root,'out');await writeFile(file,'keep');await assert.rejects(writeSafe(file,'overwrite'),{code:'EEXIST'});assert.equal(await readFile(file,'utf8'),'keep'); }
  finally { await rm(root,{recursive:true,force:true}); }
});
test('CLI rejects malformed inventory and does not emit an output', async () => {
  const root=await mkdtemp(join(tmpdir(),'p19-coverage-'));
  try {const file=join(root,'bad.json');await writeFile(file,'{broken');let err='';assert.equal(await run(['--input',file,'--today',today],{stderr:{write:x=>{err+=x;}},stdout:{write:()=>{}}}),2);assert.match(err,/INVALID_INVENTORY/);}
  finally { await rm(root,{recursive:true,force:true}); }
});
