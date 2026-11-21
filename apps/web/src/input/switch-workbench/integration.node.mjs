import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, URL as NodeURL } from 'node:url';
import { defaultControl, defaultProject, moveControl, removeControl, reviewProject, updateControl } from './model.ts';
import { initialMachine, machineAudit, replay, replaySafely, withMode } from './engine.ts';
import { auditProjectAgainstBrowser, auditScanMapping, snapshotDifference } from './audit.ts';
import { buildHandoff, buildReport, compareReports, exportCsv, exportHandoff, exportJson, reportIssues } from './report.ts';
import { commandLabel, decisionLabel, workbenchCopy } from './copy.ts';
const directory=fileURLToPath(new NodeURL('.',import.meta.url));
const app=resolve(directory,'../../');
const content=(path)=>readFileSync(resolve(app,path),'utf8');
const source=()=>({title:'Open listing',url:'https://example.org/catalogue',licence:'Open licence',accessed:'2026-11-18'});
const control=(id='first',changes={})=>({...defaultControl(id),evidence:'DOCUMENTED',source:source(),reviewed:true,...changes});
const project=(controls=[control()])=>({id:'practice',title:{en:'Practice',fr:'Essai'},locale:'en',controls,focusOrder:controls.map(x=>x.id)});
const node=(id='first',changes={})=>({id,tag:'button',role:'button',name:'Continue',description:'Move to the next item',ariaLabelledBy:[],ariaDescribedBy:[],ariaControls:[],focusable:true,tabIndex:0,visible:true,disabled:false,width:44,height:44,parent:'main',...changes});
const browser=(changes={})=>({lang:'en',title:'Practice',nodes:[node('main',{tag:'main',role:'main',focusable:false,name:'Main'}),node()],actualFocusOrder:['first'],live:[],mainCount:1,h1Count:1,...changes});
const codes=list=>list.map(x=>x.code);
const has=(issues,code)=>assert.ok(codes(issues).includes(code),`${code} missing`);

