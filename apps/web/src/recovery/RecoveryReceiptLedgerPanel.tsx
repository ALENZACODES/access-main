import { useId, useMemo, useRef, useState } from "react";
import type { ChangeEvent, CSSProperties, ReactElement } from "react";
import type { LocalPackRecord } from "./packInventory";
import type { SaveTextFile } from "./recoveryExport";
import {
  RECEIPT_ACTIONS, RECEIPT_CONDITIONS, RECEIPT_LIMITS, RECEIPT_OPERATIONS, RECEIPT_TIERS,
  createReceipt, emptyReceiptDocument, exportReceiptDocument, filterReceipts,
  importReceiptDocument, mergeReceiptDocuments, nextReceiptEntryId, nextReceiptEventId,
  previewReceiptMerge, receiptSummary, recordReceiptEvent,
  type ReceiptCondition, type ReceiptDocument, type ReceiptEventAction,
  type ReceiptEvidenceTier, type ReceiptOperation,
} from "./recoveryReceiptLedger";
import { receiptFindings, receiptNarrative, receiptReviewQueue } from "./recoveryReceiptAnalysis";
import { recoveryReceiptCopy } from "./recoveryReceiptCopy";

export interface RecoveryReceiptLedgerPanelProps {
  readonly locale: "en" | "fr";
  readonly records: readonly LocalPackRecord[];
  readonly inspected: boolean;
  readonly saveFile?: SaveTextFile;
  readonly onInspect?: () => void;
}
const frame: CSSProperties = {
  border: "1px solid currentColor", borderRadius: 8, padding: 16,
  marginBlock: 16, display: "grid", gap: 14, overflowWrap: "anywhere",
  width: "100%", maxWidth: "100%", minWidth: 0, boxSizing: "border-box",
  gridTemplateColumns: "minmax(0, 1fr)",
};
const control: CSSProperties = {
  minHeight: 44, minWidth: 44, maxWidth: "100%", boxSizing: "border-box",
  font: "inherit", padding: "10px 12px",
};
const fields: CSSProperties = {
  display: "flex", flexWrap: "wrap", gap: 12, alignItems: "flex-start",
};
const field: CSSProperties = {
  display: "grid", gap: 4, flex: "1 1 180px", minWidth: 0,
  maxWidth: "100%", gridTemplateColumns: "minmax(0, 1fr)",
};
const card: CSSProperties = {
  border: "1px solid currentColor", borderRadius: 6, padding: 12,
  marginBlock: 10, display: "grid", gap: 8, minWidth: 0,
  maxWidth: "100%", boxSizing: "border-box", gridTemplateColumns: "minmax(0, 1fr)",
};
const LIMIT_DISPLAY = 80;

