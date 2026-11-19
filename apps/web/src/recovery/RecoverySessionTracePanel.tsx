import { useId, useMemo, useRef, useState } from "react";
import type { ChangeEvent, CSSProperties, ReactElement } from "react";
import type { RecoveryLocale } from "./index";
import type { LocalPackRecord } from "./packInventory";
import type { SaveTextFile } from "./recoveryExport";
import {
  TRACE_LIMITS, TRACE_LICENCES, TRACE_OPERATIONS, TRACE_OUTCOMES, TRACE_STAGES, TRACE_TIERS,
  appendTrace, appendTraceMoment, changeTraceOutcome, filterTraces, mergeTraces,
  newTraceDocument, nextMomentId, nextTraceId, summarizeTraces, traceExport, traceImport, tracePreview,
  type TraceCase, type TraceDocument, type TraceFilter, type TraceOperation,
  type TraceOutcome, type TraceStage, type TraceTier,
} from "./recoverySessionTrace";
import { assessTraceDocument, assessTrace, traceSequence } from "./recoverySessionAnalysis";
import { sessionCopy } from "./recoverySessionCopy";

export interface RecoverySessionTracePanelProps {
  readonly locale: RecoveryLocale;
  readonly records: readonly LocalPackRecord[];
  readonly inspected: boolean;
  readonly saveFile?: SaveTextFile;
}
const panel: CSSProperties = {
  border: "1px solid currentColor", borderRadius: 8, padding: 16,
  display: "grid", gap: 16, marginBlock: 16, overflowWrap: "anywhere",
};
const control: CSSProperties = { minHeight: 44, minWidth: 44, padding: "10px 12px", font: "inherit" };
const row: CSSProperties = { display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center" };
const column: CSSProperties = { display: "grid", gap: 5, minWidth: 170, flex: "1 1 170px" };
const itemStyle: CSSProperties = { border: "1px solid currentColor", padding: 12, borderRadius: 6, marginBlock: 8 };
function initial(): TraceDocument { return newTraceDocument(); }

/** Local notes only. Every action requires a user gesture; pack status is never modified. */
export function RecoverySessionTracePanel({ locale, records, inspected, saveFile }: RecoverySessionTracePanelProps): ReactElement {
  const copy = sessionCopy(locale);
  const heading = useId();
  const resultsId = useId();
  const importId = useId();
  const chooser = useRef<HTMLInputElement | null>(null);
  const [document, setDocument] = useState<TraceDocument>(initial);
  const [staged, setStaged] = useState<TraceDocument | null>(null);
  const [packId, setPackId] = useState("");
  const [operation, setOperation] = useState<TraceOperation>("download");
  const [outcome, setOutcome] = useState<TraceOutcome>("UNKNOWN");
  const [bytes, setBytes] = useState("");
  const [sourceName, setSourceName] = useState("");
  const [licence, setLicence] = useState<string>(TRACE_LICENCES[0]);
  const [sourceDate, setSourceDate] = useState("");
  const [tier, setTier] = useState<TraceTier>("UNKNOWN");
  const [reference, setReference] = useState("");
  const [selected, setSelected] = useState("");
  const [stage, setStage] = useState<TraceStage>("started");
  const [observed, setObserved] = useState("");
  const [note, setNote] = useState("");
  const [filter, setFilter] = useState<TraceFilter>({});
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const summary = useMemo(() => summarizeTraces(document), [document]);
  const assessments = useMemo(() => assessTraceDocument(document), [document]);
  const preview = useMemo(() => staged ? tracePreview(document, staged) : null, [document, staged]);
  const visible = useMemo(() => filterTraces(document, filter), [document, filter]);
  const packs = useMemo(() => [...new Set(records.map((r) => r.id))].sort(), [records]);
  const selectedTrace = document.traces.find((t) => t.id === selected);

  function parseBytes(input: string): number | "UNKNOWN" | null {
    if (!input.trim()) return "UNKNOWN";
    if (!/^\d{1,10}$/.test(input)) return null;
    const result = Number(input);
    return Number.isSafeInteger(result) && result <= 1024 * 1024 * 1024 ? result : null;
  }
  function addTrace(): void {
    if (!inspected || !packs.includes(packId)) { setMessage(copy.inspectFirst); return; }
    const expectedBytes = parseBytes(bytes);
    if (expectedBytes === null) { setMessage(copy.invalid); return; }
    const trace: TraceCase = {
      id: nextTraceId(document), packId, operation, outcome,
      expectedBytes, openedAt: new Date().toISOString(),
      source: { name: sourceName, licence, date: sourceDate, tier, reference }, moments: [],
    };
    const result = appendTrace(document, trace);
    if (!result.ok) { setMessage(copy.invalid); return; }
    setDocument(result.value);
    setSelected(trace.id);
    setMessage("");
  }
  function appendMoment(): void {
    if (!selectedTrace) { setMessage(copy.invalid); return; }
    const observedBytes = parseBytes(observed);
    if (observedBytes === null) { setMessage(copy.invalid); return; }
    const result = appendTraceMoment(document, selectedTrace.id, {
      id: nextMomentId(selectedTrace), at: new Date().toISOString(), stage, observedBytes, note,
    });
    if (!result.ok) { setMessage(copy.invalid); return; }
    setDocument(result.value);
    setNote("");
    setObserved("");
    setMessage("");
  }
  function setReportedOutcome(value: TraceOutcome): void {
    if (!selectedTrace) return;
    const result = changeTraceOutcome(document, selectedTrace.id, value);
    if (!result.ok) { setMessage(copy.invalid); return; }
    setDocument(result.value);
    setMessage("");
  }
  async function importFile(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.item(0);
    event.target.value = "";
    setStaged(null);
    if (!file) return;
    if (file.size > TRACE_LIMITS.maxBytes) { setMessage(copy.invalid); return; }
    try {
      const result = traceImport(await file.text());
      if (!result.ok) { setMessage(copy.invalid); return; }
      setStaged(result.value);
      setMessage("");
    } catch { setMessage(copy.readFailure); }
  }
  function applyImport(): void {
    if (!staged) return;
    const result = mergeTraces(document, staged);
    if (!result.ok) { setMessage(copy.invalid); return; }
    setDocument(result.value);
    setStaged(null);
    setMessage("");
    chooser.current?.focus();
  }
  async function save(): Promise<void> {
    if (!saveFile || saving) return;
    const result = traceExport(document);
    if (!result.ok) { setMessage(copy.invalid); return; }
    setSaving(true);
    try { await saveFile("recovery-session-traces.json", result.value); setMessage(copy.saved); }
    catch { setMessage(copy.saveFailure); }
    finally { setSaving(false); }
  }

  return <section style={panel} lang={locale} aria-labelledby={heading}>
    <h2 id={heading}>{copy.heading}</h2>
    <p>{copy.intro}</p>
    <p>{copy.manualOnly}</p>
    <p>{copy.noChanges}</p>
    <p role="status" aria-live="polite">{message}</p>
    <div style={row}>
      <p>{copy.count}{locale === "fr" ? "\u00a0: " : ": "}{summary.total}</p>
      <p>UNKNOWN{locale === "fr" ? "\u00a0: " : ": "}{summary.unknown}</p>
      <p>{copy.findings}{locale === "fr" ? "\u00a0: " : ": "}{assessments.ok ? assessments.value.requiresAttention : "UNKNOWN"}</p>
    </div>
    <fieldset disabled={!inspected} style={{ border: 0, padding: 0, margin: 0 }}>
      <legend>{copy.add}</legend>
      {!inspected && <p>{copy.inspectFirst}</p>}
      <div style={row}>
        <label style={column}>{copy.pack}
          <select style={control} value={packId} onChange={(event: ChangeEvent<HTMLSelectElement>) => setPackId(event.target.value)}>
            <option value="">—</option>
            {packs.map((id) => <option key={id} value={id}>{id}</option>)}
          </select>
        </label>
        <label style={column}>{copy.operation}
          <select style={control} value={operation} onChange={(event: ChangeEvent<HTMLSelectElement>) => setOperation(event.target.value as TraceOperation)}>
            {TRACE_OPERATIONS.map((value) => <option key={value} value={value}>{copy.operations[value]}</option>)}
          </select>
        </label>
        <label style={column}>{copy.outcome}
          <select style={control} value={outcome} onChange={(event: ChangeEvent<HTMLSelectElement>) => setOutcome(event.target.value as TraceOutcome)}>
            {TRACE_OUTCOMES.map((value) => <option key={value} value={value}>{copy.outcomes[value]}</option>)}
          </select>
        </label>
        <label style={column}>{copy.expectedBytes}
          <input style={control} inputMode="numeric" value={bytes} maxLength={10}
            placeholder="UNKNOWN" onChange={(event: ChangeEvent<HTMLInputElement>) => setBytes(event.target.value)} />
        </label>
      </div>
      <div style={row}>
        <label style={column}>{copy.source}
          <input style={control} value={sourceName} maxLength={TRACE_LIMITS.maxName}
            onChange={(event: ChangeEvent<HTMLInputElement>) => setSourceName(event.target.value)} />
        </label>
        <label style={column}>{copy.licence}
          <select style={control} value={licence} onChange={(event: ChangeEvent<HTMLSelectElement>) => setLicence(event.target.value)}>
            {TRACE_LICENCES.map((value) => <option value={value} key={value}>{value}</option>)}
          </select>
        </label>
        <label style={column}>{copy.sourceDate}
          <input style={control} type="date" value={sourceDate}
            onChange={(event: ChangeEvent<HTMLInputElement>) => setSourceDate(event.target.value)} />
        </label>
        <label style={column}>{copy.tier}
          <select style={control} value={tier} onChange={(event: ChangeEvent<HTMLSelectElement>) => setTier(event.target.value as TraceTier)}>
            {TRACE_TIERS.map((value) => <option value={value} key={value}>{copy.tiers[value]}</option>)}
          </select>
        </label>
        <label style={column}>{copy.reference}
          <input style={control} value={reference} maxLength={TRACE_LIMITS.maxReference}
            onChange={(event: ChangeEvent<HTMLInputElement>) => setReference(event.target.value)} />
        </label>
      </div>
      <button type="button" style={control} onClick={addTrace}>{copy.add}</button>
    </fieldset>

    <section aria-label={copy.current}>
      <h3>{copy.current}</h3>
      <div style={row}>
        <label style={column}>{copy.select}
          <select style={control} value={selected} onChange={(event: ChangeEvent<HTMLSelectElement>) => setSelected(event.target.value)}>
            <option value="">—</option>
            {document.traces.map((trace) => <option key={trace.id} value={trace.id}>{trace.id} · {trace.packId}</option>)}
          </select>
        </label>
        {selectedTrace && <label style={column}>{copy.outcome}
          <select style={control} value={selectedTrace.outcome} onChange={(event: ChangeEvent<HTMLSelectElement>) => setReportedOutcome(event.target.value as TraceOutcome)}>
            {TRACE_OUTCOMES.map((value) => <option value={value} key={value}>{copy.outcomes[value]}</option>)}
          </select>
        </label>}
      </div>
      {selectedTrace && <>
        <p>{copy.source}{locale === "fr" ? "\u00a0: " : ": "}{selectedTrace.source.name}</p>
        <p>{copy.licence}{locale === "fr" ? "\u00a0: " : ": "}{selectedTrace.source.licence}</p>
        <p>{copy.sourceDate}{locale === "fr" ? "\u00a0: " : ": "}{selectedTrace.source.date}</p>
        <p>{copy.tier}{locale === "fr" ? "\u00a0: " : ": "}{copy.tiers[selectedTrace.source.tier]}</p>
        <div style={row}>
          <label style={column}>{copy.stage}
            <select style={control} value={stage} onChange={(event: ChangeEvent<HTMLSelectElement>) => setStage(event.target.value as TraceStage)}>
              {TRACE_STAGES.map((value) => <option key={value} value={value}>{copy.stages[value]}</option>)}
            </select>
          </label>
          <label style={column}>{copy.observedBytes}
            <input style={control} inputMode="numeric" value={observed} maxLength={10} placeholder="UNKNOWN"
              onChange={(event: ChangeEvent<HTMLInputElement>) => setObserved(event.target.value)} />
          </label>
          <label style={column}>{copy.note}
            <textarea style={control} rows={3} maxLength={TRACE_LIMITS.maxText} value={note}
              onChange={(event: ChangeEvent<HTMLTextAreaElement>) => setNote(event.target.value)} />
          </label>
          <button type="button" style={control} onClick={appendMoment}>{copy.append}</button>
        </div>
        <ol>
          {traceSequence(selectedTrace).map((moment) => <li key={moment.id} style={itemStyle}>
            <strong>{copy.stages[moment.stage]}</strong> · <time dateTime={moment.at}>{moment.at}</time>
            <p>{copy.observedBytes}{locale === "fr" ? "\u00a0: " : ": "}{moment.bytes}</p>
          </li>)}
        </ol>
        <p>{copy.status}{locale === "fr" ? "\u00a0: " : ": "}{copy.assessments[assessTrace(selectedTrace).status]}</p>
        <p>{copy.next}{locale === "fr" ? "\u00a0: " : ": "}{copy.steps[assessTrace(selectedTrace).nextStep]}</p>
      </>}
    </section>

    <div style={row}>
      <label style={column} htmlFor={importId}>{copy.import}
        <input ref={chooser} id={importId} style={control} type="file" accept=".json,application/json"
          onChange={(event: ChangeEvent<HTMLInputElement>) => { void importFile(event); }} />
      </label>
      {saveFile && <button type="button" style={control} disabled={saving} onClick={() => { void save(); }}>{copy.export}</button>}
    </div>
    {staged && <section aria-label={copy.summary} style={itemStyle}>
      <h3>{copy.summary}</h3>
      {preview?.ok && <>
        <p>{copy.added}{locale === "fr" ? "\u00a0: " : ": "}{preview.value.added.length}</p>
        <p>{copy.unchanged}{locale === "fr" ? "\u00a0: " : ": "}{preview.value.same.length}</p>
        <p>{copy.conflicts}{locale === "fr" ? "\u00a0: " : ": "}{preview.value.collisions.length}</p>
        <button type="button" style={control} disabled={preview.value.collisions.length !== 0} onClick={applyImport}>{copy.apply}</button>
      </>}
      <button type="button" style={control} onClick={() => setStaged(null)}>{copy.cancel}</button>
    </section>}

    <section aria-labelledby={resultsId}>
      <h3 id={resultsId}>{copy.summary}</h3>
      <label style={column}>{copy.filter}
        <input style={control} value={filter.text ?? ""}
          onChange={(event: ChangeEvent<HTMLInputElement>) => setFilter((old) => ({ ...old, text: event.target.value }))} />
      </label>
      {visible.length === 0 ? <p>{copy.empty}</p> : <ul>
        {visible.map((trace) => <li key={trace.id} style={itemStyle}>
          <strong>{trace.packId} · {copy.operations[trace.operation]}</strong>
          <p>{copy.outcomes[trace.outcome]} · {trace.moments.length}</p>
          <p>{copy.source}{locale === "fr" ? "\u00a0: " : ": "}{trace.source.name}</p>
          <p>{copy.licence}{locale === "fr" ? "\u00a0: " : ": "}{trace.source.licence}</p>
          <p>{copy.sourceDate}{locale === "fr" ? "\u00a0: " : ": "}{trace.source.date}</p>
          <p>{copy.tier}{locale === "fr" ? "\u00a0: " : ": "}{copy.tiers[trace.source.tier]}</p>
        </li>)}
      </ul>}
    </section>
  </section>;
}
