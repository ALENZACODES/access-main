import test from "node:test";
import assert from "node:assert/strict";
import { emptyDialogState, dialogEvent, focusIssues } from "./p20ag-focus-contracts.ts";
import { focusSequenceFindings, keyboardActivationFindings, skipLinkFindings } from "./p20ag-keyboard-sequences.ts";
import { disclosureKeyResult, disclosureGroupIssues } from "./p20ag-disclosure-keyboard.ts";
import { nestedDialogStep, emptyNestedDialogState, nestedDialogIssues } from "./p20ag-dialog-nesting.ts";
import { modalSemanticsFindings, modalStackFindings } from "./p20ag-modal-semantics.ts";

const rect={left:0,top:0,right:44,bottom:44,width:44,height:44};
const n=(id,scopeId,patch={})=>({id,role:"button",name:id,domOrder:0,tabIndex:0,visible:true,enabled:true,
 inert:false,ariaHidden:false,focusable:true,rect,scopeId,outlineStyle:"solid",outlineWidth:2,outlineOffset:2,boxShadow:"none",...patch});
const obs=(patch={})=>({id:"modal",open:true,modal:true,dismissible:true,labelledBy:"title",describedBy:null,
 activeId:"inside",triggerId:"trigger",parentDialogId:null,nodes:[n("trigger",null),n("modal","modal",{role:"dialog",tabIndex:-1}),n("title","modal",{role:"heading",focusable:false,tabIndex:-1}),n("inside","modal")],backgroundInert:true,...patch});
const item=(id,order,patch={})=>({id,name:id,expanded:false,panelId:`${id}-panel`,panelVisible:false,disabled:false,focusable:true,
 domOrder:order,panelLabelledBy:id,panelRegion:true,...patch});
const group=(items,patch={})=>({id:"group",items,exclusive:false,orientation:"vertical",...patch});

test("P20AG regression: focus state cannot begin with an initial-focus event",()=>{
 const event={type:"initial-focus",dialogId:"modal",targetId:"inside",at:1};
 assert.equal(dialogEvent(emptyDialogState(),event,obs()).reason,"dialog.not-open");
});
test("P20AG regression: focus state rejects a close event before opening",()=>{
 assert.equal(dialogEvent(emptyDialogState(),{type:"close",dialogId:"modal",at:1},obs()).reason,"dialog.not-open");
});
test("P20AG regression: focus state rejects Escape after terminal close",()=>{
 const closed=emptyDialogState();
 assert.equal(dialogEvent(closed,{type:"escape",dialogId:"modal",at:1},obs()).reason,"dialog.not-open");
});
test("P20AG regression: open state cannot accept initial focus twice",()=>{
 const open=dialogEvent(emptyDialogState(),{type:"open",dialogId:"modal",triggerId:"trigger",at:1},obs()).state;
 const first=dialogEvent(open,{type:"initial-focus",dialogId:"modal",targetId:"inside",at:2},obs()).state;
 assert.equal(dialogEvent(first,{type:"initial-focus",dialogId:"modal",targetId:"inside",at:3},obs()).reason,"dialog.initial-focus.out-of-order");
});
test("P20AG regression: dialog focus return cannot target null trigger",()=>{
 const opened=dialogEvent(emptyDialogState(),{type:"open",dialogId:"modal",triggerId:"trigger",at:1},obs()).state;
 const focused=dialogEvent(opened,{type:"initial-focus",dialogId:"modal",targetId:"inside",at:2},obs()).state;
 const closing=dialogEvent(focused,{type:"close",dialogId:"modal",at:3},{...obs(),open:false}).state;
 assert.equal(dialogEvent(closing,{type:"focus-return",dialogId:"modal",targetId:null,at:4},{...obs(),activeId:null}).reason,"dialog.focus-return.wrong-target");
});
test("P20AG regression: focus audit reports control character in accessible name",()=>{
 assert.ok(focusIssues(obs({nodes:[n("inside","modal",{name:"bad\u0001name"})]})).some((x)=>x.code==="accessible-name-control-character"));
});
test("P20AG regression: focus audit ignores indicator styling on unfocused controls",()=>{
 const report=focusIssues(obs({nodes:[n("inside","modal"),n("other","modal",{outlineStyle:"none",outlineWidth:0})]}));
 assert.equal(report.some((x)=>x.code==="focus-indicator-not-observed"&&x.target==="other"),false);
});
test("P20AG regression: focus audit checks active indicator styling",()=>{
 const report=focusIssues(obs({nodes:[n("inside","modal",{outlineStyle:"none",outlineWidth:0})]}));
 assert.ok(report.some((x)=>x.code==="focus-indicator-not-observed"));
});

