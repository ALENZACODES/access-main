import { useId, useMemo, useRef, useState } from "react";
import type { ChangeEvent, CSSProperties, ReactElement } from "react";
import type { LocalPackRecord } from "./packInventory";
import type { SaveTextFile } from "./recoveryExport";
import {
  REFRESH_CONDITIONS, REFRESH_DECISIONS, REFRESH_LIMITS, REFRESH_TIERS, REFRESH_TOPICS,
  appendRefreshObservation, appendRefreshReview, appendRefreshSubject,
  emptyRefreshDocument, exportRefreshDocument, filterRefreshSubjects,
  latestRefreshReview, mergeRefreshDocuments, nextRefreshId, parseRefreshDocument,
  refreshCalendarDay,
  previewRefreshMerge, summarizeRefresh,
  type RefreshCondition, type RefreshDecision, type RefreshDocument,
  type RefreshTier, type RefreshTopic,
} from "./recoverySourceRefresh";
import {
  refreshNarrative, refreshReviewQueue, refreshPackOverviews, refreshAgeBuckets,
  type RefreshWindowOptions,
} from "./recoverySourceRefreshAnalysis";
import { recoverySourceRefreshCopy } from "./recoverySourceRefreshCopy";

export interface RecoverySourceRefreshPanelProps {
  readonly locale: "en" | "fr";
  readonly records: readonly LocalPackRecord[];
  readonly inspected: boolean;
  readonly saveFile?: SaveTextFile;
  readonly onInspect?: () => void;
}
const frame: CSSProperties = {
  border: "1px solid currentColor", borderRadius: 8, padding: 16, marginBlock: 16,
  display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 14,
  overflowWrap: "anywhere", width: "100%", maxWidth: "100%", minWidth: 0, boxSizing: "border-box",
};
const control: CSSProperties = {
  minHeight: 44, minWidth: 44, maxWidth: "100%", boxSizing: "border-box",
  font: "inherit", padding: "10px 12px",
};
const row: CSSProperties = { display: "flex", flexWrap: "wrap", gap: 12, alignItems: "flex-start", minWidth: 0 };
const field: CSSProperties = { display: "grid", gap: 4, flex: "1 1 175px", minWidth: 0, maxWidth: "100%", gridTemplateColumns: "minmax(0, 1fr)" };
const cell: CSSProperties = { border: "1px solid currentColor", borderRadius: 6, padding: 12, marginBlock: 10, minWidth: 0, overflowWrap: "anywhere" };
const MAX_RENDER = 80;
const asDay = (): string => new Date().toISOString().slice(0, 10);

