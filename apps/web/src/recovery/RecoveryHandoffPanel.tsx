import { useId, useMemo, useRef, useState } from "react";
import type { ChangeEvent, CSSProperties, ReactElement } from "react";
import type { RecoveryLocale } from "./index";
import type { LocalPackRecord } from "./packInventory";
import type { SaveTextFile } from "./recoveryExport";
import { handoffCopy } from "./recoveryHandoffCopy";
import {
  HANDOFF_CONDITIONS, HANDOFF_DECISIONS, HANDOFF_LICENCES, HANDOFF_LIMITS,
  HANDOFF_OPERATIONS, HANDOFF_TIERS, appendHandoffCase, appendHandoffEvent,
  currentHandoffDecision, exportHandoffDocument, filterHandoffCases,
  handoffForPack, handoffSummary, mergeHandoffDocuments, newHandoffDocument,
  nextEventId, nextHandoffId, parseHandoffDocument, previewHandoffMerge,
  type HandoffCase, type HandoffCondition, type HandoffDecision, type HandoffDocument,
  type HandoffFilter, type HandoffOperation, type HandoffSource, type HandoffTier,
} from "./recoveryHandoff";

export interface RecoveryHandoffPanelProps {
  readonly locale: RecoveryLocale;
  readonly records: readonly LocalPackRecord[];
  readonly inspected: boolean;
  readonly saveFile?: SaveTextFile;
}
const panel: CSSProperties = {
  display: "grid", gap: 16, border: "1px solid currentColor",
  borderRadius: 8, padding: 16, marginBlock: 16, overflowWrap: "anywhere",
};
const control: CSSProperties = { minHeight: 44, minWidth: 44, padding: "10px 12px", font: "inherit" };
const row: CSSProperties = { display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center" };
const column: CSSProperties = { display: "grid", gap: 4, flex: "1 1 170px", minWidth: 170 };
const itemStyle: CSSProperties = { border: "1px solid currentColor", borderRadius: 6, padding: 12, marginBlock: 8 };
const localFileName = "recovery-handoff.json";

/** Session-only until an explicit Save action. Never performs a pack operation. */
export function RecoveryHandoffPanel({ locale, records, inspected, saveFile }: RecoveryHandoffPanelProps): ReactElement {
  const copy = handoffCopy(locale);
  const heading = useId();
  const resultsId = useId();
  const fileId = useId();
  const chooser = useRef<HTMLInputElement | null>(null);
  const [document, setDocument] = useState<HandoffDocument>(newHandoffDocument);
  const [staged, setStaged] = useState<HandoffDocument | null>(null);
  const [packId, setPackId] = useState("");
  const [operation, setOperation] = useState<HandoffOperation>("pack");
  const [condition, setCondition] = useState<HandoffCondition>("UNKNOWN");
  const [summaryText, setSummaryText] = useState("");
  const [sourceName, setSourceName] = useState("");
  const [licence, setLicence] = useState<string>(HANDOFF_LICENCES[0]);
  const [sourceDate, setSourceDate] = useState("");
  const [tier, setTier] = useState<HandoffTier>("UNKNOWN");
  const [reference, setReference] = useState("");
  const [selectedCase, setSelectedCase] = useState("");
  const [decision, setDecision] = useState<HandoffDecision>("review");
  const [note, setNote] = useState("");
  const [filter, setFilter] = useState<HandoffFilter>({});
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const counts = useMemo(() => handoffSummary(document), [document]);
  const preview = useMemo(() => staged ? previewHandoffMerge(document, staged) : null, [document, staged]);
  const visible = useMemo(() => filterHandoffCases(document, filter), [document, filter]);
  const packs = useMemo(() => [...new Set(records.map((record) => record.id))].sort(), [records]);
  const caseOptions = useMemo(() => document.cases.filter((item) => currentHandoffDecision(item) !== "closed"), [document]);

  function addCase(): void {
    if (!inspected || !packs.includes(packId)) { setMessage(copy.inspectFirst); return; }
    const source: HandoffSource = { name: sourceName, licence, date: sourceDate, tier, reference };
    const candidate: HandoffCase = {
      id: nextHandoffId(document), packId, operation, condition,
      openedAt: new Date().toISOString(), summary: summaryText, source, events: [],
    };
    const outcome = appendHandoffCase(document, candidate);
    if (!outcome.ok) { setMessage(copy.issues[outcome.issue]); return; }
    setDocument(outcome.value);
    setSummaryText("");
    setMessage("");
  }
  function recordDecision(): void {
    const candidate = document.cases.find((item) => item.id === selectedCase);
    if (!candidate) { setMessage(copy.issues["unknown-pack"]); return; }
    const outcome = appendHandoffEvent(document, selectedCase, {
      id: nextEventId(candidate), at: new Date().toISOString(), decision, note,
    });
    if (!outcome.ok) { setMessage(copy.issues[outcome.issue]); return; }
    setDocument(outcome.value);
    setNote("");
    setMessage("");
  }
  async function chooseFile(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.item(0);
    event.target.value = "";
    if (!file) return;
    setStaged(null);
    if (file.size > HANDOFF_LIMITS.maxBytes) { setMessage(copy.issues.limit); return; }
    try {
      const result = parseHandoffDocument(await file.text());
      if (!result.ok) { setMessage(copy.issues[result.issue]); return; }
      setStaged(result.value);
      setMessage(copy.fileReady);
    } catch { setMessage(copy.readError); }
  }
  function applyStaged(): void {
    if (!staged) return;
    const result = mergeHandoffDocuments(document, staged);
    if (!result.ok) { setMessage(copy.issues[result.issue]); return; }
    setDocument(result.value);
    setStaged(null);
    setMessage(copy.imported);
    chooser.current?.focus();
  }
  async function save(): Promise<void> {
    if (!saveFile || saving) return;
    const output = exportHandoffDocument(document);
    if (!output.ok) { setMessage(copy.issues[output.issue]); return; }
    setSaving(true);
    try {
      await saveFile(localFileName, output.value);
      setMessage(copy.saved);
    } catch { setMessage(copy.saveError); }
    finally { setSaving(false); }
  }

  return <section style={panel} lang={locale} aria-labelledby={heading}>
    <h2 id={heading}>{copy.heading}</h2>
    <p>{copy.explanation}</p>
    <p>{copy.localOnly}</p>
    <div style={row} aria-label={copy.count}>
      <p>{copy.count}{locale === "fr" ? "\u00a0: " : ": "}{counts.count}</p>
      <p>{copy.pending}{locale === "fr" ? "\u00a0: " : ": "}{counts.pending}</p>
      <p>{copy.closed}{locale === "fr" ? "\u00a0: " : ": "}{counts.closed}</p>
      <p>UNKNOWN{locale === "fr" ? "\u00a0: " : ": "}{counts.unknown}</p>
    </div>
    <p role="status" aria-live="polite" aria-atomic="true">{message}</p>
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
          <select style={control} value={operation} onChange={(event: ChangeEvent<HTMLSelectElement>) => setOperation(event.target.value as HandoffOperation)}>
            {HANDOFF_OPERATIONS.map((item) => <option value={item} key={item}>{copy.operations[item]}</option>)}
          </select>
        </label>
        <label style={column}>{copy.condition}
          <select style={control} value={condition} onChange={(event: ChangeEvent<HTMLSelectElement>) => setCondition(event.target.value as HandoffCondition)}>
            {HANDOFF_CONDITIONS.map((item) => <option value={item} key={item}>{copy.conditions[item]}</option>)}
          </select>
        </label>
      </div>
      <label style={column}>{copy.summary}
        <textarea rows={3} style={control} maxLength={HANDOFF_LIMITS.maxSummary} value={summaryText}
          onChange={(event: ChangeEvent<HTMLTextAreaElement>) => setSummaryText(event.target.value)} />
      </label>
      <div style={row}>
        <label style={column}>{copy.source}
          <input style={control} maxLength={HANDOFF_LIMITS.maxSource} value={sourceName}
            onChange={(event: ChangeEvent<HTMLInputElement>) => setSourceName(event.target.value)} />
        </label>
        <label style={column}>{copy.licence}
          <select style={control} value={licence} onChange={(event: ChangeEvent<HTMLSelectElement>) => setLicence(event.target.value)}>
            {HANDOFF_LICENCES.map((item) => <option value={item} key={item}>{item}</option>)}
          </select>
        </label>
        <label style={column}>{copy.date}
          <input type="date" style={control} value={sourceDate}
            onChange={(event: ChangeEvent<HTMLInputElement>) => setSourceDate(event.target.value)} />
        </label>
      </div>
      <div style={row}>
        <label style={column}>{copy.tier}
          <select style={control} value={tier} onChange={(event: ChangeEvent<HTMLSelectElement>) => setTier(event.target.value as HandoffTier)}>
            {HANDOFF_TIERS.map((item) => <option value={item} key={item}>{copy.tiers[item]}</option>)}
          </select>
        </label>
        <label style={column}>{copy.reference}
          <input style={control} maxLength={HANDOFF_LIMITS.maxReference} value={reference}
            onChange={(event: ChangeEvent<HTMLInputElement>) => setReference(event.target.value)} />
        </label>
      </div>
      <button style={control} type="button" onClick={addCase}>{copy.add}</button>
    </fieldset>

    <fieldset disabled={caseOptions.length === 0} style={{ border: 0, padding: 0, margin: 0 }}>
      <legend>{copy.review}</legend>
      <div style={row}>
        <label style={column}>{copy.pack}
          <select style={control} value={selectedCase} onChange={(event: ChangeEvent<HTMLSelectElement>) => setSelectedCase(event.target.value)}>
            <option value="">—</option>
            {caseOptions.map((item) => <option key={item.id} value={item.id}>{item.packId} · {item.id}</option>)}
          </select>
        </label>
        <label style={column}>{copy.decision}
          <select style={control} value={decision} onChange={(event: ChangeEvent<HTMLSelectElement>) => setDecision(event.target.value as HandoffDecision)}>
            {HANDOFF_DECISIONS.map((item) => <option value={item} key={item}>{copy.decisions[item]}</option>)}
          </select>
        </label>
      </div>
      <label style={column}>{copy.note}
        <textarea style={control} rows={2} maxLength={HANDOFF_LIMITS.maxNote} value={note}
          onChange={(event: ChangeEvent<HTMLTextAreaElement>) => setNote(event.target.value)} />
      </label>
      <button style={control} type="button" onClick={recordDecision}>{copy.recordDecision}</button>
    </fieldset>

    <div style={row}>
      <label style={column} htmlFor={fileId}>{copy.importFile}
        <input id={fileId} ref={chooser} style={control} type="file" accept=".json,application/json"
          onChange={(event: ChangeEvent<HTMLInputElement>) => { void chooseFile(event); }} />
      </label>
      {saveFile && <button type="button" disabled={saving} style={control} onClick={() => { void save(); }}>{copy.exportFile}</button>}
    </div>
    {staged && <section aria-label={copy.apply} style={itemStyle}>
      {preview?.ok ? <>
        <p>{copy.added}{locale === "fr" ? "\u00a0: " : ": "}{preview.value.added.length}</p>
        <p>{copy.unchanged}{locale === "fr" ? "\u00a0: " : ": "}{preview.value.unchanged.length}</p>
        <p>{copy.collisions}{locale === "fr" ? "\u00a0: " : ": "}{preview.value.collisions.length}</p>
        <button style={control} type="button" disabled={preview.value.collisions.length !== 0} onClick={applyStaged}>{copy.apply}</button>
      </> : <p>{preview ? copy.issues[preview.issue] : copy.readError}</p>}
      <button style={control} type="button" onClick={() => { setStaged(null); setMessage(""); }}>{copy.cancel}</button>
    </section>}

    <section aria-labelledby={resultsId}>
      <h3 id={resultsId}>{copy.count}</h3>
      <div style={row}>
        <label style={column}>{copy.search}
          <input style={control} value={filter.search ?? ""} onChange={(event: ChangeEvent<HTMLInputElement>) => setFilter((old) => ({ ...old, search: event.target.value }))} />
        </label>
        <label style={column}>{copy.pack}
          <select style={control} value={filter.packId ?? ""} onChange={(event: ChangeEvent<HTMLSelectElement>) => setFilter((old) => ({ ...old, packId: event.target.value || undefined }))}>
            <option value="">{copy.all}</option>
            {packs.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </label>
        <label style={column}>{copy.decision}
          <select style={control} value={filter.decision ?? ""} onChange={(event: ChangeEvent<HTMLSelectElement>) => setFilter((old) => ({ ...old, decision: event.target.value ? event.target.value as HandoffDecision : undefined }))}>
            <option value="">{copy.all}</option>
            {HANDOFF_DECISIONS.map((item) => <option key={item} value={item}>{copy.decisions[item]}</option>)}
          </select>
        </label>
      </div>
      {document.cases.length === 0 ? <p>{copy.noCases}</p> : visible.length === 0 ? <p>{copy.noResults}</p> :
        <ol>{visible.map((item) => <li key={item.id} style={itemStyle}>
          <strong>{item.packId} · {item.id}</strong>
          <p>{copy.conditions[item.condition]} · {copy.decisions[currentHandoffDecision(item)]}</p>
          <p>{item.summary}</p>
          <dl><dt>{copy.source}</dt><dd>{item.source.name}</dd>
            <dt>{copy.licence}</dt><dd>{item.source.licence}</dd>
            <dt>{copy.date}</dt><dd>{item.source.date}</dd>
            <dt>{copy.tier}</dt><dd>{copy.tiers[item.source.tier]}</dd>
            <dt>{copy.reference}</dt><dd>{item.source.reference || "UNKNOWN"}</dd></dl>
          <p>{copy.lastUpdated}{locale === "fr" ? "\u00a0: " : ": "}{handoffForPack(document, item.packId).latest ?? "UNKNOWN"}</p>
          <ol>{item.events.map((event) => <li key={event.id}>
            <time dateTime={event.at}>{event.at}</time> · {copy.decisions[event.decision]}
            {event.note && <p>{event.note}</p>}
          </li>)}</ol>
        </li>)}</ol>}
    </section>
  </section>;
}
