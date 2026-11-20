import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  DEFAULT_SCAN, NEXT, availableTargets, groupAdvance, groupsOf, initialScan,
  inspectAnnouncements, inspectKeyboard, inspectTargets, matchSelection,
  moveIndex, replayScan, reverseTraversal, scanPolicy, scanSummary, stepScan,
  targetsForJourney,
} from './scanner.ts';

const target = (id, changes = {}) => ({ id, name: `Control ${id}`, group: 'path', kind: 'path', disabled: false, hidden: false, ...changes });
const targets = () => [target('a'), target('b'), target('c')];
const names = () => ({ en: 'Entrance', fr: 'Entrée' });
const step = (id, index, changes = {}) => ({ id, sequence: index, kind: 'entrance', access: 'supported',
  label: names(), detail: names(), source: null, offline: { state: 'unknown' }, needsReview: false, ...changes });
const journey = () => ({ id: 'journey', name: names(), createdOn: '2026-11-19', steps: [step('second', 1), step('first', 0)] });
const codes = list => list.map(item => item.code);
const has = (list, code) => assert.ok(codes(list).includes(code), `Missing ${code}`);

for (const command of ['NEXT','PREVIOUS','SELECT','BACK','CANCEL','RESET']) {
  test(`scan actions declare ${command}`, () => assert.ok(NEXT.includes(command)));
}
test('default scanner uses linear mode', () => assert.equal(DEFAULT_SCAN.mode, 'linear'));
test('default scanner wraps', () => assert.equal(DEFAULT_SCAN.wrap, true));
test('default scanner has a finite action cap', () => assert.equal(DEFAULT_SCAN.maxActions, 100));
test('default scanner policy is immutable', () => assert.equal(Object.isFrozen(DEFAULT_SCAN), true));
test('custom grouped mode is accepted', () => assert.equal(scanPolicy({ mode: 'grouped' }).mode, 'grouped'));
test('custom direct mode is accepted', () => assert.equal(scanPolicy({ mode: 'direct' }).mode, 'direct'));
test('custom non-wrapping mode is accepted', () => assert.equal(scanPolicy({ wrap: false }).wrap, false));
test('custom max action count is accepted', () => assert.equal(scanPolicy({ maxActions: 25 }).maxActions, 25));
test('scanner options are frozen', () => assert.equal(Object.isFrozen(scanPolicy()), true));
for (const [label, options] of [
  ['null', null], ['array', []], ['invalid mode', { mode: 'automatic' }],
  ['invalid wrap', { wrap: 'yes' }], ['zero action cap', { maxActions: 0 }],
  ['negative action cap', { maxActions: -1 }], ['fractional action cap', { maxActions: 5.5 }],
  ['oversized action cap', { maxActions: 1001 }],
]) {
  test(`scanner rejects ${label}`, () => assert.throws(() => scanPolicy(options), TypeError));
}

test('journey targets follow sequence instead of input order', () => {
  assert.deepEqual(targetsForJourney(journey(), 'en').map(t => t.id), ['first','second']);
});
test('target labels respect English selection', () => assert.equal(targetsForJourney(journey(), 'en')[0].name, 'Entrance'));
test('target labels respect French selection', () => assert.equal(targetsForJourney(journey(), 'fr')[0].name, 'Entrée'));
test('unsupported steps become disabled targets', () => {
  const j = journey();
  j.steps[0].access = 'unsupported';
  assert.equal(targetsForJourney(j, 'en')[1].disabled, true);
});
test('unknown steps remain targets for manual review', () => {
  const j = journey();
  j.steps[0].access = 'unknown';
  assert.equal(targetsForJourney(j, 'en')[1].disabled, false);
});
test('empty journey yields no scan targets', () => assert.deepEqual(targetsForJourney({ steps: [] }, 'en'), []));
test('non-array journey yields no scan targets', () => assert.deepEqual(targetsForJourney({ steps: {} }, 'en'), []));
test('available target list contains all clean targets', () => assert.equal(availableTargets(targets()).length, 3));
test('disabled targets are removed from scan sequence', () => assert.deepEqual(availableTargets([target('a',{disabled:true}),target('b')]).map(t=>t.id), ['b']));
test('hidden targets are removed from scan sequence', () => assert.deepEqual(availableTargets([target('a',{hidden:true}),target('b')]).map(t=>t.id), ['b']));
test('invalid target identifier is excluded', () => assert.equal(availableTargets([target('bad id')]).length, 0));
test('unlabelled target is excluded', () => assert.equal(availableTargets([target('a',{name:''})]).length, 0));
test('available target order stays stable', () => assert.deepEqual(availableTargets(targets()).map(t=>t.id), ['a','b','c']));

