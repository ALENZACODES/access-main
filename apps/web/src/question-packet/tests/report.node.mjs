import test from 'node:test';
import assert from 'node:assert/strict';
import {blankQuestion,blankStop,emptyPacket,parsePacket} from '../model.ts';
import {handoffRow,handoffRows,csvCell,exportCsv,exportText,exportJson,reportQuality,safeFilename} from '../report.ts';
const packet=()=>({...emptyPacket('2026-11-20'),stops:[{...blankStop('stop-1'),title:{en:'Main entrance',fr:'Entrée principale'},questions:[{
  ...blankQuestion('question-1'),topic:'entrance',prompt:{en:'Is a ramp available?',fr:'Y a-t-il une rampe ?'},
  details:{en:'UNKNOWN',fr:'UNKNOWN'},answer:'UNKNOWN',review:'NEEDS_CONTACT',
 }]}]});
test('empty row list has no fabricated stops',()=>assert.deepEqual(handoffRows(emptyPacket('2026-11-20'),'en'),[]));
test('handoff row preserves UNKNOWN values',()=>{
 const p=packet(),r=handoffRow(p.stops[0],p.stops[0].questions[0],'en');
 assert.equal(r.answer,'UNKNOWN');assert.equal(r.sourceName,'UNKNOWN');assert.equal(r.evidenceGap,true);
});
test('English and French rows retain the same source provenance',()=>{
 const p=packet(),en=handoffRows(p,'en')[0],fr=handoffRows(p,'fr')[0];
 for(const k of ['sourceName','sourceUrl','licence','sourceDate'])assert.equal(en[k],fr[k]);
 assert.notEqual(en.stop,fr.stop);
});
test('report does not change packet',()=>{const p=packet(),original=JSON.stringify(p);handoffRows(p,'fr');assert.equal(JSON.stringify(p),original);});
test('JSON export reparses with same values',()=>{const p=packet();assert.deepEqual(parsePacket(exportJson(p)).packet,p);});
test('JSON export terminates with newline',()=>assert.equal(exportJson(packet()).endsWith('\n'),true));
test('CSV includes UTF8 BOM',()=>assert.equal(exportCsv(packet(),'en').startsWith('\uFEFF'),true));
test('CSV uses CRLF row boundaries',()=>assert.equal(exportCsv(packet(),'en').includes('\r\n'),true));
test('CSV retains UNKNOWN for unanswered question',()=>assert.ok(exportCsv(packet(),'en').includes('"UNKNOWN"')));
test('CSV quotes every field',()=>assert.equal(csvCell('sample'), '"sample"'));
test('CSV doubles quotes',()=>assert.equal(csvCell('the "accessible" entrance'),'"the ""accessible"" entrance"'));
test('CSV preserves comma inside quoted value',()=>assert.equal(csvCell('entrance, north'),'"entrance, north"'));
test('CSV formula equals is prefixed',()=>assert.equal(csvCell('=SUM(1,2)'),"\"'=SUM(1,2)\""));
test('CSV formula plus is prefixed',()=>assert.equal(csvCell('+SUM(1,2)'),"\"'+SUM(1,2)\""));
test('CSV formula minus is prefixed',()=>assert.equal(csvCell('-1+2'),"\"'-1+2\""));
test('CSV formula at sign is prefixed',()=>assert.equal(csvCell('@COMMAND'),"\"'@COMMAND\""));
test('CSV tab-before-formula is prefixed',()=>assert.equal(csvCell('\t=1+1'),"\"'\t=1+1\""));
test('CSV benign numeric zero is unchanged',()=>assert.equal(csvCell('0'), '"0"'));
test('CSV benign label is unchanged',()=>assert.equal(csvCell('Step-free'), '"Step-free"'));
test('CSV report is localized',()=>{
 const en=exportCsv(packet(),'en'),fr=exportCsv(packet(),'fr');
 assert.ok(en.includes('"Main entrance"'));assert.ok(fr.includes('"Entrée principale"'));
});
test('text export is local packet and explicitly warns unknown',()=>{
 const text=exportText(packet(),'en');assert.ok(text.includes('UNKNOWN'));assert.ok(text.includes('does not establish'));
});
test('French text export displays local-language prompt',()=>assert.ok(exportText(packet(),'fr').includes('Y a-t-il une rampe ?')));
test('text export identifies source even if unknown',()=>assert.ok(exportText(packet(),'en').includes('UNKNOWN | UNKNOWN')));
test('safe English filename is deterministic',()=>assert.equal(safeFilename('en','csv'),'accessibility-questions-en.csv'));
test('safe French filename is deterministic',()=>assert.equal(safeFilename('fr','json'),'accessibility-questions-fr.json'));
test('valid packet may be exported even with unresolved evidence',()=>{
 const quality=reportQuality(packet());assert.equal(quality.safeToExport,true);assert.equal(quality.openGaps,1);
});
test('invalid packet cannot be exported as reliable handoff',()=>{
 const quality=reportQuality({...packet(),version:8});assert.equal(quality.safeToExport,false);assert.ok(quality.errorCodes.includes('packet.version'));
});
for(const formula of ['=1+2','+1+2','-1+2','@HYPERLINK','  =SUM(3)','\t+CMD','\n@CMD']){
 test(`export neutralizes formula marker in stop title (${JSON.stringify(formula)})`,()=>{
 const p=packet();const changed={...p,stops:p.stops.map(s=>({...s,title:{...s.title,en:formula}}))};
 const csv=exportCsv(changed,'en');assert.ok(csv.includes(`"'${formula}`));
 });
}
for(const source of [
 {name:'=cmd',licence:'CC0',url:'UNKNOWN',date:'UNKNOWN',tier:'FIRST_HAND'},
 {name:'+cmd',licence:'CC0',url:'UNKNOWN',date:'UNKNOWN',tier:'FIRST_HAND'},
 {name:'@cmd',licence:'CC0',url:'UNKNOWN',date:'UNKNOWN',tier:'FIRST_HAND'},
]){
 test('formula markers in source names are neutralized',()=>{
 const p=packet();const q={...p.stops[0].questions[0],source};const s={...p.stops[0],questions:[q]};
 const csv=exportCsv({...p,stops:[s]},'en');assert.ok(csv.includes(`"'${source.name}`));
 });
}
