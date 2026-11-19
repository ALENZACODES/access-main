import { useId, useMemo, useRef, useState } from "react";
import type { ChangeEvent, CSSProperties, ReactElement } from "react";
import type { RecoveryLocale } from "./index";
import { StateNotice } from "../states/StateNotice";
import type { LocalPackRecord } from "./packInventory";
import type { SaveTextFile } from "./recoveryExport";
import { provenanceCopy } from "./recoveryProvenanceCopy";
import {
  LEDGER_LIMITS, LEDGER_LICENCES, LEDGER_PHASES, LEDGER_TIERS, LEDGER_VALUES,
  appendLedgerStatement, fieldOverviews, filterLedger, ledgerConflicts, ledgerIds, ledgerSummary,
  loadLedger, mergeLedgerDocuments, newLedgerDocument, nextLedgerId,
  previewLedgerMerge, reviewLedgerStatement, saveLedger,
  type LedgerDocument, type LedgerFilter, type LedgerPhase,
  type LedgerStatement, type LedgerTier, type LedgerValue,
} from "./recoveryProvenanceLedger";

export interface RecoveryProvenanceLedgerProps {
  readonly locale: RecoveryLocale;
  readonly records: readonly LocalPackRecord[];
  readonly inspected: boolean;
  readonly saveFile?: SaveTextFile;
}

const panel: CSSProperties = {
  border: "1px solid currentColor", borderRadius: 8, padding: 16,
  marginBlock: 16, display: "grid", gap: 16, overflowWrap: "anywhere",
};
const controls: CSSProperties = {
  minHeight: 44, minWidth: 44, padding: "10px 12px", font: "inherit",
};
const line: CSSProperties = { display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12 };
const fieldStyle: CSSProperties = { display: "grid", gap: 4, minWidth: 165, flex: "1 1 165px" };
const summaryStyle: CSSProperties = { display: "flex", gap: 16, flexWrap: "wrap" };
const reportStyle: CSSProperties = { border: "1px solid currentColor", borderRadius: 6, padding: 12, marginBlock: 8 };

function zero(): LedgerDocument { return newLedgerDocument(); }

