/** Bilingual, deterministic release custody reports with explicit uncertainty. */
import { validateCustody, canonicalCustody, compareCustody, custodyFingerprint } from './artifact-custody-core.mjs';
import { graphCustody } from './artifact-custody-links.mjs';

const COPY=Object.freeze({
  en:Object.freeze({title:'Offline artifact custody',caution:'This report compares recorded files. It does not establish accessibility or offline availability.',
    files:'Files',bytes:'Bytes',source:'Source',licence:'Licence',retrieved:'Retrieved',tier:'Source tier',
    unknown:'UNKNOWN',issues:'Issues',missing:'Missing',changed:'Changed',added:'Added',removed:'Removed',
    paths:'Paths',digest:'Digest',status:'State',noIssues:'No structural issues found',
    table:'Recorded file inventory',comparison:'Release changes',readOnly:'Read-only review'}),
  fr:Object.freeze({title:'Inventaire des fichiers hors ligne',
    caution:'Ce rapport compare des fichiers consignés. Il ne conclut rien sur l’accessibilité ni sur la disponibilité hors ligne.',
    files:'Fichiers',bytes:'Octets',source:'Source',licence:'Licence',retrieved:'Consulté',
    tier:'Niveau de source',unknown:'UNKNOWN',issues:'Problèmes',missing:'Manquant',changed:'Modifié',
    added:'Ajouté',removed:'Retiré',paths:'Chemins',digest:'Empreinte',status:'État',
    noIssues:'Aucun problème structurel relevé',table:'Inventaire des fichiers consignés',
    comparison:'Changements entre versions',readOnly:'Examen en lecture seule'})
});
export function localeMessages(locale='en'){return COPY[locale==='fr'?'fr':'en'];}
export function escapeHtml(value){return String(value).replace(/&/gu,'&amp;').replace(/</gu,'&lt;')
  .replace(/>/gu,'&gt;').replace(/"/gu,'&quot;').replace(/'/gu,'&#39;');}
export function csvCell(value){
  const text=String(value??'').replace(/\r\n?/gu,'\n');
  const safe=/^[\s]*[=+@-]/u.test(text)?`'${text}`:text;
  return `"${safe.replace(/"/gu,'""')}"`;
}
export function frenchLabel(label){return `${label}\u00A0:`;}
export function labelLine(label,value,locale){return `${label}${locale==='fr'?'\u00A0:':':'} ${value}`;}
export function displayState(state){return state??'UNKNOWN';}
export function custodyReportModel(manifest,options={}){
  const check=validateCustody(manifest,options);
  if(!check.ok)return {ok:false,problems:check.problems,rows:[],summary:null};
  const graph=graphCustody(manifest,options);
  const counts={PRESENT:0,CHANGED:0,MISSING:0,UNKNOWN:0};
  let bytes=0;
  const rows=canonicalCustody(manifest).files.map(f=>{
    counts[f.state]+=1;bytes+=f.bytes;
    return {path:f.path,kind:f.kind,bytes:f.bytes,state:f.state,sha256:f.sha256,
      references:f.references??[],provenance:f.provenance};
  });
  return {ok:graph.ok,problems:graph.problems,rows,
    summary:{count:rows.length,bytes,counts,reachable:graph.reachable.length,
      missing:graph.problems.filter(x=>x.code==='REFERENCE_MISSING').length},
    provenance:manifest.provenance,buildId:manifest.buildId};
}
export function textCustodyReport(manifest,locale='en',options={}){
  const lang=locale==='fr'?'fr':'en'; const c=localeMessages(lang);
  const report=custodyReportModel(manifest,options);
  const lines=[c.title,c.caution];
  if(!report.summary){
    lines.push(labelLine(c.issues,report.problems.length,lang));
    lines.push(...report.problems.map(x=>x.code));
    return lines.join('\n')+'\n';
  }
  lines.push(labelLine(c.files,report.summary.count,lang));
  lines.push(labelLine(c.bytes,report.summary.bytes,lang));
  lines.push(labelLine(c.source,report.provenance.source,lang));
  lines.push(labelLine(c.licence,report.provenance.licence,lang));
  lines.push(labelLine(c.retrieved,report.provenance.retrievedOn,lang));
  lines.push(labelLine(c.tier,report.provenance.tier,lang));
  lines.push(labelLine(c.issues,report.problems.length,lang));
  for(const r of report.rows) lines.push(`${r.path} | ${r.kind} | ${r.bytes} | ${displayState(r.state)} | ${r.sha256??'UNKNOWN'} | ${r.provenance.source} | ${r.provenance.licence} | ${r.provenance.retrievedOn} | ${r.provenance.tier}`);
  for(const problem of report.problems)lines.push(`${problem.code} | ${problem.path}`);
  return lines.join('\n')+'\n';
}
export function csvCustodyReport(manifest,locale='en',options={}){
  const report=custodyReportModel(manifest,options);
  if(!report.summary)return {ok:false,problems:report.problems,text:null};
  const c=localeMessages(locale);
  const heading=[c.paths,'Kind',c.bytes,c.status,c.digest,'References',c.source,c.licence,c.retrieved,c.tier];
  const lines=[heading.map(csvCell).join(',')];
  for(const row of report.rows){
    lines.push([row.path,row.kind,row.bytes,row.state,row.sha256??'UNKNOWN',row.references.join('; '),
      row.provenance.source,row.provenance.licence,row.provenance.retrievedOn,row.provenance.tier]
      .map(csvCell).join(','));
  }
  return {ok:report.ok,problems:report.problems,text:lines.join('\r\n')+'\r\n'};
}
export function htmlCustodyReport(manifest,locale='en',options={}){
  const lang=locale==='fr'?'fr':'en';const c=localeMessages(lang);
  const report=custodyReportModel(manifest,options);
  const headers=[c.paths,'Kind',c.bytes,c.status,c.digest,c.source,c.licence,c.retrieved,c.tier];
  const rows=report.rows.map(row=>`<tr><th scope="row">${escapeHtml(row.path)}</th>`+
    `<td>${escapeHtml(row.kind)}</td><td>${row.bytes}</td><td>${escapeHtml(row.state)}</td>`+
    `<td><code>${escapeHtml(row.sha256??'UNKNOWN')}</code></td>`+
    `<td>${escapeHtml(row.provenance.source)}</td><td>${escapeHtml(row.provenance.licence)}</td>`+
    `<td>${escapeHtml(row.provenance.retrievedOn)}</td><td>${escapeHtml(row.provenance.tier)}</td></tr>`).join('');
  const problems=report.problems.map(p=>`<li><code>${escapeHtml(p.code)}</code> ${escapeHtml(p.path)}</li>`).join('');
  const main=`<h1>${escapeHtml(c.title)}</h1><p>${escapeHtml(c.caution)}</p>`+
    `<section aria-labelledby="inventory-title"><h2 id="inventory-title">${escapeHtml(c.table)}</h2>`+
    `<table><caption>${escapeHtml(c.table)}</caption><thead><tr>${headers.map(h=>`<th scope="col">${escapeHtml(h)}</th>`).join('')}</tr></thead>`+
    `<tbody>${rows}</tbody></table></section><section aria-labelledby="issues-title">`+
    `<h2 id="issues-title">${escapeHtml(c.issues)}</h2><ul>${problems}</ul></section>`;
  const style='body{font:1rem/1.5 system-ui,sans-serif;max-width:75rem;margin:auto;padding:1.5rem}'+
    'table{border-collapse:collapse;display:block;overflow-x:auto}th,td{border:1px solid currentColor;padding:.6rem;text-align:start}'+
    ':focus-visible{outline:3px solid currentColor;outline-offset:3px}code{overflow-wrap:anywhere}';
  return {ok:report.ok,problems:report.problems,text:`<!doctype html><html lang="${lang}"><head>`+
    `<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">`+
    `<title>${escapeHtml(c.title)}</title><style>${style}</style></head><body><main>${main}</main></body></html>\n`};
}
export function jsonCustodyReport(manifest,options={}){
  const report=custodyReportModel(manifest,options);
  if(!report.summary)return {ok:false,problems:report.problems,text:null};
  const fingerprint=custodyFingerprint(manifest,options);
  return {ok:report.ok,problems:report.problems,text:JSON.stringify({
    version:1,buildId:report.buildId,summary:report.summary,
    provenance:report.provenance,fingerprint:fingerprint.fingerprint,
    files:report.rows,issues:report.problems},null,2)+'\n'};
}
export function textCustodyChanges(previous,next,locale='en',options={}){
  const c=localeMessages(locale);const comparison=compareCustody(previous,next,options);
  const lines=[c.comparison,c.caution];
  if(!comparison.ok){lines.push(...comparison.problems.map(x=>x.code));return lines.join('\n')+'\n';}
  for(const change of comparison.changes)lines.push(`${change.kind} | ${change.path}`);
  return lines.join('\n')+'\n';
}
