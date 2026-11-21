import test from "node:test";
import assert from "node:assert/strict";
import { focusSequenceFindings, keyboardActivationFindings, skipLinkFindings, focusSequenceSummary, nodeIds } from "./p20ag-keyboard-sequences.ts";
const step=(patch={})=>({key:"Tab",fromId:"a",toId:"b",at:1,visible:true,enabled:true,insideScope:true,focusVisible:true,horizontalScroll:0,verticalScroll:0,activated:false,...patch});
const context=(patch={})=>({scopeId:"dialog",allowedIds:["a","b","c"],expectedTabOrder:["a","b","c"],modal:true,wrapForward:true,wrapBackward:true,maxHorizontalScroll:1,...patch});
test("P20AG focus sequence accepts a valid Tab move",()=>assert.equal(focusSequenceFindings([step()],context()).clean,true));
test("P20AG focus sequence counts Tab moves",()=>assert.equal(focusSequenceFindings([step()],context()).tabSteps,1));
test("P20AG focus sequence rejects missing destination",()=>assert.ok(focusSequenceFindings([step({toId:null})],context()).issues.some((x)=>x.code==="focus-destination-missing")));
test("P20AG focus sequence rejects unexpected destination",()=>assert.ok(focusSequenceFindings([step({toId:"outside"})],context()).issues.some((x)=>x.code==="focus-destination-unexpected")));
test("P20AG focus sequence rejects hidden destination",()=>assert.ok(focusSequenceFindings([step({visible:false})],context()).issues.some((x)=>x.code==="focus-destination-hidden")));
test("P20AG focus sequence rejects disabled destination",()=>assert.ok(focusSequenceFindings([step({enabled:false})],context()).issues.some((x)=>x.code==="focus-destination-disabled")));
test("P20AG focus sequence rejects modal escape",()=>assert.ok(focusSequenceFindings([step({insideScope:false})],context()).issues.some((x)=>x.code==="focus-escaped-modal")));
test("P20AG focus sequence reviews missing focus indicator",()=>assert.ok(focusSequenceFindings([step({focusVisible:false})],context()).issues.some((x)=>x.code==="focus-indicator-missing")));
test("P20AG focus sequence reviews horizontal scroll jump",()=>assert.ok(focusSequenceFindings([step({horizontalScroll:12})],context()).issues.some((x)=>x.code==="focus-horizontal-scroll")));
test("P20AG focus sequence rejects non-finite scroll",()=>assert.ok(focusSequenceFindings([step({verticalScroll:Infinity})],context()).issues.some((x)=>x.code==="focus-scroll-invalid")));
test("P20AG focus sequence rejects negative time",()=>assert.ok(focusSequenceFindings([step({at:-1})],context()).issues.some((x)=>x.code==="focus-time-reversed")));
test("P20AG focus sequence rejects reversed time",()=>assert.ok(focusSequenceFindings([step({at:2}),step({fromId:"b",toId:"c",at:1})],context()).issues.some((x)=>x.code==="focus-time-reversed")));
test("P20AG focus sequence rejects broken focus chain",()=>assert.ok(focusSequenceFindings([step(),step({fromId:"c",toId:"a",at:2})],context()).issues.some((x)=>x.code==="focus-chain-broken")));
test("P20AG focus sequence checks next expected Tab target",()=>assert.ok(focusSequenceFindings([step({fromId:"a",toId:"c"})],context()).issues.some((x)=>x.code==="focus-tab-order-mismatch")));
test("P20AG focus sequence accepts final-to-first wrap",()=>assert.equal(focusSequenceFindings([step({fromId:"c",toId:"a"})],context()).clean,true));
test("P20AG focus sequence reviews non-wrapping boundary",()=>assert.ok(focusSequenceFindings([step({fromId:"c",toId:"c"})],context({wrapForward:false})).issues.some((x)=>x.code==="focus-boundary-should-release")));
test("P20AG focus sequence counts keyboard activations",()=>assert.equal(focusSequenceFindings([step({key:"Enter",activated:true})],context()).activations,1));
test("P20AG focus sequence rejects disabled activation",()=>assert.ok(focusSequenceFindings([step({key:"Space",enabled:false,activated:true})],context()).issues.some((x)=>x.code==="disabled-control-activated")));
test("P20AG focus sequence summary includes steps",()=>assert.match(focusSequenceSummary(focusSequenceFindings([step()],context())),/Steps: 1/));
test("P20AG focus sequence with no steps is clean",()=>assert.equal(focusSequenceFindings([],context()).clean,true));