test("P20AG regression: disclosure group moves focus with Home",()=>{
 const result=disclosureKeyResult(group([item("one",0),item("two",1)]),{itemId:"two",key:"Home",at:1,currentFocusId:"two",nextFocusId:"one",nextExpanded:null});
 assert.equal(result.focusId,"one");
});
test("P20AG regression: disclosure group moves focus with End",()=>{
 const result=disclosureKeyResult(group([item("one",0),item("two",1)]),{itemId:"one",key:"End",at:1,currentFocusId:"one",nextFocusId:"two",nextExpanded:null});
 assert.equal(result.focusId,"two");
});
test("P20AG regression: disabled accordion item is excluded from arrow order",()=>{
 const result=disclosureKeyResult(group([item("one",0),item("disabled",1,{disabled:true}),item("three",2)]),{itemId:"one",key:"ArrowDown",at:1,currentFocusId:"one",nextFocusId:"three",nextExpanded:null});
 assert.equal(result.focusId,"three");
});
test("P20AG regression: horizontal accordion does not use ArrowDown",()=>{
 const result=disclosureKeyResult(group([item("one",0),item("two",1)],{orientation:"horizontal"}),{itemId:"one",key:"ArrowDown",at:1,currentFocusId:"one",nextFocusId:"two",nextExpanded:null});
 assert.equal(result.accepted,false);
});
test("P20AG regression: vertical accordion does not use ArrowRight",()=>{
 const result=disclosureKeyResult(group([item("one",0),item("two",1)]),{itemId:"one",key:"ArrowRight",at:1,currentFocusId:"one",nextFocusId:"two",nextExpanded:null});
 assert.equal(result.accepted,false);
});
test("P20AG regression: accordion can keep a panel open on Space with explicit true",()=>{
 const result=disclosureKeyResult(group([item("one",0,{expanded:true,panelVisible:true})]),{itemId:"one",key:"Space",at:1,currentFocusId:"one",nextFocusId:"one",nextExpanded:true});
 assert.deepEqual(result.expandedIds,["one"]);
});
test("P20AG regression: accordion rejects a focus action on hidden disabled item",()=>{
 const result=disclosureKeyResult(group([item("one",0,{disabled:true})]),{itemId:"one",key:"Enter",at:1,currentFocusId:"one",nextFocusId:"one",nextExpanded:true});
 assert.equal(result.reason,"disclosure-control-unavailable");
});
test("P20AG regression: disclosure group reports duplicate order without mutating input",()=>{
 const items=[item("one",0),item("two",0)];
 const before=JSON.stringify(items);disclosureGroupIssues(group(items));
 assert.equal(JSON.stringify(items),before);
});

