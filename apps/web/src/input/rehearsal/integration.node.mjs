import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assessJourney, DEFAULT_OPTIONS, journeyIssues, issue } from './model.ts';
import { initialScan, inspectAnnouncements, inspectKeyboard, inspectTargets, replayScan, targetsForJourney } from './scanner.ts';
import { auditSemanticSnapshot, compareSemantics } from './semantics.ts';
import { coverage, exportCsv, exportJson, inspectSession, limitedSummary } from './report.ts';
import { kindLabel, reasonLabel, rehearsalCopy, statusLabel } from './copy.ts';

const bilingual = (en = 'Entrance', fr = 'Entrée') => ({ en, fr });
const source = (changes={}) => ({ name:'Public catalogue', url:'https://example.org/info', licence:'Open licence', collectedOn:'2026-11-18', tier:'PRIMARY', ...changes });
const step = (id='door',sequence=0,changes={}) => ({ id,sequence,kind:'entrance',label:bilingual(),detail:bilingual('Look for ramp','Chercher une rampe'),
  access:'supported',source:source(),offline:{state:'stored',path:`/offline/${id}.json`,savedOn:'2026-11-19'},needsReview:false,...changes });
const journey=(steps=[step()])=>({id:'journey',name:bilingual('Test journey','Trajet d’essai'),createdOn:'2026-11-19',steps});
const message=(changes={})=>({id:'notice',locale:'en',text:'UNKNOWN remains UNKNOWN',status:'UNKNOWN',politeness:'polite',sequence:0,...changes});
const focus=(id='door',changes={})=>({target:id,key:'Tab',before:null,after:id,activated:false,visible:true,width:44,height:44,contained:true,...changes});
const session=(j=journey(),extra={})=>({journey:j,locale:'en',targets:targetsForJourney(j,'en'),keyboard:[focus()],announcements:[message()],
  scan:{controls:initialScan(),selected:null,issues:[]},notes:'',...extra});
const node=(id,changes={})=>({id,tag:'button',role:'button',text:id,label:null,labelledBy:[],describedBy:[],controls:[],tabIndex:0,disabled:false,hidden:false,inert:false,width:44,height:44,parent:'main',...changes});
const dom=(changes={})=>({lang:'en',title:'Journey review',mainCount:1,nodes:[node('heading',{tag:'h1',role:null}),node('main',{tag:'main',role:'main'}),node('door')],focusOrder:['door'],statusMessages:['UNKNOWN'],...changes});
const codes = findings => findings.map(f=>f.code);
const has=(items,code)=>assert.ok(codes(items).includes(code),`${code} absent`);

