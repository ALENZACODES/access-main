import test from "node:test";
import assert from "node:assert/strict";
import {
 initialJourney, stepJourney, replayJourney, journeySummary, journeyCanReview, journeyCanEdit,
 journeyLastError, journeyFieldHistory,
} from "./p20ah-form-journey.ts";
const field=(id,patch={})=>({id,name:id,label:{en:id,fr:id},description:null,
 kind:"text",value:"",order:0,disabled:false,hidden:false,required:false,rules:{},...patch});
const form=(fields)=>({id:"application",locale:"en",fields,groups:[],maximumFields:100});
test("P20AH journey starts in editing phase",()=>assert.equal(initialJourney(form([field("name")])).phase,"editing"));
test("P20AH journey starts without validation result",()=>assert.equal(initialJourney(form([])).result,null));
test("P20AH journey starts without focus",()=>assert.equal(initialJourney(form([])).focusedId,null));
test("P20AH journey starts at revision zero",()=>assert.equal(initialJourney(form([])).revision,0));
test("P20AH journey accepts local field change",()=>{
 const result=stepJourney(initialJourney(form([field("name")])),{type:"change",fieldId:"name",value:"Ada",at:1});
 assert.equal(result.accepted,true);assert.equal(result.state.form.fields[0].value,"Ada");
});
test("P20AH journey rejects missing field change",()=>{
 const result=stepJourney(initialJourney(form([])),{type:"change",fieldId:"missing",value:"x",at:1});
 assert.equal(result.reason,"journey.field.missing");
});
test("P20AH journey rejects disabled field change",()=>{
 const result=stepJourney(initialJourney(form([field("name",{disabled:true})])),{type:"change",fieldId:"name",value:"x",at:1});
 assert.equal(result.reason,"journey.field.unavailable");
});
test("P20AH journey rejects hidden field change",()=>{
 const result=stepJourney(initialJourney(form([field("name",{hidden:true})])),{type:"change",fieldId:"name",value:"x",at:1});
 assert.equal(result.reason,"journey.field.unavailable");
});
test("P20AH journey rejects oversized value",()=>{
 const result=stepJourney(initialJourney(form([field("name")])),{type:"change",fieldId:"name",value:"x".repeat(5000),at:1});
 assert.equal(result.reason,"journey.value.limit");
});
test("P20AH journey rejects negative time",()=>{
 const result=stepJourney(initialJourney(form([])),{type:"check",at:-1});
 assert.equal(result.reason,"journey.time.invalid");
});
test("P20AH journey rejects time reversal",()=>{
 const first=stepJourney(initialJourney(form([])),{type:"check",at:5}).state;
 assert.equal(stepJourney(first,{type:"reset",at:4}).reason,"journey.time.reversed");
});
test("P20AH journey check detects required error",()=>{
 const result=stepJourney(initialJourney(form([field("name",{required:true})])),{type:"check",at:1});
 assert.equal(result.state.phase,"needs-correction");assert.equal(result.state.result?.errorCount,1);
});
test("P20AH journey check focuses first invalid field",()=>{
 const result=stepJourney(initialJourney(form([field("b",{required:true,order:2}),field("a",{required:true,order:1})])),{type:"check",at:1});
 assert.equal(result.state.focusedId,"a");
});
test("P20AH journey check moves to ready when fields are valid",()=>{
 const result=stepJourney(initialJourney(form([field("name",{value:"Ada"})])),{type:"check",at:1});
 assert.equal(result.state.phase,"ready");assert.equal(result.state.result?.valid,true);
});
test("P20AH journey editing after check recomputes errors",()=>{
 let state=stepJourney(initialJourney(form([field("name",{required:true})])),{type:"check",at:1}).state;
 state=stepJourney(state,{type:"change",fieldId:"name",value:"Ada",at:2}).state;
 assert.equal(state.phase,"ready");assert.equal(state.result?.errorCount,0);
});
test("P20AH journey editing invalid value keeps correction phase",()=>{
 let state=stepJourney(initialJourney(form([field("name",{required:true})])),{type:"check",at:1}).state;
 state=stepJourney(state,{type:"change",fieldId:"name",value:" ",at:2}).state;
 assert.equal(state.phase,"needs-correction");
});
test("P20AH journey focus summary requires validation result",()=>{
 const result=stepJourney(initialJourney(form([field("name")])),{type:"focus-summary",targetId:"summary",at:1});
 assert.equal(result.reason,"journey.summary.not-needed");
});
test("P20AH journey focus summary requires errors",()=>{
 const valid=stepJourney(initialJourney(form([field("name",{value:"Ada"})])),{type:"check",at:1}).state;
 assert.equal(stepJourney(valid,{type:"focus-summary",targetId:"summary",at:2}).reason,"journey.summary.not-needed");
});
test("P20AH journey focus summary rejects missing target",()=>{
 const invalid=stepJourney(initialJourney(form([field("name",{required:true})])),{type:"check",at:1}).state;
 assert.equal(stepJourney(invalid,{type:"focus-summary",targetId:null,at:2}).reason,"journey.summary.target.missing");
});
test("P20AH journey focus summary accepts known target",()=>{
 const invalid=stepJourney(initialJourney(form([field("name",{required:true})])),{type:"check",at:1}).state;
 const result=stepJourney(invalid,{type:"focus-summary",targetId:"summary",at:2});
 assert.equal(result.accepted,true);assert.equal(result.state.focusedId,"summary");
});
test("P20AH journey focus field accepts visible enabled field",()=>{
 const result=stepJourney(initialJourney(form([field("name")])),{type:"focus-field",fieldId:"name",at:1});
 assert.equal(result.accepted,true);assert.equal(result.state.focusedId,"name");
});
test("P20AH journey focus field rejects missing field",()=>{
 assert.equal(stepJourney(initialJourney(form([])),{type:"focus-field",fieldId:"x",at:1}).reason,"journey.focus.field.unavailable");
});
test("P20AH journey clear removes field value",()=>{
 const result=stepJourney(initialJourney(form([field("name",{value:"Ada"})])),{type:"clear",fieldId:"name",at:1});
 assert.equal(result.state.form.fields[0].value,"");
});
test("P20AH journey clear rejects missing field",()=>{
 assert.equal(stepJourney(initialJourney(form([])),{type:"clear",fieldId:"x",at:1}).reason,"journey.field.missing");
});
test("P20AH journey reset clears all values",()=>{
 const state=initialJourney(form([field("a",{value:"A"}),field("b",{value:"B"})]));
 const result=stepJourney(state,{type:"reset",at:1});
 assert.deepEqual(result.state.form.fields.map((x)=>x.value),["",""]);
});
test("P20AH journey reset clears validation result",()=>{
 const state=stepJourney(initialJourney(form([field("a",{required:true})])),{type:"check",at:1}).state;
 assert.equal(stepJourney(state,{type:"reset",at:2}).state.result,null);
});
test("P20AH journey review requires prior check",()=>{
 assert.equal(stepJourney(initialJourney(form([])),{type:"review",at:1}).reason,"journey.review.before-check");
});
test("P20AH journey review accepts ready form",()=>{
 const state=stepJourney(initialJourney(form([field("a",{value:"A"})])),{type:"check",at:1}).state;
 assert.equal(stepJourney(state,{type:"review",at:2}).state.phase,"reviewed");
});
test("P20AH journey cannot edit after reviewed",()=>{
 const state=stepJourney(initialJourney(form([field("a",{value:"A"})])),{type:"check",at:1}).state;
 const reviewed=stepJourney(state,{type:"review",at:2}).state;
 assert.equal(journeyCanEdit(reviewed),false);
});
test("P20AH journey can review only valid result",()=>{
 const invalid=stepJourney(initialJourney(form([field("a",{required:true})])),{type:"check",at:1}).state;
 assert.equal(journeyCanReview(invalid),false);
 const valid=stepJourney(initialJourney(form([field("a",{value:"A"})])),{type:"check",at:1}).state;
 assert.equal(journeyCanReview(valid),true);
});
test("P20AH journey history is bounded to 100 records",()=>{
 let state=initialJourney(form([]));
 for(let i=0;i<120;i++)state=stepJourney(state,{type:"reset",at:i}).state;
 assert.equal(state.history.length,100);
});
test("P20AH journey history stores event and revision",()=>{
 const state=stepJourney(initialJourney(form([field("name")])),{type:"change",fieldId:"name",value:"Ada",at:1}).state;
 assert.equal(state.history[0]?.event,"change");assert.equal(state.history[0]?.revision,1);
});
test("P20AH journey field history filters one field",()=>{
 let state=initialJourney(form([field("a"),field("b")]));
 state=stepJourney(state,{type:"change",fieldId:"a",value:"A",at:1}).state;
 state=stepJourney(state,{type:"change",fieldId:"b",value:"B",at:2}).state;
 assert.equal(journeyFieldHistory(state,"a").length,1);
});
test("P20AH journey summary includes phase",()=>{
 const state=initialJourney(form([]));assert.match(journeySummary(state),/Phase: editing/);
});
test("P20AH journey last error is UNKNOWN before check",()=>assert.equal(journeyLastError(initialJourney(form([]))),null));
test("P20AH journey replay accepts ordered events",()=>{
 const result=replayJourney(form([field("name",{required:true})]),[
  {type:"check",at:1},{type:"change",fieldId:"name",value:"Ada",at:2},{type:"check",at:3},{type:"review",at:4},
 ]);
 assert.equal(result.accepted,4);assert.equal(result.state.phase,"reviewed");assert.deepEqual(result.rejected,[]);
});
test("P20AH journey replay records rejected events without advancing revision",()=>{
 const result=replayJourney(form([]),[{type:"change",fieldId:"missing",value:"x",at:1},{type:"reset",at:2}]);
 assert.equal(result.accepted,1);assert.equal(result.state.revision,1);assert.equal(result.rejected.length,1);
});
