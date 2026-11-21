import test from "node:test";
import assert from "node:assert/strict";
import {
  emptyDialogState, isSequentiallyFocusable, isInsideDialog, sequentialOrder,
  dialogTabOrder, nextFocusId, focusVisible, focusIssues, disclosureIssues,
  dialogEvent, replayDialogEvents, focusSummary, dialogStackIssues,
  rovingFocusIssues, focusRestorationIssues, focusOrderIssues,
} from "./p20ag-focus-contracts.ts";

const rect=(patch={})=>({left:0,top:0,right:44,bottom:44,width:44,height:44,...patch});
const node=(id,patch={})=>({
  id,role:"button",name:id,domOrder:0,tabIndex:0,visible:true,enabled:true,inert:false,
  ariaHidden:false,focusable:true,rect:rect(),scopeId:"dialog-a",outlineStyle:"solid",
  outlineWidth:2,outlineOffset:2,boxShadow:"none",...patch,
});
const observation=(patch={})=>({
  id:"dialog-a",open:true,modal:true,dismissible:true,labelledBy:"dialog-title",
  describedBy:null,activeId:"first",triggerId:"open-dialog",parentDialogId:null,
  nodes:[
    node("open-dialog",{scopeId:null}),
    node("dialog-a",{role:"dialog",scopeId:"dialog-a",focusable:true,tabIndex:-1}),
    node("dialog-title",{role:"heading",scopeId:"dialog-a",focusable:false,tabIndex:-1}),
    node("first",{scopeId:"dialog-a",domOrder:3}),
    node("second",{scopeId:"dialog-a",domOrder:4}),
  ],
  backgroundInert:true,...patch,
});
const openSequence=()=>{
 const obs=observation();
 const state=emptyDialogState();
 const opened=dialogEvent(state,{type:"open",dialogId:"dialog-a",triggerId:"open-dialog",at:10},obs);
 assert.equal(opened.accepted,true);
 const focused=dialogEvent(opened.state,{type:"initial-focus",dialogId:"dialog-a",targetId:"first",at:11},{...obs,activeId:"first"});
 assert.equal(focused.accepted,true);
 return focused.state;
};
const codeList=(items)=>items.map((item)=>item.code);

test("P20AG empty dialog state starts closed",()=>assert.equal(emptyDialogState().phase,"closed"));
test("P20AG empty dialog state has no identity",()=>assert.equal(emptyDialogState().dialogId,null));
test("P20AG empty dialog state has no active focus",()=>assert.equal(emptyDialogState().activeId,null));
test("P20AG empty dialog state has no events",()=>assert.equal(emptyDialogState().events,0));
test("P20AG button is sequentially focusable",()=>assert.equal(isSequentiallyFocusable(node("button")),true));
test("P20AG disabled button is not sequentially focusable",()=>assert.equal(isSequentiallyFocusable(node("button",{enabled:false})),false));
test("P20AG hidden button is not sequentially focusable",()=>assert.equal(isSequentiallyFocusable(node("button",{visible:false})),false));
test("P20AG inert button is not sequentially focusable",()=>assert.equal(isSequentiallyFocusable(node("button",{inert:true})),false));
test("P20AG aria-hidden button is not sequentially focusable",()=>assert.equal(isSequentiallyFocusable(node("button",{ariaHidden:true})),false));
test("P20AG negative tabindex button is not sequentially focusable",()=>assert.equal(isSequentiallyFocusable(node("button",{tabIndex:-1})),false));
test("P20AG link is sequentially focusable",()=>assert.equal(isSequentiallyFocusable(node("link",{role:"link"})),true));
test("P20AG heading without tabindex is not sequentially focusable",()=>assert.equal(isSequentiallyFocusable(node("heading",{role:"heading",focusable:false,tabIndex:-1})),false));
test("P20AG node belongs to its matching dialog scope",()=>assert.equal(isInsideDialog(node("child"),"dialog-a"),true));
test("P20AG node outside dialog scope is excluded",()=>assert.equal(isInsideDialog(node("outside",{scopeId:null}),"dialog-a"),false));
test("P20AG dialog root is inside its own scope",()=>assert.equal(isInsideDialog(node("dialog-a",{scopeId:null}),"dialog-a"),true));

