import { useId, useMemo, useRef, useState } from "react";
import type { ChangeEvent, CSSProperties, ReactElement } from "react";
import type { LocalPackRecord } from "./packInventory";
import type { SaveTextFile } from "./recoveryExport";
import {
  GUIDED_CONDITIONS, GUIDED_EVIDENCE, GUIDED_LIMITS, GUIDED_OUTCOMES,
  GUIDED_TIERS, GUIDED_TOPICS, appendGuidedEvent, beginGuidedCase,
  emptyGuidedDocument, filterGuidedCases, guidedStepsFor, guidedSummary,
  mergeGuidedDocuments, nextGuidedId, parseGuidedDocument, previewGuidedMerge,
  recordGuidedStep, serializeGuidedDocument,
  type GuidedAction, type GuidedCondition, type GuidedDocument, type GuidedEvidence,
  type GuidedLocale, type GuidedOutcome, type GuidedTier, type GuidedTopic,
} from "./recoveryGuidedReview";
import { createGuidedReport, guidedNarrative, guidedTopicStatus } from "./recoveryGuidedAnalysis";
import { recoveryGuidedCopy } from "./recoveryGuidedCopy";

export interface RecoveryGuidedReviewPanelProps {
  readonly locale: GuidedLocale;
  readonly records: readonly LocalPackRecord[];
  readonly inspected: boolean;
  readonly saveFile?: SaveTextFile;
  readonly onInspect?: () => void;
}
const frame: CSSProperties = {
  display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 14,
  border: "1px solid currentColor", borderRadius: 8, padding: 16,
  marginBlock: 16, minWidth: 0, maxWidth: "100%", boxSizing: "border-box", overflowWrap: "anywhere",
};
const controls: CSSProperties = {
  minHeight: 44, minWidth: 44, maxWidth: "100%", boxSizing: "border-box",
  font: "inherit", padding: "10px 12px",
};
const row: CSSProperties = { display: "flex", flexWrap: "wrap", gap: 12, alignItems: "flex-start", minWidth: 0 };
const field: CSSProperties = { display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 4, flex: "1 1 160px", minWidth: 0, maxWidth: "100%" };
const item: CSSProperties = { ...frame, padding: 12, marginBlock: 8 };

