import assert from 'node:assert/strict';
import test from 'node:test';
import {
 copy,htmlEscape,cleanCell,csvCell,csvRow,labelColon,reportRows,
 exportCsv,exportText,exportHtml,exportJson,exportCoverage,exportChanges,byFormat,
} from './snapshot-a11y-report.mjs';
import { TODAY,provenance,control,capture,document,clone } from './snapshot-a11y-fixtures.mjs';
const opts={today:TODAY};
const testData=()=>document();

test('English and French copy keys are exactly parallel',()=>{
 assert.deepEqual(Object.keys(copy('en')).sort(),Object.keys(copy('fr')).sort());
});
test('unrecognized language defaults to English',()=>{
 assert.deepEqual(copy('other'),copy('en'));
 assert.deepEqual(copy(null),copy('en'));
});
test('UNKNOWN is spelled identically in both language catalogs',()=>{
 assert.equal(copy('en').unknown,'UNKNOWN');
 assert.equal(copy('fr').unknown,'UNKNOWN');
});
test('French catalog uses typographic apostrophes',()=>{
 const values=Object.values(copy('fr'));
 assert.ok(values.some(x=>x.includes('’')));
 assert.ok(values.every(x=>!/(?:l|d|c|qu)'(?=\p{L})/iu.test(x)));
});
test('copy never describes the app as an authority for physical places',()=>{
 assert.match(copy('en').caution,/not a claim/i);
 assert.match(copy('fr').caution,/ne décrivent pas/iu);
});
test('HTML escaping handles markup and quotes',()=>{
 assert.equal(htmlEscape('<a href="x">hello & world</a>'),'&lt;a href=&quot;x&quot;&gt;hello &amp; world&lt;/a&gt;');
 assert.equal(htmlEscape("'quoted'"),'&#39;quoted&#39;');
});
test('HTML escaping handles numbers and null safely',()=>{
 assert.equal(htmlEscape(42),'42');
 assert.equal(htmlEscape(null),'');
});
test('CSV text cleaning removes only dangerous line boundaries',()=>{
 assert.equal(cleanCell('a\nb\rc\td'),'a b c d');
 assert.equal(cleanCell('A\u00a0: B'),'A\u00a0: B');
});
test('CSV quotes embedded double quotes',()=>{
 assert.equal(csvCell('a"b'),'"a""b"');
});
test('CSV neutralizes formula-leading strings',()=>{
 for(const x of ['=2+2','+1','-2','@SUM(A1)','  =A2'])assert.equal(csvCell(x).startsWith('"\''),true,x);
});
test('CSV leaves ordinary URLs and UNKNOWN unchanged',()=>{
 assert.equal(csvCell('https://example.org/a'),'"https://example.org/a"');
 assert.equal(csvCell('UNKNOWN'),'"UNKNOWN"');
});
test('CSV rows keep ordered cells',()=>{
 assert.equal(csvRow(['first','second']), '"first","second"');
});
test('French punctuation gets escaped nonbreaking space before colons',()=>{
 assert.equal(labelColon('fr'),'\u00a0:');
 assert.equal(labelColon('en'),':');
});
test('normal report rows include complete source metadata',()=>{
 const x=reportRows(testData(),opts);
 assert.equal(x.ok,true);
 assert.ok(x.rows.length>0);
 for(const row of x.rows){
  assert.equal(row.source,provenance().source);
  assert.equal(row.licence,provenance().licence);
  assert.equal(row.retrieved,TODAY);
  assert.equal(row.tier,0);
 }
});
test('normal report rows include every control rule',()=>{
 const rows=reportRows(testData(),opts).rows;
 for(const name of ['TARGET_44','ACCESSIBLE_NAME','TAB_REACHABLE','FOCUS_VISIBLE','KEYBOARD_ACTIVATION'])assert.ok(rows.some(r=>r.rule===name));
});
test('normal report rows include offline and asset outcomes',()=>{
 const rows=reportRows(testData(),opts).rows;
 for(const name of ['ANNOUNCEMENTS','OFFLINE_SHELL','STORAGE_READ','ASSET_AVAILABILITY'])assert.ok(rows.some(r=>r.rule===name));
});
test('invalid report rows do not expose record details',()=>{
 const x=reportRows(document(capture('x',{provenance:null})),opts);
 assert.equal(x.ok,false);assert.deepEqual(x.rows,[]);
});
test('CSV starts with localized English column labels',()=>{
 const x=exportCsv(testData(),'en',opts);
 assert.equal(x.ok,true);
 const first=x.text.split('\r\n')[0];
 assert.ok(first.includes('"Route"'));
 assert.ok(first.includes('"Source review tier"'));
});
test('CSV uses localized French column labels',()=>{
 const x=exportCsv(testData(),'fr',opts);
 assert.equal(x.ok,true);
 const first=x.text.split('\r\n')[0];
 assert.ok(first.includes('"Parcours"'));
 assert.ok(first.includes('"Niveau d’examen de la source"'));
});
test('French CSV preserves data-status token UNKNOWN',()=>{
 const data=document(capture('x',{controls:[control('submit',{focusVisible:'UNKNOWN'})]}));
 const x=exportCsv(data,'fr',opts);
 assert.ok(x.text.includes('"UNKNOWN"'));
});
test('CSV includes source licence retrieval and tier',()=>{
 const x=exportCsv(testData(),'en',opts);
 assert.ok(x.text.includes(provenance().source));
 assert.ok(x.text.includes('CC0-1.0'));
 assert.ok(x.text.includes(TODAY));
});
test('CSV uses CRLF for spreadsheet-compatible rows',()=>{
 const x=exportCsv(testData(),'fr',opts);
 assert.ok(x.text.includes('\r\n'));
 assert.ok(x.text.endsWith('\r\n'));
});
test('CSV contains no literal private field values on invalid input',()=>{
 const data=document(capture('x',{email:'someone@example.org'}));
 const x=exportCsv(data,'en',opts);
 assert.equal(x.ok,false);assert.equal(x.text,null);
 assert.equal(JSON.stringify(x).includes('someone@example.org'),false);
});
test('English text displays a caution and source data',()=>{
 const x=exportText(testData(),'en',opts);
 assert.ok(x.text.includes(copy('en').caution));
 assert.ok(x.text.includes('Source: '));
 assert.ok(x.text.includes(provenance().source));
});
test('French text uses nonbreaking colon spacing',()=>{
 const x=exportText(testData(),'fr',opts);
 assert.ok(x.text.includes('Source\u00a0:'));
 assert.ok(x.text.includes('Parcours\u00a0:'));
});
test('French text uses UNKNOWN unchanged',()=>{
 const data=document(capture('x',{offlineShell:'UNKNOWN'}));
 const x=exportText(data,'fr',opts);
 assert.ok(x.text.includes('UNKNOWN'));
});
test('empty text report states no captures',()=>{
 const x=exportText({version:1,captures:[]},'en',opts);
 assert.ok(x.text.includes(copy('en').empty));
});
test('text report remains deterministic across captures order',()=>{
 const a=document(capture('b'),capture('a'));
 const b=document(capture('a'),capture('b'));
 assert.equal(exportText(a).text,exportText(b).text);
});
test('HTML report contains HTML document landmarks',()=>{
 const x=exportHtml(testData(),'en',opts);
 assert.match(x.text,/<!doctype html>/);
 assert.match(x.text,/<html lang="en">/);
 assert.match(x.text,/<main>/);
 assert.match(x.text,/<h1>/);
 assert.match(x.text,/<table>/);
 assert.match(x.text,/<caption>/);
});
test('French HTML has correct language and translated headers',()=>{
 const x=exportHtml(testData(),'fr',opts);
 assert.ok(x.text.includes('<html lang="fr">'));
 assert.ok(x.text.includes('Parcours'));
 assert.ok(x.text.includes(copy('fr').title));
});
test('HTML table header cells explicitly use column scope',()=>{
 const x=exportHtml(testData(),'en',opts);
 assert.ok(x.text.includes('<th scope="col">'));
});
test('HTML retains 44px targets and visible focus declarations',()=>{
 const x=exportHtml(testData(),'en',opts);
 assert.ok(x.text.includes('min-width:44px'));
 assert.ok(x.text.includes('min-height:44px'));
 assert.ok(x.text.includes(':focus-visible'));
});
test('HTML output escapes source URLs before insertion',()=>{
 const data=clone(testData());
 data.captures[0].provenance.source='https://example.org/a?x=1&y=2';
 const x=exportHtml(data,'en',opts);
 assert.ok(x.text.includes('x=1&amp;y=2'));
 assert.equal(x.text.includes('x=1&y=2'),false);
});
test('HTML refuses invalid private data',()=>{
 const x=exportHtml(document(capture('x',{token:'password-like-value'})),'en',opts);
 assert.equal(x.ok,false);
 assert.equal(x.text,null);
});
test('HTML output does not load scripts or remote styles',()=>{
 const x=exportHtml(testData(),'en',opts);
 assert.equal(x.text.includes('<script'),false);
 assert.equal(x.text.includes('<link rel="stylesheet"'),false);
});
test('HTML has readable viewport and scalable text',()=>{
 const x=exportHtml(testData(),'en',opts);
 assert.ok(x.text.includes('width=device-width, initial-scale=1'));
 assert.equal(x.text.includes('user-scalable=no'),false);
});
test('JSON report parses as canonical result',()=>{
 const x=exportJson(testData(),opts);
 assert.equal(x.ok,true);
 const parsed=JSON.parse(x.text);
 assert.equal(parsed.version,1);
 assert.equal(parsed.reviews.length,1);
 assert.equal(parsed.fingerprint.length,64);
});
test('JSON report includes coverage gaps rather than inventing PASS',()=>{
 const x=JSON.parse(exportJson(testData(),opts).text);
 assert.ok(x.coverage.some(r=>r.status==='UNKNOWN'));
});
test('JSON report includes missing French parity result',()=>{
 const x=JSON.parse(exportJson(testData(),opts).text);
 assert.equal(x.languageParity[0].status,'UNKNOWN');
});
test('JSON report excludes unrelated private values',()=>{
 const data=document(capture('x',{email:'private-value'}));
 const x=exportJson(data,opts);
 assert.equal(x.ok,false);assert.equal(JSON.stringify(x).includes('private-value'),false);
});
test('coverage report describes missing recorded combinations',()=>{
 const x=exportCoverage(testData(),'en',opts);
 assert.ok(x.text.includes('Missing observations: 5'));
});
test('French coverage report has localized label but unchanged state',()=>{
 const x=exportCoverage(testData(),'fr',opts);
 assert.ok(x.text.includes('Observations manquantes\u00a0: 5'));
 assert.ok(x.text.includes('UNKNOWN'));
});
test('coverage report never invents routes for empty data',()=>{
 const x=exportCoverage({version:1,captures:[]},'en',opts);
 assert.ok(x.text.includes('Missing observations: 0'));
});
test('comparison report detects status changes',()=>{
 const before=testData();
 const after=document(capture('sample-en',{offlineShell:'FAIL'}));
 const x=exportChanges(before,after,'en',opts);
 assert.ok(x.text.includes('OUTCOME_CHANGED'));
 assert.ok(x.text.includes('FAIL'));
});
test('French comparison report uses localized headings',()=>{
 const before=testData();
 const after=document(capture('sample-en',{offlineShell:'UNKNOWN'}));
 const x=exportChanges(before,after,'fr',opts);
 assert.ok(x.text.includes('Changements\u00a0:'));
 assert.ok(x.text.includes('Avant\u00a0:'));
 assert.ok(x.text.includes('Après\u00a0:'));
});
test('unchanged comparison reports no fabricated changes',()=>{
 const x=exportChanges(testData(),testData(),'en',opts);
 assert.ok(x.text.includes('Changes: 0'));
});
test('format router selects text CSV HTML and JSON',()=>{
 for(const format of ['text','csv','html','json'])assert.equal(byFormat(testData(),format,'en',opts).ok,true,format);
});
test('unknown format fails closed',()=>{
 const x=byFormat(testData(),'spreadsheet','en',opts);
 assert.equal(x.ok,false);assert.equal(x.text,null);
});
test('invalid document fails all export formats',()=>{
 for(const format of ['text','csv','html','json'])assert.equal(byFormat({},format,'fr',opts).ok,false,format);
});
test('report output remains unchanged when caller object changes after creation',()=>{
 const data=testData();const a=exportText(data);
 data.captures[0].route='/different';
 assert.ok(a.text.includes('/example'));
 assert.ok(!a.text.includes('/different'));
});
