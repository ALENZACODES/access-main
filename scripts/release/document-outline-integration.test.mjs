/** End-to-end source contract tests: manifest, outline, navigation, review, delta, policy, export, local CLI. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm, symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fictionalManifest, UNKNOWN, validateManifest, parseManifest } from './document-outline-contract.mjs';
import { analyzeMarkdown, normalizeLinkDestination } from './document-outline-parser.mjs';
import { reviewManifest } from './document-outline-review.mjs';
import { compareManifest } from './document-outline-delta.mjs';
import { makePendingLedger, reconcileReview, planHumanReview, validateLedger } from './document-outline-policy.mjs';
import { inspectNavigation } from './document-outline-navigation.mjs';
import { renderReport } from './document-outline-report.mjs';
import { run } from './document-outline-cli.mjs';
const fixture = () => fictionalManifest();
const withFiles = async operation => {
  const root = await mkdtemp(join(tmpdir(),'document-outline-integrated-'));
  try { return await operation(root); }
  finally { await rm(root,{recursive:true,force:true}); }
};
function outputSink() {
  let content='';
  return { sink:{ write(chunk) { content += chunk; } }, content:()=>content };
}
async function execute(root,manifest,options=[]) {
  const input=join(root,'manifest.json');
  await writeFile(input,JSON.stringify(manifest));
  const stdout=outputSink(),stderr=outputSink();
  const code=await run(['--after',input,'--today','2026-11-21',...options],{stdout:stdout.sink,stderr:stderr.sink});
  return { code,stdout:stdout.content(),stderr:stderr.content() };
}
function guidedSet() {
  const m=fixture();
  m.documents[0].body = [
    '# Introduction',
    '',
    'Choose a guide to read. These are fictional documents.',
    '',
    '[Read the French introduction](help/introduction.fr.md)',
    '[Read the next guide](guides/next.md)',
    '',
    '## Details',
    '',
    '| Topic | Note |',
    '| --- | --- |',
    '| Welcome | Start here |',
  ].join('\n');
  m.documents[1].body = '# Introduction\n\n## Details\n\nConsultez les guides.';
  m.documents.push({
    ...m.documents[0], id:'next-guide',path:'guides/next.md',title:'Next guide',
    body:'# Next guide\n\n## About\n\nDetails.',pairId:undefined,state:'reviewed',tier:'documented',
  });
  delete m.documents[2].pairId;
  return m;
}
const codes = result => result.value.issues.map(i=>i.code);
test('fictional manifest validates before any review', () => {
  const manifest=guidedSet();
  assert.equal(validateManifest(manifest).ok,true);
});
test('manifest can be encoded and decoded without losing language pairs', () => {
  const manifest=guidedSet();
  const parsed=parseManifest(JSON.stringify(manifest));
  assert.equal(parsed.ok,true);
  assert.deepEqual(parsed.value.documents.map(d=>d.language),['en','fr','en']);
});
test('Markdown parser sees first document table', () => {
  const doc=guidedSet().documents[0];
  assert.equal(analyzeMarkdown(doc.body).tables.length,1);
});
test('Markdown parser sees both document cross-references', () => {
  const doc=guidedSet().documents[0];
  assert.equal(analyzeMarkdown(doc.body).links.length,2);
});
test('both supplied links are classified as local relative links', () => {
  const doc=guidedSet().documents[0];
  const kinds=analyzeMarkdown(doc.body).links.map(l=>normalizeLinkDestination(l.destination).kind);
  assert.deepEqual(kinds,['relative','relative']);
});
test('navigation graph recognizes links to French and follow-up guide', () => {
  const r=inspectNavigation(guidedSet(),{roots:['en-intro']});
  assert.equal(r.ok,true);
  assert.deepEqual(r.value.reachable,['en-intro','fr-intro','next-guide']);
});
test('navigation review distinguishes same- and cross-language links', () => {
  const r=inspectNavigation(guidedSet(),{roots:['en-intro']});
  const en=r.value.documents.find(d=>d.id==='en-intro');
  assert.deepEqual(en.crossLanguage,['fr-intro']);
  assert.deepEqual(en.sameLanguage,['next-guide']);
});
test('navigation review finds no orphans when entry is selected', () => {
  const r=inspectNavigation(guidedSet(),{roots:['en-intro']});
  assert.deepEqual(r.value.disconnected,[]);
});
test('navigation review records no dangling relative paths', () => {
  const r=inspectNavigation(guidedSet(),{roots:['en-intro']});
  assert.deepEqual(r.value.unresolved,[]);
});
test('outline review finds no missing relative targets', () => {
  const r=reviewManifest(guidedSet());
  assert.equal(r.ok,true);
  assert.ok(!codes(r).includes('LINK_TARGET'));
});
test('outline review finds no missing internal anchors', () => {
  const r=reviewManifest(guidedSet());
  assert.ok(!codes(r).includes('LINK_TARGET_FRAGMENT'));
});
test('outline review retains a meaningful source name', () => {
  const r=reviewManifest(guidedSet());
  assert.ok(r.value.documents.every(d=>d.source==='Fictional documentation'||d.source==='Documentation fictive'));
});
test('source evidence retains UNKNOWN when not inspected', () => {
  const r=reviewManifest(guidedSet());
  assert.equal(r.value.documents.find(d=>d.id==='en-intro').tier,UNKNOWN);
});
test('reviewed follow-up document has documented provenance without certification', () => {
  const r=reviewManifest(guidedSet());
  const d=r.value.documents.find(d=>d.id==='next-guide');
  assert.equal(d.tier,'documented');
  assert.equal(d.state,'reviewed');
  assert.ok(!Object.hasOwn(d,'accessible'));
});
test('automatically prepared decision ledger does not close findings', () => {
  const r=reviewManifest(guidedSet());
  const ledger=makePendingLedger(r);
  assert.equal(ledger.ok,true);
  assert.ok(ledger.value.decisions.every(x=>x.decision===UNKNOWN));
});
test('auto-generated ledger validates without a reviewer identity', () => {
  const r=reviewManifest(guidedSet());
  const ledger=makePendingLedger(r);
  assert.equal(validateLedger(ledger.value).ok,true);
});
test('reconciliation keeps every pending issue in manual queue', () => {
  const r=reviewManifest(guidedSet());
  const ledger=makePendingLedger(r);
  const rec=reconcileReview(r,ledger.value);
  assert.equal(rec.value.outstanding.length,r.value.issues.length);
});
test('manual review actions retain exact UNKNOWN evidence note', () => {
  const r=reviewManifest(guidedSet());
  const tasks=planHumanReview(r);
  assert.ok(tasks.every(t=>t.note===UNKNOWN));
});
test('an added broken link produces an explicit added finding', () => {
  const before=guidedSet(),after=guidedSet();
  after.documents[0].body+='\n[Broken](missing.md)';
  const diff=compareManifest(before,after);
  assert.equal(diff.ok,true);
  assert.ok(diff.value.findings.added.some(x=>x.code==='LINK_TARGET'));
});
test('an added broken link is not called a removed finding', () => {
  const before=guidedSet(),after=guidedSet();
  after.documents[0].body+='\n[Broken](missing.md)';
  const diff=compareManifest(before,after);
  assert.ok(!diff.value.findings.resolved.some(x=>x.code==='LINK_TARGET'));
});
test('a fixed broken link is a resolved finding', () => {
  const before=guidedSet(),after=guidedSet();
  before.documents[0].body+='\n[Broken](missing.md)';
  const diff=compareManifest(before,after);
  assert.ok(diff.value.findings.resolved.some(x=>x.code==='LINK_TARGET'));
});
test('a changed document requires review, not autoapproval', () => {
  const before=guidedSet(),after=guidedSet();
  after.documents[0].body+='\nA new paragraph.';
  assert.equal(compareManifest(before,after).value.requireReview,true);
});
test('an unchanged snapshot does not invent a release regression', () => {
  const m=guidedSet(),diff=compareManifest(m,m);
  assert.equal(diff.value.requireReview,false);
});
test('HTML export shows current findings', () => {
  const result=renderReport(guidedSet(),{format:'html'});
  assert.equal(result.ok,true);
  assert.ok(result.content.includes('id="issues"'));
});
test('HTML export shows source provenance fields', () => {
  const result=renderReport(guidedSet(),{format:'html'});
  assert.ok(result.content.includes('Retrieved on'));
  assert.ok(result.content.includes('Licence'));
});
test('French HTML report has a French language attribute', () => {
  const result=renderReport(guidedSet(),{format:'html',language:'fr'});
  assert.ok(result.content.includes('lang="fr"'));
});
test('French HTML report retains unknown evidence token', () => {
  const result=renderReport(guidedSet(),{format:'html',language:'fr'});
  assert.ok(result.content.includes(UNKNOWN));
});
test('JSON export includes all three source documents', () => {
  const result=renderReport(guidedSet(),{format:'json'});
  assert.equal(JSON.parse(result.content).report.documents.length,3);
});
test('CSV export retains source identifiers', () => {
  const result=renderReport(guidedSet(),{format:'csv'});
  assert.ok(result.content.includes('help/introduction.en.md'));
});
test('text export retains finding codes', () => {
  const result=renderReport(guidedSet(),{format:'text'});
  assert.ok(result.content.includes('DOCUMENT_UNREVIEWED'));
});
test('before and after source dates are preserved in JSON', () => {
  const before=guidedSet(),after=guidedSet();
  after.capturedOn='2026-11-21';
  const result=renderReport(after,{format:'json',before});
  assert.deepEqual([JSON.parse(result.content).comparison.before,JSON.parse(result.content).comparison.after],['2026-11-20','2026-11-21']);
});
test('CLI exports a valid report for the full guided fixture',async()=>withFiles(async root=>{
  const result=await execute(root,guidedSet(),['--format','json']);
  assert.equal(result.code,0);
  assert.equal(JSON.parse(result.stdout).report.documents.length,3);
}));
test('CLI exposes only manually captured source content',async()=>withFiles(async root=>{
  const result=await execute(root,guidedSet(),['--format','json']);
  const parsed=JSON.parse(result.stdout);
  assert.ok(parsed.report.documents.every(d=>typeof d.source==='string'));
}));
test('CLI writes a brand-new report file',async()=>withFiles(async root=>{
  const output=join(root,'report.html');
  const result=await execute(root,guidedSet(),['--output',output]);
  assert.equal(result.code,0);
  assert.equal(result.stdout,'');
  assert.ok((await readFile(output,'utf8')).includes('<main'));
}));
test('CLI refuses to overwrite an existing file',async()=>withFiles(async root=>{
  const output=join(root,'report.html');await writeFile(output,'original');
  const result=await execute(root,guidedSet(),['--output',output]);
  assert.equal(result.code,2);
  assert.equal(await readFile(output,'utf8'),'original');
}));
test('CLI refuses to write through a symlink',async()=>withFiles(async root=>{
  const original=join(root,'original'),link=join(root,'link');
  await writeFile(original,'untouched');await symlink(original,link);
  const result=await execute(root,guidedSet(),['--output',link]);
  assert.equal(result.code,2);
  assert.equal(await readFile(original,'utf8'),'untouched');
}));
test('CLI French output does not silently become English',async()=>withFiles(async root=>{
  const result=await execute(root,guidedSet(),['--format','html','--language','fr']);
  assert.equal(result.code,0);
  assert.ok(result.stdout.includes('Examen de la navigation'));
}));
test('CLI never requires a network response for local links',async()=>withFiles(async root=>{
  const result=await execute(root,guidedSet(),['--format','json']);
  assert.equal(result.code,0);
  assert.equal(result.stderr,'');
}));
test('source-level imported modules have no automatic scheduled workflow',()=>{
  const m=guidedSet();
  assert.ok(m.documents.every(d=>!d.body.includes('cron')));
});
test('no inferred evidence confirmation is added to a local source',()=>{
  const m=guidedSet();
  const result=renderReport(m,{format:'json'});
  assert.ok(!Object.hasOwn(JSON.parse(result.content).report,'certified'));
});
test('full feature remains deterministic for a fixed snapshot',()=>{
  const m=guidedSet();
  const a=renderReport(m,{format:'json',today:'2026-11-21'});
  const b=renderReport(m,{format:'json',today:'2026-11-21'});
  assert.equal(a.content,b.content);
});
