import test from 'node:test';
import assert from 'node:assert/strict';
import {blankStop,blankQuestion,emptyPacket,addStop,addQuestion,replaceQuestion,removeQuestion} from '../model.ts';
import {EVENT_TYPES,emptyLedger,sourceFingerprint,questionsById,createEvents,appendEvents,evidenceEventsFor,eventIssues,ledgerIssues,eventPlainText,MAX_EVENTS} from '../history.ts';
const make=()=>addQuestion(addStop(emptyPacket('2026-11-20'),blankStop('stop-1')),'stop-1',blankQuestion('question-1'));
const changed=(p,overrides)=>replaceQuestion(p,'stop-1',{...p.stops[0].questions[0],...overrides});
test('new ledger has no events',()=>assert.deepEqual(emptyLedger(),{version:1,events:[]}));
test('source fingerprint stable for same fields',()=>{
 const p=make();const source=p.stops[0].questions[0].source;
 assert.equal(sourceFingerprint(source),sourceFingerprint({...source}));
});
test('source fingerprint detects licence change',()=>{
 const s=make().stops[0].questions[0].source;
 assert.notEqual(sourceFingerprint(s),sourceFingerprint({...s,licence:'CC BY 4.0'}));
});
test('source fingerprint detects retrieval-date change',()=>{
 const s=make().stops[0].questions[0].source;
 assert.notEqual(sourceFingerprint(s),sourceFingerprint({...s,date:'2026-11-20'}));
});
test('questionsById includes compound stop/question key',()=>{
 const x=questionsById(make());assert.equal(x.size,1);assert.ok(x.has('stop-1/question-1'));
});
test('identical packets create no audit events',()=>{
 const p=make();assert.deepEqual(createEvents(p,p,'2026-11-20'),[]);
});
test('invalid timestamp yields no event',()=>{
 const p=make();assert.deepEqual(createEvents(emptyPacket('2026-11-20'),p,'bad-date'),[]);
});
test('new question creates QUESTION_ADDED',()=>{
 const p=make(),diff=createEvents(emptyPacket('2026-11-20'),p,'2026-11-20');
 assert.equal(diff.length,1);assert.equal(diff[0].type,'QUESTION_ADDED');
 assert.equal(diff[0].beforeAnswer,null);assert.equal(diff[0].afterAnswer,'UNKNOWN');
});
test('unknown to reported creates ANSWER_RECORDED',()=>{
 const p=make(),n=changed(p,{answer:'YES_REPORTED'}),diff=createEvents(p,n,'2026-11-20');
 assert.equal(diff[0].type,'ANSWER_RECORDED');
 assert.equal(diff[0].beforeAnswer,'UNKNOWN');assert.equal(diff[0].afterAnswer,'YES_REPORTED');
});
test('reported yes to reported no creates ANSWER_CHANGED',()=>{
 const p=changed(make(),{answer:'YES_REPORTED'}),n=changed(p,{answer:'NO_REPORTED'}),diff=createEvents(p,n,'2026-11-20');
 assert.equal(diff[0].type,'ANSWER_CHANGED');
});
test('source change produces SOURCE_CHANGED even with same answer',()=>{
 const p=make(),q=p.stops[0].questions[0],n=changed(p,{source:{...q.source,name:'New source'}});
 const diff=createEvents(p,n,'2026-11-20');assert.deepEqual(diff.map(x=>x.type),['SOURCE_CHANGED']);
});
test('review change produces REVIEW_CHANGED',()=>{
 const p=make(),n=changed(p,{review:'NEEDS_CONTACT'});
 assert.deepEqual(createEvents(p,n,'2026-11-20').map(x=>x.type),['REVIEW_CHANGED']);
});
test('question removal produces QUESTION_REMOVED',()=>{
 const p=make(),n=removeQuestion(p,'stop-1','question-1'),diff=createEvents(p,n,'2026-11-20');
 assert.equal(diff[0].type,'QUESTION_REMOVED');assert.equal(diff[0].afterAnswer,null);
});
test('compound answer and source change creates both audit events',()=>{
 const p=make(),q=p.stops[0].questions[0],n=changed(p,{answer:'PARTIAL_REPORTED',source:{...q.source,tier:'COMMUNITY'}});
 assert.deepEqual(createEvents(p,n,'2026-11-20').map(x=>x.type),['ANSWER_RECORDED','SOURCE_CHANGED']);
});
test('ledger append preserves existing events',()=>{
 const p=make(),events=createEvents(emptyPacket('2026-11-20'),p,'2026-11-20');const before=emptyLedger(),after=appendEvents(before,events);
 assert.equal(before.events.length,0);assert.equal(after.events.length,1);
});
test('duplicate event ids do not repeat',()=>{
 const events=createEvents(emptyPacket('2026-11-20'),make(),'2026-11-20');const once=appendEvents(emptyLedger(),events),twice=appendEvents(once,events);
 assert.equal(twice,once);
});
test('no new events returns previous ledger object',()=>{
 const ledger=emptyLedger();assert.equal(appendEvents(ledger,[]),ledger);
});
test('history search isolates a question',()=>{
 const p=make(),events=createEvents(emptyPacket('2026-11-20'),p,'2026-11-20'),ledger=appendEvents(emptyLedger(),events);
 assert.equal(evidenceEventsFor(ledger,'stop-1','question-1').length,1);
 assert.equal(evidenceEventsFor(ledger,'stop-1','question-2').length,0);
});
test('ledger text never claims real-world verification',()=>{
 const p=make(),events=createEvents(emptyPacket('2026-11-20'),p,'2026-11-20');const text=eventPlainText(appendEvents(emptyLedger(),events),'en');
 assert.ok(text.includes('Local evidence change history'));assert.ok(text.includes('QUESTION_ADDED'));
});
test('French ledger text has translated heading',()=>{
 const text=eventPlainText(emptyLedger(),'fr');assert.ok(text.includes('Historique local'));
});
for(const type of EVENT_TYPES){
 test(`audit type ${type} is permitted`,()=>{
 const event={...createEvents(emptyPacket('2026-11-20'),make(),'2026-11-20')[0],type};
 assert.equal(eventIssues(event,'$').some(x=>x.code==='event.type'),false);
 });
}
for(const wrong of ['PUBLISHED','CONFIRMED','GUARANTEED','',null]){
 test(`invalid audit type ${String(wrong)} rejected`,()=>{
 const event={...createEvents(emptyPacket('2026-11-20'),make(),'2026-11-20')[0],type:wrong};
 assert.ok(eventIssues(event,'$').some(x=>x.code==='event.type'));
 });
}
test('event not an object is rejected',()=>assert.deepEqual(eventIssues(null,'$'),[{code:'event.object',path:'$'}]));
test('ledger not an object is rejected',()=>assert.deepEqual(ledgerIssues(null),[{code:'ledger.object',path:'$'}]));
test('invalid ledger version rejected',()=>assert.ok(ledgerIssues({version:2,events:[]}).some(x=>x.code==='ledger.version')));
test('invalid ledger events rejected',()=>assert.ok(ledgerIssues({version:1,events:null}).some(x=>x.code==='ledger.events')));
test('duplicate event id rejected',()=>{
 const event=createEvents(emptyPacket('2026-11-20'),make(),'2026-11-20')[0];
 assert.ok(ledgerIssues({version:1,events:[event,event]}).some(x=>x.code==='event.duplicate'));
});
test('event retention cap preserves most recent entries',()=>{
 const event=createEvents(emptyPacket('2026-11-20'),make(),'2026-11-20')[0];
 const many=Array.from({length:MAX_EVENTS+4},(_,i)=>({...event,id:`event-${i+1}`}));
 const out=appendEvents(emptyLedger(),many);
 assert.equal(out.events.length,MAX_EVENTS);assert.equal(out.events.at(-1).id,`event-${MAX_EVENTS+4}`);
});
for(const date of ['2026-02-30','2026-13-01','UNKNOWN',''] ){
 test(`invalid event date rejected ${date}`,()=>{
 const event={...createEvents(emptyPacket('2026-11-20'),make(),'2026-11-20')[0],recordedOn:date};
 assert.ok(eventIssues(event,'$').some(x=>x.code==='event.date'));
 });
}