test('fresh supported journey has a ready evidence assessment',()=>assert.equal(assessJourney(journey()).status,'READY'));
test('new journey with no source never implies ready',()=>assert.equal(assessJourney(journey([step('door',0,{source:null})])).status,'UNKNOWN'));
test('all labels remain bilingual',()=>assert.deepEqual(journeyIssues(journey()),[]));
test('current journey targets match its step order',()=>assert.deepEqual(targetsForJourney(journey(),'en').map(t=>t.id),['door']));
test('unknown evidence is still selectable for review',()=>assert.equal(targetsForJourney(journey([step('door',0,{access:'unknown'})]),'en')[0].disabled,false));
test('unsupported step is not a scanning target',()=>assert.equal(targetsForJourney(journey([step('door',0,{access:'unsupported'})]),'en')[0].disabled,true));
test('scan advances from no focus to the first step',()=>assert.equal(replayScan(['NEXT'],targetsForJourney(journey(),'en')).controls.focus,'door'));
test('scan Select maps to the same evidence step',()=>assert.equal(replayScan(['NEXT','SELECT'],targetsForJourney(journey(),'en')).selected,'door'));
test('a scan action cannot promote unknown evidence',()=>{
  const j=journey([step('door',0,{access:'unknown'})]);
  const selected=replayScan(['NEXT','SELECT'],targetsForJourney(j,'en'));
  assert.equal(selected.selected,'door');
  assert.equal(assessJourney(j).status,'UNKNOWN');
});
test('missing controls leave an explicit empty scan issue',()=>has(replayScan(['NEXT'],[]).issues,'scan.empty'));
test('scan buttons need accessible names',()=>has(inspectTargets([{id:'door',name:'',group:'entrance',kind:'entrance',disabled:false,hidden:false}]),'target.name'));
test('minimum target geometry is enforced at 44 pixels',()=>has(inspectKeyboard([focus('door',{width:43})],targetsForJourney(journey(),'en')),'keyboard.target-size'));
test('keyboard activation failures are not hidden',()=>has(inspectKeyboard([focus('door',{key:'Enter',activated:false})],targetsForJourney(journey(),'en')),'keyboard.no-activation'));
test('malformed live feedback is detected',()=>has(inspectAnnouncements([message({text:''})],'en'),'announcement.text'));
test('English and French announcements cannot be mixed silently',()=>has(inspectAnnouncements([message({locale:'fr'})],'en'),'announcement.locale'));
test('semantic landmark reports a single heading',()=>assert.deepEqual(auditSemanticSnapshot(dom()),[]));
test('semantic snapshot exposes unnamed controls',()=>has(auditSemanticSnapshot(dom({nodes:[node('heading',{tag:'h1',role:null}),node('main',{tag:'main',role:'main'}),node('door',{text:''})]})),'operable.unnamed'));
test('semantic snapshot exposes missing ID references',()=>has(auditSemanticSnapshot(dom({nodes:[node('heading',{tag:'h1',role:null}),node('main',{tag:'main',role:'main'}),node('door',{labelledBy:['gone']})]})),'semantics.dangling-reference'));
test('semantic compare reports newly disabled controls',()=>has(compareSemantics(dom(),dom({nodes:dom().nodes.map(n=>n.id==='door'?{...n,disabled:true}:n)})),'semantics.new-disabled'));
test('report includes source assessment',()=>assert.equal(inspectSession(session(),DEFAULT_OPTIONS).sourceStatus,'READY'));
test('report includes keyboard assessment',()=>assert.equal(inspectSession(session(),DEFAULT_OPTIONS).keyboardStatus,'READY'));
test('report stays unknown when keyboard observations absent',()=>assert.equal(inspectSession(session(journey(),{keyboard:[]}),DEFAULT_OPTIONS).status,'UNKNOWN'));
test('report does not escalate unknown source to supported',()=>assert.equal(inspectSession(session(journey([step('door',0,{source:null})])),DEFAULT_OPTIONS).status,'UNKNOWN'));
test('report contains red flags without private descriptions',()=>{
  const report=inspectSession(session(journey(),{keyboard:[focus('door',{width:20})]}),DEFAULT_OPTIONS);
  assert.equal(report.status,'HOLD');assert.equal(JSON.stringify(report.findings).includes('Look for ramp'),false);
});
test('CSV reports exclude step text',()=>assert.equal(exportCsv(inspectSession(session(),DEFAULT_OPTIONS)).includes('Look for ramp'),false));
test('JSON reports exclude source URL',()=>assert.equal(exportJson(inspectSession(session(),DEFAULT_OPTIONS)).includes('https://example.org/info'),false));
test('coverage reflects one ready step',()=>assert.equal(coverage(inspectSession(session(),DEFAULT_OPTIONS)).ready,1));
test('coverage reflects one unknown step',()=>assert.equal(coverage(inspectSession(session(journey([step('door',0,{source:null})])),DEFAULT_OPTIONS)).unknown,1));
test('limited summary has explicit status',()=>assert.ok(limitedSummary(inspectSession(session(),DEFAULT_OPTIONS)).includes('READY')));
test('French status labels preserve unknown state',()=>assert.equal(statusLabel('UNKNOWN','fr'),'UNKNOWN'));
test('French UI heading uses curly apostrophe',()=>assert.ok(rehearsalCopy('fr').title.includes('’')));
test('French step kind uses local translation',()=>assert.equal(kindLabel('entrance','fr'),'Entrée'));
test('English kind names are in English',()=>assert.equal(kindLabel('exit','en'),'Exit'));
test('French source explanation is available',()=>assert.ok(rehearsalCopy('fr').sourceNote.length>0));
test('French report actions are translated',()=>assert.notEqual(rehearsalCopy('fr').exportJson,rehearsalCopy('en').exportJson));
test('French review reason is translated',()=>assert.equal(reasonLabel('source.missing','fr'),'Source absente'));
test('unknown reason without localized mapping stays structural',()=>assert.equal(reasonLabel('unlisted.code','fr'),'unlisted.code'));
test('reports have no modification side effects',()=>{
  const value=session();const before=JSON.stringify(value);
  const report=inspectSession(value,DEFAULT_OPTIONS);exportJson(report);exportCsv(report);
  assert.equal(JSON.stringify(value),before);
});
test('scan action history persists in memory only',()=>{
  const actions=['NEXT','SELECT','CANCEL'];
  const result=replayScan(actions,targetsForJourney(journey(),'en'));
  assert.deepEqual(result.controls.history,actions);
});
test('a cancelled scan produces no selected step',()=>assert.equal(replayScan(['NEXT','SELECT','CANCEL'],targetsForJourney(journey(),'en')).selected,null));
test('reset clears history without persisting anything',()=>assert.deepEqual(replayScan(['NEXT','RESET'],targetsForJourney(journey(),'en')).controls.history,[]));
test('source content remains in original input after reporting',()=>{
  const original=journey();const before=JSON.stringify(original);
  inspectSession(session(original),DEFAULT_OPTIONS);
  assert.equal(JSON.stringify(original),before);
});
test('manual review holds a supported but flagged step',()=>{
  const j=journey([step('door',0,{needsReview:true})]);
  assert.equal(assessJourney(j).status,'HOLD');
});
test('valid bilingual punctuation survives local report',()=>{
  const j=journey([step('door',0,{detail:bilingual('Look near the door','Note\u00A0: regarder la porte')})]);
  assert.equal(assessJourney(j).status,'READY');
});
test('missing French description produces holding issue',()=>{
  const j=journey([step('door',0,{detail:{en:'Look near the door',fr:''}})]);
  has(assessJourney(j).findings,'copy.fr');
});
test('multiple steps appear in a deterministic order',()=>{
  const j=journey([step('exit',1),step('door',0)]);
  assert.deepEqual(targetsForJourney(j,'en').map(t=>t.id),['door','exit']);
});
test('unknown evidence does not erase other step readiness',()=>{
  const j=journey([step('door',0),step('exit',1,{source:null})]);
  const result=assessJourney(j);
  assert.deepEqual(result.steps.map(s=>s.status),['READY','UNKNOWN']);
});
test('focus target sizing is independent of evidence tier',()=>{
  const j=journey([step('door',0,{source:source({tier:'UNKNOWN'})})]);
  has(inspectKeyboard([focus('door',{height:32})],targetsForJourney(j,'en')),'keyboard.target-size');
});
test('text-only status messages do not store personal annotations',()=>{
  const report=inspectSession(session(journey(),{notes:'Private observation'}),DEFAULT_OPTIONS);
  assert.equal(exportJson(report).includes('Private observation'),false);
});
test('generic diagnostic codes remain safe to export',()=>{
  const report=inspectSession(session(journey(),{keyboard:[focus('door',{visible:false})]}),DEFAULT_OPTIONS);
  assert.ok(exportCsv(report).includes('keyboard.not-visible'));
});
test('unknown evidence stays unknown after switch reset',()=>{
  const j=journey([step('door',0,{access:'unknown'})]);
  replayScan(['NEXT','SELECT','RESET'],targetsForJourney(j,'fr'));
  assert.equal(assessJourney(j).status,'UNKNOWN');
});