test("P20AG sequential order sorts by DOM order",()=>{
 const order=sequentialOrder([node("b",{domOrder:2}),node("a",{domOrder:1})]);
 assert.deepEqual(order.map((x)=>x.id),["a","b"]);
});
test("P20AG sequential order puts positive tabindex before natural order",()=>{
 const order=sequentialOrder([node("natural",{tabIndex:0,domOrder:0}),node("positive",{tabIndex:2,domOrder:1}),node("positive-one",{tabIndex:1,domOrder:2})]);
 assert.deepEqual(order.map((x)=>x.id),["positive-one","positive","natural"]);
});
test("P20AG sequential order omits negative tabindex",()=>{
 assert.deepEqual(sequentialOrder([node("a"),node("b",{tabIndex:-1})]).map((x)=>x.id),["a"]);
});
test("P20AG sequential order omits hidden and inert nodes",()=>{
 assert.deepEqual(sequentialOrder([node("a"),node("hidden",{visible:false}),node("inert",{inert:true})]).map((x)=>x.id),["a"]);
});
test("P20AG dialog tab order excludes outside controls",()=>{
 const obs=observation();
 assert.deepEqual(dialogTabOrder(obs).map((x)=>x.id),["first","second"]);
});
test("P20AG next focus moves forward",()=>assert.equal(nextFocusId([node("a"),node("b")],"a"),"b"));
test("P20AG next focus moves backward",()=>assert.equal(nextFocusId([node("a"),node("b")],"b",true),"a"));
test("P20AG next focus wraps forward from last",()=>assert.equal(nextFocusId([node("a"),node("b")],"b"),"a"));
test("P20AG next focus wraps backward from first",()=>assert.equal(nextFocusId([node("a"),node("b")],"a",true),"b"));
test("P20AG next focus starts at first when current id is absent",()=>assert.equal(nextFocusId([node("a"),node("b")],"absent"),"a"));
test("P20AG reverse next focus starts at last when current id is absent",()=>assert.equal(nextFocusId([node("a"),node("b")],"absent",true),"b"));
test("P20AG next focus returns null when there are no targets",()=>assert.equal(nextFocusId([],"missing"),null));

test("P20AG focus indicator accepts visible outline",()=>assert.equal(focusVisible(node("a")),true));
test("P20AG focus indicator accepts box shadow",()=>assert.equal(focusVisible(node("a",{outlineStyle:"none",outlineWidth:0,boxShadow:"0 0 0 3px black"})),true));
test("P20AG focus indicator rejects no outline and no shadow",()=>assert.equal(focusVisible(node("a",{outlineStyle:"none",outlineWidth:0,boxShadow:"none"})),false));
test("P20AG hidden focus indicator remains false",()=>assert.equal(focusVisible(node("a",{visible:false})),false));

