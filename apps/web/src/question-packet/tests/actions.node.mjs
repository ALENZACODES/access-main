import test from 'node:test';
import assert from 'node:assert/strict';
import {addStop,replaceStop,removeStop,moveStop,addQuestion,replaceQuestion,removeQuestion,moveQuestion,
  blankStop,blankQuestion,emptyPacket,MAX_STOPS,MAX_QUESTIONS,summary} from '../model.ts';
const start=()=>emptyPacket('2026-11-20');
const withStops=(count)=>Array.from({length:count},(_,i)=>({...blankStop(`stop-${i+1}`,i),title:{en:`Stop ${i+1}`,fr:`Étape ${i+1}`}})).reduce((p,s)=>addStop(p,s),start());
const withQuestions=(count)=>Array.from({length:count},(_,i)=>blankQuestion(`question-${i+1}`,i)).reduce((p,q)=>addQuestion(p,'stop-1',q),withStops(1));
test('addStop is immutable',()=>{const p=start(),q=addStop(p,blankStop('stop-1'));assert.equal(p.stops.length,0);assert.equal(q.stops.length,1);});
test('stop order determined by insertion',()=>{const q=addStop(withStops(1),blankStop('stop-2',99));assert.equal(q.stops[1].order,1);});
test('duplicate stop id is never admitted',()=>{const p=withStops(1);assert.equal(addStop(p,blankStop('stop-1')),p);});
test('stop cap cannot be exceeded',()=>{const p=withStops(MAX_STOPS);assert.equal(addStop(p,blankStop('stop-next')),p);});
test('replaceStop preserves stop order',()=>{const p=withStops(2),s=p.stops[1];assert.ok(s);const n=replaceStop(p,{...s,order:99,title:{en:'Changed',fr:'Modifié'}});assert.equal(n.stops[1].order,1);assert.equal(n.stops[1].title.fr,'Modifié');});
test('removeStop renumbers remaining stops',()=>{const p=removeStop(withStops(3),'stop-2');assert.deepEqual(p.stops.map(s=>s.order),[0,1]);assert.deepEqual(p.stops.map(s=>s.id),['stop-1','stop-3']);});
test('remove absent stop is a no-loss operation',()=>{const p=withStops(2);assert.deepEqual(removeStop(p,'stop-9'),p);});
test('move stop swaps only adjacent stops',()=>{const p=moveStop(withStops(3),'stop-2',1);assert.deepEqual(p.stops.map(s=>s.id),['stop-1','stop-3','stop-2']);});
test('move first stop up returns original packet',()=>{const p=withStops(3);assert.equal(moveStop(p,'stop-1',-1),p);});
test('move last stop down returns original packet',()=>{const p=withStops(3);assert.equal(moveStop(p,'stop-3',1),p);});
test('move missing stop returns original packet',()=>{const p=withStops(3);assert.equal(moveStop(p,'stop-8',-1),p);});
test('add question to known stop',()=>{const p=withQuestions(1);assert.equal(p.stops[0].questions.length,1);assert.equal(p.stops[0].questions[0].answer,'UNKNOWN');});
test('add question to unknown stop does not modify',()=>{const p=withStops(1);assert.deepEqual(addQuestion(p,'missing',blankQuestion('question-1')),p);});
test('duplicate question is not added',()=>{const p=withQuestions(1),n=addQuestion(p,'stop-1',blankQuestion('question-1'));assert.deepEqual(n,p);});
test('question cap cannot be exceeded',()=>{const p=withQuestions(MAX_QUESTIONS),n=addQuestion(p,'stop-1',blankQuestion('question-next'));assert.deepEqual(n,p);});
test('question order normalized on add',()=>{const p=addQuestion(withQuestions(1),'stop-1',blankQuestion('question-2',999));assert.equal(p.stops[0].questions[1].order,1);});
test('question editing preserves order',()=>{const p=withQuestions(2),q=p.stops[0].questions[1];assert.ok(q);const n=replaceQuestion(p,'stop-1',{...q,order:99,answer:'YES_REPORTED'});assert.equal(n.stops[0].questions[1].order,1);assert.equal(n.stops[0].questions[1].answer,'YES_REPORTED');});
test('remove question renumbers others',()=>{const p=removeQuestion(withQuestions(3),'stop-1','question-2');assert.deepEqual(p.stops[0].questions.map(q=>q.order),[0,1]);});
test('move question up changes order',()=>{const p=moveQuestion(withQuestions(3),'stop-1','question-2',-1);assert.deepEqual(p.stops[0].questions.map(q=>q.id),['question-2','question-1','question-3']);});
test('move question down changes order',()=>{const p=moveQuestion(withQuestions(3),'stop-1','question-2',1);assert.deepEqual(p.stops[0].questions.map(q=>q.id),['question-1','question-3','question-2']);});
test('cannot move first question up',()=>{const p=withQuestions(2);assert.deepEqual(moveQuestion(p,'stop-1','question-1',-1),p);});
test('cannot move last question down',()=>{const p=withQuestions(2);assert.deepEqual(moveQuestion(p,'stop-1','question-2',1),p);});
test('cannot move question in missing stop',()=>{const p=withQuestions(2);assert.deepEqual(moveQuestion(p,'stop-2','question-1',1),p);});
test('cannot move missing question',()=>{const p=withQuestions(2);assert.deepEqual(moveQuestion(p,'stop-1','question-99',1),p);});
test('summary counts unresolved questions without inventing status',()=>{
 const s=summary(withQuestions(3));assert.deepEqual({questions:s.questions,unknown:s.unknown,answered:s.answered,sourced:s.sourced},
 {questions:3,unknown:3,answered:0,sourced:0});
});
test('summary recognizes recorded answers and follow-ups',()=>{
 let p=withQuestions(3);const qs=p.stops[0].questions;
 p=replaceQuestion(p,'stop-1',{...qs[0],answer:'YES_REPORTED',review:'RECORDED',source:{name:'User',url:'UNKNOWN',date:'UNKNOWN',licence:'CC0',tier:'FIRST_HAND'}});
 p=replaceQuestion(p,'stop-1',{...qs[1],review:'NEEDS_CONTACT'});
 p=replaceQuestion(p,'stop-1',{...qs[2],review:'NEEDS_RECHECK'});
 const s=summary(p);assert.equal(s.answered,1);assert.equal(s.unknown,2);assert.equal(s.toContact,1);assert.equal(s.toRecheck,1);assert.equal(s.sourced,1);
});
for(const count of [0,1,2,3,10,20]){
 test(`adding ${count} stops gives monotone unique orders`,()=>{const p=withStops(count);assert.deepEqual(p.stops.map(s=>s.order),Array.from({length:count},(_,i)=>i));});
 test(`adding ${count} questions gives monotone unique orders`,()=>{const p=withQuestions(count);assert.deepEqual(p.stops[0].questions.map(q=>q.order),Array.from({length:count},(_,i)=>i));});
}
for(const size of [1,2,3,5,10]){
 test(`permutation preserves distinct stop IDs for ${size} stops`,()=>{
   let p=withStops(size);
   for(let i=0;i<size-1;i++)p=moveStop(p,`stop-${i+1}`,1);
   assert.equal(new Set(p.stops.map(s=>s.id)).size,size);
 });
 test(`permutation preserves distinct question IDs for ${size} questions`,()=>{
   let p=withQuestions(size);
   for(let i=0;i<size-1;i++)p=moveQuestion(p,'stop-1',`question-${i+1}`,1);
   assert.equal(new Set(p.stops[0].questions.map(q=>q.id)).size,size);
 });
}
