import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { URL } from 'node:url';
import { parseArgs, formatFindings, runCustodyCli, COMMANDS } from './artifact-custody-cli.mjs';
import * as custody from './artifact-custody-index.mjs';

const SOURCE='https://example.org/source';
const TODAY='2026-11-19';
const html='<!doctype html><html lang="en"><body>Sample</body></html>';
const opts=['--source',SOURCE,'--licence','CC0-1.0','--retrieved-on',TODAY,'--tier','0','--build-id','test-build'];
async function fixture(){
  const dir=await mkdtemp(join(tmpdir(),'custody-cli-'));
  const root=join(dir,'dist');await mkdir(root);
  await writeFile(join(root,'index.html'),html);
  return {dir,root,manifest:join(dir,'manifest.json'),output:join(dir,'report.txt')};
}
async function withFixture(run){
  const f=await fixture();
  try{return await run(f);}finally{await rm(f.dir,{recursive:true,force:true});}
}
function recorder(){
  const stdout=[];const stderr=[];
  return {stdout,stderr,io:{stdout:{write:value=>stdout.push(String(value))},
    stderr:{write:value=>stderr.push(String(value))}}};
}
async function capture(f){
  const recorderState=recorder();
  const code=await runCustodyCli(['capture','--root',f.root,...opts],recorderState.io);
  assert.equal(code,0,recorderState.stderr.join(''));
  const content=recorderState.stdout.join('');
  await writeFile(f.manifest,content);
  return content;
}

