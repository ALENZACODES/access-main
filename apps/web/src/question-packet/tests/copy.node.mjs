import test from 'node:test';
import assert from 'node:assert/strict';
import {LABELS,TOPIC_LABELS,ANSWER_LABELS,REVIEW_LABELS,TIER_LABELS,labels,answerLabel,reviewLabel,topicLabel,tierLabel} from '../copy.ts';
import {TOPICS,ANSWERS,REVIEWS,TIERS,frenchErrors} from '../model.ts';
test('both languages have same copy keys',()=>assert.deepEqual(Object.keys(LABELS.en).sort(),Object.keys(LABELS.fr).sort()));
test('French typography is valid for user-facing copy',()=>{
 for(const [key,value] of Object.entries(LABELS.fr))assert.deepEqual(frenchErrors(value),[],`copy ${key}`);
});
test('all public copy values are nonempty',()=>{
 for(const locale of ['en','fr'])for(const [key,value] of Object.entries(LABELS[locale])){
   assert.equal(typeof value,'string',key);assert.ok(value.trim().length>0,key);
 }
});
test('no branding and endorsement claims in labels',()=>{
 for(const locale of ['en','fr']){
  const joined=Object.values(LABELS[locale]).join(' ');
  assert.equal(/\b(?:official partner|endorsed by|guaranteed accessible|real-time verified)\b/i.test(joined),false);
 }
});
test('language picker returns correct dictionary',()=>{
 assert.equal(labels('en'),LABELS.en);assert.equal(labels('fr'),LABELS.fr);
});
for(const locale of ['en','fr']){
 test(`answers complete for ${locale}`,()=>assert.deepEqual(Object.keys(ANSWER_LABELS[locale]).sort(),[...ANSWERS].sort()));
 test(`topics complete for ${locale}`,()=>assert.deepEqual(Object.keys(TOPIC_LABELS[locale]).sort(),[...TOPICS].sort()));
 test(`review statuses complete for ${locale}`,()=>assert.deepEqual(Object.keys(REVIEW_LABELS[locale]).sort(),[...REVIEWS].sort()));
 test(`source tiers complete for ${locale}`,()=>assert.deepEqual(Object.keys(TIER_LABELS[locale]).sort(),[...TIERS].sort()));
 for(const answer of ANSWERS){
  test(`answer label in ${locale}: ${answer}`,()=>assert.equal(answerLabel(locale,answer),ANSWER_LABELS[locale][answer]));
 }
 for(const review of REVIEWS){
  test(`review label in ${locale}: ${review}`,()=>assert.equal(reviewLabel(locale,review),REVIEW_LABELS[locale][review]));
 }
 for(const topic of TOPICS){
  test(`topic label in ${locale}: ${topic}`,()=>assert.equal(topicLabel(locale,topic),TOPIC_LABELS[locale][topic]));
 }
 for(const tier of TIERS){
  test(`source tier label in ${locale}: ${tier}`,()=>assert.equal(tierLabel(locale,tier),TIER_LABELS[locale][tier]));
 }
}
for(const [dict,name] of [[TOPIC_LABELS,'topic'],[ANSWER_LABELS,'answer'],[REVIEW_LABELS,'review'],[TIER_LABELS,'tier']]){
 test(`${name} French translations have valid punctuation`,()=>{
  for(const [key,value] of Object.entries(dict.fr))assert.deepEqual(frenchErrors(value),[],key);
 });
 test(`${name} labels do not include empty English`,()=>{
  for(const [key,value] of Object.entries(dict.en))assert.ok(value.length>0,key);
 });
}
test('unknown is spelled UNKNOWN identically in both languages',()=>{
 assert.equal(answerLabel('en','UNKNOWN'),'UNKNOWN');assert.equal(answerLabel('fr','UNKNOWN'),'UNKNOWN');
 assert.equal(tierLabel('fr','UNKNOWN'),'UNKNOWN');assert.equal(reviewLabel('en','UNKNOWN'),'UNKNOWN');
});
test('user-facing warning denies unjustified inferences',()=>{
 assert.ok(LABELS.en.cannotInfer.includes('missing answer'));
 assert.ok(LABELS.fr.cannotInfer.includes('réponse manquante'));
});
test('user-facing copy discloses no automatic uploads',()=>{
 assert.ok(LABELS.en.local.includes('not sent'));
 assert.ok(LABELS.fr.local.includes('Aucune donnée'));
});
