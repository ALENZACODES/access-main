import { useId, useMemo, useRef, useState } from "react";
import type { ChangeEvent, CSSProperties, ReactElement } from "react";
import type { RecoveryLocale } from "./index";
import type { LocalPackRecord } from "./packInventory";
import type { SaveTextFile } from "./recoveryExport";
import { recoveryDecisionCopy } from "./recoveryDecisionCopy";
import {
  MATRIX_CHOICES, MATRIX_CONDITIONS, MATRIX_LICENCES, MATRIX_LIMITS,
  MATRIX_OPERATIONS, MATRIX_STATUSES, MATRIX_TIERS, addMatrixCandidate,
  addMatrixReview, emptyMatrix, exportMatrix, filterMatrix, groupMatrix,
  importMatrix, matrixStatus, mergeMatrix, nextMatrixId, previewMatrixMerge,
  summarizeMatrix, type MatrixChoice, type MatrixCondition, type MatrixDocument,
  type MatrixFilters, type MatrixOperation, type MatrixStatus, type MatrixTier,
} from "./recoveryDecisionMatrix";

export interface RecoveryDecisionMatrixProps {
  readonly locale: RecoveryLocale;
  readonly records: readonly LocalPackRecord[];
  readonly inspected: boolean;
  readonly saveFile?: SaveTextFile;
}
const box: CSSProperties = { border: "1px solid currentColor", borderRadius: 8, padding: 16, marginBlock: 16, display: "grid", gap: 12 };
const control: CSSProperties = { minWidth: 44, minHeight: 44, font: "inherit", padding: "10px 12px" };
const field: CSSProperties = { display: "grid", gap: 4, flex: "1 1 170px", minWidth: 170 };
const row: CSSProperties = { display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" };

/** User-controlled local review; no network, deletion or automatic retry. */
export function RecoveryDecisionMatrix({ locale, records, inspected, saveFile }: RecoveryDecisionMatrixProps): ReactElement {
  const copy = recoveryDecisionCopy(locale);
  const heading = useId();
  const listHeading = useId();
  const chooser = useRef<HTMLInputElement | null>(null);
  const [document, setDocument] = useState<MatrixDocument>(emptyMatrix);
  const [staged, setStaged] = useState<MatrixDocument | null>(null);
  const [packId, setPackId] = useState("");
  const [operation, setOperation] = useState<MatrixOperation>("pack");
  const [condition, setCondition] = useState<MatrixCondition>("UNKNOWN");
  const [choice, setChoice] = useState<MatrixChoice>("inspect");
  const [reason, setReason] = useState("");
  const [sourceName, setSourceName] = useState("");
  const [licence, setLicence] = useState<string>(MATRIX_LICENCES[0]);
  const [date, setDate] = useState("");
  const [tier, setTier] = useState<MatrixTier>("UNKNOWN");
  const [reference, setReference] = useState("");
  const [reviewNote, setReviewNote] = useState("");
  const [filter, setFilter] = useState<MatrixFilters>({});
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const preview = useMemo(() => staged ? previewMatrixMerge(document, staged) : null, [document, staged]);
  const visible = useMemo(() => filterMatrix(document, filter), [document, filter]);
  const groups = useMemo(() => groupMatrix(document), [document]);
  const summary = useMemo(() => summarizeMatrix(document), [document]);
  const packs = useMemo(() => [...new Set(records.map((item) => item.id))].sort(), [records]);
  const packStatus = (id: string): string => {
    const state = records.find((item) => item.id === id)?.state;
    return state === undefined || state === "unknown" ? "UNKNOWN" : state;
  };

  function add(): void {
    if (!inspected || !packs.includes(packId)) { setMessage(copy.inspect); return; }
    const result = addMatrixCandidate(document, {
      id: nextMatrixId(document, "choice"), packId, operation, condition, choice, reason,
      source: { name: sourceName, licence, date, tier, reference }, createdAt: new Date().toISOString(),
    });
    if (!result.ok) { setMessage(copy.issueNames[result.issue]); return; }
    setDocument(result.value);
    setReason("");
    setMessage("");
  }
  function mark(candidateId: string, status: "reviewed" | "deferred"): void {
    const result = addMatrixReview(document, {
      id: nextMatrixId(document, "review"), candidateId, status, note: reviewNote, at: new Date().toISOString(),
    });
    if (!result.ok) { setMessage(copy.issueNames[result.issue]); return; }
    setDocument(result.value);
    setReviewNote("");
    setMessage("");
  }
  async function chooseFile(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.item(0);
    event.target.value = "";
    setStaged(null);
    if (!file) return;
    if (file.size > MATRIX_LIMITS.bytes) { setMessage(copy.issueNames.limit); return; }
    try {
      const parsed = importMatrix(await file.text());
      if (!parsed.ok) { setMessage(copy.issueNames[parsed.issue]); return; }
      setStaged(parsed.value);
      setMessage(copy.staged);
    } catch { setMessage(copy.failed); }
  }
  function apply(): void {
    if (!staged) return;
    const merged = mergeMatrix(document, staged);
    if (!merged.ok) { setMessage(copy.issueNames[merged.issue]); return; }
    setDocument(merged.value);
    setStaged(null);
    setMessage("");
    chooser.current?.focus();
  }
  async function save(): Promise<void> {
    if (!saveFile || busy) return;
    const result = exportMatrix(document);
    if (!result.ok) { setMessage(copy.issueNames[result.issue]); return; }
    setBusy(true);
    try {
      await saveFile("recovery-decision-matrix.json", result.value);
      setMessage(copy.saved);
    } catch { setMessage(copy.failed); }
    finally { setBusy(false); }
  }

  return <section lang={locale} aria-labelledby={heading} style={box}>
    <h2 id={heading}>{copy.title}</h2>
    <p>{copy.introduction}</p><p>{copy.warning}</p>
    <p role="status" aria-live="polite">{message}</p>
    <p>{copy.total}{locale === "fr" ? "\u00a0: " : ": "}{summary.total} · {copy.unknown}{locale === "fr" ? "\u00a0: " : ": "}{summary.unknown}</p>
    <fieldset disabled={!inspected} style={{ border: 0, padding: 0, margin: 0, display: "grid", gap: 12 }}>
      <legend>{copy.add}</legend>
      {!inspected && <p>{copy.inspect}</p>}
      <div style={row}>
        <label style={field}>{copy.pack}<select style={control} value={packId} onChange={(e: ChangeEvent<HTMLSelectElement>) => setPackId(e.target.value)}>
          <option value="">—</option>{packs.map((id) => <option key={id} value={id}>{id}</option>)}
        </select></label>
        <label style={field}>{copy.operation}<select style={control} value={operation} onChange={(e: ChangeEvent<HTMLSelectElement>) => setOperation(e.target.value as MatrixOperation)}>
          {MATRIX_OPERATIONS.map((item) => <option key={item} value={item}>{copy.operationNames[item]}</option>)}
        </select></label>
        <label style={field}>{copy.condition}<select style={control} value={condition} onChange={(e: ChangeEvent<HTMLSelectElement>) => setCondition(e.target.value as MatrixCondition)}>
          {MATRIX_CONDITIONS.map((item) => <option key={item} value={item}>{copy.conditionNames[item]}</option>)}
        </select></label>
        <label style={field}>{copy.choice}<select style={control} value={choice} onChange={(e: ChangeEvent<HTMLSelectElement>) => setChoice(e.target.value as MatrixChoice)}>
          {MATRIX_CHOICES.map((item) => <option key={item} value={item}>{copy.choiceNames[item]}</option>)}
        </select></label>
      </div>
      <div style={row}>
        <label style={field}>{copy.source}<input style={control} maxLength={180} value={sourceName} onChange={(e: ChangeEvent<HTMLInputElement>) => setSourceName(e.target.value)} /></label>
        <label style={field}>{copy.licence}<select style={control} value={licence} onChange={(e: ChangeEvent<HTMLSelectElement>) => setLicence(e.target.value)}>
          {MATRIX_LICENCES.map((item) => <option key={item} value={item}>{item}</option>)}
        </select></label>
        <label style={field}>{copy.date}<input type="date" style={control} value={date} onChange={(e: ChangeEvent<HTMLInputElement>) => setDate(e.target.value)} /></label>
        <label style={field}>{copy.tier}<select style={control} value={tier} onChange={(e: ChangeEvent<HTMLSelectElement>) => setTier(e.target.value as MatrixTier)}>
          {MATRIX_TIERS.map((item) => <option key={item} value={item}>{copy.tierNames[item]}</option>)}
        </select></label>
        <label style={field}>{copy.reference}<input style={control} maxLength={MATRIX_LIMITS.reference} value={reference} onChange={(e: ChangeEvent<HTMLInputElement>) => setReference(e.target.value)} /></label>
      </div>
      <label style={field}>{copy.reason}<textarea style={control} rows={3} maxLength={MATRIX_LIMITS.text} value={reason} onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setReason(e.target.value)} /></label>
      <button type="button" style={control} onClick={add}>{copy.add}</button>
    </fieldset>
    <div style={row}>
      <label style={field}>{copy.import}<input ref={chooser} type="file" accept="application/json,.json" style={control}
        onChange={(e: ChangeEvent<HTMLInputElement>) => { void chooseFile(e); }} /></label>
      {saveFile && <button type="button" style={control} disabled={busy} onClick={() => { void save(); }}>{copy.export}</button>}
    </div>
    {staged && <section style={box} aria-label={copy.staged}>
      <h3>{copy.staged}</h3>
      {preview?.ok ? <>
        <p>{copy.matches}{locale === "fr" ? "\u00a0: " : ": "}{preview.value.additions.length}</p>
        <p>{copy.conflict}{locale === "fr" ? "\u00a0: " : ": "}{preview.value.conflicts.length}</p>
        <button type="button" style={control} disabled={preview.value.conflicts.length > 0} onClick={apply}>{copy.apply}</button>
      </> : <p role="status">{preview ? copy.issueNames[preview.issue] : copy.failed}</p>}
      <button type="button" style={control} onClick={() => setStaged(null)}>{copy.cancel}</button>
    </section>}
    <section aria-labelledby={listHeading}>
      <h3 id={listHeading}>{copy.list}</h3>
      <div style={row}>
        <label style={field}>{copy.search}<input style={control} value={filter.query ?? ""} onChange={(e: ChangeEvent<HTMLInputElement>) => setFilter((old) => ({ ...old, query: e.target.value }))} /></label>
        <label style={field}>{copy.operation}<select style={control} value={filter.operation ?? ""} onChange={(e: ChangeEvent<HTMLSelectElement>) => setFilter((old) => ({ ...old, operation: e.target.value ? e.target.value as MatrixOperation : undefined }))}>
          <option value="">{copy.all}</option>{MATRIX_OPERATIONS.map((item) => <option key={item} value={item}>{copy.operationNames[item]}</option>)}
        </select></label>
        <label style={field}>{copy.status}<select style={control} value={filter.status ?? ""} onChange={(e: ChangeEvent<HTMLSelectElement>) => setFilter((old) => ({ ...old, status: e.target.value ? e.target.value as MatrixStatus : undefined }))}>
          <option value="">{copy.all}</option>{MATRIX_STATUSES.map((item) => <option key={item} value={item}>{copy.statusNames[item]}</option>)}
        </select></label>
      </div>
      <p>{copy.matches}{locale === "fr" ? "\u00a0: " : ": "}{visible.length}</p>
      {visible.length === 0 ? <p>{copy.empty}</p> : <ol>
        {visible.map((item) => <li key={item.id} style={box}>
          <h4>{item.packId} · {copy.operationNames[item.operation]}</h4>
          <p>{copy.conditionNames[item.condition]} · {copy.choiceNames[item.choice]}</p>
          <p>{copy.statusNames[matrixStatus(document, item.id)]} · {packStatus(item.packId)}</p>
          <p>{item.reason}</p>
          <dl><dt>{copy.source}</dt><dd>{item.source.name}</dd>
            <dt>{copy.licence}</dt><dd>{item.source.licence}</dd>
            <dt>{copy.date}</dt><dd>{item.source.date}</dd>
            <dt>{copy.tier}</dt><dd>{copy.tierNames[item.source.tier]}</dd>
            <dt>{copy.reference}</dt><dd>{item.source.reference || "UNKNOWN"}</dd></dl>
          {matrixStatus(document, item.id) === "draft" && <>
            <label style={field}>{copy.note}<textarea style={control} value={reviewNote} maxLength={MATRIX_LIMITS.text}
              onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setReviewNote(e.target.value)} /></label>
            <div style={row}>
              <button type="button" style={control} onClick={() => mark(item.id, "reviewed")}>{copy.review}</button>
              <button type="button" style={control} onClick={() => mark(item.id, "deferred")}>{copy.defer}</button>
            </div>
          </>}
        </li>)}
      </ol>}
      <p>{copy.pack}{locale === "fr" ? "\u00a0: " : ": "}{groups.length}</p>
    </section>
  </section>;
}