test('CLI lists four explicit operations',()=>{
  assert.deepEqual(COMMANDS,['capture','inspect','compare','check']);
});
test('CLI argument parser rejects missing operation',()=>{
  assert.equal(parseArgs([]).ok,false);
  assert.equal(parseArgs(['not-supported']).error,'COMMAND_REQUIRED');
});
test('CLI accepts a bounded capture argument set',()=>{
  const parsed=parseArgs(['capture','--root','/tmp/dist',...opts]);
  assert.equal(parsed.ok,true);
  assert.equal(parsed.args['--tier'],'0');
});
test('CLI parser refuses unrecognised switches',()=>{
  assert.equal(parseArgs(['capture','--cron','*']).error,'ARGUMENT_INVALID');
});
test('CLI parser refuses duplicate switches',()=>{
  assert.equal(parseArgs(['capture','--root','x','--root','y']).ok,false);
});
test('CLI parser refuses a missing switch value',()=>{
  assert.equal(parseArgs(['capture','--root']).ok,false);
});
test('CLI parser refuses unsupported locale values',()=>{
  assert.equal(parseArgs(['inspect','--locale','xx']).error,'LOCALE_INVALID');
});
test('CLI parser supports only known output encodings',()=>{
  assert.equal(parseArgs(['inspect','--format','pdf']).error,'FORMAT_INVALID');
});
test('CLI accepts English and French language controls',()=>{
  assert.equal(parseArgs(['inspect','--locale','en']).ok,true);
  assert.equal(parseArgs(['inspect','--locale','fr']).ok,true);
});
test('finding format excludes raw private values',()=>{
  assert.equal(formatFindings([{code:'BAD',path:'/x'}]),'BAD /x\n');
});
test('capture writes only to provided output stream by default',async()=>{
  await withFixture(async f=>{
    const state=recorder();
    const code=await runCustodyCli(['capture','--root',f.root,...opts],state.io);
    assert.equal(code,0);
    assert.ok(state.stdout.join('').includes('"buildId": "test-build"'));
    assert.equal(state.stderr.join(''),'');
  });
});
test('capture records exact hash of local HTML',async()=>{
  await withFixture(async f=>{
    const data=JSON.parse(await capture(f));
    const recorded=data.files.find(x=>x.path==='index.html');
    assert.equal(recorded.sha256,custody.sha256(html));
  });
});
test('capture records source licence and retrieval date',async()=>{
  await withFixture(async f=>{
    const data=JSON.parse(await capture(f));
    assert.equal(data.provenance.source,SOURCE);
    assert.equal(data.provenance.licence,'CC0-1.0');
    assert.equal(data.provenance.retrievedOn,TODAY);
  });
});
test('capture refuses unsafe source metadata',async()=>{
  await withFixture(async f=>{
    const state=recorder();
    const code=await runCustodyCli(['capture','--root',f.root,...opts.slice(0,0),
      '--source','http://example.org','--licence','CC0-1.0','--retrieved-on',TODAY,'--tier','0'],state.io);
    assert.equal(code,2);
    assert.ok(state.stderr.join('').includes('SOURCE_URL_UNSAFE'));
  });
});
test('capture refuses unspecified source tier',async()=>{
  await withFixture(async f=>{
    const state=recorder();
    const code=await runCustodyCli(['capture','--root',f.root,'--source',SOURCE,
      '--licence','CC0-1.0','--retrieved-on',TODAY,'--tier','UNKNOWN'],state.io);
    assert.equal(code,2);
    assert.ok(state.stderr.join('').includes('TIER_REQUIRED'));
  });
});
test('capture rejects remote script without fetching it',async()=>{
  await withFixture(async f=>{
    await writeFile(join(f.root,'index.html'),'<html><script src="https://example.org/a.js"></script></html>');
    const state=recorder();
    const code=await runCustodyCli(['capture','--root',f.root,...opts],state.io);
    assert.equal(code,2);
    assert.ok(state.stderr.join('').includes('EXTERNAL_ASSET'));
  });
});
test('capture cannot overwrite an existing output file',async()=>{
  await withFixture(async f=>{
    await writeFile(f.output,'retain this');
    const state=recorder();
    const code=await runCustodyCli(['capture','--root',f.root,...opts,'--output',f.output],state.io);
    assert.equal(code,2);
    assert.equal(await readFile(f.output,'utf8'),'retain this');
  });
});
test('capture may create a new report as an explicit output',async()=>{
  await withFixture(async f=>{
    const state=recorder();
    const code=await runCustodyCli(['capture','--root',f.root,...opts,'--output',f.output],state.io);
    assert.equal(code,0,state.stderr.join(''));
    assert.equal(state.stdout.length,0);
    assert.equal(JSON.parse(await readFile(f.output,'utf8')).version,1);
  });
});
test('inspect outputs an English text report',async()=>{
  await withFixture(async f=>{
    await capture(f);
    const state=recorder();
    const code=await runCustodyCli(['inspect','--manifest',f.manifest,'--format','text'],state.io);
    assert.equal(code,0,state.stderr.join(''));
    assert.ok(state.stdout.join('').includes('Offline artifact custody'));
  });
});
test('inspect outputs French with nonbreaking colon spaces',async()=>{
  await withFixture(async f=>{
    await capture(f);
    const state=recorder();
    const code=await runCustodyCli(['inspect','--manifest',f.manifest,'--format','text','--locale','fr'],state.io);
    assert.equal(code,0,state.stderr.join(''));
    assert.ok(state.stdout.join('').includes('Fichiers\u00A0:'));
  });
});
test('inspect supports accessible HTML output',async()=>{
  await withFixture(async f=>{
    await capture(f);
    const state=recorder();
    const code=await runCustodyCli(['inspect','--manifest',f.manifest,'--format','html','--locale','fr'],state.io);
    assert.equal(code,0);
    assert.ok(state.stdout.join('').includes('<html lang="fr">'));
  });
});
test('inspect supports CSV output',async()=>{
  await withFixture(async f=>{
    await capture(f);
    const state=recorder();
    const code=await runCustodyCli(['inspect','--manifest',f.manifest,'--format','csv'],state.io);
    assert.equal(code,0);
    assert.ok(state.stdout.join('').includes('"Paths","Kind"'));
  });
});
test('inspect refuses a missing manifest file',async()=>{
  await withFixture(async f=>{
    const state=recorder();
    const code=await runCustodyCli(['inspect','--manifest',f.manifest],state.io);
    assert.equal(code,2);
    assert.ok(state.stderr.join('').includes('MANIFEST_UNREADABLE'));
  });
});
test('inspect refuses invalid JSON with no partial output',async()=>{
  await withFixture(async f=>{
    await writeFile(f.manifest,'{');
    const state=recorder();
    const code=await runCustodyCli(['inspect','--manifest',f.manifest],state.io);
    assert.equal(code,2);
    assert.deepEqual(state.stdout,[]);
  });
});
test('compare reports changed asset hashes without modifying snapshots',async()=>{
  await withFixture(async f=>{
    const first=JSON.parse(await capture(f));
    const previous=join(f.dir,'before.json');
    await writeFile(previous,JSON.stringify(first));
    const newer=JSON.parse(JSON.stringify(first));
    newer.files[0].sha256='b'.repeat(64);
    await writeFile(f.manifest,JSON.stringify(newer));
    const state=recorder();
    const code=await runCustodyCli(['compare','--previous',previous,'--next',f.manifest],state.io);
    assert.equal(code,0);
    assert.ok(state.stdout.join('').includes('SHA256_CHANGED'));
    assert.equal(JSON.parse(await readFile(previous,'utf8')).files[0].sha256,first.files[0].sha256);
  });
});
test('compare rejects a missing earlier snapshot',async()=>{
  await withFixture(async f=>{
    await capture(f);
    const state=recorder();
    const code=await runCustodyCli(['compare','--previous','missing.json','--next',f.manifest],state.io);
    assert.equal(code,2);
    assert.ok(state.stderr.join('').includes('MANIFEST_UNREADABLE'));
  });
});
test('check accepts a byte-matching local bundle',async()=>{
  await withFixture(async f=>{
    await capture(f);
    const state=recorder();
    const code=await runCustodyCli(['check','--root',f.root,'--manifest',f.manifest],state.io);
    assert.equal(code,0);
    assert.equal(state.stdout.join(''),'PASS\n');
  });
});
test('check detects changed file bytes',async()=>{
  await withFixture(async f=>{
    await capture(f);
    await writeFile(join(f.root,'index.html'),html+'changed');
    const state=recorder();
    const code=await runCustodyCli(['check','--root',f.root,'--manifest',f.manifest],state.io);
    assert.equal(code,2);
    assert.ok(state.stderr.join('').includes('CHANGED index.html'));
  });
});
test('CLI module can run as a directly invoked Node program',async()=>{
  await withFixture(async f=>{
    const program=new URL('./artifact-custody-cli.mjs',import.meta.url).pathname;
    const result=spawnSync(process.execPath,[program,'capture','--root',f.root,...opts],
      {encoding:'utf8'});
    assert.equal(result.status,0,result.stderr);
    assert.equal(JSON.parse(result.stdout).files.length,1);
  });
});
test('CLI module returns nonzero process exit for malformed arguments',()=>{
  const program=new URL('./artifact-custody-cli.mjs',import.meta.url).pathname;
  const result=spawnSync(process.execPath,[program,'unsupported'],{encoding:'utf8'});
  assert.equal(result.status,2);
  assert.ok(result.stderr.includes('COMMAND_REQUIRED'));
});
test('barrel exports all core public functions',()=>{
  for(const name of ['validateCustody','canonicalCustody','compareCustody','parseCustody',
    'scanBundle','inspectBundleFiles','graphCustody','textCustodyReport','htmlCustodyReport']){
    assert.equal(typeof custody[name],'function',name);
  }
});
test('barrel metadata exports are finite and immutable',()=>{
  assert.equal(custody.CUSTODY_VERSION,1);
  assert.ok(Object.isFrozen(custody.CUSTODY_STATES));
});
test('barrel exposes explicit UNKNOWN token as a status',()=>{
  assert.ok(custody.CUSTODY_STATES.includes('UNKNOWN'));
  assert.ok(!custody.CUSTODY_STATES.includes('YES'));
});
test('returned manifest has no external reference bytes',async()=>{
  await withFixture(async f=>{
    const data=JSON.parse(await capture(f));
    assert.equal(Object.hasOwn(data,'token'),false);
    assert.equal(data.files[0].state,'PRESENT');
    assert.equal(data.files[0].references,undefined);
  });
});
