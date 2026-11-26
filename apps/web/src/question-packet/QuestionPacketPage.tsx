import { useEffect, useId, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useDocumentTitle } from '../shell/useDocumentTitle.ts';
import { StateNotice } from '../states/StateNotice.tsx';
import {
  ANSWERS, MAX_IMPORT_BYTES, REVIEWS, TIERS, TOPICS, addQuestion, addStop, blankQuestion, blankStop,
  emptyPacket, moveQuestion, moveStop, packetFindings, parsePacket, removeQuestion, removeStop,
  replaceQuestion, replaceStop, safeText, summary, type Packet, type Question, type Source,
  type Stop, type TwoLanguages,
} from './model.ts';
import { ANSWER_LABELS, LABELS, REVIEW_LABELS, TIER_LABELS, TOPIC_LABELS } from './copy.ts';
import { exportCsv, exportJson, exportText, reportQuality, safeFilename } from './report.ts';
import { appendEvents, createEvents, emptyLedger, eventPlainText, type ChangeLedger } from './history.ts';
import { destinationChecklist, reviewBoard, topicCoverage } from './triage.ts';
import { QUESTION_TEMPLATES, templateQuestion } from './templates.ts';
import { auditPacket, auditText } from './audit.ts';

const TARGET = { minHeight: 44, minWidth: 44, padding: '9px 12px' } as const;
function today(): string { return new Date().toISOString().slice(0,10); }
function download(content: string, filename: string, mime: string): void {
  const url=URL.createObjectURL(new Blob([content],{type:mime}));
  const anchor=document.createElement('a');anchor.href=url;anchor.download=filename;anchor.click();URL.revokeObjectURL(url);
}
function nextId(prefix: string, used: readonly string[]): string {
  let i=1;while(used.includes(`${prefix}-${i}`))i+=1;return `${prefix}-${i}`;
}
function Field({id,label,value,onChange,maxLength=300,required=false}: {
  id:string; label:string; value:string; onChange:(value:string)=>void; maxLength?:number;required?:boolean;
}) {
  return <><label htmlFor={id}>{label}</label><input id={id} style={TARGET} maxLength={maxLength}
    required={required} value={value} onChange={(event:ChangeEvent<HTMLInputElement>)=>onChange(event.currentTarget.value)} /></>;
}
function DownloadControls({packet,locale}: {packet:Packet;locale:'en'|'fr'}) {
  const c=LABELS[locale],quality=reportQuality(packet);
  return <div className="button-row" role="group" aria-label={c.report}>
    <button type="button" style={TARGET} disabled={!quality.safeToExport} onClick={()=>download(exportJson(packet),safeFilename(locale,'json'),'application/json')}>{c.exportJson}</button>
    <button type="button" style={TARGET} disabled={!quality.safeToExport} onClick={()=>download(exportCsv(packet,locale),safeFilename(locale,'csv'),'text/csv')}>{c.exportCsv}</button>
    <button type="button" style={TARGET} disabled={!quality.safeToExport} onClick={()=>download(exportText(packet,locale),safeFilename(locale,'txt'),'text/plain')}>{c.exportText}</button>
  </div>;
}

