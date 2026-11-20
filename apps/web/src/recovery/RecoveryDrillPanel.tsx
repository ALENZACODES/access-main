import { useId, useMemo, useRef, useState } from "react";
import type { ChangeEvent, CSSProperties, ReactElement } from "react";
import type { LocalPackRecord } from "./packInventory";
import type { SaveTextFile } from "./recoveryExport";
import {
  DRILL_CONDITIONS, DRILL_KINDS, DRILL_LIMITS, DRILL_OUTCOMES, DRILL_TIERS,
  addDrillRun, appendDrillEvent, changeDrillPhase, emptyDrillDocument, filterDrillRuns,
  mergeDrillDocuments, nextDrillId, parseDrills, previewDrillMerge,
  recordDrillStep, serializeDrills, stepsForDrill, summarizeDrills,
  type DrillCondition, type DrillDocument, type DrillKind, type DrillLocale,
  type DrillOutcome, type DrillPhase, type DrillProvenance, type DrillTier,
} from "./recoveryDrillRun";
import { createDrillReport, drillNarrative } from "./recoveryDrillAnalysis";
import { recoveryDrillCopy } from "./recoveryDrillCopy";

export interface RecoveryDrillPanelProps {
  readonly locale: DrillLocale;
  readonly records: readonly LocalPackRecord[];
  readonly inspected: boolean;
  readonly saveFile?: SaveTextFile;
}
const frame: CSSProperties = { display: "grid", gap: 16, border: "1px solid currentColor", borderRadius: 8, padding: 16, marginBlock: 16, overflowWrap: "anywhere", minWidth: 0, maxWidth: "100%", boxSizing: "border-box", gridTemplateColumns: "minmax(0, 1fr)" };
const controls: CSSProperties = { display: "flex", flexWrap: "wrap", alignItems: "end", gap: 12 };
const input: CSSProperties = { minHeight: 44, minWidth: 44, maxWidth: "100%", boxSizing: "border-box", padding: "10px 12px", font: "inherit" };
const field: CSSProperties = { display: "grid", gap: 6, flex: "1 1 170px", minWidth: 0, maxWidth: "100%", gridTemplateColumns: "minmax(0, 1fr)" };
const item: CSSProperties = { border: "1px solid currentColor", borderRadius: 8, padding: 12, marginBlock: 10 };
const DISPLAY_LIMIT = 100;
const niceNumber = (value: number, locale: DrillLocale): string => new Intl.NumberFormat(locale === "fr" ? "fr-CA" : "en-CA").format(value);

