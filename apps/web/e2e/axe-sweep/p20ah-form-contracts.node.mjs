import test from "node:test";
import assert from "node:assert/strict";
import { definitionIssues, dependencyGraph, fieldDependencyOrder, formAudit, exportIssueRows, stableIssueKey, sortedIssues, issueCounts } from "./p20ah-form-contracts.ts";
import { validateForm } from "./p20ah-form-validation.ts";
const field=(id,patch={})=>({id,name:id,label:{en:`Label ${id}`,fr:`Étiquette ${id}`},
 description:null,kind:"text",value:"",order:0,disabled:false,hidden:false,required:false,rules:{},...patch});
const form=(fields,patch={})=>({id:"form",locale:"en",fields,groups:[],maximumFields:100,...patch});
const codes=(items)=>items.map((item)=>item.code);
test("P20AH definition accepts a simple form",()=>assert.deepEqual(definitionIssues(form([field("name")])),[]));
test("P20AH definition rejects unsafe form id",()=>assert.ok(codes(definitionIssues(form([],{id:"bad id"}))).includes("form-id-invalid")));
test("P20AH definition rejects invalid maximum field limit",()=>assert.ok(codes(definitionIssues(form([],{maximumFields:0}))).includes("limit-exceeded")));
test("P20AH definition rejects duplicate field ids",()=>assert.ok(codes(definitionIssues(form([field("name"),field("name",{order:1})]))).includes("duplicate-id")));
test("P20AH definition rejects unsafe field id",()=>assert.ok(codes(definitionIssues(form([field("bad id")]))).includes("field-id-invalid")));
test("P20AH definition requires bilingual label",()=>assert.ok(codes(definitionIssues(form([field("name",{label:{en:"Name",fr:" "}})]))).includes("missing-label")));
test("P20AH definition reviews incomplete bilingual description",()=>assert.ok(definitionIssues(form([field("name",{description:{en:"Help",fr:" "}})])).some((x)=>x.code==="missing-description"&&x.severity==="review")));
test("P20AH definition rejects negative order",()=>assert.ok(codes(definitionIssues(form([field("name",{order:-1})]))).includes("field-order-mismatch")));
test("P20AH definition rejects fractional order",()=>assert.ok(codes(definitionIssues(form([field("name",{order:1.5})]))).includes("field-order-mismatch")));
test("P20AH definition rejects negative minimum length",()=>assert.ok(codes(definitionIssues(form([field("name",{rules:{minLength:-1}})]))).includes("unknown-rule")));
test("P20AH definition rejects fractional maximum length",()=>assert.ok(codes(definitionIssues(form([field("name",{rules:{maxLength:2.5}})]))).includes("unknown-rule")));
test("P20AH definition rejects minimum length above maximum",()=>assert.ok(codes(definitionIssues(form([field("name",{rules:{minLength:5,maxLength:2}})]))).includes("unknown-rule")));
test("P20AH definition rejects nonfinite minimum",()=>assert.ok(codes(definitionIssues(form([field("name",{rules:{min:Number.NaN}})]))).includes("unknown-rule")));
test("P20AH definition rejects minimum above maximum",()=>assert.ok(codes(definitionIssues(form([field("name",{rules:{min:10,max:2}})]))).includes("unknown-rule")));
test("P20AH definition rejects invalid regular expression",()=>assert.ok(codes(definitionIssues(form([field("name",{rules:{pattern:"["}})]))).includes("unknown-rule")));
test("P20AH definition rejects overlong regular expression",()=>assert.ok(codes(definitionIssues(form([field("name",{rules:{pattern:"x".repeat(257)}})]))).includes("unknown-rule")));
test("P20AH definition rejects missing dependency target",()=>assert.ok(codes(definitionIssues(form([field("detail",{rules:{dependsOn:"missing"}})]))).includes("dependency-unmet")));
test("P20AH definition rejects missing confirmation target",()=>assert.ok(codes(definitionIssues(form([field("confirm",{rules:{confirmationOf:"missing"}})]))).includes("confirmation-mismatch")));
test("P20AH definition rejects empty unique group id",()=>assert.ok(codes(definitionIssues(form([field("name",{rules:{uniqueWithin:" "}})]))).includes("unknown-rule")));
test("P20AH definition rejects duplicate group id",()=>{
 const group={id:"options",legend:{en:"Options",fr:"Options"},kind:"checkbox",fieldIds:[],minimumSelected:0,maximumSelected:null,required:false};
 assert.ok(codes(definitionIssues(form([],{groups:[group,group]}))).includes("duplicate-id"));
});
test("P20AH definition rejects missing group legend",()=>{
 const group={id:"options",legend:{en:"Options",fr:" "},kind:"checkbox",fieldIds:[],minimumSelected:0,maximumSelected:null,required:false};
 assert.ok(codes(definitionIssues(form([],{groups:[group]}))).includes("missing-label"));
});
test("P20AH definition rejects missing group field",()=>{
 const group={id:"options",legend:{en:"Options",fr:"Options"},kind:"checkbox",fieldIds:["missing"],minimumSelected:1,maximumSelected:null,required:true};
 assert.ok(codes(definitionIssues(form([],{groups:[group]}))).includes("summary-target-missing"));
});
test("P20AH definition rejects duplicate group member",()=>{
 const group={id:"options",legend:{en:"Options",fr:"Options"},kind:"checkbox",fieldIds:["a","a"],minimumSelected:1,maximumSelected:null,required:true};
 assert.ok(codes(definitionIssues(form([field("a")],{groups:[group]}))).includes("duplicate-id"));
});
test("P20AH definition rejects maximum group selection below minimum",()=>{
 const group={id:"options",legend:{en:"Options",fr:"Options"},kind:"checkbox",fieldIds:["a"],minimumSelected:2,maximumSelected:1,required:true};
 assert.ok(codes(definitionIssues(form([field("a")],{groups:[group]}))).includes("group-selection-count"));
});
test("P20AH dependency graph has no edges for independent fields",()=>{
 assert.deepEqual(dependencyGraph(form([field("a"),field("b")])),{edges:[],cycles:[],missingTargets:[],selfReferences:[]});
});
test("P20AH dependency graph includes dependency edge",()=>{
 const graph=dependencyGraph(form([field("a"),field("b",{rules:{dependsOn:"a"}})]));
 assert.deepEqual(graph.edges,[{from:"b",to:"a",kind:"depends"}]);
});
test("P20AH dependency graph includes confirmation edge",()=>{
 const graph=dependencyGraph(form([field("a"),field("b",{rules:{confirmationOf:"a"}})]));
 assert.deepEqual(graph.edges,[{from:"b",to:"a",kind:"confirmation"}]);
});
test("P20AH dependency graph reports missing target",()=>{
 const graph=dependencyGraph(form([field("b",{rules:{dependsOn:"missing"}})]));
 assert.deepEqual(graph.missingTargets,["missing"]);
});
test("P20AH dependency graph reports self reference",()=>{
 const graph=dependencyGraph(form([field("a",{rules:{dependsOn:"a"}})]));
 assert.deepEqual(graph.selfReferences,["a"]);
});
test("P20AH dependency graph detects two-node cycle",()=>{
 const graph=dependencyGraph(form([field("a",{rules:{dependsOn:"b"}}),field("b",{rules:{dependsOn:"a"}})]));
 assert.equal(graph.cycles.length,1);
});
test("P20AH dependency graph detects three-node cycle",()=>{
 const graph=dependencyGraph(form([field("a",{rules:{dependsOn:"b"}}),field("b",{rules:{dependsOn:"c"}}),field("c",{rules:{dependsOn:"a"}})]));
 assert.equal(graph.cycles.length,1);
});
test("P20AH dependency graph keeps acyclic graph cycle-free",()=>{
 const graph=dependencyGraph(form([field("a"),field("b",{rules:{dependsOn:"a"}}),field("c",{rules:{dependsOn:"b"}})]));
 assert.deepEqual(graph.cycles,[]);
});
test("P20AH dependency order places prerequisite first",()=>{
 const result=fieldDependencyOrder(form([field("b",{order:0,rules:{dependsOn:"a"}}),field("a",{order:1})]));
 assert.deepEqual(result,["a","b"]);
});
test("P20AH dependency order preserves form order for independent fields",()=>{
 assert.deepEqual(fieldDependencyOrder(form([field("b",{order:1}),field("a",{order:0})])),["a","b"]);
});
test("P20AH dependency order returns partial order when cycle exists",()=>{
 const result=fieldDependencyOrder(form([field("a",{rules:{dependsOn:"b"}}),field("b",{rules:{dependsOn:"a"}}),field("c")]));
 assert.ok(result.includes("c"));assert.equal(result.includes("a")&&result.includes("b"),false);
});
test("P20AH form audit returns valid bilingual copy",()=>{
 const report=formAudit(form([field("name")]),"en");
 assert.equal(report.valid,true);assert.match(report.copy.valid,/no errors/);
});
test("P20AH French form audit returns French title",()=>{
 assert.equal(formAudit(form([field("name")]),"fr").copy.title,"Structure du formulaire");
});
test("P20AH issue rows preserve each issue field",()=>{
 const result=validateForm(form([field("a",{required:true})]));
 assert.equal(exportIssueRows(result)[0]?.fieldId,"a");
});
test("P20AH stable issue key includes source and code",()=>{
 const result=validateForm(form([field("a",{required:true})]));
 assert.match(stableIssueKey(result.issues[0]),/a\|required\|field/);
});
test("P20AH sorted issues are deterministic",()=>{
 const result=validateForm(form([field("b",{required:true,order:2}),field("a",{required:true,order:1})]));
 const reversed=[...result.issues].reverse();
 assert.deepEqual(sortedIssues(reversed),sortedIssues(result.issues));
});
test("P20AH issue counts aggregate by field",()=>{
 const result=validateForm(form([field("a",{required:true}),field("b",{required:true})]));
 assert.deepEqual(issueCounts(result.issues).byField,{a:1,b:1});
});
test("P20AH issue counts report total errors",()=>{
 const result=validateForm(form([field("a",{required:true}),field("b",{required:true})]));
 assert.equal(issueCounts(result.issues).errors,2);
});