test("P20AG focus audit accepts labelled modal with inert background",()=>assert.deepEqual(focusIssues(observation()),[]));
test("P20AG focus audit reports missing accessible label",()=>assert.ok(codeList(focusIssues(observation({labelledBy:null}))).includes("dialog-label-missing")));
test("P20AG focus audit reports missing label target",()=>assert.ok(codeList(focusIssues(observation({labelledBy:"missing"}))).includes("dialog-label-target-missing")));
test("P20AG focus audit reviews missing description target",()=>assert.ok(focusIssues(observation({describedBy:"missing"})).some((x)=>x.code==="dialog-description-target-missing"&&x.severity==="review")));
test("P20AG focus audit reports custom modal background not inert",()=>assert.ok(codeList(focusIssues(observation({backgroundInert:false}))).includes("modal-background-not-inert")));
test("P20AG focus audit reports active element outside modal",()=>assert.ok(codeList(focusIssues(observation({activeId:"open-dialog"}))).includes("focus-outside-modal")));
test("P20AG focus audit reports active element absent from observation",()=>assert.ok(codeList(focusIssues(observation({activeId:"missing"}))).includes("active-node-missing")));
test("P20AG focus audit reports active element unusable",()=>assert.ok(codeList(focusIssues(observation({activeId:"first",nodes:observation().nodes.map((x)=>x.id==="first"?{...x,inert:true}:x)}))).includes("active-node-unusable")));
test("P20AG focus audit reports no tabbable descendants",()=>assert.ok(codeList(focusIssues(observation({nodes:observation().nodes.map((x)=>x.scopeId==="dialog-a"?{...x,tabIndex:-1}:x)}))).includes("modal-no-tabbable-descendant")));
test("P20AG focus audit reports positive tabindex",()=>assert.ok(codeList(focusIssues(observation({nodes:observation().nodes.map((x)=>x.id==="first"?{...x,tabIndex:2}:x)}))).includes("positive-tabindex")));
test("P20AG focus audit reviews missing focus indicator",()=>assert.ok(focusIssues(observation({nodes:observation().nodes.map((x)=>x.id==="first"?{...x,outlineStyle:"none",outlineWidth:0}:x)})).some((x)=>x.code==="focus-indicator-not-observed")));
test("P20AG focus audit reports small target",()=>assert.ok(codeList(focusIssues(observation({nodes:observation().nodes.map((x)=>x.id==="first"?{...x,rect:rect({width:30})}:x)}))).includes("focus-target-small")));
test("P20AG focus audit reports invalid dialog identifier",()=>assert.ok(codeList(focusIssues(observation({id:"../bad"}))).includes("dialog-id-invalid")));
test("P20AG focus audit reviews too many observed nodes",()=>assert.ok(focusIssues(observation({nodes:Array.from({length:501},(_,i)=>node(`n${i}`,{scopeId:null}))})).some((x)=>x.code==="focus-observation-truncated"&&x.severity==="review")));
test("P20AG focus audit accepts a non-modal dialog without inert background",()=>assert.equal(focusIssues(observation({modal:false,backgroundInert:false})).some((x)=>x.code==="modal-background-not-inert"),false));

test("P20AG disclosure accepts matching expanded and visible state",()=>assert.deepEqual(disclosureIssues({id:"faq",expanded:true,panelVisible:true,controlsId:"faq-panel",panelId:"faq-panel",summaryFocusable:true,summaryName:"Question"}),[]));
test("P20AG disclosure reports expanded mismatch",()=>assert.ok(codeList(disclosureIssues({id:"faq",expanded:true,panelVisible:false,controlsId:"p",panelId:"p",summaryFocusable:true,summaryName:"Q"})).includes("disclosure-expanded-visibility-mismatch")));
test("P20AG disclosure reports missing controls target",()=>assert.ok(codeList(disclosureIssues({id:"faq",expanded:true,panelVisible:true,controlsId:null,panelId:"p",summaryFocusable:true,summaryName:"Q"})).includes("disclosure-controls-mismatch")));
test("P20AG disclosure reports mismatched controls target",()=>assert.ok(codeList(disclosureIssues({id:"faq",expanded:true,panelVisible:true,controlsId:"one",panelId:"two",summaryFocusable:true,summaryName:"Q"})).includes("disclosure-controls-mismatch")));
test("P20AG disclosure reports non-focusable summary",()=>assert.ok(codeList(disclosureIssues({id:"faq",expanded:false,panelVisible:false,controlsId:"p",panelId:"p",summaryFocusable:false,summaryName:"Q"})).includes("disclosure-summary-not-focusable")));
test("P20AG disclosure reports empty summary name",()=>assert.ok(codeList(disclosureIssues({id:"faq",expanded:false,panelVisible:false,controlsId:"p",panelId:"p",summaryFocusable:true,summaryName:" "})).includes("disclosure-name-empty")));
test("P20AG disclosure reports invalid identifier",()=>assert.ok(codeList(disclosureIssues({id:"bad id",expanded:false,panelVisible:false,controlsId:"p",panelId:"p",summaryFocusable:true,summaryName:"Q"})).includes("disclosure-id-invalid")));

