/** In-memory edit session state for dirty-field tracking, touched state and local reset. */
import { type FormDefinition, mergeFormValues, formValueDigest } from "./p20ah-form-validation.ts";
export interface SessionState {
 readonly initial:FormDefinition; readonly current:FormDefinition;
 readonly baselineDigest:string; readonly touched:readonly string[];
 readonly dirty:readonly string[]; readonly submitAttempts:number;
 readonly revision:number; readonly lastChangedId:string|null;
}
export interface SessionTransition {
 readonly state:SessionState; readonly accepted:boolean; readonly reason:string|null;
}
export function createSession(form:FormDefinition):SessionState{
 return {initial:form,current:form,baselineDigest:formValueDigest(form),touched:[],dirty:[],
  submitAttempts:0,revision:0,lastChangedId:null};
}
function transition(state:SessionState,current:FormDefinition,touched:readonly string[],submitAttempts:number,lastChangedId:string|null):SessionTransition{
 const dirty=current.fields.filter((field)=>{
  const initial=state.initial.fields.find((item)=>item.id===field.id);
  return initial!==undefined&&initial.value!==field.value;
 }).map((field)=>field.id);
 return {state:{...state,current,touched:[...new Set(touched)],dirty,submitAttempts,
  revision:state.revision+1,lastChangedId},accepted:true,reason:null};
}
function reject(state:SessionState,reason:string):SessionTransition{return {state,accepted:false,reason};}
export function changeSessionField(state:SessionState,fieldId:string,value:string):SessionTransition{
 const field=state.current.fields.find((item)=>item.id===fieldId);
 if(!field)return reject(state,"session.field.missing");
 if(field.disabled||field.hidden)return reject(state,"session.field.unavailable");
 if(value.length>4096)return reject(state,"session.value.limit");
 const current=mergeFormValues(state.current,{[fieldId]:value});
 return transition(state,current,state.touched,state.submitAttempts,fieldId);
}
export function touchSessionField(state:SessionState,fieldId:string):SessionTransition{
 const field=state.current.fields.find((item)=>item.id===fieldId);
 if(!field||field.disabled||field.hidden)return reject(state,"session.field.unavailable");
 return transition(state,state.current,[...state.touched,fieldId],state.submitAttempts,fieldId);
}
export function recordSubmitAttempt(state:SessionState):SessionTransition{
 return transition(state,state.current,state.touched,state.submitAttempts+1,null);
}
export function resetSession(state:SessionState):SessionTransition{
 const current={...state.initial,fields:state.initial.fields.map((field)=>({...field}))};
 return transition(state,current,[],0,null);
}
export function commitSessionBaseline(state:SessionState):SessionTransition{
 const current=state.current;
 const next={...state,initial:current,baselineDigest:formValueDigest(current)};
 return {state:{...next,dirty:[],touched:[],revision:state.revision+1,lastChangedId:null},accepted:true,reason:null};
}
export function sessionIsDirty(state:SessionState):boolean{return state.dirty.length>0;}
export function sessionFieldIsDirty(state:SessionState,fieldId:string):boolean{return state.dirty.includes(fieldId);}
export function sessionFieldWasTouched(state:SessionState,fieldId:string):boolean{return state.touched.includes(fieldId);}
export function sessionDigest(state:SessionState):string{return formValueDigest(state.current);}
export function sessionChangedFields(state:SessionState):readonly string[]{return state.dirty;}
export function sessionSummary(state:SessionState):string{
 return [`Dirty fields: ${state.dirty.length}`,`Touched fields: ${state.touched.length}`,
  `Submit attempts: ${state.submitAttempts}`,`Revision: ${state.revision}`,
  `Changed: ${state.lastChangedId??"UNKNOWN"}`].join("\n");
}
