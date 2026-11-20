import { useId, useMemo, useRef, useState } from "react";
import type { ChangeEvent, CSSProperties, ReactElement } from "react";
import type { LocalPackRecord } from "./packInventory";
import type { SaveTextFile } from "./recoveryExport";
import {
  BRIEF_CONDITIONS, BRIEF_LIMITS, BRIEF_OPERATIONS, BRIEF_QUESTION_STATES,
  BRIEF_TIERS, BRIEF_TOPICS, addBriefObservation, addBriefQuestion, beginBrief,
  briefSummary, changeBriefState, emptyBriefDocument, exportBriefs, filterBriefs,
  importBriefs, mergeBriefs, nextBriefId, previewBriefMerge, type BriefCondition,
  type BriefDocument, type BriefOperation, type BriefQuestionState, type BriefQuestionTopic,
  type BriefTier,
} from "./recoverySupportBrief";
import { briefNarrative, briefObservationsFor, briefQuestionsFor, briefReviewQueue } from "./recoverySupportAnalysis";
import { recoverySupportCopy } from "./recoverySupportCopy";
import { buildBriefPortfolio } from "./recoverySupportReview";
import { auditBriefPrivacy } from "./recoverySupportPrivacy";
export interface RecoverySupportBriefPanelProps {
  readonly locale: "en" | "fr";
  readonly records: readonly LocalPackRecord[];
  readonly inspected: boolean;
  readonly saveFile?: SaveTextFile;
  readonly onInspect?: () => void;
}
const frame: CSSProperties = {
  display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 14,
  marginBlock: 16, padding: 16, border: "1px solid currentColor", borderRadius: 8,
  minWidth: 0, maxWidth: "100%", boxSizing: "border-box", overflowWrap: "anywhere",
};
const touch: CSSProperties = { minHeight: 44, minWidth: 44, maxWidth: "100%", boxSizing: "border-box", font: "inherit", padding: "10px 12px" };
const row: CSSProperties = { display: "flex", flexWrap: "wrap", gap: 12, alignItems: "flex-start", minWidth: 0 };
const field: CSSProperties = { display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 4, flex: "1 1 160px", minWidth: 0, maxWidth: "100%" };
const card: CSSProperties = { ...frame, padding: 12, marginBlock: 6 };
const MAX_VISIBLE = 70;

