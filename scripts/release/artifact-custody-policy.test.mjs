import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { forbiddenOrgNeedles } from '../../packages/shared/test/forbiddenOrg.ts';
import { localeMessages, textCustodyReport, htmlCustodyReport } from './artifact-custody-report.mjs';
import { validateCustody, CUSTODY_STATES, CUSTODY_LIMITS } from './artifact-custody-core.mjs';
import { graphCustody } from './artifact-custody-links.mjs';

const root=fileURLToPath(new URL('.',import.meta.url));
const files=['artifact-custody-core.mjs','artifact-custody-scan.mjs','artifact-custody-links.mjs',
  'artifact-custody-report.mjs','artifact-custody-cli.mjs','artifact-custody-index.mjs'];
const source={source:'https://example.org/source',licence:'CC0-1.0',retrievedOn:'2026-11-19',tier:0};
const asset={path:'index.html',kind:'html',bytes:1,sha256:'a'.repeat(64),state:'PRESENT',provenance:{...source}};
const manifest=()=>({version:1,buildId:'synthetic',provenance:{...source},files:[{...asset}]});

test('all six modules are present and nonempty',()=>{
  for(const file of files){
    const text=readFileSync(join(root,file),'utf8');
    assert.ok(text.length>250,file);
  }
});
test('no source file contains forbidden organisation names',()=>{
  const needles=forbiddenOrgNeedles();
  for(const file of files){
    const text=readFileSync(join(root,file),'utf8').toLowerCase();
    for(const needle of needles){
      assert.ok(!text.includes(needle.toLowerCase()),file);
    }
  }
});
test('source contains no literal NBSP or narrow NBSP whitespace',()=>{
  for(const file of files){
    const text=readFileSync(join(root,file),'utf8');
    assert.equal(text.includes('\u00a0'),false,file);
    assert.equal(text.includes('\u202f'),false,file);
  }
});
test('source uses escaped French punctuation rather than raw invisible whitespace',()=>{
  const report=readFileSync(join(root,'artifact-custody-report.mjs'),'utf8');
  assert.ok(report.includes('\\u00A0'));
});
test('French report runtime preserves required NBSP colon spacing',()=>{
  const result=textCustodyReport(manifest(),'fr');
  assert.ok(result.includes('Fichiers\u00A0:'));
});
test('French report uses typographic apostrophe in its caution',()=>{
  assert.ok(localeMessages('fr').caution.includes('’'));
});
test('the French report never substitutes translated UNKNOWN status',()=>{
  const m=manifest();m.files[0]={...asset,state:'UNKNOWN',sha256:null};
  assert.ok(textCustodyReport(m,'fr').includes('UNKNOWN'));
  assert.equal(localeMessages('fr').unknown,'UNKNOWN');
});
test('HTML has one main landmark and a correctly announced inventory',()=>{
  const html=htmlCustodyReport(manifest(),'fr').text;
  assert.ok(html.includes('<main>'));
  assert.ok(html.includes('aria-labelledby="inventory-title"'));
  assert.ok(html.includes('<caption>'));
});
test('HTML does not attach online fonts, scripts, analytics or tracking',()=>{
  const html=htmlCustodyReport(manifest(),'en').text;
  assert.ok(!html.includes('https://fonts.'));
  assert.ok(!html.includes('<script'));
  assert.ok(!html.includes('analytics'));
  assert.ok(!html.includes('pixel.gif'));
});
test('the App makes no physical-world access claim from a matching file hash',()=>{
  const output=textCustodyReport(manifest(),'en');
  assert.ok(output.includes('does not establish accessibility'));
});
test('the manifest validates only explicit source facts',()=>{
  const result=validateCustody(manifest());
  assert.equal(result.ok,true);
  assert.equal(Object.hasOwn(result.manifest,'eligibility'),false);
});
test('no medical or benefit decision fields are accepted',()=>{
  const m=manifest();m.medication='anything';
  assert.equal(validateCustody(m).ok,false);
});
test('asset graph makes no offline-availability claim from a local link',()=>{
  const result=graphCustody(manifest());
  assert.equal(result.ok,true);
  assert.ok(Array.isArray(result.reachable));
  assert.equal(Object.hasOwn(result,'accessible'),false);
});
test('all recorded file statuses come from the declared enum',()=>{
  assert.deepEqual([...CUSTODY_STATES].sort(),['CHANGED','MISSING','PRESENT','UNKNOWN']);
});
test('UNKNOWN is never counted as a present physical asset',()=>{
  const m=manifest();m.files[0]={...asset,state:'UNKNOWN',sha256:null};
  const result=validateCustody(m);
  assert.equal(result.ok,true);
  assert.equal(result.manifest.files[0].state,'UNKNOWN');
});
test('maximum single file size remains below 50 MB',()=>{
  assert.ok(CUSTODY_LIMITS.maxFileBytes<=50_000_000);
});
test('no added scheduled workflow exists in the custody feature',()=>{
  for(const file of files){
    const content=readFileSync(join(root,file),'utf8');
    assert.equal(content.includes('cron:'),false,file);
    assert.equal(content.includes('setInterval('),false,file);
  }
});
test('feature package script exposes a manual CLI mount',()=>{
  const pkg=JSON.parse(readFileSync(join(root,'package.json'),'utf8'));
  assert.ok(pkg.scripts['audit:custody'].includes('artifact-custody-cli.mjs'));
  assert.ok(!Object.keys(pkg.scripts).some(x=>x.includes('schedule')));
});
test('existing release test glob remains intact',()=>{
  const pkg=JSON.parse(readFileSync(join(root,'package.json'),'utf8'));
  assert.equal(pkg.scripts.test,'node --test --experimental-strip-types *.test.mjs');
});
test('existing release verification command remains unchanged',()=>{
  const pkg=JSON.parse(readFileSync(join(root,'package.json'),'utf8'));
  assert.ok(pkg.scripts.verify.startsWith('npm run test &&'));
});
