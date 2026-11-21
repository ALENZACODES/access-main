import test from 'node:test';
import assert from 'node:assert/strict';
import {QUESTION_TEMPLATES,templateById,questionsForTopic,templateQuestion,templateCatalogueCounts} from '../templates.ts';
import {TOPICS,frenchErrors,questionFindings} from '../model.ts';
test('template IDs are unique',()=>assert.equal(new Set(QUESTION_TEMPLATES.map(t=>t.id)).size,QUESTION_TEMPLATES.length));
test('templates cover each topic',()=>{
 for(const topic of TOPICS)assert.ok(questionsForTopic(topic).length>=1,topic);
});
test('templates never assert accessibility of named places',()=>{
 for(const template of QUESTION_TEMPLATES){
  assert.equal(/\b(?:Toronto|Ottawa|Hamilton|Richmond Hill)\b/i.test(template.prompt.en),false);
  assert.equal(template.prompt.en.endsWith('?'),true);
  assert.equal(template.prompt.fr.endsWith(' ?'),true);
 }
});
test('templates have valid French typography',()=>{
 for(const template of QUESTION_TEMPLATES){
  assert.deepEqual(frenchErrors(template.prompt.fr),[],template.id);
  assert.deepEqual(frenchErrors(template.detail.fr),[],template.id);
 }
});
test('each template creates UNKNOWN answer and UNKNOWN provenance',()=>{
 for(const template of QUESTION_TEMPLATES){
  const q=templateQuestion(template.id,'question-1');assert.ok(q);
  assert.equal(q.answer,'UNKNOWN');assert.equal(q.source.tier,'UNKNOWN');assert.equal(q.review,'UNKNOWN');
 }
});
test('template generation does not share mutable nested source objects',()=>{
 const a=templateQuestion('arrival-route','question-1'),b=templateQuestion('arrival-route','question-2');
 assert.notEqual(a.source,b.source);assert.notEqual(a.prompt,b.prompt);
});
test('missing template yields null',()=>assert.equal(templateQuestion('not-present','question-1'),null));
test('missing template lookup yields undefined',()=>assert.equal(templateById('not-present'),undefined));
test('missing topic is empty',()=>assert.deepEqual(questionsForTopic('not-present'),[]));
test('template count total matches catalogue length',()=>{
 const counts=templateCatalogueCounts();assert.equal(Object.values(counts).reduce((a,b)=>a+b,0),QUESTION_TEMPLATES.length);
});
test('template question retains requested order',()=>assert.equal(templateQuestion('entrance-steps','question-9',5).order,5));
for(const template of QUESTION_TEMPLATES){
 test(`template ID ${template.id} can be looked up`,()=>assert.deepEqual(templateById(template.id),template));
 test(`template ${template.id} has valid bilingual question`,()=>{
  const question=templateQuestion(template.id,'question-1');
  const codes=questionFindings(question,'$').filter(x=>x.severity==='error');assert.deepEqual(codes,[]);
 });
 test(`template ${template.id} retains matching topic`,()=>assert.equal(templateQuestion(template.id,'question-1').topic,template.topic));
 test(`template ${template.id} is included in matching topic`,()=>{
  assert.ok(questionsForTopic(template.topic).some(t=>t.id===template.id));
 });
}
for(const topic of TOPICS){
 test(`catalogue count ${topic} equals filtered questions`,()=>assert.equal(templateCatalogueCounts()[topic],questionsForTopic(topic).length));
}
