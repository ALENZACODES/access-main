/** Event-sourced review history for offline evidence cases. No writes occur. */
import { dayOrdinal, sortFindings } from "../p16-evidence-triage-round27/contracts.mjs";
import { CASE_STATES, EVENTS, caseIssues, object, safeDate, safeDescription, safeId } from "./model.mjs";

const DEFAULT_DATE="2026-11-19";
export const PERMITTED_TRANSITIONS=Object.freeze({
  OPEN:["NEEDS_SOURCE","NEEDS_LANGUAGE","NEEDS_CACHE","UNKNOWN","RESOLVED"],
  NEEDS_SOURCE:["OPEN","NEEDS_LANGUAGE","NEEDS_CACHE","UNKNOWN","RESOLVED"],
  NEEDS_LANGUAGE:["OPEN","NEEDS_SOURCE","NEEDS_CACHE","UNKNOWN","RESOLVED"],
  NEEDS_CACHE:["OPEN","NEEDS_SOURCE","NEEDS_LANGUAGE","UNKNOWN","RESOLVED"],
  RESOLVED:["OPEN","UNKNOWN"],
  UNKNOWN:["OPEN","NEEDS_SOURCE","NEEDS_LANGUAGE","NEEDS_CACHE"],
});

/** @param {unknown} event @param {string} [path] */
export function eventIssues(event,path="event"){
  const issues=[];
  if(!object(event))return [{code:"event.object",path}];
  if(!safeId(event.id))issues.push({code:"event.id",path:`${path}.id`});
  if(!safeId(event.caseId))issues.push({code:"event.caseId",path:`${path}.caseId`});
  if(!EVENTS.includes(event.type))issues.push({code:"event.type",path:`${path}.type`});
  if(!safeDate(event.occurredOn))issues.push({code:"event.date",path:`${path}.occurredOn`});
  if(!Number.isSafeInteger(event.sequence)||event.sequence<1)issues.push({code:"event.sequence",path:`${path}.sequence`});
  if(event.message!==undefined&&!safeDescription(event.message))issues.push({code:"event.message",path:`${path}.message`});
  if(event.toState!==undefined&&!CASE_STATES.includes(event.toState))issues.push({code:"event.toState",path:`${path}.toState`});
  if(event.type==="REVIEW"&&event.toState!==undefined)issues.push({code:"event.reviewTransition",path:`${path}.toState`});
  if(event.type==="RESOLVE"&&event.toState!=="RESOLVED")issues.push({code:"event.resolveState",path:`${path}.toState`});
  if(event.type==="REOPEN"&&event.toState!=="OPEN")issues.push({code:"event.reopenState",path:`${path}.toState`});
  return issues;
}

/** @param {unknown} events @param {{asOf?:string,maxEvents?:number}} [options] */
export function auditEventLog(events,options={}){
  const asOf=options.asOf??DEFAULT_DATE;
  const maxEvents=options.maxEvents??10000;
  if(!safeDate(asOf))throw new TypeError("Invalid assessment date");
  if(!Number.isSafeInteger(maxEvents)||maxEvents<1||maxEvents>50000)throw new TypeError("Invalid event limit");
  if(!Array.isArray(events))return {count:0,findings:[{code:"log.array",path:"events"}]};
  if(events.length>maxEvents)return {count:events.length,findings:[{code:"log.limit",path:"events"}]};
  const findings=[],ids=new Set(),groups=new Map(),today=dayOrdinal(asOf);
  for(const [index,event]of events.entries()){
    const path=`events[${index}]`;
    findings.push(...eventIssues(event,path));
    if(!object(event))continue;
    if(safeId(event.id)){
      if(ids.has(event.id))findings.push({code:"log.duplicateId",path:`${path}.id`});
      ids.add(event.id);
    }
    const date=dayOrdinal(event.occurredOn);
    if(date!==null&&date>today)findings.push({code:"log.futureDate",path:`${path}.occurredOn`});
    if(safeId(event.caseId)){
      const group=groups.get(event.caseId)??[];
      group.push({event,index,date});
      groups.set(event.caseId,group);
    }
  }
  for(const group of groups.values()){
    group.sort((a,b)=>a.event.sequence-b.event.sequence||a.index-b.index);
    let sequence=0,priorDate=null;
    for(const entry of group){
      const path=`events[${entry.index}]`;
      if(entry.event.sequence!==sequence+1)findings.push({code:"log.sequenceGap",path:`${path}.sequence`});
      if(priorDate!==null&&entry.date!==null&&entry.date<priorDate)findings.push({code:"log.dateRegressed",path:`${path}.occurredOn`});
      sequence=entry.event.sequence;
      priorDate=entry.date??priorDate;
    }
  }
  return {count:events.length,findings:sortFindings(findings.map(f=>({...f,severity:"error"}))).map(({code,path})=>({code,path}))};
}

/** @param {unknown} initialState @param {unknown} transition */
export function canTransition(initialState,transition){
  return typeof initialState === "string" && typeof transition === "string" &&
    CASE_STATES.includes(initialState) && CASE_STATES.includes(transition) &&
    PERMITTED_TRANSITIONS[initialState].includes(transition);
}

/** @param {unknown} initialState @param {unknown} event */
export function applyEvent(initialState,event){
  if(typeof initialState !== "string" || !CASE_STATES.includes(initialState))return {state:"UNKNOWN",reason:"state.invalid"};
  if(!object(event)||!EVENTS.includes(event.type))return {state:initialState,reason:"event.invalid"};
  if(event.type==="OPEN"&&event.toState===undefined)return {state:initialState,reason:null};
  if(event.toState===undefined)return {state:initialState,reason:null};
  if(event.type==="RESOLVE"&&event.toState!=="RESOLVED")return {state:initialState,reason:"transition.invalidResolve"};
  if(event.type==="REOPEN"&&event.toState!=="OPEN")return {state:initialState,reason:"transition.invalidReopen"};
  if(!canTransition(initialState,event.toState))return {state:initialState,reason:"transition.notAllowed"};
  return {state:event.toState,reason:null};
}

