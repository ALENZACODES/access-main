import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fictionalManifest, UNKNOWN } from './document-outline-contract.mjs';
import { compareDocuments, outlineChanges, linkChanges, deltaFindings, compareManifest } from './document-outline-delta.mjs';
import { reviewManifest } from './document-outline-review.mjs';
const fixture = () => fictionalManifest();
const variants = (field, value) => { const before=fixture(), after=fixture();after.documents[0][field]=value;return [before,after]; };
const changed = (field, value) => compareManifest(...variants(field,value));
const rows = (a,b) => compareDocuments(a,b);
const en = v => v.documents.find(d=>d.language==='en');
test('equal manifests have unchanged document records', () => {
  const a = fixture(), b = fixture();
  assert.ok(rows(a,b).every(r=>r.kind==='unchanged'));
});
test('unchanged document records list no changed fields', () => {
  const a = fixture(), b=fixture();
  assert.ok(rows(a,b).every(r=>r.fields.length===0));
});
test('changed title is identified', () => assert.deepEqual(changed('title','Changed title').value.documents.find(d=>d.id==='en-intro').fields,['title']));
test('changed body is identified', () => assert.deepEqual(changed('body','# Updated').value.documents.find(d=>d.id==='en-intro').fields,['body']));
test('changed provenance source is identified', () => assert.deepEqual(changed('source','Updated fictional source').value.documents.find(d=>d.id==='en-intro').fields,['source']));
test('changed provenance licence is identified', () => assert.deepEqual(changed('licence','CC-BY-4.0').value.documents.find(d=>d.id==='en-intro').fields,['licence']));
test('changed evidence tier is identified', () => assert.deepEqual(changed('tier','documented').value.documents.find(d=>d.id==='en-intro').fields,['tier']));
test('changed review state is identified', () => assert.deepEqual(changed('state','reviewed').value.documents.find(d=>d.id==='en-intro').fields,['state']));
test('changed file path is identified', () => assert.deepEqual(changed('path','help/updated.en.md').value.documents.find(d=>d.id==='en-intro').fields,['path']));
test('changed language is identified', () => assert.deepEqual(changed('language','fr').value.documents.find(d=>d.id==='en-intro').fields,['language']));
test('changed retrieved date is identified', () => assert.deepEqual(changed('retrievedOn','2026-11-18').value.documents.find(d=>d.id==='en-intro').fields,['retrievedOn']));
test('added document is identified', () => {
  const a=fixture(), b=fixture();
  b.documents.push({...en(b),id:'new-guide',path:'help/new-guide.md'});
  assert.equal(rows(a,b).find(r=>r.id==='new-guide').kind,'added');
});
test('removed document is identified', () => {
  const a=fixture(),b=fixture();b.documents.pop();
  assert.equal(rows(a,b).find(r=>r.id==='fr-intro').kind,'removed');
});
test('added document has no prior fields', () => {
  const a=fixture(),b=fixture();b.documents.push({...en(b),id:'new-guide',path:'help/new-guide.md'});
  assert.deepEqual(rows(a,b).find(r=>r.id==='new-guide').fields,[]);
});
test('removed document retains original path', () => {
  const a=fixture(),b=fixture();b.documents.pop();
  assert.equal(rows(a,b).find(r=>r.id==='fr-intro').path,'help/introduction.fr.md');
});
test('result rows are sorted by document id', () => {
  const result=rows(fixture(),fixture());
  assert.deepEqual(result.map(r=>r.id),[...result.map(r=>r.id)].sort());
});
test('one changed document does not mark the other changed', () => {
  const diff=changed('body','# New');
  assert.equal(diff.value.documents.find(r=>r.id==='fr-intro').kind,'unchanged');
});
test('outline changes are empty for unchanged manifests', () => {
  assert.deepEqual(outlineChanges(fixture(),fixture()),[]);
});
test('adding a heading updates outline', () => {
  const [a,b]=variants('body','# Intro\n## Details\n### Added');
  assert.equal(outlineChanges(a,b).length,1);
});
test('changing prose only preserves heading structure', () => {
  const [a,b]=variants('body','# Introduction\n\nDifferent prose\n\n## Details');
  assert.deepEqual(outlineChanges(a,b),[]);
});
test('changing heading level is an outline difference', () => {
  const [a,b]=variants('body','# Introduction\n### Details');
  assert.ok(outlineChanges(a,b)[0].after.some(h=>h.startsWith('3:')));
});
test('changing heading text changes anchors', () => {
  const [a,b]=variants('body','# Changed\n## Details');
  assert.ok(outlineChanges(a,b)[0].after.includes('1:changed'));
});
test('changing only a link does not alter outline', () => {
  const [a,b]=variants('body','# Introduction\n\n[New](#details)\n\n## Details');
  assert.deepEqual(outlineChanges(a,b),[]);
});
test('link changes are empty for unchanged manifests', () => {
  assert.deepEqual(linkChanges(fixture(),fixture()),[]);
});
test('changing link destination is detected', () => {
  const [a,b]=variants('body','# Introduction\n[Go to details](#introduction)\n## Details');
  assert.equal(linkChanges(a,b)[0].added.length,1);
});
test('changing link destination preserves removed link', () => {
  const [a,b]=variants('body','# Introduction\n[Go to details](#introduction)\n## Details');
  assert.ok(linkChanges(a,b)[0].removed.some(s=>s.includes('#details')));
});
test('removing a link from source is detected', () => {
  const [a,b]=variants('body','# Introduction\n## Details');
  assert.equal(linkChanges(a,b)[0].removed.length,1);
});
test('adding another link is detected', () => {
  const [a,b]=variants('body','# Introduction\n[Go to details](#details)\n[New](#details)\n## Details');
  assert.equal(linkChanges(a,b)[0].added.length,1);
});
test('changing heading but retaining link does not create link difference', () => {
  const [a,b]=variants('body','# New introduction\n[Go to details](#details)\n## Details');
  assert.deepEqual(linkChanges(a,b),[]);
});
test('delta findings detect a newly unsafe URL', () => {
  const diff=changed('body','# Introduction\n[Bad](javascript:alert(1))');
  assert.ok(diff.value.findings.added.some(i=>i.code==='LINK_UNSAFE'));
});
test('delta findings detect removal of unsafe URL', () => {
  const a=fixture(),b=fixture();a.documents[0].body='# Introduction\n[Bad](javascript:alert(1))';
  assert.ok(compareManifest(a,b).value.findings.resolved.some(i=>i.code==='LINK_UNSAFE'));
});
test('a finding with a changed line is treated as a distinct observation', () => {
  const a=fixture(),b=fixture();a.documents[0].body='# Introduction\n[Bad](javascript:alert(1))';
  b.documents[0].body='# Introduction\n\n[Bad](javascript:alert(1))';
  const delta=compareManifest(a,b).value.findings;
  assert.ok(delta.added.some(i=>i.code==='LINK_UNSAFE'));
  assert.ok(delta.resolved.some(i=>i.code==='LINK_UNSAFE'));
});
test('same finding identity is not duplicated', () => {
  const v=fixture(),a=reviewManifest(v),b=reviewManifest(v);
  assert.deepEqual(deltaFindings(a,b),{added:[],resolved:[]});
});
test('body changes request human review', () => assert.equal(changed('body','# Updated').value.requireReview,true));
test('title changes request human review', () => assert.equal(changed('title','Updated').value.requireReview,true));
test('identical snapshots do not request new human review', () => assert.equal(compareManifest(fixture(),fixture()).value.requireReview,false));
test('comparison retains UNKNOWN caution', () => assert.equal(compareManifest(fixture(),fixture()).value.caution,UNKNOWN));
test('comparison reports both snapshot dates', () => {
  const a=fixture(),b=fixture();b.capturedOn='2026-11-21';
  assert.equal(compareManifest(a,b).value.before,'2026-11-20');
  assert.equal(compareManifest(a,b).value.after,'2026-11-21');
});
test('invalid before manifest fails comparison', () => assert.equal(compareManifest({},fixture()).ok,false));
test('invalid after manifest fails comparison', () => assert.equal(compareManifest(fixture(),{}).ok,false));
test('two invalid manifests yield structured errors', () => assert.ok(compareManifest({},{}).errors.length>=2));
test('comparison rejects future-dated manifest', () => {
  const b=fixture();b.capturedOn='2027-11-21';
  assert.equal(compareManifest(fixture(),b).ok,false);
});
test('comparison leaves source manifests unchanged', () => {
  const a=fixture(),b=fixture(),before=JSON.stringify(a),after=JSON.stringify(b);
  compareManifest(a,b);
  assert.equal(JSON.stringify(a),before);
  assert.equal(JSON.stringify(b),after);
});
test('comparison output is deterministic', () => {
  const a=fixture(),b=fixture();b.documents[0].body='# Updated';
  assert.deepEqual(compareManifest(a,b),compareManifest(a,b));
});
test('all delta paths are repo-relative', () => {
  const result=compareManifest(fixture(),fixture()).value.documents;
  assert.ok(result.every(x=>!x.path.startsWith('/')));
});
for(const value of ['draft','reviewed',UNKNOWN]) {
  test(`review-state comparison accepts ${value}`, () => assert.equal(changed('state',value).ok,true));
}
test('difference in pair id is recorded', () => {
  const [a,b]=variants('pairId','different');
  assert.ok(rows(a,b).find(x=>x.id==='en-intro').fields.includes('pairId'));
});
test('difference in multiple provenance fields is recorded', () => {
  const a=fixture(),b=fixture();b.documents[0].source='Another fictional source';b.documents[0].licence='MIT';
  assert.deepEqual(rows(a,b).find(x=>x.id==='en-intro').fields,['source','licence']);
});
test('no positive physical-access outcome is assigned', () => {
  const x=compareManifest(fixture(),fixture());
  assert.ok(x.ok);
  assert.ok(!Object.hasOwn(x.value,'accessible'));
});
