import assert from 'node:assert/strict';
import { test } from 'node:test';
import { defaultControl } from './model.ts';
import { initialMachine, replay } from './engine.ts';
import {
  auditDialog, auditDocument, auditFocus, auditLive, auditNodes,
  auditProjectAgainstBrowser, auditScanMapping, auditSummary, nodeIndex,
  snapshotDifference,
} from './audit.ts';
const control=(id='go',changes={})=>({...defaultControl(id),name:{en:'Go',fr:'Aller'},description:{en:'Go forward',fr:'Continuer'},...changes});
const project=(controls=[control()])=>({id:'practice',title:{en:'Practice',fr:'Essai'},locale:'en',controls,focusOrder:controls.map(c=>c.id)});
const node=(id='go',changes={})=>({id,tag:'button',role:'button',name:'Go',description:'Go forward',ariaLabelledBy:[],ariaDescribedBy:[],ariaControls:[],focusable:true,tabIndex:0,visible:true,disabled:false,width:44,height:44,parent:'main',...changes});
const snapshot=(changes={})=>({lang:'en',title:'Practice',nodes:[node('main',{tag:'main',role:'main',focusable:false,name:'Main'}),node('go')],actualFocusOrder:['go'],live:[],mainCount:1,h1Count:1,...changes});
const live=(id='status',changes={})=>({id,sequence:0,locale:'en',text:'UNKNOWN',politeness:'polite',evidence:'UNKNOWN',role:'status',...changes});
const codes=(findings)=>findings.map(x=>x.code);
const has=(issues,code)=>assert.ok(codes(issues).includes(code),`${code} absent`);

