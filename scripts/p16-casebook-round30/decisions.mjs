/** Conservative review queue for evidence discrepancy cases. */
import { dayOrdinal } from "../p16-evidence-triage-round27/contracts.mjs";
import { auditCasebook, object, safeDate, safeId } from "./model.mjs";

export const DECISIONS = Object.freeze(["READY", "HOLD", "UNKNOWN"]);
export const ACTIONS = Object.freeze(["REQUEST_SOURCE", "REQUEST_TRANSLATION", "RECACHE", "REVIEW", "KEEP", "ARCHIVE"]);
const DEFAULT_DATE = "2026-11-19";

/** @param {unknown} raw */
export function decisionPolicy(raw = {}) {
  if (!object(raw)) throw new TypeError("Policy must be a plain object");
  const policy = {
    asOf: raw.asOf ?? DEFAULT_DATE,
    maximumAgeDays: raw.maximumAgeDays ?? 180,
    maximumCacheAgeDays: raw.maximumCacheAgeDays ?? 30,
    maximumOpenDays: raw.maximumOpenDays ?? 60,
    permitCommunity: raw.permitCommunity ?? false,
    requireCachedCopy: raw.requireCachedCopy ?? true,
  };
  if (!safeDate(policy.asOf)) throw new TypeError("Invalid policy date");
  for (const field of ["maximumAgeDays", "maximumCacheAgeDays", "maximumOpenDays"]) {
    if (!Number.isSafeInteger(policy[field]) || policy[field] < 0 || policy[field] > 36500) {
      throw new TypeError(`Invalid ${field}`);
    }
  }
  for (const field of ["permitCommunity", "requireCachedCopy"]) {
    if (typeof policy[field] !== "boolean") throw new TypeError(`Invalid ${field}`);
  }
  return Object.freeze(policy);
}

/** @param {unknown} reference @param {ReturnType<typeof decisionPolicy>} policy */
export function assessReference(reference, policy) {
  if (!object(reference)) return { decision:"HOLD", reasons:["reference.missing"] };
  if (reference.tier === "UNKNOWN" || reference.claim === "UNKNOWN") {
    return { decision:"UNKNOWN", reasons:["reference.unknown"] };
  }
  const reasons = [];
  if (!["PRIMARY","SECONDARY","COMMUNITY"].includes(reference.tier)) reasons.push("reference.invalidTier");
  if (reference.claim === "UNSUPPORTED") reasons.push("reference.unsupported");
  if (reference.tier === "COMMUNITY" && !policy.permitCommunity) reasons.push("reference.communityReview");
  const collected = dayOrdinal(reference.collectedOn);
  const today = dayOrdinal(policy.asOf);
  if (collected === null) reasons.push("reference.missingDate");
  else if (collected > today) reasons.push("reference.futureDate");
  else if (today - collected > policy.maximumAgeDays) reasons.push("reference.stale");
  return { decision:reasons.length ? "HOLD" : "READY", reasons };
}

/** @param {unknown} cache @param {ReturnType<typeof decisionPolicy>} policy */
export function assessCache(cache, policy) {
  if (!object(cache)) return {decision:"HOLD",reasons:["cache.missing"]};
  if (cache.state === "UNKNOWN") return {decision:"UNKNOWN",reasons:["cache.unknown"]};
  if (cache.state === "ABSENT") return {decision:policy.requireCachedCopy ? "HOLD":"READY",reasons:policy.requireCachedCopy ? ["cache.absent"]:[]};
  if (cache.state !== "PRESENT") return {decision:"HOLD",reasons:["cache.invalidState"]};
  const recorded = dayOrdinal(cache.capturedOn);
  const today = dayOrdinal(policy.asOf);
  const reasons = [];
  if (recorded === null) reasons.push("cache.missingDate");
  else if (recorded > today) reasons.push("cache.futureDate");
  else if (today - recorded > policy.maximumCacheAgeDays) reasons.push("cache.stale");
  return {decision:reasons.length ? "HOLD":"READY",reasons};
}

/** @param {Array<{decision:string}>} components */
export function joinDecisions(components) {
  if (components.some(component=>component.decision === "HOLD")) return "HOLD";
  if (components.some(component=>component.decision === "UNKNOWN")) return "UNKNOWN";
  return "READY";
}

/** @param {unknown} item @param {object} [options] */
export function assessCase(item, options = {}) {
  const policy = decisionPolicy(options);
  const findings = auditCasebook([item],{asOf:policy.asOf}).findings;
  if (findings.length || !object(item)) return {decision:"HOLD", reasons:[...new Set(findings.map(f=>f.code))].sort(), findings};
  if (item.state === "UNKNOWN" || item.evidence === "UNKNOWN" || item.severity === "unknown") {
    return {decision:"UNKNOWN",reasons:["case.uncertain"],findings:[]};
  }
  if (item.state !== "RESOLVED") return {decision:"HOLD",reasons:["case.open"],findings:[]};
  if (item.evidence === "UNSUPPORTED") return {decision:"HOLD",reasons:["case.unsupported"],findings:[]};
  const refs = item.references.map(reference=>assessReference(reference,policy));
  const cache = assessCache(item.cache,policy);
  const age = dayOrdinal(policy.asOf) - dayOrdinal(item.createdOn);
  const components = [...refs,cache];
  const reasons = [...new Set(components.flatMap(component=>component.reasons))].sort();
  if (age > policy.maximumOpenDays && item.updatedOn === item.createdOn) reasons.push("case.unreviewedAge");
  return {decision:reasons.length ? "HOLD":joinDecisions(components),reasons,findings:[]};
}

