/** Safe, deterministic, read-only casebook handoff formats. */
import { dayOrdinal } from "../p16-evidence-triage-round27/contracts.mjs";
import { auditCasebook, casebookInventory, object, safeId } from "./model.mjs";
import { assessCasebook, suggestedActions } from "./decisions.mjs";
import { auditEventLog, caseTimeline, eventStatistics } from "./events.mjs";

export const CSV_FIELDS=Object.freeze([
  "case_id","record_key","state","severity","evidence","created_on","updated_on",
  "source_count","source_tiers","source_licences","latest_collected_on",
  "cache_state","cache_path","cache_captured_on","decision","actions",
]);
export const HISTORY_FIELDS=Object.freeze(["case_id","event_id","sequence","occurred_on","event_type","to_state"]);
const MAX_REPORT_BYTES=12_000_000;

/** Remove ASCII control codes without regex control escapes. */
export function displayText(value){
  if(value===null||value===undefined)return "";
  if(typeof value!=="string"&&typeof value!=="number"&&typeof value!=="boolean")return "";
  const output=String(value);
  let text="";
  for(let index=0;index<output.length;index+=1){
    const unit=output.charCodeAt(index);
    if(unit<32||unit===127||(unit>=128&&unit<=159))continue;
    text+=output[index];
  }
  return text.normalize("NFC");
}

/** Prevent spreadsheet applications from interpreting untrusted cell values. */
export function spreadsheetCell(value){
  const text=displayText(value);
  const trimmed=text.trimStart();
  if(trimmed&&["=","+","-","@"].includes(trimmed[0]))return `'${text}`;
  return text;
}

export function csvCell(value){return `"${spreadsheetCell(value).replaceAll('"','""')}"`;}
export function csvLine(values){return values.map(csvCell).join(",");}

/** @param {unknown} item @param {string} decision @param {object} [options] */
export function caseExportRow(item,decision,options={}){
  if(!object(item))return null;
  const references=Array.isArray(item.references)?item.references:[];
  const dates=references.map(reference=>reference?.collectedOn)
    .filter(value=>dayOrdinal(value)!==null).sort();
  const tiers=[...new Set(references.map(reference=>reference?.tier).filter(Boolean))].sort();
  const licences=[...new Set(references.map(reference=>reference?.licence).filter(Boolean))].sort();
  return {
    case_id:item.id??"",record_key:item.recordKey??"",state:item.state??"",
    severity:item.severity??"unknown",evidence:item.evidence??"UNKNOWN",
    created_on:item.createdOn??"",updated_on:item.updatedOn??"",
    source_count:references.length,source_tiers:tiers.join("|"),source_licences:licences.join("|"),
    latest_collected_on:dates.at(-1)??"",cache_state:item.cache?.state??"UNKNOWN",
    cache_path:item.cache?.state==="PRESENT"?item.cache.path??"":"",
    cache_captured_on:item.cache?.state==="PRESENT"?item.cache.capturedOn??"":"",
    decision,actions:suggestedActions(item,options).join("|"),
  };
}

/** Export is blocked for structurally incomplete casebooks. */
export function exportCasebookCsv(cases,options={}){
  const assessment=assessCasebook(cases,options);
  if(assessment.findings.length)return {csv:"",decision:"HOLD",findings:assessment.findings};
  const ordered=assessment.rows.map(row=>({index:row.index,id:row.id,decision:row.decision}))
    .sort((a,b)=>String(a.id).localeCompare(String(b.id),"en"));
  const rows=ordered.map(row=>caseExportRow(cases[row.index],row.decision,options));
  const lines=[csvLine(CSV_FIELDS),...rows.map(row=>csvLine(CSV_FIELDS.map(field=>row[field])))];
  const csv=lines.join("\r\n")+"\r\n";
  if(new TextEncoder().encode(csv).length>MAX_REPORT_BYTES)return {csv:"",decision:"HOLD",findings:[{code:"export.size",path:"cases"}]};
  return {csv,decision:assessment.decision,findings:[]};
}

/** JSON payload intentionally excludes private descriptions and source URLs. */
export function safeCasebookObject(cases,options={}){
  const assessed=assessCasebook(cases,options);
  return {
    schema:"p16-casebook-v1",
    asOf:options.asOf??"2026-11-19",
    status:assessed.decision,
    inventory:casebookInventory(cases),
    decisions:assessed.rows.map(row=>({id:row.id,recordKey:row.recordKey,decision:row.decision,reasons:row.reasons})),
    diagnostics:assessed.findings,
  };
}

