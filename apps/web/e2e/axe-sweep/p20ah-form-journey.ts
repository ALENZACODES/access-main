/** Local form-editing journey state; validation never sends or stores user-entered values. */
import { type FormDefinition, type FormResult, type ValidationPolicy, DEFAULT_POLICY, validateForm, mergeFormValues, clearFieldValue } from "./p20ah-form-validation.ts";
export type Phase="editing"|"checking"|"needs-correction"|"ready"|"reviewed";
export type Event =
 | {type:"change";fieldId:string;value:string;at:number}
 | {type:"check";at:number}
 | {type:"focus-summary";at:number;targetId:string|null}
 | {type:"focus-field";at:number;fieldId:string}
 | {type:"clear";fieldId:string;at:number}
 | {type:"reset";at:number}
 | {type:"review";at:number};
export interface JourneyState {
 readonly form:FormDefinition; readonly phase:Phase; readonly result:FormResult|null;
 readonly focusedId:string|null; readonly revision:number; readonly lastAt:number|null;
 readonly history:readonly JourneyRecord[]; readonly lastReason:string|null;
}
export interface JourneyRecord {
 readonly event:Event["type"]; readonly at:number; readonly fieldId:string|null;
 readonly phase:Phase; readonly revision:number; readonly errorCount:number;
}
export interface Transition {
 readonly state:JourneyState; readonly accepted:boolean; readonly reason:string|null;
}
const MAX_HISTORY=100;
export function initialJourney(form:FormDefinition):JourneyState{
 return {form,phase:"editing",result:null,focusedId:null,revision:0,lastAt:null,history:[],lastReason:null};
}
function reject(state:JourneyState,reason:string):Transition{return {state:{...state,lastReason:reason},accepted:false,reason};}
function append(state:JourneyState,event:Event,form:FormDefinition,phase:Phase,result:FormResult|null,focusedId:string|null):Transition{
 const revision=state.revision+1;
 const record:JourneyRecord={event:event.type,at:event.at,fieldId:"fieldId" in event?event.fieldId:null,
  phase,revision,errorCount:result?.errorCount??0};
 return {state:{form,phase,result,focusedId,revision,lastAt:event.at,
  history:[...state.history,record].slice(-MAX_HISTORY),lastReason:null},accepted:true,reason:null};
}
export function stepJourney(state:JourneyState,event:Event,policy:ValidationPolicy=DEFAULT_POLICY):Transition{
 if(!Number.isSafeInteger(event.at)||event.at<0)return reject(state,"journey.time.invalid");
 if(state.lastAt!==null&&event.at<state.lastAt)return reject(state,"journey.time.reversed");
 if(event.type==="change"){
  const field=state.form.fields.find((item)=>item.id===event.fieldId);
  if(!field)return reject(state,"journey.field.missing");
  if(field.disabled||field.hidden)return reject(state,"journey.field.unavailable");
  if(event.value.length>policy.maximumValueLength)return reject(state,"journey.value.limit");
  const form=mergeFormValues(state.form,{[event.fieldId]:event.value});
  const result=state.result?validateForm(form,policy):null;
  const phase=result?(result.valid?"ready":"needs-correction"):"editing";
  return append(state,event,form,phase,result,event.fieldId);
 }
 if(event.type==="check"){
  const result=validateForm(state.form,policy);
  return append(state,event,state.form,result.valid?"ready":"needs-correction",result,
   result.valid?state.focusedId:result.firstInvalidFieldId);
 }
 if(event.type==="focus-summary"){
  if(!state.result||state.result.errorCount===0)return reject(state,"journey.summary.not-needed");
  if(event.targetId===null)return reject(state,"journey.summary.target.missing");
  return append(state,event,state.form,state.phase,state.result,event.targetId);
 }
 if(event.type==="focus-field"){
  const field=state.form.fields.find((item)=>item.id===event.fieldId);
  if(!field||field.hidden||field.disabled)return reject(state,"journey.focus.field.unavailable");
  return append(state,event,state.form,state.phase,state.result,event.fieldId);
 }
 if(event.type==="clear"){
  if(!state.form.fields.some((field)=>field.id===event.fieldId))return reject(state,"journey.field.missing");
  const form=clearFieldValue(state.form,event.fieldId);
  const result=state.result?validateForm(form,policy):null;
  return append(state,event,form,result?(result.valid?"ready":"needs-correction"):"editing",result,event.fieldId);
 }
 if(event.type==="reset"){
  const form={...state.form,fields:state.form.fields.map((field)=>({...field,value:""}))};
  return append(state,event,form,"editing",null,null);
 }
 if(event.type==="review"){
  if(!state.result)return reject(state,"journey.review.before-check");
  return append(state,event,state.form,state.phase==="ready"?"reviewed":state.phase,state.result,state.focusedId);
 }
 return reject(state,"journey.event.unsupported");
}
export function replayJourney(form:FormDefinition,events:readonly Event[],policy:ValidationPolicy=DEFAULT_POLICY):{
 state:JourneyState;accepted:number;rejected:readonly {index:number;reason:string}[];
}{
 let state=initialJourney(form),accepted=0;const rejected:Array<{index:number;reason:string}>=[];
 events.forEach((event,index)=>{const result=stepJourney(state,event,policy);if(result.accepted){state=result.state;accepted++;}else rejected.push({index,reason:result.reason??"journey.rejected"});});
 return {state,accepted,rejected};
}
export function journeySummary(state:JourneyState):string{
 return [`Phase: ${state.phase}`,`Revision: ${state.revision}`,`Errors: ${state.result?.errorCount??0}`,
  `Focused: ${state.focusedId??"UNKNOWN"}`,`History: ${state.history.length}`].join("\n");
}
export function journeyCanReview(state:JourneyState):boolean{return state.result!==null&&state.result.valid;}
export function journeyCanEdit(state:JourneyState):boolean{return state.phase!=="reviewed";}
export function journeyLastError(state:JourneyState):string|null{return state.result?.issues[0]?.code??null;}
export function journeyFieldHistory(state:JourneyState,fieldId:string):JourneyRecord[]{
 return state.history.filter((record)=>record.fieldId===fieldId);
}
