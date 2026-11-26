import test from "node:test";
import assert from "node:assert/strict";
import { modalSemanticsFindings, modalStackFindings, modalSummary } from "./p20ag-modal-semantics.ts";
const modal=(patch={})=>({id:"modal",kind:"native-dialog",open:true,role:null,ariaModal:null,nativeModal:true,topmost:true,
 accessibleName:"Example dialog",describedBy:"description",backgroundInert:true,activeFocusId:"field",
 descendantIds:["modal","description","field","close"],focusableDescendantIds:["field","close"],
 triggerId:"open",returnFocusId:null,closeButtonId:"close",closeButtonName:"Close",dismissible:true,escapeClosed:null,...patch});
const codes=(items)=>items.map((item)=>item.code);
test("P20AG native modal semantics accept a labelled modal dialog",()=>assert.deepEqual(modalSemanticsFindings(modal()),[]));
test("P20AG native modal semantics reject empty id",()=>assert.ok(codes(modalSemanticsFindings(modal({id:""}))).includes("modal-id-empty")));
test("P20AG native modal semantics reject native dialog not opened modally",()=>assert.ok(codes(modalSemanticsFindings(modal({nativeModal:false}))).includes("native-dialog-not-modal")));
test("P20AG native modal semantics reject aria-modal false",()=>assert.ok(codes(modalSemanticsFindings(modal({ariaModal:"false"}))).includes("native-dialog-aria-modal-false")));
test("P20AG native modal semantics reject missing accessible name",()=>assert.ok(codes(modalSemanticsFindings(modal({accessibleName:" "}))).includes("modal-name-missing")));
test("P20AG native modal semantics review missing description target",()=>assert.ok(modalSemanticsFindings(modal({describedBy:"missing"})).some((x)=>x.code==="modal-description-target-missing"&&x.severity==="review")));
test("P20AG native modal semantics reject focus outside dialog",()=>assert.ok(codes(modalSemanticsFindings(modal({activeFocusId:"background"}))).includes("modal-focus-outside")));
test("P20AG native modal semantics reject no focusable descendants",()=>assert.ok(codes(modalSemanticsFindings(modal({focusableDescendantIds:[]}))).includes("modal-no-focusable-descendants")));
test("P20AG native modal semantics review non-topmost open dialog",()=>assert.ok(modalSemanticsFindings(modal({topmost:false})).some((x)=>x.code==="modal-not-topmost"&&x.severity==="review")));
test("P20AG native modal semantics review missing trigger",()=>assert.ok(modalSemanticsFindings(modal({triggerId:null})).some((x)=>x.code==="modal-trigger-unrecorded"&&x.severity==="review")));
test("P20AG native modal semantics reject wrong return focus target",()=>assert.ok(codes(modalSemanticsFindings(modal({open:false,returnFocusId:"other"}))).includes("modal-return-focus-mismatch")));
test("P20AG native modal semantics reject unnamed close button",()=>assert.ok(codes(modalSemanticsFindings(modal({closeButtonName:" "}))).includes("modal-close-name-missing")));
test("P20AG native modal semantics reject undismissible modal closed by Escape",()=>assert.ok(codes(modalSemanticsFindings(modal({dismissible:false,escapeClosed:true}))).includes("modal-undismissible-escaped")));
test("P20AG native modal semantics review Escape failure for dismissible dialog",()=>assert.ok(modalSemanticsFindings(modal({dismissible:true,escapeClosed:false})).some((x)=>x.code==="modal-escape-not-handled"&&x.severity==="review")));
test("P20AG custom modal semantics require role dialog",()=>assert.ok(codes(modalSemanticsFindings(modal({kind:"custom-dialog",role:null,ariaModal:"true"}))).includes("custom-dialog-role-missing")));
test("P20AG custom modal semantics accept role and aria-modal true with inert background",()=>assert.equal(modalSemanticsFindings(modal({kind:"custom-dialog",role:"dialog",ariaModal:"true"})).length,0));
test("P20AG custom modal semantics require aria-modal true",()=>assert.ok(codes(modalSemanticsFindings(modal({kind:"custom-dialog",role:"dialog",ariaModal:null}))).includes("custom-dialog-aria-modal-missing")));
test("P20AG custom modal semantics require inert background",()=>assert.ok(codes(modalSemanticsFindings(modal({kind:"custom-dialog",role:"dialog",ariaModal:"true",backgroundInert:false}))).includes("custom-dialog-background-active")));
test("P20AG nonmodal dialog cannot claim aria-modal true",()=>assert.ok(codes(modalSemanticsFindings(modal({kind:"non-modal-dialog",open:false,ariaModal:"true"}))).includes("nonmodal-aria-modal-true")));
test("P20AG modal stack accepts one topmost dialog",()=>assert.deepEqual(modalStackFindings([modal()]),[]));
test("P20AG modal stack rejects duplicate ids",()=>assert.ok(modalStackFindings([modal(),modal()]).some((x)=>x.code==="modal-stack-duplicate-id")));
test("P20AG modal stack requires only final open dialog topmost",()=>{
 const issues=modalStackFindings([modal({id:"one",topmost:true}),modal({id:"two",topmost:true})]);
 assert.ok(issues.some((x)=>x.code==="modal-stack-topmost-mismatch"&&x.target==="one"));
});
test("P20AG modal stack allows parent covered by child",()=>{
 const issues=modalStackFindings([modal({id:"one",topmost:false}),modal({id:"two",topmost:true})]);
 assert.deepEqual(issues,[]);
});
test("P20AG modal summary reports focusable count",()=>assert.match(modalSummary(modal()),/Focusable descendants: 2/));
test("P20AG modal summary reports kind",()=>assert.match(modalSummary(modal({kind:"custom-dialog"})),/Kind: custom-dialog/));
