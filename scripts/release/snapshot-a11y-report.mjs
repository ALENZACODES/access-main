/** Deterministic bilingual output for local interaction snapshots. */
import { Buffer } from 'node:buffer';
import { analyzeSnapshots, coverageMatrix, languageParity, compareReviews } from './snapshot-a11y-analysis.mjs';

const COPY = Object.freeze({
  en:Object.freeze({ title:'Interaction snapshot review',caution:'Captured UI evidence is not a claim about a physical place.',route:'Route',language:'Language',network:'Network',control:'Control',role:'Role',rule:'Check',status:'Recorded result',source:'Source',licence:'Licence',retrieved:'Retrieved',tier:'Source review tier',note:'Human review is required before publication.',missing:'Missing observations',changes:'Changes',previous:'Previous',next:'Next',empty:'No captured evidence',unknown:'UNKNOWN' }),
  fr:Object.freeze({ title:'Examen des captures d’interaction',caution:'Les captures d’interface ne décrivent pas l’accessibilité d’un lieu physique.',route:'Parcours',language:'Langue',network:'Réseau',control:'Commande',role:'Rôle',rule:'Contrôle',status:'Résultat consigné',source:'Source',licence:'Licence',retrieved:'Consulté',tier:'Niveau d’examen de la source',note:'Un examen humain est nécessaire avant la publication.',missing:'Observations manquantes',changes:'Changements',previous:'Avant',next:'Après',empty:'Aucune capture disponible',unknown:'UNKNOWN' }),
});
const MAX_REPORT = 12_000_000;
export function copy(language='en'){return COPY[language==='fr'?'fr':'en'];}
export function htmlEscape(value){return String(value??'').replace(/&/gu,'&amp;').replace(/</gu,'&lt;').replace(/>/gu,'&gt;').replace(/"/gu,'&quot;').replace(/'/gu,'&#39;');}
export function cleanCell(value){return String(value??'').replaceAll('\r',' ').replaceAll('\n',' ').replaceAll('\t',' ');}
export function csvCell(value){const raw=cleanCell(value);const safe=/^\s*[=+@-]/u.test(raw)?`'${raw}`:raw;return `"${safe.replaceAll('"','""')}"`;}
export function csvRow(fields){return fields.map(csvCell).join(',');}
export function labelColon(language){return language==='fr'?'\u00a0:':':';}
function bounded(text){return Buffer.byteLength(text,'utf8')<=MAX_REPORT?{ok:true,text,problems:[]}:{ok:false,text:null,problems:[{code:'REPORT_LIMIT',path:'/'}]};}
export function reportRows(value,options={}){
 const a=analyzeSnapshots(value,options);
 if(!a.ok)return {ok:false,problems:a.problems,rows:[]};
 const rows=[];
 for(const item of a.reviews){
  for(const control of item.controls)for(const [rule,status] of Object.entries(control.rules))rows.push({route:item.route,language:item.language,environment:item.environment,control:control.id,role:control.role,rule,status,source:item.provenance.source,licence:item.provenance.licence,retrieved:item.provenance.retrievedOn,tier:item.provenance.tier});
  for(const [rule,status] of Object.entries(item.rules).filter(([rule])=>['ANNOUNCEMENTS','OFFLINE_SHELL','STORAGE_READ','ASSET_AVAILABILITY'].includes(rule)))rows.push({route:item.route,language:item.language,environment:item.environment,control:'UNKNOWN',role:'UNKNOWN',rule,status,source:item.provenance.source,licence:item.provenance.licence,retrieved:item.provenance.retrievedOn,tier:item.provenance.tier});
 }
 return {ok:true,problems:[],rows};
}
const FIELDS=['route','language','network','control','role','rule','status','source','licence','retrieved','tier'];
export function exportCsv(value,language='en',options={}){
 const r=reportRows(value,options);if(!r.ok)return {ok:false,text:null,problems:r.problems};
 const c=copy(language);
 const lines=[csvRow(FIELDS.map(x=>c[x]))];
 for(const row of r.rows)lines.push(csvRow([row.route,row.language,row.environment,row.control,row.role,row.rule,row.status,row.source,row.licence,row.retrieved,row.tier]));
 return bounded(lines.join('\r\n')+'\r\n');
}
export function exportText(value,language='en',options={}){
 const a=analyzeSnapshots(value,options);if(!a.ok)return {ok:false,text:null,problems:a.problems};
 const c=copy(language),p=labelColon(language);
 const lines=[c.title,c.caution,`${c.status}${p} ${a.summary.states.FAIL} FAIL, ${a.summary.states.UNKNOWN} UNKNOWN`,c.note];
 if(!a.reviews.length)lines.push(c.empty);
 for(const item of a.reviews){
  lines.push('',`${c.route}${p} ${item.route}`,`${c.language}${p} ${item.language}`,`${c.network}${p} ${item.environment}`,`${c.status}${p} ${item.overall}`,`${c.source}${p} ${item.provenance.source}`,`${c.licence}${p} ${item.provenance.licence}`,`${c.retrieved}${p} ${item.provenance.retrievedOn}`,`${c.tier}${p} ${item.provenance.tier}`);
  for(const [rule,status] of Object.entries(item.rules))lines.push(`${rule}${p} ${status}`);
 }
 return bounded(lines.join('\n')+'\n');
}
export function exportHtml(value,language='en',options={}){
 const rows=reportRows(value,options);if(!rows.ok)return {ok:false,text:null,problems:rows.problems};
 const c=copy(language),lang=language==='fr'?'fr':'en';
 const body=rows.rows.map(row=>`<tr>${[row.route,row.language,row.environment,row.control,row.role,row.rule,row.status,row.source,row.licence,row.retrieved,row.tier].map(x=>`<td>${htmlEscape(x)}</td>`).join('')}</tr>`).join('\n');
 const headers=FIELDS.map(key=>`<th scope="col">${htmlEscape(c[key])}</th>`).join('');
 const html=`<!doctype html>\n<html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${htmlEscape(c.title)}</title><style>:focus-visible{outline:3px solid currentColor;outline-offset:3px}table{border-collapse:collapse;width:100%}th,td{padding:.75rem;border:1px solid currentColor;text-align:left}button,a{min-width:44px;min-height:44px}main{max-width:80rem;margin:auto;padding:1rem;overflow-wrap:anywhere}</style></head><body><main><h1>${htmlEscape(c.title)}</h1><p role="note">${htmlEscape(c.caution)}</p><p>${htmlEscape(c.note)}</p><table><caption>${htmlEscape(c.title)}</caption><thead><tr>${headers}</tr></thead><tbody>${body}</tbody></table></main></body></html>\n`;
 return bounded(html);
}
export function exportJson(value,options={}){
 const a=analyzeSnapshots(value,options);if(!a.ok)return {ok:false,text:null,problems:a.problems};
 const parity=languageParity(value,options),coverage=coverageMatrix(value,options);
 return bounded(`${JSON.stringify({version:1,summary:a.summary,reviews:a.reviews,languageParity:parity.pairs,coverage:coverage.rows,fingerprint:a.fingerprint},null,2)}\n`);
}
export function exportCoverage(value,language='en',options={}){
 const result=coverageMatrix(value,options);if(!result.ok)return {ok:false,text:null,problems:result.problems};
 const c=copy(language),p=labelColon(language);
 const lines=[c.title,`${c.missing}${p} ${result.summary.missing}`];
 for(const row of result.rows)lines.push(`${row.route} | ${row.language} | ${row.environment} | ${row.status}`);
 return bounded(lines.join('\n')+'\n');
}
export function exportChanges(before,after,language='en',options={}){
 const result=compareReviews(before,after,options);if(!result.ok)return {ok:false,text:null,problems:result.problems};
 const c=copy(language),p=labelColon(language);
 const lines=[c.title,`${c.changes}${p} ${result.summary.total}`,c.note];
 for(const row of result.changes)lines.push(`${row.id} | ${row.kind} | ${c.previous}${p} ${row.previous} | ${c.next}${p} ${row.next} | ${row.review}`);
 return bounded(lines.join('\n')+'\n');
}
export function byFormat(value,format,language='en',options={}){
 if(format==='csv')return exportCsv(value,language,options);
 if(format==='html')return exportHtml(value,language,options);
 if(format==='json')return exportJson(value,options);
 if(format==='text')return exportText(value,language,options);
 return {ok:false,text:null,problems:[{code:'FORMAT',path:'/format'}]};
}
