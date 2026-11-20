import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  auditFocusOrder, auditIds, auditLandmarks, auditLiveText, auditOperable,
  auditSemanticSnapshot, compareSemantics, nodeMap, referencesFor, resolveName,
  semanticSummary,
} from './semantics.ts';
const node = (id, changes = {}) => ({ id, tag: 'button', role: 'button', text: `Button ${id}`, label: null,
  labelledBy: [], describedBy: [], controls: [], tabIndex: 0,
  disabled: false, hidden: false, inert: false, width: 44, height: 44, parent: 'main', ...changes });
const snapshot = (changes = {}) => ({lang:'en',title:'Rehearsal',mainCount:1,
  nodes:[node('heading',{tag:'h1',role:null,text:'Rehearsal'}),node('main',{tag:'main',role:'main',text:''}),node('start')],
  focusOrder:['start'],statusMessages:['Ready to check'],...changes});
const codes = items => items.map(item => item.code);
const has = (items,code) => assert.ok(codes(items).includes(code),`${code} not found`);

test('node map indexes element IDs',()=>assert.equal(nodeMap([node('a')]).get('a').length,1));
test('node map keeps duplicate IDs observable',()=>assert.equal(nodeMap([node('a'),node('a')]).get('a').length,2));
test('node map returns empty for empty document',()=>assert.equal(nodeMap([]).size,0));
test('reference collector includes labels',()=>assert.deepEqual(referencesFor(node('a',{labelledBy:['b']})),['b']));
test('reference collector includes descriptions',()=>assert.deepEqual(referencesFor(node('a',{describedBy:['b']})),['b']));
test('reference collector includes controls',()=>assert.deepEqual(referencesFor(node('a',{controls:['b']})),['b']));
test('reference collector concatenates all types in order',()=>assert.deepEqual(referencesFor(node('a',{labelledBy:['b'],describedBy:['c'],controls:['d']})),['b','c','d']));
test('explicit label provides accessible name',()=>assert.equal(resolveName(node('a',{label:'Open'}),[]).name,'Open'));
test('visible text is fallback name',()=>assert.equal(resolveName(node('a',{text:'Open'}),[]).name,'Open'));
test('labelledBy reads referenced text',()=>assert.equal(resolveName(node('a',{text:'',labelledBy:['heading']}),[node('heading',{text:'Open'})]).name,'Open'));
test('multiple labelledBy fragments combine with spaces',()=>assert.equal(resolveName(node('a',{text:'',labelledBy:['one','two']}),[node('one',{text:'Open'}),node('two',{text:'options'})]).name,'Open options'));
test('description is read from referenced text',()=>assert.equal(resolveName(node('a',{describedBy:['help']}),[node('help',{text:'Help text'})]).described,'Help text'));
test('two descriptions combine',()=>assert.equal(resolveName(node('a',{describedBy:['one','two']}),[node('one',{text:'First'}),node('two',{text:'Second'})]).described,'First Second'));
test('missing label reference yields finding',()=>has(resolveName(node('a',{text:'',labelledBy:['missing']}),[]).issues,'semantics.missing-label'));
test('ambiguous label reference yields finding',()=>has(resolveName(node('a',{text:'',labelledBy:['b']}),[node('b'),node('b')]).issues,'semantics.ambiguous-label'));
test('missing description reference yields finding',()=>has(resolveName(node('a',{describedBy:['missing']}),[]).issues,'semantics.missing-description'));
test('ambiguous description yields finding',()=>has(resolveName(node('a',{describedBy:['b']}),[node('b'),node('b')]).issues,'semantics.ambiguous-description'));
test('missing label does not invent a name',()=>assert.equal(resolveName(node('a',{text:'',labelledBy:['missing']}),[]).name,''));

