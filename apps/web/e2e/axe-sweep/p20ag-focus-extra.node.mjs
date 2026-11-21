import test from "node:test";
import assert from "node:assert/strict";
import { dialogTabOrder, nextFocusId, focusSummary, focusIssues, disclosureIssues } from "./p20ag-focus-contracts.ts";
import { focusSequenceFindings, keyboardActivationFindings, skipLinkFindings } from "./p20ag-keyboard-sequences.ts";
import { modalSemanticsFindings } from "./p20ag-modal-semantics.ts";

const rect={left:0,top:0,right:48,bottom:48,width:48,height:48};
const node=(id,domOrder,patch={})=>({id,role:"button",name:id,domOrder,tabIndex:0,visible:true,enabled:true,inert:false,ariaHidden:false,
 focusable:true,rect,scopeId:"dlg",outlineStyle:"solid",outlineWidth:2,outlineOffset:2,boxShadow:"none",...patch});
const dialog={id:"dlg",open:true,modal:true,dismissible:true,labelledBy:"title",describedBy:null,activeId:"a",triggerId:"trigger",parentDialogId:null,
 nodes:[node("trigger",0,{scopeId:null}),node("dlg",1,{role:"dialog",tabIndex:-1}),node("title",2,{role:"heading",focusable:false,tabIndex:-1}),node("a",3),node("b",4)],backgroundInert:true};
test("P20AG extra: dialog tab order is stable on repeated reads",()=>assert.deepEqual(dialogTabOrder(dialog).map((x)=>x.id),dialogTabOrder(dialog).map((x)=>x.id)));
test("P20AG extra: dialog tab order excludes the trigger",()=>assert.equal(dialogTabOrder(dialog).some((x)=>x.id==="trigger"),false));
test("P20AG extra: focus next wraps consistently",()=>assert.equal(nextFocusId(dialogTabOrder(dialog),"b"),"a"));
test("P20AG extra: focus previous wraps consistently",()=>assert.equal(nextFocusId(dialogTabOrder(dialog),"a",true),"b"));
test("P20AG extra: focus summary keeps modal state",()=>assert.equal(focusSummary(dialog).modal,true));
test("P20AG extra: focus summary keeps open state",()=>assert.equal(focusSummary(dialog).open,true));
test("P20AG extra: focus summary counts two tabbables",()=>assert.equal(focusSummary(dialog).tabbable,2));
test("P20AG extra: focus audit ignores description when absent",()=>assert.equal(focusIssues(dialog).some((x)=>x.code==="dialog-description-target-missing"),false));
test("P20AG extra: focus audit accepts visible 48px target",()=>assert.equal(focusIssues(dialog).some((x)=>x.code==="focus-target-small"),false));
test("P20AG extra: disclosure accepts matching aria relationship",()=>assert.deepEqual(disclosureIssues({id:"one",expanded:false,panelVisible:false,controlsId:"panel",panelId:"panel",summaryFocusable:true,summaryName:"More"}),[]));
test("P20AG extra: disclosure mismatch is not a review but a blocking error",()=>assert.equal(disclosureIssues({id:"one",expanded:true,panelVisible:false,controlsId:"panel",panelId:"panel",summaryFocusable:true,summaryName:"More"})[0].severity,"error"));

