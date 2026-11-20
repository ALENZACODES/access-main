/** Integration checks for the flat release tooling and its public entrypoint. */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import * as api from './snapshot-a11y-index.mjs';
import { TODAY, control, capture, document, provenance } from './snapshot-a11y-fixtures.mjs';
const directory=dirname(fileURLToPath(import.meta.url));
const implementations=['snapshot-a11y-contract.mjs','snapshot-a11y-analysis.mjs','snapshot-a11y-report.mjs','snapshot-a11y-cli.mjs','snapshot-a11y-index.mjs'];
const scripts=async()=>Promise.all(implementations.map(file=>readFile(join(directory,file),'utf8')));

test('barrel exports the versioned public contract',()=>{
 assert.equal(api.SNAPSHOT_VERSION,1);
 assert.equal(typeof api.inspectSnapshots,'function');
 assert.equal(typeof api.parseSnapshots,'function');
 assert.equal(typeof api.serializeSnapshots,'function');
});
test('barrel exports control and capture review methods',()=>{
 for(const key of ['controlReview','captureReview','analyzeSnapshots','languageParity','coverageMatrix','compareReviews'])assert.equal(typeof api[key],'function',key);
});
test('barrel exports all four report formats',()=>{
 for(const key of ['exportCsv','exportHtml','exportJson','exportText','byFormat'])assert.equal(typeof api[key],'function',key);
});
test('barrel exports manual CLI entrypoint',()=>{
 assert.equal(typeof api.parseCliArgs,'function');
 assert.equal(typeof api.runSnapshotCli,'function');
});
test('all implementation modules exist and contain real source',async()=>{
 const source=await scripts();
 assert.equal(source.length,implementations.length);
 assert.ok(source.every(text=>text.length>100));
});
test('source contains no literal nonbreaking spaces',async()=>{
 for(const [i,source] of (await scripts()).entries()){
  assert.equal(source.includes('\u00a0'),false,implementations[i]);
  assert.equal(source.includes('\u202f'),false,implementations[i]);
 }
});
test('source uses escape sequences for French punctuation',async()=>{
 const text=await readFile(join(directory,'snapshot-a11y-report.mjs'),'utf8');
 assert.ok(text.includes('\\u00a0'));
});
test('source avoids regular-expression character-control ranges',async()=>{
 for(const source of await scripts()){
  assert.equal(source.includes('\\x00-\\x1f'),false);
  assert.equal(source.includes('\\u0000-\\u001f'),false);
 }
});
test('source includes no scheduled execution APIs',async()=>{
 for(const source of await scripts()){
  for(const expression of ['setInterval(', 'setTimeout(', 'cron.schedule(', 'scheduleJob(', 'fetch(', 'XMLHttpRequest('])assert.equal(source.includes(expression),false,expression);
 }
});
test('user-facing copy does not make outside-entity endorsement claims',()=>{
 const values=[...Object.values(api.copy('en')),...Object.values(api.copy('fr'))];
 for(const phrase of ['partnership','guarantee','real-time','endorsed by'])assert.ok(values.every(x=>!x.toLowerCase().includes(phrase)));
});
test('source contains no prohibited short organisation marker',async()=>{
 const marker=String.fromCharCode(83,67,73,79).toLowerCase();
 for(const text of await scripts())assert.equal(text.toLowerCase().includes(marker),false);
});
test('reports preserve UNKNOWN for incomplete evidence',()=>{
 const partial=document(capture('x',{controls:[control('submit',{focusVisible:'UNKNOWN'})],offlineShell:'UNKNOWN'}));
 const output=api.exportText(partial,'fr',{today:TODAY});
 assert.equal(output.ok,true);
 assert.ok(output.text.includes('UNKNOWN'));
});
test('release comparison refuses data without valid provenance',()=>{
 const before=document();
 const after=document(capture('x',{provenance:{...provenance(),source:''}}));
 const result=api.compareReviews(before,after,{today:TODAY});
 assert.equal(result.ok,false);
 assert.equal(result.changes.length,0);
});
test('rule set includes touch, focus, keyboard, speech and offline',()=>{
 for(const name of ['TARGET_44','FOCUS_VISIBLE','KEYBOARD_ACTIVATION','ANNOUNCEMENTS','OFFLINE_SHELL'])assert.ok(api.RULES.includes(name));
});
test('at least 44px dimensions count as pass',()=>{
 assert.equal(api.metricState(44),'PASS');
 assert.equal(api.metricState(43),'FAIL');
});
test('unmeasured dimensions never become passing values',()=>{
 assert.equal(api.metricState('UNKNOWN'),'UNKNOWN');
});
test('missing EN/FR capture is not inferred',()=>{
 const result=api.languageParity(document(),{today:TODAY});
 assert.equal(result.pairs[0].status,'UNKNOWN');
});
test('invalid input cannot generate published report',()=>{
 const result=api.byFormat({version:1,captures:[capture('x',{provenance:null})]},'html');
 assert.equal(result.ok,false);assert.equal(result.text,null);
});
test('manual command remains the only execution entrypoint',()=>{
 assert.ok(api.COMMANDS.includes('review'));
 assert.ok(!api.COMMANDS.includes('schedule'));
 assert.ok(!api.COMMANDS.includes('monitor'));
});
test('HTML report includes an accessible heading and table caption',()=>{
 const report=api.exportHtml(document(),'fr',{today:TODAY});
 assert.ok(report.text.includes('<h1>'));
 assert.ok(report.text.includes('<caption>'));
});
test('report uses localized headers and original source metadata',()=>{
 const report=api.exportCsv(document(),'fr',{today:TODAY});
 assert.ok(report.text.includes('Niveau d’examen'));
 assert.ok(report.text.includes(provenance().source));
});
test('JSON report carries deterministic fingerprint',()=>{
 const a=JSON.parse(api.exportJson(document()).text);
 const b=JSON.parse(api.exportJson(document()).text);
 assert.equal(a.fingerprint,b.fingerprint);
 assert.equal(a.fingerprint.length,64);
});
test('source modules do not depend on any unmerged feature',async()=>{
 const source=await scripts();
 const imports=source.flatMap(text=>[...text.matchAll(/from\s+['"](\.[^'"]+)['"]/gu)].map(x=>x[1]));
 assert.ok(imports.every(path=>path.startsWith('./snapshot-a11y-')),JSON.stringify(imports));
});
