import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assessJourney, DEFAULT_OPTIONS, checkFrenchPunctuation, journeyIssues, ordinal } from './model.ts';
import { inspectKeyboard, inspectAnnouncements, initialScan, replayScan, targetsForJourney } from './scanner.ts';
import { coverage, comparison, detectRegressions, exportCsv, exportJson, inspectSession } from './report.ts';
import { auditSemanticSnapshot, resolveName } from './semantics.ts';

const text = (en='Door',fr='Porte') => ({en,fr});
const reference = (changes={}) => ({name:'Transit catalogue',url:'https://example.org/doors',licence:'CC0-1.0',collectedOn:'2026-11-19',tier:'PRIMARY',...changes});
const step = (id,sequence,changes={}) => ({id,sequence,kind:'entrance',label:text(),detail:text('Look at entrance','Examiner l’entrée'),
  access:'supported',source:reference(),offline:{state:'stored',path:`/offline/${id}.json`,savedOn:'2026-11-19'},needsReview:false,...changes});
const journey = (...steps) => ({id:'journey',name:text('Day trip','Sortie'),createdOn:'2026-11-19',steps});
const env = (j,changes={}) => ({journey:j,locale:'en',targets:targetsForJourney(j,'en'),keyboard:[],announcements:[],
  scan:{controls:initialScan(),selected:null,issues:[]},notes:'',...changes});
const codes = xs => xs.map(x=>x.code);
const find = (xs,code) => assert.ok(codes(xs).includes(code),code);

test('bilingual two-step journey can pass',()=>assert.equal(assessJourney(journey(step('entry',0),step('exit',1))).status,'READY'));
test('third step can be added without changing previous IDs',()=>assert.equal(assessJourney(journey(step('entry',0),step('exit',1),step('path',2))).steps.length,3));
test('one unsupported step holds overall assessment',()=>assert.equal(assessJourney(journey(step('entry',0),step('exit',1,{access:'unsupported'}))).status,'HOLD'));
test('one unknown step makes overall assessment unknown',()=>assert.equal(assessJourney(journey(step('entry',0),step('exit',1,{access:'unknown'}))).status,'UNKNOWN'));
test('unknown source tier cannot become ready due to another primary source',()=>assert.equal(assessJourney(journey(step('entry',0),step('exit',1,{source:reference({tier:'UNKNOWN'})}))).status,'UNKNOWN'));
test('missing source leaves other step ready but total unknown',()=>assert.deepEqual(assessJourney(journey(step('entry',0),step('exit',1,{source:null}))).steps.map(x=>x.status),['READY','UNKNOWN']));
test('duplicate source cache paths make whole journey invalid',()=>find(journeyIssues(journey(step('entry',0),step('exit',1,{offline:{state:'stored',path:'/offline/entry.json',savedOn:'2026-11-19'}}))),'offline.duplicate-path'));
test('step ordering collisions are recorded explicitly',()=>find(journeyIssues(journey(step('entry',0),step('exit',0))),'step.duplicate-sequence'));
test('duplicate step IDs are not silently deduplicated',()=>find(journeyIssues(journey(step('entry',0),step('entry',1))),'step.duplicate-id'));
test('a source from tomorrow is not accepted as today',()=>assert.equal(assessJourney(journey(step('entry',0,{source:reference({collectedOn:'2026-11-20'})}))).status,'HOLD'));
test('offline metadata cannot claim a future saving date',()=>assert.equal(assessJourney(journey(step('entry',0,{offline:{state:'stored',path:'/offline/entry.json',savedOn:'2026-11-20'}}))).status,'HOLD'));
test('stale sources are held at a strict age boundary',()=>assert.equal(assessJourney(journey(step('entry',0,{source:reference({collectedOn:'2026-11-18'})})),{...DEFAULT_OPTIONS,maxAgeDays:0}).status,'HOLD'));
test('one day old source is accepted at one-day limit',()=>assert.equal(assessJourney(journey(step('entry',0,{source:reference({collectedOn:'2026-11-18'})})),{...DEFAULT_OPTIONS,maxAgeDays:1}).status,'READY'));
test('the calendar counts exact source age without timezone offset',()=>assert.equal(ordinal('2026-11-19')-ordinal('2026-11-18'),1));
test('a manual review request holds instead of promoting evidence',()=>assert.equal(assessJourney(journey(step('entry',0,{needsReview:true}))).status,'HOLD'));
test('unknown offline state retains an unknown assessment',()=>assert.equal(assessJourney(journey(step('entry',0,{offline:{state:'unknown'}}))).status,'UNKNOWN'));
test('when offline is required an absent cache blocks readiness',()=>assert.equal(assessJourney(journey(step('entry',0,{offline:{state:'absent'}})),{...DEFAULT_OPTIONS,requireOffline:true}).status,'HOLD'));
test('when offline not required an absent copy leaves source decision unchanged',()=>assert.equal(assessJourney(journey(step('entry',0,{offline:{state:'absent'}}))).status,'READY'));
test('empty journey creates an explicit holding state',()=>assert.equal(assessJourney(journey()).status,'HOLD'));
test('French apostrophe style is assessed without changing stored copy',()=>assert.deepEqual(checkFrenchPunctuation('l’entrée'),[]));
test('French colon spacing does not depend on the English label',()=>assert.deepEqual(checkFrenchPunctuation('Entrée\u00A0: principale'),[]));
test('French narrow question spacing is accepted',()=>assert.deepEqual(checkFrenchPunctuation('Où\u202F?'),[]));
test('French narrow exclamation spacing is accepted',()=>assert.deepEqual(checkFrenchPunctuation('Attention\u202F!'),[]));
test('French guillemet spacing is accepted',()=>assert.deepEqual(checkFrenchPunctuation('«\u202FEntrée\u202F»'),[]));