/** @param {unknown} initialState @param {unknown} events */
export function replayCase(initialState,events){
  if(!Array.isArray(events))return {state:"UNKNOWN",steps:[],rejected:["log.array"]};
  const steps=[],rejected=[];
  let state=typeof initialState === "string" && CASE_STATES.includes(initialState)?initialState:"UNKNOWN";
  for(const event of [...events].sort((a,b)=>(a?.sequence??0)-(b?.sequence??0))){
    const result=applyEvent(state,event);
    if(result.reason)rejected.push(result.reason);
    steps.push({sequence:event?.sequence??null,eventId:safeId(event?.id)?event.id:null,from:state,to:result.state,reason:result.reason});
    state=result.state;
  }
  return {state,steps,rejected};
}

/** @param {unknown} cases @param {unknown} events @param {object} [options] */
export function reconcileEventState(cases,events,options={}){
  const log=auditEventLog(events,options);
  if(!Array.isArray(cases))return {findings:[{code:"cases.array",path:"cases"},...log.findings],rows:[]};
  const findings=[...log.findings],rows=[];
  const byCase=new Map();
  if(Array.isArray(events))for(const event of events){
    if(!safeId(event?.caseId))continue;
    const arr=byCase.get(event.caseId)??[];
    arr.push(event);
    byCase.set(event.caseId,arr);
  }
  for(const [index,item]of cases.entries()){
    if(!object(item)||!safeId(item.id))continue;
    const history=byCase.get(item.id)??[];
    const replay=replayCase("OPEN",history);
    rows.push({id:item.id,stored:item.state,replayed:replay.state,events:history.length});
    if(replay.rejected.length)findings.push({code:"case.rejectedTransition",path:`cases[${index}].state`});
    if(history.length&&item.state!==replay.state)findings.push({code:"case.stateMismatch",path:`cases[${index}].state`});
  }
  const present=new Set(cases.filter(object).map(item=>item.id));
  for(const [id]of byCase)if(!present.has(id))findings.push({code:"log.orphanCase",path:"events"});
  return {findings,rows};
}

/** @param {unknown} cases @param {unknown} events */
export function eventStatistics(cases,events){
  const counts=Object.fromEntries(EVENTS.map(type=>[type,0]));
  let orphan=0,reviewed=0;
  const ids=new Set(Array.isArray(cases)?cases.filter(object).map(item=>item.id):[]);
  if(Array.isArray(events))for(const item of events){
    if(!object(item))continue;
    if(EVENTS.includes(item.type))counts[item.type]+=1;
    if(!ids.has(item.caseId))orphan+=1;
    if(item.type==="REVIEW")reviewed+=1;
  }
  return {count:Array.isArray(events)?events.length:0,counts,orphan,reviewed};
}

/** @param {unknown} events @param {string} caseId */
export function caseTimeline(events,caseId){
  if(!Array.isArray(events)||!safeId(caseId))return [];
  return events.filter(item=>object(item)&&item.caseId===caseId)
    .sort((a,b)=>a.sequence-b.sequence||String(a.id).localeCompare(String(b.id)))
    .map(item=>({id:item.id,sequence:item.sequence,date:item.occurredOn,type:item.type,toState:item.toState??null}));
}

/** @param {unknown} current @param {unknown} newEntry */
export function planAppend(current,newEntry){
  const events=Array.isArray(current)?current:[];
  const errors=eventIssues(newEntry);
  if(errors.length || !object(newEntry))return {accepted:false,reasons:errors.map(error=>error.code),events:[]};
  const existing=events.filter(event=>event?.caseId===newEntry.caseId);
  const maximum=existing.reduce((max,event)=>Math.max(max,event.sequence??0),0);
  if(newEntry.sequence!==maximum+1)return {accepted:false,reasons:["log.sequenceGap"],events:[]};
  if(events.some(event=>event?.id===newEntry.id))return {accepted:false,reasons:["log.duplicateId"],events:[]};
  const previous=existing.find(event=>event.sequence===maximum);
  if(previous&&dayOrdinal(newEntry.occurredOn)<dayOrdinal(previous.occurredOn))return {accepted:false,reasons:["log.dateRegressed"],events:[]};
  return {accepted:true,reasons:[],events:[...events,newEntry]};
}

/** @param {unknown} record @param {unknown} log */
export function historySafety(record,log){
  if(caseIssues(record).length || !object(record))return {decision:"HOLD",reasons:["case.invalid"]};
  const events=Array.isArray(log)?log:[];
  const audit=auditEventLog(events);
  if(audit.findings.length)return {decision:"HOLD",reasons:["history.invalid"]};
  const replay=replayCase("OPEN",events.filter(event=>event.caseId===record.id));
  if(replay.rejected.length)return {decision:"HOLD",reasons:["history.rejected"]};
  if(record.evidence==="UNKNOWN")return {decision:"UNKNOWN",reasons:["history.unknownEvidence"]};
  if(record.state==="RESOLVED"&&replay.state!=="RESOLVED")return {decision:"HOLD",reasons:["history.notResolved"]};
  return {decision:record.state==="RESOLVED"?"READY":"HOLD",reasons:record.state==="RESOLVED"?[]:["history.open"]};
}
