/** Form-definition consistency checks, dependency graph review and deterministic issue export. */
import { type FormDefinition, type FieldIssue, type IssueCode, type Locale, validateForm, orderedFields } from "./p20ah-form-validation.ts";
export interface DefinitionIssue {
 readonly code:IssueCode; readonly target:string; readonly detail:string;
 readonly severity:"error"|"review"; readonly order:number;
}
export interface DependencyEdge { readonly from:string; readonly to:string; readonly kind:"depends"|"confirmation"|"unique"; }
export interface DependencyReport {
 readonly edges:readonly DependencyEdge[]; readonly cycles:readonly (readonly string[])[];
 readonly missingTargets:readonly string[]; readonly selfReferences:readonly string[];
}
const ID=/^[A-Za-z][A-Za-z0-9_:.-]{0,127}$/;
export function definitionIssues(form:FormDefinition):DefinitionIssue[]{
 const issues:DefinitionIssue[]=[];const add=(code:IssueCode,target:string,detail:string,severity:"error"|"review"="error",order=-1)=>
  issues.push({code,target,detail,severity,order});
 if(!ID.test(form.id))add("form-id-invalid",form.id,"Form identifier is not a safe local identifier.");
 if(!Number.isSafeInteger(form.maximumFields)||form.maximumFields<1)add("limit-exceeded",form.id,"Form field limit must be a positive whole number.");
 const fields=orderedFields(form);const ids=new Set<string>();
 for(const field of fields){
  if(!ID.test(field.id))add("field-id-invalid",field.id,"Field identifier is not a safe local identifier.","error",field.order);
  if(ids.has(field.id))add("duplicate-id",field.id,"Field identifier is repeated.","error",field.order);
  ids.add(field.id);
  if(!field.label.en.trim()||!field.label.fr.trim())add("missing-label",field.id,"A label is missing in one language.","error",field.order);
  if(field.description&&(!field.description.en.trim()||!field.description.fr.trim()))add("missing-description",field.id,"A description is empty in one language.","review",field.order);
  if(!Number.isSafeInteger(field.order)||field.order<0)add("field-order-mismatch",field.id,"Field order must be a non-negative whole number.","error",field.order);
  const {minLength,maxLength,min,max,pattern}=field.rules;
  if(minLength!==undefined&&(!Number.isSafeInteger(minLength)||minLength<0))add("unknown-rule",field.id,"Minimum length is not a non-negative whole number.","error",field.order);
  if(maxLength!==undefined&&(!Number.isSafeInteger(maxLength)||maxLength<0))add("unknown-rule",field.id,"Maximum length is not a non-negative whole number.","error",field.order);
  if(minLength!==undefined&&maxLength!==undefined&&minLength>maxLength)add("unknown-rule",field.id,"Minimum length exceeds maximum length.","error",field.order);
  if(min!==undefined&&!Number.isFinite(min))add("unknown-rule",field.id,"Minimum number must be finite.","error",field.order);
  if(max!==undefined&&!Number.isFinite(max))add("unknown-rule",field.id,"Maximum number must be finite.","error",field.order);
  if(min!==undefined&&max!==undefined&&min>max)add("unknown-rule",field.id,"Minimum number exceeds maximum number.","error",field.order);
  if(pattern!==undefined){
   try{new RegExp(pattern,"u");}catch{add("unknown-rule",field.id,"Pattern cannot be compiled.","error",field.order);}
   if(pattern.length>256)add("unknown-rule",field.id,"Pattern exceeds the supported length.","error",field.order);
  }
  if(field.rules.dependsOn&&!ids.has(field.rules.dependsOn)&&!form.fields.some((candidate)=>candidate.id===field.rules.dependsOn)){
   add("dependency-unmet",field.id,"Dependency target is not part of the form.","error",field.order);
  }
  if(field.rules.confirmationOf&&!form.fields.some((candidate)=>candidate.id===field.rules.confirmationOf)){
   add("confirmation-mismatch",field.id,"Confirmation target is not part of the form.","error",field.order);
  }
  if(field.rules.uniqueWithin&&field.rules.uniqueWithin.trim()==="")add("unknown-rule",field.id,"Unique group identifier is empty.","error",field.order);
 }
 const groupIds=new Set<string>();
 for(const group of form.groups){
  if(!ID.test(group.id))add("field-id-invalid",group.id,"Group identifier is not a safe local identifier.");
  if(groupIds.has(group.id))add("duplicate-id",group.id,"Group identifier is repeated.");
  groupIds.add(group.id);
  if(!group.legend.en.trim()||!group.legend.fr.trim())add("missing-label",group.id,"Group legend is missing in one language.");
  if(!Number.isSafeInteger(group.minimumSelected)||group.minimumSelected<0)add("group-selection-count",group.id,"Minimum selection count is invalid.");
  if(group.maximumSelected!==null&&(!Number.isSafeInteger(group.maximumSelected)||group.maximumSelected<group.minimumSelected)){
   add("group-selection-count",group.id,"Maximum selection count is invalid.");
  }
  const members=new Set<string>();
  for(const id of group.fieldIds){
   if(members.has(id))add("duplicate-id",id,"Group repeats a member field.");
   members.add(id);
   if(!form.fields.some((field)=>field.id===id))add("summary-target-missing",id,"Group references a field that is not present.");
  }
 }
 return issues.sort((a,b)=>a.order-b.order||a.target.localeCompare(b.target)||a.code.localeCompare(b.code));
}
export function dependencyGraph(form:FormDefinition):DependencyReport{
 const edges:DependencyEdge[]=[];const missing=new Set<string>();const self=new Set<string>();
 for(const field of form.fields){
  const relations:[string|undefined,DependencyEdge["kind"]][]=[
   [field.rules.dependsOn,"depends"],[field.rules.confirmationOf,"confirmation"],[field.rules.uniqueWithin,"unique"],
  ];
  for(const [target,kind] of relations){
   if(!target)continue;
   if(kind==="unique")continue;
   edges.push({from:field.id,to:target,kind});
   if(!form.fields.some((candidate)=>candidate.id===target))missing.add(target);
   if(field.id===target)self.add(field.id);
  }
 }
 const adjacency=new Map<string,string[]>();
 for(const edge of edges){const list=adjacency.get(edge.from)??[];list.push(edge.to);adjacency.set(edge.from,list);}
 const cycles:string[][]=[];const visiting=new Set<string>();const visited=new Set<string>();const stack:string[]=[];
 function visit(id:string):void{
  if(visiting.has(id)){
   const start=stack.indexOf(id);const cycle=[...stack.slice(start),id];
   if(!cycles.some((existing)=>existing.join("|")===cycle.join("|")))cycles.push(cycle);
   return;
  }
  if(visited.has(id))return;
  visiting.add(id);stack.push(id);
  for(const next of adjacency.get(id)??[])if(adjacency.has(next))visit(next);
  stack.pop();visiting.delete(id);visited.add(id);
 }
 for(const id of adjacency.keys())visit(id);
 return {edges,cycles,missingTargets:[...missing].sort(),selfReferences:[...self].sort()};
}
export function fieldDependencyOrder(form:FormDefinition):string[]{
 const graph=dependencyGraph(form);const indegree=new Map(form.fields.map((field)=>[field.id,0]));
 const outgoing=new Map<string,string[]>();
 for(const edge of graph.edges){
  if(edge.kind==="unique"||!indegree.has(edge.from)||!indegree.has(edge.to))continue;
  indegree.set(edge.from,(indegree.get(edge.from)??0)+1);
  const list=outgoing.get(edge.to)??[];list.push(edge.from);outgoing.set(edge.to,list);
 }
 const ready=form.fields.filter((field)=>indegree.get(field.id)===0).sort((a,b)=>a.order-b.order).map((field)=>field.id);
 const result:string[]=[];
 while(ready.length){
  const id=ready.shift()!;result.push(id);
  for(const next of outgoing.get(id)??[]){
   const degree=(indegree.get(next)??0)-1;indegree.set(next,degree);
   if(degree===0){ready.push(next);ready.sort((a,b)=>(form.fields.find((f)=>f.id===a)?.order??0)-(form.fields.find((f)=>f.id===b)?.order??0));}
  }
 }
 return result;
}
export function formAudit(form:FormDefinition,locale:Locale):{
 valid:boolean;errors:number;reviews:number;items:readonly DefinitionIssue[];
 copy:{title:string;valid:string;invalid:string;count:string};
}{
 const items=definitionIssues(form);
 return {valid:items.every((item)=>item.severity!=="error"),
  errors:items.filter((item)=>item.severity==="error").length,
  reviews:items.filter((item)=>item.severity==="review").length,items,
  copy:{title:locale==="fr"?"Structure du formulaire":"Form structure",
   valid:locale==="fr"?"La structure ne présente aucune erreur.":"The structure has no errors.",
   invalid:locale==="fr"?"La structure nécessite un examen.":"The structure needs review.",
   count:locale==="fr"?`${items.length} éléments`:`${items.length} items`}};
}
export function exportIssueRows(result:ReturnType<typeof validateForm>):readonly {
 fieldId:string;code:string;severity:string;message:string;order:number;
}[]{
 return result.issues.map((item)=>({fieldId:item.fieldId,code:item.code,severity:item.severity,message:item.message.en,order:item.order}));
}
export function stableIssueKey(item:FieldIssue):string{
 return `${item.order.toString().padStart(6,"0")}|${item.fieldId}|${item.code}|${item.source}`;
}
export function sortedIssues(items:readonly FieldIssue[]):FieldIssue[]{
 return [...items].sort((a,b)=>stableIssueKey(a).localeCompare(stableIssueKey(b)));
}
export function issueCounts(items:readonly FieldIssue[]):{total:number;errors:number;reviews:number;byField:Readonly<Record<string,number>>}{
 const byField:Record<string,number>={};
 for(const item of items)byField[item.fieldId]=(byField[item.fieldId]??0)+1;
 return {total:items.length,errors:items.filter((item)=>item.severity==="error").length,
  reviews:items.filter((item)=>item.severity==="review").length,byField};
}