export function RecoveryReceiptLedgerPanel({
  locale, records, inspected, saveFile, onInspect,
}: RecoveryReceiptLedgerPanelProps): ReactElement {
  const copy = recoveryReceiptCopy(locale);
  const heading = useId();
  const listHeading = useId();
  const reviewHeading = useId();
  const fileHeading = useId();
  const fileInput = useRef<HTMLInputElement | null>(null);
  const [document, setDocument] = useState<ReceiptDocument>(emptyReceiptDocument);
  const [staged, setStaged] = useState<ReceiptDocument | null>(null);
  const [packId, setPackId] = useState("");
  const [operation, setOperation] = useState<ReceiptOperation>("handoff");
  const [condition, setCondition] = useState<ReceiptCondition>("UNKNOWN");
  const [tier, setTier] = useState<ReceiptEvidenceTier>("UNKNOWN");
  const [sourceName, setSourceName] = useState("");
  const [licence, setLicence] = useState("");
  const [retrievedOn, setRetrievedOn] = useState("");
  const [sourceReference, setSourceReference] = useState("");
  const [handoffReference, setHandoffReference] = useState("");
  const [handoffRole, setHandoffRole] = useState("");
  const [summary, setSummary] = useState("");
  const [expectedBytes, setExpectedBytes] = useState("");
  const [observedBytes, setObservedBytes] = useState("");
  const [digest, setDigest] = useState("");
  const [entryId, setEntryId] = useState("");
  const [action, setAction] = useState<ReceiptEventAction>("sent");
  const [eventNote, setEventNote] = useState("");
  const [filterText, setFilterText] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const options = useMemo(() => [...new Set(records.map((record) => record.id))].sort(), [records]);
  const visible = useMemo(() => filterReceipts(document, { contains: filterText }).slice(0, LIMIT_DISPLAY), [document, filterText]);
  const overview = useMemo(() => receiptSummary(document), [document]);
  const findings = useMemo(() => receiptFindings(document, new Date().toISOString().slice(0, 10)), [document]);
  const review = useMemo(() => receiptReviewQueue(document, new Date().toISOString().slice(0, 10)), [document]);
  const preview = useMemo(() => staged ? previewReceiptMerge(document, staged) : null, [document, staged]);
  const source = { name: sourceName, licence, retrievedOn, tier, reference: sourceReference };

  function bytes(value: string): number | null {
    if (value.trim() === "") return null;
    return Number(value);
  }
  function addReceipt(): void {
    if (!inspected || !options.includes(packId)) { setMessage(copy.noInspection); return; }
    const result = createReceipt(document, {
      id: nextReceiptEntryId(document), packId, operation, stage: "draft",
      createdAt: new Date().toISOString(), source,
      observation: { condition, summary, expectedBytes: bytes(expectedBytes),
        observedBytes: bytes(observedBytes), digest: digest.trim() || null },
      handoffReference, handoffRole,
    });
    if (!result.ok) { setMessage(copy.issues[result.issue]); return; }
    setDocument(result.value);
    setSummary("");
    setExpectedBytes("");
    setObservedBytes("");
    setDigest("");
    setCondition("UNKNOWN");
    setMessage("");
  }
  function addEvent(): void {
    const chosen = document.entries.find((item) => item.id === entryId);
    if (!chosen) { setMessage(copy.issues.reference); return; }
    const result = recordReceiptEvent(document, {
      id: nextReceiptEventId(document), entryId,
      at: new Date().toISOString(), action, note: eventNote, source: chosen.source,
    });
    if (!result.ok) { setMessage(copy.issues[result.issue]); return; }
    setDocument(result.value);
    setEventNote("");
    setMessage("");
  }
  async function chooseFile(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.item(0);
    event.target.value = "";
    setStaged(null);
    if (!file) { setMessage(copy.noFile); return; }
    if (file.size > RECEIPT_LIMITS.bytes) { setMessage(copy.issues.limit); return; }
    setMessage(copy.pending);
    try {
      const parsed = importReceiptDocument(await file.text());
      if (!parsed.ok) { setMessage(copy.issues[parsed.issue]); return; }
      setStaged(parsed.value);
      setMessage(copy.staged);
    } catch { setMessage(copy.failed); }
  }
  function acceptFile(): void {
    if (!staged || !preview?.canMerge) { setMessage(copy.issues.conflict); return; }
    const result = mergeReceiptDocuments(document, staged);
    if (!result.ok) { setMessage(copy.issues[result.issue]); return; }
    setDocument(result.value);
    setStaged(null);
    setMessage("");
    fileInput.current?.focus();
  }
  async function save(): Promise<void> {
    if (!saveFile || busy) return;
    const serialized = exportReceiptDocument(document);
    if (!serialized.ok) { setMessage(copy.issues[serialized.issue]); return; }
    setBusy(true);
    try {
      await saveFile("recovery-handoff-receipts.json", serialized.value);
      setMessage(copy.saved);
    } catch { setMessage(copy.failed); }
    finally { setBusy(false); }
  }
  async function saveNarrative(): Promise<void> {
    if (!saveFile || busy) return;
    setBusy(true);
    try {
      await saveFile("recovery-handoff-receipts.txt", receiptNarrative(document, new Date().toISOString().slice(0, 10), locale));
      setMessage(copy.saved);
    } catch { setMessage(copy.failed); }
    finally { setBusy(false); }
  }
  const label = (name: string, content: ReactElement): ReactElement => (
    <label style={field}><span>{name}</span>{content}</label>
  );
  return (
    <section lang={locale} aria-labelledby={heading} style={frame}>
      <h2 id={heading}>{copy.heading}</h2>
      <p>{copy.description}</p>
      <p>{copy.caution}</p>
      {!inspected && <div>
        <p>{copy.noInspection}</p>
        {onInspect && <button type="button" style={control} onClick={onInspect}>{copy.inspect}</button>}
      </div>}
      <p role="status" aria-live="polite" aria-atomic="true">{message}</p>
      <fieldset style={frame} disabled={!inspected}>
        <legend>{copy.add}</legend>
        <div style={fields}>
          {label(copy.packId, <select style={control} value={packId} onChange={(event: ChangeEvent<HTMLSelectElement>) => setPackId(event.target.value)}>
            <option value="">{copy.unknown}</option>
            {options.map((id) => <option key={id} value={id}>{id}</option>)}
          </select>)}
          {label(copy.operation, <select style={control} value={operation} onChange={(event: ChangeEvent<HTMLSelectElement>) => setOperation(event.target.value as ReceiptOperation)}>
            {RECEIPT_OPERATIONS.map((key) => <option key={key} value={key}>{copy.operations[key]}</option>)}
          </select>)}
          {label(copy.condition, <select style={control} value={condition} onChange={(event: ChangeEvent<HTMLSelectElement>) => setCondition(event.target.value as ReceiptCondition)}>
            {RECEIPT_CONDITIONS.map((key) => <option key={key} value={key}>{copy.conditions[key]}</option>)}
          </select>)}
          {label(copy.tier, <select style={control} value={tier} onChange={(event: ChangeEvent<HTMLSelectElement>) => setTier(event.target.value as ReceiptEvidenceTier)}>
            {RECEIPT_TIERS.map((key) => <option key={key} value={key}>{copy.tiers[key]}</option>)}
          </select>)}
          {label(copy.source, <input style={control} value={sourceName} maxLength={RECEIPT_LIMITS.text} onChange={(event: ChangeEvent<HTMLInputElement>) => setSourceName(event.target.value)} />)}
          {label(copy.licence, <input style={control} value={licence} maxLength={RECEIPT_LIMITS.text} onChange={(event: ChangeEvent<HTMLInputElement>) => setLicence(event.target.value)} />)}
          {label(copy.retrievedOn, <input style={control} type="date" value={retrievedOn} onChange={(event: ChangeEvent<HTMLInputElement>) => setRetrievedOn(event.target.value)} />)}
          {label(copy.reference, <input style={control} value={sourceReference} maxLength={RECEIPT_LIMITS.reference} onChange={(event: ChangeEvent<HTMLInputElement>) => setSourceReference(event.target.value)} />)}
          {label(copy.role, <input style={control} value={handoffRole} maxLength={RECEIPT_LIMITS.text} onChange={(event: ChangeEvent<HTMLInputElement>) => setHandoffRole(event.target.value)} />)}
          {label(copy.handoffReference, <input style={control} value={handoffReference} maxLength={RECEIPT_LIMITS.reference} onChange={(event: ChangeEvent<HTMLInputElement>) => setHandoffReference(event.target.value)} />)}
          {label(copy.summary, <textarea style={control} rows={3} maxLength={RECEIPT_LIMITS.text} value={summary} onChange={(event: ChangeEvent<HTMLTextAreaElement>) => setSummary(event.target.value)} />)}
          {label(copy.expectedBytes, <input style={control} type="number" min="0" value={expectedBytes} onChange={(event: ChangeEvent<HTMLInputElement>) => setExpectedBytes(event.target.value)} />)}
          {label(copy.observedBytes, <input style={control} type="number" min="0" value={observedBytes} onChange={(event: ChangeEvent<HTMLInputElement>) => setObservedBytes(event.target.value)} />)}
          {label(copy.digest, <input style={control} value={digest} maxLength={64} onChange={(event: ChangeEvent<HTMLInputElement>) => setDigest(event.target.value)} />)}
        </div>
        <button type="button" style={control} onClick={addReceipt} disabled={!inspected}>{copy.add}</button>
      </fieldset>
      <fieldset style={frame}>
        <legend>{copy.record}</legend>
        <div style={fields}>
          {label(copy.packId, <select style={control} value={entryId} onChange={(event: ChangeEvent<HTMLSelectElement>) => setEntryId(event.target.value)}>
            <option value="">{copy.unknown}</option>
            {document.entries.map((entry) => <option key={entry.id} value={entry.id}>{entry.id} — {entry.packId}</option>)}
          </select>)}
          {label(copy.status, <select style={control} value={action} onChange={(event: ChangeEvent<HTMLSelectElement>) => setAction(event.target.value as ReceiptEventAction)}>
            {RECEIPT_ACTIONS.filter((key) => key !== "created").map((key) => <option key={key} value={key}>{copy.actions[key]}</option>)}
          </select>)}
          {label(copy.note, <textarea style={control} rows={3} maxLength={RECEIPT_LIMITS.text} value={eventNote} onChange={(event: ChangeEvent<HTMLTextAreaElement>) => setEventNote(event.target.value)} />)}
        </div>
        <button type="button" style={control} onClick={addEvent}>{copy.record}</button>
      </fieldset>
      <section aria-labelledby={reviewHeading}>
        <h3 id={reviewHeading}>{copy.review}</h3>
        <p>{copy.count}{locale === "fr" ? "\u00a0: " : ": "}{overview.entries}</p>
        <p>{copy.unknown}{locale === "fr" ? "\u00a0: " : ": "}{overview.unknown}</p>
        <p>{copy.review}{locale === "fr" ? "\u00a0: " : ": "}{findings.length}</p>
        <ul>{review.map((item) => <li key={item.id}>{item.packId} — {item.priority} — {item.reasons.join(", ")}</li>)}</ul>
      </section>
      <section aria-labelledby={listHeading}>
        <h3 id={listHeading}>{copy.count}</h3>
        {label(copy.search, <input style={control} value={filterText} onChange={(event: ChangeEvent<HTMLInputElement>) => setFilterText(event.target.value)} />)}
        <button type="button" style={control} onClick={() => setFilterText("")}>{copy.clear}</button>
        {visible.length === 0 && <p>{copy.empty}</p>}
        <ul>{visible.map((entry) => <li key={entry.id} style={card}>
          <strong>{entry.id} — {entry.packId}</strong>
          <span>{copy.operations[entry.operation]} — {copy.stages[entry.stage]}</span>
          <span>{copy.conditions[entry.observation.condition]}</span>
          <span>{entry.observation.summary || copy.unknown}</span>
          <dl>
            <dt>{copy.source}</dt><dd>{entry.source.name}</dd>
            <dt>{copy.licence}</dt><dd>{entry.source.licence}</dd>
            <dt>{copy.retrievedOn}</dt><dd>{entry.source.retrievedOn}</dd>
            <dt>{copy.tier}</dt><dd>{copy.tiers[entry.source.tier]}</dd>
            <dt>{copy.reference}</dt><dd>{entry.source.reference}</dd>
          </dl>
        </li>)}</ul>
      </section>
      <section aria-labelledby={fileHeading}>
        <h3 id={fileHeading}>{copy.open}</h3>
        <input ref={fileInput} type="file" accept=".json,application/json" style={{ ...control, width: "100%" }}
          aria-label={copy.open} onChange={(event: ChangeEvent<HTMLInputElement>) => { void chooseFile(event); }} />
        {preview && <div>
          <p>{copy.staged}</p>
          <p>{preview.incomingEntries} / {preview.incomingEvents} / {preview.conflicts}</p>
          <button type="button" style={control} disabled={!preview.canMerge} onClick={acceptFile}>{copy.merge}</button>
        </div>}
        {saveFile && <div style={fields}>
          <button type="button" style={control} disabled={busy} onClick={() => { void save(); }}>{copy.save}</button>
          <button type="button" style={control} disabled={busy} onClick={() => { void saveNarrative(); }}>{copy.review}</button>
        </div>}
      </section>
    </section>
  );
}