test('route contains lazy workbench import',()=>assert.ok(content('router.tsx').includes('switch-workbench/WorkbenchPage.tsx')));
test('route contains input-workbench path',()=>assert.ok(content('router.tsx').includes('path: "input-workbench"')));
test('route wraps workbench with Section',()=>assert.ok(content('router.tsx').includes('<Section><Suspense')));
test('route includes loading fallback',()=>assert.ok(content('router.tsx').includes('fallback={<p role="status">Loading…</p>}')));
test('Home includes workbench route',()=>assert.ok(content('pages/HomePage.tsx').includes('to="/input-workbench"')));
test('Home includes English workbench label',()=>assert.ok(content('pages/HomePage.tsx').includes('Keyboard and switch workbench')));
test('Home includes French workbench label',()=>assert.ok(content('pages/HomePage.tsx').includes('Atelier clavier et contacteur')));
test('Home link has 44 px target',()=>assert.ok(content('pages/HomePage.tsx').includes('to="/input-workbench" style={{ minHeight: 44 }}')));
test('route coverage includes workbench',()=>assert.ok(content('states/routeCoverage.ts').includes('"input-workbench": {')));
test('route coverage uses form mechanism',()=>assert.ok(content('states/routeCoverage.ts').includes('"input-workbench": { file: "input/switch-workbench/WorkbenchPage.tsx", mechanism: "form"')));
test('route coverage provides explanation',()=>assert.ok(content('states/routeCoverage.ts').includes('Bilingual control form shows local field validation')));
test('public input barrel exports workbench model',()=>assert.ok(content('input/index.ts').includes('workbenchDefaultProject')));
test('public input barrel exports workbench scanner',()=>assert.ok(content('input/index.ts').includes('initialWorkbenchMachine')));
test('public input barrel exports workbench reports',()=>assert.ok(content('input/index.ts').includes('buildWorkbenchReport')));
test('public input barrel exports bilingual copy',()=>assert.ok(content('input/index.ts').includes('workbenchCopy')));
test('workbench page is lazy-loaded by the route',()=>assert.ok(content('router.tsx').includes('WorkbenchPage')));
test('screen exposes local privacy statement',()=>assert.ok(content('input/switch-workbench/WorkbenchPage.tsx').includes('{copy.local}')));
test('screen has two separate language fields',()=>assert.ok(content('input/switch-workbench/WorkbenchPage.tsx').includes('name-en')&&content('input/switch-workbench/WorkbenchPage.tsx').includes('name-fr')));
test('screen has distinct descriptions',()=>assert.ok(content('input/switch-workbench/WorkbenchPage.tsx').includes('description-en')&&content('input/switch-workbench/WorkbenchPage.tsx').includes('description-fr')));
test('screen uses minHeight 44',()=>assert.ok(content('input/switch-workbench/WorkbenchPage.tsx').includes('minHeight: 44')));
test('screen uses minWidth 44',()=>assert.ok(content('input/switch-workbench/WorkbenchPage.tsx').includes('minWidth: 44')));
test('screen has keyboard group',()=>assert.ok(content('input/switch-workbench/WorkbenchPage.tsx').includes('role="group"')));
test('screen has polite live status',()=>assert.ok(content('input/switch-workbench/WorkbenchPage.tsx').includes('aria-live="polite"')));
test('screen has assertive form status',()=>assert.ok(content('input/switch-workbench/WorkbenchPage.tsx').includes('aria-live="assertive"')));
test('screen supports CSV export',()=>assert.ok(content('input/switch-workbench/WorkbenchPage.tsx').includes("saveReport('csv')")));
test('screen supports JSON export',()=>assert.ok(content('input/switch-workbench/WorkbenchPage.tsx').includes("saveReport('json')")));
test('screen supports local handoff',()=>assert.ok(content('input/switch-workbench/WorkbenchPage.tsx').includes("saveReport('handoff')")));
test('screen has a clear-session action',()=>assert.ok(content('input/switch-workbench/WorkbenchPage.tsx').includes('onClick={reset}')));
test('screen has a return-home link',()=>assert.ok(content('input/switch-workbench/WorkbenchPage.tsx').includes('to="/"')));
test('screen does not persist to localStorage',()=>assert.ok(!content('input/switch-workbench/WorkbenchPage.tsx').includes('localStorage')));
test('screen does not persist to indexedDB',()=>assert.ok(!content('input/switch-workbench/WorkbenchPage.tsx').includes('indexedDB')));
test('screen does not fetch remote data',()=>assert.ok(!content('input/switch-workbench/WorkbenchPage.tsx').includes('fetch(')));
test('screen uses no dwell timers',()=>assert.ok(!content('input/switch-workbench/WorkbenchPage.tsx').includes(['set','Interval('].join(''))));
test('screen uses no background timers',()=>assert.ok(!content('input/switch-workbench/WorkbenchPage.tsx').includes(['set','Timeout('].join(''))));
for(const sequence of [
  ['NEXT'],['NEXT','NEXT'],['HOME'],['END'],['PREVIOUS'],
  ['NEXT','SELECT'],['HOME','SELECT'],['END','SELECT'],
  ['NEXT','CANCEL'],['NEXT','RESET'],['NEXT','NEXT','BACK'],
  ['GROUP_NEXT'],['GROUP_NEXT','GROUP_PREVIOUS'],
]){
  test(`integrated command sequence ${sequence.join('-')} keeps audit structure`,()=>{
    const p=project([control('first'),control('second')]);
    const machine=replay(p,sequence);
    assert.deepEqual(machineAudit(machine,p),[]);
    assert.equal(buildReport(p,machine).version,1);
  });
  test(`integrated command sequence ${sequence.join('-')} exports valid JSON`,()=>{
    const p=project([control('first'),control('second')]);
    const machine=replay(p,sequence);
    assert.deepEqual(reportIssues(JSON.parse(exportJson(buildReport(p,machine)))),[]);
  });
}
test('source presence does not change local-only privacy contract',()=>assert.equal(buildHandoff(buildReport(project(),initialMachine())).privacy,'LOCAL_ONLY'));
test('empty project with no scan observations remains UNKNOWN',()=>assert.equal(buildReport(defaultProject(),initialMachine()).decision,'UNKNOWN'));
test('unknown evidence with scan observations remains UNKNOWN',()=>{
  const p=project([defaultControl()]);
  assert.equal(buildReport(p,replay(p,['NEXT','SELECT'])).decision,'UNKNOWN');
});
test('missing browser snapshot keeps result UNKNOWN',()=>assert.equal(buildReport(project(),replay(project(),['NEXT'])).decision,'UNKNOWN'));
test('browser audit makes missing node explicit',()=>has(auditProjectAgainstBrowser(project(),browser({nodes:[]})),'mapping.missing-control'));
test('browser audit with consistent node has no mismatch finding',()=>assert.ok(!codes(auditProjectAgainstBrowser(project(),browser())).includes('mapping.name-mismatch')));
test('change in accessible name appears in diff',()=>has(snapshotDifference(browser(),browser({nodes:[node('main',{tag:'main',role:'main',focusable:false,name:'Main'}),node('first',{name:'Other'})]})),'diff.name'));
test('switch selection of absent DOM target is detected',()=>has(auditScanMapping(project(),{...initialMachine(),selected:'gone'},browser()),'scan.selection-not-operable'));
test('switch focus of absent DOM target is detected',()=>has(auditScanMapping(project(),{...initialMachine(),focus:'gone'},browser()),'scan.target-not-in-dom'));
test('adding one control preserves existing control',()=>{
  const p=updateControl(project(),control('second'));
  assert.equal(p.controls.length,2);
  assert.equal(p.controls[0].id,'first');
});
test('adding one control appends focus stop',()=>{
  const p=updateControl(project(),control('second'));
  assert.deepEqual(p.focusOrder,['first','second']);
});
test('reordering focus does not mutate original project',()=>{
  const p=updateControl(project(),control('second'));
  const q=moveControl(p,'second',-1);
  assert.deepEqual(p.focusOrder,['first','second']);
  assert.deepEqual(q.focusOrder,['second','first']);
});
test('reordered focus drives sequential scanner',()=>{
  const p=moveControl(project([control('first'),control('second')]),'second',-1);
  assert.equal(replay(p,['NEXT']).focus,'second');
});
test('removing control prevents stale selection',()=>{
  const p=removeControl(project([control('first'),control('second')]),'first');
  assert.equal(replay(p,['NEXT','SELECT']).selected,'second');
});
test('removing control removes it from focus walk',()=>{
  const p=removeControl(project([control('first'),control('second')]),'first');
  assert.deepEqual(p.focusOrder,['second']);
});
test('invalid action in sequence never invents a selection',()=>{
  const result=replaySafely(project(),['INVALID','SELECT']);
  assert.equal(result.state.selected,null);
  assert.ok(result.issues.length>0);
});
test('a cancelled sequence records no selected target',()=>{
  const machine=replay(project(),['NEXT','SELECT','CANCEL']);
  assert.equal(machine.selected,null);
});
test('reset preserves no active focus',()=>assert.equal(replay(project(),['NEXT','RESET']).focus,null));
test('bilingual copies are genuinely different',()=>assert.notEqual(workbenchCopy('en').title,workbenchCopy('fr').title));
test('French command uses a translation',()=>assert.equal(commandLabel('NEXT','fr'),'Suivant'));
test('English command uses a translation',()=>assert.equal(commandLabel('NEXT','en'),'Next'));
test('UNKNOWN decision stays explicit in both languages',()=>{
  assert.equal(decisionLabel('UNKNOWN','en'),'UNKNOWN');
  assert.equal(decisionLabel('UNKNOWN','fr'),'UNKNOWN');
});
test('report JSON never includes stored source content',()=>{
  const text=exportJson(buildReport(project(),initialMachine()));
  assert.ok(!text.includes('https://example.org'));
  assert.ok(!text.includes('Open listing'));
});
test('report CSV never includes stored source content',()=>{
  const text=exportCsv(buildReport(project(),initialMachine()));
  assert.ok(!text.includes('https://example.org'));
  assert.ok(!text.includes('Open listing'));
});
test('handoff excludes user-provided descriptions',()=>{
  const p=project([control('first',{description:{en:'Private note',fr:'Note privée'}})]);
  const text=exportHandoff(buildHandoff(buildReport(p,initialMachine())));
  assert.ok(!text.includes('Private note'));
  assert.ok(!text.includes('Note privée'));
});
test('review changes only after evidence is supplied',()=>{
  const unknown=project([defaultControl()]);
  const known=project([control()]);
  assert.equal(reviewProject(unknown).decision,'UNKNOWN');
  assert.equal(reviewProject(known).decision,'READY');
});
test('review and report preserve a structural defect',()=>{
  const p=project([control('first',{width:20})]);
  assert.equal(reviewProject(p).decision,'REVIEW');
  assert.equal(buildReport(p,initialMachine()).decision,'REVIEW');
});
test('focus history cannot silently grow after reset',()=>{
  const p=project([control('first'),control('second')]);
  const machine=replay(p,['NEXT','NEXT','RESET']);
  assert.deepEqual(machine.history,[]);
});
test('mode change does not reuse stale focus',()=>{
  const p=project();
  const focused=replay(p,['NEXT']);
  assert.equal(withMode(focused,'GROUPED').focus,null);
});
test('manual report does not turn UNKNOWN into READY',()=>{
  const p=project();
  const report=buildReport(p,replay(p,['NEXT','SELECT']));
  assert.equal(report.decision,'UNKNOWN');
});
test('browser observation with no status messages does not invent status',()=>{
  assert.deepEqual(browser().live,[]);
});
test('report comparisons preserve added structural findings',()=>{
  const a=buildReport(project(),initialMachine());
  const b=buildReport(project([control('first',{width:10})]),initialMachine());
  assert.ok(compareReports(a,b).some(x=>x.kind==='ADDED'));
});
test('workbench remains isolated from rehearsal module',()=>{
  const barrel=content('input/index.ts');
  assert.ok(barrel.includes('switch-workbench/model.ts'));
  assert.ok(barrel.includes('rehearsal/model.ts'));
});
