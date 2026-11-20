import { useId, useMemo, useRef, useState } from "react";
import type { ChangeEvent, CSSProperties, ReactElement } from "react";
import type { LocalPackRecord } from "./packInventory";
import type { SaveTextFile } from "./recoveryExport";
import {
  RECONCILIATION_CONDITIONS, RECONCILIATION_DISPOSITIONS, RECONCILIATION_LIMITS,
  RECONCILIATION_OPERATIONS, RECONCILIATION_STATUSES, RECONCILIATION_TIERS,
  addReconciliationCase, addReconciliationEvent, addReconciliationObservation,
  caseCurrentCondition, caseHasContradiction, eventsForCase, filterReconciliationCases,
  mergeReconciliationDocuments, newReconciliationDocument, nextReconciliationId,
  observationsForCase, parseReconciliation, previewReconciliationMerge,
  reconciliationSummary, serializeReconciliation,
  type ReconciliationCondition, type ReconciliationDisposition,
  type ReconciliationDocument, type ReconciliationFilter, type ReconciliationOperation,
  type ReconciliationSource, type ReconciliationTier,
} from "./recoveryReconciliation";
import { reconciliationFindings, reconciliationPackGroups, reconciliationTextReport } from "./recoveryReconciliationAnalysis";
import { reconciliationCopy } from "./recoveryReconciliationCopy";

