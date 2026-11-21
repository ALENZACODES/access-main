import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyDocument, makeDraft, UNKNOWN } from './model.ts';
import {
 createWorkspace, updateWorkspace, filterItems, countSummary, compareDocuments,
 groupByPlace, overdueItems, needsReview, reviewQueue, safeSelect, draftId,
 redactHistory
} from './operations.ts';
const TODAY='2026-11-20';
const NOW='2026-11-20T10:00:00.000Z';
const item=(id,changes={})=>({...makeDraft(id,'fictional',TODAY),...changes});
const doc=(...items)=>({version:1,items});
const workspace=(...items)=>createWorkspace(doc(...items));
const update=(ws,change)=>updateWorkspace(ws,change,NOW,TODAY);
const errors=result=>result.problems.map(problem=>problem.code);

test('new workspace keeps input document and empty change history',()=>{
 const d=emptyDocument();
 const result=createWorkspace(d);
 assert.equal(result.document,d);
 assert.deepEqual(result.history,[]);
});
test('a new fictional observation can be added explicitly',()=>{
 const ws=workspace();
 const result=update(ws,{kind:'add',item:item('a')});
 assert.equal(result.ok,true);
 assert.equal(result.value.document.items[0].id,'a');
 assert.equal(result.value.history.length,1);
});
test('adding does not mutate the old workspace',()=>{
 const ws=workspace();
 const result=update(ws,{kind:'add',item:item('a')});
 assert.equal(result.ok,true);
 assert.equal(ws.document.items.length,0);
 assert.equal(ws.history.length,0);
});
test('duplicate addition returns a defined error',()=>{
 const result=update(workspace(item('a')),{kind:'add',item:item('a')});
 assert.equal(result.ok,false);
 assert.ok(errors(result).includes('ALREADY_EXISTS'));
});
test('invalid addition stays uncommitted',()=>{
 const result=update(workspace(),{kind:'add',item:item('bad id')});
 assert.equal(result.ok,false);
 assert.ok(errors(result).includes('INVALID_ID'));
});
test('unknown additions retain unknown status',()=>{
 const result=update(workspace(),{kind:'add',item:item('a')});
 assert.equal(result.ok,true);
 assert.equal(result.value.document.items[0].state,UNKNOWN);
});
test('simple label change preserves record identity',()=>{
 const result=update(workspace(item('a')),{kind:'update',id:'a',changes:{label:'Door observation'}});
 assert.equal(result.ok,true);
 assert.equal(result.value.document.items[0].id,'a');
 assert.equal(result.value.document.items[0].label,'Door observation');
});
test('source changes are explicit and tracked in history',()=>{
 const result=update(workspace(item('a')),{kind:'update',id:'a',changes:{source:'A new fictional source'}});
 assert.equal(result.ok,true);
 assert.equal(result.value.history[0].before.source,'Personal review note (not independently confirmed)');
 assert.equal(result.value.history[0].after.source,'A new fictional source');
});
test('record identifiers cannot be renamed by update',()=>{
 const result=update(workspace(item('a')),{kind:'update',id:'a',changes:{id:'b'}});
 assert.equal(result.ok,false);
 assert.ok(errors(result).includes('IMMUTABLE_ID'));
});
test('invalid state update fails instead of coercing',()=>{
 const result=update(workspace(item('a')),{kind:'update',id:'a',changes:{state:'accessible'}});
 assert.equal(result.ok,false);
 assert.ok(errors(result).includes('INVALID_STATE'));
});
test('missing source cannot be saved by update',()=>{
 const result=update(workspace(item('a')),{kind:'update',id:'a',changes:{source:''}});
 assert.equal(result.ok,false);
 assert.ok(errors(result).includes('SOURCE_REQUIRED'));
});
test('missing licence cannot be saved by update',()=>{
 const result=update(workspace(item('a')),{kind:'update',id:'a',changes:{licence:''}});
 assert.equal(result.ok,false);
 assert.ok(errors(result).includes('LICENCE_REQUIRED'));
});
test('future retrieval date cannot be saved by update',()=>{
 const result=update(workspace(item('a')),{kind:'update',id:'a',changes:{retrievedOn:'2026-11-21'}});
 assert.equal(result.ok,false);
 assert.ok(errors(result).includes('INVALID_DATE'));
});
test('nonexistent update is not silently appended',()=>{
 const result=update(workspace(),{kind:'update',id:'missing',changes:{label:'Test'}});
 assert.equal(result.ok,false);
 assert.ok(errors(result).includes('NOT_FOUND'));
});
test('invalid update id fails before applying',()=>{
 const result=update(workspace(item('a')),{kind:'update',id:'../bad',changes:{label:'Test'}});
 assert.equal(result.ok,false);
 assert.ok(errors(result).includes('INVALID_ID'));
});
test('review decision changes keep evidence UNKNOWN',()=>{
 const result=update(workspace(item('a')),{kind:'decision',id:'a',decision:'reviewed'});
 assert.equal(result.ok,true);
 assert.equal(result.value.document.items[0].state,UNKNOWN);
 assert.equal(result.value.document.items[0].decision,'reviewed');
});
test('review decision does not change source licence or date',()=>{
 const ws=workspace(item('a'));
 const result=update(ws,{kind:'decision',id:'a',decision:'needs-recheck'});
 assert.equal(result.ok,true);
 assert.equal(result.value.document.items[0].source,ws.document.items[0].source);
 assert.equal(result.value.document.items[0].licence,ws.document.items[0].licence);
 assert.equal(result.value.document.items[0].retrievedOn,ws.document.items[0].retrievedOn);
});
test('invalid decision cannot be saved',()=>{
 const result=update(workspace(item('a')),{kind:'decision',id:'a',decision:'endorsed'});
 assert.equal(result.ok,false);
 assert.ok(errors(result).includes('INVALID_DECISION'));
});
test('removal preserves other records',()=>{
 const result=update(workspace(item('a'),item('b')),{kind:'remove',id:'a'});
 assert.equal(result.ok,true);
 assert.deepEqual(result.value.document.items.map(x=>x.id),['b']);
});
test('removal creates an audit-history tombstone',()=>{
 const result=update(workspace(item('a')),{kind:'remove',id:'a'});
 assert.equal(result.ok,true);
 assert.equal(result.value.history[0].before.id,'a');
 assert.equal(result.value.history[0].after,null);
});
test('missing removal does not alter a workspace',()=>{
 const ws=workspace(item('a'));
 const result=update(ws,{kind:'remove',id:'b'});
 assert.equal(result.ok,false);
 assert.deepEqual(ws.document.items.map(x=>x.id),['a']);
});
test('multiple edits preserve chronological audit entries',()=>{
 const start=workspace(item('a'));
 const first=update(start,{kind:'update',id:'a',changes:{note:'Examined locally'}});
 assert.equal(first.ok,true);
 const second=update(first.value,{kind:'decision',id:'a',decision:'reviewed'});
 assert.equal(second.ok,true);
 assert.deepEqual(second.value.history.map(x=>x.kind),['update','decision']);
});
test('history always records the explicit timestamp',()=>{
 const result=update(workspace(),{kind:'add',item:item('a')});
 assert.equal(result.ok,true);
 assert.equal(result.value.history[0].at,NOW);
});
test('history preserves former field values',()=>{
 const first=update(workspace(item('a')),{kind:'update',id:'a',changes:{label:'Changed'}});
 assert.equal(first.ok,true);
 assert.equal(first.value.history[0].before.label,'New evidence');
 assert.equal(first.value.history[0].after.label,'Changed');
});
test('redacted history reports action types without private text',()=>{
 const first=update(workspace(item('a')),{kind:'update',id:'a',changes:{note:'Private note text'}});
 assert.equal(first.ok,true);
 const redacted=redactHistory(first.value.history);
 assert.equal(redacted[0].id,'a');
 assert.equal(JSON.stringify(redacted).includes('Private note text'),false);
});
test('redacted history distinguishes adds and removes',()=>{
 const added=update(workspace(),{kind:'add',item:item('a')});
 assert.equal(added.ok,true);
 const removed=update(added.value,{kind:'remove',id:'a'});
 assert.equal(removed.ok,true);
 assert.deepEqual(redactHistory(removed.value.history).map(x=>[x.hadBefore,x.hasAfter]),[[false,true],[true,false]]);
});
test('filter returns all rows without a filter',()=>{
 const rows=filterItems(doc(item('a'),item('b')));
 assert.equal(rows.length,2);
});
test('filter by feature finds one category',()=>{
 const rows=filterItems(doc(item('a',{feature:'parking'}),item('b',{feature:'door'})),{feature:'door'});
 assert.deepEqual(rows.map(x=>x.id),['b']);
});
test('filter by state leaves UNKNOWN records only',()=>{
 const rows=filterItems(doc(item('a'),item('b',{state:'reported'})),{state:UNKNOWN});
 assert.deepEqual(rows.map(x=>x.id),['a']);
});
test('filter by review decision leaves one row',()=>{
 const rows=filterItems(doc(item('a'),item('b',{decision:'reviewed'})),{decision:'reviewed'});
 assert.deepEqual(rows.map(x=>x.id),['b']);
});
test('filter by verification tier leaves one row',()=>{
 const rows=filterItems(doc(item('a'),item('b',{tier:'documented'})),{tier:'documented'});
 assert.deepEqual(rows.map(x=>x.id),['b']);
});
test('filter by place ID prevents cross-place leakage',()=>{
 const rows=filterItems(doc(item('a'),item('b',{placeId:'other-place'})),{placeId:'other-place'});
 assert.deepEqual(rows.map(x=>x.id),['b']);
});
test('filter text matches source as well as label',()=>{
 const rows=filterItems(doc(item('a',{source:'Local handwritten note'}),item('b',{source:'Documented report'})),{text:'handwritten'});
 assert.deepEqual(rows.map(x=>x.id),['a']);
});
test('filter text matches notes without changing them',()=>{
 const rows=filterItems(doc(item('a',{note:'Need another visit'}),item('b',{note:'No note'})),{text:'VISIT'});
 assert.deepEqual(rows.map(x=>x.id),['a']);
 assert.equal(rows[0].note,'Need another visit');
});
test('filter is case insensitive',()=>{
 const rows=filterItems(doc(item('a',{label:'Front Door'})),{text:'front door'});
 assert.equal(rows.length,1);
});
test('combined filters are conjunctive',()=>{
 const rows=filterItems(doc(item('a',{feature:'door',state:UNKNOWN}),item('b',{feature:'door',state:'reported'})),{feature:'door',state:UNKNOWN});
 assert.deepEqual(rows.map(x=>x.id),['a']);
});
test('filter sorts by place and feature before id',()=>{
 const rows=filterItems(doc(item('z',{placeId:'z'}),item('b',{feature:'parking'}),item('a',{feature:'door'})));
 assert.deepEqual(rows.map(x=>x.id),['a','b','z']);
});
test('all filters are neutral',()=>{
 const rows=filterItems(doc(item('a'),item('b')),{feature:'all',state:'all',decision:'all',tier:'all'});
 assert.equal(rows.length,2);
});
test('summary counts UNKNOWN and reported distinctly',()=>{
 const result=countSummary(doc(item('a'),item('b',{state:'reported'}),item('c',{state:'not-reported'})));
 assert.deepEqual(result.states,{UNKNOWN:1,reported:1,'not-reported':1});
});
test('summary counts review decisions distinctly',()=>{
 const result=countSummary(doc(item('a'),item('b',{decision:'reviewed'}),item('c',{decision:'needs-source'})));
 assert.equal(result.decisions.unreviewed,1);
 assert.equal(result.decisions.reviewed,1);
 assert.equal(result.decisions['needs-source'],1);
});
test('summary reports distinct places',()=>{
 const result=countSummary(doc(item('a'),item('b',{placeId:'second'}),item('c',{placeId:'second'})));
 assert.equal(result.places,2);
 assert.equal(result.total,3);
});
test('summary counts all features without guessing omitted values',()=>{
 const result=countSummary(doc(item('a',{feature:'entrance'}),item('b',{feature:'door'})));
 assert.equal(result.features.entrance,1);
 assert.equal(result.features.door,1);
 assert.equal(result.features.lift,0);
});
test('summary tiers preserve unknown source certainty',()=>{
 const result=countSummary(doc(item('a'),item('b',{tier:'field-observed'})));
 assert.equal(result.tiers.unknown,1);
 assert.equal(result.tiers['field-observed'],1);
});
test('compare empty documents yields no changes',()=>{
 assert.deepEqual(compareDocuments(doc(),doc()),[]);
});
test('compare identical documents yields unchanged item',()=>{
 const changes=compareDocuments(doc(item('a')),doc(item('a')));
 assert.equal(changes.length,1);
 assert.equal(changes[0].kind,'unchanged');
});
test('compare detects addition',()=>{
 const changes=compareDocuments(doc(),doc(item('a')));
 assert.equal(changes[0].kind,'added');
 assert.equal(changes[0].before,null);
});
test('compare detects removal',()=>{
 const changes=compareDocuments(doc(item('a')),doc());
 assert.equal(changes[0].kind,'removed');
 assert.equal(changes[0].after,null);
});
test('compare detects source replacement',()=>{
 const changes=compareDocuments(doc(item('a')),doc(item('a',{source:'Different fictional source'})));
 assert.equal(changes[0].kind,'changed');
 assert.deepEqual(changes[0].fields,['source']);
});
test('compare detects licence replacement',()=>{
 const changes=compareDocuments(doc(item('a')),doc(item('a',{licence:'CC-BY-4.0'})));
 assert.deepEqual(changes[0].fields,['licence']);
});
test('compare detects verification tier replacement',()=>{
 const changes=compareDocuments(doc(item('a')),doc(item('a',{tier:'documented'})));
 assert.deepEqual(changes[0].fields,['tier']);
});
test('compare detects review decision changes',()=>{
 const changes=compareDocuments(doc(item('a')),doc(item('a',{decision:'reviewed'})));
 assert.deepEqual(changes[0].fields,['decision']);
});
test('compare detects date changes independently',()=>{
 const changes=compareDocuments(doc(item('a')),doc(item('a',{retrievedOn:'2024-01-01'})));
 assert.deepEqual(changes[0].fields,['retrievedOn']);
});
test('compare sorts changes deterministically',()=>{
 const changes=compareDocuments(doc(item('z'),item('a')),doc(item('a'),item('b')));
 assert.deepEqual(changes.map(x=>x.id),['a','b','z']);
});
test('groupByPlace groups same-place observations',()=>{
 const grouped=groupByPlace(doc(item('a'),item('b')));
 assert.equal(grouped.length,1);
 assert.equal(grouped[0].items.length,2);
});
test('groupByPlace sorts groups and rows',()=>{
 const grouped=groupByPlace(doc(item('z',{placeId:'z'}),item('b'),item('a')));
 assert.deepEqual(grouped.map(x=>x.placeId),['fictional','z']);
 assert.deepEqual(grouped[0].items.map(x=>x.id),['a','b']);
});
test('overdueItems finds records more than 365 days old',()=>{
 const result=overdueItems(doc(item('a',{retrievedOn:'2024-01-01'}),item('b')),TODAY);
 assert.deepEqual(result.map(x=>x.id),['a']);
});
test('overdueItems does not flag today',()=>{
 assert.deepEqual(overdueItems(doc(item('a')),TODAY),[]);
});
test('review flags include missing status certainty',()=>{
 assert.ok(needsReview(item('a'),TODAY).includes('UNKNOWN_STATE'));
});
test('review flags include unknown verification tier',()=>{
 assert.ok(needsReview(item('a'),TODAY).includes('UNKNOWN_TIER'));
});
test('review flags include unknown licence',()=>{
 assert.ok(needsReview(item('a'),TODAY).includes('UNKNOWN_LICENCE'));
});
test('review flags include explicit missing-source requests',()=>{
 assert.ok(needsReview(item('a',{decision:'needs-source'}),TODAY).includes('SOURCE_REQUESTED'));
});
test('review flags include recheck requests',()=>{
 assert.ok(needsReview(item('a',{decision:'needs-recheck'}),TODAY).includes('RECHECK_REQUESTED'));
});
test('review flags include unreviewed notes',()=>{
 assert.ok(needsReview(item('a'),TODAY).includes('NOT_REVIEWED'));
});
test('review flags include evidence older than a year',()=>{
 assert.ok(needsReview(item('a',{retrievedOn:'2020-01-01'}),TODAY).includes('OLDER_THAN_YEAR'));
});
test('reviewed records can retain unknown evidence flags',()=>{
 const flags=needsReview(item('a',{decision:'reviewed'}),TODAY);
 assert.ok(flags.includes('UNKNOWN_STATE'));
 assert.equal(flags.includes('NOT_REVIEWED'),false);
});
test('review queue groups findings by place and identifier',()=>{
 const queue=reviewQueue(doc(item('b'),item('a',{placeId:'other'})),TODAY);
 assert.equal(queue[0].placeId,'fictional');
 assert.equal(queue.at(-1).placeId,'other');
});
test('review queue with no items is empty',()=>{
 assert.deepEqual(reviewQueue(doc(),TODAY),[]);
});
test('feature enum selection validates real categories only',()=>{
 assert.equal(safeSelect('entrance','feature'),true);
 assert.equal(safeSelect('medical','feature'),false);
});
test('state enum selection excludes accessibility conclusions',()=>{
 assert.equal(safeSelect('UNKNOWN','state'),true);
 assert.equal(safeSelect('accessible','state'),false);
});
test('tier enum selection excludes official-sounding certainty',()=>{
 assert.equal(safeSelect('unknown','tier'),true);
 assert.equal(safeSelect('verified','tier'),false);
});
test('decision enum selection includes human review but not eligibility',()=>{
 assert.equal(safeSelect('reviewed','decision'),true);
 assert.equal(safeSelect('eligible','decision'),false);
});
test('draftId avoids collisions with prior entries',()=>{
 const next=draftId(workspace(item('local-1'),item('local-2')));
 assert.equal(next,'local-3');
});
test('draftId for an empty session starts at 1',()=>{
 assert.equal(draftId(workspace()),'local-1');
});
test('history is specific to each update operation',()=>{
 const original=workspace(item('a'));
 const first=update(original,{kind:'decision',id:'a',decision:'needs-source'});
 assert.equal(first.ok,true);
 assert.equal(first.value.history.length,1);
 assert.equal(original.history.length,0);
});
test('unsupported changes do not silently upgrade a record',()=>{
 const result=update(workspace(item('a')),{kind:'update',id:'a',changes:{status:'accessible'}});
 assert.equal(result.ok,false);
 assert.ok(errors(result).includes('UNKNOWN_FIELD'));
});
test('adding many unique records works under the cap',()=>{
 let ws=workspace();
 for(let index=0;index<30;index++){
  const result=update(ws,{kind:'add',item:item(`entry-${index}`)});
  assert.equal(result.ok,true);
  ws=result.value;
 }
 assert.equal(ws.document.items.length,30);
 assert.equal(ws.history.length,30);
});