/** All actions are manual. No network, background work, browser storage or installed-pack changes. */
export function RecoverySupportBriefPanel({ locale, records, inspected, saveFile, onInspect }: RecoverySupportBriefPanelProps): ReactElement {
  const copy = recoverySupportCopy(locale);
  const heading = useId();
  const listHeading = useId();
  const reviewHeading = useId();
  const exportHeading = useId();
  const fileInput = useRef<HTMLInputElement | null>(null);
  const [document, setDocument] = useState<BriefDocument>(emptyBriefDocument);
  const [staged, setStaged] = useState<BriefDocument | null>(null);
  const [selected, setSelected] = useState("");
  const [packId, setPackId] = useState("");
  const [title, setTitle] = useState("");
  const [operation, setOperation] = useState<BriefOperation>("pack");
  const [condition, setCondition] = useState<BriefCondition>("UNKNOWN");
  const [sourceName, setSourceName] = useState("");
  const [licence, setLicence] = useState("");
  const [retrievedOn, setRetrievedOn] = useState("");
  const [reference, setReference] = useState("");
  const [tier, setTier] = useState<BriefTier>("UNKNOWN");
  const [observationText, setObservationText] = useState("");
  const [questionText, setQuestionText] = useState("");
  const [responseText, setResponseText] = useState("");
  const [topic, setTopic] = useState<BriefQuestionTopic>("what-happened");
  const [questionState, setQuestionState] = useState<BriefQuestionState>("UNKNOWN");
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const options = useMemo(() => [...new Set(records.map((item) => item.id))].sort(), [records]);
  const visible = useMemo(() => filterBriefs(document, { search }).slice(0, MAX_VISIBLE), [document, search]);
  const overview = useMemo(() => briefSummary(document), [document]);
  const today = new Date().toISOString().slice(0, 10);
  const queue = useMemo(() => briefReviewQueue(document, today), [document, today]);
  const coverage = useMemo(() => buildBriefPortfolio(document, today), [document, today]);
  const preview = useMemo(() => staged ? previewBriefMerge(document, staged) : null, [document, staged]);
  const chosen = document.briefs.find((item) => item.id === selected);
  const source = { name: sourceName, licence, retrievedOn, reference, tier };
  const sep = locale === "fr" ? "\u00a0: " : ": ";
  const label = (name: string, child: ReactElement): ReactElement => <label style={field}><span>{name}</span>{child}</label>;

  function startBrief(): void {
    if (!inspected || !options.includes(packId)) { setMessage(copy.noInspection); return; }
    const newId = nextBriefId(document, "brief");
    const result = beginBrief(document, { id: newId, packId, title, operation,
      condition, state: "draft", openedAt: new Date().toISOString(), source });
    if (!result.ok) { setMessage(copy.issues[result.issue]); return; }
    setDocument(result.value);
    setSelected(newId);
    setTitle("");
    setMessage("");
  }
  function addObservation(): void {
    if (!chosen) { setMessage(copy.issues.reference); return; }
    const result = addBriefObservation(document, {
      id: nextBriefId(document, "observation"), briefId: chosen.id,
      capturedAt: new Date().toISOString(), condition, summary: observationText, source,
    });
    if (!result.ok) { setMessage(copy.issues[result.issue]); return; }
    setDocument(result.value);
    setObservationText("");
    setCondition("UNKNOWN");
    setMessage("");
  }
  function addQuestion(): void {
    if (!chosen) { setMessage(copy.issues.reference); return; }
    const result = addBriefQuestion(document, {
      id: nextBriefId(document, "question"), briefId: chosen.id, topic, state: questionState,
      question: questionText, response: responseText, source, capturedAt: new Date().toISOString(),
    });
    if (!result.ok) { setMessage(copy.issues[result.issue]); return; }
    setDocument(result.value);
    setQuestionText("");
    setResponseText("");
    setQuestionState("UNKNOWN");
    setMessage("");
  }
  function review(action: "review-requested" | "archived" | "reopened"): void {
    if (!chosen) { setMessage(copy.issues.reference); return; }
    const result = changeBriefState(document, chosen.id, action, new Date().toISOString());
    if (!result.ok) { setMessage(copy.issues[result.issue]); return; }
    setDocument(result.value);
    setMessage("");
  }
  async function chooseFile(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.item(0);
    event.target.value = "";
    setStaged(null);
    if (!file) { setMessage(copy.noFile); return; }
    if (file.size > BRIEF_LIMITS.bytes) { setMessage(copy.issues.limit); return; }
    setMessage(copy.pending);
    try {
      const imported = importBriefs(await file.text());
      if (!imported.ok) { setMessage(copy.issues[imported.issue]); return; }
      setStaged(imported.value);
      setMessage(copy.staged);
    } catch { setMessage(copy.failed); }
  }
  function acceptFile(): void {
    if (!staged || !preview?.canMerge) { setMessage(copy.issues.conflict); return; }
    const merged = mergeBriefs(document, staged);
    if (!merged.ok) { setMessage(copy.issues[merged.issue]); return; }
    setDocument(merged.value);
    setStaged(null);
    setMessage("");
    fileInput.current?.focus();
  }
  async function saveText(asNarrative: boolean): Promise<void> {
    if (!saveFile || saving) return;
    if (!auditBriefPrivacy(document).safeToShare) { setMessage(copy.issues.privacy); return; }
    const result = exportBriefs(document);
    if (!result.ok) { setMessage(copy.issues[result.issue]); return; }
    setSaving(true);
    try {
      await saveFile(asNarrative ? "recovery-support-brief.txt" : "recovery-support-brief.json",
        asNarrative ? briefNarrative(document, today, locale) : result.value);
      setMessage(copy.saved);
    } catch { setMessage(copy.failed); }
    finally { setSaving(false); }
  }

  return <section lang={locale} aria-labelledby={heading} style={frame}>
    <h2 id={heading}>{copy.title}</h2>
    <p>{copy.intro}</p><p>{copy.caution}</p>
    {!inspected && <div><p>{copy.noInspection}</p>{onInspect && <button type="button" style={touch} onClick={onInspect}>{copy.inspect}</button>}</div>}
    <p role="status" aria-live="polite" aria-atomic="true">{message}</p>
    <fieldset style={frame} disabled={!inspected}>
      <legend>{copy.addCase}</legend>
      <div style={row}>
        {label(copy.pack, <select style={touch} value={packId} onChange={(event: ChangeEvent<HTMLSelectElement>) => setPackId(event.target.value)}>
          <option value="">{copy.unknown}</option>{options.map((id) => <option key={id} value={id}>{id}</option>)}
        </select>)}
        {label(copy.caseTitle, <input style={touch} value={title} maxLength={BRIEF_LIMITS.text} onChange={(event: ChangeEvent<HTMLInputElement>) => setTitle(event.target.value)} />)}
        {label(copy.operation, <select style={touch} value={operation} onChange={(event: ChangeEvent<HTMLSelectElement>) => setOperation(event.target.value as BriefOperation)}>
          {BRIEF_OPERATIONS.map((op) => <option key={op} value={op}>{copy.operations[op]}</option>)}
        </select>)}
        {label(copy.condition, <select style={touch} value={condition} onChange={(event: ChangeEvent<HTMLSelectElement>) => setCondition(event.target.value as BriefCondition)}>
          {BRIEF_CONDITIONS.map((item) => <option key={item} value={item}>{copy.conditions[item]}</option>)}
        </select>)}
        {label(copy.source, <input style={touch} value={sourceName} maxLength={BRIEF_LIMITS.text} onChange={(event: ChangeEvent<HTMLInputElement>) => setSourceName(event.target.value)} />)}
        {label(copy.licence, <input style={touch} value={licence} maxLength={BRIEF_LIMITS.text} onChange={(event: ChangeEvent<HTMLInputElement>) => setLicence(event.target.value)} />)}
        {label(copy.retrieved, <input style={touch} type="date" value={retrievedOn} onChange={(event: ChangeEvent<HTMLInputElement>) => setRetrievedOn(event.target.value)} />)}
        {label(copy.reference, <input style={touch} value={reference} maxLength={BRIEF_LIMITS.text} onChange={(event: ChangeEvent<HTMLInputElement>) => setReference(event.target.value)} />)}
        {label(copy.tier, <select style={touch} value={tier} onChange={(event: ChangeEvent<HTMLSelectElement>) => setTier(event.target.value as BriefTier)}>
          {BRIEF_TIERS.map((item) => <option key={item} value={item}>{copy.tiers[item]}</option>)}
        </select>)}
      </div>
      <button type="button" style={touch} onClick={startBrief} disabled={!inspected}>{copy.addCase}</button>
    </fieldset>
    <fieldset style={frame}>
      <legend>{copy.observation}</legend>
      {label(copy.pack, <select style={touch} value={selected} onChange={(event: ChangeEvent<HTMLSelectElement>) => setSelected(event.target.value)}>
        <option value="">{copy.unknown}</option>{document.briefs.map((item) => <option key={item.id} value={item.id}>{item.packId} — {item.title}</option>)}
      </select>)}
      <div style={row}>
        {label(copy.observationSummary, <textarea rows={3} style={touch} maxLength={BRIEF_LIMITS.text} value={observationText} onChange={(event: ChangeEvent<HTMLTextAreaElement>) => setObservationText(event.target.value)} />)}
        {label(copy.condition, <select style={touch} value={condition} onChange={(event: ChangeEvent<HTMLSelectElement>) => setCondition(event.target.value as BriefCondition)}>
          {BRIEF_CONDITIONS.map((item) => <option key={item} value={item}>{copy.conditions[item]}</option>)}
        </select>)}
      </div>
      <button type="button" style={touch} disabled={!chosen || chosen.state === "archived"} onClick={addObservation}>{copy.addObservation}</button>
    </fieldset>
    <fieldset style={frame}>
      <legend>{copy.question}</legend>
      <div style={row}>
        {label(copy.topic, <select style={touch} value={topic} onChange={(event: ChangeEvent<HTMLSelectElement>) => setTopic(event.target.value as BriefQuestionTopic)}>
          {BRIEF_TOPICS.map((item) => <option key={item} value={item}>{copy.topics[item]}</option>)}
        </select>)}
        {label(copy.question, <textarea rows={3} style={touch} value={questionText} maxLength={BRIEF_LIMITS.text} onChange={(event: ChangeEvent<HTMLTextAreaElement>) => setQuestionText(event.target.value)} />)}
        {label(copy.response, <textarea rows={3} style={touch} value={responseText} maxLength={BRIEF_LIMITS.text} onChange={(event: ChangeEvent<HTMLTextAreaElement>) => setResponseText(event.target.value)} />)}
        {label(copy.state, <select style={touch} value={questionState} onChange={(event: ChangeEvent<HTMLSelectElement>) => setQuestionState(event.target.value as BriefQuestionState)}>
          {BRIEF_QUESTION_STATES.map((item) => <option key={item} value={item}>{copy.questionStates[item]}</option>)}
        </select>)}
      </div>
      <button type="button" style={touch} disabled={!chosen || chosen.state === "archived"} onClick={addQuestion}>{copy.addQuestion}</button>
    </fieldset>
    <div style={row}>
      <button type="button" style={touch} disabled={!chosen || chosen.state !== "draft"} onClick={() => review("review-requested")}>{copy.requestReview}</button>
      <button type="button" style={touch} disabled={!chosen || chosen.state !== "review"} onClick={() => review("archived")}>{copy.archive}</button>
      <button type="button" style={touch} disabled={!chosen || chosen.state !== "archived"} onClick={() => review("reopened")}>{copy.reopen}</button>
    </div>
    <section aria-labelledby={`${heading} ${reviewHeading}`}>
      <h3 id={reviewHeading}>{copy.review}</h3>
      <p>{copy.cases}{sep}{overview.briefs}</p><p>{copy.unresolved}{sep}{overview.unanswered}</p>
      <p>{copy.findings}{sep}{coverage.withConflicts + coverage.withUnansweredQuestions}</p>
      <ul>{queue.map((item) => <li key={item.briefId}>{item.packId} — {item.title} — {item.reasons.join(", ")}</li>)}</ul>
    </section>
    <section aria-labelledby={`${heading} ${listHeading}`}>
      <h3 id={listHeading}>{copy.list}</h3>
      {label(copy.search, <input style={touch} value={search} onChange={(event: ChangeEvent<HTMLInputElement>) => setSearch(event.target.value)} />)}
      <button type="button" style={touch} onClick={() => setSearch("")}>{copy.clear}</button>
      {visible.length === 0 && <p>{copy.empty}</p>}
      <ul>{visible.map((entry) => <li key={entry.id} style={card}>
        <strong>{entry.title} — {entry.packId}</strong><span>{copy.states[entry.state]} — {copy.conditions[entry.condition]}</span>
        <span>{copy.source}{sep}{entry.source.name}</span><span>{copy.licence}{sep}{entry.source.licence}</span>
        <span>{copy.retrieved}{sep}{entry.source.retrievedOn}</span><span>{copy.tier}{sep}{copy.tiers[entry.source.tier]}</span>
        <ul>{briefObservationsFor(document, entry.id).map((item) => <li key={item.id}>{item.summary || copy.unknown} — {copy.conditions[item.condition]}</li>)}</ul>
        <ul>{briefQuestionsFor(document, entry.id).map((item) => <li key={item.id}>{item.question} — {copy.questionStates[item.state]}</li>)}</ul>
      </li>)}</ul>
    </section>
    <section aria-labelledby={`${heading} ${exportHeading}`}>
      <h3 id={exportHeading}>{copy.file}</h3>
      <input ref={fileInput} type="file" accept=".json,application/json" style={{ ...touch, width: "100%" }}
        aria-label={copy.open} onChange={(event: ChangeEvent<HTMLInputElement>) => { void chooseFile(event); }} />
      {preview && <div><p>{copy.staged}</p><p>{preview.incoming} / {preview.conflicts.length}</p>
        <button type="button" style={touch} disabled={!preview.canMerge} onClick={acceptFile}>{copy.merge}</button></div>}
      {saveFile && <div style={row}>
        <button type="button" style={touch} disabled={saving} onClick={() => { void saveText(false); }}>{copy.save}</button>
        <button type="button" style={touch} disabled={saving} onClick={() => { void saveText(true); }}>{copy.saveNarrative}</button>
      </div>}
    </section>
  </section>;
}
