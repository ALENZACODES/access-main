import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sha256, summarizeResults, compareAudits } from './offline-dossier-audit.mjs';
import { exampleDossier } from './offline-dossier-contract.mjs';
import { escapeHtml, safeCsv, punctuation, viewRows, renderDossierAudit } from './offline-dossier-report.mjs';
const day='2026-11-20';
function build(status='MATCH', updates={}) {
  const item={...exampleDossier(sha256(Buffer.from('sample')),6).items[0],...updates};
  const row={id:item.id,item,status,expectedBytes:6,actualBytes:6,expectedSha256:item.sha256,actualSha256:item.sha256};
  const result={schemaVersion:1,results:[row],...summarizeResults([row]),complete:status==='MATCH'};
  return result;
}
test('escaping encodes untrusted HTML', () => {
  assert.equal(escapeHtml(`&<>"'`),'&amp;&lt;&gt;&quot;&#39;');
});
test('safe CSV quotes commas and embedded quotes', () => {
  assert.equal(safeCsv('a,"b"'),'"a,""b"""');
  assert.equal(safeCsv('plain'),'"plain"');
});
test('safe CSV guards formula prefixes including leading spaces', () => {
  for(const value of ['=1+1','+1','-3','@SUM(A1)','  =1+1']) assert.match(safeCsv(value),/^"'/u);
  assert.equal(safeCsv('ordinary'),'"ordinary"');
});
test('unknown stays exact uppercase token in all user-facing rows', () => {
  assert.equal(viewRows(build())[0].evidenceStatus,'UNKNOWN');
  assert.equal(viewRows(build())[0].verificationTier,'UNKNOWN');
});
test('French punctuation uses required nonbreaking spaces', () => {
  assert.equal(punctuation('fr').colon,'\u00a0:');
  assert.equal(punctuation('fr').semicolon,'\u202f;');
  assert.equal(punctuation('en').semicolon,';');
});
test('HTML has en and fr language tags and skip navigation', () => {
  for(const language of ['en','fr']) {
    const out=renderDossierAudit(build(),{language,today:day});
    assert.equal(out.ok,true);
    assert.match(out.text,new RegExp(`lang="${language}"`));
    assert.match(out.text,/href="#main"/u);
    assert.match(out.text,/focus-visible/u);
    assert.match(out.text,/min-height:44px/u);
  }
});
test('HTML escapes hostile provenance',()=>{
  const html=renderDossierAudit(build('MATCH',{source:'<img src=x onerror=bad()>',note:'<script>'})).text;
  assert.doesNotMatch(html,/<img|<script>/u);
  assert.match(html,/&lt;img/u);
});
test('HTML does not claim physical accessibility based on digests',()=>{
  const output=renderDossierAudit(build()).text;
  assert.match(output,/not accessibility conditions/u);
  assert.doesNotMatch(output,/guaranteed accessible|verified accessible/u);
});
test('French caution is explicit about evidence limits',()=>{
  const text=renderDossierAudit(build(),{language:'fr',format:'text'}).text;
  assert.match(text,/pas les conditions d’accessibilité/u);
  assert.match(text,/\u202f; /u);
  assert.match(text,/\u00a0: /u);
});
test('no raw unknown status is emitted in CSV',()=>{
  const text=renderDossierAudit(build(),{format:'csv'}).text;
  assert.match(text,/"UNKNOWN"/u);
  assert.doesNotMatch(text,/"unknown"/u);
});
test('CSV retains provenance on every record',()=>{
  const text=renderDossierAudit(build(),{format:'csv'}).text;
  for(const value of ['CC0-1.0','2026-11-20','Fictional example supplied for testing only']) assert.ok(text.includes(value));
});
test('CSV with malicious source is protected',()=>{
  const text=renderDossierAudit(build('MATCH',{source:'=2+2'}),{format:'csv'}).text;
  assert.match(text,/"'=2\+2"/u);
});
test('JSON output is structured and captures comparison',()=>{
  const a=build(),b=build('MISSING');
  const parsed=JSON.parse(renderDossierAudit(b,{before:a,format:'json'}).text);
  assert.equal(parsed.comparison.counts.changed,1);
  assert.equal(parsed.rows[0].evidenceStatus,'UNKNOWN');
  assert.equal(parsed.complete,false);
});
test('text has all fields and does not hide UNKNOWN',()=>{
  const output=renderDossierAudit(build('MISSING'),{format:'text'}).text;
  for(const value of ['UNKNOWN','MISSING','CC0-1.0','2026-11-20','fictional-location']) assert.ok(output.includes(value), value);
});
test('empty audit is explicitly described in HTML',()=>{
  const result={results:[],...summarizeResults([]),complete:true};
  const out=renderDossierAudit(result).text;
  assert.match(out,/No evidence files were listed/u);
});
test('invalid report language and formats fail',()=>{
  assert.equal(renderDossierAudit(build(),{language:'de'}).ok,false);
  assert.equal(renderDossierAudit(build(),{format:'pdf'}).ok,false);
});
test('all formats include provenance records',()=>{
  for(const format of ['json','csv','text','html']){
    const out=renderDossierAudit(build(),{format});
    assert.equal(out.ok,true);
    assert.match(out.text,/CC0-1.0/u);
    assert.match(out.text,/2026-11-20/u);
  }
});
test('comparison stability is independent of input order',()=>{
  const first=build();
  const second={...first,results:[...first.results].reverse()};
  assert.equal(compareAudits(first,second).counts.unchanged,1);
});