test("P20AG dialog open event requires an observed open dialog",()=>{
 const outcome=dialogEvent(emptyDialogState(),{type:"open",dialogId:"dialog-a",triggerId:"open-dialog",at:1},{...observation(),open:false});
 assert.equal(outcome.accepted,false);assert.equal(outcome.reason,"dialog.open-not-observed");
});
test("P20AG dialog open event records trigger and phase",()=>{
 const outcome=dialogEvent(emptyDialogState(),{type:"open",dialogId:"dialog-a",triggerId:"open-dialog",at:1},observation());
 assert.equal(outcome.accepted,true);assert.equal(outcome.state.phase,"opening");assert.equal(outcome.state.returnFocusId,"open-dialog");
});
test("P20AG dialog open event rejects invalid timestamp",()=>assert.equal(dialogEvent(emptyDialogState(),{type:"open",dialogId:"dialog-a",triggerId:"open-dialog",at:-1},observation()).reason,"dialog.time.invalid"));
test("P20AG dialog open event rejects invalid dialog id",()=>assert.equal(dialogEvent(emptyDialogState(),{type:"open",dialogId:"../x",triggerId:"open-dialog",at:1},observation()).reason,"dialog.id.invalid"));
test("P20AG dialog open event rejects missing trigger",()=>assert.equal(dialogEvent(emptyDialogState(),{type:"open",dialogId:"dialog-a",triggerId:"missing",at:1},observation()).reason,"dialog.trigger-unusable"));
test("P20AG dialog open event rejects trigger that is disabled",()=>{
 const obs=observation({nodes:observation().nodes.map((x)=>x.id==="open-dialog"?{...x,enabled:false}:x)});
 assert.equal(dialogEvent(emptyDialogState(),{type:"open",dialogId:"dialog-a",triggerId:"open-dialog",at:1},obs).accepted,false);
});
test("P20AG dialog rejects a second open event",()=>{
 const state=openSequence();
 assert.equal(dialogEvent(state,{type:"open",dialogId:"dialog-a",triggerId:"open-dialog",at:12},observation()).reason,"dialog.already-open");
});
test("P20AG dialog requires initial focus immediately after opening",()=>{
 const opened=dialogEvent(emptyDialogState(),{type:"open",dialogId:"dialog-a",triggerId:"open-dialog",at:1},observation());
 assert.equal(dialogEvent(opened.state,{type:"tab",dialogId:"dialog-a",fromId:"first",toId:"second",at:2},observation()).reason,"dialog.initial-focus-required");
});
test("P20AG dialog initial focus accepts active descendant",()=>assert.equal(openSequence().initialFocusId,"first"));
test("P20AG dialog initial focus rejects target outside dialog",()=>{
 const opened=dialogEvent(emptyDialogState(),{type:"open",dialogId:"dialog-a",triggerId:"open-dialog",at:1},observation());
 const obs=observation({activeId:"open-dialog"});
 assert.equal(dialogEvent(opened.state,{type:"initial-focus",dialogId:"dialog-a",targetId:"open-dialog",at:2},obs).reason,"dialog.initial-focus.invalid");
});
test("P20AG dialog initial focus rejects target not actually active",()=>{
 const opened=dialogEvent(emptyDialogState(),{type:"open",dialogId:"dialog-a",triggerId:"open-dialog",at:1},observation());
 assert.equal(dialogEvent(opened.state,{type:"initial-focus",dialogId:"dialog-a",targetId:"second",at:2},observation()).reason,"dialog.initial-focus.not-active");
});
test("P20AG dialog tab event advances focus",()=>{
 const state=openSequence();
 const outcome=dialogEvent(state,{type:"tab",dialogId:"dialog-a",fromId:"first",toId:"second",at:12},{...observation(),activeId:"second"});
 assert.equal(outcome.accepted,true);assert.equal(outcome.state.activeId,"second");
});
test("P20AG dialog tab event wraps from last to first",()=>{
 const state=openSequence();
 const outcome=dialogEvent(state,{type:"tab",dialogId:"dialog-a",fromId:"second",toId:"first",at:12},{...observation(),activeId:"first"});
 assert.equal(outcome.accepted,true);
});
test("P20AG dialog shift-tab wraps from first to last",()=>{
 const state=openSequence();
 const outcome=dialogEvent(state,{type:"shift-tab",dialogId:"dialog-a",fromId:"first",toId:"second",at:12},{...observation(),activeId:"second"});
 assert.equal(outcome.accepted,true);
});
test("P20AG dialog tab event rejects wrong destination",()=>{
 const state=openSequence();
 assert.equal(dialogEvent(state,{type:"tab",dialogId:"dialog-a",fromId:"first",toId:"open-dialog",at:12},{...observation(),activeId:"open-dialog"}).reason,"dialog.tab.order-invalid");
});
test("P20AG dialog tab event rejects destination that is not active",()=>{
 const state=openSequence();
 assert.equal(dialogEvent(state,{type:"tab",dialogId:"dialog-a",fromId:"first",toId:"second",at:12},observation()).reason,"dialog.tab.destination-not-active");
});
test("P20AG dialog event rejects identity change",()=>{
 const state=openSequence();
 assert.equal(dialogEvent(state,{type:"tab",dialogId:"dialog-b",fromId:"first",toId:"second",at:12},observation()).reason,"dialog.identity.changed");
});
test("P20AG dialog event rejects reversed timestamp",()=>{
 const state=openSequence();
 assert.equal(dialogEvent(state,{type:"tab",dialogId:"dialog-a",fromId:"first",toId:"second",at:9},observation()).reason,"dialog.time.reversed");
});
test("P20AG dialog Escape enters closing phase when dismissible",()=>{
 const state=openSequence();
 assert.equal(dialogEvent(state,{type:"escape",dialogId:"dialog-a",at:12},observation()).state.phase,"closing");
});
test("P20AG dialog Escape is rejected when not dismissible",()=>{
 const state=openSequence();
 assert.equal(dialogEvent(state,{type:"escape",dialogId:"dialog-a",at:12},{...observation(),dismissible:false}).reason,"dialog.escape.not-dismissible");
});
test("P20AG dialog Escape is rejected before initial focus",()=>{
 const opened=dialogEvent(emptyDialogState(),{type:"open",dialogId:"dialog-a",triggerId:"open-dialog",at:1},observation());
 assert.equal(dialogEvent(opened.state,{type:"escape",dialogId:"dialog-a",at:2},observation()).reason,"dialog.initial-focus-required");
});
test("P20AG dialog close requires observed closed state",()=>{
 const state=openSequence();
 assert.equal(dialogEvent(state,{type:"close",dialogId:"dialog-a",at:13},observation()).reason,"dialog.close.not-observed");
});
test("P20AG dialog close enters closing phase",()=>{
 const state=openSequence();
 const outcome=dialogEvent(state,{type:"close",dialogId:"dialog-a",at:13},{...observation(),open:false});
 assert.equal(outcome.accepted,true);assert.equal(outcome.state.phase,"closing");
});
test("P20AG dialog focus return requires the original trigger",()=>{
 const state=dialogEvent(openSequence(),{type:"close",dialogId:"dialog-a",at:13},{...observation(),open:false}).state;
 assert.equal(dialogEvent(state,{type:"focus-return",dialogId:"dialog-a",targetId:"second",at:14},observation()).reason,"dialog.focus-return.wrong-target");
});
test("P20AG dialog focus return requires active focus to match",()=>{
 const state=dialogEvent(openSequence(),{type:"close",dialogId:"dialog-a",at:13},{...observation(),open:false}).state;
 assert.equal(dialogEvent(state,{type:"focus-return",dialogId:"dialog-a",targetId:"open-dialog",at:14},{...observation(),activeId:"second"}).reason,"dialog.focus-return.not-active");
});
test("P20AG dialog focus return completes lifecycle",()=>{
 const state=dialogEvent(openSequence(),{type:"close",dialogId:"dialog-a",at:13},{...observation(),open:false}).state;
 const outcome=dialogEvent(state,{type:"focus-return",dialogId:"dialog-a",targetId:"open-dialog",at:14},{...observation(),activeId:"open-dialog"});
 assert.equal(outcome.accepted,true);assert.equal(outcome.state.phase,"closed");assert.equal(outcome.state.dialogId,null);
});
test("P20AG dialog lifecycle increments accepted event count",()=>assert.equal(openSequence().events,2));
test("P20AG dialog replay accepts a full lifecycle",()=>{
 const obs=observation();
 const events=[
  {type:"open",dialogId:"dialog-a",triggerId:"open-dialog",at:1},
  {type:"initial-focus",dialogId:"dialog-a",targetId:"first",at:2},
  {type:"tab",dialogId:"dialog-a",fromId:"first",toId:"second",at:3},
  {type:"escape",dialogId:"dialog-a",at:4},
  {type:"close",dialogId:"dialog-a",at:5},
  {type:"focus-return",dialogId:"dialog-a",targetId:"open-dialog",at:6},
 ];
 const observations=[obs,obs,{...obs,activeId:"second"},obs,{...obs,open:false},{...obs,activeId:"open-dialog"}];
 const result=replayDialogEvents(events,observations);
 assert.equal(result.accepted,6);assert.equal(result.state.phase,"closed");assert.deepEqual(result.rejected,[]);
});
test("P20AG dialog replay reports missing observations",()=>{
 const result=replayDialogEvents([{type:"open",dialogId:"dialog-a",triggerId:"open-dialog",at:1}],[]);
 assert.equal(result.rejected[0].reason,"dialog.observation.missing");
});

