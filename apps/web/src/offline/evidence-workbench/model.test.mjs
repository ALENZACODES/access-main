import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
 VERSION, UNKNOWN, FEATURES, STATES, TIERS, DECISIONS, MAX_BYTES, MAX_ITEMS,
 isRecord, validId, validDay, hasForbiddenControls, goodText, ownKeys,
 validateItem, validateDocument, parseDocument, emptyDocument, makeDraft,
 safeDateToday, displayState, cloneDocument
} from './model.ts';
const today='2026-11-20';
const item=(changes={})=>({...makeDraft('note-1','fictional-place',today),...changes});
const document=(...items)=>({version:1,items});
const codes=result=>result.problems.map(problem=>problem.code);

test('document version is frozen to the first version',()=>{
 assert.equal(VERSION,1);
 assert.equal(emptyDocument().version,1);
 assert.deepEqual(emptyDocument().items,[]);
});
test('unknown is a literal display token, not a positive access observation',()=>{
 assert.equal(UNKNOWN,'UNKNOWN');
 assert.equal(STATES[0],UNKNOWN);
 assert.equal(displayState('unknown'),UNKNOWN);
 assert.equal(displayState('reported'),'reported');
});
test('features include the nine explicit categories',()=>{
 assert.equal(FEATURES.length,9);
 assert.ok(FEATURES.includes('entrance'));
 assert.ok(FEATURES.includes('parking'));
 assert.ok(FEATURES.includes('other'));
});
test('review decisions do not include a verified state',()=>{
 assert.deepEqual(DECISIONS,['unreviewed','needs-source','needs-recheck','reviewed']);
 assert.equal(DECISIONS.includes('verified'),false);
});
test('tiers do not claim independent official verification',()=>{
 assert.deepEqual(TIERS,['unknown','self-reported','documented','field-observed']);
 assert.equal(TIERS.includes('verified'),false);
});
test('only ordinary objects pass the record guard',()=>{
 assert.equal(isRecord({}),true);
 assert.equal(isRecord(Object.create(null)),true);
 assert.equal(isRecord([]),false);
 assert.equal(isRecord(null),false);
 assert.equal(isRecord(new Date()),false);
 assert.equal(isRecord('text'),false);
});
test('valid identifier accepts ordinary unambiguous ids',()=>{
 for(const value of ['a','A','a-1','a_1','a.b','a:b','a123'])assert.equal(validId(value),true,value);
});
test('valid identifier rejects unsafe or empty ids',()=>{
 for(const value of ['',null,1,'..','/place','a/b','a b',' a','a\n','é',':prefix'])assert.equal(validId(value),false,String(value));
});
test('reserved object keys cannot be used as identifiers',()=>{
 for(const value of ['__proto__','constructor','prototype'])assert.equal(validId(value),false,value);
});
test('identifier length is bounded',()=>{
 assert.equal(validId('a'.repeat(96)),true);
 assert.equal(validId('a'.repeat(97)),false);
});
test('calendar dates support leap days',()=>{
 for(const value of ['2024-02-29','2000-02-29','2026-11-20','0001-01-01'])assert.equal(validDay(value),true,value);
});
test('calendar dates reject impossible dates',()=>{
 for(const value of ['2026-02-29','1900-02-29','2026-04-31','2026-13-01','2026-00-01','2026-11-31'])assert.equal(validDay(value),false,value);
});
test('calendar rejects short and malformed text',()=>{
 for(const value of ['',null,42,'2026-1-1','2026/11/20','2026-11-20T00:00','0000-01-01'])assert.equal(validDay(value),false,String(value));
});
test('controls include ASCII terminal escapes',()=>{
 assert.equal(hasForbiddenControls('hello'),false);
 assert.equal(hasForbiddenControls('a\u001b[31m'),true);
 assert.equal(hasForbiddenControls('a\u0000b'),true);
 assert.equal(hasForbiddenControls('a\u007fb'),true);
});
test('controls are refused even when the note looks otherwise useful',()=>{
 for(const value of ['test\nline','test\tline','test\rline'])assert.equal(hasForbiddenControls(value),true);
});
test('valid text keeps non-ASCII characters',()=>{
 assert.equal(goodText('porte extérieure',50),true);
 assert.equal(goodText('entrée',50),true);
 assert.equal(goodText('révision',50),true);
});
test('text must be trimmed before validation',()=>{
 assert.equal(goodText(' leading',50),false);
 assert.equal(goodText('trailing ',50),false);
 assert.equal(goodText(' spaced ',50),false);
});
test('required and optional empty text differ',()=>{
 assert.equal(goodText('',10),false);
 assert.equal(goodText('',10,true),true);
 assert.equal(goodText(' ',10,true),false);
});
test('text length is enforced exactly',()=>{
 assert.equal(goodText('x'.repeat(120),120),true);
 assert.equal(goodText('x'.repeat(121),120),false);
 assert.equal(goodText('x'.repeat(20),19),false);
});
test('bad Unicode replacement character is rejected',()=>{
 assert.equal(goodText('bad\uFFFDtext',100),false);
 assert.equal(goodText('normal text',100),true);
});
test('only own allowed keys pass',()=>{
 assert.equal(ownKeys({a:1,b:2},['a','b']),true);
 assert.equal(ownKeys({a:1,c:2},['a','b']),false);
 assert.equal(ownKeys({},['a']),true);
});
test('prototype keys cannot pass an allowed list',()=>{
 const data=JSON.parse('{"__proto__":2}');
 assert.equal(ownKeys(data,['__proto__']),false);
});
test('a fictional draft is valid with complete provenance fields',()=>{
 const record=item();
 assert.equal(record.placeId,'fictional-place');
 assert.equal(record.state,UNKNOWN);
 assert.equal(record.tier,'unknown');
 assert.equal(record.licence,UNKNOWN);
 assert.equal(validateItem(record,0,today).ok,true);
});
test('a human-reviewed note does not turn UNKNOWN into a claim',()=>{
 const record=item({decision:'reviewed',state:UNKNOWN});
 const checked=validateItem(record,0,today);
 assert.equal(checked.ok,true);
 assert.equal(checked.value.state,UNKNOWN);
});
test('future evidence retrieval date is rejected',()=>{
 const result=validateItem(item({retrievedOn:'2026-11-21'}),0,today);
 assert.equal(result.ok,false);
 assert.ok(codes(result).includes('INVALID_DATE'));
});
test('record without source fails closed',()=>{
 const record=item();delete record.source;
 const result=validateItem(record,2,today);
 assert.equal(result.ok,false);
 assert.ok(codes(result).includes('SOURCE_REQUIRED'));
 assert.ok(codes(result).includes('MISSING_FIELD'));
});
test('record without licence fails closed',()=>{
 const record=item();delete record.licence;
 const result=validateItem(record,2,today);
 assert.equal(result.ok,false);
 assert.ok(codes(result).includes('LICENCE_REQUIRED'));
});
test('record without verification tier fails closed',()=>{
 const record=item();delete record.tier;
 const result=validateItem(record,2,today);
 assert.equal(result.ok,false);
 assert.ok(codes(result).includes('INVALID_TIER'));
});
test('record without retrieval date fails closed',()=>{
 const record=item();delete record.retrievedOn;
 const result=validateItem(record,2,today);
 assert.equal(result.ok,false);
 assert.ok(codes(result).includes('INVALID_DATE'));
});
test('records reject unexpected fields rather than storing personal data silently',()=>{
 const record=item({email:'secret@example.test'});
 const result=validateItem(record,0,today);
 assert.equal(result.ok,false);
 assert.ok(codes(result).includes('UNKNOWN_FIELD'));
});
test('records reject invalid states',()=>{
 for(const state of ['yes','accessible','verified','inaccessible','pass']){
  const result=validateItem(item({state}),0,today);
  assert.ok(codes(result).includes('INVALID_STATE'),state);
 }
});
test('records reject invalid tiers',()=>{
 for(const tier of ['verified','official',5,'validated','certified']){
  const result=validateItem(item({tier}),0,today);
  assert.ok(codes(result).includes('INVALID_TIER'),String(tier));
 }
});
test('records reject invalid decisions',()=>{
 for(const decision of ['approved','pass','eligible','endorsement','safe']){
  const result=validateItem(item({decision}),0,today);
  assert.ok(codes(result).includes('INVALID_DECISION'),decision);
 }
});
test('records reject invalid categories',()=>{
 for(const feature of ['hotel','clinic','insurance','medical','benefits']){
  const result=validateItem(item({feature}),0,today);
  assert.ok(codes(result).includes('INVALID_FEATURE'),feature);
 }
});
test('label length cannot exceed 120',()=>{
 const result=validateItem(item({label:'x'.repeat(121)}),0,today);
 assert.ok(codes(result).includes('INVALID_LABEL'));
});
test('source length cannot exceed 400',()=>{
 const result=validateItem(item({source:'x'.repeat(401)}),0,today);
 assert.ok(codes(result).includes('SOURCE_REQUIRED'));
});
test('licence length cannot exceed 120',()=>{
 const result=validateItem(item({licence:'x'.repeat(121)}),0,today);
 assert.ok(codes(result).includes('LICENCE_REQUIRED'));
});
test('notes accept empty but refuse longer than the limit',()=>{
 assert.equal(validateItem(item({note:''}),0,today).ok,true);
 assert.ok(codes(validateItem(item({note:'x'.repeat(1201)}),0,today)).includes('INVALID_NOTE'));
});
test('notes refuse embedded control characters',()=>{
 const result=validateItem(item({note:'line\nnext'}),0,today);
 assert.ok(codes(result).includes('INVALID_NOTE'));
});
test('the error path identifies the record index',()=>{
 const result=validateItem(item({label:''}),7,today);
 assert.ok(result.problems.some(p=>p.path==='items[7].label'));
});
test('non-object inputs are rejected',()=>{
 for(const input of [null,'hello',[],42,true]){
  const result=validateItem(input,4,today);
  assert.equal(result.ok,false);
  assert.deepEqual(result.problems,[{code:'ITEM_OBJECT',path:'items[4]'}]);
 }
});
test('validated record is rebuilt without extra references',()=>{
 const original=item();
 const result=validateItem(original,0,today);
 assert.equal(result.ok,true);
 assert.notEqual(result.value,original);
 assert.deepEqual(result.value,original);
});
test('document accepts zero items',()=>{
 const result=validateDocument(document(),today);
 assert.equal(result.ok,true);
 assert.deepEqual(result.value.items,[]);
});
test('document accepts two independent fictional items',()=>{
 const result=validateDocument(document(item(),item({id:'note-2'})),today);
 assert.equal(result.ok,true);
 assert.equal(result.value.items.length,2);
});
test('duplicate ids fail even if every other field differs',()=>{
 const result=validateDocument(document(item(),item({label:'New label',state:'reported'})),today);
 assert.ok(codes(result).includes('DUPLICATE_ID'));
});
test('duplicate ids are checked across records with the same place',()=>{
 const result=validateDocument(document(item(),item({id:'note-2'}),item({id:'note-2'})),today);
 assert.ok(codes(result).includes('DUPLICATE_ID'));
});
test('document rejects unsupported schema version',()=>{
 const result=validateDocument({...document(),version:2},today);
 assert.ok(codes(result).includes('VERSION'));
});
test('document rejects unknown properties',()=>{
 const result=validateDocument({...document(),password:'do-not-keep'},today);
 assert.ok(codes(result).includes('UNKNOWN_FIELD'));
});
test('document rejects non-arrays as items',()=>{
 for(const items of [null,{},'items',3]){
  const result=validateDocument({version:1,items},today);
  assert.ok(codes(result).includes('ITEMS'));
 }
});
test('the maximum item count is bounded',()=>{
 const all=Array.from({length:MAX_ITEMS+1},(_,index)=>item({id:`note-${index}`}));
 const result=validateDocument(document(...all),today);
 assert.ok(codes(result).includes('ITEMS'));
});
test('exact maximum unique item count is accepted',()=>{
 const all=Array.from({length:MAX_ITEMS},(_,index)=>item({id:`note-${index}`}));
 const result=validateDocument(document(...all),today);
 assert.equal(result.ok,true);
 assert.equal(result.value.items.length,MAX_ITEMS);
});
test('invalid validation date fails before reading data',()=>{
 const result=validateDocument(document(),'2026-02-29');
 assert.deepEqual(result.problems,[{code:'INVALID_TODAY',path:'today'}]);
});
test('multiple invalid fields produce multiple useful errors',()=>{
 const result=validateDocument(document(item({source:'',licence:'',tier:'invalid'})),today);
 assert.ok(codes(result).includes('SOURCE_REQUIRED'));
 assert.ok(codes(result).includes('LICENCE_REQUIRED'));
 assert.ok(codes(result).includes('INVALID_TIER'));
});
test('parseDocument rejects malformed JSON',()=>{
 for(const text of ['{', '[', '{version:1}', 'not JSON']){
  const result=parseDocument(text,today);
  assert.ok(codes(result).includes('INVALID_JSON'));
 }
});
test('parseDocument accepts compact JSON and preserves identifiers',()=>{
 const result=parseDocument(JSON.stringify(document(item())),today);
 assert.equal(result.ok,true);
 assert.equal(result.value.items[0].id,'note-1');
});
test('parseDocument rejects a too-large file before parsing',()=>{
 const result=parseDocument('x'.repeat(MAX_BYTES+1),today);
 assert.ok(codes(result).includes('FILE_TOO_LARGE'));
});
test('parseDocument rejects non-string input',()=>{
 for(const input of [null,{},[],42]){
  const result=parseDocument(input,today);
  assert.ok(codes(result).includes('FILE_TOO_LARGE'));
 }
});
test('parseDocument sizes multibyte text by UTF-8 bytes',()=>{
 const text='é'.repeat(MAX_BYTES/2+1);
 const result=parseDocument(text,today);
 assert.ok(codes(result).includes('FILE_TOO_LARGE'));
});
test('cloneDocument copies each evidence row',()=>{
 const source=document(item());
 const clone=cloneDocument(source);
 assert.notEqual(clone,source);
 assert.notEqual(clone.items,source.items);
 assert.notEqual(clone.items[0],source.items[0]);
});
test('changing a clone leaves its original untouched',()=>{
 const source=document(item());
 const clone=cloneDocument(source);
 clone.items[0].label='A changed private label';
 assert.equal(source.items[0].label,'New evidence');
});
test('today formatting uses UTC ISO date',()=>{
 const date=new Date('2026-11-20T23:59:59Z');
 assert.equal(safeDateToday(date),'2026-11-20');
});
test('makeDraft contains all required provenance fields',()=>{
 const draft=makeDraft('draft-a','fictional-place',today);
 assert.equal(draft.source.length>0,true);
 assert.equal(draft.licence,UNKNOWN);
 assert.equal(draft.retrievedOn,today);
 assert.equal(draft.decision,'unreviewed');
});
test('an invalid id cannot be made valid merely by a note',()=>{
 const result=validateItem(item({id:'../unsafe',note:'looks okay'}),0,today);
 assert.ok(codes(result).includes('INVALID_ID'));
});
test('reported evidence does not imply a reviewed decision',()=>{
 const result=validateItem(item({state:'reported',decision:'unreviewed'}),0,today);
 assert.equal(result.ok,true);
 assert.equal(result.value.decision,'unreviewed');
});
test('reviewed decision does not upgrade the provenance tier',()=>{
 const result=validateItem(item({decision:'reviewed',tier:'unknown'}),0,today);
 assert.equal(result.ok,true);
 assert.equal(result.value.tier,'unknown');
});
test('validation never substitutes missing licence with a guessed one',()=>{
 const result=validateItem(item({licence:''}),0,today);
 assert.equal(result.ok,false);
 assert.equal(result.value,null);
});
test('a place id is an identifier, not a location fact',()=>{
 const result=validateItem(item({placeId:'fictional-campus-1'}),0,today);
 assert.equal(result.ok,true);
 assert.equal(result.value.placeId,'fictional-campus-1');
});
test('same date retrieval is not treated as future',()=>{
 const result=validateItem(item({retrievedOn:today}),0,today);
 assert.equal(result.ok,true);
});
test('past retrieval is allowed but can be flagged by review',()=>{
 const result=validateItem(item({retrievedOn:'2020-01-01'}),0,today);
 assert.equal(result.ok,true);
});
test('object with unexpected relation field fails closed',()=>{
 const result=validateDocument(document(item({relationship:'endorsed-by'})),today);
 assert.ok(codes(result).includes('UNKNOWN_FIELD'));
});
test('JSON __proto__ in source is not retained',()=>{
 const raw=JSON.parse(JSON.stringify(document(item())).replace('"version":1','"__proto__":{},"version":1'));
 const result=validateDocument(raw,today);
 assert.equal(result.ok,false);
});
