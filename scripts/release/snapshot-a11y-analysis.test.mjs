import assert from 'node:assert/strict';
import test from 'node:test';
import {
 RULES,joinStates,finding,metricState,controlReview,announcementReview,captureReview,
 summarizeReviews,analyzeSnapshots,captureKey,languageParity,coverageMatrix,compareReviews,
} from './snapshot-a11y-analysis.mjs';
import { TODAY, provenance, control, announcement, asset, capture, document, pair, clone } from './snapshot-a11y-fixtures.mjs';
const options={today:TODAY};
const analyze=x=>analyzeSnapshots(x,options);

test('all rules have unique stable names',()=>{
 assert.equal(RULES.length,new Set(RULES).size);
 assert.ok(RULES.includes('TARGET_44'));
 assert.ok(RULES.includes('FOCUS_VISIBLE'));
 assert.ok(RULES.includes('ANNOUNCEMENTS'));
});
test('tri-state aggregation treats no observation as UNKNOWN',()=>{
 assert.equal(joinStates([]),'UNKNOWN');
 assert.equal(joinStates(null),'UNKNOWN');
 assert.equal(joinStates(['UNKNOWN']),'UNKNOWN');
});
test('tri-state aggregation prioritizes FAIL',()=>{
 for(const values of [['FAIL'],['PASS','FAIL'],['UNKNOWN','FAIL'],['FAIL','PASS','UNKNOWN']])assert.equal(joinStates(values),'FAIL');
});
test('tri-state aggregation preserves unresolved evidence',()=>{
 assert.equal(joinStates(['PASS','UNKNOWN']),'UNKNOWN');
 assert.equal(joinStates(['PASS','PASS']),'PASS');
 assert.equal(joinStates(['PASS','MAYBE']),'UNKNOWN');
});
test('issues contain only paths and codes',()=>{
 assert.deepEqual(finding('RULE','/a','UNKNOWN'),{code:'RULE',path:'/a',status:'UNKNOWN',detail:''});
});
test('44px metric counts boundary as PASS',()=>{
 for(const n of [44,45,100])assert.equal(metricState(n),'PASS');
 for(const n of [0,10,43.999])assert.equal(metricState(n),'FAIL');
});
test('missing metric remains UNKNOWN',()=>{
 for(const n of ['UNKNOWN',null,undefined,NaN,Infinity,'44'])assert.equal(metricState(n),'UNKNOWN');
});
test('custom target threshold is respected',()=>{
 assert.equal(metricState(20,20),'PASS');
 assert.equal(metricState(19,20),'FAIL');
});
test('known synthetic control has all measured rules PASS',()=>{
 const x=controlReview(control(),'sample');
 assert.equal(x.overall,'PASS');
 assert.equal(x.issues.length,0);
 assert.deepEqual(Object.keys(x.rules),['TARGET_44','ACCESSIBLE_NAME','TAB_REACHABLE','FOCUS_VISIBLE','KEYBOARD_ACTIVATION']);
});
test('small width fails even when height is sufficient',()=>{
 const x=controlReview(control('c',{bounds:{width:43,height:48}}),'sample');
 assert.equal(x.rules.TARGET_44,'FAIL');
 assert.equal(x.overall,'FAIL');
});
test('small height fails even when width is sufficient',()=>{
 const x=controlReview(control('c',{bounds:{width:48,height:43}}),'sample');
 assert.equal(x.rules.TARGET_44,'FAIL');
});
test('missing width does not imply target passes',()=>{
 const x=controlReview(control('c',{bounds:{width:'UNKNOWN',height:48}}),'sample');
 assert.equal(x.rules.TARGET_44,'UNKNOWN');
});
test('missing height does not imply target passes',()=>{
 const x=controlReview(control('c',{bounds:{width:48,height:'UNKNOWN'}}),'sample');
 assert.equal(x.rules.TARGET_44,'UNKNOWN');
});
test('UNKNOWN control name is unresolved',()=>{
 const x=controlReview(control('c',{name:'UNKNOWN'}),'sample');
 assert.equal(x.rules.ACCESSIBLE_NAME,'UNKNOWN');
});
test('missing tab reachability is unresolved',()=>{
 const x=controlReview(control('c',{tabReachable:'UNKNOWN'}),'sample');
 assert.equal(x.rules.TAB_REACHABLE,'UNKNOWN');
});
test('recorded focus failure blocks control outcome',()=>{
 const x=controlReview(control('c',{focusVisible:'FAIL'}),'sample');
 assert.equal(x.overall,'FAIL');
 assert.ok(x.issues.some(f=>f.code==='FOCUS_VISIBLE'&&f.status==='FAIL'));
});
test('keyboard button requires Enter and Space evidence',()=>{
 const x=controlReview(control('c',{keyboard:{enter:'PASS'}}),'sample');
 assert.equal(x.rules.KEYBOARD_ACTIVATION,'UNKNOWN');
});
test('keyboard button failure is explicit',()=>{
 const x=controlReview(control('c',{keyboard:{enter:'PASS',space:'FAIL'}}),'sample');
 assert.equal(x.rules.KEYBOARD_ACTIVATION,'FAIL');
});
test('link activation requires Enter',()=>{
 const x=controlReview(control('c',{role:'link',keyboard:{enter:'PASS'}}),'sample');
 assert.equal(x.rules.KEYBOARD_ACTIVATION,'PASS');
});
test('links do not require Space when Enter is recorded',()=>{
 const x=controlReview(control('c',{role:'link',keyboard:{enter:'PASS',space:'FAIL'}}),'sample');
 assert.equal(x.rules.KEYBOARD_ACTIVATION,'PASS');
});
test('textbox key activation is not inferred from button evidence',()=>{
 const x=controlReview(control('c',{role:'textbox',keyboard:{enter:'PASS',space:'PASS'}}),'sample');
 assert.equal(x.rules.KEYBOARD_ACTIVATION,'UNKNOWN');
});
test('switch requires both documented activation outcomes',()=>{
 assert.equal(controlReview(control('c',{role:'switch',keyboard:{enter:'PASS',space:'PASS'}}),'c').rules.KEYBOARD_ACTIVATION,'PASS');
 assert.equal(controlReview(control('c',{role:'switch',keyboard:{enter:'PASS'}}),'c').rules.KEYBOARD_ACTIVATION,'UNKNOWN');
});
test('announcement with live status and observation can pass',()=>{
 const x=announcementReview(announcement(),'sample');
 assert.equal(x.status,'PASS');
 assert.deepEqual(x.issues,[]);
});
test('announcement with unknown text does not become PASS',()=>{
 const x=announcementReview(announcement('x',{text:'UNKNOWN'}),'sample');
 assert.equal(x.status,'UNKNOWN');
});
test('failed announcement appears in findings',()=>{
 const x=announcementReview(announcement('x',{announced:'FAIL'}),'sample');
 assert.equal(x.status,'FAIL');
 assert.ok(x.issues.some(f=>f.code==='ANNOUNCEMENT'));
});
test('one capture provides nine review dimensions',()=>{
 const r=captureReview(capture());
 assert.equal(Object.keys(r.rules).length,9);
 assert.equal(r.overall,'PASS');
});
test('capture with no controls does not certify keyboard or targets',()=>{
 const r=captureReview(capture('x',{controls:[]}));
 for(const rule of ['TARGET_44','ACCESSIBLE_NAME','TAB_REACHABLE','FOCUS_VISIBLE','KEYBOARD_ACTIVATION'])assert.equal(r.rules[rule],'UNKNOWN');
});
test('capture with no announcements does not infer spoken output',()=>{
 const r=captureReview(capture('x',{announcements:[]}));
 assert.equal(r.rules.ANNOUNCEMENTS,'UNKNOWN');
});
test('offline shell failure is not overridden by other passes',()=>{
 const r=captureReview(capture('x',{offlineShell:'FAIL'}));
 assert.equal(r.overall,'FAIL');
 assert.ok(r.findings.some(f=>f.code==='OFFLINE_SHELL'));
});
test('storage denial is a measured fail',()=>{
 const r=captureReview(capture('x',{storageReadable:'FAIL'}));
 assert.equal(r.rules.STORAGE_READ,'FAIL');
});
test('missing assets are unresolved rather than absent from report',()=>{
 const r=captureReview(capture('x',{assets:[]}));
 assert.equal(r.rules.ASSET_AVAILABILITY,'UNKNOWN');
});
test('one failed asset fails grouped availability',()=>{
 const r=captureReview(capture('x',{assets:[asset('a.js'),asset('b.js',{available:'FAIL'})]}));
 assert.equal(r.rules.ASSET_AVAILABILITY,'FAIL');
});
test('asset with UNKNOWN availability preserves unknown status',()=>{
 const r=captureReview(capture('x',{assets:[asset('a.js',{available:'UNKNOWN'})]}));
 assert.equal(r.rules.ASSET_AVAILABILITY,'UNKNOWN');
});
test('summary separately counts PASS FAIL and UNKNOWN',()=>{
 const reviews=[captureReview(capture('a')),captureReview(capture('b',{offlineShell:'FAIL'})),captureReview(capture('c',{offlineShell:'UNKNOWN'}))];
 const s=summarizeReviews(reviews);
 assert.deepEqual(s.states,{PASS:1,FAIL:1,UNKNOWN:1});
 assert.equal(s.reviewRequired,2);
});
test('empty summary does not claim any passing checks',()=>{
 const s=summarizeReviews([]);
 assert.equal(s.total,0);assert.equal(s.states.PASS,0);
});
test('analyzer accepts synthetic capture and keeps provenance',()=>{
 const x=analyze(document());
 assert.equal(x.ok,true);assert.equal(x.summary.total,1);
 assert.deepEqual(x.reviews[0].provenance,provenance());
 assert.equal(x.fingerprint.length,64);
});
test('analyzer fails closed on invalid provenance',()=>{
 const x=analyze(document(capture('x',{provenance:null})));
 assert.equal(x.ok,false);assert.equal(x.summary,null);assert.equal(x.fingerprint,null);
});
test('analyzer leaves caller input untouched',()=>{
 const x=document();const before=JSON.stringify(x);
 analyze(x);assert.equal(JSON.stringify(x),before);
});
test('capture keys preserve route locale and environment',()=>{
 assert.equal(captureKey(capture('a')),'/example|en|offline');
});
test('parity finds missing French counterpart',()=>{
 const x=languageParity(document(),options);
 assert.ok(x.issues.some(f=>f.code==='LANGUAGE_MISSING'));
 assert.equal(x.pairs[0].status,'UNKNOWN');
});
test('parity passes matching control inventories',()=>{
 const x=languageParity(pair(),options);
 assert.equal(x.ok,true);assert.equal(x.issues.length,0);
 assert.equal(x.pairs[0].status,'PASS');
});
test('parity detects control missing from French',()=>{
 const doc=document(capture('en'),capture('fr',{language:'fr',controls:[]}));
 const x=languageParity(doc,options);
 assert.ok(x.issues.some(f=>f.code==='CONTROL_MISSING_FR'));
 assert.equal(x.pairs[0].status,'UNKNOWN');
});
test('parity detects control missing from English',()=>{
 const doc=document(capture('en',{controls:[]}),capture('fr',{language:'fr'}));
 const x=languageParity(doc,options);
 assert.ok(x.issues.some(f=>f.code==='CONTROL_MISSING_EN'));
});
test('parity is grouped by route and environment',()=>{
 const doc=document(capture('en'),capture('fr',{language:'fr',environment:'online'}));
 const x=languageParity(doc,options);
 assert.equal(x.pairs.length,2);
 assert.equal(x.issues.filter(f=>f.code==='LANGUAGE_MISSING').length,2);
});
test('parity rejects invalid documents',()=>{
 assert.equal(languageParity({},options).ok,false);
});
test('coverage matrix produces all six EN/FR environment cells',()=>{
 const x=coverageMatrix(document(),options);
 assert.equal(x.rows.length,6);
 assert.equal(x.summary.missing,5);
});
test('coverage never fills an unobserved French offline cell',()=>{
 const x=coverageMatrix(document(),options);
 const fr=x.rows.find(r=>r.language==='fr'&&r.environment==='offline');
 assert.equal(fr.status,'UNKNOWN');assert.equal(fr.captures,0);
});
test('coverage can represent a complete observed matrix',()=>{
 const entries=[];
 for(const language of ['en','fr'])for(const environment of ['online','offline','limited'])entries.push(capture(`${language}-${environment}`,{language,environment}));
 const x=coverageMatrix(document(...entries),options);
 assert.equal(x.summary.missing,0);assert.equal(x.summary.unknown,0);
});
test('coverage propagates captured failures',()=>{
 const x=coverageMatrix(document(capture('a',{offlineShell:'FAIL'})),options);
 assert.equal(x.summary.fail,1);
});
test('coverage invalid document does not create a matrix',()=>{
 const x=coverageMatrix({},options);
 assert.equal(x.ok,false);assert.equal(x.rows.length,0);
});
test('identical snapshots have no release changes',()=>{
 const x=compareReviews(document(),document(),options);
 assert.equal(x.ok,true);assert.deepEqual(x.changes,[]);
});
test('changed overall outcome is reported explicitly',()=>{
 const x=compareReviews(document(),document(capture('sample-en',{offlineShell:'FAIL'})),options);
 assert.ok(x.changes.some(c=>c.kind==='OUTCOME_CHANGED'&&c.review==='FAIL'));
});
test('changed individual rule reported even if overall state same',()=>{
 const a=document(capture('a',{controls:[control('submit',{focusVisible:'PASS'})]}));
 const b=document(capture('a',{controls:[control('submit',{focusVisible:'FAIL'})],offlineShell:'FAIL'}));
 const x=compareReviews(a,b,options);
 assert.ok(x.changes.some(c=>c.kind==='RULE_CHANGED'&&c.rule==='FOCUS_VISIBLE'));
});
test('one new capture is a review request, not automatic pass',()=>{
 const x=compareReviews({version:1,captures:[]},document(),options);
 assert.ok(x.changes.some(c=>c.kind==='ADDED'&&c.review==='UNKNOWN'));
});
test('removed capture is not silently ignored',()=>{
 const x=compareReviews(document(),{version:1,captures:[]},options);
 assert.ok(x.changes.some(c=>c.kind==='REMOVED'));
});
test('source changes trigger review even when all rules stay PASS',()=>{
 const b=document(capture('sample-en',{provenance:{...provenance(),source:'https://example.net/source'}}));
 const x=compareReviews(document(),b,options);
 assert.ok(x.changes.some(c=>c.kind==='PROVENANCE_CHANGED'));
});
test('UNKNOWN to PASS is a review, not an automatic certification',()=>{
 const a=document(capture('sample-en',{offlineShell:'UNKNOWN'}));
 const x=compareReviews(a,document(),options);
 assert.ok(x.changes.some(c=>c.kind==='OUTCOME_CHANGED'&&c.review==='UNKNOWN'));
});
test('known PASS to UNKNOWN is an evidence loss',()=>{
 const b=document(capture('sample-en',{offlineShell:'UNKNOWN'}));
 const x=compareReviews(document(),b,options);
 assert.ok(x.changes.some(c=>c.kind==='OUTCOME_CHANGED'&&c.next==='UNKNOWN'));
});
test('release comparison refuses invalid earlier input',()=>{
 assert.equal(compareReviews({},document(),options).ok,false);
});
test('release comparison refuses invalid later input',()=>{
 assert.equal(compareReviews(document(),{},options).ok,false);
});
test('release diff ignores capture ordering',()=>{
 const before=document(capture('b'),capture('a'));
 const after=document(capture('a'),capture('b'));
 assert.equal(compareReviews(before,after,options).changes.length,0);
});
test('release comparison never mutates either input',()=>{
 const a=document(),b=clone(document());const snapshots=JSON.stringify([a,b]);
 compareReviews(a,b,options);assert.equal(JSON.stringify([a,b]),snapshots);
});