test("P20AG dialog stack accepts one open modal",()=>assert.deepEqual(dialogStackIssues([{id:"one",open:true,modal:true,parentId:null,activeId:"a"}]),[]));
test("P20AG dialog stack reports duplicate ids",()=>assert.ok(codeList(dialogStackIssues([{id:"one",open:true,modal:true,parentId:null,activeId:null},{id:"one",open:true,modal:true,parentId:null,activeId:null}])).includes("dialog-stack-duplicate-id")));
test("P20AG dialog stack reports missing parent",()=>assert.ok(codeList(dialogStackIssues([{id:"child",open:true,modal:true,parentId:"parent",activeId:null}])).includes("dialog-stack-parent-missing")));
test("P20AG dialog stack reports active focus in covered modal",()=>assert.ok(codeList(dialogStackIssues([{id:"one",open:true,modal:true,parentId:null,activeId:"a"},{id:"two",open:true,modal:true,parentId:"one",activeId:"b"}])).includes("dialog-stack-background-active")));
test("P20AG dialog stack ignores closed dialogs",()=>assert.deepEqual(dialogStackIssues([{id:"one",open:false,modal:true,parentId:null,activeId:null}]),[]));

test("P20AG roving focus accepts one active tab stop",()=>assert.deepEqual(rovingFocusIssues("tabs",[node("one",{role:"tab",scopeId:"tabs",tabIndex:0}),node("two",{role:"tab",scopeId:"tabs",tabIndex:-1})],"one"),[]));
test("P20AG roving focus reports no group members",()=>assert.ok(codeList(rovingFocusIssues("tabs",[],"one")).includes("roving-group-empty")));
test("P20AG roving focus reports two tab stops",()=>assert.ok(codeList(rovingFocusIssues("tabs",[node("one",{role:"tab",scopeId:"tabs"}),node("two",{role:"tab",scopeId:"tabs"})],"one")).includes("roving-tabstop-count")));
test("P20AG roving focus reports invalid tabindex",()=>assert.ok(codeList(rovingFocusIssues("tabs",[node("one",{role:"tab",scopeId:"tabs",tabIndex:2})],"one")).includes("roving-tabindex-invalid")));
test("P20AG roving focus reports active tab outside group",()=>assert.ok(codeList(rovingFocusIssues("tabs",[node("one",{role:"tab",scopeId:"tabs"})],"other")).includes("roving-active-outside-group")));
test("P20AG roving focus reports active and tab stop mismatch",()=>assert.ok(codeList(rovingFocusIssues("tabs",[node("one",{role:"tab",scopeId:"tabs"}),node("two",{role:"tab",scopeId:"tabs",tabIndex:-1})],"two")).includes("roving-active-tabstop-mismatch")));

