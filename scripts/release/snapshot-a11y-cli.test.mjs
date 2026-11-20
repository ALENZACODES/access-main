import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, writeFile, stat, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { URL } from 'node:url';
import test from 'node:test';
import { COMMANDS,FORMATS,parseCliArgs,safeOutputPath,readSnapshotFile,runSnapshotCli } from './snapshot-a11y-cli.mjs';
import { TODAY,capture,document } from './snapshot-a11y-fixtures.mjs';

async function temp(callback){
 const root=await mkdtemp(join(tmpdir(),'snapshot-a11y-'));
 try{
  await writeFile(join(root,'now.json'),JSON.stringify(document()));
  await writeFile(join(root,'previous.json'),JSON.stringify(document(capture('sample-en',{offlineShell:'UNKNOWN'}))));
  return await callback(root);
 }finally{await rm(root,{recursive:true,force:true});}
}
function io(root){const out=[],err=[];return {out,err,cwd:root,stdout:{write:v=>{out.push(v);return true;}},stderr:{write:v=>{err.push(v);return true;}}};}
const flags=(root,extra=[])=>['review','--input',join(root,'now.json'),...extra];

test('manual command vocabulary is bounded',()=>{
 assert.deepEqual(COMMANDS,['review','coverage','compare']);
 assert.deepEqual(FORMATS,['text','html','csv','json']);
});
test('review command parses explicit input',()=>{
 const x=parseCliArgs(['review','--input','now.json']);
 assert.equal(x.ok,true);assert.equal(x.args.command,'review');
 assert.equal(x.args.input,'now.json');
});
test('default command is review',()=>{
 const x=parseCliArgs(['--input','now.json']);
 assert.equal(x.ok,true);assert.equal(x.args.command,'review');
});
test('comparison requires a previous input',()=>{
 assert.equal(parseCliArgs(['compare','--input','now.json']).ok,false);
 assert.equal(parseCliArgs(['compare','--input','now.json','--previous','old.json']).ok,true);
});
test('coverage accepts input without comparison source',()=>{
 assert.equal(parseCliArgs(['coverage','--input','now.json']).ok,true);
});
test('unsupported commands fail closed',()=>{
 for(const value of ['serve','schedule','watch','loop','download',''])assert.equal(parseCliArgs([value,'--input','now.json']).ok,false,value);
});
test('unsupported locale is refused',()=>{
 assert.equal(parseCliArgs(['review','--input','a','--language','es']).ok,false);
});
test('unsupported export format is refused',()=>{
 assert.equal(parseCliArgs(['review','--input','a','--format','xlsx']).ok,false);
});
test('comparison cannot request unsupported output formats',()=>{
 assert.equal(parseCliArgs(['compare','--input','a','--previous','b','--format','json']).ok,false);
});
test('coverage cannot request unsupported output formats',()=>{
 assert.equal(parseCliArgs(['coverage','--input','a','--format','csv']).ok,false);
});
test('duplicate options are refused rather than last-write-wins',()=>{
 assert.equal(parseCliArgs(['review','--input','a','--input','b']).ok,false);
});
test('unknown option is refused',()=>{
 assert.equal(parseCliArgs(['review','--input','a','--secrets','b']).ok,false);
});
test('missing value for an option is refused',()=>{
 assert.equal(parseCliArgs(['review','--input']).ok,false);
});
test('boolean argument arrays are refused',()=>{
 assert.equal(parseCliArgs(null).ok,false);
 assert.equal(parseCliArgs('review').ok,false);
});
test('output path stays inside designated root',()=>{
 assert.equal(safeOutputPath('/tmp/work','report.txt'),resolve('/tmp/work/report.txt'));
 assert.equal(safeOutputPath('/tmp/work','nested/report.txt'),resolve('/tmp/work/nested/report.txt'));
});
test('output path rejects parent traversal',()=>{
 assert.equal(safeOutputPath('/tmp/work','../escape.txt'),null);
});
test('output path rejects root folder itself',()=>{
 assert.equal(safeOutputPath('/tmp/work','.'),null);
});
test('output path rejects blank or NUL input',()=>{
 for(const v of ['',null,undefined,'\0.txt'])assert.equal(safeOutputPath('/tmp/work',v),null);
});
test('file reader accepts synthetic source-backed fixture',async()=>{
 await temp(async root=>{
  const r=await readSnapshotFile(join(root,'now.json'),{today:TODAY});
  assert.equal(r.ok,true);assert.equal(r.value.captures.length,1);
 });
});
test('file reader rejects malformed JSON',async()=>{
 await temp(async root=>{
  await writeFile(join(root,'bad.json'),'{');
  const r=await readSnapshotFile(join(root,'bad.json'));
  assert.equal(r.ok,false);
 });
});
test('file reader refuses missing file',async()=>{
 await temp(async root=>{
  assert.equal((await readSnapshotFile(join(root,'missing.json'))).ok,false);
 });
});
test('file reader refuses a symlinked input',async()=>{
 await temp(async root=>{
  await symlink('now.json',join(root,'shortcut.json'));
  const r=await readSnapshotFile(join(root,'shortcut.json'));
  assert.equal(r.ok,false);
 });
});
test('file reader refuses symlinked parent directory',async()=>{
 await temp(async root=>{
  await mkdir(join(root,'real'));
  await writeFile(join(root,'real','a.json'),JSON.stringify(document()));
  await symlink('real',join(root,'alias'));
  assert.equal((await readSnapshotFile(join(root,'alias','a.json'))).ok,false);
 });
});
test('file reader refuses directory as input',async()=>{
 await temp(async root=>{
  assert.equal((await readSnapshotFile(root)).ok,false);
 });
});
test('file reader refuses oversized input before parsing',async()=>{
 await temp(async root=>{
  await writeFile(join(root,'oversized.json'),Buffer.alloc(8_000_010,0x20));
  assert.equal((await readSnapshotFile(join(root,'oversized.json'))).ok,false);
 });
});
test('CLI writes plain text to supplied output sink',async()=>{
 await temp(async root=>{
  const streams=io(root);
  const result=await runSnapshotCli(flags(root),streams);
  assert.equal(result,0);assert.equal(streams.err.length,0);
  assert.ok(streams.out.join('').includes('Interaction snapshot review'));
 });
});
test('CLI displays localized French text',async()=>{
 await temp(async root=>{
  const streams=io(root);
  const result=await runSnapshotCli(flags(root,['--language','fr']),streams);
  assert.equal(result,0);assert.ok(streams.out.join('').includes('Parcours\u00a0:'));
 });
});
test('CLI provides localized French HTML',async()=>{
 await temp(async root=>{
  const streams=io(root);
  const result=await runSnapshotCli(flags(root,['--format','html','--language','fr']),streams);
  assert.equal(result,0);assert.ok(streams.out.join('').includes('<html lang="fr">'));
 });
});
test('CLI provides valid JSON output',async()=>{
 await temp(async root=>{
  const streams=io(root);
  const result=await runSnapshotCli(flags(root,['--format','json']),streams);
  assert.equal(result,0);
  assert.equal(JSON.parse(streams.out.join('')).version,1);
 });
});
test('CLI exports readable CSV rows',async()=>{
 await temp(async root=>{
  const streams=io(root);
  const result=await runSnapshotCli(flags(root,['--format','csv']),streams);
  assert.equal(result,0);assert.ok(streams.out.join('').includes('"Route"'));
 });
});
test('coverage command reports missing combinations',async()=>{
 await temp(async root=>{
  const streams=io(root);
  const result=await runSnapshotCli(['coverage','--input',join(root,'now.json')],streams);
  assert.equal(result,0);assert.ok(streams.out.join('').includes('Missing observations: 5'));
 });
});
test('compare command reports changed outcomes',async()=>{
 await temp(async root=>{
  const streams=io(root);
  const result=await runSnapshotCli(['compare','--input',join(root,'now.json'),'--previous',join(root,'previous.json')],streams);
  assert.equal(result,0);
  assert.ok(streams.out.join('').includes('OUTCOME_CHANGED'));
 });
});
test('compare command refuses missing previous file',async()=>{
 await temp(async root=>{
  const streams=io(root);
  const result=await runSnapshotCli(['compare','--input',join(root,'now.json'),'--previous',join(root,'missing.json')],streams);
  assert.equal(result,2);assert.equal(streams.out.length,0);
 });
});
test('CLI refuses invalid source records and emits no raw data',async()=>{
 await temp(async root=>{
  const x=document();x.captures[0].token='private-secret';
  await writeFile(join(root,'private.json'),JSON.stringify(x));
  const streams=io(root);
  const code=await runSnapshotCli(['review','--input',join(root,'private.json')],streams);
  assert.equal(code,2);assert.equal(streams.out.length,0);
  assert.equal(streams.err.join('').includes('private-secret'),false);
 });
});
test('CLI creates an output file only when explicitly requested',async()=>{
 await temp(async root=>{
  const streams=io(root);
  const code=await runSnapshotCli(flags(root,['--output','result.txt']),streams);
  assert.equal(code,0);
  assert.ok((await readFile(join(root,'result.txt'),'utf8')).includes('Interaction snapshot review'));
 });
});
test('CLI never overwrites an existing report',async()=>{
 await temp(async root=>{
  const path=join(root,'result.txt');await writeFile(path,'preserve me');
  const streams=io(root);
  const code=await runSnapshotCli(flags(root,['--output','result.txt']),streams);
  assert.equal(code,2);assert.equal(await readFile(path,'utf8'),'preserve me');
 });
});
test('CLI writes private files with owner-only permissions',async()=>{
 await temp(async root=>{
  const streams=io(root);
  assert.equal(await runSnapshotCli(flags(root,['--output','result.txt']),streams),0);
  const st=await stat(join(root,'result.txt'));
  assert.equal(st.mode&0o077,0);
 });
});
test('CLI refuses output outside supplied directory',async()=>{
 await temp(async root=>{
  const streams=io(root);
  const code=await runSnapshotCli(flags(root,['--output','../escape.txt']),streams);
  assert.equal(code,2);
 });
});
test('CLI refuses output through symlinked parent',async()=>{
 await temp(async root=>{
  await mkdir(join(root,'real'));
  await symlink('real',join(root,'alias'));
  const streams=io(root);
  const code=await runSnapshotCli(flags(root,['--output','alias/report.txt']),streams);
  assert.equal(code,2);
 });
});
test('CLI never creates a report on bad arguments',async()=>{
 await temp(async root=>{
  const streams=io(root);
  const code=await runSnapshotCli(['review','--input',join(root,'now.json'),'--output','x','--format','unknown'],streams);
  assert.equal(code,2);
  assert.equal(streams.out.length,0);
 });
});
test('CLI accepts explicitly supplied reference day',async()=>{
 await temp(async root=>{
  const streams=io(root);
  const code=await runSnapshotCli(flags(root,['--today',TODAY]),streams);
  assert.equal(code,0);
 });
});
test('CLI rejects future retrieval compared with supplied date',async()=>{
 await temp(async root=>{
  const streams=io(root);
  const code=await runSnapshotCli(flags(root,['--today','2026-11-19']),streams);
  assert.equal(code,2);
 });
});
test('direct executable CLI reads fixture and exits zero',async()=>{
 await temp(async root=>{
  const filename=new URL('./snapshot-a11y-cli.mjs',import.meta.url).pathname;
  const out=spawnSync(process.execPath,[filename,'review','--input',join(root,'now.json')],{encoding:'utf8'});
  assert.equal(out.status,0,out.stderr);
  assert.ok(out.stdout.includes('Interaction snapshot review'));
 });
});
test('direct executable CLI rejects invalid arguments with nonzero exit',()=>{
 const filename=new URL('./snapshot-a11y-cli.mjs',import.meta.url).pathname;
 const out=spawnSync(process.execPath,[filename,'schedule'],{encoding:'utf8'});
 assert.equal(out.status,2);
});