for (const [label, index, length, offset, wrap, expected] of [
  ['first forward', -1, 3, 1, true, 0],
  ['first backwards', -1, 3, -1, true, 2],
  ['middle forward', 1, 3, 1, true, 2],
  ['middle reverse', 1, 3, -1, true, 0],
  ['wrap forward', 2, 3, 1, true, 0],
  ['wrap backwards', 0, 3, -1, true, 2],
  ['clamp forward', 2, 3, 1, false, 2],
  ['clamp backwards', 0, 3, -1, false, 0],
  ['empty sequence', 0, 0, 1, true, -1],
  ['single control forwards', 0, 1, 1, true, 0],
  ['single control backwards', 0, 1, -1, true, 0],
]) {
  test(`index transition: ${label}`, () => assert.equal(moveIndex(index,length,offset,wrap), expected));
}

test('initial state has no focus', () => assert.equal(initialScan().focus, null));
test('initial state is not scanning', () => assert.equal(initialScan().scanning, false));
test('initial state has no history', () => assert.deepEqual(initialScan().history, []));
test('NEXT begins scanning at first target', () => assert.equal(stepScan(initialScan(),'NEXT',targets()).controls.focus, 'a'));
test('PREVIOUS begins scanning at last target', () => assert.equal(stepScan(initialScan(),'PREVIOUS',targets()).controls.focus, 'c'));
test('NEXT after NEXT advances to second target', () => {
  const one = stepScan(initialScan(),'NEXT',targets());
  assert.equal(stepScan(one.controls,'NEXT',targets()).controls.focus, 'b');
});
test('NEXT at last target wraps to first', () => {
  const state = replayScan(['NEXT','NEXT','NEXT','NEXT'],targets());
  assert.equal(state.controls.focus, 'a');
});
test('PREVIOUS from first wraps to last', () => {
  const first = stepScan(initialScan(),'NEXT',targets());
  assert.equal(stepScan(first.controls,'PREVIOUS',targets()).controls.focus, 'c');
});
test('SELECT chooses current scan target', () => {
  const first = stepScan(initialScan(),'NEXT',targets());
  assert.equal(stepScan(first.controls,'SELECT',targets()).selected, 'a');
});
test('SELECT before scan yields diagnostic', () => has(stepScan(initialScan(),'SELECT',targets()).issues,'scan.no-selection'));
test('BACK moves to preceding target', () => {
  const next = replayScan(['NEXT','NEXT'],targets());
  assert.equal(stepScan(next.controls,'BACK',targets()).controls.focus,'a');
});
test('CANCEL discards active focus', () => {
  const next = stepScan(initialScan(),'NEXT',targets());
  assert.equal(stepScan(next.controls,'CANCEL',targets()).controls.focus,null);
});
test('CANCEL ends active scanning', () => {
  const next = stepScan(initialScan(),'NEXT',targets());
  assert.equal(stepScan(next.controls,'CANCEL',targets()).controls.scanning,false);
});
test('RESET clears action history', () => {
  const next = replayScan(['NEXT','NEXT'],targets());
  assert.deepEqual(stepScan(next.controls,'RESET',targets()).controls.history,[]);
});
test('RESET clears selection', () => {
  const next = replayScan(['NEXT','SELECT'],targets());
  assert.equal(stepScan(next.controls,'RESET',targets()).selected,null);
});
test('empty targets produce explicit issue', () => has(stepScan(initialScan(),'NEXT',[]).issues,'scan.empty'));
test('empty targets cannot choose a selection', () => assert.equal(stepScan(initialScan(),'NEXT',[]).selected,null));
test('scan preserves prior state when action limit reached', () => {
  const state = stepScan(initialScan(),'NEXT',targets()).controls;
  assert.equal(stepScan(state,'NEXT',targets(),scanPolicy({maxActions:1})).controls,state);
});
test('action limit produces review finding', () => {
  const state = stepScan(initialScan(),'NEXT',targets()).controls;
  has(stepScan(state,'NEXT',targets(),scanPolicy({maxActions:1})).issues,'scan.limit');
});
test('RESET allowed after action limit', () => {
  const state = stepScan(initialScan(),'NEXT',targets()).controls;
  assert.deepEqual(stepScan(state,'RESET',targets(),scanPolicy({maxActions:1})).controls.history,[]);
});
test('unsupported command rejected', () => assert.throws(()=>stepScan(initialScan(),'PRESS',targets()),TypeError));
test('scan transition preserves input state', () => {
  const before = initialScan();
  const serialized = JSON.stringify(before);
  stepScan(before,'NEXT',targets());
  assert.equal(JSON.stringify(before),serialized);
});
test('scan transition preserves input target array', () => {
  const list = targets(); const serialized = JSON.stringify(list);
  stepScan(initialScan(),'NEXT',list);
  assert.equal(JSON.stringify(list),serialized);
});
test('replay maintains action history', () => {
  const actions = ['NEXT','NEXT','SELECT'];
  assert.deepEqual(replayScan(actions,targets()).controls.history,actions);
});
test('replay returns final selection', () => assert.equal(replayScan(['NEXT','NEXT','SELECT'],targets()).selected,'b'));
test('replay rejects excessive command list', () => assert.throws(()=>replayScan(Array(102).fill('NEXT'),targets()),TypeError));
test('replay rejects non-array commands', () => assert.throws(()=>replayScan(null,targets()),TypeError));
test('replay accumulates issues', () => has(replayScan(['NEXT'],[]).issues,'scan.empty'));