export interface RecoveryReconciliationPanelProps {
  readonly locale: "en" | "fr";
  readonly records: readonly LocalPackRecord[];
  readonly inspected: boolean;
  readonly saveFile?: SaveTextFile;
  readonly onInspect?: () => void;
}
const frame: CSSProperties = { border: "1px solid currentColor", borderRadius: 8, padding: 16, marginBlock: 16, display: "grid", gap: 14, overflowWrap: "anywhere", minWidth: 0, maxWidth: "100%", boxSizing: "border-box", gridTemplateColumns: "minmax(0, 1fr)" };
const control: CSSProperties = { minWidth: 44, minHeight: 44, maxWidth: "100%", boxSizing: "border-box", padding: "10px 12px", font: "inherit" };
const row: CSSProperties = { display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center" };
const field: CSSProperties = { display: "grid", gap: 5, flex: "1 1 180px", minWidth: 0, maxWidth: "100%", gridTemplateColumns: "minmax(0, 1fr)" };
const item: CSSProperties = { border: "1px solid currentColor", borderRadius: 6, padding: 12, display: "grid", gap: 8 };
const label: CSSProperties = { fontWeight: 600 };
const displayLimit = 100;
const day = (): string => new Date().toISOString().slice(0, 10);
const instant = (): string => new Date().toISOString();

export function RecoveryReconciliationPanel({ locale, records, inspected, saveFile, onInspect }: RecoveryReconciliationPanelProps): ReactElement {
  const copy = reconciliationCopy(locale);
  const heading = useId();
  const casesHeading = useId();
  const findingsHeading = useId();
  const transferHeading = useId();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [document, setDocument] = useState<ReconciliationDocument>(newReconciliationDocument);
  const [staged, setStaged] = useState<ReconciliationDocument | null>(null);
  const [selectedPack, setSelectedPack] = useState("");
  const [selectedCase, setSelectedCase] = useState("");
  const [caseTitle, setCaseTitle] = useState("");
  const [caseSummary, setCaseSummary] = useState("");
  const [operation, setOperation] = useState<ReconciliationOperation>("pack");
  const [condition, setCondition] = useState<ReconciliationCondition>("UNKNOWN");
  const [disposition, setDisposition] = useState<ReconciliationDisposition>("seek-source");
  const [sourceName, setSourceName] = useState("");
  const [sourceLicence, setSourceLicence] = useState("");
  const [sourceDate, setSourceDate] = useState("");
  const [sourceTier, setSourceTier] = useState<ReconciliationTier>("UNKNOWN");
  const [sourceReference, setSourceReference] = useState("");
  const [note, setNote] = useState("");
  const [filter, setFilter] = useState<ReconciliationFilter>({});
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const packs = useMemo(() => [...new Set(records.map((p) => p.id))].sort(), [records]);
  const summary = useMemo(() => reconciliationSummary(document), [document]);
  const visible = useMemo(() => filterReconciliationCases(document, filter).slice(0, displayLimit), [document, filter]);
  const findings = useMemo(() => reconciliationFindings(document, day()).slice(0, displayLimit), [document]);
  const groups = useMemo(() => reconciliationPackGroups(document), [document]);
  const preview = useMemo(() => staged ? previewReconciliationMerge(document, staged) : null, [document, staged]);
  const chosen = document.cases.find((c) => c.id === selectedCase);
  const source = (): ReconciliationSource => ({
    name: sourceName, licence: sourceLicence, retrievedOn: sourceDate,
    tier: sourceTier, reference: sourceReference,
  });
  function showIssue(issue: string): void {
    setMessage(copy.issues[issue as keyof typeof copy.issues] ?? copy.failed);
  }
  function createCase(): void {
    if (!inspected || !packs.includes(selectedPack)) { setMessage(copy.notInspected); return; }
    const result = addReconciliationCase(document, {
      id: nextReconciliationId(document, "case"), packId: selectedPack, operation,
      status: "open", disposition: "UNKNOWN", openedAt: instant(), title: caseTitle,
      summary: caseSummary, source: source(),
    });
    if (!result.ok) { showIssue(result.issue); return; }
    setDocument(result.value);
    setSelectedCase(result.value.cases[result.value.cases.length - 1]?.id ?? "");
    setCaseTitle(""); setCaseSummary(""); setMessage("");
  }
  function recordObservation(): void {
    if (!chosen) { setMessage(copy.notInspected); return; }
    const result = addReconciliationObservation(document, {
      id: nextReconciliationId(document, "obs"), caseId: chosen.id,
      condition, recordedAt: instant(), source: source(), note,
    });
    if (!result.ok) { showIssue(result.issue); return; }
    setDocument(result.value); setCondition("UNKNOWN"); setNote(""); setMessage("");
  }
  function recordActivity(action: "noted" | "reviewed" | "deferred" | "reopened" | "closed"): void {
    if (!chosen) { setMessage(copy.notInspected); return; }
    const result = addReconciliationEvent(document, {
      id: nextReconciliationId(document, "evt"), caseId: chosen.id,
      action, at: instant(), note, source: source(),
    }, action === "closed" ? disposition : undefined);
    if (!result.ok) { showIssue(result.issue); return; }
    setDocument(result.value); setNote(""); setMessage("");
  }
  async function chooseFile(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.item(0);
    event.target.value = "";
    setStaged(null);
    if (!file) return;
    if (file.size > RECONCILIATION_LIMITS.bytes) { showIssue("size"); return; }
    try {
      const result = parseReconciliation(await file.text());
      if (!result.ok) { showIssue(result.issue); return; }
      setStaged(result.value); setMessage(copy.pendingImport);
    } catch { setMessage(copy.failed); }
  }
  function acceptImport(): void {
    if (!staged || !preview || !preview.canMerge) { setMessage(copy.conflict); return; }
    const result = mergeReconciliationDocuments(document, staged);
    if (!result.ok) { showIssue(result.issue); return; }
    setDocument(result.value); setStaged(null); setMessage(copy.imported);
    inputRef.current?.focus();
  }
  async function save(textOnly: boolean): Promise<void> {
    if (!saveFile || busy) return;
    const json = serializeReconciliation(document);
    if (!json.ok) { showIssue(json.issue); return; }
    setBusy(true);
    try {
      const content = textOnly ? reconciliationTextReport(document, day(), locale) : json.value;
      await saveFile(textOnly ? "recovery-reconciliation-summary.txt" : "recovery-reconciliation.json", content);
      setMessage(copy.saved);
    } catch { setMessage(copy.failed); }
    finally { setBusy(false); }
  }
  const colon = locale === "fr" ? "\u00a0: " : ": ";
  return (
    <section style={frame} aria-labelledby={heading} lang={locale}>
      <h2 id={heading}>{copy.heading}</h2>
      <p>{copy.description}</p>
      <p>{copy.caution}</p>
      <p role="status" aria-live="polite" aria-atomic="true">{message}</p>
      <dl style={row}>
        <div><dt>{copy.caseCount}</dt><dd>{summary.cases}</dd></div>
        <div><dt>{copy.observationCount}</dt><dd>{summary.observations}</dd></div>
        <div><dt>{copy.eventCount}</dt><dd>{summary.events}</dd></div>
        <div><dt>{copy.unresolvedCount}</dt><dd>{summary.open + summary.inReview + summary.deferred}</dd></div>
        <div><dt>{copy.contradictionCount}</dt><dd>{summary.contradictions}</dd></div>
        <div><dt>{copy.unknown}</dt><dd>{summary.unknown}</dd></div>
      </dl>
      {!inspected && onInspect && <button type="button" style={control} onClick={onInspect}>{copy.refresh}</button>}
      <fieldset style={frame} disabled={!inspected}>
        <legend>{copy.addCase}</legend>
        <div style={row}>
          <label style={field}><span style={label}>{copy.pack}</span>
            <select style={control} value={selectedPack} onChange={(event) => setSelectedPack(event.target.value)}>
              <option value="">{copy.choose}</option>
              {packs.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </label>
          <label style={field}><span style={label}>{copy.operation}</span>
            <select style={control} value={operation} onChange={(event) => setOperation(event.target.value as ReconciliationOperation)}>
              {RECONCILIATION_OPERATIONS.map((o) => <option key={o} value={o}>{copy.operations[o]}</option>)}
            </select>
          </label>
          <label style={field}><span style={label}>{copy.title}</span>
            <input style={control} value={caseTitle} maxLength={RECONCILIATION_LIMITS.text} onChange={(event) => setCaseTitle(event.target.value)} />
          </label>
          <label style={field}><span style={label}>{copy.summary}</span>
            <input style={control} value={caseSummary} maxLength={RECONCILIATION_LIMITS.text} onChange={(event) => setCaseSummary(event.target.value)} />
          </label>
        </div>
        <h3>{copy.source}</h3>
        <div style={row}>
          <label style={field}><span style={label}>{copy.source}</span>
            <input style={control} value={sourceName} maxLength={RECONCILIATION_LIMITS.text} onChange={(e) => setSourceName(e.target.value)} />
          </label>
          <label style={field}><span style={label}>{copy.licence}</span>
            <input style={control} value={sourceLicence} maxLength={RECONCILIATION_LIMITS.text} onChange={(e) => setSourceLicence(e.target.value)} />
          </label>
          <label style={field}><span style={label}>{copy.retrievedOn}</span>
            <input style={control} type="date" value={sourceDate} onChange={(e) => setSourceDate(e.target.value)} />
          </label>
          <label style={field}><span style={label}>{copy.tier}</span>
            <select style={control} value={sourceTier} onChange={(e) => setSourceTier(e.target.value as ReconciliationTier)}>
              {RECONCILIATION_TIERS.map((v) => <option key={v} value={v}>{copy.tiers[v]}</option>)}
            </select>
          </label>
          <label style={field}><span style={label}>{copy.reference}</span>
            <input style={control} value={sourceReference} maxLength={RECONCILIATION_LIMITS.text} onChange={(e) => setSourceReference(e.target.value)} />
          </label>
        </div>
        <button type="button" style={control} onClick={createCase}>{copy.addCase}</button>
      </fieldset>
      <fieldset style={frame}>
        <legend>{copy.observation}</legend>
        <div style={row}>
          <label style={field}><span style={label}>{copy.choose}</span>
            <select style={control} value={selectedCase} onChange={(e) => setSelectedCase(e.target.value)}>
              <option value="">{copy.choose}</option>
              {document.cases.map((c) => <option key={c.id} value={c.id}>{c.id}{colon}{c.title}</option>)}
            </select>
          </label>
          <label style={field}><span style={label}>{copy.condition}</span>
            <select style={control} value={condition} onChange={(e) => setCondition(e.target.value as ReconciliationCondition)}>
              {RECONCILIATION_CONDITIONS.map((v) => <option key={v} value={v}>{copy.conditions[v]}</option>)}
            </select>
          </label>
          <label style={field}><span style={label}>{copy.note}</span>
            <input style={control} value={note} maxLength={RECONCILIATION_LIMITS.text} onChange={(e) => setNote(e.target.value)} />
          </label>
        </div>
        <div style={row}>
          <button type="button" style={control} disabled={!chosen} onClick={recordObservation}>{copy.addObservation}</button>
          <button type="button" style={control} disabled={!chosen || chosen.status === "closed"} onClick={() => recordActivity("noted")}>{copy.addEvent}</button>
          <button type="button" style={control} disabled={!chosen || chosen.status === "closed" || chosen.status === "in-review"} onClick={() => recordActivity("reviewed")}>{copy.requestReview}</button>
          <button type="button" style={control} disabled={!chosen || chosen.status === "closed"} onClick={() => recordActivity("deferred")}>{copy.defer}</button>
          <label style={field}><span style={label}>{copy.disposition}</span>
            <select style={control} value={disposition} onChange={(e) => setDisposition(e.target.value as ReconciliationDisposition)}>
              {RECONCILIATION_DISPOSITIONS.map((v) => <option key={v} value={v}>{copy.dispositions[v]}</option>)}
            </select>
          </label>
          <button type="button" style={control} disabled={!chosen || chosen.status === "closed"} onClick={() => recordActivity("closed")}>{copy.close}</button>
          <button type="button" style={control} disabled={!chosen || chosen.status !== "closed"} onClick={() => recordActivity("reopened")}>{copy.reopen}</button>
        </div>
        {chosen && <div style={item}>
          <strong>{chosen.title}</strong>
          <p>{copy.condition}{colon}{caseCurrentCondition(document, chosen.id)}</p>
          <p>{copy.status}{colon}{copy.statuses[chosen.status]}</p>
          {caseHasContradiction(document, chosen.id) && <p>{copy.conflictWarning}</p>}
          <ul>{observationsForCase(document, chosen.id).map((o) => <li key={o.id}>{o.recordedAt}{colon}{copy.conditions[o.condition]} — {o.source.name} ({o.source.licence}{locale === "fr" ? "\u202F; " : "; "}{o.source.retrievedOn})</li>)}</ul>
          <ul>{eventsForCase(document, chosen.id).map((e) => <li key={e.id}>{e.at}{colon}{copy.actions[e.action]} — {e.note}</li>)}</ul>
        </div>}
      </fieldset>
      <section aria-labelledby={casesHeading} style={frame}>
        <h3 id={casesHeading}>{copy.filter}</h3>
        <div style={row}>
          <label style={field}><span style={label}>{copy.query}</span>
            <input style={control} value={filter.query ?? ""} onChange={(e) => setFilter((f) => ({ ...f, query: e.target.value }))} />
          </label>
          <label style={field}><span style={label}>{copy.status}</span>
            <select style={control} value={filter.status ?? ""} onChange={(e) => setFilter((f) => ({ ...f, status: e.target.value ? e.target.value as typeof f.status : undefined }))}>
              <option value="">{copy.all}</option>
              {RECONCILIATION_STATUSES.map((v) => <option key={v} value={v}>{copy.statuses[v]}</option>)}
            </select>
          </label>
          <label style={row}><input type="checkbox" style={{ minHeight: 44, minWidth: 44 }} checked={filter.conflictingOnly ?? false} onChange={(e) => setFilter((f) => ({ ...f, conflictingOnly: e.target.checked }))} />{copy.onlyConflicts}</label>
        </div>
        {visible.length === 0 && <p>{copy.empty}</p>}
        <ul>{visible.map((c) => <li key={c.id} style={item}>
          <strong>{c.title} ({c.id})</strong>
          <span>{copy.pack}{colon}{c.packId}</span>
          <span>{copy.status}{colon}{copy.statuses[c.status]}</span>
          <span>{copy.condition}{colon}{caseCurrentCondition(document, c.id)}</span>
          <span>{copy.source}{colon}{c.source.name} — {c.source.reference}</span>
          <span>{copy.licence}{colon}{c.source.licence}</span>
          <span>{copy.retrievedOn}{colon}{c.source.retrievedOn}</span>
          <span>{copy.tier}{colon}{copy.tiers[c.source.tier]}</span>
          <button type="button" style={control} onClick={() => setSelectedCase(c.id)}>{copy.choose}</button>
        </li>)}</ul>
        <p>{copy.sortLabel}</p>
      </section>
      <section aria-labelledby={`${heading} ${findingsHeading}`} style={frame}>
        <h3 id={findingsHeading}>{copy.issueHeading}</h3>
        <ul>{findings.map((f) => <li key={`${f.caseId}:${f.code}`}>{f.packId}{colon}{f.detail} ({f.priority})</li>)}</ul>
        <ul>{groups.map((g) => <li key={g.packId}>{g.packId}{colon}{g.cases} / {g.unknown} UNKNOWN</li>)}</ul>
      </section>
      <section aria-labelledby={transferHeading} style={frame}>
        <h3 id={transferHeading}>{copy.importFile}</h3>
        <input ref={inputRef} style={{ ...control, width: "100%" }} type="file" accept=".json,application/json" aria-label={copy.importFile} onChange={(event) => { void chooseFile(event); }} />
        {staged && preview && <div style={item}>
          <p>{copy.pendingImport}</p>
          <p>{copy.caseCount}{colon}{preview.newCases} ({preview.conflictingCases} {copy.conflict})</p>
          <p>{copy.observationCount}{colon}{preview.newObservations} ({preview.conflictingObservations} {copy.conflict})</p>
          <p>{copy.eventCount}{colon}{preview.newEvents} ({preview.conflictingEvents} {copy.conflict})</p>
          <div style={row}>
            <button type="button" style={control} disabled={!preview.canMerge} onClick={acceptImport}>{copy.acceptImport}</button>
            <button type="button" style={control} onClick={() => { setStaged(null); setMessage(""); }}>{copy.cancelImport}</button>
          </div>
        </div>}
        <div style={row}>
          <button type="button" style={control} disabled={!saveFile || busy} onClick={() => { void save(false); }}>{copy.exportFile}</button>
          <button type="button" style={control} disabled={!saveFile || busy} onClick={() => { void save(true); }}>{copy.exportReport}</button>
        </div>
      </section>
    </section>
  );
}
