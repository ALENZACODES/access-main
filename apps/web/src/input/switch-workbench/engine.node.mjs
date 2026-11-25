import assert from 'node:assert/strict';
import { test } from 'node:test';
import { defaultControl } from './model.ts';
import {
  COMMANDS, MODES, describeFocus, eligibleIds, groups, initialMachine,
  machineAudit, replay, replaySafely, stepMachine, summary, verifyPattern,
  withMode, withWrap,
} from './engine.ts';
const control=(id,group=null,changes={})=>({...defaultControl(id),group,...changes});
const project=(items=[control('first'),control('second'),control('third')])=>({id:'test',title:{en:'Test',fr:'Essai'},locale:'en',controls:items,focusOrder:items.map(c=>c.id)});
const codes=(items)=>items.map(x=>x.code);
const has=(items,code)=>assert.ok(codes(items).includes(code),`${code} missing`);
const go=(machine,command,items=project())=>stepMachine(machine,command,items).machine;

test('commands include NEXT',()=>assert.ok(COMMANDS.includes('NEXT')));
test('commands include PREVIOUS',()=>assert.ok(COMMANDS.includes('PREVIOUS')));
test('commands include SELECT',()=>assert.ok(COMMANDS.includes('SELECT')));
test('commands include BACK',()=>assert.ok(COMMANDS.includes('BACK')));
test('commands include CANCEL',()=>assert.ok(COMMANDS.includes('CANCEL')));
test('commands include RESET',()=>assert.ok(COMMANDS.includes('RESET')));
test('commands include HOME',()=>assert.ok(COMMANDS.includes('HOME')));
test('commands include END',()=>assert.ok(COMMANDS.includes('END')));
test('commands include GROUP_NEXT',()=>assert.ok(COMMANDS.includes('GROUP_NEXT')));
test('commands include GROUP_PREVIOUS',()=>assert.ok(COMMANDS.includes('GROUP_PREVIOUS')));
test('mode includes LINEAR',()=>assert.ok(MODES.includes('LINEAR')));
test('mode includes GROUPED',()=>assert.ok(MODES.includes('GROUPED')));
test('mode includes DIRECT',()=>assert.ok(MODES.includes('DIRECT')));
test('default mode is linear',()=>assert.equal(initialMachine().mode,'LINEAR'));
test('default phase is idle',()=>assert.equal(initialMachine().phase,'IDLE'));
test('default focus is null',()=>assert.equal(initialMachine().focus,null));
test('default selected is null',()=>assert.equal(initialMachine().selected,null));
test('default group is null',()=>assert.equal(initialMachine().group,null));
test('default wrap is enabled',()=>assert.equal(initialMachine().wrap,true));
test('default history is empty',()=>assert.deepEqual(initialMachine().history,[]));
test('default events are empty',()=>assert.deepEqual(initialMachine().events,[]));
test('group mode initializes',()=>assert.equal(initialMachine('GROUPED').mode,'GROUPED'));
test('direct mode initializes',()=>assert.equal(initialMachine('DIRECT').mode,'DIRECT'));
test('no-wrap mode initializes',()=>assert.equal(initialMachine('LINEAR',false).wrap,false));
test('eligible order preserves first',()=>assert.equal(eligibleIds(project())[0],'first'));
test('eligible order preserves last',()=>assert.equal(eligibleIds(project()).at(-1),'third'));
test('hidden control excluded',()=>assert.deepEqual(eligibleIds(project([control('first',null,{visible:false}),control('second')])),['second']));
test('disabled control excluded',()=>assert.deepEqual(eligibleIds(project([control('first',null,{disabled:true}),control('second')])),['second']));
test('negative tab index excluded',()=>assert.deepEqual(eligibleIds(project([control('first',null,{tabIndex:-1}),control('second')])),['second']));
test('empty project has no controls',()=>assert.deepEqual(eligibleIds(project([])),[]));
test('group order is stable',()=>assert.deepEqual(groups(project([control('first','a'),control('second','b')])).map(x=>x.id),['a','b']));
test('group without label becomes ungrouped',()=>assert.equal(groups(project())[0].id,'ungrouped'));
test('same group contains both controls',()=>assert.deepEqual(groups(project([control('first','one'),control('second','one')]))[0].controls,['first','second']));
test('hidden group item excluded',()=>assert.deepEqual(groups(project([control('first','one',{visible:false}),control('second','one')]))[0].controls,['second']));
for(const [command,expected] of [
  ['NEXT','first'],
  ['PREVIOUS','third'],
  ['HOME','first'],
  ['END','third'],
  ['GROUP_NEXT','first'],
  ['GROUP_PREVIOUS','first'],
]){
  test(`initial navigation ${command}`,()=>assert.equal(go(initialMachine(),command).focus,expected));
}
test('first NEXT enters focused phase',()=>assert.equal(go(initialMachine(),'NEXT').phase,'FOCUSED'));
test('first NEXT has accepted event',()=>assert.equal(go(initialMachine(),'NEXT').events[0].accepted,true));
test('first NEXT records command',()=>assert.equal(go(initialMachine(),'NEXT').events[0].command,'NEXT'));
test('first NEXT records null from',()=>assert.equal(go(initialMachine(),'NEXT').events[0].from,null));
test('first NEXT records first to',()=>assert.equal(go(initialMachine(),'NEXT').events[0].to,'first'));
test('first NEXT does not select',()=>assert.equal(go(initialMachine(),'NEXT').selected,null));
test('second NEXT advances',()=>assert.equal(replay(project(),['NEXT','NEXT']).focus,'second'));
test('third NEXT advances',()=>assert.equal(replay(project(),['NEXT','NEXT','NEXT']).focus,'third'));
test('fourth NEXT wraps',()=>assert.equal(replay(project(),['NEXT','NEXT','NEXT','NEXT']).focus,'first'));
test('PREVIOUS from first wraps to last',()=>assert.equal(replay(project(),['NEXT','PREVIOUS']).focus,'third'));
test('PREVIOUS from last goes to second',()=>assert.equal(replay(project(),['END','PREVIOUS']).focus,'second'));
test('HOME after END goes to first',()=>assert.equal(replay(project(),['END','HOME']).focus,'first'));
test('END after HOME goes to last',()=>assert.equal(replay(project(),['HOME','END']).focus,'third'));
test('NEXT without wrapping stays on last',()=>assert.equal(go(go(go(initialMachine('LINEAR',false),'END'),'NEXT'),'NEXT').focus,'third'));
test('PREVIOUS without wrapping stays on first',()=>assert.equal(go(go(initialMachine('LINEAR',false),'HOME'),'PREVIOUS').focus,'first'));
test('initial PREVIOUS without wrapping targets last',()=>assert.equal(go(initialMachine('LINEAR',false),'PREVIOUS').focus,'third'));
test('SELECT after NEXT chooses first',()=>assert.equal(replay(project(),['NEXT','SELECT']).selected,'first'));
test('SELECT after END chooses third',()=>assert.equal(replay(project(),['END','SELECT']).selected,'third'));
test('SELECT phase is selected',()=>assert.equal(replay(project(),['NEXT','SELECT']).phase,'SELECTED'));
test('SELECT without focus is rejected',()=>has(stepMachine(initialMachine(),'SELECT',project()).issues,'scan.nothing-focused'));
test('SELECT without focus leaves phase idle',()=>assert.equal(go(initialMachine(),'SELECT').phase,'IDLE'));
test('SELECT without focus increments rejected events',()=>assert.equal(summary(go(initialMachine(),'SELECT')).rejected,1));
test('NEXT clears selection',()=>assert.equal(replay(project(),['NEXT','SELECT','NEXT']).selected,null));
test('PREVIOUS clears selection',()=>assert.equal(replay(project(),['NEXT','SELECT','PREVIOUS']).selected,null));
test('HOME clears selection',()=>assert.equal(replay(project(),['NEXT','SELECT','HOME']).selected,null));
test('END clears selection',()=>assert.equal(replay(project(),['NEXT','SELECT','END']).selected,null));
test('CANCEL clears selection',()=>assert.equal(replay(project(),['NEXT','SELECT','CANCEL']).selected,null));
test('CANCEL enters cancelled phase',()=>assert.equal(replay(project(),['NEXT','CANCEL']).phase,'CANCELLED'));
test('CANCEL retains focus',()=>assert.equal(replay(project(),['NEXT','CANCEL']).focus,'first'));
test('RESET clears focus',()=>assert.equal(replay(project(),['NEXT','RESET']).focus,null));
test('RESET clears selection',()=>assert.equal(replay(project(),['NEXT','SELECT','RESET']).selected,null));
test('RESET clears history',()=>assert.deepEqual(replay(project(),['NEXT','NEXT','RESET']).history,[]));
test('RESET enters idle phase',()=>assert.equal(replay(project(),['NEXT','RESET']).phase,'IDLE'));
test('RESET keeps audit event',()=>assert.equal(replay(project(),['NEXT','RESET']).events.length,2));
test('BACK without history is rejected',()=>has(stepMachine(initialMachine(),'BACK',project()).issues,'scan.no-history'));
test('BACK after two steps returns first',()=>assert.equal(replay(project(),['NEXT','NEXT','BACK']).focus,'first'));
test('BACK after END returns first',()=>assert.equal(replay(project(),['HOME','END','BACK']).focus,'first'));
test('BACK consumes history',()=>assert.deepEqual(replay(project(),['NEXT','NEXT','BACK']).history,[]));
test('BACK can repeat backwards',()=>assert.equal(replay(project(),['NEXT','NEXT','NEXT','BACK','BACK']).focus,'first'));
test('history grows with focus changes',()=>assert.equal(replay(project(),['NEXT','NEXT','NEXT']).history.length,2));
test('history excludes initial null',()=>assert.deepEqual(replay(project(),['NEXT']).history,[]));
test('history is bounded after many moves',()=>assert.ok(replay(project(),Array(130).fill('NEXT')).history.length<=100));
test('events are bounded after many moves',()=>assert.equal(replay(project(),Array(300).fill('NEXT')).events.length,250));
test('events count two commands',()=>assert.equal(summary(replay(project(),['NEXT','SELECT'])).total,2));
test('events count selected action',()=>assert.equal(summary(replay(project(),['NEXT','SELECT'])).selected,1));
test('events count accepted actions',()=>assert.equal(summary(replay(project(),['NEXT','SELECT'])).accepted,2));
test('invalid command reports issue',()=>has(stepMachine(initialMachine(),'SWIPE',project()).issues,'scan.invalid-command'));
test('invalid command does not mutate focus',()=>assert.equal(go(initialMachine(),'SWIPE').focus,null));
test('invalid command appears in event log',()=>assert.equal(summary(go(initialMachine(),'SWIPE')).rejected,1));
test('empty project reports no controls',()=>has(stepMachine(initialMachine(),'NEXT',project([])).issues,'scan.no-controls'));
test('empty project has unknown phase',()=>assert.equal(go(initialMachine(),'NEXT',project([])).phase,'UNKNOWN'));
test('empty project keeps no selection',()=>assert.equal(go(initialMachine(),'SELECT',project([])).selected,null));
test('empty project reset remains idle',()=>assert.equal(go(initialMachine(),'RESET',project([])).phase,'IDLE'));
test('groups can step through distinct group names',()=>assert.equal(replay(project([control('first','a'),control('second','b')]),['GROUP_NEXT','GROUP_NEXT']).group,'b'));
test('GROUP_PREVIOUS from first wraps last group',()=>assert.equal(replay(project([control('first','a'),control('second','b')]),['GROUP_NEXT','GROUP_PREVIOUS']).group,'b'));
test('GROUP_NEXT selects first control in group',()=>assert.equal(replay(project([control('first','a'),control('second','a'),control('third','b')]),['GROUP_NEXT']).focus,'first'));
test('GROUP_NEXT selects next group first control',()=>assert.equal(replay(project([control('first','a'),control('second','a'),control('third','b')]),['GROUP_NEXT','GROUP_NEXT']).focus,'third'));
test('group transitions clear selection',()=>assert.equal(replay(project(),['NEXT','SELECT','GROUP_NEXT']).selected,null));
test('mode change resets machine focus',()=>assert.equal(withMode(go(initialMachine(),'NEXT'),'DIRECT').focus,null));
test('mode change retains wrap property',()=>assert.equal(withMode(initialMachine('LINEAR',false),'GROUPED').wrap,false));
test('mode change rejects invalid mode',()=>assert.equal(withMode(initialMachine(),'UNKNOWN').mode,'LINEAR'));
test('wrap toggle is explicit',()=>assert.equal(withWrap(initialMachine(),false).wrap,false));
test('wrap toggle does not discard focus',()=>assert.equal(withWrap(go(initialMachine(),'NEXT'),false).focus,'first'));
test('describeFocus returns UNKNOWN without focus',()=>assert.equal(describeFocus(initialMachine(),project(),'en'),'UNKNOWN'));
test('describeFocus returns English name',()=>assert.equal(describeFocus(go(initialMachine(),'NEXT'),project(),'en'),'Continue'));
test('describeFocus returns French name',()=>assert.equal(describeFocus(go(initialMachine(),'NEXT'),project(),'fr'),'Continuer'));
test('describeFocus returns UNKNOWN for missing ID',()=>assert.equal(describeFocus({...initialMachine(),focus:'missing'},project(),'en'),'UNKNOWN'));
test('invalid machine mode diagnosed',()=>has(machineAudit({...initialMachine(),mode:'INVALID'},project()),'machine.mode'));
test('stale focus diagnosed',()=>has(machineAudit({...initialMachine(),focus:'missing'},project()),'machine.stale-focus'));
test('stale selection diagnosed',()=>has(machineAudit({...initialMachine(),selected:'missing'},project()),'machine.stale-selection'));
test('invalid history diagnosed',()=>has(machineAudit({...initialMachine(),history:['missing']},project()),'machine.invalid-history'));
test('invalid event command diagnosed',()=>has(machineAudit({...initialMachine(),events:[{sequence:1,command:'BOGUS',from:null,to:null,accepted:true,reason:null}]},project()),'machine.invalid-event'));
test('accepted event with reason diagnosed',()=>has(machineAudit({...initialMachine(),events:[{sequence:1,command:'NEXT',from:null,to:'first',accepted:true,reason:'bad'}]},project()),'machine.event-conflict'));
test('rejected event without reason diagnosed',()=>has(machineAudit({...initialMachine(),events:[{sequence:1,command:'NEXT',from:null,to:null,accepted:false,reason:null}]},project()),'machine.missing-reason'));
test('valid machine has no findings',()=>assert.deepEqual(machineAudit(replay(project(),['NEXT','SELECT']),project()),[]));
test('pattern with expected focus passes',()=>assert.deepEqual(verifyPattern(project(),{sequence:['NEXT'],expectedFocus:'first',expectedSelected:null}),[]));
test('pattern reports wrong focus',()=>has(verifyPattern(project(),{sequence:['NEXT'],expectedFocus:'second',expectedSelected:null}),'pattern.focus-mismatch'));
test('pattern reports wrong selection',()=>has(verifyPattern(project(),{sequence:['NEXT','SELECT'],expectedFocus:'first',expectedSelected:null}),'pattern.selection-mismatch'));
test('replaySafely rejects unsupported input',()=>has(replaySafely(project(),['SWIPE']).issues,'scan.unsupported-command'));
test('replaySafely retains valid steps',()=>assert.equal(replaySafely(project(),['NEXT','SWIPE','NEXT']).state.focus,'second'));
test('replaySafely does not invent selection',()=>assert.equal(replaySafely(project(),['SWIPE']).state.selected,null));
for(const [sequence,expected] of [
  [['NEXT'],'first'],
  [['NEXT','NEXT'],'second'],
  [['NEXT','NEXT','NEXT'],'third'],
  [['HOME','END'],'third'],
  [['END','HOME'],'first'],
  [['PREVIOUS'],'third'],
  [['NEXT','PREVIOUS'],'third'],
  [['NEXT','NEXT','PREVIOUS'],'first'],
  [['END','PREVIOUS'],'second'],
  [['NEXT','NEXT','HOME'],'first'],
  [['NEXT','END','BACK'],'first'],
  [['NEXT','SELECT'],'first'],
  [['NEXT','CANCEL'],'first'],
  [['NEXT','RESET'],null],
]){
  test(`replay focus trajectory ${sequence.join('-')}`,()=>assert.equal(replay(project(),sequence).focus,expected));
}
