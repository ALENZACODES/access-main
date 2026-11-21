import { useId, useMemo, useRef, useState } from "react";
import type { ChangeEvent, CSSProperties, ReactElement } from "react";
import type { RecoveryLocale } from "./index";
import type { LocalPackRecord } from "./packInventory";
import type { SaveTextFile } from "./recoveryExport";
import {
  CHECKPOINT_CONDITIONS, CHECKPOINT_LIMITS, CHECKPOINT_LICENCES,
  CHECKPOINT_OPERATIONS, CHECKPOINT_TIERS, addCheckpoint, checkpointSummary,
  emptyCheckpointDocument, filterCheckpoints, mergeCheckpointDocuments,
  nextCheckpointId, parseCheckpointDocument, previewCheckpointMerge,
  reviewCheckpoint, serializeCheckpointDocument,
  type CheckpointCondition, type CheckpointDocument, type CheckpointFilter,
  type CheckpointOperation, type CheckpointTier,
} from "./recoveryCheckpoint";
import {
  checkpointAnalysisExport, checkpointGaps, checkpointGuidance,
  checkpointPairs, checkpointTrends,
} from "./recoveryCheckpointAnalysis";
import { recoveryCheckpointCopy } from "./recoveryCheckpointCopy";
import { planCheckpointInvestigations } from "./recoveryCheckpointPlan";

export interface RecoveryCheckpointPanelProps {
  readonly locale: RecoveryLocale;
  readonly records: readonly LocalPackRecord[];
  readonly inspected: boolean;
  readonly saveFile?: SaveTextFile;
}
const frame: CSSProperties = {
  border: "1px solid currentColor", borderRadius: 8, padding: 16,
  marginBlock: 16, display: "grid", gap: 14, overflowWrap: "anywhere",
};
const touch: CSSProperties = {
  minHeight: 44, minWidth: 44, font: "inherit", padding: "10px 12px",
};
const fields: CSSProperties = { display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12 };
const field: CSSProperties = { display: "grid", gap: 4, minWidth: 170, flex: "1 1 170px" };
const item: CSSProperties = { border: "1px solid currentColor", borderRadius: 6, padding: 12, marginBlock: 8 };
const MAX_FILE = CHECKPOINT_LIMITS.bytes;
const DISPLAY_LIMIT = 100;

