import { UNKNOWN, type EvidenceItem, type Language, type WorkbenchDocument } from './model.ts';
import { buildCoverage, contradictions, sourceInventory, summarizeEvidence } from './analysis.ts';
import { displayState } from './model.ts';
import { reviewQueue } from './operations.ts';
export const COPY = {
 en: { title:'Offline evidence workbench',intro:'These are local evidence notes, not a statement that a place is accessible.',summary:'Evidence summary',total:'Records',places:'Places',unresolved:'Needs review',unknown:'UNKNOWN',feature:'Feature',state:'Reported state',place:'Place identifier',source:'Source',licence:'Licence',date:'Retrieved on',tier:'Verification tier',decision:'Review decision',notes:'Notes',none:'No records',review:'Review flags',id:'Record identifier',coverage:'Evidence coverage',conflicts:'Conflicting reports',sources:'Source inventory',caution:'Information can change. Independently confirm details before relying on them.', count:'Count',printed:'Review date',missing:'No evidence recorded: UNKNOWN' },
 fr: { title:'Atelier de preuves hors ligne',intro:'Ces notes locales ne constituent pas une confirmation de l’accessibilité d’un lieu.',summary:'Résumé des preuves',total:'Fiches',places:'Lieux',unresolved:'À examiner',unknown:'UNKNOWN',feature:'Caractéristique',state:'État signalé',place:'Identifiant du lieu',source:'Source',licence:'Licence',date:'Date de récupération',tier:'Niveau de vérification',decision:'Décision de révision',notes:'Notes',none:'Aucune fiche',review:'Points à examiner',id:'Identifiant de la fiche',coverage:'Couverture des preuves',conflicts:'Signalements contradictoires',sources:'Inventaire des sources',caution:'Les renseignements peuvent changer. Confirmez les détails de façon indépendante avant de vous y fier.', count:'Nombre',printed:'Date de révision',missing:'Aucune preuve consignée\u00a0: UNKNOWN' }
} as const;
export function escapeHtml(value:unknown):string {
  return String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
}
export function csvCell(value:unknown):string {
  const raw=String(value??'');
  const protectedValue=/^[\s]*[=+@-]/u.test(raw)?`'${raw}`:raw;
  return `"${protectedValue.replaceAll('"','""')}"`;
}
export function exportCsv(document:WorkbenchDocument):string {
  const columns=['id','placeId','label','feature','state','source','licence','retrievedOn','tier','note','decision'] as const;
  const header=columns.map(csvCell).join(',');
  const lines=document.items.map(item=>columns.map(key=>csvCell(key==='state'||key==='tier'?displayState(item[key]):item[key])).join(','));
  return [header,...lines].join('\n')+'\n';
}
export function exportJson(document:WorkbenchDocument):string { return JSON.stringify(document,null,2)+'\n'; }
export function textValue(item:EvidenceItem,language:Language):string {
  const c=COPY[language],colon=language==='fr'?'\u00a0:':':';
  const divider=language==='fr'?'\u202f; ': '; ';
  return `${item.label} (${item.id})\n${c.place}${colon} ${item.placeId}${divider}${c.feature}${colon} ${item.feature}${divider}${c.state}${colon} ${displayState(item.state)}\n${c.source}${colon} ${item.source}${divider}${c.licence}${colon} ${item.licence}${divider}${c.date}${colon} ${item.retrievedOn}${divider}${c.tier}${colon} ${displayState(item.tier)}\n${c.decision}${colon} ${item.decision}${divider}${c.notes}${colon} ${item.note||UNKNOWN}`;
}
export function exportText(document:WorkbenchDocument,language:Language,today:string):string {
  const c=COPY[language],colon=language==='fr'?'\u00a0:':':';
  const summary=summarizeEvidence(document,today);
  return `${c.title}\n${c.printed}${colon} ${today}\n${c.intro}\n${c.total}${colon} ${summary.total}\n${c.places}${colon} ${summary.places}\n${c.unresolved}${colon} ${summary.unresolved}\n\n${document.items.map(item=>textValue(item,language)).join('\n\n')}\n${c.caution}\n`;
}
export function exportHtml(document:WorkbenchDocument,language:Language,today:string):string {
  const c=COPY[language],summary=summarizeEvidence(document,today);
  const coverage=buildCoverage(document),issues=reviewQueue(document,today),conflicts=contradictions(document);
  const colon=language==='fr'?'\u00a0:':':';
  const rows=document.items.map(item=>`<article><h3>${escapeHtml(item.label)} <small>${escapeHtml(item.id)}</small></h3><dl>${[
    [c.place,item.placeId],[c.feature,item.feature],[c.state,displayState(item.state)],
    [c.source,item.source],[c.licence,item.licence],[c.date,item.retrievedOn],
    [c.tier,displayState(item.tier)],[c.decision,item.decision],[c.notes,item.note||UNKNOWN]
  ].map(([name,value])=>`<div><dt>${escapeHtml(name)}</dt><dd>${escapeHtml(value)}</dd></div>`).join('')}</dl></article>`).join('');
  const sources=sourceInventory(document).map(item=>`<li>${escapeHtml(item.source)} — ${item.count}</li>`).join('');
  const alerts=issues.map(item=>`<li>${escapeHtml(item.id)} — ${escapeHtml(item.code)}</li>`).join('');
  const mixed=conflicts.map(item=>`<li>${escapeHtml(item.placeId)} — ${escapeHtml(item.feature)} — ${escapeHtml(item.ids.join(', '))}</li>`).join('');
  const coverageHtml=coverage.filter(row=>row.count===0).map(item=>`<li>${escapeHtml(item.placeId)} — ${escapeHtml(item.feature)} — ${escapeHtml(c.missing)}</li>`).join('');
  const css='body{font:1rem/1.6 system-ui,sans-serif;max-width:70rem;margin:auto;padding:1.5rem;background:white;color:#16202a}h1,h2,h3{line-height:1.3}article{padding:1rem;border:2px solid #596573;margin:1rem 0;border-radius:.4rem}dd{margin:0;overflow-wrap:anywhere}dt{font-weight:700}a{color:#084b91;min-height:44px;display:inline-flex;align-items:center}a:focus-visible{outline:4px solid #a64a00;outline-offset:4px}li{margin:.4rem 0}';
  return `<!doctype html>\n<html lang="${language}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(c.title)}</title><style>${css}</style></head><body><a href="#main">${language==='fr'?'Aller au contenu':'Skip to content'}</a><main id="main"><h1>${escapeHtml(c.title)}</h1><p>${escapeHtml(c.intro)}</p><p>${escapeHtml(c.printed)}${colon} <time datetime="${today}">${today}</time></p><section aria-labelledby="summary"><h2 id="summary">${escapeHtml(c.summary)}</h2><dl><dt>${escapeHtml(c.total)}</dt><dd>${summary.total}</dd><dt>${escapeHtml(c.places)}</dt><dd>${summary.places}</dd><dt>${escapeHtml(c.unresolved)}</dt><dd>${summary.unresolved}</dd></dl></section><section aria-labelledby="records"><h2 id="records">${escapeHtml(c.total)}</h2>${rows||`<p>${escapeHtml(c.none)}</p>`}</section><section aria-labelledby="coverage"><h2 id="coverage">${escapeHtml(c.coverage)}</h2><ul>${coverageHtml}</ul></section><section aria-labelledby="conflicts"><h2 id="conflicts">${escapeHtml(c.conflicts)}</h2><ul>${mixed}</ul></section><section aria-labelledby="sources"><h2 id="sources">${escapeHtml(c.sources)}</h2><ul>${sources}</ul></section><section aria-labelledby="review"><h2 id="review">${escapeHtml(c.review)}</h2><ul>${alerts}</ul></section><p>${escapeHtml(c.caution)}</p></main></body></html>\n`;
}
export function fileName(format:'json'|'csv'|'html'|'text',date:string):string {
  return `offline-evidence-${date}.${format==='text'?'txt':format}`;
}
export function parseCsvLine(line:string):string[] {
  const result:string[]=[];let current='';let inside=false;
  for(let i=0;i<line.length;i++){
    const c=line[i];
    if(c==='"'&&inside&&line[i+1]==='"'){current+='"';i++;}
    else if(c==='"')inside=!inside;
    else if(c===','&&!inside){result.push(current);current='';}
    else current+=c;
  }
  result.push(current);return result;
}
