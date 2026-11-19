/** Non-destructive comparison of prior and candidate discrepancy casebooks. */
import { dayOrdinal } from "../p16-evidence-triage-round27/contracts.mjs";
import { auditCasebook, object, safeId } from "./model.mjs";
import { assessCase, decisionPolicy } from "./decisions.mjs";

export const PROPOSALS=Object.freeze(["ADD","RETAIN","UPDATE","REVIEW","RETIRE"]);
const FIELDS=["state","severity","evidence","createdOn","updatedOn","recordKey"];

/** Compare only the bounded visible case contract, never hidden object data. */
export function comparisonReasons(before,after){
  if(!object(before)||!object(after))return ["record.missing"];
  const reasons=[];
  for(const field of FIELDS){
    if(before[field]!==after[field])reasons.push(`record.${field}Changed`);
  }
  for(const field of ["title","summary"]){
    for(const language of ["en","fr"]){
      if(before[field]?.[language]!==after[field]?.[language])reasons.push(`copy.${field}.${language}Changed`);
    }
  }
  const beforeSources=Array.isArray(before.references)?before.references:[];
  const afterSources=Array.isArray(after.references)?after.references:[];
  const ids=arr=>arr.map(item=>item?.id).sort().join("|");
  if(ids(beforeSources)!==ids(afterSources))reasons.push("reference.membershipChanged");
  const oldById=new Map(beforeSources.filter(object).map(item=>[item.id,item]));
  for(const source of afterSources){
    const old=oldById.get(source?.id);
    if(!old)continue;
    for(const field of ["publisher","url","licence","collectedOn","tier","claim"]){
      if(old[field]!==source[field])reasons.push(`reference.${field}Changed`);
    }
  }
  const previousCache=before.cache??{},nextCache=after.cache??{};
  for(const field of ["state","path","capturedOn","bytes"]){
    if(previousCache[field]!==nextCache[field])reasons.push(`cache.${field}Changed`);
  }
  return [...new Set(reasons)].sort();
}

/** @param {unknown} previous @param {unknown} candidate @param {object} [options] */
export function compareCasebooks(previous,candidate,options={}){
  const policy=decisionPolicy(options);
  const oldAudit=auditCasebook(previous,{asOf:policy.asOf});
  const newAudit=auditCasebook(candidate,{asOf:policy.asOf});
  const findings=[...oldAudit.findings.map(f=>({...f,snapshot:"before"})),...newAudit.findings.map(f=>({...f,snapshot:"after"}))];
  if(!Array.isArray(previous)||!Array.isArray(candidate))return {decision:"HOLD",findings,changes:[]};
  const byId=arr=>new Map(arr.filter(item=>object(item)&&safeId(item.id)).map(item=>[item.id,item]));
  const oldItems=byId(previous),newItems=byId(candidate);
  const keys=[...new Set([...oldItems.keys(),...newItems.keys()])].sort();
  const changes=[];
  for(const id of keys){
    const before=oldItems.get(id),after=newItems.get(id);
    if(!before){
      const result=assessCase(after,policy);
      changes.push({id,action:result.decision==="READY"?"ADD":"REVIEW",reasons:result.reasons});
      continue;
    }
    if(!after){
      changes.push({id,action:"RETIRE",reasons:["case.absentFromCandidate"]});
      continue;
    }
    const reasons=comparisonReasons(before,after);
    if(!reasons.length){
      changes.push({id,action:"RETAIN",reasons:[]});
      continue;
    }
    const result=assessCase(after,policy);
    const priorDate=dayOrdinal(before.updatedOn),nextDate=dayOrdinal(after.updatedOn);
    if(priorDate!==null&&nextDate!==null&&nextDate<priorDate){
      changes.push({id,action:"REVIEW",reasons:[...reasons,"case.dateRegressed"]});
      findings.push({code:"change.dateRegressed",path:`cases.${id}.updatedOn`,snapshot:"after"});
      continue;
    }
    if(before.evidence==="UNKNOWN"&&after.evidence==="SUPPORTED"){
      changes.push({id,action:"REVIEW",reasons:[...reasons,"case.uncertaintyUpgrade"]});
      continue;
    }
    changes.push({id,action:result.decision==="READY"?"UPDATE":"REVIEW",reasons:[...reasons,...result.reasons]});
  }
  const decision=findings.length?"HOLD":changes.some(item=>item.action==="REVIEW")?"UNKNOWN":"READY";
  return {decision,findings,changes};
}

export function proposalTotals(comparison){
  const totals=Object.fromEntries(PROPOSALS.map(proposal=>[proposal,0]));
  if(!object(comparison)||!Array.isArray(comparison.changes))return totals;
  for(const item of comparison.changes)if(PROPOSALS.includes(item.action))totals[item.action]+=1;
  return totals;
}

export function changedCachePaths(previous,candidate,options={}){
  const comparison=compareCasebooks(previous,candidate,options);
  if(comparison.findings.length)return [];
  const candidates=new Map(Array.isArray(candidate)?candidate.map(item=>[item?.id,item]):[]);
  return comparison.changes.filter(entry=>entry.action==="UPDATE"||entry.action==="ADD")
    .map(entry=>candidates.get(entry.id)?.cache?.path)
    .filter(path=>typeof path==="string")
    .sort();
}

export function retirementQueue(previous,candidate,options={}){
  const comparison=compareCasebooks(previous,candidate,options);
  if(comparison.findings.length)return [];
  return comparison.changes.filter(item=>item.action==="RETIRE").map(item=>item.id);
}

export function reviewQueue(previous,candidate,options={}){
  return compareCasebooks(previous,candidate,options).changes
    .filter(item=>item.action==="REVIEW")
    .map(item=>({id:item.id,reasons:item.reasons}));
}

export function comparisonIsReadOnly(previous,candidate,options={}){
  const before=JSON.stringify(previous),after=JSON.stringify(candidate);
  compareCasebooks(previous,candidate,options);
  return before===JSON.stringify(previous)&&after===JSON.stringify(candidate);
}

export function auditChanges(previous,candidate,options={}){
  const comparison=compareCasebooks(previous,candidate,options);
  return {
    decision:comparison.decision,errors:comparison.findings.length,
    proposals:proposalTotals(comparison),
    review:reviewQueue(previous,candidate,options).length,
  };
}

export function proposedCacheBudget(previous,candidate,options={}){
  const comparison=compareCasebooks(previous,candidate,options);
  if(comparison.findings.length)return {decision:"HOLD",bytes:null,resources:0};
  const candidateMap=new Map(candidate.map(item=>[item.id,item]));
  let bytes=0;
  const paths=new Set();
  for(const entry of comparison.changes){
    if(!["ADD","UPDATE","RETAIN"].includes(entry.action))continue;
    const cache=candidateMap.get(entry.id)?.cache;
    if(cache?.state!=="PRESENT"||!Number.isSafeInteger(cache.bytes))continue;
    if(paths.has(cache.path))continue;
    paths.add(cache.path);
    bytes+=cache.bytes;
  }
  return {decision:comparison.decision,bytes,resources:paths.size};
}