test("P20AG regression: nested dialog root must not have parent",()=>{
 const state={...emptyNestedDialogState(),stack:[{id:"root",triggerId:"open",parentId:"other",dismissible:true,openedAt:1}],activeId:"root"};
 assert.ok(nestedDialogIssues(state).includes("dialog-root-has-parent:root"));
});
test("P20AG regression: nested dialog state cannot retain active id after stack emptied",()=>{
 const state={...emptyNestedDialogState(),activeId:"orphan"};
 assert.ok(nestedDialogIssues(state).includes("dialog-active-with-empty-stack"));
});
test("P20AG regression: nested dialog Escape on child leaves child topmost",()=>{
 let state=nestedDialogStep(emptyNestedDialogState(),{type:"open",dialog:{id:"root",triggerId:"open",parentId:null,dismissible:true,openedAt:1},at:1}).state;
 state=nestedDialogStep(state,{type:"open",dialog:{id:"child",triggerId:"child-open",parentId:"root",dismissible:true,openedAt:2},at:2}).state;
 const result=nestedDialogStep(state,{type:"escape",dialogId:"child",at:3});
 assert.equal(result.state.stack.length,2);assert.equal(result.state.activeId,"child");
});
test("P20AG regression: nested dialog close can be rejected without observation",()=>{
 const opened=nestedDialogStep(emptyNestedDialogState(),{type:"open",dialog:{id:"root",triggerId:"open",parentId:null,dismissible:true,openedAt:1},at:1}).state;
 assert.equal(nestedDialogStep(opened,{type:"close",dialogId:"root",at:2,observedClosed:false}).accepted,false);
});
test("P20AG regression: nested dialog restore cannot complete with a mismatched dialog id",()=>{
 const opened=nestedDialogStep(emptyNestedDialogState(),{type:"open",dialog:{id:"root",triggerId:"open",parentId:null,dismissible:true,openedAt:1},at:1}).state;
 const closed=nestedDialogStep(opened,{type:"close",dialogId:"root",at:2,observedClosed:true}).state;
 assert.equal(nestedDialogStep(closed,{type:"restore",dialogId:"other",targetId:"open",activeId:"open",at:3}).accepted,false);
});
test("P20AG regression: nested dialog revision increments only on accepted actions",()=>{
 const initial=emptyNestedDialogState();
 const rejected=nestedDialogStep(initial,{type:"close",dialogId:"missing",at:1,observedClosed:true});
 assert.equal(rejected.state.revision,0);
});
test("P20AG regression: nested dialog action rejects invalid timestamp",()=>{
 assert.equal(nestedDialogStep(emptyNestedDialogState(),{type:"close",dialogId:"missing",at:-1,observedClosed:true}).reason,"dialog-time-invalid");
});

