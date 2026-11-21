import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseArgs, safeOutput, run } from './offline-dossier-cli.mjs';
import { sha256 } from './offline-dossier-audit.mjs';
import { exampleDossier } from './offline-dossier-contract.mjs';
const day='2026-11-20';
function capture(){const output={stdout:'',stderr:''};return {output,streams:{stdout:{write:text=>{output.stdout+=text;}},stderr:{write:text=>{output.stderr+=text;}}}};}
async function withFixture(callback){const root=await mkdtemp(join(tmpdir(),'p19-dossier-cli-'));try{return await callback(root);}finally{await rm(root,{recursive:true,force:true});}}
const doc=()=>exampleDossier(sha256(Buffer.from('sample')),6);
test('argument parser requires manifest and root',()=>{
  for(const argv of [[],['--manifest','a'],['--root','b'],['--manifest','a','--root'],['--manifest','a','--root','b','--format','pdf']]) assert.equal(parseArgs(argv).ok,false);
});
test('argument parser rejects unknown and duplicate flags',()=>{
  for(const argv of [['--manifest','a','--root','b','--unexpected','x'],['--manifest','a','--manifest','c','--root','b']]) assert.equal(parseArgs(argv).ok,false);
});
test('argument parser validates date language and concurrency',()=>{
  for(const pair of [['--today','tomorrow'],['--language','de'],['--concurrency','0'],['--concurrency','17'],['--concurrency','1.5']]) assert.equal(parseArgs(['--manifest','a','--root','b',...pair]).ok,false);
  assert.equal(parseArgs(['--manifest','a','--root','b','--concurrency','16','--language','fr']).ok,true);
});
test('safeOutput creates only a new file and mode is private',async()=>withFixture(async root=>{
  const out=join(root,'out.html');
  await safeOutput(out,'hello');
  assert.equal(await readFile(out,'utf8'),'hello');
  await assert.rejects(safeOutput(out,'replacement'),{code:'EEXIST'});
  assert.equal(await readFile(out,'utf8'),'hello');
}));
test('safeOutput refuses symlink parent',async()=>withFixture(async root=>{
  const child=join(root,'real');
  const {mkdir}=await import('node:fs/promises');
  await mkdir(child);
  const link=join(root,'link');await symlink(child,link);
  await assert.rejects(safeOutput(join(link,'output'),'x'),/UNSAFE_OUTPUT/);
}));
test('CLI produces English text only on explicit invocation',async()=>withFixture(async root=>{
  const manifest=join(root,'manifest.json');
  await writeFile(join(root,'sample.txt'),'sample');
  await writeFile(manifest,JSON.stringify(doc()));
  const c=capture();
  assert.equal(await run(['--manifest',manifest,'--root',root,'--today',day],c.streams),0);
  assert.match(c.output.stdout,/Digest matches/u);
  assert.match(c.output.stdout,/UNKNOWN/u);
  assert.equal(c.output.stderr,'');
}));
test('CLI creates French HTML report with no external dependencies',async()=>withFixture(async root=>{
  const manifest=join(root,'manifest.json'),out=join(root,'report.html');
  await writeFile(join(root,'sample.txt'),'sample');
  await writeFile(manifest,JSON.stringify(doc()));
  const c=capture();
  const code=await run(['--manifest',manifest,'--root',root,'--today',day,'--language','fr','--format','html','--output',out],c.streams);
  assert.equal(code,0);
  const html=await readFile(out,'utf8');
  assert.match(html,/lang="fr"/u);
  assert.match(html,/href="#main"/u);
  assert.match(html,/CC0-1.0/u);
  assert.doesNotMatch(html,/https?:\/\//u);
}));
test('CLI mismatch emits report and nonzero code',async()=>withFixture(async root=>{
  const manifest=join(root,'manifest.json');
  await writeFile(join(root,'sample.txt'),'changed');
  await writeFile(manifest,JSON.stringify(doc()));
  const c=capture();
  assert.equal(await run(['--manifest',manifest,'--root',root,'--today',day],c.streams),1);
  assert.match(c.output.stdout,/SIZE_MISMATCH/u);
}));
test('CLI invalid manifest does not output a review',async()=>withFixture(async root=>{
  const manifest=join(root,'manifest.json');
  await writeFile(manifest,'{broken');
  const c=capture();
  assert.equal(await run(['--manifest',manifest,'--root',root,'--today',day],c.streams),2);
  assert.match(c.output.stderr,/INVALID_MANIFEST/u);
  assert.equal(c.output.stdout,'');
}));
test('CLI missing manifest fails closed',async()=>withFixture(async root=>{
  const c=capture();
  assert.equal(await run(['--manifest',join(root,'missing.json'),'--root',root,'--today',day],c.streams),2);
  assert.match(c.output.stderr,/DOSSIER_ERROR/u);
}));
test('CLI will not overwrite existing export',async()=>withFixture(async root=>{
  const manifest=join(root,'manifest.json'),out=join(root,'old.txt');
  await writeFile(join(root,'sample.txt'),'sample');
  await writeFile(manifest,JSON.stringify(doc()));
  await writeFile(out,'KEEP');
  const c=capture();
  assert.equal(await run(['--manifest',manifest,'--root',root,'--today',day,'--output',out],c.streams),2);
  assert.equal(await readFile(out,'utf8'),'KEEP');
}));
test('CLI CSV emits uppercase UNKNOWN',async()=>withFixture(async root=>{
  const manifest=join(root,'manifest.json');
  await writeFile(join(root,'sample.txt'),'sample');
  await writeFile(manifest,JSON.stringify(doc()));
  const c=capture();
  assert.equal(await run(['--manifest',manifest,'--root',root,'--today',day,'--format','csv'],c.streams),0);
  assert.match(c.output.stdout,/"UNKNOWN"/u);
  assert.doesNotMatch(c.output.stdout,/"unknown"/u);
}));
test('CLI writes no output on argument failure',async()=>{
  const c=capture();
  assert.equal(await run([],c.streams),2);
  assert.equal(c.output.stdout,'');
});