export function exportCasebookJson(cases,options={}){
  return JSON.stringify(safeCasebookObject(cases,options),null,2)+"\n";
}

export function exportCasebookJsonl(cases,options={}){
  const assessed=assessCasebook(cases,options);
  if(assessed.findings.length)return {content:"",decision:"HOLD",findings:assessed.findings};
  const rows=assessed.rows.map(row=>caseExportRow(cases[row.index],row.decision,options));
  return {content:rows.map(row=>JSON.stringify(row)).join("\n")+(rows.length?"\n":""),decision:assessed.decision,findings:[]};
}

export function exportHistoryCsv(events,options={}){
  const audited=auditEventLog(events,options);
  if(audited.findings.length)return {csv:"",findings:audited.findings};
  const sorted=[...events].sort((a,b)=>String(a.caseId).localeCompare(String(b.caseId),"en")||a.sequence-b.sequence);
  const lines=[csvLine(HISTORY_FIELDS)];
  for(const item of sorted)lines.push(csvLine([item.caseId,item.id,item.sequence,item.occurredOn,item.type,item.toState??""]));
  return {csv:lines.join("\r\n")+"\r\n",findings:[]};
}

/** Source metadata is counted, never echoed in diagnostic logs. */
export function privacyAudit(cases,events=[],options={}){
  const summary=safeCasebookObject(cases,options);
  const history=eventStatistics(cases,events);
  return {
    schema:summary.schema,status:summary.status,
    cases:summary.inventory.count,unknown:summary.inventory.unknown,
    eventCount:history.count,orphanEvents:history.orphan,
    reviewEvents:history.reviewed,structuralFindings:summary.diagnostics.length,
  };
}

/** @param {unknown} cases @param {unknown} events @param {object} [options] */
export function buildHandoff(cases,events,options={}){
  const audit=auditCasebook(cases,options);
  const timeline=auditEventLog(events,options);
  const summary=safeCasebookObject(cases,options);
  const decision=audit.findings.length||timeline.findings.length?"HOLD":summary.status;
  return {
    decision,
    issues:[...audit.findings,...timeline.findings],
    contents:{cases:summary.decisions,events:Array.isArray(events)?events.length:0},
    exports:decision==="HOLD"?{csv:"",jsonl:""}:{
      csv:exportCasebookCsv(cases,options).csv,
      jsonl:exportCasebookJsonl(cases,options).content,
    },
  };
}

/** @param {unknown} cases @param {unknown} events @param {object} [options] */
export function handoffChecklist(cases,events,options={}){
  const audit=auditCasebook(cases,options);
  const history=auditEventLog(events,options);
  const assessed=assessCasebook(cases,options);
  const gates=[
    {id:"cases",status:audit.findings.length?"HOLD":"READY",count:audit.findings.length},
    {id:"history",status:history.findings.length?"HOLD":"READY",count:history.findings.length},
    {id:"decisions",status:assessed.decision,count:assessed.rows.length},
  ];
  const decision=gates.some(item=>item.status==="HOLD")?"HOLD":gates.some(item=>item.status==="UNKNOWN")?"UNKNOWN":"READY";
  return {decision,gates};
}

/** @param {unknown} cases @param {unknown} events */
export function caseIndex(cases,events){
  const rows=[];
  if(!Array.isArray(cases))return rows;
  for(const item of cases){
    if(!object(item)||!safeId(item.id))continue;
    const timeline=caseTimeline(events,item.id);
    rows.push({id:item.id,recordKey:item.recordKey,state:item.state,eventCount:timeline.length,lastEvent:timeline.at(-1)?.date??null});
  }
  return rows.sort((a,b)=>a.id.localeCompare(b.id,"en"));
}

export function exportAuditCsv(cases,events=[],options={}){
  const report=privacyAudit(cases,events,options);
  const fields=["status","cases","unknown","eventCount","orphanEvents","reviewEvents","structuralFindings"];
  return csvLine(fields)+"\r\n"+csvLine(fields.map(field=>report[field]))+"\r\n";
}

export function reportSize(report){return new TextEncoder().encode(typeof report==="string"?report:JSON.stringify(report)).length;}

export function safeReportFilename(name,extension="csv"){
  if(typeof name!=="string"||typeof extension!=="string")return null;
  if(!/^[a-z0-9][a-z0-9-]{0,60}$/i.test(name))return null;
  if(!["csv","json","jsonl"].includes(extension))return null;
  return `${name}.${extension}`;
}