test('groups retain first-seen order', () => {
  const list=[target('a',{group:'entry'}),target('b',{group:'exit'}),target('c',{group:'entry'})];
  assert.deepEqual([...groupsOf(list).keys()],['entry','exit']);
});
test('groups exclude disabled controls', () => assert.equal(groupsOf([target('a',{group:'entry',disabled:true})]).size,0));
test('groups contain target members', () => assert.equal(groupsOf(targets()).get('path').length,3));
test('group advance starts at first group', () => assert.equal(groupAdvance(null,[target('a',{group:'entry'})],1),'entry'));
test('group reverse starts at last group', () => assert.equal(groupAdvance(null,[target('a',{group:'entry'}),target('b',{group:'exit'})],-1),'exit'));
test('group advance wraps through groups', () => assert.equal(groupAdvance('exit',[target('a',{group:'entry'}),target('b',{group:'exit'})],1),'entry'));
test('group advance clamped at last group', () => assert.equal(groupAdvance('exit',[target('a',{group:'entry'}),target('b',{group:'exit'})],1,false),'exit'));
test('empty groups yield no selection', () => assert.equal(groupAdvance(null,[],1),null));

test('valid scan targets yield no issues', () => assert.deepEqual(inspectTargets(targets()),[]));
test('duplicate scan IDs are found', () => has(inspectTargets([target('a'),target('a')]),'target.duplicate'));
test('missing target name is found', () => has(inspectTargets([target('a',{name:''})]),'target.name'));
test('invalid group label is found', () => has(inspectTargets([target('a',{group:''})]),'target.group'));
test('disabled flag must be boolean', () => has(inspectTargets([target('a',{disabled:'false'})]),'target.disabled'));
test('hidden flag must be boolean', () => has(inspectTargets([target('a',{hidden:'false'})]),'target.hidden'));
test('malformed target ID yields error', () => has(inspectTargets([target('a b')]),'target.id'));

const keyboard = (changes={}) => ({ target:'a',key:'Tab',before:null,after:'a',activated:false,visible:true,width:44,height:44,contained:true,...changes });
test('valid keyboard observation passes',()=>assert.deepEqual(inspectKeyboard([keyboard()],targets()),[]));
test('keyboard target must be present',()=>has(inspectKeyboard([keyboard({target:'missing'})],targets()),'keyboard.missing-target'));
test('keyboard before focus must be valid',()=>has(inspectKeyboard([keyboard({before:'missing'})],targets()),'keyboard.invalid-before'));
test('keyboard after focus must be valid',()=>has(inspectKeyboard([keyboard({after:'missing'})],targets()),'keyboard.invalid-after'));
test('hidden active focus is rejected',()=>has(inspectKeyboard([keyboard({visible:false})],targets()),'keyboard.not-visible'));
test('focus outside active container is rejected',()=>has(inspectKeyboard([keyboard({contained:false})],targets()),'keyboard.outside-container'));
test('43px width is too small',()=>has(inspectKeyboard([keyboard({width:43})],targets()),'keyboard.target-size'));
test('43px height is too small',()=>has(inspectKeyboard([keyboard({height:43})],targets()),'keyboard.target-size'));
test('exact 44px target passes',()=>assert.deepEqual(inspectKeyboard([keyboard({width:44,height:44})],targets()),[]));
test('nonfinite width is rejected',()=>has(inspectKeyboard([keyboard({width:Infinity})],targets()),'keyboard.target-size'));
test('nonfinite height is rejected',()=>has(inspectKeyboard([keyboard({height:NaN})],targets()),'keyboard.target-size'));
test('unknown input key is rejected',()=>has(inspectKeyboard([keyboard({key:'Voice'})],targets()),'keyboard.key'));
test('Enter without activation is rejected',()=>has(inspectKeyboard([keyboard({key:'Enter',activated:false})],targets()),'keyboard.no-activation'));
test('Space without activation is rejected',()=>has(inspectKeyboard([keyboard({key:'Space',activated:false})],targets()),'keyboard.no-activation'));
test('Enter with activation passes',()=>assert.deepEqual(inspectKeyboard([keyboard({key:'Enter',activated:true})],targets()),[]));
test('Space with activation passes',()=>assert.deepEqual(inspectKeyboard([keyboard({key:'Space',activated:true})],targets()),[]));
test('Escape is a supported keyboard event',()=>assert.deepEqual(inspectKeyboard([keyboard({key:'Escape'})],targets()),[]));
test('Shift+Tab is a supported keyboard event',()=>assert.deepEqual(inspectKeyboard([keyboard({key:'Shift+Tab'})],targets()),[]));
test('arrow left is supported keyboard event',()=>assert.deepEqual(inspectKeyboard([keyboard({key:'ArrowLeft'})],targets()),[]));
test('arrow right is supported keyboard event',()=>assert.deepEqual(inspectKeyboard([keyboard({key:'ArrowRight'})],targets()),[]));