export function QuestionPacketPage() {
  const {i18n}=useTranslation();const locale=i18n.language.startsWith('fr')?'fr' as const:'en' as const;
  const c=LABELS[locale];useDocumentTitle(c.title);
  const group=useId();const inputRef=useRef<HTMLInputElement>(null);
  const [packet,setPacket]=useState<Packet>(()=>emptyPacket(today()));
  const [ledger,setLedger]=useState<ChangeLedger>(()=>emptyLedger());
  const previousPacket=useRef(packet);
  const eventSequence=useRef(0);
  useEffect(()=>{
    const events=createEvents(previousPacket.current,packet,today(),`change-${++eventSequence.current}`);
    previousPacket.current=packet;
    if(events.length>0)setLedger(old=>appendEvents(old,events));
  },[packet]);
  const [stopEditor,setStopEditor]=useState<string|null>(null);
  const [stopTitle,setStopTitle]=useState<TwoLanguages>({en:'',fr:''});
  const [questionEditor,setQuestionEditor]=useState<{stopId:string;questionId:string|null}|null>(null);
  const [draft,setDraft]=useState<Question>(()=>blankQuestion('question-1'));
  const [status,setStatus]=useState('');
  const [confirmingClear,setConfirmingClear]=useState(false);
  const confirmClearRef=useRef<HTMLParagraphElement>(null);
  useEffect(()=>{if(confirmingClear)confirmClearRef.current?.focus();},[confirmingClear]);
  const stats=useMemo(()=>summary(packet),[packet]);
  const board=useMemo(()=>reviewBoard(packet,locale),[packet,locale]);
  const audit=useMemo(()=>auditPacket(packet,locale),[packet,locale]);
  const coverage=useMemo(()=>topicCoverage(packet),[packet]);
  const outstanding=useMemo(()=>destinationChecklist(packet,locale),[packet,locale]);
  const invalid=useMemo(()=>packetFindings(packet).filter(f=>f.severity==='error'),[packet]);
  function startStop(stop?:Stop) {setQuestionEditor(null);setStopEditor(stop?.id??'');setStopTitle(stop?.title??{en:'',fr:''});setStatus('');}
  function saveStop() {
    if(!safeText(stopTitle.en,300)||!safeText(stopTitle.fr,300)) {setStatus(c.required);return;}
    if(stopEditor===null)return;
    if(stopEditor==='') {
      const id=nextId('stop',packet.stops.map(s=>s.id));setPacket(old=>addStop(old,{...blankStop(id),title:stopTitle}));
    } else {
      const old=packet.stops.find(s=>s.id===stopEditor);if(!old)return;
      setPacket(p=>replaceStop(p,{...old,title:stopTitle}));
    }
    setStopEditor(null);setStatus('');
  }
  function startQuestion(stopId:string,question?:Question) {
    setStopEditor(null);const stop=packet.stops.find(s=>s.id===stopId);if(!stop)return;
    const id=question?.id??nextId('question',stop.questions.map(q=>q.id));
    setDraft(question??blankQuestion(id));setQuestionEditor({stopId,questionId:question?.id??null});setStatus('');
  }
  function saveQuestion() {
    if(!questionEditor)return;
    const errors=packetFindings({...packet,stops:packet.stops.map(s=>s.id!==questionEditor.stopId?s:{...s,questions:questionEditor.questionId
      ?s.questions.map(q=>q.id===questionEditor.questionId?draft:q):[...s.questions,draft]})}).filter(f=>f.severity==='error');
    if(errors.length>0){setStatus(c.required);return;}
    setPacket(p=>questionEditor.questionId?replaceQuestion(p,questionEditor.stopId,draft):addQuestion(p,questionEditor.stopId,draft));
    setQuestionEditor(null);setStatus('');
  }
  const updateDraft=<K extends keyof Question>(key:K,value:Question[K])=>setDraft(q=>({...q,[key]:value}));
  const updateSource=<K extends keyof Source>(key:K,value:Source[K])=>setDraft(q=>({...q,source:{...q.source,[key]:value}}));
  async function importPacket(event:ChangeEvent<HTMLInputElement>) {
    const file=event.currentTarget.files?.[0];if(!file)return;
    event.currentTarget.value='';
    if(file.size>MAX_IMPORT_BYTES){setStatus(c.invalidImport);return;}
    let content:string;try{content=await file.text();}catch{setStatus(c.invalidImport);return;}
    const parsed=parsePacket(content);if(!parsed.packet){setStatus(c.invalidImport);return;}
    previousPacket.current=parsed.packet;setLedger(emptyLedger());eventSequence.current=0;
    setPacket(parsed.packet);setStopEditor(null);setQuestionEditor(null);setStatus(c.imported);
  }
  return <div className="stack" aria-labelledby={`${group}-title`}>
    <h1 id={`${group}-title`}>{c.title}</h1><p>{c.intro}</p>
    <p role="note">{c.safety}</p><p>{c.local}</p>
    <section className="panel stack" aria-labelledby={`${group}-packet`}>
      <h2 id={`${group}-packet`}>{c.packet}</h2>
      <Field id={`${group}-name-en`} label={`${c.journeyName} — English`} value={packet.title.en} onChange={en=>setPacket(p=>({...p,title:{...p.title,en}}))}/>
      <Field id={`${group}-name-fr`} label={`${c.journeyName} — Français`} value={packet.title.fr} onChange={fr=>setPacket(p=>({...p,title:{...p.title,fr}}))}/>
      <p>{c.questions}: {stats.questions} · {c.answered}: {stats.answered} · {c.unknown}: {stats.unknown}</p>
      <p>{c.toContact}: {stats.toContact} · {c.toRecheck}: {stats.toRecheck} · {c.sourced}: {stats.sourced}</p>
      <p>{c.gaps}: {stats.gapIds.length}</p>
      <p role='status'>{locale==='en'?'Evidence review':'Examen des éléments'}: {audit.reviews} {locale==='en'?'items for review':'éléments à examiner'}; {audit.errors} {locale==='en'?'invalid fields':'champs invalides'}</p>
      {audit.issues.length>0?<details><summary style={TARGET}>{locale==='en'?'Evidence review details':'Détails de l’examen des éléments'}</summary>
        <ul>{audit.issues.map((issue,i)=><li key={`${issue.path}-${i}`}>{issue.description}</li>)}</ul>
        <button type='button' style={TARGET} onClick={()=>download(auditText(audit,locale),`question-audit-${locale}.txt`,'text/plain')}>{c.exportText}</button>
      </details>:null}
      <p>{locale==='en'?'Ready for handoff':'Prêtes pour la transmission'}: {board.recorded.length} · {locale==='en'?'Needs follow-up':'Suivi nécessaire'}: {board.urgent.length+board.incomplete.length}</p>
      {outstanding.length>0?<details><summary style={TARGET}>{c.gaps}</summary><ul>{outstanding.map((item,i)=><li key={`${i}-${item}`}>{item}</li>)}</ul></details>:null}
      {coverage.length>0?<details><summary style={TARGET}>{c.topic}</summary><ul>{coverage.map(item=><li key={item.topic}>{TOPIC_LABELS[locale][item.topic]}: {item.count} ({c.unknown}: {item.unknown})</li>)}</ul></details>:null}
      {ledger.events.length>0?<details><summary style={TARGET}>{locale==='en'?'Local change history':'Historique local des changements'}</summary>
        <p>{ledger.events.length} {locale==='en'?'recorded edits':'modifications consignées'}</p>
        <button type='button' style={TARGET} onClick={()=>download(eventPlainText(ledger,locale),`question-history-${locale}.txt`,'text/plain')}>{c.exportText}</button>
      </details>:null}
      {invalid.length>0?<StateNotice lang={locale} view={{role:"alert",title:c.required,description:`${invalid.length} ${locale === "fr" ? "champs à corriger" : "fields to correct"}. ${c.importHelp}`,actions:[{id:"help",label:locale === "fr" ? "Ouvrir l’aide" : "Open help",minTargetPx:44}]}} />:null}
      <DownloadControls packet={packet} locale={locale}/>
      <div className="button-row">
        <button type="button" style={TARGET} onClick={()=>inputRef.current?.click()}>{c.importJson}</button>
        <input ref={inputRef} type="file" accept=".json,application/json" aria-label={c.importJson} onChange={(event:ChangeEvent<HTMLInputElement>)=>void importPacket(event)} style={{maxWidth:'100%',minHeight:44}}/>
        <button type="button" style={TARGET} aria-expanded={confirmingClear} onClick={()=>setConfirmingClear(true)}>{c.clear}</button>
      </div>
      {confirmingClear?<div className="panel stack" role="group" aria-labelledby={`${group}-confirm-clear`}>
        <p id={`${group}-confirm-clear`} tabIndex={-1} ref={confirmClearRef}>{c.confirmClear}</p>
        <div className="button-row">
          <button type="button" style={TARGET} onClick={()=>{const fresh=emptyPacket(today());previousPacket.current=fresh;setLedger(emptyLedger());eventSequence.current=0;
            setPacket(fresh);setStatus('');setStopEditor(null);setQuestionEditor(null);setConfirmingClear(false);}}>{c.confirmClearYes}</button>
          <button type="button" style={TARGET} onClick={()=>setConfirmingClear(false)}>{c.confirmClearNo}</button>
        </div>
      </div>:null}
      <p>{c.importHelp}</p>
    </section>
    <section className="stack" aria-labelledby={`${group}-stops`}>
      <h2 id={`${group}-stops`}>{c.stop}</h2>
      {packet.stops.length===0?<p>{c.empty}</p>:null}
      <ol>{packet.stops.map((stop,i)=><li key={stop.id} className="panel stack">
        <h3>{stop.title[locale]}</h3>
        <div className="button-row">
          <button type="button" style={TARGET} onClick={()=>startStop(stop)}>{c.edit}</button>
          <button type="button" style={TARGET} disabled={i===0} onClick={()=>setPacket(p=>moveStop(p,stop.id,-1))}>{c.up}</button>
          <button type="button" style={TARGET} disabled={i===packet.stops.length-1} onClick={()=>setPacket(p=>moveStop(p,stop.id,1))}>{c.down}</button>
          <button type="button" style={TARGET} onClick={()=>setPacket(p=>removeStop(p,stop.id))}>{c.remove}</button>
        </div>
        {stop.questions.length===0?<p>{c.noQuestions}</p>:null}
        <ol>{stop.questions.map((q,j)=><li key={q.id} className="stack">
          <strong>{q.prompt[locale]}</strong><p>{ANSWER_LABELS[locale][q.answer]} · {REVIEW_LABELS[locale][q.review]}</p>
          <p>{q.details[locale]}</p><p>{c.provenance}: {q.source.name} · {q.source.licence} · {q.source.date}</p>
          <div className="button-row">
            <button type="button" style={TARGET} onClick={()=>startQuestion(stop.id,q)}>{c.edit}</button>
            <button type="button" style={TARGET} disabled={j===0} onClick={()=>setPacket(p=>moveQuestion(p,stop.id,q.id,-1))}>{c.up}</button>
            <button type="button" style={TARGET} disabled={j===stop.questions.length-1} onClick={()=>setPacket(p=>moveQuestion(p,stop.id,q.id,1))}>{c.down}</button>
            <button type="button" style={TARGET} onClick={()=>setPacket(p=>removeQuestion(p,stop.id,q.id))}>{c.remove}</button>
          </div>
        </li>)}</ol>
        <button type="button" style={TARGET} onClick={()=>startQuestion(stop.id)}>{c.addQuestion}</button>
      </li>)}</ol>
      <button type="button" style={TARGET} onClick={()=>startStop()}>{c.addStop}</button>
    </section>
    {stopEditor!==null?<section className="panel stack" aria-labelledby={`${group}-edit-stop`}>
      <h2 id={`${group}-edit-stop`}>{c.stop}</h2>
      <Field id={`${group}-stop-en`} label={`${c.stop} — English`} value={stopTitle.en} onChange={en=>setStopTitle(t=>({...t,en}))}/>
      <Field id={`${group}-stop-fr`} label={`${c.stop} — Français`} value={stopTitle.fr} onChange={fr=>setStopTitle(t=>({...t,fr}))}/>
      <div className="button-row"><button type="button" style={TARGET} onClick={saveStop}>{c.save}</button><button type="button" style={TARGET} onClick={()=>setStopEditor(null)}>{c.cancel}</button></div>
    </section>:null}
    {questionEditor?<section className="panel stack" aria-labelledby={`${group}-edit-question`}>
      <h2 id={`${group}-edit-question`}>{c.question}</h2>
      <label htmlFor={`${group}-template`}>{locale==='en'?'Question template':'Modèle de question'}</label>
      <select id={`${group}-template`} style={TARGET} defaultValue='' onChange={(event:ChangeEvent<HTMLSelectElement>)=>{
        const selected=templateQuestion(event.currentTarget.value,draft.id,draft.order);
        if(selected)setDraft(old=>({...old,topic:selected.topic,prompt:selected.prompt,details:selected.details}));
      }}>
        <option value=''>{locale==='en'?'Choose a generic question':'Choisir une question générale'}</option>
        {QUESTION_TEMPLATES.map(t=><option key={t.id} value={t.id}>{t.prompt[locale]}</option>)}
      </select>
      <Field id={`${group}-question-en`} label={c.promptEn} value={draft.prompt.en} onChange={en=>updateDraft('prompt',{...draft.prompt,en})}/>
      <Field id={`${group}-question-fr`} label={c.promptFr} value={draft.prompt.fr} onChange={fr=>updateDraft('prompt',{...draft.prompt,fr})}/>
      <Field id={`${group}-detail-en`} label={c.detailsEn} value={draft.details.en} onChange={en=>updateDraft('details',{...draft.details,en})}/>
      <Field id={`${group}-detail-fr`} label={c.detailsFr} value={draft.details.fr} onChange={fr=>updateDraft('details',{...draft.details,fr})}/>
      <label htmlFor={`${group}-topic`}>{c.topic}</label>
      <select id={`${group}-topic`} style={TARGET} value={draft.topic} onChange={(event:ChangeEvent<HTMLSelectElement>)=>updateDraft('topic',event.currentTarget.value as Question['topic'])}>
        {TOPICS.map(v=><option key={v} value={v}>{TOPIC_LABELS[locale][v]}</option>)}
      </select>
      <label htmlFor={`${group}-answer`}>{c.answer}</label>
      <select id={`${group}-answer`} style={TARGET} value={draft.answer} onChange={(event:ChangeEvent<HTMLSelectElement>)=>updateDraft('answer',event.currentTarget.value as Question['answer'])}>
        {ANSWERS.map(v=><option key={v} value={v}>{ANSWER_LABELS[locale][v]}</option>)}
      </select>
      <label htmlFor={`${group}-review`}>{c.review}</label>
      <select id={`${group}-review`} style={TARGET} value={draft.review} onChange={(event:ChangeEvent<HTMLSelectElement>)=>updateDraft('review',event.currentTarget.value as Question['review'])}>
        {REVIEWS.map(v=><option key={v} value={v}>{REVIEW_LABELS[locale][v]}</option>)}
      </select>
      <label htmlFor={`${group}-tier`}>{c.tier}</label>
      <select id={`${group}-tier`} style={TARGET} value={draft.source.tier} onChange={(event:ChangeEvent<HTMLSelectElement>)=>updateSource('tier',event.currentTarget.value as Source['tier'])}>
        {TIERS.map(v=><option key={v} value={v}>{TIER_LABELS[locale][v]}</option>)}
      </select>
      <Field id={`${group}-source`} label={c.source} value={draft.source.name} onChange={name=>updateSource('name',name)} maxLength={150}/>
      <Field id={`${group}-url`} label={c.sourceUrl} value={draft.source.url} onChange={url=>updateSource('url',url)} maxLength={2048}/>
      <Field id={`${group}-licence`} label={c.licence} value={draft.source.licence} onChange={licence=>updateSource('licence',licence)} maxLength={150}/>
      <Field id={`${group}-date`} label={c.date} value={draft.source.date} onChange={date=>updateSource('date',date)} maxLength={20}/>
      <p>{c.sourceHelp}</p>
      <div className="button-row"><button type="button" style={TARGET} onClick={saveQuestion}>{c.save}</button>
        <button type="button" style={TARGET} onClick={()=>setQuestionEditor(null)}>{c.cancel}</button></div>
    </section>:null}
    {status?<p role="status" aria-live="polite">{status}</p>:null}
    <p>{c.cannotInfer}</p>
  </div>;
}