export function RecoverySourceRefreshPanel({
  locale, records, inspected, saveFile, onInspect,
}: RecoverySourceRefreshPanelProps): ReactElement {
  const copy = recoverySourceRefreshCopy(locale);
  const heading = useId();
  const creationHeading = useId();
  const observationHeading = useId();
  const reviewHeading = useId();
  const listHeading = useId();
  const fileHeading = useId();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [document, setDocument] = useState<RefreshDocument>(emptyRefreshDocument);
  const [staged, setStaged] = useState<RefreshDocument | null>(null);
  const [packId, setPackId] = useState("");
  const [topic, setTopic] = useState<RefreshTopic>("pack");
  const [title, setTitle] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [condition, setCondition] = useState<RefreshCondition>("UNKNOWN");
  const [tier, setTier] = useState<RefreshTier>("UNKNOWN");
  const [sourceName, setSourceName] = useState("");
  const [licence, setLicence] = useState("");
  const [sourceDate, setSourceDate] = useState("");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [decision, setDecision] = useState<RefreshDecision>("review-needed");
  const [reviewNote, setReviewNote] = useState("");
  const [filterText, setFilterText] = useState("");
  const [asOf, setAsOf] = useState(asDay);
  const [windowDays, setWindowDays] = useState<RefreshWindowOptions["windowDays"]>(180);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const packs = useMemo(() => [...new Set(records.map((r) => r.id))].sort(), [records]);
  const subjects = useMemo(() => filterRefreshSubjects(document, { contains: filterText }).slice(0, MAX_RENDER), [document, filterText]);
  const options = useMemo(() => ({ asOf, windowDays }), [asOf, windowDays]);
  const queue = useMemo(() => refreshReviewQueue(document, options), [document, options]);
  const packOverview = useMemo(() => refreshPackOverviews(document, options), [document, options]);
  const ageBuckets = useMemo(() => refreshAgeBuckets(document, options), [document, options]);
  const summary = useMemo(() => summarizeRefresh(document), [document]);
  const referenceDayValid = refreshCalendarDay(asOf);
  const preview = useMemo(() => staged ? previewRefreshMerge(document, staged) : null, [document, staged]);
  const selected = document.subjects.find((subject) => subject.id === subjectId);
  const lastReview = selected ? latestRefreshReview(document, selected.id) : null;
  const colon = locale === "fr" ? "\u00a0: " : ": ";

  const label = (text: string, input: ReactElement): ReactElement => (
    <label style={field}><span>{text}</span>{input}</label>
  );
  function addSubject(): void {
    if (!inspected || !packs.includes(packId)) { setMessage(copy.waiting); return; }
    const result = appendRefreshSubject(document, {
      id: nextRefreshId(document, "subject"), packId, topic, title,
      startedAt: new Date().toISOString(),
    });
    if (!result.ok) { setMessage(copy.issues[result.issue]); return; }
    setDocument(result.value);
    setTitle("");
    setMessage("");
  }
  function addObservation(): void {
    if (!selected) { setMessage(copy.issues.reference); return; }
    const result = appendRefreshObservation(document, {
      id: nextRefreshId(document, "observation"), subjectId: selected.id,
      observedAt: new Date().toISOString(), condition,
      source: { name: sourceName, licence, retrievedOn: sourceDate, tier, reference }, note,
    });
    if (!result.ok) { setMessage(copy.issues[result.issue]); return; }
    setDocument(result.value);
    setNote("");
    setCondition("UNKNOWN");
    setMessage("");
  }
  function addReview(): void {
    if (!selected) { setMessage(copy.issues.reference); return; }
    const result = appendRefreshReview(document, {
      id: nextRefreshId(document, "review"), subjectId: selected.id,
      at: new Date().toISOString(), decision, note: reviewNote,
    });
    if (!result.ok) { setMessage(copy.issues[result.issue]); return; }
    setDocument(result.value);
    setReviewNote("");
    setMessage("");
  }
  async function openLocalFile(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.item(0);
    event.target.value = "";
    setStaged(null);
    if (!file) { setMessage(copy.noFile); return; }
    if (file.size > REFRESH_LIMITS.bytes) { setMessage(copy.issues.limit); return; }
    setMessage(copy.pending);
    try {
      const parsed = parseRefreshDocument(await file.text());
      if (!parsed.ok) { setMessage(copy.issues[parsed.issue]); return; }
      setStaged(parsed.value);
      setMessage(copy.staged);
    } catch { setMessage(copy.failed); }
  }
  function applyImport(): void {
    if (!staged || !preview?.canMerge) { setMessage(copy.conflict); return; }
    const merged = mergeRefreshDocuments(document, staged);
    if (!merged.ok) { setMessage(copy.issues[merged.issue]); return; }
    setDocument(merged.value);
    setStaged(null);
    setMessage("");
    fileRef.current?.focus();
  }
  async function saveJson(): Promise<void> {
    if (!saveFile || saving) return;
    const serialized = exportRefreshDocument(document);
    if (!serialized.ok) { setMessage(copy.issues[serialized.issue]); return; }
    setSaving(true);
    try {
      await saveFile("recovery-source-refresh.json", serialized.value);
      setMessage(copy.saved);
    } catch { setMessage(copy.failed); }
    finally { setSaving(false); }
  }
  async function saveSummary(): Promise<void> {
    if (!saveFile || saving) return;
    if (!refreshCalendarDay(asOf)) { setMessage(copy.issues.date); return; }
    setSaving(true);
    try {
      await saveFile("recovery-source-refresh.txt", refreshNarrative(document, options, locale));
      setMessage(copy.saved);
    } catch { setMessage(copy.failed); }
    finally { setSaving(false); }
  }
  return (
    <section lang={locale} aria-labelledby={heading} style={frame}>
      <h2 id={heading}>{copy.title}</h2>
      <p>{copy.description}</p>
      <p>{copy.caution}</p>
      {!inspected && <div>
        <p>{copy.waiting}</p>
        {onInspect && <button type="button" style={control} onClick={onInspect}>{copy.inspect}</button>}
      </div>}
      <p role="status" aria-live="polite" aria-atomic="true">{message}</p>
      <fieldset style={frame} disabled={!inspected}>
        <legend id={creationHeading}>{copy.add}</legend>
        <div style={row}>
          {label(copy.pack, <select style={control} value={packId} onChange={(e) => setPackId(e.target.value)}>
            <option value="">{copy.unknown}</option>
            {packs.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>)}
          {label(copy.topic, <select style={control} value={topic} onChange={(e) => setTopic(e.target.value as RefreshTopic)}>
            {REFRESH_TOPICS.map((t) => <option key={t} value={t}>{copy.topics[t]}</option>)}
          </select>)}
          {label(copy.name, <input style={control} maxLength={REFRESH_LIMITS.text} value={title} onChange={(e) => setTitle(e.target.value)} />)}
        </div>
        <button type="button" style={control} onClick={addSubject} disabled={!inspected}>{copy.add}</button>
      </fieldset>
      <fieldset style={frame}>
        <legend id={observationHeading}>{copy.observation}</legend>
        <div style={row}>
          {label(copy.choose, <select style={control} value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
            <option value="">{copy.unknown}</option>
            {document.subjects.map((s) => <option key={s.id} value={s.id}>{s.packId} — {s.title}</option>)}
          </select>)}
          {label(copy.condition, <select style={control} value={condition} onChange={(e) => setCondition(e.target.value as RefreshCondition)}>
            {REFRESH_CONDITIONS.map((c) => <option key={c} value={c}>{copy.conditions[c]}</option>)}
          </select>)}
          {label(copy.tier, <select style={control} value={tier} onChange={(e) => setTier(e.target.value as RefreshTier)}>
            {REFRESH_TIERS.map((t) => <option key={t} value={t}>{copy.tiers[t]}</option>)}
          </select>)}
          {label(copy.source, <input style={control} maxLength={REFRESH_LIMITS.text} value={sourceName} onChange={(e) => setSourceName(e.target.value)} />)}
          {label(copy.licence, <input style={control} maxLength={REFRESH_LIMITS.text} value={licence} onChange={(e) => setLicence(e.target.value)} />)}
          {label(copy.retrievedOn, <input style={control} type="date" value={sourceDate} onChange={(e) => setSourceDate(e.target.value)} />)}
          {label(copy.reference, <input style={control} maxLength={REFRESH_LIMITS.reference} value={reference} onChange={(e) => setReference(e.target.value)} />)}
          {label(copy.note, <textarea style={control} rows={3} maxLength={REFRESH_LIMITS.text} value={note} onChange={(e) => setNote(e.target.value)} />)}
        </div>
        <button type="button" style={control} onClick={addObservation} disabled={!selected}>{copy.record}</button>
      </fieldset>
      <fieldset style={frame}>
        <legend>{copy.review}</legend>
        <div style={row}>
          {label(copy.decision, <select style={control} value={decision} onChange={(e) => setDecision(e.target.value as RefreshDecision)}>
            {REFRESH_DECISIONS.map((d) => <option key={d} value={d}>{copy.decisions[d]}</option>)}
          </select>)}
          {label(copy.note, <textarea style={control} rows={2} maxLength={REFRESH_LIMITS.text} value={reviewNote} onChange={(e) => setReviewNote(e.target.value)} />)}
        </div>
        <p>{copy.manual}{colon}{lastReview ? copy.decisions[lastReview.decision] : copy.notReviewed}</p>
        <button type="button" style={control} disabled={!selected} onClick={addReview}>{copy.review}</button>
      </fieldset>
      <section aria-labelledby={`${heading} ${reviewHeading}`}>
        <h3 id={reviewHeading}>{copy.queue}</h3>
        <div style={row}>
          {label(copy.asOf, <input type="date" style={control} value={asOf} onChange={(e) => setAsOf(e.target.value)} />)}
          {label(copy.window, <select style={control} value={windowDays} onChange={(e) => setWindowDays(Number(e.target.value) as RefreshWindowOptions["windowDays"])}>
            {[30, 90, 180, 365].map((days) => <option key={days} value={days}>{days} {copy.days}</option>)}
          </select>)}
        </div>
        {!referenceDayValid && <p role="status">{copy.issues.date}</p>}
        <p>{copy.items}{colon}{summary.subjects}; {copy.unknown}{colon}{summary.unknown}</p>
        <p>{copy.manual}{colon}{summary.unresolved}</p>
        <ul>{ageBuckets.map((b) => <li key={b.key}>{b.key}{colon}{b.count}</li>)}</ul>
        <ul>{packOverview.map((p) => <li key={p.packId}>{p.packId}{colon}{p.total} / {p.outstanding} {copy.notReviewed}</li>)}</ul>
        <ul>{queue.slice(0, MAX_RENDER).map((q) => (
          <li key={q.subjectId} style={cell}>
            <strong>{q.packId} — {q.title}</strong>
            <p>{copy.state}{colon}{copy.conditions[q.condition]}; {copy.age}{colon}{q.ageDays ?? copy.unknown} {q.ageDays === null ? "" : copy.days}</p>
            <p>{q.manuallyReviewed ? copy.reviewed : copy.notReviewed}; {copy.findings}{colon}{q.findings.map((f) => copy.findingsCopy[f]).join(", ") || copy.unknown}</p>
          </li>
        ))}</ul>
      </section>
      <section aria-labelledby={`${heading} ${listHeading}`}>
        <h3 id={listHeading}>{copy.items}</h3>
        {label(copy.search, <input style={control} value={filterText} onChange={(e) => setFilterText(e.target.value)} />)}
        <button type="button" style={control} onClick={() => setFilterText("")}>{copy.clear}</button>
        {subjects.length === 0 && <p>{copy.empty}</p>}
        <ul>{subjects.map((s) => <li key={s.id} style={cell}>
          <strong>{s.packId} — {s.title}</strong>
          <p>{copy.topics[s.topic]} — {s.id}</p>
        </li>)}</ul>
      </section>
      <section aria-labelledby={`${heading} ${fileHeading}`}>
        <h3 id={fileHeading}>{copy.open}</h3>
        <input ref={fileRef} type="file" accept=".json,application/json" style={{ ...control, width: "100%" }}
          aria-label={copy.open} onChange={(e) => { void openLocalFile(e); }} />
        {preview && <div>
          <p>{copy.staged}{colon}{preview.addedSubjects} / {preview.addedObservations} / {preview.addedReviews}</p>
          <p>{copy.conflict}{colon}{preview.conflicts}</p>
          <button type="button" style={control} disabled={!preview.canMerge} onClick={applyImport}>{copy.merge}</button>
        </div>}
        {saveFile && <div style={row}>
          <button type="button" style={control} disabled={saving} onClick={() => { void saveJson(); }}>{copy.export}</button>
          <button type="button" style={control} disabled={saving} onClick={() => { void saveSummary(); }}>{copy.exportText}</button>
        </div>}
      </section>
    </section>
  );
}