for(const role of ["button","checkbox","radio","summary"]){
 test(`P20AG ${role} activates with Enter`,()=>assert.equal(keyboardActivationFindings({role,key:"Enter",enabled:true,defaultPrevented:false,activated:true}).length,0));
 test(`P20AG ${role} activates with Space`,()=>assert.equal(keyboardActivationFindings({role,key:"Space",enabled:true,defaultPrevented:false,activated:true}).length,0));
}
test("P20AG link activates with Enter",()=>assert.deepEqual(keyboardActivationFindings({role:"link",key:"Enter",enabled:true,defaultPrevented:false,activated:true}),[]));
test("P20AG link Space does not activate",()=>assert.ok(keyboardActivationFindings({role:"link",key:"Space",enabled:true,defaultPrevented:false,activated:true}).some((x)=>x.code==="keyboard-activation-unexpected")));
test("P20AG button Space missing activation is reported",()=>assert.ok(keyboardActivationFindings({role:"button",key:"Space",enabled:true,defaultPrevented:false,activated:false}).some((x)=>x.code==="keyboard-activation-missing")));
test("P20AG button cancelled default without activation is reported",()=>assert.ok(keyboardActivationFindings({role:"button",key:"Enter",enabled:true,defaultPrevented:true,activated:false}).some((x)=>x.code==="keyboard-default-cancelled")));
test("P20AG disabled button activation is reported",()=>assert.ok(keyboardActivationFindings({role:"button",key:"Enter",enabled:false,defaultPrevented:false,activated:true}).some((x)=>x.code==="disabled-control-activated")));
test("P20AG generic region does not activate with Space",()=>assert.deepEqual(keyboardActivationFindings({role:"region",key:"Space",enabled:true,defaultPrevented:false,activated:false}),[]));

test("P20AG skip link accepts a valid local focus handoff",()=>assert.deepEqual(skipLinkFindings({href:"#main",targetId:"main",targetExists:true,targetVisible:true,targetFocusable:true,focusedId:"main",activationKey:"Enter"}),[]));
test("P20AG skip link rejects a non-fragment href",()=>assert.ok(skipLinkFindings({href:"/main",targetId:"main",targetExists:true,targetVisible:true,targetFocusable:true,focusedId:"main",activationKey:"Enter"}).some((x)=>x.code==="skip-link-href-invalid")));
test("P20AG skip link rejects missing target",()=>assert.ok(skipLinkFindings({href:"#main",targetId:null,targetExists:false,targetVisible:false,targetFocusable:false,focusedId:null,activationKey:"Enter"}).some((x)=>x.code==="skip-link-target-missing")));
test("P20AG skip link rejects hidden target",()=>assert.ok(skipLinkFindings({href:"#main",targetId:"main",targetExists:true,targetVisible:false,targetFocusable:true,focusedId:"main",activationKey:"Enter"}).some((x)=>x.code==="skip-link-target-hidden")));
test("P20AG skip link rejects unfocusable target",()=>assert.ok(skipLinkFindings({href:"#main",targetId:"main",targetExists:true,targetVisible:true,targetFocusable:false,focusedId:"main",activationKey:"Enter"}).some((x)=>x.code==="skip-link-target-not-focusable")));
test("P20AG skip link rejects focus not moved",()=>assert.ok(skipLinkFindings({href:"#main",targetId:"main",targetExists:true,targetVisible:true,targetFocusable:true,focusedId:"other",activationKey:"Enter"}).some((x)=>x.code==="skip-link-focus-not-moved")));
test("P20AG skip link reviews Space activation",()=>assert.ok(skipLinkFindings({href:"#main",targetId:"main",targetExists:true,targetVisible:true,targetFocusable:true,focusedId:"main",activationKey:"Space"}).some((x)=>x.code==="skip-link-key-invalid")));
test("P20AG nodeIds returns visible enabled sequential nodes in DOM order",()=>{
 const nodes=[
  {id:"b",visible:true,enabled:true,inert:false,ariaHidden:false,tabIndex:0,domOrder:2},
  {id:"a",visible:true,enabled:true,inert:false,ariaHidden:false,tabIndex:0,domOrder:1},
  {id:"hidden",visible:false,enabled:true,inert:false,ariaHidden:false,tabIndex:0,domOrder:0},
  {id:"negative",visible:true,enabled:true,inert:false,ariaHidden:false,tabIndex:-1,domOrder:3},
 ];
 assert.deepEqual(nodeIds(nodes),["a","b"]);
});
