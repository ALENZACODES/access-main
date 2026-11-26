import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyPacket,blankStop,blankQuestion,addStop,addQuestion,replaceQuestion} from '../model.ts';
import {answerQuality,questionAudit,auditPacket,auditText,auditGroupByStop,changesNeeded} from '../audit.ts';
const source={name:'Visitor',licence:'CC0',date:'2026-11-20',url:'https://example.org',tier:'FIRST_HAND'};
const make=()=>addQuestion(addStop(emptyPacket('2026-11-20'),blankStop('stop-1')),'stop-1',blankQuestion('question-1'));
const update=(p,changes)=>replaceQuestion(p,'stop-1',{...p.stops[0].questions[0],...changes});
test('new question is explicitly UNKNOWN quality',()=>assert.equal(answerQuality(make().stops[0].questions[0]),'UNKNOWN'));
test('reported answer with no source is unsourced',()=>{
 const p=update(make(),{answer:'YES_REPORTED'});assert.equal(answerQuality(p.stops[0].questions[0]),'UNSOURCED');
});
test('sourced answer with no review is follow-up',()=>{
 const p=update(make(),{answer:'YES_REPORTED',source});assert.equal(answerQuality(p.stops[0].questions[0]),'FOLLOW_UP');
});
test('sourced and recorded answer has recorded quality',()=>{
 const p=update(make(),{answer:'YES_REPORTED',source,review:'RECORDED'});assert.equal(answerQuality(p.stops[0].questions[0]),'RECORDED');
});
test('unknown answer is not made reliable by a source',()=>{
 const p=update(make(),{answer:'UNKNOWN',source,review:'RECORDED'});assert.equal(answerQuality(p.stops[0].questions[0]),'UNKNOWN');
});
test('UNKNOWN creates a review finding not a conclusion',()=>{
 const p=make(),result=questionAudit(p.stops[0],p.stops[0].questions[0],'en');
 assert.ok(result.some(i=>i.code==='MISSING_ANSWER'));assert.ok(result.every(i=>i.severity==='review'));
});
test('reported answer lacking provenance is a review item',()=>{
 const p=update(make(),{answer:'YES_REPORTED'}),issues=questionAudit(p.stops[0],p.stops[0].questions[0],'en');
 assert.ok(issues.some(i=>i.code==='MISSING_SOURCE'));
});
test('malformed source date produces an error',()=>{
 const p=update(make(),{answer:'YES_REPORTED',source:{...source,date:'2026-02-30'}});
 assert.ok(questionAudit(p.stops[0],p.stops[0].questions[0],'en').some(i=>i.code==='SOURCE_DATE'&&i.severity==='error'));
});
test('unsafe source URL produces error',()=>{
 const p=update(make(),{answer:'YES_REPORTED',source:{...source,url:'javascript:alert(1)'}});
 assert.ok(questionAudit(p.stops[0],p.stops[0].questions[0],'en').some(i=>i.code==='INVALID_FIELD'&&i.severity==='error'));
});
test('missing review creates follow-up review item',()=>{
 const p=update(make(),{answer:'YES_REPORTED',source});
 assert.ok(questionAudit(p.stops[0],p.stops[0].questions[0],'en').some(i=>i.code==='MISSING_REVIEW'));
});
test('not applicable with recheck requested flags a conflict',()=>{
 const p=update(make(),{answer:'NOT_APPLICABLE',source,review:'NEEDS_RECHECK'});
 assert.ok(questionAudit(p.stops[0],p.stops[0].questions[0],'en').some(i=>i.code==='CONFLICT'));
});
test('fully documented answer has no review issues',()=>{
 const p=update(make(),{answer:'YES_REPORTED',source,review:'RECORDED'});
 assert.deepEqual(questionAudit(p.stops[0],p.stops[0].questions[0],'en'),[]);
});
test('audit of empty packet has zero findings',()=>{
 const r=auditPacket(emptyPacket('2026-11-20'),'en');assert.equal(r.errors,0);assert.equal(r.questions,0);assert.equal(r.complete,0);
});
test('audit counts UNKNOWN questions',()=>{
 const r=auditPacket(make(),'en');assert.equal(r.unknown,1);assert.equal(r.complete,0);assert.equal(r.reviews,1);
});
test('audit counts recorded answers separately',()=>{
 const r=auditPacket(update(make(),{answer:'YES_REPORTED',source,review:'RECORDED'}),'en');assert.equal(r.complete,1);assert.equal(r.unknown,0);
});
test('audit retains validation errors for malformed IDs',()=>{
 const p=make(),q=p.stops[0].questions[0],wrong={...p,stops:[{...p.stops[0],questions:[{...q,id:'BAD'}]}]};
 assert.ok(auditPacket(wrong,'en').issues.some(i=>i.code==='INVALID_FIELD'));
});
test('audit supports French issue descriptions',()=>{
 const r=auditPacket(make(),'fr');assert.ok(r.issues[0].description.includes('réponse'));
});
test('audit text includes UNKNOWN',()=>assert.ok(auditText(auditPacket(make(),'en'),'en').includes('UNKNOWN')));
test('audit text has French heading',()=>assert.ok(auditText(auditPacket(make(),'fr'),'fr').includes('Examen des éléments')));
test('audit group partitions issues by stop id',()=>{
 const r=auditPacket(make(),'en'),group=auditGroupByStop(r);assert.equal(group.get('stop-1').length,1);
});
test('changes needed for an unresolved question',()=>assert.equal(changesNeeded(auditPacket(make(),'en')),true));
test('changes not needed for fully recorded answer',()=>{
 const r=auditPacket(update(make(),{answer:'YES_REPORTED',source,review:'RECORDED'}),'en');assert.equal(changesNeeded(r),false);
});
for(const answer of ['YES_REPORTED','NO_REPORTED','PARTIAL_REPORTED','NOT_APPLICABLE']){
 test(`known answer ${answer} without provenance requires review`,()=>{
  const p=update(make(),{answer});assert.ok(auditPacket(p,'en').issues.some(i=>i.code==='MISSING_SOURCE'));
 });
 test(`known answer ${answer} with provenance is not UNKNOWN`,()=>{
  const p=update(make(),{answer,source,review:'RECORDED'});assert.equal(auditPacket(p,'en').unknown,0);
 });
}
for(const url of ['http:' + '//example.org','https://localhost/private','javascript:alert(1)','https://user:password@example.org']){
 test(`unsafe audit source URL rejected ${url}`,()=>{
  const p=update(make(),{answer:'YES_REPORTED',source:{...source,url}});assert.ok(auditPacket(p,'en').errors>0);
 });
}