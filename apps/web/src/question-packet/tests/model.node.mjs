import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ANSWERS, REVIEWS, TIERS, TOPICS, blankQuestion, blankStop, emptyPacket, newSource,
  record, forbiddenControl, safeText, safeId, validDate, safeUrl, frenchErrors,
  languageFindings, sourceFindings, questionFindings, stopFindings, packetFindings,
  parsePacket, MAX_IMPORT_BYTES, MAX_QUESTIONS, MAX_STOPS,
} from '../model.ts';
const codes = values => values.map(x=>x.code);
const makeQuestion = (overrides={})=>({...blankQuestion('question-1'), prompt:{en:'Is there step-free access?',fr:'L’entrée est-elle sans marche ?'}, details:{en:'Not yet known',fr:'Pas encore connu'},...overrides});
const makeStop = (overrides={})=>({...blankStop('stop-1'),title:{en:'Arrival',fr:'Arrivée'},questions:[makeQuestion()],...overrides});
const makePacket = (overrides={})=>({...emptyPacket('2026-11-20'),stops:[makeStop()],...overrides});

test('new packet starts empty without supplied place facts',()=>{
 const p=emptyPacket('2026-11-20');assert.equal(p.version,1);assert.equal(p.createdOn,'2026-11-20');assert.deepEqual(p.stops,[]);
});
test('invalid initial date is not silently trusted',()=>assert.equal(emptyPacket('2026-02-30').createdOn,'1970-01-01'));
test('new source contains only UNKNOWN',()=>assert.deepEqual(newSource(),{name:'UNKNOWN',url:'UNKNOWN',licence:'UNKNOWN',date:'UNKNOWN',tier:'UNKNOWN'}));
test('new question has UNKNOWN observation, review and source',()=>{
 const q=blankQuestion('question-1');assert.equal(q.answer,'UNKNOWN');assert.equal(q.review,'UNKNOWN');assert.equal(q.source.tier,'UNKNOWN');
});
for(const input of [null,undefined,0,1,true,false,'',[],[1],new Date()]){
 test(`record rejects ${String(input)}`,()=>assert.equal(record(input),false));
}
for(const input of [{}, {id:'x'},Object.assign(Object.create(null),{x:1})]){
 test('record accepts plain data',()=>assert.equal(record(input),true));
}
for(const value of ['\u0000','\u0009','\n','\u001f','\u007f','\u0085','\u009f']){
 test(`forbidden control ${value.codePointAt(0)}`,()=>assert.equal(forbiddenControl(`before${value}after`),true));
}
for(const value of ['valid','a source','Mesure locale','l’entrée','UNKNOWN','0 mm']){
 test(`valid text ${value}`,()=>assert.equal(safeText(value),true));
}
for(const value of ['', ' ', '\n',null,undefined,1,true,'a'.repeat(501)]){
 test('invalid text rejected',()=>assert.equal(safeText(value),false));
}
for(const value of ['a','stop-1','question-18','a0','a-b-2']){
 test(`valid id ${value}`,()=>assert.equal(safeId(value),true));
}
for(const value of ['', 'Stop', '1stop','-x','x_', 'x.y','a/b','../a','a'.repeat(65)]){
 test(`invalid id ${value.slice(0,10)}`,()=>assert.equal(safeId(value),false));
}
for(const value of ['1970-01-01','2024-02-29','2000-02-29','2026-11-20','9999-12-31']){
 test(`calendar accepts ${value}`,()=>assert.equal(validDate(value),true));
}
for(const value of ['1969-12-31','2026-02-29','1900-02-29','2026-13-01','2026-00-10','2026-11-31','2026-01-00','2026/11/20','tomorrow','UNKNOWN',null]){
 test(`calendar rejects ${String(value)}`,()=>assert.equal(validDate(value),false));
}
for(const value of ['https://example.org/access','https://www.ontario.ca/page/accessibility','https://example.org/a?b=c']){
 test(`safe source URL ${value}`,()=>assert.equal(safeUrl(value),true));
}
for(const value of ['','UNKNOWN','http:' + '//example.org','javascript:alert(1)','https://localhost/a','https://foo.local/x','https://127.0.0.1/x','https://user:pass@example.org','https://example.org/a#x','https://example.org/a b',null]){
 test(`unsafe source URL ${String(value)}`,()=>assert.equal(safeUrl(value),false));
}
for(const [text,code] of [
 ['Entrée: étape','colon'],['Entrée : étape','colon'],['Est-ce possible?','thin-space'],['Est-ce possible ?','thin-space'],
 ['Oui; non','thin-space'],['Attention!','thin-space'],["L'accessibilité",'apostrophe'],['«mot»','opening-guillemet'],['« mot»','closing-guillemet'],
]) test(`French typography detects ${code}`,()=>assert.ok(frenchErrors(text).includes(code)));
for(const text of ['L’entrée est-elle sans marche ?','Équipement : UNKNOWN','« Entrée »','Oui ; non','UNKNOWN']){
 test(`French typography accepts ${text}`,()=>assert.deepEqual(frenchErrors(text),[]));
}
test('missing translation creates two findings',()=>assert.deepEqual(codes(languageFindings({},'$.name')).sort(),['language.en','language.fr']));
test('non-object copy rejected',()=>assert.deepEqual(codes(languageFindings(null,'$.name')),['language.object']));
test('valid translation has no findings',()=>assert.deepEqual(languageFindings({en:'Entrance',fr:'Entrée'},'name'),[]));
test('unknown source is review finding, not invented proof',()=>assert.deepEqual(codes(sourceFindings(newSource(),'$.source')),['source.unknown']));
for(const tier of TIERS){
 test(`tier ${tier} is accepted`,()=>assert.equal(codes(sourceFindings({...newSource(),tier},'x')).includes('source.tier'),false));
}
for(const tier of ['PROVEN','GUARANTEED','PARTNER','REAL_TIME',null]){
 test(`invalid tier ${String(tier)} rejected`,()=>assert.ok(codes(sourceFindings({...newSource(),tier},'x')).includes('source.tier')));
}
test('complete provenance has no review finding',()=>{
 const source={name:'Site operator',url:'https://example.org/access',licence:'CC BY 4.0',date:'2026-11-20',tier:'OFFICIAL'};
 assert.deepEqual(sourceFindings(source,'$.source'),[]);
});
test('unsafe URL rejected',()=>assert.ok(codes(sourceFindings({...newSource(),url:'javascript:1'},'x')).includes('source.url')));
test('invalid date rejected',()=>assert.ok(codes(sourceFindings({...newSource(),date:'2026-02-30'},'x')).includes('source.date')));
test('nonrecord source rejected',()=>assert.deepEqual(codes(sourceFindings('unknown','x')),['source.object']));
for(const answer of ANSWERS){
 test(`answer ${answer} accepted`,()=>assert.equal(codes(questionFindings(makeQuestion({answer}),'x')).includes('question.answer'),false));
}
for(const topic of TOPICS){
 test(`topic ${topic} accepted`,()=>assert.equal(codes(questionFindings(makeQuestion({topic}),'x')).includes('question.topic'),false));
}
for(const review of REVIEWS){
 test(`review state ${review} accepted`,()=>assert.equal(codes(questionFindings(makeQuestion({review}),'x')).includes('question.review'),false));
}
test('unknown question is flagged for review',()=>assert.ok(codes(questionFindings(makeQuestion(),'x')).includes('question.unknown')));
test('invalid question id rejected',()=>assert.ok(codes(questionFindings(makeQuestion({id:'UPPER'}),'x')).includes('question.id')));
test('invalid topic rejected',()=>assert.ok(codes(questionFindings(makeQuestion({topic:'factual-access'}),'x')).includes('question.topic')));
test('negative order rejected',()=>assert.ok(codes(questionFindings(makeQuestion({order:-1}),'x')).includes('question.order')));
test('fractional order rejected',()=>assert.ok(codes(questionFindings(makeQuestion({order:0.5}),'x')).includes('question.order')));
test('nonrecord question rejected',()=>assert.deepEqual(codes(questionFindings(null,'x')),['question.object']));
test('nonrecord stop rejected',()=>assert.deepEqual(codes(stopFindings(null,'x')),['stop.object']));
test('duplicate question IDs rejected',()=>{
 const s=makeStop({questions:[makeQuestion(),makeQuestion()]});
 assert.ok(codes(stopFindings(s,'x')).includes('question.duplicate'));
});
test('more than MAX_QUESTIONS rejected',()=>{
 const s=makeStop({questions:Array.from({length:MAX_QUESTIONS+1},(_,i)=>makeQuestion({id:`question-${i+1}`}))});
 assert.ok(codes(stopFindings(s,'x')).includes('stop.questions'));
});
test('invalid stop questions rejected',()=>assert.ok(codes(stopFindings(makeStop({questions:null}),'x')).includes('stop.questions')));
test('non-object packet rejected',()=>assert.deepEqual(codes(packetFindings('x')),['packet.object']));
test('packet version other than 1 rejected',()=>assert.ok(codes(packetFindings(makePacket({version:2}))).includes('packet.version')));
test('duplicate stops rejected',()=>assert.ok(codes(packetFindings(makePacket({stops:[makeStop(),makeStop()]}))).includes('stop.duplicate')));
test('too many stops rejected',()=>{
 const p=makePacket({stops:Array.from({length:MAX_STOPS+1},(_,i)=>makeStop({id:`stop-${i+1}`}))});
 assert.ok(codes(packetFindings(p)).includes('packet.stops'));
});
test('parse rejects invalid JSON without mutating outside state',()=>assert.deepEqual(codes(parsePacket('{').findings),['import.json']));
test('parse rejects excess bytes before JSON',()=>assert.deepEqual(codes(parsePacket('x'.repeat(MAX_IMPORT_BYTES+1)).findings),['import.too-large']));
test('parse accepts valid packet despite review gaps',()=>{
 const payload=JSON.stringify(makePacket()),result=parsePacket(payload);
 assert.notEqual(result.packet,null);assert.ok(codes(result.findings).includes('source.unknown'));
});
test('parse rejects malformed source URL',()=>{
 const q=makeQuestion({source:{...newSource(),url:'http:' + '//bad.org'}});
 const p=makePacket({stops:[makeStop({questions:[q]})]});
 const result=parsePacket(JSON.stringify(p));assert.equal(result.packet,null);assert.ok(codes(result.findings).includes('source.url'));
});
test('parse preserves data rather than inventing evidence',()=>{
 const packet=makePacket();const parsed=parsePacket(JSON.stringify(packet));assert.deepEqual(parsed.packet,packet);
});
