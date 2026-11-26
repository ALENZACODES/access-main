import test from "node:test";
import assert from "node:assert/strict";
import { disclosureItemIssues, disclosureGroupIssues, disclosureKeyResult, disclosureSummary } from "./p20ag-disclosure-keyboard.ts";
const item=(id,order,patch={})=>({id,name:`${id} details`,expanded:false,panelId:`${id}-panel`,panelVisible:false,
 disabled:false,focusable:true,domOrder:order,panelLabelledBy:id,panelRegion:true,...patch});
const group=(items,patch={})=>({id:"faq",items,exclusive:false,orientation:"vertical",...patch});
test("P20AG disclosure item accepts matching collapsed state",()=>assert.deepEqual(disclosureItemIssues(item("one",0)),[]));
test("P20AG disclosure item accepts matching expanded state",()=>assert.deepEqual(disclosureItemIssues(item("one",0,{expanded:true,panelVisible:true})),[]));
test("P20AG disclosure item rejects empty identifier",()=>assert.ok(disclosureItemIssues(item("",0)).some((x)=>x.code==="disclosure-id-empty")));
test("P20AG disclosure item rejects empty accessible name",()=>assert.ok(disclosureItemIssues(item("one",0,{name:" "})).some((x)=>x.code==="disclosure-name-empty")));
test("P20AG disclosure item rejects missing panel id",()=>assert.ok(disclosureItemIssues(item("one",0,{panelId:null})).some((x)=>x.code==="disclosure-panel-id-missing")));
test("P20AG disclosure item rejects label target mismatch",()=>assert.ok(disclosureItemIssues(item("one",0,{panelLabelledBy:"other"})).some((x)=>x.code==="disclosure-panel-label-mismatch")));
test("P20AG disclosure item rejects expanded visibility mismatch",()=>assert.ok(disclosureItemIssues(item("one",0,{expanded:true})).some((x)=>x.code==="disclosure-visibility-mismatch")));
test("P20AG disclosure item rejects enabled non-focusable control",()=>assert.ok(disclosureItemIssues(item("one",0,{focusable:false})).some((x)=>x.code==="disclosure-control-not-focusable")));
test("P20AG disclosure item rejects hidden expanded region",()=>assert.ok(disclosureItemIssues(item("one",0,{expanded:true,panelVisible:false})).some((x)=>x.code==="disclosure-hidden-region-expanded")));
test("P20AG disclosure group accepts unique collapsed items",()=>assert.deepEqual(disclosureGroupIssues(group([item("one",0),item("two",1)])),[]));
test("P20AG disclosure group detects duplicate identifiers",()=>assert.ok(disclosureGroupIssues(group([item("one",0),item("one",1)])).some((x)=>x.code==="disclosure-id-duplicate")));
test("P20AG exclusive disclosure group allows one expanded item",()=>assert.equal(disclosureGroupIssues(group([item("one",0,{expanded:true,panelVisible:true}),item("two",1)],{exclusive:true})).length,0));
test("P20AG exclusive disclosure group rejects multiple expanded items",()=>assert.ok(disclosureGroupIssues(group([item("one",0,{expanded:true,panelVisible:true}),item("two",1,{expanded:true,panelVisible:true})],{exclusive:true})).some((x)=>x.code==="disclosure-exclusive-multiple-open")));
test("P20AG disclosure group reviews duplicate DOM order",()=>assert.ok(disclosureGroupIssues(group([item("one",0),item("two",0)])).some((x)=>x.code==="disclosure-dom-order-duplicate")));
test("P20AG Enter toggles collapsed disclosure open",()=>{
 const result=disclosureKeyResult(group([item("one",0)]),{itemId:"one",key:"Enter",at:1,currentFocusId:"one",nextFocusId:"one",nextExpanded:null});
 assert.deepEqual(result.expandedIds,["one"]);assert.equal(result.focusId,"one");assert.equal(result.accepted,true);
});
test("P20AG Space toggles collapsed disclosure open",()=>{
 const result=disclosureKeyResult(group([item("one",0)]),{itemId:"one",key:"Space",at:1,currentFocusId:"one",nextFocusId:"one",nextExpanded:null});
 assert.deepEqual(result.expandedIds,["one"]);
});
test("P20AG Enter closes expanded disclosure",()=>{
 const result=disclosureKeyResult(group([item("one",0,{expanded:true,panelVisible:true})]),{itemId:"one",key:"Enter",at:1,currentFocusId:"one",nextFocusId:"one",nextExpanded:null});
 assert.deepEqual(result.expandedIds,[]);
});
test("P20AG explicit expanded state is respected",()=>{
 const result=disclosureKeyResult(group([item("one",0)]),{itemId:"one",key:"Enter",at:1,currentFocusId:"one",nextFocusId:"one",nextExpanded:false});
 assert.deepEqual(result.expandedIds,[]);
});
test("P20AG exclusive accordion closes sibling when opening another",()=>{
 const result=disclosureKeyResult(group([item("one",0,{expanded:true,panelVisible:true}),item("two",1)],{exclusive:true}),
  {itemId:"two",key:"Enter",at:2,currentFocusId:"two",nextFocusId:"two",nextExpanded:true});
 assert.deepEqual(result.expandedIds,["two"]);
});
test("P20AG non-exclusive disclosure keeps other expanded siblings",()=>{
 const result=disclosureKeyResult(group([item("one",0,{expanded:true,panelVisible:true}),item("two",1)]),
  {itemId:"two",key:"Enter",at:2,currentFocusId:"two",nextFocusId:"two",nextExpanded:true});
 assert.deepEqual(result.expandedIds,["one","two"]);
});
test("P20AG disclosure rejects missing item",()=>assert.equal(disclosureKeyResult(group([]),{itemId:"one",key:"Enter",at:1,currentFocusId:"one",nextFocusId:"one",nextExpanded:true}).reason,"disclosure-item-missing"));
test("P20AG disclosure rejects negative time",()=>assert.equal(disclosureKeyResult(group([item("one",0)]),{itemId:"one",key:"Enter",at:-1,currentFocusId:"one",nextFocusId:"one",nextExpanded:true}).reason,"disclosure-time-invalid"));
test("P20AG disclosure rejects focus mismatch",()=>assert.equal(disclosureKeyResult(group([item("one",0)]),{itemId:"one",key:"Enter",at:1,currentFocusId:"other",nextFocusId:"one",nextExpanded:true}).reason,"disclosure-focus-mismatch"));
test("P20AG disclosure rejects disabled control",()=>assert.equal(disclosureKeyResult(group([item("one",0,{disabled:true})]),{itemId:"one",key:"Enter",at:1,currentFocusId:"one",nextFocusId:"one",nextExpanded:true}).reason,"disclosure-control-unavailable"));
test("P20AG vertical accordion ArrowDown moves to next control",()=>{
 const result=disclosureKeyResult(group([item("one",0),item("two",1)]),{itemId:"one",key:"ArrowDown",at:1,currentFocusId:"one",nextFocusId:"two",nextExpanded:null});
 assert.equal(result.focusId,"two");
});
test("P20AG vertical accordion ArrowUp wraps to previous control",()=>{
 const result=disclosureKeyResult(group([item("one",0),item("two",1)]),{itemId:"one",key:"ArrowUp",at:1,currentFocusId:"one",nextFocusId:"two",nextExpanded:null});
 assert.equal(result.focusId,"two");
});
test("P20AG horizontal accordion ArrowRight moves to next control",()=>{
 const result=disclosureKeyResult(group([item("one",0),item("two",1)],{orientation:"horizontal"}),{itemId:"one",key:"ArrowRight",at:1,currentFocusId:"one",nextFocusId:"two",nextExpanded:null});
 assert.equal(result.focusId,"two");
});
test("P20AG horizontal accordion ArrowLeft moves to previous control",()=>{
 const result=disclosureKeyResult(group([item("one",0),item("two",1)],{orientation:"horizontal"}),{itemId:"two",key:"ArrowLeft",at:1,currentFocusId:"two",nextFocusId:"one",nextExpanded:null});
 assert.equal(result.focusId,"one");
});
test("P20AG arrow key rejects incorrect destination",()=>{
 const result=disclosureKeyResult(group([item("one",0),item("two",1)]),{itemId:"one",key:"ArrowDown",at:1,currentFocusId:"one",nextFocusId:"one",nextExpanded:null});
 assert.equal(result.reason,"disclosure-arrow-order-invalid");
});
test("P20AG Home moves focus to first disclosure",()=>{
 const result=disclosureKeyResult(group([item("one",0),item("two",1)]),{itemId:"two",key:"Home",at:1,currentFocusId:"two",nextFocusId:"one",nextExpanded:null});
 assert.equal(result.focusId,"one");
});
test("P20AG End moves focus to last disclosure",()=>{
 const result=disclosureKeyResult(group([item("one",0),item("two",1)]),{itemId:"one",key:"End",at:1,currentFocusId:"one",nextFocusId:"two",nextExpanded:null});
 assert.equal(result.focusId,"two");
});
test("P20AG disclosure summary reports item count",()=>assert.match(disclosureSummary(group([item("one",0),item("two",1)])),/Items: 2/));
test("P20AG disclosure summary reports expanded count",()=>assert.match(disclosureSummary(group([item("one",0,{expanded:true,panelVisible:true})])),/Expanded: 1/));