/** @param {unknown} cases @param {object} [options] */
export function assessCasebook(cases, options = {}) {
  const policy = decisionPolicy(options);
  const audit = auditCasebook(cases,{asOf:policy.asOf});
  if (!Array.isArray(cases)) return {decision:"HOLD",findings:audit.findings,rows:[],totals:{READY:0,HOLD:0,UNKNOWN:0}};
  const rows = cases.map((item,index)=>{
    const result=assessCase(item,policy);
    return {index,id:safeId(item?.id)?item.id:null,recordKey:safeId(item?.recordKey)?item.recordKey:null,decision:result.decision,reasons:result.reasons};
  });
  const totals={READY:0,HOLD:0,UNKNOWN:0};
  for(const row of rows)totals[row.decision]+=1;
  const decision = audit.findings.length ? "HOLD":joinDecisions(rows);
  return {decision,findings:audit.findings,rows,totals};
}

/** @param {unknown} item @param {object} [options] */
export function suggestedActions(item, options = {}) {
  const result = assessCase(item,options);
  if (result.decision === "READY") return ["KEEP"];
  if (result.decision === "UNKNOWN") return ["REVIEW"];
  const actions = new Set();
  if (!object(item)) return ["REVIEW"];
  if (item.state === "NEEDS_SOURCE" || result.reasons.some(r=>r.startsWith("reference."))) actions.add("REQUEST_SOURCE");
  if (item.state === "NEEDS_LANGUAGE" || result.reasons.some(r=>r.startsWith("copy.")||r.startsWith("fr."))) actions.add("REQUEST_TRANSLATION");
  if (item.state === "NEEDS_CACHE" || result.reasons.some(r=>r.startsWith("cache."))) actions.add("RECACHE");
  if (item.state === "RESOLVED" && item.evidence === "UNSUPPORTED") actions.add("ARCHIVE");
  actions.add("REVIEW");
  return ACTIONS.filter(action=>actions.has(action));
}

/** @param {unknown} cases @param {object} [options] */
export function workQueues(cases,options={}) {
  const result=assessCasebook(cases,options);
  const queues={READY:[],HOLD:[],UNKNOWN:[]};
  for(const row of result.rows)queues[row.decision].push(row.id);
  return queues;
}

/** @param {unknown} cases @param {object} [options] */
export function highPriorityQueue(cases,options={}) {
  if(!Array.isArray(cases))return [];
  const priority={critical:0,high:1,normal:2,low:3,unknown:4};
  return cases.map((item,index)=>({item,index,decision:assessCase(item,options).decision}))
    .filter(entry=>entry.decision!=="READY")
    .sort((a,b)=>(priority[a.item?.severity]??5)-(priority[b.item?.severity]??5)||a.index-b.index)
    .map(entry=>({id:entry.item?.id??null,decision:entry.decision,priority:entry.item?.severity??"unknown"}));
}

/** @param {unknown} cases @param {readonly string[]} dates @param {object} [options] */
export function windowReadiness(cases,dates,options={}) {
  if(!Array.isArray(dates)||dates.length>366)throw new TypeError("Invalid timeline");
  let previous=null;
  const output=[];
  for(const date of dates){
    const ordinal=dayOrdinal(date);
    if(ordinal===null||(previous!==null&&ordinal<=previous))throw new TypeError("Dates must increase");
    previous=ordinal;
    const result=assessCasebook(cases,{...options,asOf:date});
    output.push({date,decision:result.decision,totals:result.totals});
  }
  return output;
}

/** @param {ReturnType<typeof windowReadiness>} window */
export function readinessSignals(window) {
  const signals=[];
  for(let index=1;index<window.length;index+=1){
    const previous=window[index-1],current=window[index];
    if(previous.decision!==current.decision)signals.push({date:current.date,code:"decision.changed"});
    if(previous.totals.READY>current.totals.READY)signals.push({date:current.date,code:"ready.decreased"});
    if(previous.totals.HOLD<current.totals.HOLD)signals.push({date:current.date,code:"hold.increased"});
    if(previous.totals.UNKNOWN<current.totals.UNKNOWN)signals.push({date:current.date,code:"unknown.increased"});
  }
  return signals;
}

/** @param {unknown} cases @param {object} [options] */
export function publicDecisionSummary(cases,options={}) {
  const result=assessCasebook(cases,options);
  return {decision:result.decision,cases:result.rows.length,ready:result.totals.READY,hold:result.totals.HOLD,unknown:result.totals.UNKNOWN,findings:result.findings.length};
}
