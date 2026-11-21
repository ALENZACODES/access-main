import { useMemo, useRef, useState, type ChangeEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { COPY, exportCsv, exportHtml, exportJson, exportText, fileName } from './export.ts';
import { contradictions, summarizeEvidence } from './analysis.ts';
import { DECISIONS, FEATURES, STATES, TIERS, UNKNOWN, emptyDocument, makeDraft, parseDocument, safeDateToday, type Decision, type EvidenceItem, type Feature, type Language, type Tier } from './model.ts';
import { createWorkspace, draftId, filterItems, reviewQueue, updateWorkspace, type Workspace } from './operations.ts';

const WORDS={
 en: {title:'Review local evidence',intro:'Your notes stay in this browser until you explicitly export them. No uploads, checks of real places, or eligibility decisions.',add:'Add a note',place:'Place identifier',id:'Note ID',label:'Description',feature:'Feature',state:'Reported state',source:'Source (required)',licence:'Licence (required)',retrieved:'Retrieved on',tier:'Verification tier',note:'Details',decision:'Review decision',save:'Save note',remove:'Remove note',cancel:'Cancel editing',edit:'Edit',export:'Export local file',import:'Import JSON',read:'Read this local JSON file',format:'Format',download:'Download report',review:'Review flags',conflicts:'Contradictory reports',list:'Local evidence notes',clear:'Clear session',clearPrompt:'Clear local notes?',clearYes:'Clear notes',clearNo:'Keep notes',loading:'Opening the workbench…',empty:'No local notes have been added.',caution:'UNKNOWN stays UNKNOWN. This workspace does not establish that a place is accessible.',all:'All',search:'Search notes',filtered:'Matching notes',invalid:'The input does not meet the evidence contract.',fileTooLarge:'File is too large for the local review.',failure:'Could not read the local file.',saved:'Note saved locally for this session.',removed:'Note removed from this session.',imported:'Local notes imported.',downloaded:'Report prepared.',needsSource:'UNKNOWN',example:'Example data is fictional; do not treat it as a real observation.',importReplace:'Import replaces your current unsaved session. Export first to keep a copy.',notStored:'Nothing is transmitted or automatically saved.',noFlags:'No flags in the current records. Evidence still needs independent confirmation.',count:'Count',next:'Review next',reviewed:'Reviewed only means the entry was examined, not that its claims were confirmed.'},
 fr: {title:'Examiner les preuves locales',intro:'Vos notes restent dans ce navigateur jusqu’à leur exportation explicite. Aucun téléversement ni jugement sur un lieu réel.',add:'Ajouter une note',place:'Identifiant du lieu',id:'Identifiant de la note',label:'Description',feature:'Caractéristique',state:'État signalé',source:'Source (obligatoire)',licence:'Licence (obligatoire)',retrieved:'Date de récupération',tier:'Niveau de vérification',note:'Détails',decision:'Décision de révision',save:'Enregistrer la note',remove:'Supprimer la note',cancel:'Annuler la modification',edit:'Modifier',export:'Exporter un fichier local',import:'Importer un JSON',read:'Lire ce fichier JSON local',format:'Format',download:'Télécharger le rapport',review:'Points à examiner',conflicts:'Signalements contradictoires',list:'Notes locales sur les preuves',clear:'Effacer la session',clearPrompt:'Effacer les notes locales\u202f?',clearYes:'Effacer les notes',clearNo:'Conserver les notes',loading:'Ouverture de l’atelier…',empty:'Aucune note locale n’a été ajoutée.',caution:'UNKNOWN reste UNKNOWN. Cet atelier ne prouve pas qu’un lieu est accessible.',all:'Toutes',search:'Rechercher des notes',filtered:'Notes correspondantes',invalid:'Les données ne respectent pas le contrat de preuve.',fileTooLarge:'Le fichier est trop volumineux pour cet examen local.',failure:'Impossible de lire le fichier local.',saved:'Note conservée pour cette session locale.',removed:'Note supprimée de cette session.',imported:'Notes locales importées.',downloaded:'Rapport préparé.',needsSource:'UNKNOWN',example:'Les données d’exemple sont fictives et ne sont pas des observations réelles.',importReplace:'L’importation remplace votre session non enregistrée. Exportez d’abord pour conserver une copie.',notStored:'Aucune donnée n’est transmise ni enregistrée automatiquement.',noFlags:'Aucun indicateur dans les fiches actuelles. Les preuves doivent tout de même être confirmées.',count:'Nombre',next:'Examiner la suivante',reviewed:'Une fiche examinée ne confirme pas l’exactitude des renseignements.'}
} as const;
const BUTTON_STYLE={minHeight:44,minWidth:44} as const;
function validFilename(blob:Blob,name:string):void {
  const url=URL.createObjectURL(blob);
  const anchor=document.createElement('a');anchor.href=url;anchor.download=name;
  anchor.click();URL.revokeObjectURL(url);
}
function deriveForm(item:EvidenceItem):EvidenceItem {return {...item};}
export function EvidenceWorkbench(){
 const {i18n}=useTranslation();
 const lang:Language=i18n.language.startsWith('fr')?'fr':'en';
 const w=WORDS[lang],copy=COPY[lang];
 const colon=lang==='fr'?'\u00A0:':':';
 const semicolon=lang==='fr'?'\u202F; ':'; ';
 const today=safeDateToday(new Date());
 const [workspace,setWorkspace]=useState<Workspace>(()=>createWorkspace(emptyDocument()));
 const [current,setCurrent]=useState<EvidenceItem|null>(null);
 const [search,setSearch]=useState('');
 const [feature,setFeature]=useState<Feature|'all'>('all');
 const [decision,setDecision]=useState<Decision|'all'>('all');
 const [notice,setNotice]=useState('');
 const [clearPrompt,setClearPrompt]=useState(false);
 const [format,setFormat]=useState<'json'|'csv'|'html'|'text'>('html');
 const fileInput=useRef<HTMLInputElement>(null);
 const formHeading=useRef<HTMLHeadingElement>(null);
 const clearTrigger=useRef<HTMLButtonElement>(null);
 const entries=useMemo(()=>filterItems(workspace.document,{text:search,feature,decision}),[workspace,search,feature,decision]);
 const queue=useMemo(()=>reviewQueue(workspace.document,today),[workspace,today]);
 const summary=useMemo(()=>summarizeEvidence(workspace.document,today),[workspace,today]);
 const conflicts=useMemo(()=>contradictions(workspace.document),[workspace]);
 const start=(item?:EvidenceItem)=>{
  const id=draftId(workspace);if(!id&&!item)return;
  setCurrent(deriveForm(item??makeDraft(id,'fictional-place',today)));
  setNotice('');
  requestAnimationFrame(()=>formHeading.current?.focus());
 };
 const save=()=>{
  if(!current)return;
  const existing=workspace.document.items.some(item=>item.id===current.id);
  const result=updateWorkspace(workspace,existing?{kind:'update',id:current.id,changes:current}:{kind:'add',item:current},new Date().toISOString(),today);
  if(!result.ok){setNotice(`${w.invalid} ${result.problems.map(item=>item.code).join(', ')}`);return;}
  setWorkspace(result.value);setCurrent(null);setNotice(w.saved);
 };
 const remove=(id:string)=>{
  const result=updateWorkspace(workspace,{kind:'remove',id},new Date().toISOString(),today);
  if(result.ok){setWorkspace(result.value);setNotice(w.removed);if(current?.id===id)setCurrent(null);}
 };
 const importFile=async(event:ChangeEvent<HTMLInputElement>)=>{
  const file=event.target.files?.[0];event.target.value='';
  if(!file)return;
  if(file.size>1_000_000){setNotice(w.fileTooLarge);return;}
  try{const result=parseDocument(await file.text(),today);
    if(!result.ok){setNotice(`${w.invalid} ${result.problems.slice(0,4).map(item=>item.code).join(', ')}`);return;}
    setWorkspace(createWorkspace(result.value));setCurrent(null);setNotice(w.imported);
  }catch{setNotice(w.failure);}
 };
 const download=()=>{
  const doc=workspace.document;
  const text=format==='json'?exportJson(doc):format==='csv'?exportCsv(doc):format==='html'?exportHtml(doc,lang,today):exportText(doc,lang,today);
  validFilename(new Blob([text],{type:format==='html'?'text/html;charset=utf-8':format==='json'?'application/json;charset=utf-8':'text/plain;charset=utf-8'}),fileName(format,today));
  setNotice(w.downloaded);
 };
 const field=(key:'label'|'placeId'|'source'|'licence'|'retrievedOn'|'note',value:string)=>setCurrent(prev=>prev?{...prev,[key]:value}:prev);
 return <section className="panel stack" aria-labelledby="local-evidence-workbench" data-testid="offline-evidence-workbench">
   <h2 id="local-evidence-workbench">{w.title}</h2>
   <p>{w.intro}</p><p>{w.caution}</p><p>{w.notStored}</p>
   <div className="button-row"><button style={BUTTON_STYLE} type="button" onClick={()=>start()}>{w.add}</button>
   <button style={BUTTON_STYLE} type="button" onClick={()=>fileInput.current?.click()}>{w.import}</button>
   <input ref={fileInput} type="file" accept="application/json,.json" style={BUTTON_STYLE} aria-label={w.read} onChange={event=>void importFile(event)} />
   <button ref={clearTrigger} style={BUTTON_STYLE} type="button" onClick={()=>setClearPrompt(true)}>{w.clear}</button></div>
   <p>{w.importReplace}</p>
   {clearPrompt&&<div role="group" aria-label={w.clearPrompt}><p>{w.clearPrompt}</p><div className="button-row"><button style={BUTTON_STYLE} type="button" onClick={()=>{setWorkspace(createWorkspace(emptyDocument()));setCurrent(null);setNotice(w.empty);setClearPrompt(false);requestAnimationFrame(()=>clearTrigger.current?.focus());}}>{w.clearYes}</button><button style={BUTTON_STYLE} type="button" onClick={()=>{setClearPrompt(false);requestAnimationFrame(()=>clearTrigger.current?.focus());}}>{w.clearNo}</button></div></div>}
   {notice&&<p role="status" aria-live="polite">{notice}</p>}
   <section aria-labelledby="local-evidence-summary"><h3 id="local-evidence-summary">{copy.summary}</h3><dl><dt>{w.count}</dt><dd>{summary.total}</dd><dt>{copy.places}</dt><dd>{summary.places}</dd><dt>{copy.unresolved}</dt><dd>{summary.unresolved}</dd><dt>{w.conflicts}</dt><dd>{conflicts.length}</dd></dl></section>
   {current&&<section className="stack" aria-labelledby="local-evidence-editor"><h3 id="local-evidence-editor" ref={formHeading} tabIndex={-1}>{w.add}</h3><form onSubmit={event=>{event.preventDefault();save();}} className="stack">
     <p>{w.id}{colon} <code>{current.id}</code></p>
     <label>{w.place}<input value={current.placeId} maxLength={96} required onChange={e=>field('placeId',e.target.value)} /></label>
     <label>{w.label}<input value={current.label} maxLength={120} required onChange={e=>field('label',e.target.value)} /></label>
     <label>{w.feature}<select value={current.feature} onChange={e=>setCurrent(prev=>prev?{...prev,feature:e.target.value as Feature}:prev)}>{FEATURES.map(item=><option key={item} value={item}>{item}</option>)}</select></label>
     <label>{w.state}<select value={current.state} onChange={e=>setCurrent(prev=>prev?{...prev,state:e.target.value as typeof STATES[number]}:prev)}>{STATES.map(item=><option key={item}>{item}</option>)}</select></label>
     <label>{w.source}<input value={current.source} maxLength={400} required onChange={e=>field('source',e.target.value)} /></label>
     <label>{w.licence}<input value={current.licence} maxLength={120} required onChange={e=>field('licence',e.target.value)} /></label>
     <label>{w.retrieved}<input type="date" value={current.retrievedOn} max={today} required onChange={e=>field('retrievedOn',e.target.value)} /></label>
     <label>{w.tier}<select value={current.tier} onChange={e=>setCurrent(prev=>prev?{...prev,tier:e.target.value as Tier}:prev)}>{TIERS.map(item=><option key={item} value={item}>{item==='unknown'?UNKNOWN:item}</option>)}</select></label>
     <label>{w.decision}<select value={current.decision} onChange={e=>setCurrent(prev=>prev?{...prev,decision:e.target.value as Decision}:prev)}>{DECISIONS.map(item=><option key={item} value={item}>{item}</option>)}</select></label>
     <label>{w.note}<textarea value={current.note} maxLength={1200} rows={3} onChange={e=>field('note',e.target.value)} /></label>
     <p>{w.reviewed}</p><div className="button-row"><button style={BUTTON_STYLE} type="submit">{w.save}</button><button style={BUTTON_STYLE} type="button" onClick={()=>setCurrent(null)}>{w.cancel}</button></div>
   </form></section>}
   <section aria-labelledby="local-evidence-list"><h3 id="local-evidence-list">{w.list}</h3>
    <label>{w.search}<input type="search" value={search} onChange={e=>setSearch(e.target.value)} /></label>
    <label>{w.feature}<select value={feature} onChange={e=>setFeature(e.target.value as Feature|'all')}><option value="all">{w.all}</option>{FEATURES.map(item=><option key={item}>{item}</option>)}</select></label>
    <label>{w.decision}<select value={decision} onChange={e=>setDecision(e.target.value as Decision|'all')}><option value="all">{w.all}</option>{DECISIONS.map(item=><option key={item}>{item}</option>)}</select></label>
    <p role="status">{w.filtered}{colon} {entries.length}</p>
    {entries.length===0?<p>{w.empty}</p>:<ul className="record-list">{entries.map(item=><li key={item.id}><h4>{item.label}</h4><p>{w.place}{colon} {item.placeId}{semicolon}{w.feature}{colon} {item.feature}{semicolon}{w.state}{colon} {item.state}</p><p>{w.source}{colon} {item.source}{semicolon}{w.licence}{colon} {item.licence}{semicolon}{w.retrieved}{colon} {item.retrievedOn}{semicolon}{w.tier}{colon} {item.tier==='unknown'?UNKNOWN:item.tier}</p><p>{w.decision}{colon} {item.decision}</p><div className="button-row"><button style={BUTTON_STYLE} type="button" onClick={()=>start(item)}>{w.edit}</button><button style={BUTTON_STYLE} type="button" onClick={()=>remove(item.id)}>{w.remove}</button></div></li>)}</ul>}
   </section>
   <section aria-labelledby="local-evidence-flags"><h3 id="local-evidence-flags">{w.review}</h3>{queue.length?<ul>{queue.map((item,index)=><li key={`${item.id}-${item.code}-${index}`}>{item.id}{colon} {item.code}</li>)}</ul>:<p>{w.noFlags}</p>}</section>
   <section aria-labelledby="local-evidence-export"><h3 id="local-evidence-export">{w.export}</h3><label>{w.format}<select value={format} onChange={event=>setFormat(event.target.value as typeof format)}><option value="html">HTML</option><option value="csv">CSV</option><option value="json">JSON</option><option value="text">TXT</option></select></label><button style={BUTTON_STYLE} type="button" onClick={download}>{w.download}</button></section>
 </section>;
}
