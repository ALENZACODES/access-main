import test from "node:test";
import assert from "node:assert/strict";
import { } from "./p20ah-form-validation.ts";
import {
 createSession,changeSessionField,touchSessionField,recordSubmitAttempt,resetSession,
 commitSessionBaseline,sessionIsDirty,sessionFieldIsDirty,sessionFieldWasTouched,
 sessionDigest,sessionChangedFields,sessionSummary,
} from "./p20ah-form-session.ts";
const field=(id,value="",patch={})=>({id,name:id,label:{en:id,fr:id},
 description:null,kind:"text",value,order:0,disabled:false,hidden:false,required:false,rules:{},...patch});
const form=(fields)=>({id:"session",locale:"en",fields,groups:[],maximumFields:100});
test("P20AH session starts clean",()=>assert.equal(sessionIsDirty(createSession(form([field("a","A")] ))),false));
test("P20AH session starts with no touched fields",()=>assert.deepEqual(createSession(form([])).touched,[]));
test("P20AH session starts with no submit attempts",()=>assert.equal(createSession(form([])).submitAttempts,0));
test("P20AH session stores baseline digest",()=>assert.ok(createSession(form([field("a","A")])).baselineDigest.length>0));
test("P20AH session change marks one field dirty",()=>{
 const state=changeSessionField(createSession(form([field("a","A")] )),"a","B").state;
 assert.deepEqual(state.dirty,["a"]);
});
test("P20AH session change records changed field id",()=>{
 const state=changeSessionField(createSession(form([field("a")] )),"a","B").state;
 assert.equal(state.lastChangedId,"a");
});
test("P20AH session change increments revision",()=>{
 const state=changeSessionField(createSession(form([field("a")] )),"a","B").state;
 assert.equal(state.revision,1);
});
test("P20AH session change rejects missing field",()=>{
 const result=changeSessionField(createSession(form([])),"missing","x");
 assert.equal(result.accepted,false);assert.equal(result.reason,"session.field.missing");
});
test("P20AH session change rejects disabled field",()=>{
 const result=changeSessionField(createSession(form([field("a","",{disabled:true})])),"a","x");
 assert.equal(result.reason,"session.field.unavailable");
});
test("P20AH session change rejects hidden field",()=>{
 const result=changeSessionField(createSession(form([field("a","",{hidden:true})])),"a","x");
 assert.equal(result.reason,"session.field.unavailable");
});
test("P20AH session change rejects oversized value",()=>{
 const result=changeSessionField(createSession(form([field("a")])),"a","x".repeat(4097));
 assert.equal(result.reason,"session.value.limit");
});
test("P20AH session change back to original value clears dirty state",()=>{
 let state=createSession(form([field("a","A")]));
 state=changeSessionField(state,"a","B").state;
 state=changeSessionField(state,"a","A").state;
 assert.equal(sessionIsDirty(state),false);
});
test("P20AH session change one field leaves other values unchanged",()=>{
 const state=changeSessionField(createSession(form([field("a","A"),field("b","B")])),"a","X").state;
 assert.deepEqual(state.current.fields.map((x)=>x.value),["X","B"]);
});
test("P20AH session touch records field id",()=>{
 const state=touchSessionField(createSession(form([field("a")])),"a").state;
 assert.deepEqual(state.touched,["a"]);
});
test("P20AH session touch does not mark field dirty",()=>{
 const state=touchSessionField(createSession(form([field("a","A")])),"a").state;
 assert.equal(sessionFieldIsDirty(state,"a"),false);
});
test("P20AH session touch rejects hidden field",()=>{
 assert.equal(touchSessionField(createSession(form([field("a","",{hidden:true})])),"a").accepted,false);
});
test("P20AH session touch rejects disabled field",()=>{
 assert.equal(touchSessionField(createSession(form([field("a","",{disabled:true})])),"a").accepted,false);
});
test("P20AH session touch deduplicates field ids",()=>{
 let state=createSession(form([field("a")]));
 state=touchSessionField(state,"a").state;state=touchSessionField(state,"a").state;
 assert.deepEqual(state.touched,["a"]);
});
test("P20AH session submit attempt increments count",()=>{
 const state=recordSubmitAttempt(createSession(form([]))).state;
 assert.equal(state.submitAttempts,1);
});
test("P20AH session submit attempts can repeat",()=>{
 let state=createSession(form([]));
 state=recordSubmitAttempt(state).state;state=recordSubmitAttempt(state).state;
 assert.equal(state.submitAttempts,2);
});
test("P20AH session reset restores initial values",()=>{
 let state=createSession(form([field("a","A"),field("b","B")]));
 state=changeSessionField(state,"a","X").state;
 state=resetSession(state).state;
 assert.deepEqual(state.current.fields.map((x)=>x.value),["A","B"]);
});
test("P20AH session reset clears dirty and touched sets",()=>{
 let state=createSession(form([field("a","A")]));
 state=changeSessionField(state,"a","X").state;state=touchSessionField(state,"a").state;
 state=resetSession(state).state;
 assert.deepEqual(state.dirty,[]);assert.deepEqual(state.touched,[]);
});
test("P20AH session reset clears submit attempts",()=>{
 let state=recordSubmitAttempt(createSession(form([]))).state;
 assert.equal(resetSession(state).state.submitAttempts,0);
});
test("P20AH session commit establishes current values as baseline",()=>{
 let state=changeSessionField(createSession(form([field("a","A")])),"a","B").state;
 state=commitSessionBaseline(state).state;
 assert.equal(sessionIsDirty(state),false);assert.equal(state.initial.fields[0].value,"B");
});
test("P20AH session commit clears touched fields",()=>{
 let state=touchSessionField(createSession(form([field("a")])),"a").state;
 assert.deepEqual(commitSessionBaseline(state).state.touched,[]);
});
test("P20AH session commit increments revision",()=>{
 const state=commitSessionBaseline(createSession(form([]))).state;
 assert.equal(state.revision,1);
});
test("P20AH session field dirty query is accurate",()=>{
 const state=changeSessionField(createSession(form([field("a","A"),field("b","B")])),"a","X").state;
 assert.equal(sessionFieldIsDirty(state,"a"),true);assert.equal(sessionFieldIsDirty(state,"b"),false);
});
test("P20AH session field touched query is accurate",()=>{
 const state=touchSessionField(createSession(form([field("a"),field("b")])),"b").state;
 assert.equal(sessionFieldWasTouched(state,"b"),true);assert.equal(sessionFieldWasTouched(state,"a"),false);
});
test("P20AH session digest changes after edit",()=>{
 const state=createSession(form([field("a","A")]));
 assert.notEqual(sessionDigest(changeSessionField(state,"a","B").state),sessionDigest(state));
});
test("P20AH session changed fields are returned in form order",()=>{
 let state=createSession(form([field("b","B",{order:2}),field("a","A",{order:1})]));
 state=changeSessionField(state,"b","X").state;state=changeSessionField(state,"a","Y").state;
 assert.deepEqual(sessionChangedFields(state),["b","a"]);
});
test("P20AH session summary includes dirty count",()=>{
 const state=changeSessionField(createSession(form([field("a","A")])),"a","B").state;
 assert.match(sessionSummary(state),/Dirty fields: 1/);
});