test('correct reverse focus sequence passes',()=>assert.deepEqual(reverseTraversal(['c','b','a'],targets()),[]));
test('reverse focus count must match active targets',()=>has(reverseTraversal(['a'],targets()),'focus.count'));
test('wrong reverse order is rejected',()=>has(reverseTraversal(['a','b','c'],targets()),'focus.reverse-order'));
test('reverse focus skips disabled targets',()=>assert.deepEqual(reverseTraversal(['c','a'],[target('a'),target('b',{disabled:true}),target('c')]),[]));
test('reverse focus skips hidden targets',()=>assert.deepEqual(reverseTraversal(['c','a'],[target('a'),target('b',{hidden:true}),target('c')]),[]));

const announcement=(changes={})=>({id:'notice-one',locale:'en',text:'The result is UNKNOWN',status:'UNKNOWN',politeness:'polite',sequence:0,...changes});
test('valid live announcement passes',()=>assert.deepEqual(inspectAnnouncements([announcement()],'en'),[]));
test('duplicate announcement IDs are rejected',()=>has(inspectAnnouncements([announcement(),announcement({sequence:1})],'en'),'announcement.duplicate'));
test('wrong language announcement is rejected',()=>has(inspectAnnouncements([announcement({locale:'fr'})],'en'),'announcement.locale'));
test('missing message text is rejected',()=>has(inspectAnnouncements([announcement({text:''})],'en'),'announcement.text'));
test('invalid announcement ID is rejected',()=>has(inspectAnnouncements([announcement({id:'not allowed'})],'en'),'announcement.id'));
test('invalid announcement status is rejected',()=>has(inspectAnnouncements([announcement({status:'maybe'})],'en'),'announcement.status'));
test('invalid politeness is rejected',()=>has(inspectAnnouncements([announcement({politeness:'silent'})],'en'),'announcement.politeness'));
test('duplicate sequence is rejected',()=>has(inspectAnnouncements([announcement(),announcement({id:'second'})],'en'),'announcement.order'));
test('descending sequence is rejected',()=>has(inspectAnnouncements([announcement({sequence:4}),announcement({id:'second',sequence:2})],'en'),'announcement.order'));
test('ascending sequence passes',()=>assert.deepEqual(inspectAnnouncements([announcement(),announcement({id:'second',sequence:1})],'en'),[]));
test('French status can remain unknown',()=>assert.deepEqual(inspectAnnouncements([announcement({locale:'fr',text:'Information inconnue'})],'fr'),[]));
test('assertive alert is a valid live announcement',()=>assert.deepEqual(inspectAnnouncements([announcement({politeness:'assertive'})],'en'),[]));

test('null selection reports missing',()=>has(matchSelection(null,targets(),journey()),'selection.missing'));
test('unreachable selection reports issue',()=>has(matchSelection('missing',targets(),journey()),'selection.unreachable'));
test('selection without a journey step reports issue',()=>has(matchSelection('a',targets(),journey()),'selection.no-step'));
test('unknown journey step reports manual review',()=>{
  const j=journey();j.steps=[step('a',0,{access:'unknown'})];
  has(matchSelection('a',targets(),j),'selection.unknown');
});
test('supported journey step can be selected',()=>{
  const j=journey();j.steps=[step('a',0)];
  assert.deepEqual(matchSelection('a',targets(),j),[]);
});
test('scan summary counts available targets',()=>assert.equal(scanSummary(replayScan(['NEXT'],targets()),targets()).controls,3));
test('scan summary counts actions',()=>assert.equal(scanSummary(replayScan(['NEXT','NEXT'],targets()),targets()).actions,2));
test('scan summary reports focused target',()=>assert.equal(scanSummary(replayScan(['NEXT'],targets()),targets()).focus,'a'));
test('scan summary reports selected target',()=>assert.equal(scanSummary(replayScan(['NEXT','SELECT'],targets()),targets()).selected,'a'));
