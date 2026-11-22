import test from "node:test";
import assert from "node:assert/strict";
import {
 DEFAULT_POLICY, normalizeFieldValue, isEmptyValue, isControlFree, fieldById, orderedFields,
 validateField, validateGroup, validateForm, issuesForField, fieldResult, hasFieldError,
 issueCodes, messageForIssue, copyForIssues, mergeFormValues, clearFieldValue, replaceField,
 formValueDigest, validateFormCopy, validateFormBatch, formResultSummary,
} from "./p20ah-form-validation.ts";
const field=(id,patch={})=>({id,name:id,label:{en:`Label ${id}`,fr:`Étiquette ${id}`},description:null,
 kind:"text",value:"",order:0,disabled:false,hidden:false,required:false,rules:{},...patch});
const form=(fields,patch={})=>({id:"contact-form",locale:"en",fields,groups:[],maximumFields:200,...patch});
const codes=(items)=>items.map((item)=>item.code);
test("P20AH default policy has a bounded field count",()=>assert.equal(DEFAULT_POLICY.maximumFields,200));
test("P20AH default policy has a bounded value size",()=>assert.equal(DEFAULT_POLICY.maximumValueLength,4096));
test("P20AH default policy has a bounded pattern size",()=>assert.equal(DEFAULT_POLICY.maximumPatternLength,256));
test("P20AH default policy has a bounded issue count",()=>assert.equal(DEFAULT_POLICY.maximumIssues,500));
test("P20AH normalize trims by default",()=>assert.equal(normalizeFieldValue("  value  "),"value"));
test("P20AH normalize preserves when trim is disabled",()=>assert.equal(normalizeFieldValue("  value  ",false),"  value  "));
test("P20AH empty detection trims whitespace",()=>assert.equal(isEmptyValue(" \n\t "),true));
test("P20AH empty detection accepts nonblank value",()=>assert.equal(isEmptyValue("  value "),false));
test("P20AH control check accepts ordinary text",()=>assert.equal(isControlFree("A note"),true));
test("P20AH control check rejects line feed",()=>assert.equal(isControlFree("a\nb"),false));
test("P20AH field lookup returns existing field",()=>assert.equal(fieldById(form([field("name")]),"name")?.id,"name"));
test("P20AH field lookup returns undefined for missing field",()=>assert.equal(fieldById(form([]),"missing"),undefined));
test("P20AH ordered fields sort by explicit order",()=>assert.deepEqual(orderedFields(form([field("b",{order:2}),field("a",{order:1})])).map((x)=>x.id),["a","b"]));
test("P20AH ordered fields leave source array untouched",()=>{
 const source=[field("b",{order:2}),field("a",{order:1})];orderedFields(form(source));assert.equal(source[0].id,"b");
});
test("P20AH blank optional text field is valid",()=>assert.equal(validateField(form([field("name")]),field("name")).valid,true));
test("P20AH required blank text field is invalid",()=>assert.deepEqual(codes(validateField(form([field("name",{required:true})]),field("name",{required:true})).issues),["required"]));
test("P20AH optional blank email does not produce format error",()=>assert.deepEqual(validateField(form([field("email",{kind:"email"})]),field("email",{kind:"email"})).issues,[]));
test("P20AH invalid email is reported",()=>{
 const item=field("email",{kind:"email",value:"not-an-email"});
 assert.ok(codes(validateField(form([item]),item).issues).includes("invalid-email"));
});
for(const value of ["person@example.com","a.b+tag@domain.ca","first_last@sample.org"]){
 test(`P20AH email accepts ${value}`,()=>{
  const item=field("email",{kind:"email",value});
  assert.equal(validateField(form([item]),item).valid,true);
 });
}
for(const value of ["@domain.ca","person@","person domain.ca","person@domain","<x>@domain.ca"]){
 test(`P20AH email rejects ${value}`,()=>{
  const item=field("email",{kind:"email",value});
  assert.equal(validateField(form([item]),item).valid,false);
 });
}
test("P20AH number accepts finite numeric value",()=>{
 const item=field("amount",{kind:"number",value:"12.5"});
 assert.equal(validateField(form([item]),item).valid,true);
});
test("P20AH number rejects non numeric value",()=>{
 const item=field("amount",{kind:"number",value:"twelve"});
 assert.ok(codes(validateField(form([item]),item).issues).includes("invalid-number"));
});
test("P20AH number rejects Infinity",()=>{
 const item=field("amount",{kind:"number",value:"Infinity"});
 assert.ok(codes(validateField(form([item]),item).issues).includes("invalid-number"));
});
test("P20AH number respects minimum",()=>{
 const item=field("amount",{kind:"number",value:"2",rules:{min:3}});
 assert.ok(codes(validateField(form([item]),item).issues).includes("below-minimum"));
});
test("P20AH number respects maximum",()=>{
 const item=field("amount",{kind:"number",value:"12",rules:{max:10}});
 assert.ok(codes(validateField(form([item]),item).issues).includes("above-maximum"));
});
test("P20AH number accepts inclusive minimum",()=>{
 const item=field("amount",{kind:"number",value:"3",rules:{min:3}});
 assert.equal(validateField(form([item]),item).valid,true);
});
test("P20AH number accepts inclusive maximum",()=>{
 const item=field("amount",{kind:"number",value:"10",rules:{max:10}});
 assert.equal(validateField(form([item]),item).valid,true);
});
test("P20AH date accepts leap day in leap year",()=>{
 const item=field("date",{kind:"date",value:"2024-02-29"});
 assert.equal(validateField(form([item]),item).valid,true);
});
for(const value of ["2023-02-29","2026-04-31","2026-13-01","2026-00-10","2026-01-00","2026/01/01","2026-1-01"]){
 test(`P20AH date rejects invalid calendar value ${value}`,()=>{
  const item=field("date",{kind:"date",value});
  assert.ok(codes(validateField(form([item]),item).issues).includes("invalid-date"));
 });
}
test("P20AH minimum length accepts exact boundary",()=>{
 const item=field("name",{value:"abcd",rules:{minLength:4}});
 assert.equal(validateField(form([item]),item).valid,true);
});
test("P20AH minimum length rejects one below",()=>{
 const item=field("name",{value:"abc",rules:{minLength:4}});
 assert.ok(codes(validateField(form([item]),item).issues).includes("too-short"));
});
test("P20AH maximum length accepts exact boundary",()=>{
 const item=field("name",{value:"abcd",rules:{maxLength:4}});
 assert.equal(validateField(form([item]),item).valid,true);
});
test("P20AH maximum length rejects one above",()=>{
 const item=field("name",{value:"abcde",rules:{maxLength:4}});
 assert.ok(codes(validateField(form([item]),item).issues).includes("too-long"));
});
test("P20AH pattern accepts matching value",()=>{
 const item=field("code",{value:"AB-123",rules:{pattern:"^[A-Z]{2}-\\d{3}$"}});
 assert.equal(validateField(form([item]),item).valid,true);
});
test("P20AH pattern rejects nonmatching value",()=>{
 const item=field("code",{value:"ab-123",rules:{pattern:"^[A-Z]{2}-\\d{3}$"}});
 assert.ok(codes(validateField(form([item]),item).issues).includes("pattern-mismatch"));
});
test("P20AH invalid pattern is an unsupported rule",()=>{
 const item=field("code",{value:"abc",rules:{pattern:"["}});
 assert.ok(codes(validateField(form([item]),item).issues).includes("unknown-rule"));
});
test("P20AH oversized pattern is an unsupported rule",()=>{
 const item=field("code",{value:"abc",rules:{pattern:"a".repeat(300)}});
 assert.ok(codes(validateField(form([item]),item).issues).includes("unknown-rule"));
});
test("P20AH disallowed control character is reported",()=>{
 const item=field("note",{value:"line\nbreak"});
 assert.ok(codes(validateField(form([item]),item).issues).includes("invalid-character"));
});
test("P20AH explicit control-character allowance is respected",()=>{
 const item=field("note",{value:"line\nbreak",rules:{allowControlCharacters:true}});
 assert.equal(validateField(form([item]),item).valid,true);
});
test("P20AH trim false reports surrounding whitespace",()=>{
 const item=field("name",{value:" name ",rules:{trim:false}});
 assert.ok(codes(validateField(form([item]),item).issues).includes("empty-after-trim"));
});
test("P20AH disabled field is not validated",()=>{
 const item=field("email",{kind:"email",value:"bad",disabled:true,required:true});
 assert.equal(validateField(form([item]),item).valid,true);
});
test("P20AH hidden field is not validated",()=>{
 const item=field("email",{kind:"email",value:"bad",hidden:true,required:true});
 assert.equal(validateField(form([item]),item).valid,true);
});
test("P20AH overlong field is capped",()=>{
 const item=field("note",{value:"x".repeat(4097)});
 assert.ok(codes(validateField(form([item]),item).issues).includes("limit-exceeded"));
});
test("P20AH choices accept listed value",()=>{
 const item=field("kind",{value:"other",rules:{choices:["one","other"]}});
 assert.equal(validateField(form([item]),item).valid,true);
});
test("P20AH choices reject unlisted value",()=>{
 const item=field("kind",{value:"third",rules:{choices:["one","other"]}});
 assert.ok(codes(validateField(form([item]),item).issues).includes("invalid-choice"));
});
test("P20AH dependency is valid when related value exists",()=>{
 const dependency=field("has-details",{value:"yes"});
 const dependent=field("details",{value:"Text",rules:{dependsOn:"has-details",dependsValue:"yes"}});
 assert.equal(validateField(form([dependency,dependent]),dependent).valid,true);
});
test("P20AH dependency reports missing related value",()=>{
 const dependency=field("has-details");
 const dependent=field("details",{value:"Text",rules:{dependsOn:"has-details"}});
 assert.ok(codes(validateField(form([dependency,dependent]),dependent).issues).includes("dependency-unmet"));
});
test("P20AH confirmation accepts matching value",()=>{
 const original=field("email",{value:"a@b.ca"});
 const confirm=field("confirm",{value:"a@b.ca",rules:{confirmationOf:"email"}});
 assert.equal(validateField(form([original,confirm]),confirm).valid,true);
});
test("P20AH confirmation rejects different value",()=>{
 const original=field("email",{value:"a@b.ca"});
 const confirm=field("confirm",{value:"c@d.ca",rules:{confirmationOf:"email"}});
 assert.ok(codes(validateField(form([original,confirm]),confirm).issues).includes("confirmation-mismatch"));
});
test("P20AH unique values accept distinct entries",()=>{
 const first=field("one",{value:"A",rules:{uniqueWithin:"group"}});
 const second=field("two",{value:"B",rules:{uniqueWithin:"group"}});
 assert.equal(validateField(form([first,second]),second).valid,true);
});
test("P20AH unique values reject duplicates",()=>{
 const first=field("one",{value:"A",rules:{uniqueWithin:"group"}});
 const second=field("two",{value:"A",rules:{uniqueWithin:"group"}});
 assert.ok(codes(validateField(form([first,second]),second).issues).includes("duplicate-value"));
});
test("P20AH required group rejects no selected values",()=>{
 const a=field("a"),b=field("b");
 const group={id:"choices",legend:{en:"Choices",fr:"Choix"},kind:"checkbox",fieldIds:["a","b"],minimumSelected:1,maximumSelected:null,required:true};
 assert.ok(codes(validateGroup(form([a,b]),group)).includes("group-required"));
});
test("P20AH checkbox group accepts one selected value",()=>{
 const a=field("a",{value:"true"}),b=field("b");
 const group={id:"choices",legend:{en:"Choices",fr:"Choix"},kind:"checkbox",fieldIds:["a","b"],minimumSelected:1,maximumSelected:null,required:true};
 assert.deepEqual(validateGroup(form([a,b]),group),[]);
});
test("P20AH checkbox group rejects too many selected values",()=>{
 const a=field("a",{value:"true"}),b=field("b",{value:"true"});
 const group={id:"choices",legend:{en:"Choices",fr:"Choix"},kind:"checkbox",fieldIds:["a","b"],minimumSelected:0,maximumSelected:1,required:false};
 assert.ok(codes(validateGroup(form([a,b]),group)).includes("group-selection-count"));
});
test("P20AH group ignores disabled selected field",()=>{
 const a=field("a",{value:"true",disabled:true});
 const group={id:"choices",legend:{en:"Choices",fr:"Choix"},kind:"checkbox",fieldIds:["a"],minimumSelected:1,maximumSelected:null,required:true};
 assert.ok(codes(validateGroup(form([a]),group)).includes("group-required"));
});
test("P20AH validate form returns valid for blank optional fields",()=>{
 const result=validateForm(form([field("name"),field("phone",{kind:"tel"})]));
 assert.equal(result.valid,true);assert.equal(result.errorCount,0);
});
test("P20AH validate form returns first invalid field in form order",()=>{
 const result=validateForm(form([field("later",{required:true,order:2}),field("first",{required:true,order:1})]));
 assert.equal(result.firstInvalidFieldId,"first");
});
test("P20AH validate form returns field results in order",()=>{
 const result=validateForm(form([field("b",{order:2}),field("a",{order:1})]));
 assert.deepEqual(result.fields.map((item)=>item.fieldId),["a","b"]);
});
test("P20AH form id is checked",()=>{
 const result=validateForm(form([],{id:"bad id"}));
 assert.ok(codes(result.issues).includes("form-id-invalid"));
});
test("P20AH duplicate field id is reported",()=>{
 const result=validateForm(form([field("same"),field("same",{order:1})]));
 assert.ok(codes(result.issues).includes("duplicate-id"));
});
test("P20AH field result can be found",()=>{
 const result=validateForm(form([field("name",{required:true})]));
 assert.equal(fieldResult(result,"name")?.valid,false);
});
test("P20AH hasFieldError detects required error",()=>{
 const result=validateForm(form([field("name",{required:true})]));
 assert.equal(hasFieldError(result,"name"),true);
});
test("P20AH issuesForField isolates one field",()=>{
 const result=validateForm(form([field("a",{required:true}),field("b",{required:true})]));
 assert.deepEqual(issuesForField(result,"a").map((x)=>x.fieldId),["a"]);
});
test("P20AH issueCodes exposes stable codes",()=>{
 const result=validateForm(form([field("a",{required:true})]));
 assert.deepEqual(issueCodes(result,"a"),["required"]);
});
test("P20AH French issue message is localized",()=>assert.equal(messageForIssue("required","fr"),"Saisissez une valeur."));
test("P20AH English issue message is localized",()=>assert.equal(messageForIssue("required","en"),"Enter a value."));
test("P20AH issue copy includes field id and message",()=>{
 const result=validateForm(form([field("a",{required:true})]));
 assert.deepEqual(copyForIssues(result.issues,"en"),["a: Enter a value."]);
});
test("P20AH merge values changes only selected field",()=>{
 const original=form([field("a",{value:"old"}),field("b",{value:"keep"})]);
 const changed=mergeFormValues(original,{a:"new"});
 assert.deepEqual(changed.fields.map((x)=>x.value),["new","keep"]);
});
test("P20AH merge values does not mutate original",()=>{
 const original=form([field("a",{value:"old"})]);mergeFormValues(original,{a:"new"});
 assert.equal(original.fields[0].value,"old");
});
test("P20AH clear field clears matching value",()=>{
 const original=form([field("a",{value:"value"})]);
 assert.equal(clearFieldValue(original,"a").fields[0].value,"");
});
test("P20AH replace field replaces matching field",()=>{
 const original=form([field("a",{value:"old"})]);
 assert.equal(replaceField(original,field("a",{value:"new"})).fields[0].value,"new");
});
test("P20AH digest changes when value changes",()=>{
 const first=form([field("a",{value:"one"})]),second=form([field("a",{value:"two"})]);
 assert.notEqual(formValueDigest(first),formValueDigest(second));
});
test("P20AH digest does not depend on field order",()=>{
 const first=form([field("a",{value:"one"}),field("b",{value:"two"})]);
 const second=form([field("b",{value:"two"}),field("a",{value:"one"})]);
 assert.equal(formValueDigest(first),formValueDigest(second));
});
test("P20AH French form copy preserves UNKNOWN first-field sentinel",()=>{
 const result=validateFormCopy(form([field("a")]),"fr");
 assert.equal(result.firstField,"UNKNOWN");
});
test("P20AH batch validation keeps form order",()=>{
 const results=validateFormBatch([form([],{id:"one"}),form([],{id:"two"})]);
 assert.deepEqual(results.map((x)=>x.formId),["one","two"]);
});
test("P20AH result summary includes error count",()=>{
 const result=validateForm(form([field("a",{required:true})]));
 assert.match(formResultSummary(result),/Errors: 1/);
});
test("P20AH maximum form fields is enforced",()=>{
 const result=validateForm(form(Array.from({length:3},(_,i)=>field(`f${i}`)),{maximumFields:2}));
 assert.ok(codes(result.issues).includes("limit-exceeded"));
});
test("P20AH maximum policy field count is enforced",()=>{
 const result=validateForm(form([field("a"),field("b")]),{...DEFAULT_POLICY,maximumFields:1});
 assert.ok(codes(result.issues).includes("limit-exceeded"));
});
test("P20AH maximum issue count bounds output",()=>{
 const fields=Array.from({length:8},(_,i)=>field(`f${i}`,{required:true}));
 const result=validateForm(form(fields),{...DEFAULT_POLICY,maximumIssues:3});
 assert.equal(result.issues.length,3);
});
for(const locale of ["en","fr"]){
 test(`P20AH copy supports ${locale}`,()=>{
  const result=validateFormCopy(form([field("name",{required:true})]),locale);
  assert.ok(result.title.length>0);assert.ok(result.invalid.length>0);
 });
}