test("P20AG focus restoration accepts the invoking trigger",()=>assert.deepEqual(focusRestorationIssues({triggerId:"open",activeId:"open",triggerVisible:true,triggerEnabled:true,focusWasMoved:true}),[]));
test("P20AG focus restoration reports missing trigger",()=>assert.ok(codeList(focusRestorationIssues({triggerId:null,activeId:null,triggerVisible:false,triggerEnabled:false,focusWasMoved:true})).includes("focus-restore-trigger-missing")));
test("P20AG focus restoration reports wrong target",()=>assert.ok(codeList(focusRestorationIssues({triggerId:"open",activeId:"other",triggerVisible:true,triggerEnabled:true,focusWasMoved:true})).includes("focus-restore-wrong-target")));
test("P20AG focus restoration reviews hidden trigger",()=>assert.ok(focusRestorationIssues({triggerId:"open",activeId:"open",triggerVisible:false,triggerEnabled:true,focusWasMoved:true}).some((x)=>x.code==="focus-restore-trigger-hidden"&&x.severity==="review")));
test("P20AG focus restoration reviews disabled trigger",()=>assert.ok(focusRestorationIssues({triggerId:"open",activeId:"open",triggerVisible:true,triggerEnabled:false,focusWasMoved:true}).some((x)=>x.code==="focus-restore-trigger-disabled"&&x.severity==="review")));