export function RecoveryCheckpointPanel({
  locale, records, inspected, saveFile,
}: RecoveryCheckpointPanelProps): ReactElement {
  const titleId = useId();
  const summaryId = useId();
  const fileId = useId();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const copy = recoveryCheckpointCopy(locale);
  const [document, setDocument] = useState<CheckpointDocument>(emptyCheckpointDocument);
  const [staged, setStaged] = useState<CheckpointDocument | null>(null);
  const [packId, setPackId] = useState("");
  const [operation, setOperation] = useState<CheckpointOperation>("pack");
  const [condition, setCondition] = useState<CheckpointCondition>("UNKNOWN");
  const [byteText, setByteText] = useState("");
  const [digestText, setDigestText] = useState("");
  const [note, setNote] = useState("");
  const [sourceName, setSourceName] = useState("");
  const [licence, setLicence] = useState<string>(CHECKPOINT_LICENCES[0]);
  const [sourceDate, setSourceDate] = useState("");
  const [tier, setTier] = useState<CheckpointTier>("UNKNOWN");
  const [reference, setReference] = useState("");
  const [filter, setFilter] = useState<CheckpointFilter>({});
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const summary = useMemo(() => checkpointSummary(document), [document]);
  const trends = useMemo(() => checkpointTrends(document), [document]);
  const gaps = useMemo(() => checkpointGaps(document), [document]);
  const suggestions = useMemo(() => checkpointGuidance(document), [document]);
  const pairs = useMemo(() => checkpointPairs(document), [document]);
  const investigations = useMemo(() => planCheckpointInvestigations(document), [document]);
  const visible = useMemo(() => filterCheckpoints(document, filter).slice(0, DISPLAY_LIMIT), [document, filter]);
  const stagedPreview = useMemo(() => staged ? previewCheckpointMerge(document, staged) : null, [document, staged]);
  const packOptions = useMemo(() => [...new Set(records.map((record) => record.id))].sort(), [records]);

  function add(): void {
    if (!inspected || !packOptions.includes(packId)) {
      setMessage(copy.issues.identity);
      return;
    }
    const bytes = byteText.trim() === "" ? null : Number(byteText);
    const digest = digestText.trim() === "" ? null : digestText.trim();
    const result = addCheckpoint(document, {
      id: nextCheckpointId(document), packId, operation,
      capturedAt: new Date().toISOString(),
      source: { name: sourceName, licence, date: sourceDate, tier, reference },
      observation: { bytes, digest, condition, note }, phase: "draft",
    });
    if (!result.ok) { setMessage(copy.issues[result.issue]); return; }
    setDocument(result.value);
    setNote("");
    setByteText("");
    setDigestText("");
    setCondition("UNKNOWN");
    setMessage("");
  }
  function mark(id: string, phase: "reviewed" | "disputed"): void {
    const result = reviewCheckpoint(document, id, phase);
    if (!result.ok) { setMessage(copy.issues[result.issue]); return; }
    setDocument(result.value);
    setMessage("");
  }
  async function loadFile(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const selected = event.target.files?.item(0);
    event.target.value = "";
    if (!selected) return;
    setStaged(null);
    if (selected.size > MAX_FILE) { setMessage(copy.issues.limit); return; }
    setMessage(copy.pending);
    try {
      const result = parseCheckpointDocument(await selected.text());
      if (!result.ok) { setMessage(copy.issues[result.issue]); return; }
      setStaged(result.value);
      setMessage("");
    } catch { setMessage(copy.failed); }
  }
  function merge(): void {
    if (!staged) return;
    const result = mergeCheckpointDocuments(document, staged);
    if (!result.ok) { setMessage(copy.issues[result.issue]); return; }
    setDocument(result.value);
    setStaged(null);
    setMessage(copy.imported);
    fileRef.current?.focus();
  }
  async function save(comparison: boolean): Promise<void> {
    if (!saveFile || saving) return;
    const value = comparison ? checkpointAnalysisExport(document) :
      (() => { const output = serializeCheckpointDocument(document); return output.ok ? output.value : null; })();
    if (value === null) { setMessage(copy.issues.limit); return; }
    setSaving(true);
    try {
      await saveFile(comparison ? "recovery-checkpoint-comparison.json" : "recovery-checkpoints.json", value);
      setMessage(copy.saved);
    } catch { setMessage(copy.failed); }
    finally { setSaving(false); }
  }

  return <section lang={locale} style={frame} aria-labelledby={titleId}>
    <h2 id={titleId}>{copy.title}</h2>
    <p>{copy.intro}</p>
    <p>{copy.notice}</p>
    <p role="status" aria-live="polite">{message}</p>
    <div aria-labelledby={summaryId} style={fields}>
      <h3 id={summaryId}>{copy.summary}</h3>
      <p>{summary.total} {copy.changed}</p>
      <p>{summary.unknown} UNKNOWN</p>
      <p>{summary.disputed} {copy.phases.disputed}</p>
      <p>{summary.withoutBytes} {copy.missing}</p>
    </div>
    <fieldset disabled={!inspected} style={{ border: 0, margin: 0, padding: 0 }}>
      <legend>{copy.add}</legend>
      <div style={fields}>
        <label style={field}>{copy.pack}
          <select style={touch} value={packId}
            onChange={(event: ChangeEvent<HTMLSelectElement>) => setPackId(event.target.value)}>
            <option value="">—</option>
            {packOptions.map((id) => <option key={id} value={id}>{id}</option>)}
          </select>
        </label>
        <label style={field}>{copy.operation}
          <select style={touch} value={operation}
            onChange={(event: ChangeEvent<HTMLSelectElement>) => setOperation(event.target.value as CheckpointOperation)}>
            {CHECKPOINT_OPERATIONS.map((value) => <option key={value} value={value}>{copy.operations[value]}</option>)}
          </select>
        </label>
        <label style={field}>{copy.condition}
          <select style={touch} value={condition}
            onChange={(event: ChangeEvent<HTMLSelectElement>) => setCondition(event.target.value as CheckpointCondition)}>
            {CHECKPOINT_CONDITIONS.map((value) => <option key={value} value={value}>{copy.conditions[value]}</option>)}
          </select>
        </label>
      </div>
      <div style={fields}>
        <label style={field}>{copy.bytes}
          <input style={touch} inputMode="numeric" value={byteText} placeholder="UNKNOWN"
            onChange={(event: ChangeEvent<HTMLInputElement>) => setByteText(event.target.value)} />
        </label>
        <label style={field}>{copy.digest}
          <input style={touch} value={digestText} placeholder="UNKNOWN" maxLength={64}
            onChange={(event: ChangeEvent<HTMLInputElement>) => setDigestText(event.target.value)} />
        </label>
        <label style={field}>{copy.source}
          <input style={touch} maxLength={CHECKPOINT_LIMITS.name} value={sourceName}
            onChange={(event: ChangeEvent<HTMLInputElement>) => setSourceName(event.target.value)} />
        </label>
      </div>
      <div style={fields}>
        <label style={field}>{copy.licence}
          <select style={touch} value={licence}
            onChange={(event: ChangeEvent<HTMLSelectElement>) => setLicence(event.target.value)}>
            {CHECKPOINT_LICENCES.map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
        </label>
        <label style={field}>{copy.sourceDate}
          <input style={touch} type="date" value={sourceDate}
            onChange={(event: ChangeEvent<HTMLInputElement>) => setSourceDate(event.target.value)} />
        </label>
        <label style={field}>{copy.tier}
          <select style={touch} value={tier}
            onChange={(event: ChangeEvent<HTMLSelectElement>) => setTier(event.target.value as CheckpointTier)}>
            {CHECKPOINT_TIERS.map((value) => <option key={value} value={value}>{copy.tiers[value]}</option>)}
          </select>
        </label>
        <label style={field}>{copy.reference}
          <input style={touch} maxLength={CHECKPOINT_LIMITS.reference} value={reference}
            onChange={(event: ChangeEvent<HTMLInputElement>) => setReference(event.target.value)} />
        </label>
      </div>
      <label style={field}>{copy.note}
        <textarea style={touch} rows={3} maxLength={CHECKPOINT_LIMITS.note} value={note}
          onChange={(event: ChangeEvent<HTMLTextAreaElement>) => setNote(event.target.value)} />
      </label>
      <button type="button" style={touch} onClick={add}>{copy.add}</button>
    </fieldset>
    <div style={fields}>
      <label htmlFor={fileId} style={field}>{copy.select}
        <input ref={fileRef} id={fileId} type="file" accept=".json,application/json"
          style={touch} onChange={(event: ChangeEvent<HTMLInputElement>) => { void loadFile(event); }} />
      </label>
      {saveFile && <button type="button" style={touch} disabled={saving}
        onClick={() => { void save(false); }}>{copy.save}</button>}
      {saveFile && <button type="button" style={touch} disabled={saving}
        onClick={() => { void save(true); }}>{copy.report}</button>}
    </div>
    {staged && <section style={item} aria-label={copy.preview}>
      <h3>{copy.preview}</h3>
      {stagedPreview?.ok ? <>
        <p>{stagedPreview.value.added.length} {copy.add}</p>
        <p>{stagedPreview.value.conflicts.length} {copy.conflicts}</p>
        <button type="button" style={touch} disabled={stagedPreview.value.conflicts.length > 0}
          onClick={merge}>{copy.apply}</button>
      </> : <p role="status">{stagedPreview ? copy.issues[stagedPreview.issue] : copy.failed}</p>}
      <button type="button" style={touch} onClick={() => { setStaged(null); setMessage(""); }}>{copy.discard}</button>
    </section>}
    <section aria-label={copy.summary}>
      <div style={fields}>
        <label style={field}>{copy.pack}
          <select style={touch} value={filter.packId ?? ""}
            onChange={(event: ChangeEvent<HTMLSelectElement>) => setFilter((old) => ({ ...old, packId: event.target.value || undefined }))}>
            <option value="">{copy.summary}</option>
            {packOptions.map((id) => <option key={id} value={id}>{id}</option>)}
          </select>
        </label>
        <label style={field}>{copy.note}
          <input style={touch} value={filter.search ?? ""}
            onChange={(event: ChangeEvent<HTMLInputElement>) => setFilter((old) => ({ ...old, search: event.target.value }))} />
        </label>
      </div>
      {visible.length === 0 ? <p>{copy.empty}</p> : <ol>
        {visible.map((entry) => <li key={entry.id} style={item}>
          <strong>{entry.packId} · {copy.operations[entry.operation]}</strong>
          <p>{copy.conditions[entry.observation.condition]} · {copy.phases[entry.phase]}</p>
          <p>{copy.bytes}{locale === "fr" ? "\u00a0: " : ": "}{entry.observation.bytes ?? "UNKNOWN"}</p>
          <p>{copy.digest}{locale === "fr" ? "\u00a0: " : ": "}{entry.observation.digest ?? "UNKNOWN"}</p>
          <dl>
            <dt>{copy.source}</dt><dd>{entry.source.name}</dd>
            <dt>{copy.licence}</dt><dd>{entry.source.licence}</dd>
            <dt>{copy.sourceDate}</dt><dd>{entry.source.date}</dd>
            <dt>{copy.tier}</dt><dd>{copy.tiers[entry.source.tier]}</dd>
          </dl>
          {entry.observation.note && <p>{entry.observation.note}</p>}
          {entry.phase === "draft" && <div style={fields}>
            <button type="button" style={touch} onClick={() => mark(entry.id, "reviewed")}>{copy.review}</button>
            <button type="button" style={touch} onClick={() => mark(entry.id, "disputed")}>{copy.dispute}</button>
          </div>}
        </li>)}
      </ol>}
    </section>
    {trends.length > 0 && <section aria-label={copy.changed}>
      <h3>{copy.changed}</h3>
      <ul>{trends.map((trend) => <li key={`${trend.packId}/${trend.operation}`}>
        {trend.packId} · {copy.operations[trend.operation]} · {copy.conditions[trend.current]}
        {trend.reportedByteChange === null ? " · UNKNOWN" : ` · ${trend.reportedByteChange}`}
      </li>)}</ul>
      <p>{pairs.length} {copy.changed}{locale === "fr" ? "\u202F; " : "; "}{gaps.length} {copy.missing}</p>
    </section>}
    {investigations.length > 0 && <p role="status">{investigations.length} {copy.actions} · UNKNOWN {investigations.filter((row) => row.reasons.includes("unknown-condition")).length}</p>}
    {suggestions.length > 0 && <section aria-label={copy.actions}>
      <h3>{copy.actions}</h3>
      <ul>{suggestions.map((guide) => <li key={`${guide.packId}/${guide.operation}`}>
        <strong>{guide.packId} · {copy.operations[guide.operation]}</strong>
        <ul>{guide.actions.map((step) => <li key={step}>{copy.steps[step]}</li>)}</ul>
      </li>)}</ul>
    </section>}
  </section>;
}