test("P20AG extra: focus sequence accepts Shift Tab reverse move",()=>{
 const result=focusSequenceFindings([{key:"Shift+Tab",fromId:"b",toId:"a",at:1,visible:true,enabled:true,insideScope:true,focusVisible:true,horizontalScroll:0,verticalScroll:0,activated:false}],
 {scopeId:"dlg",allowedIds:["a","b"],expectedTabOrder:["a","b"],modal:true,wrapForward:true,wrapBackward:true,maxHorizontalScroll:1});
 assert.equal(result.clean,true);
});
test("P20AG extra: focus sequence accepts Enter activation",()=>{
 const result=focusSequenceFindings([{key:"Enter",fromId:"a",toId:"a",at:1,visible:true,enabled:true,insideScope:true,focusVisible:true,horizontalScroll:0,verticalScroll:0,activated:true}],
 {scopeId:"page",allowedIds:["a"],expectedTabOrder:["a"],modal:false,wrapForward:false,wrapBackward:false,maxHorizontalScroll:1});
 assert.equal(result.activations,1);
});
test("P20AG extra: focus sequence accepts Space activation",()=>{
 const result=focusSequenceFindings([{key:"Space",fromId:"a",toId:"a",at:1,visible:true,enabled:true,insideScope:true,focusVisible:true,horizontalScroll:0,verticalScroll:0,activated:true}],
 {scopeId:"page",allowedIds:["a"],expectedTabOrder:["a"],modal:false,wrapForward:false,wrapBackward:false,maxHorizontalScroll:1});
 assert.equal(result.activations,1);
});
test("P20AG extra: focus sequence does not count failed activation",()=>{
 const result=focusSequenceFindings([{key:"Enter",fromId:"a",toId:"a",at:1,visible:true,enabled:true,insideScope:true,focusVisible:true,horizontalScroll:0,verticalScroll:0,activated:false}],
 {scopeId:"page",allowedIds:["a"],expectedTabOrder:["a"],modal:false,wrapForward:false,wrapBackward:false,maxHorizontalScroll:1});
 assert.equal(result.activations,0);
});
test("P20AG extra: focus sequence uses exact allowed id membership",()=>{
 const result=focusSequenceFindings([{key:"Tab",fromId:"a",toId:"A",at:1,visible:true,enabled:true,insideScope:true,focusVisible:true,horizontalScroll:0,verticalScroll:0,activated:false}],
 {scopeId:"page",allowedIds:["a","b"],expectedTabOrder:["a","b"],modal:false,wrapForward:false,wrapBackward:false,maxHorizontalScroll:1});
 assert.ok(result.issues.some((x)=>x.code==="focus-destination-unexpected"));
});
test("P20AG extra: skip link reports destination id absent",()=>{
 assert.ok(skipLinkFindings({href:"#main",targetId:"main",targetExists:false,targetVisible:true,targetFocusable:true,focusedId:"main",activationKey:"Enter"}).some((x)=>x.code==="skip-link-target-missing"));
});
test("P20AG extra: skip link reports invisible target",()=>{
 assert.ok(skipLinkFindings({href:"#main",targetId:"main",targetExists:true,targetVisible:false,targetFocusable:true,focusedId:"main",activationKey:"Enter"}).some((x)=>x.code==="skip-link-target-hidden"));
});
test("P20AG extra: skip link reports non-focusable target",()=>{
 assert.ok(skipLinkFindings({href:"#main",targetId:"main",targetExists:true,targetVisible:true,targetFocusable:false,focusedId:"main",activationKey:"Enter"}).some((x)=>x.code==="skip-link-target-not-focusable"));
});
test("P20AG extra: skip link reports wrong focus destination",()=>{
 assert.ok(skipLinkFindings({href:"#main",targetId:"main",targetExists:true,targetVisible:true,targetFocusable:true,focusedId:"body",activationKey:"Enter"}).some((x)=>x.code==="skip-link-focus-not-moved"));
});
test("P20AG extra: button Enter default is expected",()=>assert.deepEqual(keyboardActivationFindings({role:"button",key:"Enter",enabled:true,defaultPrevented:false,activated:true}),[]));
test("P20AG extra: button Space default is expected",()=>assert.deepEqual(keyboardActivationFindings({role:"button",key:"Space",enabled:true,defaultPrevented:false,activated:true}),[]));
test("P20AG extra: link Enter default is expected",()=>assert.deepEqual(keyboardActivationFindings({role:"link",key:"Enter",enabled:true,defaultPrevented:false,activated:true}),[]));
test("P20AG extra: link Space default is not expected",()=>assert.ok(keyboardActivationFindings({role:"link",key:"Space",enabled:true,defaultPrevented:false,activated:true}).length>0));
test("P20AG extra: disabled radio remains inactive",()=>assert.deepEqual(keyboardActivationFindings({role:"radio",key:"Space",enabled:false,defaultPrevented:false,activated:false}),[]));
test("P20AG extra: disabled radio activation is blocked",()=>assert.ok(keyboardActivationFindings({role:"radio",key:"Space",enabled:false,defaultPrevented:false,activated:true}).length>0));
test("P20AG extra: textbox Enter is not assumed to activate a button",()=>assert.equal(keyboardActivationFindings({role:"textbox",key:"Enter",enabled:true,defaultPrevented:false,activated:false}).length,0));
test("P20AG extra: textbox Space is not assumed to activate",()=>assert.equal(keyboardActivationFindings({role:"textbox",key:"Space",enabled:true,defaultPrevented:false,activated:false}).length,0));

test("P20AG extra: native dialog accepts no aria-modal attribute",()=>{
 const item={id:"native",kind:"native-dialog",open:true,role:null,ariaModal:null,nativeModal:true,topmost:true,accessibleName:"Dialog",
 describedBy:null,backgroundInert:true,activeFocusId:"field",descendantIds:["native","field"],focusableDescendantIds:["field"],
 triggerId:"open",returnFocusId:null,closeButtonId:null,closeButtonName:null,dismissible:true,escapeClosed:null};
 assert.deepEqual(modalSemanticsFindings(item),[]);
});
test("P20AG extra: custom dialog requires explicit role",()=>{
 const item={id:"custom",kind:"custom-dialog",open:true,role:null,ariaModal:"true",nativeModal:false,topmost:true,accessibleName:"Dialog",
 describedBy:null,backgroundInert:true,activeFocusId:"field",descendantIds:["custom","field"],focusableDescendantIds:["field"],
 triggerId:"open",returnFocusId:null,closeButtonId:null,closeButtonName:null,dismissible:true,escapeClosed:null};
 assert.ok(modalSemanticsFindings(item).some((x)=>x.code==="custom-dialog-role-missing"));
});
test("P20AG extra: custom dialog needs background inertness",()=>{
 const item={id:"custom",kind:"custom-dialog",open:true,role:"dialog",ariaModal:"true",nativeModal:false,topmost:true,accessibleName:"Dialog",
 describedBy:null,backgroundInert:false,activeFocusId:"field",descendantIds:["custom","field"],focusableDescendantIds:["field"],
 triggerId:"open",returnFocusId:null,closeButtonId:null,closeButtonName:null,dismissible:true,escapeClosed:null};
 assert.ok(modalSemanticsFindings(item).some((x)=>x.code==="custom-dialog-background-active"));
});
test("P20AG extra: modal focus must remain inside descendant list",()=>{
 const item={id:"custom",kind:"custom-dialog",open:true,role:"dialog",ariaModal:"true",nativeModal:false,topmost:true,accessibleName:"Dialog",
 describedBy:null,backgroundInert:true,activeFocusId:"outside",descendantIds:["custom","field"],focusableDescendantIds:["field"],
 triggerId:"open",returnFocusId:null,closeButtonId:null,closeButtonName:null,dismissible:true,escapeClosed:null};
 assert.ok(modalSemanticsFindings(item).some((x)=>x.code==="modal-focus-outside"));
});