test("P20AG focus order accepts exact sequential traversal",()=>assert.deepEqual(focusOrderIssues([node("a",{domOrder:0}),node("b",{domOrder:1})],["a","b"]),[]));
test("P20AG focus order reports skipped target",()=>assert.ok(codeList(focusOrderIssues([node("a",{domOrder:0}),node("b",{domOrder:1})],["a"])).includes("focus-order-skipped")));
test("P20AG focus order reports unexpected target",()=>assert.ok(codeList(focusOrderIssues([node("a")],["a","outside"])).includes("focus-order-unexpected")));
test("P20AG focus order reports repeated target",()=>assert.ok(codeList(focusOrderIssues([node("a")],["a","a"])).includes("focus-order-repeat")));
test("P20AG focus summary counts available descendants",()=>{
 const summary=focusSummary(observation());
 assert.equal(summary.tabbable,2);assert.equal(summary.activeInside,true);assert.equal(summary.dialogId,"dialog-a");
});
test("P20AG focus summary counts hidden focusable nodes",()=>{
 const summary=focusSummary(observation({nodes:[node("hidden",{visible:false})]}));
 assert.equal(summary.hiddenFocusable,1);
});
test("P20AG focus summary counts inert focusable nodes",()=>{
 const summary=focusSummary(observation({nodes:[node("inert",{inert:true})]}));
 assert.equal(summary.inertFocusable,1);
});
test("P20AG focus summary counts positive tab indices",()=>{
 const summary=focusSummary(observation({nodes:[node("positive",{tabIndex:3})]}));
 assert.equal(summary.positiveTabIndex,1);
});

for(const tabIndex of [-1,0,1,2,5]){
 test(`P20AG positive tab policy records tabindex ${tabIndex}`,()=>{
  const report=focusIssues(observation({nodes:[node("x",{tabIndex})]}));
  assert.equal(report.some((x)=>x.code==="positive-tabindex"),tabIndex>0);
 });
}
for(const role of ["button","link","textbox","checkbox","radio","tab","summary"]){
 test(`P20AG interactive role ${role} is included in tab sequence`,()=>{
  const item=node("target",{role,scopeId:"dialog-a"});
  assert.equal(sequentialOrder([item]).length,1);
 });
}