test('valid landmarks have no findings',()=>assert.deepEqual(auditLandmarks(snapshot()),[]));
test('missing language is detected',()=>has(auditLandmarks(snapshot({lang:''})),'document.language'));
test('third language is not silently accepted',()=>has(auditLandmarks(snapshot({lang:'de'})),'document.language'));
test('French language is accepted',()=>assert.deepEqual(auditLandmarks(snapshot({lang:'fr'})),[]));
test('empty document title is detected',()=>has(auditLandmarks(snapshot({title:''})),'document.title'));
test('missing main landmark is detected',()=>has(auditLandmarks(snapshot({mainCount:0})),'document.main-count'));
test('two main landmarks are detected',()=>has(auditLandmarks(snapshot({mainCount:2})),'document.main-count'));
test('duplicate main role is also reported',()=>has(auditLandmarks(snapshot({mainCount:2})),'document.multiple-main'));
test('missing h1 is detected',()=>has(auditLandmarks(snapshot({nodes:[node('main',{tag:'main',role:'main'})]})),'document.h1-count'));
test('two visible h1 headings are detected',()=>has(auditLandmarks(snapshot({nodes:[node('first',{tag:'h1',role:null}),node('second',{tag:'h1',role:null})]})),'document.h1-count'));
test('hidden second h1 does not count',()=>assert.deepEqual(auditLandmarks(snapshot({nodes:[node('first',{tag:'h1',role:null}),node('second',{tag:'h1',role:null,hidden:true})]})),[]));

test('unique IDs pass',()=>assert.deepEqual(auditIds([node('first'),node('second')]),[]));
test('duplicate IDs yield error',()=>has(auditIds([node('a'),node('a')]),'semantics.duplicate-id'));
test('invalid identifier yields error',()=>has(auditIds([node('not a valid id')]),'semantics.invalid-id'));
test('missing labelledBy target yields error',()=>has(auditIds([node('a',{labelledBy:['missing']})]),'semantics.dangling-reference'));
test('missing describedBy target yields error',()=>has(auditIds([node('a',{describedBy:['missing']})]),'semantics.dangling-reference'));
test('missing controls target yields error',()=>has(auditIds([node('a',{controls:['missing']})]),'semantics.dangling-reference'));
test('ambiguous label reference yields error',()=>has(auditIds([node('a',{labelledBy:['b']}),node('b'),node('b')]),'semantics.ambiguous-reference'));
test('existing reference passes',()=>assert.deepEqual(auditIds([node('a',{labelledBy:['b']}),node('b')]),[]));
test('multiple valid references pass',()=>assert.deepEqual(auditIds([node('a',{labelledBy:['b'],controls:['c']}),node('b'),node('c')]),[]));

test('button with visible name passes',()=>assert.deepEqual(auditOperable([node('a')]),[]));
test('explicit label passes',()=>assert.deepEqual(auditOperable([node('a',{text:'',label:'Submit'})]),[]));
test('hidden focusable button fails',()=>has(auditOperable([node('a',{hidden:true})]),'operable.hidden-focusable'));
test('inert focusable button fails',()=>has(auditOperable([node('a',{inert:true})]),'operable.hidden-focusable'));
test('disabled controls do not need target size',()=>assert.deepEqual(auditOperable([node('a',{disabled:true,width:1,height:1})]),[]));
test('positive tab index fails',()=>has(auditOperable([node('a',{tabIndex:4})]),'operable.positive-tabindex'));
test('negative tab index outside composite merits review',()=>has(auditOperable([node('a',{tabIndex:-1})]),'operable.out-of-order'));
test('roving tab can have negative tab index',()=>assert.deepEqual(auditOperable([node('a',{role:'tab',tabIndex:-1})]),[]));
test('roving menuitem can have negative tab index',()=>assert.deepEqual(auditOperable([node('a',{role:'menuitem',tabIndex:-1})]),[]));
test('43px width is too small',()=>has(auditOperable([node('a',{width:43})]),'operable.target-size'));
test('43px height is too small',()=>has(auditOperable([node('a',{height:43})]),'operable.target-size'));
test('44px exactly passes',()=>assert.deepEqual(auditOperable([node('a',{width:44,height:44})]),[]));
test('NaN target dimensions fail',()=>has(auditOperable([node('a',{width:NaN})]),'operable.target-size'));
test('unnamed button is detected',()=>has(auditOperable([node('a',{text:'',label:null})]),'operable.unnamed'));
test('labelled button resolves names',()=>assert.deepEqual(auditOperable([node('a',{text:'',labelledBy:['heading']}),node('heading',{tag:'span',role:null,text:'Open'})]),[]));
test('non-interactive text is not target-sized',()=>assert.deepEqual(auditOperable([node('a',{tag:'p',role:null,width:1,height:1})]),[]));
test('native input is treated as operable',()=>has(auditOperable([node('a',{tag:'input',role:null,text:'',width:20})]),'operable.target-size'));