test("P20AG regression: native dialog does not need aria-modal true",()=>{
 const base={id:"native",kind:"native-dialog",open:true,role:null,ariaModal:null,nativeModal:true,topmost:true,
 accessibleName:"Example",describedBy:null,backgroundInert:true,activeFocusId:"inside",descendantIds:["native","inside"],
 focusableDescendantIds:["inside"],triggerId:"trigger",returnFocusId:null,closeButtonId:null,closeButtonName:null,dismissible:true,escapeClosed:null};
 assert.deepEqual(modalSemanticsFindings(base),[]);
});
test("P20AG regression: custom alertdialog role is accepted",()=>{
 const base={id:"custom",kind:"custom-dialog",open:true,role:"alertdialog",ariaModal:"true",nativeModal:false,topmost:true,
 accessibleName:"Alert",describedBy:null,backgroundInert:true,activeFocusId:"inside",descendantIds:["custom","inside"],
 focusableDescendantIds:["inside"],triggerId:"trigger",returnFocusId:null,closeButtonId:null,closeButtonName:null,dismissible:true,escapeClosed:null};
 assert.deepEqual(modalSemanticsFindings(base),[]);
});
test("P20AG regression: closed dialog can have no active focus descendant",()=>{
 const base={id:"custom",kind:"custom-dialog",open:false,role:"dialog",ariaModal:"true",nativeModal:false,topmost:false,
 accessibleName:"Alert",describedBy:null,backgroundInert:false,activeFocusId:null,descendantIds:["custom"],
 focusableDescendantIds:[],triggerId:"trigger",returnFocusId:"trigger",closeButtonId:null,closeButtonName:null,dismissible:true,escapeClosed:null};
 assert.equal(modalSemanticsFindings(base).length,0);
});
test("P20AG regression: a modal with no close button may still be dismissible by Escape",()=>{
 const base={id:"native",kind:"native-dialog",open:true,role:null,ariaModal:null,nativeModal:true,topmost:true,
 accessibleName:"Example",describedBy:null,backgroundInert:true,activeFocusId:"inside",descendantIds:["native","inside"],
 focusableDescendantIds:["inside"],triggerId:"trigger",returnFocusId:null,closeButtonId:null,closeButtonName:null,dismissible:true,escapeClosed:null};
 assert.deepEqual(modalSemanticsFindings(base),[]);
});
test("P20AG regression: focus audit permits custom policy without background inert requirement",()=>{
 const report=focusIssues(obs({backgroundInert:false}),{minimumTarget:44,requireDialogLabel:true,requireBackgroundInertForCustomModal:false,requireVisibleFocusIndicator:true,allowPositiveTabIndex:false,maximumNodes:500});
 assert.equal(report.some((x)=>x.code==="modal-background-not-inert"),false);
});
test("P20AG regression: focus audit permits positive tabindex only when policy opts in",()=>{
 const changed=obs({nodes:[n("inside","modal",{tabIndex:2})]});
 assert.equal(focusIssues(changed).some((x)=>x.code==="positive-tabindex"),true);
 assert.equal(focusIssues(changed,{minimumTarget:44,requireDialogLabel:true,requireBackgroundInertForCustomModal:true,requireVisibleFocusIndicator:true,allowPositiveTabIndex:true,maximumNodes:500}).some((x)=>x.code==="positive-tabindex"),false);
});
test("P20AG regression: focus audit respects a stricter 48 pixel target policy",()=>{
 const changed=obs({nodes:[n("inside","modal",{rect:{...rect,width:44}})]});
 assert.ok(focusIssues(changed,{minimumTarget:48,requireDialogLabel:true,requireBackgroundInertForCustomModal:true,requireVisibleFocusIndicator:true,allowPositiveTabIndex:false,maximumNodes:500}).some((x)=>x.code==="focus-target-small"));
});
test("P20AG regression: focus order excludes aria-hidden descendants",()=>{
 const changed=obs({nodes:[n("inside","modal"),n("hidden","modal",{ariaHidden:true})]});
 assert.equal(focusIssues(changed).some((x)=>x.code==="focus-target-small"&&x.target==="hidden"),false);
});
test("P20AG regression: nested modal parent may remain open while child owns focus",()=>{
 const stack=[
  {id:"parent",open:true,modal:true,parentId:null,activeId:null},
  {id:"child",open:true,modal:true,parentId:"parent",activeId:"child-action"},
 ];
 assert.equal(nestedDialogIssues({...emptyNestedDialogState(),stack:[],activeId:null}).length,0);
 assert.equal(stack[1].parentId,stack[0].id);
});
test("P20AG regression: closing the child retains the parent stack entry",()=>{
 let state=nestedDialogStep(emptyNestedDialogState(),{type:"open",dialog:{id:"parent",triggerId:"root-trigger",parentId:null,dismissible:true,openedAt:1},at:1}).state;
 state=nestedDialogStep(state,{type:"open",dialog:{id:"child",triggerId:"child-trigger",parentId:"parent",dismissible:true,openedAt:2},at:2}).state;
 state=nestedDialogStep(state,{type:"close",dialogId:"child",at:3,observedClosed:true}).state;
 assert.equal(state.stack.length,1);assert.equal(state.stack[0].id,"parent");
});
test("P20AG regression: nested dialog restoration can be replayed after child close",()=>{
 let state=nestedDialogStep(emptyNestedDialogState(),{type:"open",dialog:{id:"parent",triggerId:"root-trigger",parentId:null,dismissible:true,openedAt:1},at:1}).state;
 state=nestedDialogStep(state,{type:"open",dialog:{id:"child",triggerId:"child-trigger",parentId:"parent",dismissible:true,openedAt:2},at:2}).state;
 const closed=nestedDialogStep(state,{type:"close",dialogId:"child",at:3,observedClosed:true});
 assert.equal(closed.accepted,true);
});
test("P20AG regression: native dialog Escape success is not reported as an error",()=>{
 const base={id:"native",kind:"native-dialog",open:true,role:null,ariaModal:null,nativeModal:true,topmost:true,
 accessibleName:"Example",describedBy:null,backgroundInert:true,activeFocusId:"inside",descendantIds:["native","inside"],
 focusableDescendantIds:["inside"],triggerId:"trigger",returnFocusId:null,closeButtonId:null,closeButtonName:null,dismissible:true,escapeClosed:true};
 assert.deepEqual(modalSemanticsFindings(base),[]);
});
test("P20AG regression: custom modal without aria-modal is rejected even when background is inert",()=>{
 const base={id:"custom",kind:"custom-dialog",open:true,role:"dialog",ariaModal:null,nativeModal:false,topmost:true,
 accessibleName:"Example",describedBy:null,backgroundInert:true,activeFocusId:"inside",descendantIds:["custom","inside"],
 focusableDescendantIds:["inside"],triggerId:"trigger",returnFocusId:null,closeButtonId:null,closeButtonName:null,dismissible:true,escapeClosed:null};
 assert.ok(modalSemanticsFindings(base).some((x)=>x.code==="custom-dialog-aria-modal-missing"));
});
test("P20AG regression: modal stack marks closed historical dialogs as not topmost",()=>{
 const base={id:"native",kind:"native-dialog",open:false,role:null,ariaModal:null,nativeModal:false,topmost:false,
 accessibleName:"Example",describedBy:null,backgroundInert:false,activeFocusId:null,descendantIds:["native"],
 focusableDescendantIds:[],triggerId:"trigger",returnFocusId:"trigger",closeButtonId:null,closeButtonName:null,dismissible:true,escapeClosed:null};
 assert.deepEqual(modalStackFindings([base]),[]);
});
test("P20AG regression: disclosure Enter preserves focus while changing visibility",()=>{
 const result=disclosureKeyResult(group([item("one",0)]),{itemId:"one",key:"Enter",at:5,currentFocusId:"one",nextFocusId:"one",nextExpanded:true});
 assert.equal(result.focusId,"one");assert.deepEqual(result.expandedIds,["one"]);
});
test("P20AG regression: disclosure Space preserves focus while changing visibility",()=>{
 const result=disclosureKeyResult(group([item("one",0)]),{itemId:"one",key:"Space",at:5,currentFocusId:"one",nextFocusId:"one",nextExpanded:true});
 assert.equal(result.focusId,"one");assert.deepEqual(result.expandedIds,["one"]);
});
test("P20AG regression: non-exclusive group preserves two expanded panels after third opens",()=>{
 const result=disclosureKeyResult(group([item("one",0,{expanded:true,panelVisible:true}),item("two",1,{expanded:true,panelVisible:true}),item("three",2)]),
 {itemId:"three",key:"Enter",at:6,currentFocusId:"three",nextFocusId:"three",nextExpanded:true});
 assert.deepEqual(result.expandedIds,["one","two","three"]);
});
test("P20AG regression: vertical accordion ArrowUp wraps from first to last",()=>{
 const result=disclosureKeyResult(group([item("one",0),item("two",1),item("three",2)]),
 {itemId:"one",key:"ArrowUp",at:6,currentFocusId:"one",nextFocusId:"three",nextExpanded:null});
 assert.equal(result.focusId,"three");
});
test("P20AG regression: horizontal accordion ArrowRight wraps from last to first",()=>{
 const result=disclosureKeyResult(group([item("one",0),item("two",1)],{orientation:"horizontal"}),
 {itemId:"two",key:"ArrowRight",at:6,currentFocusId:"two",nextFocusId:"one",nextExpanded:null});
 assert.equal(result.focusId,"one");
});
test("P20AG regression: focus sequence records no activation for a navigation-only Tab",()=>{
 const report=focusSequenceFindings([{key:"Tab",fromId:"a",toId:"b",at:1,visible:true,enabled:true,insideScope:true,focusVisible:true,horizontalScroll:0,verticalScroll:0,activated:false}],
 {scopeId:"dialog",allowedIds:["a","b"],expectedTabOrder:["a","b"],modal:true,wrapForward:true,wrapBackward:true,maxHorizontalScroll:1});
 assert.equal(report.activations,0);
});
test("P20AG regression: focus sequence can audit non-modal focus movement",()=>{
 const report=focusSequenceFindings([{key:"Tab",fromId:"a",toId:"outside",at:1,visible:true,enabled:true,insideScope:false,focusVisible:true,horizontalScroll:0,verticalScroll:0,activated:false}],
 {scopeId:"page",allowedIds:["a","outside"],expectedTabOrder:["a","outside"],modal:false,wrapForward:false,wrapBackward:false,maxHorizontalScroll:1});
 assert.equal(report.issues.some((x)=>x.code==="focus-escaped-modal"),false);
});
test("P20AG regression: skip link target may be main landmark with tabindex minus one",()=>{
 assert.deepEqual(skipLinkFindings({href:"#main",targetId:"main",targetExists:true,targetVisible:true,targetFocusable:true,focusedId:"main",activationKey:"Enter"}),[]);
});
test("P20AG regression: keyboard activation report is empty for correctly activated summary",()=>{
 assert.deepEqual(keyboardActivationFindings({role:"summary",key:"Enter",enabled:true,defaultPrevented:false,activated:true}),[]);
});
test("P20AG regression: keyboard activation report allows a disabled control to remain inactive",()=>{
 assert.deepEqual(keyboardActivationFindings({role:"button",key:"Enter",enabled:false,defaultPrevented:false,activated:false}),[]);
});