export function RecoveryProvenanceLedger({
  locale, records, inspected, saveFile,
}: RecoveryProvenanceLedgerProps): ReactElement {
  const headingId = useId();
  const fileId = useId();
  const resultsId = useId();
  const feedbackId = useId();
  const uploadRef = useRef<HTMLInputElement | null>(null);
  const copy = provenanceCopy(locale);
  const [document, setDocument] = useState<LedgerDocument>(zero);
  const [staged, setStaged] = useState<LedgerDocument | null>(null);
  const [selectedPack, setSelectedPack] = useState("");
  const [field, setField] = useState("");
  const [value, setValue] = useState<LedgerValue>("UNKNOWN");
  const [note, setNote] = useState("");
  const [sourceName, setSourceName] = useState("");
  const [sourceDate, setSourceDate] = useState("");
  const [licence, setLicence] = useState(LEDGER_LICENCES[0] ?? "");
  const [reference, setReference] = useState("");
  const [tier, setTier] = useState<LedgerTier>("UNKNOWN");
  const [filter, setFilter] = useState<LedgerFilter>({});
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const snapshot = useMemo(() => ledgerSummary(document), [document]);
  const conflicts = useMemo(() => ledgerConflicts(document), [document]);
  const overview = useMemo(() => fieldOverviews(document), [document]);
  const visible = useMemo(() => filterLedger(document, filter), [document, filter]);
  const preview = useMemo(() => staged ? previewLedgerMerge(document, staged) : null, [document, staged]);
  const packOptions = useMemo(() => [...new Set(records.map((record) => record.id))].sort(), [records]);
  const recordedPacks = useMemo(() => ledgerIds(document), [document]);

  function addStatement(): void {
    if (!inspected || !packOptions.includes(selectedPack)) {
      setMessage(copy.inspectFirst);
      return;
    }
    const statement: LedgerStatement = {
      id: nextLedgerId(document), packId: selectedPack, field, value,
      note, phase: "draft", recordedAt: new Date().toISOString(),
      source: { name: sourceName, licence, date: sourceDate, tier, reference },
    };
    const result = appendLedgerStatement(document, statement);
    if (!result.ok) { setMessage(copy.issues[result.issue]); return; }
    setDocument(result.value);
    setMessage("");
    setNote("");
    setField("");
    setValue("UNKNOWN");
  }

  function mark(id: string, phase: LedgerPhase): void {
    const result = reviewLedgerStatement(document, id, phase);
    if (!result.ok) { setMessage(copy.issues[result.issue]); return; }
    setDocument(result.value);
    setMessage("");
  }

  async function chooseFile(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.item(0);
    event.target.value = "";
    if (!file) return;
    setStaged(null);
    if (file.size > LEDGER_LIMITS.maxBytes) { setMessage(copy.issues.limit); return; }
    try {
      const raw = await file.text();
      const result = loadLedger(raw);
      if (!result.ok) { setMessage(copy.issues[result.issue]); return; }
      setStaged(result.value);
      setMessage("");
    } catch { setMessage(copy.readError); }
  }

  function applyPreview(): void {
    if (!staged) return;
    const merged = mergeLedgerDocuments(document, staged);
    if (!merged.ok) { setMessage(copy.issues[merged.issue]); return; }
    setDocument(merged.value);
    setStaged(null);
    setMessage("");
    uploadRef.current?.focus();
  }

  async function exportLocal(): Promise<void> {
    if (!saveFile || saving) return;
    const output = saveLedger(document);
    if (!output.ok) { setMessage(copy.issues[output.issue]); return; }
    setSaving(true);
    try {
      await saveFile("local-source-ledger.json", output.value);
      setMessage(copy.saved);
    } catch { setMessage(copy.failed); }
    finally { setSaving(false); }
  }

  return <section style={panel} aria-labelledby={headingId} lang={locale}>
    <h2 id={headingId}>{copy.heading}</h2>
    <p>{copy.intro}</p>
    <p>{copy.localOnly}</p>
    <div aria-label={copy.summary} style={summaryStyle}>
      <p>{copy.count}{locale === "fr" ? "\u00a0: " : ": "}{snapshot.count}</p>
      <p>{copy.conflicts}{locale === "fr" ? "\u00a0: " : ": "}{snapshot.conflictingFields}</p>
      <p>UNKNOWN{locale === "fr" ? "\u00a0: " : ": "}{snapshot.unknown}</p>
    </div>
    <p id={feedbackId} role="status" aria-live="polite">{message}</p>

    <fieldset disabled={!inspected} style={{ border: 0, padding: 0, margin: 0 }}>
      <legend>{copy.add}</legend>
      {!inspected && <p>{copy.inspectFirst}</p>}
      <div style={line}>
        <label style={fieldStyle}>{copy.pack}
          <select style={controls} value={selectedPack}
            onChange={(event: ChangeEvent<HTMLSelectElement>) => setSelectedPack(event.target.value)}>
            <option value="">—</option>
            {packOptions.map((id) => <option value={id} key={id}>{id}</option>)}
          </select>
        </label>
        <label style={fieldStyle}>{copy.field}
          <input style={controls} maxLength={LEDGER_LIMITS.maxField} value={field}
            onChange={(event: ChangeEvent<HTMLInputElement>) => setField(event.target.value)} />
        </label>
        <label style={fieldStyle}>{copy.value}
          <select style={controls} value={value}
            onChange={(event: ChangeEvent<HTMLSelectElement>) => setValue(event.target.value as LedgerValue)}>
            {LEDGER_VALUES.map((item) => <option value={item} key={item}>{copy.result[item]}</option>)}
          </select>
        </label>
      </div>
      <div style={line}>
        <label style={fieldStyle}>{copy.source}
          <input style={controls} maxLength={LEDGER_LIMITS.maxName} value={sourceName}
            onChange={(event: ChangeEvent<HTMLInputElement>) => setSourceName(event.target.value)} />
        </label>
        <label style={fieldStyle}>{copy.licence}
          <select style={controls} value={licence}
            onChange={(event: ChangeEvent<HTMLSelectElement>) => setLicence(event.target.value)}>
            {LEDGER_LICENCES.map((item) => <option value={item} key={item}>{item}</option>)}
          </select>
        </label>
        <label style={fieldStyle}>{copy.sourceDate}
          <input style={controls} type="date" value={sourceDate}
            onChange={(event: ChangeEvent<HTMLInputElement>) => setSourceDate(event.target.value)} />
        </label>
      </div>
      <div style={line}>
        <label style={fieldStyle}>{copy.tier}
          <select style={controls} value={tier}
            onChange={(event: ChangeEvent<HTMLSelectElement>) => setTier(event.target.value as LedgerTier)}>
            {LEDGER_TIERS.map((item) => <option key={item} value={item}>{copy.tiers[item]}</option>)}
          </select>
        </label>
        <label style={fieldStyle}>{copy.reference}
          <input style={controls} value={reference} maxLength={LEDGER_LIMITS.maxReference}
            onChange={(event: ChangeEvent<HTMLInputElement>) => setReference(event.target.value)} />
        </label>
      </div>
      <label style={fieldStyle}>{copy.note}
        <textarea style={controls} rows={3} value={note} maxLength={LEDGER_LIMITS.maxNote}
          onChange={(event: ChangeEvent<HTMLTextAreaElement>) => setNote(event.target.value)} />
      </label>
      <button style={controls} type="button" onClick={addStatement}>{copy.add}</button>
    </fieldset>

    <div style={line}>
      <label style={fieldStyle} htmlFor={fileId}>{copy.import}
        <input ref={uploadRef} id={fileId} style={controls} type="file" accept=".json,application/json"
          onChange={(event: ChangeEvent<HTMLInputElement>) => { void chooseFile(event); }} />
      </label>
      {saveFile && <button style={controls} type="button" disabled={saving}
        onClick={() => { void exportLocal(); }}>{copy.export}</button>}
    </div>
    {staged && <section aria-label={copy.stage} style={reportStyle}>
      <h3>{copy.stage}</h3>
      {preview?.ok ? <>
        <p>{copy.added}{locale === "fr" ? "\u00a0: " : ": "}{preview.value.added.length}</p>
        <p>{copy.unchanged}{locale === "fr" ? "\u00a0: " : ": "}{preview.value.same.length}</p>
        <p>{copy.collisions}{locale === "fr" ? "\u00a0: " : ": "}{preview.value.collisions.length}</p>
        <button type="button" style={controls} onClick={applyPreview}
          disabled={preview.value.collisions.length !== 0}>{copy.apply}</button>
      </> : <StateNotice
        view={{
          title: copy.stage,
          description: preview ? copy.issues[preview.issue] : copy.failed,
          actions: [{ id: "retry", label: locale === "fr" ? "Reprendre" : "Try again", minTargetPx: 44 }],
          role: "alert",
        }}
        lang={locale}
        onAction={{ retry: () => { setStaged(null); setMessage(""); uploadRef.current?.focus(); } }}
      />}
      <button type="button" style={controls} onClick={() => { setStaged(null); setMessage(""); }}>
        {copy.cancel}
      </button>
    </section>}

    <section aria-labelledby={resultsId}>
      <h3 id={resultsId}>{copy.summary}</h3>
      <div style={line}>
        <label style={fieldStyle}>{copy.search}
          <input style={controls} value={filter.search ?? ""}
            onChange={(event: ChangeEvent<HTMLInputElement>) => setFilter((old) => ({ ...old, search: event.target.value }))} />
        </label>
        <label style={fieldStyle}>{copy.pack}
          <select style={controls} value={filter.packId ?? ""}
            onChange={(event: ChangeEvent<HTMLSelectElement>) => setFilter((old) => ({ ...old, packId: event.target.value || undefined }))}>
            <option value="">{copy.all}</option>
            {recordedPacks.map((id) => <option value={id} key={id}>{id}</option>)}
          </select>
        </label>
        <label style={fieldStyle}>{copy.value}
          <select style={controls} value={filter.value ?? ""}
            onChange={(event: ChangeEvent<HTMLSelectElement>) => setFilter((old) => ({ ...old, value: event.target.value ? event.target.value as LedgerValue : undefined }))}>
            <option value="">{copy.all}</option>
            {LEDGER_VALUES.map((item) => <option value={item} key={item}>{copy.result[item]}</option>)}
          </select>
        </label>
        <label style={fieldStyle}>{copy.phase}
          <select style={controls} value={filter.phase ?? ""}
            onChange={(event: ChangeEvent<HTMLSelectElement>) => setFilter((old) => ({ ...old, phase: event.target.value ? event.target.value as LedgerPhase : undefined }))}>
            <option value="">{copy.all}</option>
            {LEDGER_PHASES.map((item) => <option value={item} key={item}>{copy.phases[item]}</option>)}
          </select>
        </label>
      </div>
      {visible.length === 0 ? <p>{copy.empty}</p> : <ol>
        {visible.map((entry) => <li key={entry.id} style={reportStyle}>
          <strong>{entry.packId} · {entry.field}</strong>
          <p>{copy.value}{locale === "fr" ? "\u00a0: " : ": "}{copy.result[entry.value]}</p>
          <p>{copy.phases[entry.phase]}</p>
          <dl>
            <dt>{copy.source}</dt><dd>{entry.source.name}</dd>
            <dt>{copy.licence}</dt><dd>{entry.source.licence}</dd>
            <dt>{copy.sourceDate}</dt><dd>{entry.source.date}</dd>
            <dt>{copy.tier}</dt><dd>{copy.tiers[entry.source.tier]}</dd>
            <dt>{copy.reference}</dt><dd>{entry.source.reference || "UNKNOWN"}</dd>
          </dl>
          {entry.note && <p>{entry.note}</p>}
          {entry.phase === "draft" && <div style={line}>
            <button type="button" style={controls} onClick={() => mark(entry.id, "reviewed")}>{copy.review}</button>
            <button type="button" style={controls} onClick={() => mark(entry.id, "disputed")}>{copy.dispute}</button>
          </div>}
        </li>)}
      </ol>}
    </section>
    <section aria-label={copy.fieldOverview}>
      <h3>{copy.fieldOverview}</h3>
      <ul>
        {overview.map((item) => <li key={`${item.packId}/${item.field}`} style={reportStyle}>
          <strong>{item.packId} · {item.field}</strong>
          <p>{item.outcome === "UNKNOWN" ? "UNKNOWN" :
            item.outcome === "disputed" ? copy.result.conflicting : copy.reported}</p>
          <p>{copy.sourceCount}{locale === "fr" ? "\u00a0: " : ": "}{item.sources.length}</p>
          <p>{copy.latestSourceDate}{locale === "fr" ? "\u00a0: " : ": "}{item.latestSourceDate ?? "UNKNOWN"}</p>
        </li>)}
      </ul>
    </section>
    <section aria-label={copy.conflicts}>
      <h3>{copy.conflicts}</h3>
      <ul>
        {conflicts.filter((item) => item.result === "disputed").map((item) =>
          <li key={`${item.packId}/${item.field}`}>{item.packId} · {item.field} — {copy.result.conflicting}</li>)}
      </ul>
    </section>
  </section>;
}