test('valid focus order passes',()=>assert.deepEqual(auditFocusOrder(snapshot()),[]));
test('missing focus target detected',()=>has(auditFocusOrder(snapshot({focusOrder:['missing']})),'focus.missing-stop'));
test('duplicate focus target detected',()=>has(auditFocusOrder(snapshot({focusOrder:['start','start']})),'focus.duplicate-stop'));
test('hidden focus target detected',()=>has(auditFocusOrder(snapshot({nodes:[node('heading',{tag:'h1',role:null}),node('start',{hidden:true})]})),'focus.unavailable-stop'));
test('disabled focus target detected',()=>has(auditFocusOrder(snapshot({nodes:[node('heading',{tag:'h1',role:null}),node('start',{disabled:true})]})),'focus.unavailable-stop'));
test('negative-tabindex focus target detected',()=>has(auditFocusOrder(snapshot({nodes:[node('heading',{tag:'h1',role:null}),node('start',{tabIndex:-1})]})),'focus.negative-tabindex'));
test('empty focus order is permitted when no controls exist',()=>assert.deepEqual(auditFocusOrder(snapshot({focusOrder:[]})),[]));

test('normal status message passes',()=>assert.deepEqual(auditLiveText(snapshot()),[]));
test('empty status message fails',()=>has(auditLiveText(snapshot({statusMessages:['']})),'live.empty-or-long'));
test('control-containing message fails',()=>has(auditLiveText(snapshot({statusMessages:['a\u0000b']})),'live.empty-or-long'));
test('overlong live message fails',()=>has(auditLiveText(snapshot({statusMessages:['a'.repeat(801)]})),'live.empty-or-long'));
test('French message passes',()=>assert.deepEqual(auditLiveText(snapshot({statusMessages:['État inconnu']})),[]));

test('complete semantic snapshot is clean',()=>assert.deepEqual(auditSemanticSnapshot(snapshot()),[]));
test('complete semantic snapshot diagnoses multiple conditions',()=>{
  const issues=auditSemanticSnapshot(snapshot({lang:'xx',mainCount:0,statusMessages:[''],focusOrder:['missing']}));
  assert.ok(issues.length >= 4);
});
test('semantics audit orders findings deterministically',()=>{
  const findings=auditSemanticSnapshot(snapshot({lang:'xx',mainCount:0}));
  assert.deepEqual(findings.map(f=>f.path),[...findings.map(f=>f.path)].sort());
});
test('same semantic snapshots yield no change findings',()=>assert.deepEqual(compareSemantics(snapshot(),snapshot()),[]));
test('removed node is reported',()=>has(compareSemantics(snapshot(),snapshot({nodes:[]})),'semantics.removed'));
test('added node is reported',()=>has(compareSemantics(snapshot(),snapshot({nodes:[...snapshot().nodes,node('new')]})),'semantics.added'));
test('role change is reported',()=>has(compareSemantics(snapshot(),snapshot({nodes:snapshot().nodes.map(n=>n.id==='start'?{...n,role:'link'}:n)})),'semantics.role-changed'));
test('label change is reported',()=>has(compareSemantics(snapshot(),snapshot({nodes:snapshot().nodes.map(n=>n.id==='start'?{...n,label:'New'}:n)})),'semantics.name-changed'));
test('newly disabled control is reported',()=>has(compareSemantics(snapshot(),snapshot({nodes:snapshot().nodes.map(n=>n.id==='start'?{...n,disabled:true}:n)})),'semantics.new-disabled'));
test('newly hidden control is reported',()=>has(compareSemantics(snapshot(),snapshot({nodes:snapshot().nodes.map(n=>n.id==='start'?{...n,hidden:true}:n)})),'semantics.new-hidden'));
test('summary counts nodes',()=>assert.equal(semanticSummary(snapshot()).nodes,3));
test('summary counts operable controls',()=>assert.equal(semanticSummary(snapshot()).controls,1));
test('summary counts landmarks',()=>assert.equal(semanticSummary(snapshot()).landmarks,1));
test('summary counts focus stops',()=>assert.equal(semanticSummary(snapshot()).focusStops,1));
test('summary counts zero issues for clean snapshot',()=>assert.equal(semanticSummary(snapshot()).issues,0));
test('summary does not mutate input nodes',()=>{
  const before=snapshot();const copy=JSON.stringify(before);
  semanticSummary(before);
  assert.equal(JSON.stringify(before),copy);
});
