import { useId, useLayoutEffect, useMemo, useReducer, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { DEFAULT_OPTIONS, KINDS, type AccessFact, type Journey, type LocalCopy, type SourceInfo, type SourceTier, type Step, type StepKind, assessJourney } from './model.ts';
import { targetsForJourney, availableTargets } from './scanner.ts';
import { exportCsv, exportJson, exportFilename, inspectSession, type Session } from './report.ts';
import { rehearsalCopy, choiceLabel, stepChangeMessage, type StepChange, kindLabel, statusLabel, reasonLabel } from './copy.ts';
import { initialSequence, sequenceReducer } from './ordering/journeySequence.ts';
import { StepOrderEditor } from './ordering/StepOrderEditor.tsx';

const targetStyle = { minWidth: 44, minHeight: 44, padding: '9px 12px' } as const;
function stamp(): string {
  const date = new Date();
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
}
function fileExport(content: string, filename: string, mime: string): void {
  const url = URL.createObjectURL(new Blob([content], { type: mime }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function AccessRehearsalPage() {
  const { i18n } = useTranslation();
  const locale = i18n.language.startsWith('fr') ? 'fr' as const : 'en' as const;
  const copy = rehearsalCopy(locale);
  const groupId = useId();
  const [name, setName] = useState('');
  const [{ steps, scan, selectedId }, dispatch] = useReducer(sequenceReducer, undefined, initialSequence);
  const nextStepId = useRef(1);
  const [lastChange, setLastChange] = useState<StepChange | null>(null);
  const [focusRequest, requestFocus] = useState<{ suffix: string } | null>(null);
  useLayoutEffect(() => {
    if (focusRequest) document.getElementById(`${groupId}-${focusRequest.suffix}`)?.focus();
  }, [focusRequest, groupId]);
  const [editing, setEditing] = useState<string | null>(null);
  const [labelEn, setLabelEn] = useState('');
  const [labelFr, setLabelFr] = useState('');
  const [detailEn, setDetailEn] = useState('');
  const [detailFr, setDetailFr] = useState('');
  const [kind, setKind] = useState<StepKind>('custom');
  const [access, setAccess] = useState<AccessFact>('unknown');
  const [tier, setTier] = useState<SourceTier>('UNKNOWN');
  const [sourceName, setSourceName] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [licence, setLicence] = useState('');
  const [collected, setCollected] = useState('');
  const [cacheState, setCacheState] = useState<LocalCopy['state']>('unknown');
  const [cachePath, setCachePath] = useState('');
  const [savedOn, setSavedOn] = useState('');
  const [needsReview, setNeedsReview] = useState(true);
  const [notes, setNotes] = useState('');
  const [showErrors, setShowErrors] = useState(false);
  const journey: Journey = useMemo(() => ({ id: 'local-rehearsal', name: { en: name || rehearsalCopy('en').title, fr: name || rehearsalCopy('fr').title },
    createdOn: stamp(), steps }), [name, steps]);
  const options = useMemo(() => ({ ...DEFAULT_OPTIONS, today: stamp() }), []);
  const assessment = useMemo(() => assessJourney(journey, options), [journey, options]);
  const targets = useMemo(() => targetsForJourney(journey, locale), [journey, locale]);
  const current = targets.find(t => t.id === scan.controls.focus);
  const selectedStep = steps.find(s => s.id === selectedId);
  const report = useMemo(() => {
    const session: Session = { journey, locale, targets, keyboard: [], announcements: [], scan, notes };
    return inspectSession(session, options);
  }, [journey, locale, targets, scan, notes, options]);
  const resetEditor = () => { setEditing(null); setLabelEn(''); setLabelFr(''); setDetailEn(''); setDetailFr(''); setKind('custom'); setAccess('unknown');
    setTier('UNKNOWN'); setSourceName(''); setSourceUrl(''); setLicence(''); setCollected(''); setCacheState('unknown');
    setCachePath(''); setSavedOn(''); setNeedsReview(true); setShowErrors(false); };
  function saveStep(): void {
    const fields = [
      ['step-en', labelEn],
      ['step-fr', labelFr],
      ['detail-en', detailEn],
      ['detail-fr', detailFr],
    ] as const;
    const missing = fields.find(([, value]) => !value.trim());
    if (missing) {
      setShowErrors(true);
      requestFocus({ suffix: missing[0] });
      return;
    }
    const id = editing ?? `step-${nextStepId.current++}`;
    const sequence = steps.find(step => step.id === id)?.sequence ?? steps.length;
    const source: SourceInfo | null = sourceName.trim() && sourceUrl.trim() && licence.trim() && collected
      ? { name: sourceName.trim(), url: sourceUrl.trim(), licence: licence.trim(), collectedOn: collected, tier } : null;
    const offline: LocalCopy = cacheState === 'stored'
      ? { state: cacheState, path: cachePath, savedOn } : { state: cacheState };
    const newValue: Step = { id, sequence, label: { en: labelEn.trim(), fr: labelFr.trim() }, detail: { en: detailEn.trim(), fr: detailFr.trim() },
      kind, access, source, offline, needsReview };
    const action = editing === null ? 'add' : 'edit';
    dispatch({ type: action, step: newValue, locale });
    setLastChange({ action, label: newValue.label });
    resetEditor();
    requestFocus({ suffix: `edit-${id}` });
  }
  function editStep(step: Step): void {
    setEditing(step.id); setLabelEn(step.label.en); setLabelFr(step.label.fr); setDetailEn(step.detail.en); setDetailFr(step.detail.fr);
    setKind(step.kind); setAccess(step.access); setTier(step.source?.tier ?? 'UNKNOWN');
    setSourceName(step.source?.name ?? ''); setSourceUrl(step.source?.url ?? ''); setLicence(step.source?.licence ?? '');
    setCollected(step.source?.collectedOn ?? ''); setCacheState(step.offline.state); setCachePath(step.offline.path ?? '');
    setSavedOn(step.offline.savedOn ?? ''); setNeedsReview(step.needsReview); setShowErrors(false);
    requestFocus({ suffix: 'step-en' });
  }
  function act(action: 'NEXT' | 'PREVIOUS' | 'SELECT' | 'CANCEL' | 'RESET'): void {
    dispatch({ type: 'scan', command: action, locale });
  }
  function cancelEdit(): void {
    resetEditor();
    requestFocus({ suffix: editing === null ? 'step-en' : `edit-${editing}` });
  }
  function removeStep(step: Step, index: number): void {
    const neighbour = steps[index + 1] ?? steps[index - 1];
    dispatch({ type: 'remove', id: step.id, locale });
    setLastChange({ action: 'remove', label: step.label });
    if (editing === step.id) resetEditor();
    requestFocus({ suffix: neighbour ? `edit-${neighbour.id}` : 'step-en' });
  }
  const separator = locale === 'fr' ? '\u00a0: ' : ': ';
  return <div className="stack" aria-labelledby={`${groupId}-title`}>
    <h1 id={`${groupId}-title`}>{copy.title}</h1>
    <p>{copy.intro}</p><p>{copy.caveat}</p><p>{copy.localOnly}</p>
    <section className="panel" aria-labelledby={`${groupId}-journey`}>
      <h2 id={`${groupId}-journey`}>{copy.steps}</h2>
      <label htmlFor={`${groupId}-name`}>{copy.name}</label>
      <input style={targetStyle} id={`${groupId}-name`} value={name} onChange={event => setName(event.target.value)} maxLength={160} />
      <p role="status" aria-live="polite" aria-atomic="true">{stepChangeMessage(lastChange, locale)}</p>
      {steps.length === 0 ? <p>{copy.empty}</p> : <ol>{steps.map((step, index) => <li key={step.id}>
        <p><strong>{step.label[locale]}</strong> — {kindLabel(step.kind, locale)} — {choiceLabel(step.access, locale)}</p>
        <p>{step.detail[locale]}</p>
        <button
          id={`${groupId}-edit-${step.id}`}
          style={targetStyle}
          type="button"
          aria-label={`${copy.edit} ${index + 1} — ${step.label[locale]}`}
          onClick={() => editStep(step)}
        >{copy.edit}</button>
        <button
          style={targetStyle}
          type="button"
          aria-label={`${copy.remove} ${index + 1} — ${step.label[locale]}`}
          onClick={() => removeStep(step, index)}
        >{copy.remove}</button>
      </li>)}</ol>}
      <h3>{editing ? copy.update : copy.newStep}</h3>
      <div className="stack">
        <label htmlFor={`${groupId}-step-en`}>{copy.stepEn}</label>
        <input style={targetStyle} id={`${groupId}-step-en`} value={labelEn} onChange={event => setLabelEn(event.target.value)} maxLength={200} aria-invalid={showErrors && !labelEn.trim()} aria-describedby={showErrors && !labelEn.trim() ? `${groupId}-validation` : undefined} />
        <label htmlFor={`${groupId}-step-fr`}>{copy.stepFr}</label>
        <input style={targetStyle} id={`${groupId}-step-fr`} value={labelFr} onChange={event => setLabelFr(event.target.value)} maxLength={200} aria-invalid={showErrors && !labelFr.trim()} aria-describedby={showErrors && !labelFr.trim() ? `${groupId}-validation` : undefined} />
        <label htmlFor={`${groupId}-detail-en`}>{copy.detailEn}</label>
        <textarea style={targetStyle} id={`${groupId}-detail-en`} rows={3} value={detailEn} onChange={event => setDetailEn(event.target.value)} maxLength={600} aria-invalid={showErrors && !detailEn.trim()} aria-describedby={showErrors && !detailEn.trim() ? `${groupId}-validation` : undefined} />
        <label htmlFor={`${groupId}-detail-fr`}>{copy.detailFr}</label>
        <textarea style={targetStyle} id={`${groupId}-detail-fr`} rows={3} value={detailFr} onChange={event => setDetailFr(event.target.value)} maxLength={600} aria-invalid={showErrors && !detailFr.trim()} aria-describedby={showErrors && !detailFr.trim() ? `${groupId}-validation` : undefined} />
        {showErrors ? <p role="alert" id={`${groupId}-validation`}>{copy.validation}</p> : null}
        <label htmlFor={`${groupId}-kind`}>{copy.kind}</label>
        <select style={targetStyle} id={`${groupId}-kind`} value={kind} onChange={event => setKind(event.target.value as StepKind)}>
          {KINDS.map(value => <option key={value} value={value}>{kindLabel(value, locale)}</option>)}
        </select>
        <label htmlFor={`${groupId}-access`}>{copy.access}</label>
        <select style={targetStyle} id={`${groupId}-access`} value={access} onChange={event => setAccess(event.target.value as AccessFact)}>
          {(['unknown','supported','limited','unsupported'] as const).map(value => <option key={value} value={value}>{choiceLabel(value, locale)}</option>)}
        </select>
        <label htmlFor={`${groupId}-source`}>{copy.source}</label>
        <input style={targetStyle} id={`${groupId}-source`} value={sourceName} onChange={event => setSourceName(event.target.value)} maxLength={180} />
        <label htmlFor={`${groupId}-url`}>{copy.sourceUrl}</label>
        <input style={targetStyle} id={`${groupId}-url`} type="url" value={sourceUrl} onChange={event => setSourceUrl(event.target.value)} />
        <label htmlFor={`${groupId}-licence`}>{copy.licence}</label>
        <input style={targetStyle} id={`${groupId}-licence`} value={licence} onChange={event => setLicence(event.target.value)} maxLength={160} />
        <label htmlFor={`${groupId}-collected`}>{copy.date}</label>
        <input style={targetStyle} id={`${groupId}-collected`} type="date" value={collected} onChange={event => setCollected(event.target.value)} />
        <label htmlFor={`${groupId}-tier`}>{copy.tier}</label>
        <select style={targetStyle} id={`${groupId}-tier`} value={tier} onChange={event => setTier(event.target.value as SourceTier)}>
          {(['UNKNOWN','PRIMARY','SECONDARY','COMMUNITY'] as const).map(value => <option key={value} value={value}>{choiceLabel(value, locale)}</option>)}
        </select>
        <label htmlFor={`${groupId}-offline`}>{copy.offline}</label>
        <select style={targetStyle} id={`${groupId}-offline`} value={cacheState} onChange={event => setCacheState(event.target.value as LocalCopy['state'])}>
          {(['unknown', 'absent', 'stored'] as const).map(value =>
            <option key={value} value={value}>{choiceLabel(value, locale)}</option>
          )}
        </select>
        {cacheState === 'stored' ? <>
          <label htmlFor={`${groupId}-cachepath`}>{copy.cachePath}</label>
          <input style={targetStyle} id={`${groupId}-cachepath`} value={cachePath} onChange={event => setCachePath(event.target.value)} />
          <label htmlFor={`${groupId}-saved`}>{copy.saved}</label>
          <input style={targetStyle} id={`${groupId}-saved`} type="date" value={savedOn} onChange={event => setSavedOn(event.target.value)} />
        </> : null}
        <label style={{ display: "inline-flex", alignItems: "center", minHeight: 44 }}><input type="checkbox" checked={needsReview} onChange={event => setNeedsReview(event.target.checked)} /> {copy.review}</label>
        <div className="button-row"><button style={targetStyle} type="button" onClick={saveStep}>{editing ? copy.update : copy.add}</button>
          <button style={targetStyle} type="button" onClick={cancelEdit}>{copy.cancel}</button></div>
      </div>
      <StepOrderEditor
        steps={steps}
        locale={locale}
        onApply={order => dispatch({ type: 'order', expected: steps.map(step => step.id), order, locale })}
      />
    </section>
    <section className="panel" aria-labelledby={`${groupId}-scan`}>
      <h2 id={`${groupId}-scan`}>{copy.keyboard}</h2>
      <p role="status" aria-live="polite">{current ? `${copy.selected}${separator}${current.name}` : copy.noSelection}</p>
      <div className="button-row">
        <button style={targetStyle} type="button" onClick={() => act('PREVIOUS')} disabled={!availableTargets(targets).length}>{copy.previous}</button>
        <button style={targetStyle} type="button" onClick={() => act('NEXT')} disabled={!availableTargets(targets).length}>{copy.next}</button>
        <button style={targetStyle} type="button" onClick={() => act('SELECT')} disabled={!current}>{copy.choose}</button>
        <button style={targetStyle} type="button" onClick={() => act('CANCEL')}>{copy.cancel}</button>
        <button style={targetStyle} type="button" onClick={() => act('RESET')}>{copy.reset}</button>
      </div>
      <p>{selectedStep ? `${copy.selected}${separator}${selectedStep.label[locale]}` : copy.noSelection}</p>
      <p>{copy.sourceNote}</p>
    </section>
    <section className="panel" aria-labelledby={`${groupId}-assessment`}>
      <h2 id={`${groupId}-assessment`}>{copy.assessment}</h2>
      <p role="status" aria-live="polite">{copy.outcome}{separator}<strong>{statusLabel(assessment.status, locale)}</strong></p>
      <ul>{report.findings.map((finding, i) => <li key={`${finding.code}-${finding.path}-${i}`}>{reasonLabel(finding.code, locale)} ({finding.path})</li>)}</ul>
      <label htmlFor={`${groupId}-notes`}>{copy.plainText}</label>
      <textarea style={targetStyle} id={`${groupId}-notes`} rows={3} maxLength={2000} value={notes} onChange={event => setNotes(event.target.value)} />
      <p>{copy.exportNote}</p>
      <div className="button-row">
        <button style={targetStyle} type="button" onClick={() => fileExport(exportCsv(report), exportFilename(journey.id, locale, 'csv'), 'text/csv')}>{copy.exportCsv}</button>
        <button style={targetStyle} type="button" onClick={() => fileExport(exportJson(report), exportFilename(journey.id, locale, 'json'), 'application/json')}>{copy.exportJson}</button>
      </div>
    </section>
    <p><Link to="/" style={{ ...targetStyle, display: 'inline-flex', alignItems: 'center' }}>{copy.returnHome}</Link></p>
  </div>;
}