/** Manual-only panel: no storage writes, network calls, background timers or pack mutation. */
export function RecoveryGuidedReviewPanel({ locale, records, inspected, saveFile, onInspect }: RecoveryGuidedReviewPanelProps): ReactElement {
  const copy = recoveryGuidedCopy(locale);
  const heading = useId();
  const listHeading = useId();
  const queueHeading = useId();
  const fileHeading = useId();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [document, setDocument] = useState<GuidedDocument>(emptyGuidedDocument);
  const [staged, setStaged] = useState<GuidedDocument | null>(null);
  const [packId, setPackId] = useState("");
  const [title, setTitle] = useState("");
  const [condition, setCondition] = useState<GuidedCondition>("UNKNOWN");
  const [sourceName, setSourceName] = useState("");
  const [licence, setLicence] = useState("");
  const [retrievedOn, setRetrievedOn] = useState("");
  const [reference, setReference] = useState("");
  const [tier, setTier] = useState<GuidedTier>("UNKNOWN");
  const [selected, setSelected] = useState("");
  const [topic, setTopic] = useState<GuidedTopic>("identify");
  const [evidence, setEvidence] = useState<GuidedEvidence>("UNKNOWN");
  const [outcome, setOutcome] = useState<GuidedOutcome>("UNKNOWN");
  const [note, setNote] = useState("");
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const packOptions = useMemo(() => [...new Set(records.map((record) => record.id))].sort(), [records]);
  const shown = useMemo(() => filterGuidedCases(document, { query }).slice(0, 60), [document, query]);
  const summary = useMemo(() => guidedSummary(document), [document]);
  const today = new Date().toISOString().slice(0, 10);
  const report = useMemo(() => createGuidedReport(document, today), [document, today]);
  const preview = useMemo(() => staged ? previewGuidedMerge(document, staged) : null, [document, staged]);
  const current = document.cases.find((entry) => entry.id === selected);
  const source = { name: sourceName, licence, retrievedOn, reference, tier };
  const label = (name: string, control: ReactElement): ReactElement => <label style={field}><span>{name}</span>{control}</label>;
  const sep = locale === "fr" ? "\u00a0: " : ": ";
  function createCase(): void {
    if (!inspected || !packOptions.includes(packId)) { setMessage(copy.noInspection); return; }
    const result = beginGuidedCase(document, {
      id: nextGuidedId(document, "case"), packId, condition, phase: "draft", title,
      openedAt: new Date().toISOString(), source,
    });
    if (!result.ok) { setMessage(copy.issues[result.issue]); return; }
    const id = result.value.cases.at(-1)?.id ?? "";
    setDocument(result.value);
    setSelected(id);
    setTitle("");
    setCondition("UNKNOWN");
    setMessage("");
  }
  function addStep(): void {
    if (!current) { setMessage(copy.issues.reference); return; }
    const result = recordGuidedStep(document, {
      id: nextGuidedId(document, "step"), caseId: current.id, topic, evidence, outcome, note,
      capturedAt: new Date().toISOString(), source,
    });
    if (!result.ok) { setMessage(copy.issues[result.issue]); return; }
    setDocument(result.value);
    setNote("");
    setEvidence("UNKNOWN");
    setOutcome("UNKNOWN");
    setMessage("");
  }
  function review(action: GuidedAction): void {
    if (!current) { setMessage(copy.issues.reference); return; }
    const result = appendGuidedEvent(document, {
      id: nextGuidedId(document, "event"), caseId: current.id,
      action, at: new Date().toISOString(), note: "", stepId: null,
    });
    if (!result.ok) { setMessage(copy.issues[result.issue]); return; }
    setDocument(result.value);
    setMessage("");
  }
  async function chooseFile(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.item(0);
    event.target.value = "";
    setStaged(null);
    if (!file) { setMessage(copy.noFile); return; }
    if (file.size > GUIDED_LIMITS.bytes) { setMessage(copy.issues.limit); return; }
    setMessage(copy.pending);
    try {
      const parsed = parseGuidedDocument(await file.text());
      if (!parsed.ok) { setMessage(copy.issues[parsed.issue]); return; }
      setStaged(parsed.value);
      setMessage(copy.staged);
    } catch { setMessage(copy.failed); }
  }
  function applyFile(): void {
    if (!staged || !preview?.canMerge) { setMessage(copy.issues.conflict); return; }
    const result = mergeGuidedDocuments(document, staged);
    if (!result.ok) { setMessage(copy.issues[result.issue]); return; }
    setDocument(result.value);
    setStaged(null);
    setMessage("");
    inputRef.current?.focus();
  }
  async function exportFile(summaryOnly: boolean): Promise<void> {
    if (!saveFile || saving) return;
    const data = summaryOnly ? { ok: true as const, value: guidedNarrative(document, today, locale) } : serializeGuidedDocument(document);
    if (!data.ok) { setMessage(copy.issues[data.issue]); return; }
    setSaving(true);
    try {
      await saveFile(summaryOnly ? "recovery-guided-summary.txt" : "recovery-guided-review.json", data.value);
      setMessage(copy.saved);
    } catch { setMessage(copy.failed); } finally { setSaving(false); }
  }
  return (
    <section lang={locale} aria-labelledby={heading} style={frame}>
      <h2 id={heading}>{copy.heading}</h2>
      <p>{copy.description}</p>
      <p>{copy.caution}</p>
      {!inspected && <div><p>{copy.noInspection}</p>
        {onInspect && <button type="button" style={controls} onClick={onInspect}>{copy.inspect}</button>}
      </div>}
      <p role="status" aria-live="polite" aria-atomic="true">{message}</p>
      <fieldset style={frame} disabled={!inspected}>
        <legend>{copy.addCase}</legend>
        <div style={row}>
          {label(copy.pack, <select style={controls} value={packId} onChange={(event: ChangeEvent<HTMLSelectElement>) => setPackId(event.target.value)}>
            <option value="">{copy.unknown}</option>
            {packOptions.map((pack) => <option value={pack} key={pack}>{pack}</option>)}
          </select>)}
          {label(copy.title, <input style={controls} maxLength={GUIDED_LIMITS.text} value={title} onChange={(event: ChangeEvent<HTMLInputElement>) => setTitle(event.target.value)} />)}
          {label(copy.condition, <select style={controls} value={condition} onChange={(event: ChangeEvent<HTMLSelectElement>) => setCondition(event.target.value as GuidedCondition)}>
            {GUIDED_CONDITIONS.map((key) => <option key={key} value={key}>{copy.operations[key]}</option>)}
          </select>)}
        </div>
        <div style={row}>
          {label(copy.source, <input style={controls} value={sourceName} maxLength={GUIDED_LIMITS.text} onChange={(event: ChangeEvent<HTMLInputElement>) => setSourceName(event.target.value)} />)}
          {label(copy.licence, <input style={controls} value={licence} maxLength={GUIDED_LIMITS.text} onChange={(event: ChangeEvent<HTMLInputElement>) => setLicence(event.target.value)} />)}
          {label(copy.retrieved, <input style={controls} type="date" value={retrievedOn} onChange={(event: ChangeEvent<HTMLInputElement>) => setRetrievedOn(event.target.value)} />)}
          {label(copy.reference, <input style={controls} value={reference} maxLength={GUIDED_LIMITS.text} onChange={(event: ChangeEvent<HTMLInputElement>) => setReference(event.target.value)} />)}
          {label(copy.tier, <select style={controls} value={tier} onChange={(event: ChangeEvent<HTMLSelectElement>) => setTier(event.target.value as GuidedTier)}>
            {GUIDED_TIERS.map((key) => <option key={key} value={key}>{copy.tiers[key]}</option>)}
          </select>)}
        </div>
        <button type="button" style={controls} disabled={!inspected} onClick={createCase}>{copy.addCase}</button>
      </fieldset>
      <fieldset style={frame}>
        <legend>{copy.addStep}</legend>
        {label(copy.chooseCase, <select style={controls} value={selected} onChange={(event: ChangeEvent<HTMLSelectElement>) => setSelected(event.target.value)}>
          <option value="">{copy.unknown}</option>
          {document.cases.map((entry) => <option value={entry.id} key={entry.id}>{entry.id} — {entry.packId}</option>)}
        </select>)}
        <div style={row}>
          {label(copy.topic, <select style={controls} value={topic} onChange={(event: ChangeEvent<HTMLSelectElement>) => setTopic(event.target.value as GuidedTopic)}>
            {GUIDED_TOPICS.map((key) => <option key={key} value={key}>{copy.topics[key]}</option>)}
          </select>)}
          {label(copy.evidence, <select style={controls} value={evidence} onChange={(event: ChangeEvent<HTMLSelectElement>) => setEvidence(event.target.value as GuidedEvidence)}>
            {GUIDED_EVIDENCE.map((key) => <option key={key} value={key}>{copy.evidenceNames[key]}</option>)}
          </select>)}
          {label(copy.outcome, <select style={controls} value={outcome} onChange={(event: ChangeEvent<HTMLSelectElement>) => setOutcome(event.target.value as GuidedOutcome)}>
            {GUIDED_OUTCOMES.map((key) => <option key={key} value={key}>{copy.outcomes[key]}</option>)}
          </select>)}
          {label(copy.note, <textarea style={controls} rows={3} value={note} maxLength={GUIDED_LIMITS.text} onChange={(event: ChangeEvent<HTMLTextAreaElement>) => setNote(event.target.value)} />)}
        </div>
        <button type="button" style={controls} disabled={!current || current.phase === "closed"} onClick={addStep}>{copy.addStep}</button>
        <div style={row}>
          <button type="button" style={controls} disabled={!current || current.phase !== "draft"} onClick={() => review("review-requested")}>{copy.review}</button>
          <button type="button" style={controls} disabled={!current || current.phase !== "review"} onClick={() => review("closed")}>{copy.close}</button>
          <button type="button" style={controls} disabled={!current || current.phase !== "closed"} onClick={() => review("reopened")}>{copy.reopen}</button>
        </div>
        {current && <ul>{guidedTopicStatus(document, current.id).map((entry) =>
          <li key={entry.topic}>{copy.topics[entry.topic]} — {entry.evidence === "not-recorded" ? copy.unknown : copy.evidenceNames[entry.evidence]} ({entry.count})</li>
        )}</ul>}
      </fieldset>
      <section aria-labelledby={queueHeading}>
        <h3 id={queueHeading}>{copy.reviewQueue}</h3>
        <p>{copy.cases}{sep}{summary.cases}. {copy.observations}{sep}{summary.steps}. {copy.unresolved}{sep}{summary.open}.</p>
        <ul>{report.reviews.slice(0, 70).map((entry) =>
          <li key={entry.caseId}>{entry.packId} — {entry.caseId} — {copy.priority}{sep}{entry.priority} — {entry.codes.join(", ")}</li>
        )}</ul>
      </section>
      <section aria-labelledby={listHeading}>
        <h3 id={listHeading}>{copy.cases}</h3>
        {label(copy.search, <input style={controls} value={query} onChange={(event: ChangeEvent<HTMLInputElement>) => setQuery(event.target.value)} />)}
        <button type="button" style={controls} onClick={() => setQuery("")}>{copy.clear}</button>
        {shown.length === 0 && <p>{copy.empty}</p>}
        <ul>{shown.map((entry) => <li key={entry.id} style={item}>
          <strong>{entry.id} — {entry.packId}</strong>
          <span>{entry.title} — {copy.phases[entry.phase]}</span>
          <span>{copy.operations[entry.condition]}</span>
          <span>{copy.source}{sep}{entry.source.name}</span>
          <span>{copy.licence}{sep}{entry.source.licence}</span>
          <span>{copy.retrieved}{sep}{entry.source.retrievedOn}</span>
          <span>{copy.tier}{sep}{copy.tiers[entry.source.tier]}</span>
          <span>{copy.observations}{sep}{guidedStepsFor(document, entry.id).length}</span>
        </li>)}</ul>
      </section>
      <section aria-labelledby={fileHeading}>
        <h3 id={fileHeading}>{copy.file}</h3>
        <input ref={inputRef} type="file" accept=".json,application/json" style={{ ...controls, width: "100%" }} aria-label={copy.open}
          onChange={(event: ChangeEvent<HTMLInputElement>) => { void chooseFile(event); }} />
        {preview && <div>
          <p>{copy.staged}</p><p>{preview.incomingCases} / {preview.incomingSteps} / {preview.incomingEvents}</p>
          {preview.conflicts.length > 0 && <ul>{preview.conflicts.map((conflict) => <li key={conflict}>{conflict}</li>)}</ul>}
          <button type="button" style={controls} disabled={!preview.canMerge} onClick={applyFile}>{copy.merge}</button>
        </div>}
        {saveFile && <div style={row}>
          <button type="button" style={controls} disabled={saving} onClick={() => { void exportFile(false); }}>{copy.save}</button>
          <button type="button" style={controls} disabled={saving} onClick={() => { void exportFile(true); }}>{copy.saveSummary}</button>
        </div>}
      </section>
    </section>
  );
}
