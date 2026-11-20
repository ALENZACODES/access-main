import assert from 'node:assert/strict';
import test from 'node:test';
import {
  localeMessages, escapeHtml, csvCell, frenchLabel, labelLine, displayState,
  custodyReportModel, textCustodyReport, csvCustodyReport, htmlCustodyReport,
  jsonCustodyReport, textCustodyChanges,
} from './artifact-custody-report.mjs';

const digest='a'.repeat(64);
const provenance={source:'https://example.org/catalogue',licence:'CC0-1.0',retrievedOn:'2026-11-19',tier:0};
const asset=(path='index.html',extras={})=>({path,kind:path.endsWith('.html')?'html':
  path.endsWith('.css')?'style':'script',bytes:20,sha256:digest,state:'PRESENT',provenance:{...provenance},...extras});
const manifest=(files=[asset()],extra={})=>({version:1,buildId:'sample',provenance:{...provenance},files,...extra});
const asCodes=result=>result.problems.map(x=>x.code);

test('language selection defaults to English',()=>{
  assert.equal(localeMessages('unknown').title,localeMessages('en').title);
});
test('French catalogue has independent strings',()=>{
  assert.notEqual(localeMessages('fr').title,localeMessages('en').title);
  assert.equal(localeMessages('fr').unknown,'UNKNOWN');
});
test('both catalogues include source metadata captions',()=>{
  for(const locale of ['en','fr']){
    const copy=localeMessages(locale);
    for(const field of ['source','licence','retrieved','tier','files','bytes','issues']){
      assert.equal(typeof copy[field],'string',`${locale}.${field}`);
      assert.ok(copy[field].length>0);
    }
  }
});
test('HTML escaping prevents text nodes becoming tags',()=>{
  assert.equal(escapeHtml('<script>'), '&lt;script&gt;');
  assert.equal(escapeHtml('A&B'),'A&amp;B');
});
test('HTML escaping handles attribute quotes',()=>{
  assert.equal(escapeHtml('"hello"'), '&quot;hello&quot;');
  assert.equal(escapeHtml("'hello'"), '&#39;hello&#39;');
});
test('HTML escaping does not corrupt Unicode French',()=>{
  assert.equal(escapeHtml('L’App'), 'L’App');
  assert.equal(escapeHtml('«\u202Ftexte\u202F»'),'«\u202Ftexte\u202F»');
});
test('CSV always quotes text even when no comma is present',()=>{
  assert.equal(csvCell('hello'),'"hello"');
});
test('CSV escapes embedded quotation marks',()=>{
  assert.equal(csvCell('"Hello"'),'"""Hello"""');
});
test('CSV preserves line content with one normalized line break',()=>{
  assert.equal(csvCell('a\r\nb'),'"a\nb"');
});
test('CSV neutralises formula-leading equals',()=>{
  assert.equal(csvCell('=1+1'),'"\'=1+1"');
});
test('CSV neutralises plus, minus and at-sign cells',()=>{
  for(const content of ['+SUM(A1:A2)','-1+2','@IMPORT','  =HYPERLINK()']){
    assert.ok(csvCell(content).includes("'"),content);
  }
});
test('CSV does not mangle ordinary URLs',()=>{
  assert.equal(csvCell('https://example.org'),'"https://example.org"');
});
test('CSV does not alter non-leading minus characters',()=>{
  assert.equal(csvCell('source-1'),'"source-1"');
});
test('French label requires a nonbreaking space before colon',()=>{
  assert.equal(frenchLabel('Source'),'Source\u00A0:');
});
test('French report lines contain nonbreaking colon spacing',()=>{
  assert.equal(labelLine('Fichiers','2','fr'),'Fichiers\u00A0: 2');
});
test('English report lines retain ordinary colon spacing',()=>{
  assert.equal(labelLine('Files','2','en'),'Files: 2');
});
test('state display is exact and never inferred from absent data',()=>{
  assert.equal(displayState(undefined),'UNKNOWN');
  assert.equal(displayState(null),'UNKNOWN');
  assert.equal(displayState('UNKNOWN'),'UNKNOWN');
  assert.equal(displayState('PRESENT'),'PRESENT');
});
test('valid manifest produces counts and source fields',()=>{
  const result=custodyReportModel(manifest());
  assert.equal(result.ok,true);
  assert.equal(result.summary.count,1);
  assert.equal(result.provenance.licence,'CC0-1.0');
});
test('file inventory is sorted regardless of insertion order',()=>{
  const result=custodyReportModel(manifest([asset('z.js'),asset('index.html'),asset('a.css')]));
  assert.deepEqual(result.rows.map(x=>x.path),['a.css','index.html','z.js']);
});
test('report model retains digest without exposing file contents',()=>{
  const result=custodyReportModel(manifest());
  assert.equal(result.rows[0].sha256,digest);
  assert.equal(Object.hasOwn(result.rows[0],'contents'),false);
});
test('invalid provenance generates issues and no report rows',()=>{
  const bad=manifest(undefined,{provenance:{...provenance,licence:'private'}});
  const result=custodyReportModel(bad);
  assert.equal(result.ok,false);
  assert.equal(result.summary,null);
  assert.deepEqual(result.rows,[]);
});
test('invalid state cannot produce affirmative statistics',()=>{
  const bad=manifest([asset('index.html',{state:'YES'})]);
  const result=custodyReportModel(bad);
  assert.equal(result.ok,false);
  assert.equal(result.summary,null);
});
test('summary preserves explicit UNKNOWN files',()=>{
  const result=custodyReportModel(manifest([asset('index.html',{state:'UNKNOWN',sha256:null})]));
  assert.equal(result.ok,true);
  assert.equal(result.summary.counts.UNKNOWN,1);
  assert.equal(result.rows[0].state,'UNKNOWN');
});
test('report counts missing graph references as structural issues',()=>{
  const result=custodyReportModel(manifest([asset('index.html',{references:['not-found.css']})]));
  assert.equal(result.ok,false);
  assert.ok(asCodes(result).includes('REFERENCE_MISSING'));
  assert.equal(result.summary.missing,1);
});
test('English text report includes caution about physical access',()=>{
  const output=textCustodyReport(manifest(),'en');
  assert.ok(output.includes(localeMessages('en').caution));
  assert.ok(output.includes('Files: 1'));
});
test('French text report displays mandatory provenance',()=>{
  const output=textCustodyReport(manifest(),'fr');
  assert.ok(output.includes('Fichiers\u00A0: 1'));
  assert.ok(output.includes('Consulté\u00A0: 2026-11-19'));
  assert.ok(output.includes('CC0-1.0'));
});
test('text report does not emit guessed accessibility states',()=>{
  const output=textCustodyReport(manifest([asset('index.html',{state:'UNKNOWN',sha256:null})]),'fr');
  assert.ok(output.includes('UNKNOWN'));
  assert.equal(output.includes('| YES |'),false);
});
test('text report is stable across file permutations',()=>{
  const a=manifest([asset('index.html'),asset('a.js')]);
  const b=manifest([asset('a.js'),asset('index.html')]);
  assert.equal(textCustodyReport(a),textCustodyReport(b));
});
test('invalid text report includes only issue codes, never raw secrets',()=>{
  const bad=manifest();bad.token='sensitive-private-fixture';
  const text=textCustodyReport(bad);
  assert.ok(text.includes('PRIVATE_FIELD'));
  assert.equal(text.includes('sensitive-private-fixture'),false);
});
test('CSV inventory uses deterministic headers',()=>{
  const result=csvCustodyReport(manifest());
  assert.equal(result.ok,true);
  assert.ok(result.text.startsWith('"Paths","Kind"'));
});
test('French CSV uses translated captions',()=>{
  const result=csvCustodyReport(manifest(),'fr');
  assert.equal(result.ok,true);
  assert.ok(result.text.startsWith('"Chemins","Kind"'));
});
test('CSV uses CRLF records and includes SHA-256',()=>{
  const result=csvCustodyReport(manifest());
  assert.ok(result.text.includes('\r\n'));
  assert.ok(result.text.includes(digest));
});
test('CSV invalid manifest returns no partial text',()=>{
  const result=csvCustodyReport(manifest(undefined,{buildId:'../unsafe'}));
  assert.equal(result.ok,false);
  assert.equal(result.text,null);
});
test('HTML export sets French document language',()=>{
  const result=htmlCustodyReport(manifest(),'fr');
  assert.equal(result.ok,true);
  assert.ok(result.text.includes('<html lang="fr">'));
});
test('HTML export contains one document main landmark',()=>{
  const html=htmlCustodyReport(manifest()).text;
  assert.equal((html.match(/<main>/gu)??[]).length,1);
  assert.equal((html.match(/<\/main>/gu)??[]).length,1);
});
test('HTML uses table headers with explicit scope',()=>{
  const html=htmlCustodyReport(manifest()).text;
  assert.ok(html.includes('<th scope="col">'));
  assert.ok(html.includes('<th scope="row">'));
});
test('HTML renders table caption for assistive technology',()=>{
  const html=htmlCustodyReport(manifest()).text;
  assert.ok(html.includes('<caption>'));
  assert.ok(html.includes('aria-labelledby="inventory-title"'));
});
test('HTML never embeds external scripts or images',()=>{
  const html=htmlCustodyReport(manifest()).text;
  assert.equal(html.includes('<script'),false);
  assert.equal(html.includes('<img'),false);
});
test('HTML has visible focus rule even though report has no action buttons',()=>{
  assert.ok(htmlCustodyReport(manifest()).text.includes(':focus-visible'));
});
test('HTML escapes source paths before rendering',()=>{
  const html=htmlCustodyReport(manifest()).text;
  assert.ok(html.includes('index.html'));
  assert.ok(!html.includes('<script>'));
});
test('HTML renders imported source content only after successful validation',()=>{
  const bad=manifest([asset('index.html',{sha256:'invalid'})]);
  const result=htmlCustodyReport(bad);
  assert.equal(result.ok,false);
  assert.ok(result.text.includes('DIGEST_REQUIRED'));
});
test('JSON export contains provenance and deterministic digest',()=>{
  const result=jsonCustodyReport(manifest());
  assert.equal(result.ok,true);
  const data=JSON.parse(result.text);
  assert.equal(data.provenance.source,provenance.source);
  assert.ok(data.fingerprint.startsWith('sha256:'));
});
test('JSON export has no personal information fields',()=>{
  const data=JSON.parse(jsonCustodyReport(manifest()).text);
  assert.equal(Object.hasOwn(data,'email'),false);
  assert.equal(Object.hasOwn(data,'user'),false);
});
test('JSON export respects sorted canonical file ordering',()=>{
  const data=JSON.parse(jsonCustodyReport(manifest([asset('z.js'),asset('a.js')])).text);
  assert.deepEqual(data.files.map(x=>x.path),['a.js','z.js']);
});
test('JSON export fails closed for missing licence',()=>{
  const bad=manifest(undefined,{provenance:{...provenance,licence:''}});
  assert.equal(jsonCustodyReport(bad).text,null);
});
test('comparison report identifies a concrete added asset',()=>{
  const report=textCustodyChanges(manifest(),manifest([asset('index.html'),asset('a.js')]));
  assert.ok(report.includes('ADDED | a.js'));
});
test('comparison report preserves UNKNOWN caution in French',()=>{
  const first=manifest([asset('index.html',{state:'UNKNOWN',sha256:null})]);
  const next=manifest();
  const report=textCustodyChanges(first,next,'fr');
  assert.ok(report.includes(localeMessages('fr').caution));
  assert.ok(report.includes('STATE_CHANGED'));
});
test('invalid comparison cannot present a seemingly clean release',()=>{
  const next=manifest([asset('index.html',{sha256:'bad'})]);
  const report=textCustodyChanges(manifest(),next,'en');
  assert.ok(report.includes('DIGEST_REQUIRED'));
});

test('CSV includes source metadata on every asset row',()=>{
  const rows=csvCustodyReport(manifest([asset('index.html'),asset('a.js')])).text.split('\r\n');
  assert.ok(rows[1].includes('https://example.org/catalogue'));
  assert.ok(rows[2].includes('CC0-1.0'));
  assert.ok(rows[2].includes('2026-11-19'));
});
test('HTML table includes per-file source and licence cells',()=>{
  const html=htmlCustodyReport(manifest()).text;
  assert.ok(html.includes('<td>https://example.org/catalogue</td>'));
  assert.ok(html.includes('<td>CC0-1.0</td>'));
});
test('a missing per-file provenance blocks an export',()=>{
  const record=asset('index.html');delete record.provenance;
  const report=jsonCustodyReport(manifest([record]));
  assert.equal(report.ok,false);
  assert.equal(report.text,null);
});
