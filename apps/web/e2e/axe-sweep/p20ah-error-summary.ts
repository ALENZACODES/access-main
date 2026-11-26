/** Accessible field, error summary and announcement contracts; observations are kept separate from validation. */
import { type Locale, type FormResult, type FormField, type FieldIssue, type IssueCode, messageForIssue } from "./p20ah-form-validation.ts";
export interface DescribedReference {
 readonly id:string; readonly exists:boolean; readonly text:string;
}
export interface FieldAccessibilityObservation {
 readonly fieldId:string; readonly labelText:string; readonly labelFor:string|null;
 readonly inputId:string; readonly role:string; readonly ariaInvalid:string|null;
 readonly describedBy:readonly string[]; readonly descriptions:readonly DescribedReference[];
 readonly required:boolean; readonly disabled:boolean; readonly hidden:boolean;
 readonly errorText:string|null; readonly errorId:string|null; readonly errorRole:string|null;
 readonly errorLive:string|null; readonly accessibleName:string;
}
export interface AccessibilityIssue {
 readonly fieldId:string; readonly code:IssueCode; readonly severity:"error"|"review";
 readonly detail:string; readonly locale:Locale;
}
export interface SummaryItem {
 readonly fieldId:string; readonly targetId:string; readonly label:string;
 readonly message:string; readonly code:IssueCode; readonly order:number;
}
export interface ErrorSummary {
 readonly id:string; readonly heading:string; readonly intro:string;
 readonly items:readonly SummaryItem[]; readonly errorCount:number;
 readonly firstTargetId:string|null; readonly focusable:boolean;
 readonly role:"alert"|"region"; readonly ariaLive:"assertive"|"polite"|"off";
}
export interface Announcement {
 readonly id:string; readonly text:string; readonly locale:Locale;
 readonly politeness:"assertive"|"polite"|"off"; readonly at:number;
}
export interface AnnouncementState {
 readonly lastId:string|null; readonly lastText:string|null; readonly lastAt:number|null;
 readonly count:number; readonly history:readonly Announcement[];
}
export interface FocusHandoff {
 readonly expectedId:string|null; readonly observedId:string|null;
 readonly moved:boolean; readonly targetExists:boolean; readonly targetFocusable:boolean;
 readonly at:number;
}
const ID=/^[A-Za-z][A-Za-z0-9_:.-]{0,127}$/;
export function fieldAccessibilityIssues(field:FormField,observation:FieldAccessibilityObservation,
 result:FormResult,locale:Locale):AccessibilityIssue[]{
 const issues:AccessibilityIssue[]=[];
 const add=(code:IssueCode,severity:"error"|"review"="error",detail=messageForIssue(code,locale))=>
  issues.push({fieldId:field.id,code,severity,detail,locale});
 if(!observation.labelText.trim()||!observation.accessibleName.trim())add("missing-label");
 if(observation.labelFor!==field.id&&observation.labelFor!==null)add("missing-label","review","The visible label points to a different field id.");
 if(observation.inputId!==field.id)add("field-id-invalid");
 const expectedError=result.issues.some((item)=>item.fieldId===field.id&&item.severity==="error");
 if(expectedError&&observation.ariaInvalid!=="true")add("invalid-state","review","The field has an error but aria-invalid is not true.");
 if(!expectedError&&observation.ariaInvalid==="true")add("invalid-state","review","The field reports aria-invalid without a current error.");
 if(observation.required!==field.required)add("invalid-state","review","Required state differs from the form definition.");
 if(observation.disabled!==field.disabled)add("invalid-state","review","Disabled state differs from the form definition.");
 for(const id of observation.describedBy){
  const reference=observation.descriptions.find((entry)=>entry.id===id);
  if(!reference)add("missing-description");
  else if(!reference.exists)add("stale-error-reference");
 }
 if(expectedError){
  if(!observation.errorId||!observation.describedBy.includes(observation.errorId))add("missing-error-reference");
  if(!observation.errorText?.trim())add("missing-error-reference","review","The current error message has no visible text.");
  if(observation.errorRole!=="alert"&&observation.errorLive!=="assertive")add("missing-error-reference","review","The field error is not announced assertively.");
 }
 if(!expectedError&&observation.errorId&&observation.describedBy.includes(observation.errorId)){
  add("stale-error-reference","review","A cleared error remains in the description references.");
 }
 return issues;
}
export function summaryItems(result:FormResult,fields:readonly FormField[],locale:Locale):SummaryItem[]{
 const byId=new Map(fields.map((field)=>[field.id,field]));
 return result.issues.filter((item)=>item.severity==="error"&&item.fieldId!==result.formId)
  .map((item)=>{
   const field=byId.get(item.fieldId);
   return {fieldId:item.fieldId,targetId:field?.id??item.fieldId,label:field?.label[locale]??item.fieldId,
    message:item.message[locale],code:item.code,order:item.order};
  }).sort((a,b)=>a.order-b.order||a.fieldId.localeCompare(b.fieldId));
}
export function buildErrorSummary(input:{
 id:string; result:FormResult; fields:readonly FormField[]; locale:Locale;
 role?:"alert"|"region"; ariaLive?:"assertive"|"polite"|"off";
}):ErrorSummary{
 const items=summaryItems(input.result,input.fields,input.locale);
 return {
  id:input.id,heading:input.locale==="fr"?"Il y a des éléments à corriger":"There are items to correct",
  intro:input.locale==="fr"?`${items.length} erreurs dans ce formulaire.`:`${items.length} errors in this form.`,
  items,errorCount:items.length,firstTargetId:items[0]?.targetId??null,focusable:true,
  role:input.role??"alert",ariaLive:input.ariaLive??"assertive",
 };
}
export function summaryIssues(summary:ErrorSummary,fields:readonly FormField[]):AccessibilityIssue[]{
 const issues:AccessibilityIssue[]=[];const ids=new Set<string>();
 const locale:Locale="en";
 const add=(code:IssueCode,detail:string)=>issues.push({fieldId:summary.id,code,severity:"error",detail,locale});
 if(!ID.test(summary.id))add("form-id-invalid","Error summary id is invalid.");
 for(const item of summary.items){
  if(ids.has(item.fieldId))add("summary-target-duplicate",`Field ${item.fieldId} is listed more than once.`);
  ids.add(item.fieldId);
  if(!fields.some((field)=>field.id===item.fieldId))add("summary-target-missing",`Field ${item.fieldId} is not in the form.`);
  if(!item.targetId.trim())add("summary-target-missing","A summary link has an empty target.");
 }
 const ordered=summary.items.map((item)=>item.order);
 if(ordered.some((value,index)=>index>0&&value<ordered[index-1]!))add("field-order-mismatch","Summary items are not in form order.");
 if(summary.errorCount!==summary.items.length)add("error-count-mismatch","Summary count differs from its item count.");
 if(summary.items.length>0&&!summary.firstTargetId)add("focus-target-missing","The summary has errors but no first target.");
 if(summary.items.length===0&&summary.firstTargetId!==null)add("focus-target-missing","The empty summary has a first target.");
 if(!summary.heading.trim()||!summary.intro.trim())add("missing-label","The error summary needs a heading and introduction.");
 if(summary.items.length>0&&summary.ariaLive==="off")add("announcement-empty","The summary is not announced.");
 return issues;
}
export function focusHandoffIssues(handoff:FocusHandoff,locale:Locale):AccessibilityIssue[]{
 const issues:AccessibilityIssue[]=[];const add=(code:IssueCode,detail:string)=>
  issues.push({fieldId:handoff.expectedId??"UNKNOWN",code,severity:"error",detail,locale});
 if(handoff.expectedId===null||!handoff.targetExists)add("focus-target-missing","The intended focus target is absent.");
 else if(!handoff.targetFocusable)add("focus-target-missing","The intended focus target cannot receive focus.");
 if(handoff.moved&&handoff.observedId!==handoff.expectedId)add("focus-not-moved","Focus moved to a different target.");
 if(!handoff.moved&&handoff.expectedId!==null)add("focus-not-moved","Focus did not move to the intended target.");
 if(!Number.isSafeInteger(handoff.at)||handoff.at<0)add("invalid-state","Focus handoff time is invalid.");
 return issues;
}
export function emptyAnnouncementState():AnnouncementState{
 return {lastId:null,lastText:null,lastAt:null,count:0,history:[]};
}
export function announce(state:AnnouncementState,message:Announcement):{
 state:AnnouncementState;accepted:boolean;reason:string|null;
}{
 if(!ID.test(message.id))return {state,accepted:false,reason:"announcement.id.invalid"};
 if(!message.text.trim())return {state,accepted:false,reason:"announcement.text.empty"};
 if(!Number.isSafeInteger(message.at)||message.at<0)return {state,accepted:false,reason:"announcement.time.invalid"};
 if(state.lastAt!==null&&message.at<state.lastAt)return {state,accepted:false,reason:"announcement.time.reversed"};
 if(state.lastId===message.id&&state.lastText===message.text)return {state,accepted:false,reason:"announcement.duplicate"};
 const history=[...state.history,message].slice(-30);
 return {state:{lastId:message.id,lastText:message.text,lastAt:message.at,count:state.count+1,history},accepted:true,reason:null};
}
export function announcementIssues(state:AnnouncementState,expectedCount:number):AccessibilityIssue[]{
 const issues:AccessibilityIssue[]=[];const locale:Locale="en";
 const add=(code:IssueCode,detail:string)=>issues.push({fieldId:"announcement",code,severity:"error",detail,locale});
 if(state.count!==expectedCount)add("error-count-mismatch","Announcement count differs from expected count.");
 if(state.history.some((message)=>!message.text.trim()))add("announcement-empty","An announcement has no text.");
 for(let index=1;index<state.history.length;index++){
  const current=state.history[index]!,previous=state.history[index-1]!;
  if(current.id===previous.id&&current.text===previous.text)add("announcement-duplicate","Consecutive identical announcements were recorded.");
 }
 return issues;
}
export function fieldDescribedBy(descriptionId:string|null,errorId:string|null,hasError:boolean):string[]{
 const ids=[descriptionId,hasError?errorId:null].filter((id):id is string=>!!id);
 return [...new Set(ids)];
}
export function fieldAriaState(field:FormField,issues:readonly FieldIssue[]):{
 invalid:boolean;required:boolean;disabled:boolean;describedBy:string[];
}{
 const hasError=issues.some((item)=>item.fieldId===field.id&&item.severity==="error");
 return {invalid:hasError,required:field.required||field.rules.required===true,disabled:field.disabled,
  describedBy:field.description?[`${field.id}-description`,...(hasError?[`${field.id}-error`]:[])]:hasError?[`${field.id}-error`]:[]};
}
export function summaryLinkTarget(item:SummaryItem):string{return `#${encodeURIComponent(item.targetId)}`;}
export function errorTextId(fieldId:string):string{return `${fieldId}-error`;}
export function descriptionTextId(fieldId:string):string{return `${fieldId}-description`;}