/** Offline-only, deliberately user-directed drill review. Nothing here changes pack availability. */
export function RecoveryDrillPanel({ locale, records, inspected, saveFile }: RecoveryDrillPanelProps): ReactElement {
  const heading = useId();
  const listHeading = useId();
  const fileInput = useRef<HTMLInputElement | null>(null);
  const copy = recoveryDrillCopy(locale);
  const [document, setDocument] = useState<DrillDocument>(emptyDrillDocument);
  const [staged, setStaged] = useState<DrillDocument | null>(null);
  const [packId, setPackId] = useState("");
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<DrillKind>("inventory");
  const [condition, setCondition] = useState<DrillCondition>("UNKNOWN");
  const [tier, setTier] = useState<DrillTier>("UNKNOWN");
  const [source, setSource] = useState("");
  const [licence, setLicence] = useState("");
  const [reference, setReference] = useState("");
  const [retrievedOn, setRetrievedOn] = useState("");
  const [runId, setRunId] = useState("");
  const [stepLabel, setStepLabel] = useState("");
  const [outcome, setOutcome] = useState<DrillOutcome>("UNKNOWN");
  const [note, setNote] = useState("");
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const packs = useMemo(() => [...new Set(records.map((record) => record.id))].sort(), [records]);
  const summary = useMemo(() => summarizeDrills(document), [document]);
  const visible = useMemo(() => filterDrillRuns(document, { query }).slice(0, DISPLAY_LIMIT), [document, query]);
  const asOf = new Date().toISOString().slice(0, 10);
  const report = useMemo(() => createDrillReport(document, asOf), [document, asOf]);
  const preview = useMemo(() => staged ? previewDrillMerge(document, staged) : null, [document, staged]);
  const chosen = document.runs.find((run) => run.id === runId);
  const sourceRecord = (): DrillProvenance => ({ source, licence, retrievedOn, reference, tier });
  const onFailure = (issue: keyof typeof copy.issueNames): void => setMessage(copy.issueNames[issue]);

  function start(): void {
    if (!inspected || !packs.includes(packId)) { setMessage(copy.inspect); return; }
    const startedAt = new Date().toISOString();
    const createdId = nextDrillId(document, "run");
    const result = addDrillRun(document, {
      id: createdId, packId, kind, title, condition,
      phase: "draft", openedAt: startedAt, provenance: sourceRecord(),
    });
    if (!result.ok) { onFailure(result.issue); return; }
    const logged = appendDrillEvent(result.value, {
      id: nextDrillId(result.value, "event"), runId: createdId, at: startedAt,
      kind: "started", note: title, provenance: sourceRecord(), stepId: null,
    });
    if (!logged.ok) { onFailure(logged.issue); return; }
    setDocument(logged.value);
    setRunId(createdId);
    setTitle(""); setMessage("");
  }
  function change(phase: DrillPhase): void {
    if (!chosen) { onFailure("reference"); return; }
    const result = changeDrillPhase(document, chosen.id, phase);
    if (!result.ok) { onFailure(result.issue); return; }
    const kind = phase === "paused" ? "paused" : phase === "closed" ? "closed"
      : chosen.phase === "closed" ? "reopened" : "resumed";
    const logged = appendDrillEvent(result.value, {
      id: nextDrillId(result.value, "event"), runId: chosen.id,
      at: new Date().toISOString(), kind, note: "", provenance: sourceRecord(), stepId: null,
    });
    if (!logged.ok) { onFailure(logged.issue); return; }
    setDocument(logged.value); setMessage("");
  }
  function record(): void {
    if (!chosen) { onFailure("reference"); return; }
    if (!inspected || !packs.includes(chosen.packId)) { setMessage(copy.inspect); return; }
    const recordedAt = new Date().toISOString();
    const stepId = nextDrillId(document, "step");
    const result = recordDrillStep(document, {
      id: stepId, runId: chosen.id, label: stepLabel, condition, outcome, note,
      recordedAt, provenance: sourceRecord(),
    });
    if (!result.ok) { onFailure(result.issue); return; }
    const logged = appendDrillEvent(result.value, {
      id: nextDrillId(result.value, "event"), runId: chosen.id, at: recordedAt,
      kind: "step-recorded", note, provenance: sourceRecord(), stepId,
    });
    if (!logged.ok) { onFailure(logged.issue); return; }
    setDocument(logged.value); setStepLabel(""); setNote(""); setOutcome("UNKNOWN"); setMessage("");
  }
  async function chooseFile(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.item(0);
    event.target.value = "";
    setStaged(null);
    if (!file) return;
    if (file.size > DRILL_LIMITS.bytes) { onFailure("limit"); return; }
    setMessage(copy.pending);
    try {
      const result = parseDrills(await file.text());
      if (!result.ok) { onFailure(result.issue); return; }
      setStaged(result.value); setMessage(copy.loaded);
    } catch { setMessage(copy.failed); }
  }
  function merge(): void {
    if (!staged || !preview) return;
    if (preview.runConflicts || preview.stepConflicts || preview.eventConflicts) { onFailure("conflict"); return; }
    const result = mergeDrillDocuments(document, staged);
    if (!result.ok) { onFailure(result.issue); return; }
    setDocument(result.value); setStaged(null); setMessage(""); fileInput.current?.focus();
  }
  async function exportFile(): Promise<void> {
    if (!saveFile || busy) return;
    const result = serializeDrills(document);
    if (!result.ok) { onFailure(result.issue); return; }
    setBusy(true); setMessage(copy.pending);
    try { await saveFile("recovery-drill-run.json", result.value); setMessage(copy.saved); }
    catch { setMessage(copy.failed); }
    finally { setBusy(false); }
  }
  async function exportSummary(): Promise<void> {
    if (!saveFile || busy) return;
    setBusy(true); setMessage(copy.pending);
    try { await saveFile("recovery-drill-summary.txt", drillNarrative(document, asOf, locale)); setMessage(copy.saved); }
    catch { setMessage(copy.failed); }
    finally { setBusy(false); }
  }
  return (
    <section aria-labelledby={heading} lang={locale} style={frame}>
      <h2 id={heading}>{copy.heading}</h2>
      <p>{copy.description}</p>
      <p>{copy.warning}</p>
      <p role="status" aria-live="polite" aria-atomic="true">{message}</p>
      <div style={controls}>
        <label style={field}>{copy.pack}
          <select style={input} value={packId} onChange={(event) => setPackId(event.target.value)}>
            <option value="">{copy.unknown}</option>
            {packs.map((pack) => <option value={pack} key={pack}>{pack}</option>)}
          </select>
        </label>
        <label style={field}>{copy.kind}
          <select style={input} value={kind} onChange={(event) => setKind(event.target.value as DrillKind)}>
            {DRILL_KINDS.map((option) => <option key={option} value={option}>{copy.kinds[option]}</option>)}
          </select>
        </label>
        <label style={field}>{copy.title}
          <input style={input} value={title} maxLength={DRILL_LIMITS.text} onChange={(event) => setTitle(event.target.value)} />
        </label>
      </div>
      <fieldset>
        <legend>{copy.source}</legend>
        <div style={controls}>
          <label style={field}>{copy.source}<input style={input} value={source} maxLength={DRILL_LIMITS.text} onChange={(event) => setSource(event.target.value)} /></label>
          <label style={field}>{copy.licence}<input style={input} value={licence} maxLength={DRILL_LIMITS.text} onChange={(event) => setLicence(event.target.value)} /></label>
          <label style={field}>{copy.retrievedOn}<input type="date" style={input} value={retrievedOn} onChange={(event) => setRetrievedOn(event.target.value)} /></label>
          <label style={field}>{copy.reference}<input style={input} value={reference} maxLength={DRILL_LIMITS.text} onChange={(event) => setReference(event.target.value)} /></label>
          <label style={field}>{copy.evidenceTier}
            <select style={input} value={tier} onChange={(event) => setTier(event.target.value as DrillTier)}>
              {DRILL_TIERS.map((option) => <option value={option} key={option}>{copy.tiers[option]}</option>)}
            </select>
          </label>
        </div>
      </fieldset>
      <div style={controls}>
        <label style={field}>{copy.condition}
          <select style={input} value={condition} onChange={(event) => setCondition(event.target.value as DrillCondition)}>
            {DRILL_CONDITIONS.map((option) => <option key={option} value={option}>{copy.conditions[option]}</option>)}
          </select>
        </label>
        <button type="button" style={input} disabled={!inspected} onClick={start}>{copy.start}</button>
      </div>
      <div style={controls}>
        <label style={field}>{copy.review}
          <select style={input} value={runId} onChange={(event) => setRunId(event.target.value)}>
            <option value="">{copy.unknown}</option>
            {document.runs.map((run) => <option value={run.id} key={run.id}>{run.title} ({run.packId})</option>)}
          </select>
        </label>
        {chosen?.phase === "draft" && <button type="button" style={input} onClick={() => change("in-progress")}>{copy.resume}</button>}
        {chosen?.phase === "paused" && <button type="button" style={input} onClick={() => change("in-progress")}>{copy.resume}</button>}
        {chosen?.phase === "closed" && <button type="button" style={input} onClick={() => change("in-progress")}>{copy.reopen}</button>}
        {chosen?.phase === "in-progress" && <button type="button" style={input} onClick={() => change("paused")}>{copy.pause}</button>}
        {(chosen?.phase === "in-progress" || chosen?.phase === "paused") && <button type="button" style={input} onClick={() => change("closed")}>{copy.close}</button>}
      </div>
      {chosen?.phase === "in-progress" && (
        <fieldset>
          <legend>{copy.record}</legend>
          <div style={controls}>
            <label style={field}>{copy.stepLabel}<input style={input} value={stepLabel} maxLength={DRILL_LIMITS.text} onChange={(event) => setStepLabel(event.target.value)} /></label>
            <label style={field}>{copy.outcome}
              <select style={input} value={outcome} onChange={(event) => setOutcome(event.target.value as DrillOutcome)}>
                {DRILL_OUTCOMES.map((option) => <option key={option} value={option}>{copy.outcomes[option]}</option>)}
              </select>
            </label>
            <label style={field}>{copy.note}<input style={input} value={note} maxLength={DRILL_LIMITS.text} onChange={(event) => setNote(event.target.value)} /></label>
            <button type="button" style={input} onClick={record}>{copy.record}</button>
          </div>
        </fieldset>
      )}
      <section aria-label={copy.summary}>
        <h3>{copy.summary}</h3>
        <p>{copy.runCount}{locale === "fr" ? "\u00a0: " : ": "}{niceNumber(summary.runs, locale)}</p>
        <p>{copy.stepCount}{locale === "fr" ? "\u00a0: " : ": "}{niceNumber(summary.steps, locale)}</p>
        <p>{copy.unknown}{locale === "fr" ? "\u00a0: " : ": "}{niceNumber(summary.unknown, locale)}</p>
      </section>
      <div style={controls}>
        <label style={field}>{copy.filter}<input style={input} value={query} onChange={(event) => setQuery(event.target.value)} /></label>
        <button type="button" style={input} onClick={() => setQuery("")}>{copy.clear}</button>
      </div>
      <section aria-labelledby={`${heading} ${listHeading}`}>
        <h3 id={listHeading}>{copy.review}</h3>
        {visible.length === 0 && <p>{copy.empty}</p>}
        <ul>
          {visible.map((run) => (
            <li style={item} key={run.id}>
              <strong>{run.title}</strong> — {run.packId} — {copy.phases[run.phase]}
              <p>{copy.conditions[run.condition]} — {copy.tiers[run.provenance.tier]} — {run.provenance.source}</p>
              <ol>{stepsForDrill(document, run.id).map((step) => (
                <li key={step.id}>{step.label}: {copy.outcomes[step.outcome]} ({copy.conditions[step.condition]}) — {step.provenance.source}</li>
              ))}</ol>
            </li>
          ))}
        </ul>
      </section>
      <section aria-label={copy.findings}>
        <h3>{copy.findings}</h3>
        <ul>{report.findings.slice(0, DISPLAY_LIMIT).map((finding, index) => (
          <li key={`${finding.runId}-${finding.code}-${finding.stepId ?? "run"}-${index}`}>
            {finding.runId} — {finding.code} — {finding.description}
          </li>
        ))}</ul>
      </section>
      <div style={controls}>
        <label style={field}>{copy.open}
          <input ref={fileInput} type="file" accept=".json,application/json" style={{ ...input, width: "100%" }} onChange={(event) => { void chooseFile(event); }} />
        </label>
        {staged && preview && (
          <>
            <p>{copy.merge}{locale === "fr" ? "\u00a0: " : ": "}{preview.newRuns} / {preview.runConflicts}</p>
            <button type="button" style={input} disabled={preview.runConflicts > 0 || preview.stepConflicts > 0 || preview.eventConflicts > 0} onClick={merge}>{copy.merge}</button>
            <button type="button" style={input} onClick={() => { setStaged(null); setMessage(""); }}>{copy.cancel}</button>
          </>
        )}
        <button type="button" style={input} disabled={!saveFile || busy} onClick={() => { void exportFile(); }}>{copy.save}</button>
        <button type="button" style={input} disabled={!saveFile || busy} onClick={() => { void exportSummary(); }}>{copy.summary}</button>
      </div>
    </section>
  );
}