test('scan skips unsupported step but permits unknown step for manual review',()=>{
  const j=journey(step('unsupported',0,{access:'unsupported'}),step('unknown',1,{access:'unknown'}));
  assert.equal(replayScan(['NEXT'],targetsForJourney(j,'fr')).controls.focus,'unknown');
});
test('scan Next/Previous returns to the same target when three controls exist',()=>{
  const j=journey(step('entry',0),step('path',1),step('exit',2));
  assert.equal(replayScan(['NEXT','NEXT','PREVIOUS'],targetsForJourney(j,'en')).controls.focus,'entry');
});
test('scan reset removes the last selected target',()=>{
  const j=journey(step('entry',0));
  assert.equal(replayScan(['NEXT','SELECT','RESET'],targetsForJourney(j,'en')).selected,null);
});
test('scan cancel removes active focus but keeps prior actions as local history',()=>{
  const j=journey(step('entry',0));
  const r=replayScan(['NEXT','CANCEL'],targetsForJourney(j,'en'));
  assert.equal(r.controls.focus,null);assert.equal(r.controls.history.length,2);
});
test('scan selection cannot create a supported access claim',()=>{
  const j=journey(step('entry',0,{source:null}));
  replayScan(['NEXT','SELECT'],targetsForJourney(j,'en'));
  assert.equal(assessJourney(j).status,'UNKNOWN');
});
test('enforcing 44px does not depend on a source tier',()=>{
  const j=journey(step('entry',0,{source:reference({tier:'UNKNOWN'})}));
  const target=targetsForJourney(j,'en')[0];
  find(inspectKeyboard([{target:target.id,key:'Tab',before:null,after:target.id,activated:false,visible:true,width:43,height:44,contained:true}],[target]),'keyboard.target-size');
});
test('announcements with unavailable language are rejected',()=>{
  find(inspectAnnouncements([{id:'alert',locale:'fr',text:'Inconnu',status:'UNKNOWN',politeness:'polite',sequence:0}],'en'),'announcement.locale');
});
test('explicit unknown announcement is allowed',()=>{
  assert.deepEqual(inspectAnnouncements([{id:'alert',locale:'fr',text:'Inconnu',status:'UNKNOWN',politeness:'polite',sequence:0}],'fr'),[]);
});
test('semantic references cannot invent missing descriptions',()=>{
  const node={id:'button',tag:'button',role:'button',text:'',label:null,labelledBy:['missing'],describedBy:[],controls:[],tabIndex:0,disabled:false,hidden:false,inert:false,width:44,height:44,parent:null};
  assert.equal(resolveName(node,[node]).name,'');
});
test('semantic audit finds duplicate document IDs',()=>{
  const node={id:'duplicate',tag:'button',role:'button',text:'Open',label:null,labelledBy:[],describedBy:[],controls:[],tabIndex:0,disabled:false,hidden:false,inert:false,width:44,height:44,parent:null};
  const document={lang:'en',title:'Rehearsal',mainCount:1,nodes:[node,node,{...node,id:'heading',tag:'h1',role:null}],focusOrder:['duplicate'],statusMessages:['Ready']};
  find(auditSemanticSnapshot(document),'semantics.duplicate-id');
});

test('report coverage counts source-known and source-unknown steps independently',()=>{
  const j=journey(step('entry',0),step('exit',1,{source:null}));
  const r=inspectSession(env(j),DEFAULT_OPTIONS);
  assert.equal(coverage(r).ready,1);assert.equal(coverage(r).unknown,1);
});
test('report without browser evidence cannot claim keyboard readiness',()=>{
  const r=inspectSession(env(journey(step('entry',0))),DEFAULT_OPTIONS);
  assert.equal(r.keyboardStatus,'UNKNOWN');
});
test('report CSV reveals only category codes and structural paths',()=>{
  const j=journey(step('entry',0,{detail:text('Private narrative','Récit privé')}));
  const result=exportCsv(inspectSession(env(j),DEFAULT_OPTIONS));
  assert.equal(result.includes('Private narrative'),false);
});
test('report JSON omits source URLs supplied by users',()=>{
  const j=journey(step('entry',0,{source:reference({url:'https://example.org/private-supplied-link'})}));
  const result=exportJson(inspectSession(env(j),DEFAULT_OPTIONS));
  assert.equal(result.includes('private-supplied-link'),false);
});
test('comparison preserves unchanged steps without modification',()=>{
  const j=journey(step('entry',0));
  assert.equal(comparison(j,j)[0].action,'RETAIN');
});
test('comparison marks unknown access updates for review',()=>{
  const a=journey(step('entry',0));const b=journey(step('entry',0,{access:'unknown'}));
  assert.equal(comparison(a,b)[0].action,'REVIEW');
});
test('regression report finds older collection dates',()=>{
  const a=journey(step('entry',0));const b=journey(step('entry',0,{source:reference({collectedOn:'2026-11-18'})}));
  find(detectRegressions(a,b),'change.source-regressed');
});
test('newly added steps are only proposed as additions',()=>{
  const a=journey();const b=journey(step('entry',0));
  assert.equal(comparison(a,b)[0].action,'ADD');
});
test('removed steps are reported as retirement proposals',()=>{
  const a=journey(step('entry',0));const b=journey();
  assert.equal(comparison(a,b)[0].action,'RETIRE');
});
test('source metadata remains with the original input after reporting',()=>{
  const j=journey(step('entry',0));const saved=JSON.stringify(j);
  inspectSession(env(j),DEFAULT_OPTIONS);
  assert.equal(JSON.stringify(j),saved);
});
