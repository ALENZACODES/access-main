import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm, symlink, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sha256, equalDigests, readSafeFile, checkedRoot, inspectItem, auditDossier,
  compareAudits, summarizeResults, readDossierManifest } from './offline-dossier-audit.mjs';
import { exampleDossier } from './offline-dossier-contract.mjs';
const day='2026-11-20';
async function fixture(fn) {
  const root=await mkdtemp(join(tmpdir(),'p19-dossier-'));
  try { return await fn(root); } finally { await rm(root,{recursive:true,force:true}); }
}
const base=()=>exampleDossier(sha256(Buffer.from('sample')),6);
test('sha256 is deterministic and exact', () => {
  const a=sha256(Buffer.from('data'));
  assert.match(a,/^[a-f0-9]{64}$/u);
  assert.equal(a,sha256(Buffer.from('data')));
  assert.notEqual(a,sha256(Buffer.from('different')));
});
test('hash comparisons require exact lower-case digests', () => {
  const hash=sha256(Buffer.from('x'));
  assert.equal(equalDigests(hash,hash),true);
  assert.equal(equalDigests(hash,sha256(Buffer.from('y'))),false);
  assert.equal(equalDigests(hash,hash.toUpperCase()),false);
  assert.equal(equalDigests(hash,'bad'),false);
});
test('readSafeFile accepts nested regular file', async()=>fixture(async root=>{
  await mkdir(join(root,'evidence'));
  await writeFile(join(root,'evidence','a.txt'),'sample');
  assert.equal((await readSafeFile(root,'evidence/a.txt')).toString(),'sample');
}));
test('symlinked intermediate directory fails closed', async()=>fixture(async root=>{
  await mkdir(join(root,'real'));
  await writeFile(join(root,'real','a.txt'),'sample');
  await symlink(join(root,'real'),join(root,'linked'));
  await assert.rejects(readSafeFile(root,'linked/a.txt'),/UNSAFE_FILE/);
}));
test('symlinked final file fails closed', async()=>fixture(async root=>{
  await writeFile(join(root,'actual.txt'),'sample');
  await symlink(join(root,'actual.txt'),join(root,'linked.txt'));
  await assert.rejects(readSafeFile(root,'linked.txt'),/UNSAFE_FILE/);
}));
test('symlinked root fails closed', async()=>fixture(async root=>{
  await mkdir(join(root,'real'));
  await symlink(join(root,'real'),join(root,'link'));
  await assert.rejects(checkedRoot(join(root,'link')), /INVALID_ROOT/);
}));
test('path traversal is refused', async()=>fixture(async root=>{
  await assert.rejects(readSafeFile(root,'../secret.txt'),/UNSAFE_PATH/);
  await assert.rejects(readSafeFile(root,'/etc/passwd'),/UNSAFE_PATH/);
}));
test('oversized file is rejected before reading', async()=>fixture(async root=>{
  await writeFile(join(root,'large.txt'),'123456');
  await assert.rejects(readSafeFile(root,'large.txt',5),/UNSAFE_FILE/);
}));
test('missing files are reported, not silently accepted', async()=>fixture(async root=>{
  const result=await inspectItem(root,base().items[0]);
  assert.equal(result.status,'MISSING');
  assert.equal(result.actualBytes,null);
  assert.equal(result.actualSha256,null);
}));
test('match preserves provenance and UNKNOWN state', async()=>fixture(async root=>{
  await writeFile(join(root,'sample.txt'),'sample');
  const result=await inspectItem(root,base().items[0]);
  assert.equal(result.status,'MATCH');
  assert.equal(result.item.status,'unknown');
  assert.equal(result.item.source,'Fictional example supplied for testing only');
}));
test('modified bytes of same length produce HASH_MISMATCH', async()=>fixture(async root=>{
  await writeFile(join(root,'sample.txt'),'samply');
  const result=await inspectItem(root,base().items[0]);
  assert.equal(result.status,'HASH_MISMATCH');
}));
test('modified length produces SIZE_MISMATCH', async()=>fixture(async root=>{
  await writeFile(join(root,'sample.txt'),'longer data');
  assert.equal((await inspectItem(root,base().items[0])).status,'SIZE_MISMATCH');
}));
test('symlinks appear as UNSAFE, not matched', async()=>fixture(async root=>{
  await writeFile(join(root,'source.txt'),'sample');
  await symlink(join(root,'source.txt'),join(root,'sample.txt'));
  assert.equal((await inspectItem(root,base().items[0])).status,'UNSAFE');
}));
test('auditing empty inventory gives honest complete result', async()=>fixture(async root=>{
  const result=await auditDossier({schemaVersion:1,items:[]},root);
  assert.equal(result.complete,true);
  assert.equal(result.counts.total,0);
  assert.equal(result.counts.MATCH,0);
}));
test('multiple workers preserve input ordering', async()=>fixture(async root=>{
  const items=[];
  for(let index=0;index<12;index++){
    const id=`item-${index}`;
    await writeFile(join(root,`${id}.txt`),id);
    items.push({...base().items[0],id,path:`${id}.txt`,sha256:sha256(Buffer.from(id)),bytes:Buffer.byteLength(id)});
  }
  const result=await auditDossier({schemaVersion:1,items},root,{concurrency:5});
  assert.equal(result.complete,true);
  assert.deepEqual(result.results.map(x=>x.id),items.map(x=>x.id));
  assert.equal(result.counts.unknownEvidence,12);
}));
test('concurrency is bounded', async()=>fixture(async root=>{
  for(const concurrency of [-1,0,1.5,17,NaN]) await assert.rejects(auditDossier(base(),root,{concurrency}),/INVALID_CONCURRENCY/);
}));
test('category groups do not imply accessibility claims', () => {
  const item={...base().items[0]};
  const summary=summarizeResults([{id:'a',status:'MATCH',item},{id:'b',status:'MISSING',item}]);
  assert.deepEqual(summary.groups.entrance,{total:2,match:1,unknownEvidence:2});
});
test('diff distinguishes added removed changed and unchanged', () => {
  const item={...base().items[0]};
  const make=(id,status)=>({id,status,item,expectedSha256:item.sha256,actualSha256:item.sha256,expectedBytes:6,actualBytes:6});
  const previous={results:[make('a','MATCH'),make('b','MATCH'),make('c','MISSING')]};
  const current={results:[make('a','MATCH'),make('b','MISSING'),make('d','MATCH')]};
  const delta=compareAudits(previous,current);
  assert.deepEqual(delta.counts,{added:1,removed:1,changed:1,unchanged:1});
  assert.deepEqual(delta.changes.map(x=>x.id),['a','b','c','d']);
});
test('readDossierManifest rejects symlink and large manifest', async()=>fixture(async root=>{
  const manifest=join(root,'manifest.json'), link=join(root,'link.json');
  await writeFile(manifest,JSON.stringify(base()));
  await symlink(manifest,link);
  await assert.rejects(readDossierManifest(link,{today:day}),/UNSAFE_MANIFEST/);
  assert.equal((await readDossierManifest(manifest,{today:day})).ok,true);
}));
test('untrusted manifest content does not escape the root', async()=>fixture(async root=>{
  const doc=base();doc.items[0].path='../sample.txt';
  const manifest=join(root,'input.json');
  await writeFile(manifest,JSON.stringify(doc));
  const parsed=await readDossierManifest(manifest,{today:day});
  assert.equal(parsed.ok,false);
  assert.ok(parsed.issues.some(x=>x.code==='UNSAFE_PATH'));
}));
test('reading an explicit manifest does not mutate its bytes', async()=>fixture(async root=>{
  const path=join(root,'manifest.json'), original=JSON.stringify(base());
  await writeFile(path,original);
  await readDossierManifest(path,{today:day});
  assert.equal(await readFile(path,'utf8'),original);
}));
