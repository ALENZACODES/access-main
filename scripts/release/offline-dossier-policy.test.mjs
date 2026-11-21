import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sha256, summarizeResults } from './offline-dossier-audit.mjs';
import { exampleDossier } from './offline-dossier-contract.mjs';
import { ageInDays, reviewOptions, reviewDossier, compareReviews, reviewText, reviewJson, REVIEW_CODES } from './offline-dossier-policy.mjs';
const day='2026-11-20';
const baseItem=()=>exampleDossier(sha256(Buffer.from('sample')),6).items[0];
const audit=(entries)=>({results:entries, ...summarizeResults(entries)});
const result=(id,status='MATCH',change={})=>({id,status,item:{...baseItem(),id,...change}});
test('age handles leap days and midnight UTC exactly',()=>{
  assert.equal(ageInDays('2024-02-29','2024-03-01'),1);
  assert.equal(ageInDays(day,day),0);
  assert.equal(ageInDays('2025-11-20',day),365);
});
test('invalid dates throw rather than assuming age',()=>{
  assert.throws(()=>ageInDays('2026-02-29',day),/INVALID_DATE/);
  assert.throws(()=>ageInDays(day,'yesterday'),/INVALID_DATE/);
});
test('options allow a precise explicit category list',()=>{
  const options=reviewOptions({today:day,expectedPlaces:['fictional-location'],expectedCategories:['entrance','path']});
  assert.deepEqual(options.expectedCategories,['entrance','path']);
});
test('options reject invalid and duplicate expectations',()=>{
  for(const expectedPlaces of [['x','x'],['bad place'],[null]]) assert.throws(()=>reviewOptions({expectedPlaces}),/INVALID_REVIEW_OPTIONS/);
  assert.throws(()=>reviewOptions({expectedCategories:['entrance','entrance']}),/INVALID_REVIEW_OPTIONS/);
  assert.throws(()=>reviewOptions({expectedCategories:['restaurant']}),/INVALID_REVIEW_OPTIONS/);
});
test('staleness thresholds are bounded and not loosened implicitly',()=>{
  for(const staleAfterDays of [-1,0,1.5,3651]) assert.throws(()=>reviewOptions({staleAfterDays}),/INVALID_REVIEW_OPTIONS/);
});
test('unknown evidence triggers a specific review finding',()=>{
  const output=reviewDossier(audit([result('a')]),{today:day});
  assert.equal(output.counts.UNKNOWN_EVIDENCE,1);
  assert.equal(output.counts.UNKNOWN_TIER,1);
  assert.equal(output.humanReviewRequired,true);
});
test('known data with documented tier does not auto-generate an accessibility approval',()=>{
  const output=reviewDossier(audit([result('a','MATCH',{status:'reported',verificationTier:'documented'})]),{today:day});
  assert.equal(output.total,0);
  assert.equal(output.humanReviewRequired,false);
  assert.equal(Object.hasOwn(output,'accessible'),false);
});
test('missing bytes and unsafe files are surfaced',()=>{
  for(const status of ['MISSING','UNSAFE','READ_ERROR']) {
    const output=reviewDossier(audit([result('a',status)]),{today:day});
    assert.equal(output.counts.FILE_UNAVAILABLE,1);
  }
});
test('size and hash mismatches are surfaced',()=>{
  for(const status of ['SIZE_MISMATCH','HASH_MISMATCH']) {
    const output=reviewDossier(audit([result('a',status)]),{today:day});
    assert.equal(output.counts.FILE_MISMATCH,1);
  }
});
test('stale dates are an explicit review reason',()=>{
  const output=reviewDossier(audit([result('a','MATCH',{retrievedOn:'2024-01-01'})]),{today:day,staleAfterDays:365});
  assert.equal(output.counts.STALE_EVIDENCE,1);
  assert.ok(output.findings.find(x=>x.code==='STALE_EVIDENCE').ageDays>365);
});
test('exactly threshold age is not deemed stale',()=>{
  const output=reviewDossier(audit([result('a','MATCH',{retrievedOn:'2025-11-20'})]),{today:day,staleAfterDays:365});
  assert.equal(output.counts.STALE_EVIDENCE,0);
});
test('no missing categories invented without supplied expectations',()=>{
  const output=reviewDossier(audit([]),{today:day});
  assert.equal(output.counts.MISSING_EXPECTED_CATEGORY,0);
});
test('explicit missing categories remain UNKNOWN and require review',()=>{
  const output=reviewDossier(audit([]),{today:day,expectedPlaces:['fictional-location'],expectedCategories:['path']});
  assert.deepEqual(output.findings.map(x=>x.code),['MISSING_EXPECTED_CATEGORY']);
  assert.equal(output.findings[0].id,null);
});
test('expected category with evidence does not generate missing flag',()=>{
  const output=reviewDossier(audit([result('a')]),{today:day,expectedPlaces:['fictional-location'],expectedCategories:['entrance']});
  assert.equal(output.counts.MISSING_EXPECTED_CATEGORY,0);
});
test('review findings sorted deterministically',()=>{
  const output=reviewDossier(audit([result('z'),result('a')]),{today:day});
  assert.deepEqual([...new Set(output.findings.map(x=>x.id))],['a','z']);
});
test('review codes list includes all emitted codes',()=>{
  const review=reviewDossier(audit([result('a','MISSING',{retrievedOn:'2024-01-01'})]),{today:day});
  for(const x of review.findings) assert.ok(REVIEW_CODES.includes(x.code));
});
test('review comparison shows appearance and clearance',()=>{
  const previous=reviewDossier(audit([result('a','MISSING')]),{today:day});
  const current=reviewDossier(audit([result('a','MATCH',{status:'reported',verificationTier:'documented'})]),{today:day});
  const diff=compareReviews(previous,current);
  assert.equal(diff.counts.cleared,3);
  assert.equal(diff.counts.appeared,0);
});
test('review comparison retains continuing findings',()=>{
  const a=reviewDossier(audit([result('a')]),{today:day});
  assert.equal(compareReviews(a,a).counts.continuing,2);
});
test('review text is bilingual and has required French typography',()=>{
  const output=reviewDossier(audit([result('a')]),{today:day});
  assert.match(reviewText(output,'en'),/Review findings/u);
  const fr=reviewText(output,'fr');
  assert.match(fr,/Points à examiner\u00a0:/u);
  assert.match(fr,/\u202f;/u);
  assert.match(fr,/n’établissent pas l’accessibilité/u);
});
test('review JSON retains UNKNOWN without changing source records',()=>{
  const output=reviewDossier(audit([result('a')]),{today:day});
  const json=reviewJson(output);
  assert.equal(json.findings[0].evidence,'UNKNOWN');
});
test('invalid audit and comparison objects fail early',()=>{
  assert.throws(()=>reviewDossier(null),/INVALID_AUDIT/);
  assert.throws(()=>reviewDossier({results:[{id:'a',item:null}]}),/INVALID_AUDIT/);
  assert.throws(()=>compareReviews(null,{}),/INVALID_REVIEW/);
});
