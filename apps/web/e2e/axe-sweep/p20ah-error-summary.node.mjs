import test from "node:test";
import assert from "node:assert/strict";
import { validateForm } from "./p20ah-form-validation.ts";
import {
 fieldAccessibilityIssues, summaryItems, buildErrorSummary, summaryIssues, focusHandoffIssues,
 emptyAnnouncementState, announce, announcementIssues, fieldDescribedBy, fieldAriaState,
 summaryLinkTarget, errorTextId, descriptionTextId,
} from "./p20ah-error-summary.ts";
const field=(id,patch={})=>({id,name:id,label:{en:`Label ${id}`,fr:`Étiquette ${id}`},
 description:{en:`Description ${id}`,fr:`Description ${id}`},kind:"text",value:"",order:0,disabled:false,hidden:false,
 required:false,rules:{},...patch});
const form=(fields)=>({id:"signup",locale:"en",fields,groups:[],maximumFields:100});
const codes=(items)=>items.map((item)=>item.code);
const observation=(item,patch={})=>({
 fieldId:item.id,labelText:item.label.en,labelFor:item.id,inputId:item.id,role:"textbox",
 ariaInvalid:null,describedBy:[`${item.id}-description`],descriptions:[{id:`${item.id}-description`,exists:true,text:"Description"}],
 required:item.required,disabled:item.disabled,hidden:item.hidden,errorText:null,errorId:null,errorRole:null,errorLive:null,
 accessibleName:item.label.en,...patch,
});
test("P20AH summary items are empty for a valid form",()=>{
 const fields=[field("name",{value:"Ada"})],result=validateForm(form(fields));
 assert.deepEqual(summaryItems(result,fields,"en"),[]);
});
test("P20AH summary item includes required field",()=>{
 const fields=[field("name",{required:true})],result=validateForm(form(fields));
 assert.equal(summaryItems(result,fields,"en")[0]?.fieldId,"name");
});
test("P20AH summary items follow form order",()=>{
 const fields=[field("later",{required:true,order:2}),field("first",{required:true,order:1})];
 const items=summaryItems(validateForm(form(fields)),fields,"en");
 assert.deepEqual(items.map((item)=>item.fieldId),["first","later"]);
});
test("P20AH summary uses selected locale for labels",()=>{
 const fields=[field("name",{required:true})];
 assert.equal(summaryItems(validateForm(form(fields)),fields,"fr")[0]?.label,"Étiquette name");
});
test("P20AH error summary count matches field errors",()=>{
 const fields=[field("a",{required:true}),field("b",{required:true})];
 assert.equal(buildErrorSummary({id:"summary",result:validateForm(form(fields)),fields,locale:"en"}).errorCount,2);
});
test("P20AH error summary starts with first invalid field",()=>{
 const fields=[field("a",{required:true,order:1}),field("b",{required:true,order:2})];
 assert.equal(buildErrorSummary({id:"summary",result:validateForm(form(fields)),fields,locale:"en"}).firstTargetId,"a");
});
test("P20AH French error summary heading is French",()=>{
 const fields=[field("a",{required:true})];
 assert.equal(buildErrorSummary({id:"summary",result:validateForm(form(fields)),fields,locale:"fr"}).heading,"Il y a des éléments à corriger");
});
test("P20AH English error summary uses alert role by default",()=>{
 const fields=[field("a",{required:true})];
 assert.equal(buildErrorSummary({id:"summary",result:validateForm(form(fields)),fields,locale:"en"}).role,"alert");
});
test("P20AH error summary can be a region with polite live state",()=>{
 const fields=[field("a",{required:true})];
 const summary=buildErrorSummary({id:"summary",result:validateForm(form(fields)),fields,locale:"en",role:"region",ariaLive:"polite"});
 assert.equal(summary.role,"region");assert.equal(summary.ariaLive,"polite");
});
test("P20AH summary issues accept generated summary",()=>{
 const fields=[field("a",{required:true})];
 const summary=buildErrorSummary({id:"summary",result:validateForm(form(fields)),fields,locale:"en"});
 assert.deepEqual(summaryIssues(summary,fields),[]);
});
test("P20AH summary issues detect missing field target",()=>{
 const fields=[field("a",{required:true})];
 const summary=buildErrorSummary({id:"summary",result:validateForm(form(fields)),fields,locale:"en"});
 const changed={...summary,items:[{...summary.items[0],fieldId:"missing",targetId:"missing"}]};
 assert.ok(codes(summaryIssues(changed,fields)).includes("summary-target-missing"));
});
test("P20AH summary issues detect duplicate target",()=>{
 const fields=[field("a",{required:true}),field("b",{required:true})];
 const summary=buildErrorSummary({id:"summary",result:validateForm(form(fields)),fields,locale:"en"});
 const changed={...summary,items:[summary.items[0],{...summary.items[0],order:2}]};
 assert.ok(codes(summaryIssues(changed,fields)).includes("summary-target-duplicate"));
});
test("P20AH summary issues detect count mismatch",()=>{
 const fields=[field("a",{required:true})];
 const summary=buildErrorSummary({id:"summary",result:validateForm(form(fields)),fields,locale:"en"});
 assert.ok(codes(summaryIssues({...summary,errorCount:7},fields)).includes("error-count-mismatch"));
});
test("P20AH summary issues detect reversed form order",()=>{
 const fields=[field("a",{required:true,order:1}),field("b",{required:true,order:2})];
 const summary=buildErrorSummary({id:"summary",result:validateForm(form(fields)),fields,locale:"en"});
 const reversed={...summary,items:[...summary.items].reverse()};
 assert.ok(codes(summaryIssues(reversed,fields)).includes("field-order-mismatch"));
});
test("P20AH summary issues detect empty first target",()=>{
 const fields=[field("a",{required:true})];
 const summary=buildErrorSummary({id:"summary",result:validateForm(form(fields)),fields,locale:"en"});
 assert.ok(codes(summaryIssues({...summary,firstTargetId:null},fields)).includes("focus-target-missing"));
});
test("P20AH summary issues require visible heading and intro",()=>{
 const fields=[field("a",{required:true})];
 const summary=buildErrorSummary({id:"summary",result:validateForm(form(fields)),fields,locale:"en"});
 assert.ok(codes(summaryIssues({...summary,heading:" "},fields)).includes("missing-label"));
});
test("P20AH summary issues flag unannounced error list",()=>{
 const fields=[field("a",{required:true})];
 const summary=buildErrorSummary({id:"summary",result:validateForm(form(fields)),fields,locale:"en",ariaLive:"off"});
 assert.ok(codes(summaryIssues(summary,fields)).includes("announcement-empty"));
});
test("P20AH focus handoff accepts first error focus",()=>{
 assert.deepEqual(focusHandoffIssues({expectedId:"summary",observedId:"summary",moved:true,targetExists:true,targetFocusable:true,at:1},"en"),[]);
});
test("P20AH focus handoff rejects missing summary",()=>{
 assert.ok(codes(focusHandoffIssues({expectedId:null,observedId:null,moved:false,targetExists:false,targetFocusable:false,at:1},"en")).includes("focus-target-missing"));
});
test("P20AH focus handoff rejects nonfocusable summary",()=>{
 assert.ok(codes(focusHandoffIssues({expectedId:"summary",observedId:null,moved:false,targetExists:true,targetFocusable:false,at:1},"en")).includes("focus-target-missing"));
});
test("P20AH focus handoff rejects focus not moved",()=>{
 assert.ok(codes(focusHandoffIssues({expectedId:"summary",observedId:"heading",moved:false,targetExists:true,targetFocusable:true,at:1},"en")).includes("focus-not-moved"));
});
test("P20AH focus handoff rejects a different observed focus target",()=>{
 assert.ok(codes(focusHandoffIssues({expectedId:"summary",observedId:"other",moved:true,targetExists:true,targetFocusable:true,at:1},"en")).includes("focus-not-moved"));
});
test("P20AH focus handoff rejects invalid time",()=>{
 assert.ok(codes(focusHandoffIssues({expectedId:"summary",observedId:"summary",moved:true,targetExists:true,targetFocusable:true,at:-1},"en")).includes("invalid-state"));
});
test("P20AH announcement state begins empty",()=>{
 assert.deepEqual(emptyAnnouncementState(),{lastId:null,lastText:null,lastAt:null,count:0,history:[]});
});
test("P20AH announcement accepts nonempty message",()=>{
 const result=announce(emptyAnnouncementState(),{id:"status-1",text:"Two fields need attention.",locale:"en",politeness:"assertive",at:1});
 assert.equal(result.accepted,true);assert.equal(result.state.count,1);
});
test("P20AH announcement rejects empty text",()=>{
 const result=announce(emptyAnnouncementState(),{id:"status",text:" ",locale:"en",politeness:"polite",at:1});
 assert.equal(result.reason,"announcement.text.empty");
});
test("P20AH announcement rejects unsafe id",()=>{
 const result=announce(emptyAnnouncementState(),{id:"bad id",text:"Message",locale:"en",politeness:"polite",at:1});
 assert.equal(result.reason,"announcement.id.invalid");
});
test("P20AH announcement rejects invalid time",()=>{
 const result=announce(emptyAnnouncementState(),{id:"status",text:"Message",locale:"en",politeness:"polite",at:-1});
 assert.equal(result.reason,"announcement.time.invalid");
});
test("P20AH announcement rejects time reversal",()=>{
 const first=announce(emptyAnnouncementState(),{id:"one",text:"One",locale:"en",politeness:"polite",at:5}).state;
 assert.equal(announce(first,{id:"two",text:"Two",locale:"en",politeness:"polite",at:4}).reason,"announcement.time.reversed");
});
test("P20AH announcement rejects consecutive duplicate message",()=>{
 const first=announce(emptyAnnouncementState(),{id:"one",text:"Same",locale:"en",politeness:"polite",at:1}).state;
 assert.equal(announce(first,{id:"one",text:"Same",locale:"en",politeness:"polite",at:2}).reason,"announcement.duplicate");
});
test("P20AH announcement accepts same text with a new id",()=>{
 const first=announce(emptyAnnouncementState(),{id:"one",text:"Same",locale:"en",politeness:"polite",at:1}).state;
 assert.equal(announce(first,{id:"two",text:"Same",locale:"en",politeness:"polite",at:2}).accepted,true);
});
test("P20AH announcement history is bounded",()=>{
 let state=emptyAnnouncementState();
 for(let index=0;index<40;index++)state=announce(state,{id:`status-${index}`,text:`Message ${index}`,locale:"en",politeness:"polite",at:index}).state;
 assert.equal(state.history.length,30);assert.equal(state.count,40);
});
test("P20AH announcement audit accepts empty state and zero expected",()=>{
 assert.deepEqual(announcementIssues(emptyAnnouncementState(),0),[]);
});
test("P20AH announcement audit detects count mismatch",()=>{
 assert.ok(codes(announcementIssues(emptyAnnouncementState(),1)).includes("error-count-mismatch"));
});
test("P20AH described-by includes description only",()=>{
 assert.deepEqual(fieldDescribedBy("description",null,false),["description"]);
});
test("P20AH described-by includes error only when active",()=>{
 assert.deepEqual(fieldDescribedBy(null,"error",true),["error"]);
});
test("P20AH described-by combines description and active error",()=>{
 assert.deepEqual(fieldDescribedBy("description","error",true),["description","error"]);
});
test("P20AH described-by removes duplicate ids",()=>{
 assert.deepEqual(fieldDescribedBy("same","same",true),["same"]);
});
test("P20AH aria state starts valid",()=>{
 const item=field("name");
 assert.deepEqual(fieldAriaState(item,[]),{invalid:false,required:false,disabled:false,describedBy:["name-description"]});
});
test("P20AH aria state becomes invalid for field error",()=>{
 const item=field("name",{required:true});
 const result=validateForm(form([item]));
 assert.equal(fieldAriaState(item,result.issues).invalid,true);
});
test("P20AH aria state carries required status",()=>{
 const item=field("name",{required:true});
 assert.equal(fieldAriaState(item,[]).required,true);
});
test("P20AH aria state carries disabled status",()=>{
 const item=field("name",{disabled:true});
 assert.equal(fieldAriaState(item,[]).disabled,true);
});
test("P20AH summary link encodes target id",()=>{
 assert.equal(summaryLinkTarget({fieldId:"a b",targetId:"a b",label:"A",message:"Error",code:"required",order:0}),"#a%20b");
});
test("P20AH error id is deterministic",()=>assert.equal(errorTextId("email"),"email-error"));
test("P20AH description id is deterministic",()=>assert.equal(descriptionTextId("email"),"email-description"));
test("P20AH field accessibility accepts visible label and description",()=>{
 const item=field("name",{value:"Ada"}),result=validateForm(form([item]));
 assert.deepEqual(fieldAccessibilityIssues(item,observation(item),result,"en"),[]);
});
test("P20AH field accessibility flags missing visible label",()=>{
 const item=field("name"),result=validateForm(form([item]));
 assert.ok(codes(fieldAccessibilityIssues(item,observation(item,{labelText:"",accessibleName:""}),result,"en")).includes("missing-label"));
});
test("P20AH field accessibility flags invalid aria state",()=>{
 const item=field("name",{required:true}),result=validateForm(form([item]));
 assert.ok(codes(fieldAccessibilityIssues(item,observation(item),result,"en")).includes("invalid-state"));
});
test("P20AH field accessibility accepts connected error message",()=>{
 const item=field("name",{required:true}),result=validateForm(form([item]));
 const seen=observation(item,{ariaInvalid:"true",describedBy:["name-description","name-error"],
  descriptions:[{id:"name-description",exists:true,text:"Description"},{id:"name-error",exists:true,text:"Required"}],
  errorText:"Enter a value.",errorId:"name-error",errorRole:"alert",errorLive:"assertive"});
 assert.deepEqual(fieldAccessibilityIssues(item,seen,result,"en"),[]);
});
test("P20AH field accessibility flags absent error reference",()=>{
 const item=field("name",{required:true}),result=validateForm(form([item]));
 const seen=observation(item,{ariaInvalid:"true",errorText:"Required",errorId:"name-error"});
 assert.ok(codes(fieldAccessibilityIssues(item,seen,result,"en")).includes("missing-error-reference"));
});
