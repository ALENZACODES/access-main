import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FEATURES, UNKNOWN, makeDraft } from './model.ts';
import { compareDocuments } from './operations.ts';
import {
 sourceCount, stateSummary, buildCoverage, contradictions, summarizeEvidence,
 impacts, changeSummary, historyRisks, perFeatureCounts, reviewPriority,
 prioritized, traceSources, sourceInventory, licenceConflicts
} from './analysis.ts';
const TODAY='2026-11-20';
const record=(id,changes={})=>({...makeDraft(id,'fictional-place',TODAY),...changes});
const doc=(...items)=>({version:1,items});

test('empty source collection has zero distinct sources',()=>{
 assert.equal(sourceCount([]),0);
});
test('two records with same source and licence count once',()=>{
 const rows=[record('a'),record('b')];
 assert.equal(sourceCount(rows),1);
});
test('same source with different licence counts twice for provenance review',()=>{
 const rows=[record('a'),record('b',{licence:'CC-BY-4.0'})];
 assert.equal(sourceCount(rows),2);
});
test('different sources with the same licence count twice',()=>{
 const rows=[record('a'),record('b',{source:'Second independent report'})];
 assert.equal(sourceCount(rows),2);
});
test('source identity is not inferred from the place label',()=>{
 const rows=[record('a',{label:'North entry'}),record('b',{label:'South entry'})];
 assert.equal(sourceCount(rows),1);
});
test('no reports always remain UNKNOWN',()=>{
 assert.equal(stateSummary([]),UNKNOWN);
});
test('two matching reported states remain reported observations',()=>{
 assert.equal(stateSummary([record('a',{state:'reported'}),record('b',{state:'reported'})]),'reported');
});
test('mixed reported and UNKNOWN remains UNKNOWN',()=>{
 assert.equal(stateSummary([record('a',{state:'reported'}),record('b')]),UNKNOWN);
});
test('opposing reported states remain UNKNOWN rather than a verdict',()=>{
 const rows=[record('a',{state:'reported'}),record('b',{state:'not-reported'})];
 assert.equal(stateSummary(rows),UNKNOWN);
});
test('unanimously UNKNOWN reports remain UNKNOWN',()=>{
 assert.equal(stateSummary([record('a'),record('b')]),UNKNOWN);
});
test('unanimously not-reported status remains a report, not access advice',()=>{
 const rows=[record('a',{state:'not-reported'}),record('b',{state:'not-reported'})];
 assert.equal(stateSummary(rows),'not-reported');
});
test('coverage for empty inventory contains no invented locations',()=>{
 assert.deepEqual(buildCoverage(doc()),[]);
});
test('coverage for one fictional place includes every feature category',()=>{
 const rows=buildCoverage(doc(record('a')));
 assert.equal(rows.length,FEATURES.length);
 assert.deepEqual(rows.map(x=>x.feature),[...FEATURES]);
});
test('coverage for an unobserved feature remains UNKNOWN',()=>{
 const rows=buildCoverage(doc(record('a')));
 const parking=rows.find(x=>x.feature==='parking');
 assert.equal(parking.count,0);
 assert.equal(parking.state,UNKNOWN);
 assert.deepEqual(parking.ids,[]);
});
test('coverage counts two records without inferring source independence',()=>{
 const rows=buildCoverage(doc(record('a'),record('b')));
 const entry=rows.find(x=>x.feature==='entrance');
 assert.equal(entry.count,2);
 assert.equal(entry.sources,1);
});
test('coverage accepts a limited requested feature subset',()=>{
 const rows=buildCoverage(doc(record('a')),["door","parking"]);
 assert.deepEqual(rows.map(x=>x.feature),['door','parking']);
});
test('coverage sorts places deterministically',()=>{
 const rows=buildCoverage(doc(record('z',{placeId:'z'}),record('a',{placeId:'a'})),['entrance']);
 assert.deepEqual(rows.map(x=>x.placeId),['a','z']);
});
test('coverage never maps a record from one place to another',()=>{
 const rows=buildCoverage(doc(record('a',{placeId:'place-a'}),record('b',{placeId:'place-b'})),['entrance']);
 assert.equal(rows.length,2);
 assert.deepEqual(rows.map(x=>x.count),[1,1]);
});
test('coverage sorts row ids deterministically',()=>{
 const rows=buildCoverage(doc(record('z'),record('a')),["entrance"]);
 assert.deepEqual(rows[0].ids,['a','z']);
});
test('coverage lists retrieval dates in ascending order',()=>{
 const rows=buildCoverage(doc(record('a',{retrievedOn:'2024-01-01'}),record('b')),["entrance"]);
 assert.deepEqual(rows[0].dates,['2024-01-01',TODAY]);
});
test('coverage does not label conflicting observations as a consensus',()=>{
 const rows=buildCoverage(doc(record('a',{state:'reported'}),record('b',{state:'not-reported'})),['entrance']);
 assert.equal(rows[0].mixed,true);
 assert.equal(rows[0].state,UNKNOWN);
});
test('coverage does not call two identical states mixed',()=>{
 const rows=buildCoverage(doc(record('a'),record('b')),["entrance"]);
 assert.equal(rows[0].mixed,false);
});
test('conflict detector ignores missing-only cells',()=>{
 assert.deepEqual(contradictions(doc(record('a'))),[]);
});
test('conflict detector flags opposing reports at the same place',()=>{
 const result=contradictions(doc(record('a',{state:'reported'}),record('b',{state:'not-reported'})));
 assert.equal(result.length,1);
 assert.equal(result[0].reason,'CONFLICTING_REPORTS');
});
test('conflict detector identifies the exact feature',()=>{
 const result=contradictions(doc(record('a',{feature:'lift',state:'reported'}),record('b',{feature:'lift',state:'not-reported'})));
 assert.equal(result[0].feature,'lift');
});
test('conflict detector isolates separate places',()=>{
 const result=contradictions(doc(record('a',{placeId:'p1',state:'reported'}),record('b',{placeId:'p2',state:'not-reported'})));
 assert.deepEqual(result,[]);
});
test('conflict detector isolates separate features',()=>{
 const result=contradictions(doc(record('a',{feature:'entrance',state:'reported'}),record('b',{feature:'door',state:'not-reported'})));
 assert.deepEqual(result,[]);
});
test('a conflicting UNKNOWN and reported state is still a review flag',()=>{
 const result=contradictions(doc(record('a'),record('b',{state:'reported'})));
 assert.equal(result.length,1);
 assert.deepEqual(result[0].ids,['a','b']);
});
test('summary for empty documents is honest',()=>{
 const summary=summarizeEvidence(doc(),TODAY);
 assert.equal(summary.total,0);
 assert.equal(summary.unresolved,0);
 assert.equal(summary.oldest,null);
 assert.equal(summary.newest,null);
});
test('summary identifies distinct fictional places',()=>{
 const summary=summarizeEvidence(doc(record('a'),record('b',{placeId:'second-place'})),TODAY);
 assert.equal(summary.places,2);
});
test('summary includes review flags for unknown status',()=>{
 const summary=summarizeEvidence(doc(record('a')),TODAY);
 assert.equal(summary.unresolved,1);
});
test('summary includes conflicting observations without erasing them',()=>{
 const summary=summarizeEvidence(doc(record('a',{state:'reported'}),record('b',{state:'not-reported'})),TODAY);
 assert.equal(summary.contradictions,1);
 assert.equal(summary.total,2);
});
test('summary reports oldest and newest retrieval dates',()=>{
 const summary=summarizeEvidence(doc(record('a',{retrievedOn:'2022-01-01'}),record('b')),TODAY);
 assert.equal(summary.oldest,'2022-01-01');
 assert.equal(summary.newest,TODAY);
});
test('impact of two empty documents is empty',()=>{
 assert.deepEqual(impacts(doc(),doc()),[]);
});
test('impact detects a new known report replacing an UNKNOWN cell',()=>{
 const result=impacts(doc(record('a')),doc(record('a',{state:'reported'})));
 assert.equal(result.length,1);
 assert.equal(result[0].before,UNKNOWN);
 assert.equal(result[0].after,'reported');
});
test('impact detects change to UNKNOWN after a record removal',()=>{
 const result=impacts(doc(record('a',{state:'reported'})),doc());
 assert.equal(result.length,FEATURES.length);
 assert.ok(result.every(row=>row.after===UNKNOWN));
});
test('impact keeps the group identity intact',()=>{
 const result=impacts(doc(),doc(record('a',{placeId:'site-one',feature:'washroom'})));
 assert.equal(result.length,FEATURES.length);
 assert.equal(result.find(x=>x.feature==='washroom').placeId,'site-one');
});
test('impact does not hide record count changes',()=>{
 const result=impacts(doc(record('a')),doc(record('a'),record('b')));
 assert.equal(result.length,1);
 assert.equal(result[0].reason,'RECORD_COUNT_CHANGE');
});
test('impact does not hide source independence changes',()=>{
 const before=doc(record('a'),record('b'));
 const after=doc(record('a'),record('b',{source:'Another fictional source'}));
 const result=impacts(before,after);
 assert.equal(result.length,1);
 assert.equal(result[0].reason,'SOURCE_COUNT_CHANGE');
});
test('impact captures emergence of conflict',()=>{
 const before=doc(record('a',{state:'reported'}),record('b',{state:'reported'}));
 const after=doc(record('a',{state:'reported'}),record('b',{state:'not-reported'}));
 const result=impacts(before,after);
 assert.equal(result.length,1);
 assert.equal(result[0].after,UNKNOWN);
});
test('impact ignores pure label changes in coverage summaries',()=>{
 const result=impacts(doc(record('a')),doc(record('a',{label:'Different label'})));
 assert.deepEqual(result,[]);
});
test('record diff still exposes label changes omitted from coverage',()=>{
 const result=compareDocuments(doc(record('a')),doc(record('a',{label:'Different label'})));
 assert.deepEqual(result[0].fields,['label']);
});
test('change summary counts all kinds',()=>{
 const changes=compareDocuments(doc(record('a'),record('b')),doc(record('b'),record('c')));
 assert.deepEqual(changeSummary(changes),{added:1,removed:1,changed:0,unchanged:1});
});
test('change summary counts changed status independently',()=>{
 const changes=compareDocuments(doc(record('a')),doc(record('a',{state:'reported'})));
 assert.equal(changeSummary(changes).changed,1);
});
test('history risk report exposes a removed record',()=>{
 const result=historyRisks(doc(record('a')),doc());
 assert.deepEqual(result.map(x=>x.id),['a']);
 assert.deepEqual(result.map(x=>x.kind),['removed']);
});
test('history risk report exposes replaced provenance',()=>{
 const result=historyRisks(doc(record('a')),doc(record('a',{licence:'CC-BY-4.0'})));
 assert.deepEqual(result[0].fields,['licence']);
});
test('history risk report ignores appends only',()=>{
 const result=historyRisks(doc(record('a')),doc(record('a'),record('b')));
 assert.deepEqual(result,[]);
});
test('per-feature counts include unobserved categories at zero',()=>{
 const result=perFeatureCounts(doc(record('a',{feature:'door'})));
 assert.equal(result.door,1);
 assert.equal(result.parking,0);
});
test('per-feature counts are additive',()=>{
 const result=perFeatureCounts(doc(record('a'),record('b'),record('c',{feature:'lift'})));
 assert.equal(result.entrance,2);
 assert.equal(result.lift,1);
});
test('review priority weights explicit follow-up needs',()=>{
 const base=reviewPriority(record('a'),TODAY);
 const recheck=reviewPriority(record('a',{decision:'needs-recheck'}),TODAY);
 assert.ok(recheck>base);
});
test('review priority weights stale evidence',()=>{
 const base=reviewPriority(record('a'),TODAY);
 const stale=reviewPriority(record('a',{retrievedOn:'2023-01-01'}),TODAY);
 assert.ok(stale>base);
});
test('review priority never relies on a real-location service',()=>{
 const result=reviewPriority(record('a',{placeId:'fictional-place'}),TODAY);
 assert.equal(typeof result,'number');
 assert.ok(result>=0);
});
test('prioritized queue sorts higher-risk items first',()=>{
 const rows=prioritized(doc(record('a'),record('b',{decision:'needs-recheck',retrievedOn:'2023-01-01'})),TODAY);
 assert.equal(rows[0].id,'b');
});
test('prioritized queue sorts equal-risk items by identifier',()=>{
 const rows=prioritized(doc(record('z'),record('a')),TODAY);
 assert.deepEqual(rows.map(x=>x.id),['a','z']);
});
test('traceSources finds only one named source',()=>{
 const rows=traceSources(doc(record('a',{source:'Source A'}),record('b',{source:'Source B'})),'Source A');
 assert.deepEqual(rows.map(x=>x.id),['a']);
});
test('traceSources returns empty for a nonexistent source',()=>{
 assert.deepEqual(traceSources(doc(record('a')),'Does not exist'),[]);
});
test('source inventory deduplicates a shared source',()=>{
 const rows=sourceInventory(doc(record('a'),record('b')));
 assert.equal(rows.length,1);
 assert.equal(rows[0].count,2);
});
test('source inventory preserves distinct licences without choosing one',()=>{
 const rows=sourceInventory(doc(record('a'),record('b',{licence:'CC-BY-4.0'})));
 assert.deepEqual(rows[0].licences,['CC-BY-4.0',UNKNOWN]);
});
test('source inventory tracks oldest observation date',()=>{
 const rows=sourceInventory(doc(record('a'),record('b',{retrievedOn:'2021-01-01'})));
 assert.equal(rows[0].oldest,'2021-01-01');
});
test('licence conflicts flag inconsistent licences for the same source',()=>{
 const rows=licenceConflicts(doc(record('a'),record('b',{licence:'CC-BY-4.0'})));
 assert.equal(rows.length,1);
 assert.equal(rows[0].code,'LICENCE_INCONSISTENCY');
});
test('licence conflicts do not flag distinct sources',()=>{
 const rows=licenceConflicts(doc(record('a',{source:'Source A'}),record('b',{source:'Source B',licence:'CC-BY-4.0'})));
 assert.deepEqual(rows,[]);
});
test('licence conflicts do not manufacture certainty about source rights',()=>{
 const rows=licenceConflicts(doc(record('a'),record('b')));
 assert.deepEqual(rows,[]);
});
test('coverage of ten fictional places has one row per requested category',()=>{
 const records=Array.from({length:10},(_,index)=>record(`id-${index}`,{placeId:`place-${index}`}));
 const cells=buildCoverage(doc(...records),['entrance','door']);
 assert.equal(cells.length,20);
 assert.equal(cells.filter(x=>x.count===0).length,10);
});
test('review summary never upgrades a reviewed UNKNOWN observation',()=>{
 const summary=summarizeEvidence(doc(record('a',{decision:'reviewed'})),TODAY);
 assert.equal(summary.unresolved,1);
 assert.equal(summary.total,1);
});
test('conflict IDs remain sorted even when input order changes',()=>{
 const conflicts=contradictions(doc(record('z',{state:'reported'}),record('a',{state:'not-reported'})));
 assert.deepEqual(conflicts[0].ids,['a','z']);
});
test('a single reported item cannot establish the status of missing features',()=>{
 const cells=buildCoverage(doc(record('a',{state:'reported'})));
 assert.equal(cells.find(x=>x.feature==='entrance').state,'reported');
 assert.ok(cells.filter(x=>x.count===0).every(x=>x.state===UNKNOWN));
});
test('multiple document changes produce deterministic impact order',()=>{
 const after=doc(record('b',{placeId:'b'}),record('a',{placeId:'a'}));
 const impact=impacts(doc(),after);
 assert.equal(impact[0].placeId,'a');
 assert.equal(impact.at(-1).placeId,'b');
});
test('row counts and source counts remain distinct concepts',()=>{
 const rows=buildCoverage(doc(record('a'),record('b'),record('c',{source:'Independent source'})),['entrance']);
 assert.equal(rows[0].count,3);
 assert.equal(rows[0].sources,2);
});
test('priorities do not interpret a missing report as safe',()=>{
 const item=record('a',{state:UNKNOWN,tier:'unknown'});
 const score=reviewPriority(item,TODAY);
 assert.ok(score>0);
});
