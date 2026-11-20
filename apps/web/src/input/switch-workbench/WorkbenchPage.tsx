import { useId, useMemo, useState, type ChangeEvent } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { type Activation, type Control, type ControlKind, type Evidence, type Language, type Project, ACTIVATIONS, EVIDENCE, KINDS, defaultControl, defaultProject, moveControl, removeControl, reviewProject, updateControl } from './model.ts';
import { type Command, type Machine, COMMANDS, MODES, describeFocus, initialMachine, stepMachine, summary, withMode, withWrap } from './engine.ts';
import { buildHandoff, buildReport, exportCsv, exportHandoff, exportJson, safeFilename } from './report.ts';
import { commandLabel, decisionLabel, evidenceLabel, issueLabel, kindLabel, modeLabel, workbenchCopy } from './copy.ts';

const targetStyle = { minHeight: 44, minWidth: 44, padding: '9px 12px' } as const;
const fieldsStyle = { minHeight: 44, width: '100%', maxWidth: 640 } as const;
function dateToday():string {const d=new Date();return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');}
function downloadLocal(filename:string,content:string,mime:string):void {
  const address=URL.createObjectURL(new Blob([content],{type:mime}));
  try {const link=document.createElement('a');link.href=address;link.download=filename;link.click();}
  finally {URL.revokeObjectURL(address);}
}
export function WorkbenchPage(){
  const {i18n}=useTranslation();
  const locale:Language=i18n.language.startsWith('fr')?'fr':'en';
  const copy=workbenchCopy(locale);
  const formId=useId();
  const [project,setProject]=useState<Project>(defaultProject);
  const [machine,setMachine]=useState<Machine>(initialMachine);
  const [editing,setEditing]=useState<string|null>(null);
  const [labelEn,setLabelEn]=useState('');
  const [labelFr,setLabelFr]=useState('');
  const [descriptionEn,setDescriptionEn]=useState('');
  const [descriptionFr,setDescriptionFr]=useState('');
  const [kind,setKind]=useState<ControlKind>('button');
  const [activation,setActivation]=useState<Activation>('BOTH');
  const [evidence,setEvidence]=useState<Evidence>('UNKNOWN');
  const [reviewed,setReviewed]=useState(false);
  const [group,setGroup]=useState('');
  const [sourceName,setSourceName]=useState('');
  const [sourceUrl,setSourceUrl]=useState('');
  const [licence,setLicence]=useState('');
  const [date,setDate]=useState(dateToday);
  const [showError,setShowError]=useState(false);
  const assessment=useMemo(()=>reviewProject(project),[project]);
  const report=useMemo(()=>buildReport(project,machine),[project,machine]);
  const scanSummary=useMemo(()=>summary(machine),[machine]);
  const active=project.controls.find(control=>control.id===machine.focus);
  const selected=project.controls.find(control=>control.id===machine.selected);
  function clearForm(){setEditing(null);setLabelEn('');setLabelFr('');setDescriptionEn('');setDescriptionFr('');setKind('button');setActivation('BOTH');setEvidence('UNKNOWN');setReviewed(false);setGroup('');setSourceName('');setSourceUrl('');setLicence('');setDate(dateToday());setShowError(false);}
  function saveControl():void {
    if(!labelEn.trim()||!labelFr.trim()||!descriptionEn.trim()||!descriptionFr.trim()){setShowError(true);return;}
    const id=editing??`control-${project.controls.length+1}`;
    const previous=project.controls.find(control=>control.id===id);
    const source=sourceName.trim()&&sourceUrl.trim()&&licence.trim()?{title:sourceName.trim(),url:sourceUrl.trim(),licence:licence.trim(),accessed:date}:null;
    const control:Control={...defaultControl(id),id,kind,activation,evidence,reviewed,
      name:{en:labelEn.trim(),fr:labelFr.trim()},description:{en:descriptionEn.trim(),fr:descriptionFr.trim()},
      group:group.trim()||null,source,refs:previous?.refs??[]};
    setProject(old=>updateControl(old,control));clearForm();
  }
  function editControl(control:Control):void {
    setEditing(control.id);setLabelEn(control.name.en);setLabelFr(control.name.fr);
    setDescriptionEn(control.description.en);setDescriptionFr(control.description.fr);
    setKind(control.kind);setActivation(control.activation);setEvidence(control.evidence);
    setReviewed(control.reviewed);setGroup(control.group??'');setSourceName(control.source?.title??'');
    setSourceUrl(control.source?.url??'');setLicence(control.source?.licence??'');setDate(control.source?.accessed??dateToday());
    setShowError(false);
  }
  function execute(command:Command):void {setMachine(current=>stepMachine(current,command,project).machine);}
  function reset(){setProject(defaultProject());setMachine(initialMachine());clearForm();}
  function saveReport(type:'json'|'csv'|'handoff'){
    if(type==='csv')downloadLocal(safeFilename(project.id,'csv'),exportCsv(report),'text/csv;charset=utf-8');
    else if(type==='handoff')downloadLocal('input-handoff.json',exportHandoff(buildHandoff(report)),'application/json');
    else downloadLocal(safeFilename(project.id,'json'),exportJson(report),'application/json');
  }
  return <div className="stack" aria-labelledby={`${formId}-title`}>
    <h1 id={`${formId}-title`}>{copy.title}</h1>
    <p>{copy.intro}</p><p>{copy.caveat}</p><p>{copy.local}</p>
    <section className="panel" aria-labelledby={`${formId}-editor-title`}>
      <h2 id={`${formId}-editor-title`}>{copy.project}</h2>
      <p>{copy.scope}</p>
      <label htmlFor={`${formId}-name-en`}>{copy.nameEn}</label>
      <input style={fieldsStyle} id={`${formId}-name-en`} value={labelEn} maxLength={240} onChange={(event: ChangeEvent<HTMLInputElement>)=>setLabelEn(event.target.value)}/>
      <label htmlFor={`${formId}-name-fr`}>{copy.nameFr}</label>
      <input style={fieldsStyle} id={`${formId}-name-fr`} value={labelFr} maxLength={240} onChange={(event: ChangeEvent<HTMLInputElement>)=>setLabelFr(event.target.value)}/>
      <label htmlFor={`${formId}-description-en`}>{copy.descriptionEn}</label>
      <textarea style={fieldsStyle} id={`${formId}-description-en`} rows={3} value={descriptionEn} maxLength={600} onChange={(event: ChangeEvent<HTMLTextAreaElement>)=>setDescriptionEn(event.target.value)}/>
      <label htmlFor={`${formId}-description-fr`}>{copy.descriptionFr}</label>
      <textarea style={fieldsStyle} id={`${formId}-description-fr`} rows={3} value={descriptionFr} maxLength={600} onChange={(event: ChangeEvent<HTMLTextAreaElement>)=>setDescriptionFr(event.target.value)}/>
      {showError?<p role="status" aria-live="assertive">{copy.validation}</p>:null}
      <label htmlFor={`${formId}-kind`}>{copy.kind}</label>
      <select style={fieldsStyle} id={`${formId}-kind`} value={kind} onChange={(event: ChangeEvent<HTMLSelectElement>)=>setKind(event.target.value as ControlKind)}>
        {KINDS.map(value=><option key={value} value={value}>{kindLabel(value,locale)}</option>)}
      </select>
      <label htmlFor={`${formId}-activation`}>{copy.keyboard}</label>
      <select style={fieldsStyle} id={`${formId}-activation`} value={activation} onChange={(event: ChangeEvent<HTMLSelectElement>)=>setActivation(event.target.value as Activation)}>
        {ACTIVATIONS.map(value=><option key={value} value={value}>{value}</option>)}
      </select>
      <label htmlFor={`${formId}-evidence`}>{copy.evidence}</label>
      <select style={fieldsStyle} id={`${formId}-evidence`} value={evidence} onChange={(event: ChangeEvent<HTMLSelectElement>)=>setEvidence(event.target.value as Evidence)}>
        {EVIDENCE.map(value=><option key={value} value={value}>{evidenceLabel(value,locale)}</option>)}
      </select>
      <label htmlFor={`${formId}-group`}>{copy.group}</label>
      <input style={fieldsStyle} id={`${formId}-group`} value={group} maxLength={70} onChange={(event: ChangeEvent<HTMLInputElement>)=>setGroup(event.target.value)}/>
      <label htmlFor={`${formId}-source`}>{copy.source}</label>
      <input style={fieldsStyle} id={`${formId}-source`} value={sourceName} maxLength={160} onChange={(event: ChangeEvent<HTMLInputElement>)=>setSourceName(event.target.value)}/>
      <label htmlFor={`${formId}-source-url`}>{copy.sourceUrl}</label>
      <input style={fieldsStyle} id={`${formId}-source-url`} value={sourceUrl} type="url" onChange={(event: ChangeEvent<HTMLInputElement>)=>setSourceUrl(event.target.value)}/>
      <label htmlFor={`${formId}-licence`}>{copy.licence}</label>
      <input style={fieldsStyle} id={`${formId}-licence`} value={licence} maxLength={120} onChange={(event: ChangeEvent<HTMLInputElement>)=>setLicence(event.target.value)}/>
      <label htmlFor={`${formId}-date`}>{copy.date}</label>
      <input style={fieldsStyle} id={`${formId}-date`} value={date} type="date" onChange={(event: ChangeEvent<HTMLInputElement>)=>setDate(event.target.value)}/>
      <label style={{display:'flex',alignItems:'center',minHeight:44,gap:12}} htmlFor={`${formId}-reviewed`}>
        <input id={`${formId}-reviewed`} type="checkbox" checked={reviewed} onChange={(event: ChangeEvent<HTMLInputElement>)=>setReviewed(event.target.checked)}/>{copy.reviewed}
      </label>
      <div className="button-row">
        <button style={targetStyle} type="button" onClick={saveControl}>{editing?copy.save:copy.add}</button>
        {editing?<button style={targetStyle} type="button" onClick={clearForm}>{copy.cancel}</button>:null}
      </div>
    </section>
    <section className="panel" aria-labelledby={`${formId}-controls-title`}>
      <h2 id={`${formId}-controls-title`}>{copy.control} ({project.controls.length})</h2>
      {project.controls.length===0?<p>{copy.empty}</p>:<ol>{project.controls.map(control=><li key={control.id}>
        <p><strong>{control.name[locale]}</strong> — {kindLabel(control.kind,locale)} — {evidenceLabel(control.evidence,locale)}</p>
        <p>{control.description[locale]}</p>
        <div className="button-row">
          <button style={targetStyle} type="button" onClick={()=>editControl(control)}>{copy.edit}</button>
          <button style={targetStyle} type="button" onClick={()=>setProject(old=>moveControl(old,control.id,-1))}>{copy.prior}</button>
          <button style={targetStyle} type="button" onClick={()=>setProject(old=>moveControl(old,control.id,1))}>{copy.next}</button>
          <button style={targetStyle} type="button" onClick={()=>setProject(old=>removeControl(old,control.id))}>{copy.delete}</button>
        </div>
      </li>)}</ol>}
    </section>
    <section className="panel" aria-labelledby={`${formId}-switch-title`}>
      <h2 id={`${formId}-switch-title`}>{copy.switchInput}</h2>
      <label htmlFor={`${formId}-mode`}>{copy.mode}</label>
      <select style={fieldsStyle} id={`${formId}-mode`} value={machine.mode} onChange={(event: ChangeEvent<HTMLSelectElement>)=>setMachine(old=>withMode(old,event.target.value as Machine['mode']))}>
        {MODES.map(mode=><option key={mode} value={mode}>{modeLabel(mode,locale)}</option>)}
      </select>
      <label style={{display:'flex',alignItems:'center',minHeight:44,gap:12}} htmlFor={`${formId}-wrap`}>
        <input id={`${formId}-wrap`} type="checkbox" checked={machine.wrap} onChange={(event: ChangeEvent<HTMLInputElement>)=>setMachine(old=>withWrap(old,event.target.checked))}/>{copy.wrap}
      </label>
      <p role="status" aria-live="polite" aria-atomic="true">{copy.current} — {describeFocus(machine,project,locale)}</p>
      <p>{copy.selected} — {selected?.name[locale]??'UNKNOWN'}</p>
      <div className="button-row" role="group" aria-label={copy.switchInput}>
        {COMMANDS.map(command=><button style={targetStyle} key={command} type="button" onClick={()=>execute(command)}>{commandLabel(command,locale)}</button>)}
      </div>
      {active?<p>{active.description[locale]}</p>:null}
      <p>{copy.status} — {machine.phase} · {scanSummary.accepted}/{scanSummary.total}</p>
    </section>
    <section className="panel" aria-labelledby={`${formId}-report-title`}>
      <h2 id={`${formId}-report-title`}>{copy.report}</h2>
      <p role="status" aria-live="polite">{copy.status} — {decisionLabel(assessment.decision,locale)}</p>
      <p>{copy.count} — {project.controls.length} · {copy.focus} — {project.focusOrder.length}</p>
      <h3>{copy.findings} ({report.findings.length})</h3>
      {report.findings.length===0?<p>{copy.unknown}</p>:<ul>{report.findings.map((item,index)=><li key={`${item.code}-${item.path}-${index}`}>
        {item.severity==='error'?copy.error:copy.warning} — {issueLabel(item.code,locale)} ({item.path})
      </li>)}</ul>}
      <div className="button-row">
        <button style={targetStyle} type="button" onClick={()=>saveReport('json')}>{copy.exportJson}</button>
        <button style={targetStyle} type="button" onClick={()=>saveReport('csv')}>{copy.exportCsv}</button>
        <button style={targetStyle} type="button" onClick={()=>saveReport('handoff')}>{copy.report}</button>
        <button style={targetStyle} type="button" onClick={reset}>{copy.reset}</button>
      </div>
      <Link to="/" style={{display:'inline-flex',alignItems:'center',minHeight:44}}>{copy.finish}</Link>
    </section>
  </div>;
}
