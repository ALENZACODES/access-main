import test from 'node:test';
import assert from 'node:assert/strict';
import {blankStop,blankQuestion,emptyPacket,addStop,addQuestion,replaceQuestion} from '../model.ts';
import {questionPriority,reviewItem,reviewBoard,followUpQuestions,topicCoverage,handoffChecklist,destinationChecklist} from '../triage.ts';
const base=()=>addQuestion(addStop(emptyPacket('2026-11-20'),{...blankStop('stop-1'),title:{en:'Library',fr:'Bibliothèque'}}),'stop-1',
 {...blankQuestion('question-1'),prompt:{en:'Is the entrance step-free?',fr:'L’entrée est-elle sans marche ?'},details:{en:'UNKNOWN',fr:'UNKNOWN'}});
const update=(packet,overrides)=>replaceQuestion(packet,'stop-1',{...packet.stops[0].questions[0],...overrides});
const knownSource={name:'Local visitor',url:'https://example.org',licence:'CC BY 4.0',date:'2026-11-20',tier:'FIRST_HAND'};
test('unknown answer ranks as missing answer',()=>assert.equal(questionPriority(base().stops[0].questions[0]),'MISSING_ANSWER'));
test('known answer with UNKNOWN source ranks as missing source',()=>{
 const q=update(base(),{answer:'YES_REPORTED'}).stops[0].questions[0];assert.equal(questionPriority(q),'MISSING_SOURCE');
});
test('contact request appears as follow-up when sourced',()=>{
 const q=update(base(),{answer:'YES_REPORTED',source:knownSource,review:'NEEDS_CONTACT'}).stops[0].questions[0];
 assert.equal(questionPriority(q),'FOLLOW_UP');
});
test('recheck request appears as recheck when sourced',()=>{
 const q=update(base(),{answer:'YES_REPORTED',source:knownSource,review:'NEEDS_RECHECK'}).stops[0].questions[0];
 assert.equal(questionPriority(q),'RECHECK');
});
test('unknown review status implies recheck',()=>{
 const q=update(base(),{answer:'YES_REPORTED',source:knownSource,review:'UNKNOWN'}).stops[0].questions[0];
 assert.equal(questionPriority(q),'RECHECK');
});
test('complete source and recorded follow-up is ready to share',()=>{
 const q=update(base(),{answer:'YES_REPORTED',source:knownSource,review:'RECORDED'}).stops[0].questions[0];
 assert.equal(questionPriority(q),'READY_TO_SHARE');
});
test('recorded answer without source is not ready to share',()=>{
 const q=update(base(),{answer:'YES_REPORTED',review:'RECORDED'}).stops[0].questions[0];
 assert.equal(questionPriority(q),'MISSING_SOURCE');
});
test('recorded answer with missing date is not ready',()=>{
 const q=update(base(),{answer:'YES_REPORTED',review:'RECORDED',source:{...knownSource,date:'UNKNOWN'}}).stops[0].questions[0];
 assert.equal(questionPriority(q),'MISSING_SOURCE');
});
test('review board empty packet is empty',()=>{
 const board=reviewBoard(emptyPacket('2026-11-20'),'en');assert.equal(board.total,0);assert.deepEqual(board.urgent,[]);
});
test('review board records unknown in urgent',()=>{
 const board=reviewBoard(base(),'en');assert.equal(board.total,1);assert.equal(board.urgent.length,1);
});
test('review board separates sourced and recorded',()=>{
 const p=update(base(),{answer:'YES_REPORTED',review:'RECORDED',source:knownSource});
 const board=reviewBoard(p,'en');assert.equal(board.recorded.length,1);assert.equal(board.urgent.length,0);assert.equal(board.incomplete.length,0);
});
test('review board has bilingual stop labels',()=>{
 const en=reviewBoard(base(),'en'),fr=reviewBoard(base(),'fr');
 assert.equal(en.urgent[0].stopName,'Library');assert.equal(fr.urgent[0].stopName,'Bibliothèque');
});
test('review item preserves original provenance',()=>{
 const p=update(base(),{answer:'YES_REPORTED',source:knownSource});const item=reviewItem(p.stops[0],p.stops[0].questions[0],'en');
 assert.equal(item.sourceName,'Local visitor');assert.equal(item.sourceDate,'2026-11-20');
});
test('follow-up questions include unresolved items',()=>{
 const entries=followUpQuestions(base(),'en');assert.equal(entries.length,1);assert.ok(entries[0].includes('Library'));
});
test('follow-up questions remove fully resolved items',()=>{
 const p=update(base(),{answer:'YES_REPORTED',review:'RECORDED',source:knownSource});assert.deepEqual(followUpQuestions(p,'en'),[]);
});
test('topic coverage counts questions by their topic',()=>{
 const p=base(),coverage=topicCoverage(p);assert.deepEqual(coverage,[{topic:'custom',count:1,unknown:1}]);
});
test('topic coverage excludes absent topic',()=>{
 const coverage=topicCoverage(base());assert.equal(coverage.some(x=>x.topic==='lift'),false);
});
test('resolved question remains in topic coverage with no unknown',()=>{
 const p=update(base(),{answer:'YES_REPORTED'});assert.deepEqual(topicCoverage(p),[{topic:'custom',count:1,unknown:0}]);
});
test('English checklist includes empty checkbox for unknown',()=>{
 const text=handoffChecklist(base(),'en');assert.ok(text.includes('[ ]'));assert.ok(text.includes('UNKNOWN'));
});
test('French checklist preserves French punctuation',()=>{
 const text=handoffChecklist(base(),'fr');assert.ok(text.includes('L’entrée est-elle sans marche ?'));
});
test('resolved checklist includes checked checkbox',()=>{
 const p=update(base(),{answer:'YES_REPORTED',source:knownSource,review:'RECORDED'});
 assert.ok(handoffChecklist(p,'en').includes('[x]'));
});
test('destination questions list includes unresolved evidence',()=>{
 assert.deepEqual(destinationChecklist(base(),'en'),['Library — Is the entrance step-free?']);
});
test('destination list ignores resolved evidence',()=>{
 const p=update(base(),{answer:'YES_REPORTED',source:knownSource,review:'RECORDED'});
 assert.deepEqual(destinationChecklist(p,'en'),[]);
});
test('destination list is localized',()=>assert.deepEqual(destinationChecklist(base(),'fr'),['Bibliothèque — L’entrée est-elle sans marche ?']));
test('source type does not create a real-world endorsement',()=>{
 const text=handoffChecklist(update(base(),{answer:'YES_REPORTED',source:knownSource}),'en');
 assert.equal(/verified|partnership|guaranteed/i.test(text),false);
});
