import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeDraft, UNKNOWN } from './model.ts';
import {
 COPY, escapeHtml, csvCell, exportCsv, exportJson, textValue,
 exportText, exportHtml, fileName, parseCsvLine
} from './export.ts';
const TODAY='2026-11-20';
const item=(id,changes={})=>({...makeDraft(id,'fictional-place',TODAY),...changes});
const doc=(...items)=>({version:1,items});

test('both languages have a neutral title',()=>{
 assert.match(COPY.en.title,/evidence/i);
 assert.match(COPY.fr.title,/preuves/i);
});
test('both languages explicitly avoid accessibility guarantees',()=>{
 assert.match(COPY.en.intro,/not a statement/i);
 assert.match(COPY.fr.intro,/ne constituent pas une confirmation/i);
});
test('UNKNOWN is not localized into a less precise token',()=>{
 assert.equal(COPY.en.unknown,UNKNOWN);
 assert.equal(COPY.fr.unknown,UNKNOWN);
});
test('French missing-evidence copy uses a nonbreaking space before colon',()=>{
 assert.match(COPY.fr.missing,/\u00a0: UNKNOWN/u);
});
test('HTML escapes the five dangerous delimiter characters',()=>{
 assert.equal(escapeHtml(`&<>"'`),'&amp;&lt;&gt;&quot;&#39;');
});
test('HTML treats nullish data as empty text',()=>{
 assert.equal(escapeHtml(null),'');
 assert.equal(escapeHtml(undefined),'');
});
test('HTML escapes embedded script markup',()=>{
 const value=escapeHtml('<script>alert(1)</script>');
 assert.equal(value.includes('<script>'),false);
 assert.match(value,/&lt;script&gt;/);
});
test('HTML escapes quotes in an attacker-controlled attribute',()=>{
 const value=escapeHtml('" onload="alert(1)');
 assert.equal(value.includes('"'),false);
 assert.match(value,/&quot;/);
});
test('HTML does not interpret ampersands as entities',()=>{
 assert.equal(escapeHtml('&copy;'),'&amp;copy;');
});
test('HTML preserves ordinary Unicode words',()=>{
 assert.equal(escapeHtml('entrée'),'entrée');
 assert.equal(escapeHtml('accessibilité'),'accessibilité');
});
test('CSV always quotes a field',()=>{
 assert.equal(csvCell('plain'),'"plain"');
 assert.equal(csvCell(''),'""');
});
test('CSV doubles embedded quotes',()=>{
 assert.equal(csvCell('say "hello"'),'"say ""hello"""');
});
test('CSV accepts embedded commas as one field',()=>{
 assert.equal(csvCell('one,two'),'"one,two"');
});
test('CSV protects equal-sign formulas',()=>{
 assert.equal(csvCell('=1+1'),'"\'=1+1"');
});
test('CSV protects plus-sign formulas',()=>{
 assert.equal(csvCell('+1+1'),'"\'+1+1"');
});
test('CSV protects minus-sign formulas',()=>{
 assert.equal(csvCell('-1+1'),'"\'-1+1"');
});
test('CSV protects @-prefixed formulas',()=>{
 assert.equal(csvCell('@SUM(1)'),'"\'@SUM(1)"');
});
test('CSV protects leading whitespace before formula prefixes',()=>{
 assert.equal(csvCell('  =1+1'),'"\'  =1+1"');
});
test('CSV treats a safe paragraph as plain text',()=>{
 assert.equal(csvCell('This note is fictional'),'"This note is fictional"');
});
test('CSV escapes formula strings containing quotes',()=>{
 const value=csvCell('=HYPERLINK("https://example.invalid")');
 assert.match(value,/^"'=HYPERLINK/u);
 assert.match(value,/""https:/u);
});
test('CSV export has one row of headings for empty data',()=>{
 const result=exportCsv(doc());
 assert.equal(result.trim().split('\n').length,1);
 assert.match(result,/"retrievedOn"/);
});
test('CSV export always includes provenance columns',()=>{
 const result=exportCsv(doc(item('a')));
 for(const column of ['source','licence','retrievedOn','tier'])assert.match(result,new RegExp(`"${column}"`));
});
test('CSV export includes an uppercase unknown state',()=>{
 const result=exportCsv(doc(item('a')));
 assert.match(result,/"UNKNOWN"/);
 assert.doesNotMatch(result,/"unknown"/);
});
test('CSV export includes uppercase unknown verification tier',()=>{
 const result=exportCsv(doc(item('a')));
 assert.equal(result.includes('"unknown"'),false);
 assert.equal(result.includes('"UNKNOWN"'),true);
});
test('CSV source formulas are not evaluated',()=>{
 const result=exportCsv(doc(item('a',{source:'=cmd|test'})));
 assert.match(result,/"'=cmd\|test"/);
});
test('CSV labels with formulas are protected',()=>{
 const result=exportCsv(doc(item('a',{label:'+HYPERLINK()'})));
 assert.match(result,/"'\+HYPERLINK\(\)"/);
});
test('CSV notes with a formula are protected',()=>{
 const result=exportCsv(doc(item('a',{note:'@SUM(1)'})));
 assert.match(result,/"'@SUM\(1\)"/);
});
test('CSV export does not silently omit optional note fields',()=>{
 const result=exportCsv(doc(item('a',{note:''})));
 assert.equal(result.trim().split('\n').length,2);
 assert.match(result,/"","unreviewed"/);
});
test('CSV exports each input record once',()=>{
 const result=exportCsv(doc(item('a'),item('b'),item('c')));
 assert.equal(result.trim().split('\n').length,4);
});
test('CSV export keeps source metadata rather than guessing it',()=>{
 const result=exportCsv(doc(item('a',{source:'Human supplied source',licence:'UNKNOWN'})));
 assert.match(result,/"Human supplied source"/);
 assert.match(result,/"UNKNOWN"/);
});
test('JSON export is valid parseable JSON',()=>{
 const text=exportJson(doc(item('a')));
 assert.equal(JSON.parse(text).items[0].id,'a');
});
test('JSON export preserves original unknown tier enum',()=>{
 const text=exportJson(doc(item('a')));
 assert.equal(JSON.parse(text).items[0].tier,'unknown');
});
test('JSON export preserves original UNKNOWN state',()=>{
 const text=exportJson(doc(item('a')));
 assert.equal(JSON.parse(text).items[0].state,UNKNOWN);
});
test('JSON export retains licence and retrieval date',()=>{
 const result=JSON.parse(exportJson(doc(item('a')))).items[0];
 assert.equal(result.licence,UNKNOWN);
 assert.equal(result.retrievedOn,TODAY);
});
test('JSON export keeps the document version',()=>{
 assert.equal(JSON.parse(exportJson(doc())).version,1);
});
test('JSON export ends with newline for text tooling',()=>{
 assert.ok(exportJson(doc()).endsWith('\n'));
});
test('English text includes complete provenance',()=>{
 const result=textValue(item('a'),'en');
 for(const value of ['Source:','Licence:','Retrieved on:','Verification tier:'])assert.match(result,new RegExp(value));
});
test('French text uses NBSP before colon',()=>{
 const result=textValue(item('a'),'fr');
 assert.match(result,/Source\u00a0:/u);
 assert.match(result,/Licence\u00a0:/u);
});
test('French text uses narrow NBSP before semicolons',()=>{
 const result=textValue(item('a'),'fr');
 assert.match(result,/\u202f; /u);
 assert.doesNotMatch(result,/[^\u202f]; /u);
});
test('French text does not convert UNKNOWN into unknown',()=>{
 const result=textValue(item('a'),'fr');
 assert.match(result,/UNKNOWN/u);
 assert.doesNotMatch(result,/\binconnu\b/iu);
});
test('text export retains all records in both languages',()=>{
 for(const language of ['en','fr']){
  const result=exportText(doc(item('a'),item('b')),language,TODAY);
  assert.match(result,/\(a\)/u);
  assert.match(result,/\(b\)/u);
 }
});
test('text export includes caution about changing conditions',()=>{
 const result=exportText(doc(item('a')),'en',TODAY);
 assert.match(result,/Information can change/u);
});
test('French text caution uses independent confirmation wording',()=>{
 const result=exportText(doc(item('a')),'fr',TODAY);
 assert.match(result,/Confirmez les détails/u);
});
test('text export states distinct count of places',()=>{
 const result=exportText(doc(item('a'),item('b',{placeId:'place-b'})),'en',TODAY);
 assert.match(result,/Places: 2/u);
});
test('text export uses UNKNOWN for absent notes',()=>{
 const result=exportText(doc(item('a')),'en',TODAY);
 assert.match(result,/Notes: UNKNOWN/u);
});
test('HTML export declares English document language',()=>{
 const result=exportHtml(doc(item('a')),'en',TODAY);
 assert.match(result,/<html lang="en">/u);
});
test('HTML export declares French document language',()=>{
 const result=exportHtml(doc(item('a')),'fr',TODAY);
 assert.match(result,/<html lang="fr">/u);
});
test('HTML export includes a skip-to-content link',()=>{
 const result=exportHtml(doc(item('a')),'en',TODAY);
 assert.match(result,/href="#main"/u);
});
test('HTML export displays visible focus styling',()=>{
 const result=exportHtml(doc(item('a')),'en',TODAY);
 assert.match(result,/:focus-visible/u);
 assert.match(result,/outline:4px/u);
});
test('HTML export does not hide headings from the accessibility tree',()=>{
 const result=exportHtml(doc(item('a')),'en',TODAY);
 assert.match(result,/<h1>/u);
 assert.match(result,/<h2 id="records">/u);
});
test('HTML export contains the source, licence, date and tier',()=>{
 const result=exportHtml(doc(item('a')),'en',TODAY);
 for(const word of ['Source','Licence','Retrieved on','Verification tier'])assert.match(result,new RegExp(word));
});
test('HTML export escapes hostile labels',()=>{
 const result=exportHtml(doc(item('a',{label:'<script>bad()</script>'})),'en',TODAY);
 assert.doesNotMatch(result,/<script>/u);
 assert.match(result,/&lt;script&gt;/u);
});
test('HTML export escapes injected note markup',()=>{
 const result=exportHtml(doc(item('a',{note:'<img src=x>'})),'en',TODAY);
 assert.doesNotMatch(result,/<img/u);
 assert.match(result,/&lt;img src=x&gt;/u);
});
test('HTML export escapes fake event handlers in source',()=>{
 const result=exportHtml(doc(item('a',{source:'" onclick="bad()'})),'en',TODAY);
 assert.doesNotMatch(result,/" onclick="bad\(\)/u);
 assert.match(result,/&quot; onclick=&quot;/u);
});
test('HTML export displays UNKNOWN tier visibly',()=>{
 const result=exportHtml(doc(item('a')),'en',TODAY);
 assert.match(result,/UNKNOWN/u);
});
test('HTML export includes evidence-gap coverage for missing categories',()=>{
 const result=exportHtml(doc(item('a')),'en',TODAY);
 assert.match(result,/No evidence recorded: UNKNOWN/u);
});
test('HTML export identifies conflict groups for manual review',()=>{
 const result=exportHtml(doc(item('a',{state:'reported'}),item('b',{state:'not-reported'})),'en',TODAY);
 assert.match(result,/Conflicting reports/u);
 assert.match(result,/note-1|\ba\b/u);
});
test('HTML export includes review flags for unknown evidence',()=>{
 const result=exportHtml(doc(item('a')),'en',TODAY);
 assert.match(result,/UNKNOWN_STATE/u);
});
test('HTML export displays all source identifiers',()=>{
 const result=exportHtml(doc(item('a',{source:'Manual source 1'}),item('b',{source:'Manual source 2'})),'en',TODAY);
 assert.match(result,/Manual source 1/u);
 assert.match(result,/Manual source 2/u);
});
test('HTML export uses a semantic main landmark',()=>{
 const result=exportHtml(doc(),'en',TODAY);
 assert.match(result,/<main id="main">/u);
 assert.match(result,/<\/main>/u);
});
test('HTML export includes viewport settings for small screens',()=>{
 const result=exportHtml(doc(),'en',TODAY);
 assert.match(result,/name="viewport"/u);
});
test('HTML export has no externally loaded fonts or resources',()=>{
 const result=exportHtml(doc(),'en',TODAY);
 assert.doesNotMatch(result,/<script src=/u);
 assert.doesNotMatch(result,/<link rel="stylesheet"/u);
});
test('HTML export refuses to render unsafe user HTML literally',()=>{
 const result=exportHtml(doc(item('a',{source:'<iframe src=x>'})),'en',TODAY);
 assert.doesNotMatch(result,/<iframe/u);
});
test('HTML export includes a properly formatted time element',()=>{
 const result=exportHtml(doc(),'en',TODAY);
 assert.match(result,/<time datetime="2026-11-20">2026-11-20<\/time>/u);
});
test('HTML export handles a completely empty inventory',()=>{
 const result=exportHtml(doc(),'en',TODAY);
 assert.match(result,/No records/u);
 assert.match(result,/Records/u);
});
test('HTML French copy avoids English fallback on title',()=>{
 const result=exportHtml(doc(),'fr',TODAY);
 assert.match(result,/Atelier de preuves hors ligne/u);
 assert.doesNotMatch(result,/<h1>Offline evidence workbench<\/h1>/u);
});
test('French HTML uses a nonbreaking space for its date colon',()=>{
 const result=exportHtml(doc(),'fr',TODAY);
 assert.match(result,/Date de révision\u00a0:/u);
});
test('French report includes the same provenance',()=>{
 const result=exportHtml(doc(item('a')),'fr',TODAY);
 assert.match(result,/Niveau de vérification/u);
 assert.match(result,/Date de récupération/u);
});
test('French report preserves the uppercase UNKNOWN token',()=>{
 const result=exportHtml(doc(item('a')),'fr',TODAY);
 assert.match(result,/UNKNOWN/u);
});
test('CSV parser retains commas inside quoted cells',()=>{
 assert.deepEqual(parseCsvLine('"a,b","c"'),['a,b','c']);
});
test('CSV parser undoubles escaped quotes',()=>{
 assert.deepEqual(parseCsvLine('"a""b","c"'),['a"b','c']);
});
test('CSV parser handles empty quoted fields',()=>{
 assert.deepEqual(parseCsvLine('"",""'),['','']);
});
test('CSV parser handles ordinary unquoted fields',()=>{
 assert.deepEqual(parseCsvLine('a,b,c'),['a','b','c']);
});
test('CSV output can be parsed into eleven columns',()=>{
 const result=exportCsv(doc(item('a'))).trim().split('\n');
 assert.equal(parseCsvLine(result[0]).length,11);
 assert.equal(parseCsvLine(result[1]).length,11);
});
test('CSV parser does not remove a protective formula prefix',()=>{
 assert.deepEqual(parseCsvLine(csvCell('=1+1')),["'=1+1"]);
});
test('fileName creates a predictable local HTML filename',()=>{
 assert.equal(fileName('html',TODAY),'offline-evidence-2026-11-20.html');
});
test('fileName creates a predictable local CSV filename',()=>{
 assert.equal(fileName('csv',TODAY),'offline-evidence-2026-11-20.csv');
});
test('fileName creates a predictable local JSON filename',()=>{
 assert.equal(fileName('json',TODAY),'offline-evidence-2026-11-20.json');
});
test('fileName uses txt extension for text',()=>{
 assert.equal(fileName('text',TODAY),'offline-evidence-2026-11-20.txt');
});
test('text export does not claim official partnership',()=>{
 const result=exportText(doc(),'en',TODAY);
 assert.doesNotMatch(result,/endorsed by|official partner|guaranteed accessible/iu);
});
test('the App language does not inject a real-place accessibility verdict',()=>{
 const result=exportHtml(doc(item('a')),'en',TODAY);
 assert.doesNotMatch(result,/guaranteed accessible|certified accessible/iu);
});
test('French report does not claim guaranteed accessibility',()=>{
 const result=exportHtml(doc(item('a')),'fr',TODAY);
 assert.doesNotMatch(result,/accessibilité garantie/iu);
});
test('formatted HTML includes no user-placed external image URL',()=>{
 const result=exportHtml(doc(item('a',{note:'https://example.invalid/picture.png'})),'en',TODAY);
 assert.doesNotMatch(result,/<img/u);
 assert.doesNotMatch(result,/<script/u);
});