test('nodeIndex maps IDs',()=>assert.equal(nodeIndex([node()]).get('go')?.length,1));
test('nodeIndex tracks duplicates',()=>assert.equal(nodeIndex([node(),node()]).get('go')?.length,2));
test('nodeIndex supports empty input',()=>assert.equal(nodeIndex([]).size,0));
test('clean document has no findings',()=>assert.deepEqual(auditDocument(snapshot()),[]));
test('clean nodes have no findings',()=>assert.deepEqual(auditNodes(snapshot().nodes),[]));
test('clean focus walk has no findings',()=>assert.deepEqual(auditFocus(snapshot()),[]));
test('empty live stream has no findings',()=>assert.deepEqual(auditLive([]),[]));
test('clean project mapping has no findings',()=>assert.deepEqual(auditProjectAgainstBrowser(project(),snapshot()),[]));
test('clean scanning mapping has no findings',()=>assert.deepEqual(auditScanMapping(project(),replay(project(),['NEXT']),snapshot()),[]));
for(const [label,changes,code] of [
  ['missing title',{title:''},'document.title'],
  ['missing main',{mainCount:0},'document.main'],
  ['two mains',{mainCount:2},'document.main'],
  ['missing h1',{h1Count:0},'document.heading'],
  ['two h1',{h1Count:2},'document.heading'],
  ['invalid language',{lang:'de'},'document.language'],
]){
  test(`document defect: ${label}`,()=>has(auditDocument(snapshot(changes)),code));
}
test('valid French language does not fail',()=>assert.deepEqual(auditDocument(snapshot({lang:'fr'})),[]));
test('title with spaces is nonempty by trim',()=>has(auditDocument(snapshot({title:'  '})),'document.title'));
test('document with one landmark passes',()=>assert.deepEqual(auditDocument(snapshot({mainCount:1})),[]));
for(const [label,changes,code] of [
  ['missing ID',{id:''},'node.missing-id'],
  ['missing name',{name:''},'node.unnamed'],
  ['name of only spaces',{name:'  '},'node.unnamed'],
  ['small width',{width:43},'node.small-target'],
  ['small height',{height:43},'node.small-target'],
  ['zero width',{width:0},'node.small-target'],
  ['zero height',{height:0},'node.small-target'],
  ['negative width',{width:-1},'node.small-target'],
  ['positive tab index',{tabIndex:4},'node.positive-tabindex'],
  ['hidden focusable',{visible:false},'node.hidden-focus'],
  ['disabled focusable',{disabled:true},'node.disabled-focus'],
  ['missing label ref',{ariaLabelledBy:['not-here']},'node.missing-reference'],
  ['missing help ref',{ariaDescribedBy:['not-here']},'node.missing-reference'],
  ['missing controls ref',{ariaControls:['not-here']},'node.missing-reference'],
  ['tab without panel',{role:'tab'},'node.tab-panel-reference'],
  ['switch div unreachable',{role:'switch',tag:'div',tabIndex:-1},'node.switch-unreachable'],
]){
  test(`node defect: ${label}`,()=>has(auditNodes([node('go',changes)]),code));
}
test('duplicate node IDs are found',()=>has(auditNodes([node('go'),node('go')]),'node.duplicate-id'));
test('duplicate label references are ambiguous',()=>has(auditNodes([node('go',{ariaLabelledBy:['shared']}),node('shared'),node('shared')]),'node.ambiguous-reference'));
test('reference to a unique ID passes',()=>assert.ok(!codes(auditNodes([node('go',{ariaLabelledBy:['label']}),node('label')])).includes('node.missing-reference')));
test('minimum 44 width passes',()=>assert.ok(!codes(auditNodes([node('go',{width:44})])).includes('node.small-target')));
test('minimum 44 height passes',()=>assert.ok(!codes(auditNodes([node('go',{height:44})])).includes('node.small-target')));
test('large touch target passes',()=>assert.ok(!codes(auditNodes([node('go',{width:120,height:80})])).includes('node.small-target')));
test('nonoperable paragraph has no name requirement',()=>assert.ok(!codes(auditNodes([node('note',{tag:'p',role:null,name:''})])).includes('node.unnamed')));
test('disabled control does not require touch size',()=>assert.ok(!codes(auditNodes([node('go',{disabled:true,focusable:false,width:10,height:10})])).includes('node.small-target')));
test('hidden control does not require touch size',()=>assert.ok(!codes(auditNodes([node('go',{visible:false,focusable:false,width:10,height:10})])).includes('node.small-target')));
test('native button requires name',()=>has(auditNodes([node('go',{role:null,name:''})]),'node.unnamed'));
test('role button requires name',()=>has(auditNodes([node('go',{tag:'div',role:'button',name:''})]),'node.unnamed'));
test('role link requires name',()=>has(auditNodes([node('go',{tag:'div',role:'link',name:''})]),'node.unnamed'));
test('role switch requires name',()=>has(auditNodes([node('go',{tag:'div',role:'switch',name:''})]),'node.unnamed'));
test('role checkbox requires name',()=>has(auditNodes([node('go',{tag:'div',role:'checkbox',name:''})]),'node.unnamed'));
test('role radio requires name',()=>has(auditNodes([node('go',{tag:'div',role:'radio',name:''})]),'node.unnamed'));
test('role tab requires name',()=>has(auditNodes([node('go',{tag:'div',role:'tab',name:''})]),'node.unnamed'));
test('role menuitem requires name',()=>has(auditNodes([node('go',{tag:'div',role:'menuitem',name:''})]),'node.unnamed'));
test('role textbox requires name',()=>has(auditNodes([node('go',{tag:'div',role:'textbox',name:''})]),'node.unnamed'));
for(const [label,changes,code] of [
  ['duplicate focus',{actualFocusOrder:['go','go']},'focus.repeat'],
  ['missing control',{actualFocusOrder:['missing']},'focus.missing-target'],
  ['disabled control',{nodes:[node('go',{disabled:true})]},'focus.inactive'],
  ['hidden control',{nodes:[node('go',{visible:false})]},'focus.inactive'],
  ['programmatic control',{nodes:[node('go',{tabIndex:-1})]},'focus.programmatic-only'],
  ['not focusable',{nodes:[node('go',{focusable:false})]},'focus.inactive'],
  ['unvisited control',{actualFocusOrder:[]},'focus.unvisited'],
]){
  test(`focus defect: ${label}`,()=>has(auditFocus(snapshot(changes)),code));
}
test('empty focus sequence on empty DOM passes',()=>assert.deepEqual(auditFocus(snapshot({nodes:[],actualFocusOrder:[]})),[]));
test('focus order with one item passes',()=>assert.deepEqual(auditFocus(snapshot({nodes:[node()],actualFocusOrder:['go']})),[]));
test('focus order with two items passes',()=>assert.deepEqual(auditFocus(snapshot({nodes:[node('go'),node('next')],actualFocusOrder:['go','next']})),[]));
test('focus order missing second item reports review',()=>has(auditFocus(snapshot({nodes:[node('go'),node('next')],actualFocusOrder:['go']})),'focus.unvisited'));
test('positive tabindex does not mark missing by itself',()=>assert.ok(!codes(auditFocus(snapshot({nodes:[node('go',{tabIndex:2})]}))).includes('focus.missing-target')));
for(const [label,changes,code] of [
  ['duplicate ID',{id:'status'},'live.duplicate-id'],
  ['empty text',{text:''},'live.empty'],
  ['spaces only',{text:'  '},'live.empty'],
  ['long message',{text:'x'.repeat(801)},'live.long'],
  ['invalid language',{locale:'de'},'live.language'],
  ['silent region',{politeness:'off'},'live.silent'],
  ['misprioritized alert',{role:'alert',politeness:'polite'},'live.alert-priority'],
  ['unknown promoted',{text:'READY now'},'live.unknown-promoted'],
]){
  test(`live audit: ${label}`,()=>{
    const list=label==='duplicate ID'?[live(),live('status',{sequence:1})]:[live('status',changes)];
    has(auditLive(list),code);
  });
}
test('valid live message passes',()=>assert.deepEqual(auditLive([live()]),[]));
test('assertive alert is allowed',()=>assert.deepEqual(auditLive([live('status',{role:'alert',politeness:'assertive'})]),[]));
test('known message is not interpreted as UNKNOWN',()=>assert.deepEqual(auditLive([live('status',{evidence:'DOCUMENTED',text:'READY'})]),[]));
test('duplicate consecutive message is flagged',()=>has(auditLive([live(),live('next',{sequence:1})]),'live.duplicate-message'));
test('different message avoids duplicate warning',()=>assert.ok(!codes(auditLive([live(),live('next',{sequence:1,text:'Later'})])).includes('live.duplicate-message')));
test('equal sequence is out of order',()=>has(auditLive([live(),live('next',{sequence:0,text:'Later'})]),'live.out-of-order'));
test('decreasing sequence is out of order',()=>has(auditLive([live('a',{sequence:3}),live('b',{sequence:2,text:'Later'})]),'live.out-of-order'));
test('increasing sequence is valid',()=>assert.ok(!codes(auditLive([live('a',{sequence:2}),live('b',{sequence:3,text:'Later'})])).includes('live.out-of-order')));
test('noninteger sequence is rejected',()=>has(auditLive([live('a',{sequence:0.5})]),'live.out-of-order'));
test('negative sequence is rejected',()=>has(auditLive([live('a',{sequence:-1})]),'live.out-of-order'));
test('different locales do not count as duplicate message',()=>assert.ok(!codes(auditLive([live(),live('b',{sequence:1,locale:'fr'})])).includes('live.duplicate-message')));
test('French live message accepted',()=>assert.ok(!codes(auditLive([live('status',{locale:'fr',text:'UNKNOWN'})])).includes('live.language')));
test('unknown report stays unknown',()=>assert.ok(!codes(auditLive([live('status',{evidence:'UNKNOWN',text:'UNKNOWN'})])).includes('live.unknown-promoted')));
for(const [label,changes,code] of [
  ['missing dialog',{nodes:[]},'dialog.missing'],
  ['wrong role',{nodes:[node('dialog',{role:'region',name:'Settings'})]},'dialog.invalid-role'],
  ['missing name',{nodes:[node('dialog',{role:'dialog',name:''})]},'dialog.unnamed'],
  ['background focus',{nodes:[node('dialog',{role:'dialog',name:'Settings'}),node('outside')],actualFocusOrder:['outside']},'dialog.background-focus'],
]){
  test(`dialog defect: ${label}`,()=>has(auditDialog(snapshot(changes),'dialog'),code));
}
test('focus on dialog itself is allowed',()=>assert.deepEqual(auditDialog(snapshot({nodes:[node('dialog',{role:'dialog',name:'Settings'})],actualFocusOrder:['dialog']}),'dialog'),[]));
test('focus on dialog child is allowed',()=>assert.deepEqual(auditDialog(snapshot({nodes:[node('dialog',{role:'dialog',name:'Settings'}),node('inside',{parent:'dialog'})],actualFocusOrder:['inside']}),'dialog'),[]));
test('focus on nested dialog child is allowed',()=>assert.deepEqual(auditDialog(snapshot({nodes:[node('dialog',{role:'dialog',name:'Settings'}),node('container',{parent:'dialog',role:null,tag:'div'}),node('inside',{parent:'container'})],actualFocusOrder:['inside']}),'dialog'),[]));
test('alertdialog is allowed',()=>assert.deepEqual(auditDialog(snapshot({nodes:[node('dialog',{role:'alertdialog',name:'Settings'})],actualFocusOrder:['dialog']}),'dialog'),[]));
test('dialog name is required',()=>has(auditDialog(snapshot({nodes:[node('dialog',{role:'dialog',name:''})]}),'dialog'),'dialog.unnamed'));
for(const [label,changes,code] of [
  ['missing mapped node',{nodes:[]},'mapping.missing-control'],
  ['different accessible name',{nodes:[node('go',{name:'Wrong'})]},'mapping.name-mismatch'],
  ['smaller width',{nodes:[node('go',{width:40})]},'mapping.smaller-target'],
  ['smaller height',{nodes:[node('go',{height:40})]},'mapping.smaller-target'],
  ['disabled changed',{nodes:[node('go',{disabled:true})]},'mapping.disabled-changed'],
  ['hidden changed',{nodes:[node('go',{visible:false})]},'mapping.visibility-changed'],
  ['unreached control',{actualFocusOrder:[]},'mapping.unreached'],
]){
  test(`mapping defect: ${label}`,()=>has(auditProjectAgainstBrowser(project(),snapshot(changes)),code));
}
test('French name comparison uses French value',()=>assert.ok(!codes(auditProjectAgainstBrowser(project(),snapshot({lang:'fr',nodes:[node('go',{name:'Aller'})]}))).includes('mapping.name-mismatch')));
test('scan missing focused node is detected',()=>has(auditScanMapping(project(),{...initialMachine(),focus:'missing'},snapshot()),'scan.target-not-in-dom'));
test('scan missing selected node is detected',()=>has(auditScanMapping(project(),{...initialMachine(),selected:'missing'},snapshot()),'scan.selection-not-operable'));
test('scan disabled selection is detected',()=>has(auditScanMapping(project(),{...initialMachine(),selected:'go'},snapshot({nodes:[node('go',{disabled:true})]})),'scan.selection-not-operable'));
test('scan hidden selection is detected',()=>has(auditScanMapping(project(),{...initialMachine(),selected:'go'},snapshot({nodes:[node('go',{visible:false})]})),'scan.selection-not-operable'));
test('scan unknown group is detected',()=>has(auditScanMapping(project(),{...initialMachine('GROUPED'),group:'missing'},snapshot()),'scan.unknown-group'));
test('scan mapped selection passes',()=>assert.deepEqual(auditScanMapping(project(),{...initialMachine(),selected:'go'},snapshot()),[]));
test('unchanged snapshots produce no difference',()=>assert.deepEqual(snapshotDifference(snapshot(),snapshot()),[]));
test('removed DOM node is detected',()=>has(snapshotDifference(snapshot(),snapshot({nodes:[]})),'diff.removed'));
test('added DOM node is detected',()=>has(snapshotDifference(snapshot(),snapshot({nodes:[...snapshot().nodes,node('new')]})),'diff.added'));
test('renamed DOM node is detected',()=>has(snapshotDifference(snapshot(),snapshot({nodes:[node('main',{tag:'main',role:'main',focusable:false,name:'Main'}),node('go',{name:'Different'})]})),'diff.name'));
test('role change is detected',()=>has(snapshotDifference(snapshot(),snapshot({nodes:[node('main',{tag:'main',role:'main',focusable:false,name:'Main'}),node('go',{role:'switch'})]})),'diff.role'));
test('disabled state change is detected',()=>has(snapshotDifference(snapshot(),snapshot({nodes:[node('main',{tag:'main',role:'main',focusable:false,name:'Main'}),node('go',{disabled:true})]})),'diff.disabled'));
test('visibility change is detected',()=>has(snapshotDifference(snapshot(),snapshot({nodes:[node('main',{tag:'main',role:'main',focusable:false,name:'Main'}),node('go',{visible:false})]})),'diff.visible'));
test('tabindex change is detected',()=>has(snapshotDifference(snapshot(),snapshot({nodes:[node('main',{tag:'main',role:'main',focusable:false,name:'Main'}),node('go',{tabIndex:-1})]})),'diff.tabindex'));
test('target shrink is detected',()=>has(snapshotDifference(snapshot(),snapshot({nodes:[node('main',{tag:'main',role:'main',focusable:false,name:'Main'}),node('go',{width:30})]})),'diff.target-shrink'));
test('language change is detected',()=>has(snapshotDifference(snapshot(),snapshot({lang:'fr'})),'diff.language'));
test('audit summary counts errors',()=>assert.equal(auditSummary([{code:'x',path:'x',severity:'error'}]).errors,1));
test('audit summary counts reviews',()=>assert.equal(auditSummary([{code:'x',path:'x',severity:'review'}]).reviews,1));
test('audit summary sorts unique codes',()=>assert.deepEqual(auditSummary([{code:'b',path:'a',severity:'error'},{code:'a',path:'b',severity:'review'}]).codes,['a','b']));
test('audit summary deduplicates codes',()=>assert.deepEqual(auditSummary([{code:'a',path:'a',severity:'error'},{code:'a',path:'b',severity:'review'}]).codes,['a']));
