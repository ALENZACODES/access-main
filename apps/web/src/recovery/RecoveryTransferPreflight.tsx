import { useId, useMemo, useRef, useState } from "react";
import type { ChangeEvent, CSSProperties, ReactElement } from "react";
import type { RecoveryLocale } from "./index";
import type { LocalPackRecord } from "./packInventory";
import type { SaveTextFile } from "./recoveryExport";
import { recoveryTransferCopy } from "./recoveryTransferCopy";
import {
  EVIDENCE_TIERS, PREFLIGHT_LIMITS, TRANSFER_CONDITIONS, TRANSFER_KINDS,
  TRANSFER_LICENCES, TRANSFER_STAGES, appendTransferCandidate,
  assessTransferCandidate, decodeTransferDocument,
  filterTransferCandidates, mergeTransferDocuments, newTransferDocument,
  summarizeTransferDocument, transferPackSummaries, transferPreviewMerge,
  transitionTransferCandidate,
  type EvidenceTier, type TransferCandidate, type TransferCondition,
  type TransferDocument, type TransferKind, type TransferStage,
} from "./recoveryTransferPreflight";
import {
  appendHistoryEvent, emptyHistory, historyForCandidate, parseTransferBundle,
  prepareTransferBundle, serializeTransferBundle,
  mergeTransferBundles, previewTransferBundleMerge,
  type TransferHistory, type TransferHistoryAction,
} from "./recoveryTransferHistory";

export interface RecoveryTransferPreflightProps {
  readonly locale: RecoveryLocale;
  readonly records: readonly LocalPackRecord[];
  readonly inspected: boolean;
  readonly saveFile?: SaveTextFile;
}

const panelStyle: CSSProperties = {
  border: "1px solid currentColor", borderRadius: 8, padding: 16,
  display: "grid", gap: 14, marginBlock: 16, overflowWrap: "anywhere",
};
const buttonStyle: CSSProperties = { minWidth: 44, minHeight: 44, padding: "10px 14px", font: "inherit" };
const fieldStyle: CSSProperties = { display: "grid", gap: 5, minWidth: 170, flex: "1 1 170px" };
const rowStyle: CSSProperties = { display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12 };
const cardStyle: CSSProperties = { border: "1px solid currentColor", borderRadius: 6, padding: 12, marginBlock: 8 };
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

function parseQuantity(value: string): number | null | undefined {
  if (value.trim() === "") return null;
  if (!/^\d+$/.test(value.trim())) return undefined;
  const quantity = Number(value);
  return Number.isSafeInteger(quantity) && quantity <= 1_073_741_824 ? quantity : undefined;
}

function nextId(document: TransferDocument): string {
  const names = new Set(document.candidates.map((candidate) => candidate.id));
  for (let id = 1; id < 10000; id += 1) {
    const value = `transfer-${id}`;
    if (!names.has(value)) return value;
  }
  return `transfer-${document.candidates.length + 10001}`;
}

function eventId(history: TransferHistory): string {
  const names = new Set(history.events.map((event) => event.id));
  for (let index = 1; index < 10000; index += 1) {
    const value = `event-${index}`;
    if (!names.has(value)) return value;
  }
  return `event-${history.events.length + 10001}`;
}

function nowAfter(history: TransferHistory): string {
  const current = new Date().toISOString();
  const latest = history.events.at(-1)?.at;
  if (!latest || latest <= current) return current;
  // No future-dated journal event is silently backdated.
  return latest;
}

export function RecoveryTransferPreflight({
  locale, records, inspected, saveFile,
}: RecoveryTransferPreflightProps): ReactElement {
  const headingId = useId();
  const importId = useId();
  const resultsId = useId();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const copy = recoveryTransferCopy(locale);
  const [document, setDocument] = useState<TransferDocument>(newTransferDocument);
  const [history, setHistory] = useState<TransferHistory>(emptyHistory);
  const [staged, setStaged] = useState<TransferDocument | null>(null);
  const [stagedHistory, setStagedHistory] = useState<TransferHistory | null>(null);
  const [packId, setPackId] = useState("");
  const [kind, setKind] = useState<TransferKind>("download");
  const [condition, setCondition] = useState<TransferCondition>("unknown");
  const [sourceName, setSourceName] = useState("");
  const [licence, setLicence] = useState<string>(TRANSFER_LICENCES[0] ?? "");
  const [sourceDate, setSourceDate] = useState("");
  const [tier, setTier] = useState<EvidenceTier>("UNKNOWN");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [expected, setExpected] = useState("");
  const [available, setAvailable] = useState("");
  const [search, setSearch] = useState("");
  const [filterStage, setFilterStage] = useState<TransferStage | "">("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  const summary = useMemo(() => summarizeTransferDocument(document), [document]);
  const packSummary = useMemo(() => transferPackSummaries(document), [document]);
  const visible = useMemo(() => filterTransferCandidates(document, { search, stage: filterStage || undefined }), [document, search, filterStage]);
  const stagedPreview = useMemo(() => staged === null ? null : transferPreviewMerge(document, staged), [document, staged]);
  const stagedBundlePreview = useMemo(() => {
    if (staged === null || stagedHistory === null) return null;
    const current = prepareTransferBundle(document, history);
    const incoming = prepareTransferBundle(staged, stagedHistory);
    if (!current.ok || !incoming.ok) return null;
    return previewTransferBundleMerge(current.value, incoming.value);
  }, [document, history, staged, stagedHistory]);
  const packIds = useMemo(() => [...new Set(records.map((record) => record.id))].sort(), [records]);

  function recordEvent(candidateId: string, action: TransferHistoryAction, nextHistory: TransferHistory): TransferHistory | null {
    const result = appendHistoryEvent(nextHistory, {
      id: eventId(nextHistory), candidateId, action, at: nowAfter(nextHistory), note: "",
    });
    return result.ok ? result.value : null;
  }

  function add(): void {
    const expectedBytes = parseQuantity(expected);
    const availableBytes = parseQuantity(available);
    if (!inspected || !packIds.includes(packId)) { setStatus(copy.inspected); return; }
    if (expectedBytes === undefined || availableBytes === undefined || !DATE_ONLY.test(sourceDate)) {
      setStatus(copy.issues.bytes);
      return;
    }
    const candidate: TransferCandidate = {
      id: nextId(document), packId, kind, condition, stage: "draft",
      recordedAt: new Date().toISOString(),
      expectedBytes, availableBytes, note,
      source: { name: sourceName, licence, date: sourceDate, tier, reference },
    };
    const result = appendTransferCandidate(document, candidate);
    if (!result.ok) { setStatus(copy.issues[result.issue]); return; }
    const next = recordEvent(candidate.id, "add", history);
    if (next === null) { setStatus(copy.failed); return; }
    setDocument(result.value);
    setHistory(next);
    setCondition("unknown");
    setExpected("");
    setAvailable("");
    setNote("");
    setStatus(copy.noAction);
  }

  function transition(id: string, stage: TransferStage): void {
    const result = transitionTransferCandidate(document, id, stage);
    if (!result.ok) { setStatus(copy.issues[result.issue]); return; }
    const next = recordEvent(id, stage === "reviewed" ? "review" : "discard", history);
    if (!next) { setStatus(copy.failed); return; }
    setDocument(result.value);
    setHistory(next);
    setStatus(copy.noAction);
  }

  async function save(): Promise<void> {
    if (!saveFile || busy) return;
    const bundle = prepareTransferBundle(document, history);
    if (!bundle.ok) { setStatus(copy.failed); return; }
    const output = serializeTransferBundle(bundle.value);
    if (!output.ok) { setStatus(copy.failed); return; }
    setBusy(true);
    try { await saveFile("local-transfer-preflight.json", output.value); setStatus(copy.saved); }
    catch { setStatus(copy.failed); }
    finally { setBusy(false); }
  }

  async function importFile(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.item(0);
    event.target.value = "";
    if (!file) return;
    setStaged(null);
    setStagedHistory(null);
    if (file.size > 768 * 1024) { setStatus(copy.issues.limit); return; }
    try {
      const raw = await file.text();
      const bundle = parseTransferBundle(raw);
      if (bundle.ok) {
        setStaged(bundle.value.records);
        setStagedHistory(bundle.value.history);
        setStatus("");
        return;
      }
      // Accept earlier local note-only documents without inventing a history.
      const simple = decodeTransferDocument(raw);
      if (!simple.ok) { setStatus(copy.issues[simple.issue]); return; }
      setStaged(simple.value);
      setStatus("");
    } catch { setStatus(copy.failed); }
  }

  function applyImport(): void {
    if (!staged) return;
    if (stagedHistory !== null) {
      const current = prepareTransferBundle(document, history);
      const incoming = prepareTransferBundle(staged, stagedHistory);
      if (!current.ok || !incoming.ok) { setStatus(copy.failed); return; }
      const merged = mergeTransferBundles(current.value, incoming.value);
      if (!merged.ok) { setStatus(copy.failed); return; }
      setDocument(merged.value.records);
      setHistory(merged.value.history);
    } else {
      const merged = mergeTransferDocuments(document, staged);
      if (!merged.ok) { setStatus(copy.issues[merged.issue]); return; }
      setDocument(merged.value);
    }
    setStaged(null);
    setStagedHistory(null);
    setStatus(copy.noAction);
    inputRef.current?.focus();
  }

  const count = stagedBundlePreview?.ok ? stagedBundlePreview.value.addedCandidates :
    stagedPreview?.ok ? stagedPreview.value.added.length : 0;
  const conflicts = stagedBundlePreview?.ok ? stagedBundlePreview.value.conflicts.length :
    stagedPreview?.ok ? stagedPreview.value.conflicts.length : 0;

  return <section style={panelStyle} lang={locale} aria-labelledby={headingId}>
    <h2 id={headingId}>{copy.heading}</h2>
    <p>{copy.introduction}</p>
    <p>{copy.disclaimer}</p>
    <p role="status" aria-live="polite">{status}</p>
    <p>{copy.counts}{locale === "fr" ? "\u00a0: " : ": "}{summary.count} · UNKNOWN{locale === "fr" ? "\u00a0: " : ": "}{summary.unknown}</p>
    <fieldset disabled={!inspected} style={{ border: 0, padding: 0, margin: 0 }}>
      <legend>{copy.entry}</legend>
      {!inspected && <p>{copy.pending}</p>}
      <div style={rowStyle}>
        <label style={fieldStyle}>{copy.packId}
          <select style={buttonStyle} value={packId} onChange={(event: ChangeEvent<HTMLSelectElement>) => setPackId(event.target.value)}>
            <option value="">—</option>
            {packIds.map((id) => <option key={id} value={id}>{id}</option>)}
          </select>
        </label>
        <label style={fieldStyle}>{copy.kind}
          <select style={buttonStyle} value={kind} onChange={(event: ChangeEvent<HTMLSelectElement>) => setKind(event.target.value as TransferKind)}>
            {TRANSFER_KINDS.map((value) => <option key={value} value={value}>{copy.kinds[value]}</option>)}
          </select>
        </label>
        <label style={fieldStyle}>{copy.condition}
          <select style={buttonStyle} value={condition} onChange={(event: ChangeEvent<HTMLSelectElement>) => setCondition(event.target.value as TransferCondition)}>
            {TRANSFER_CONDITIONS.map((value) => <option key={value} value={value}>{copy.conditions[value]}</option>)}
          </select>
        </label>
      </div>
      <div style={rowStyle}>
        <label style={fieldStyle}>{copy.source}
          <input style={buttonStyle} maxLength={PREFLIGHT_LIMITS.source} value={sourceName} onChange={(event: ChangeEvent<HTMLInputElement>) => setSourceName(event.target.value)} />
        </label>
        <label style={fieldStyle}>{copy.licence}
          <select style={buttonStyle} value={licence} onChange={(event: ChangeEvent<HTMLSelectElement>) => setLicence(event.target.value)}>
            {TRANSFER_LICENCES.map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
        </label>
        <label style={fieldStyle}>{copy.date}
          <input type="date" style={buttonStyle} value={sourceDate} onChange={(event: ChangeEvent<HTMLInputElement>) => setSourceDate(event.target.value)} />
        </label>
      </div>
      <div style={rowStyle}>
        <label style={fieldStyle}>{copy.tier}
          <select style={buttonStyle} value={tier} onChange={(event: ChangeEvent<HTMLSelectElement>) => setTier(event.target.value as EvidenceTier)}>
            {EVIDENCE_TIERS.map((value) => <option key={value} value={value}>{copy.tiers[value]}</option>)}
          </select>
        </label>
        <label style={fieldStyle}>{copy.reference}
          <input style={buttonStyle} maxLength={PREFLIGHT_LIMITS.reference} value={reference} onChange={(event: ChangeEvent<HTMLInputElement>) => setReference(event.target.value)} />
        </label>
      </div>
      <div style={rowStyle}>
        <label style={fieldStyle}>{copy.expected}
          <input inputMode="numeric" style={buttonStyle} value={expected} onChange={(event: ChangeEvent<HTMLInputElement>) => setExpected(event.target.value)} />
        </label>
        <label style={fieldStyle}>{copy.available}
          <input inputMode="numeric" style={buttonStyle} value={available} onChange={(event: ChangeEvent<HTMLInputElement>) => setAvailable(event.target.value)} />
        </label>
      </div>
      <p>{copy.unknownBytes}</p>
      <label style={fieldStyle}>{copy.note}
        <textarea rows={3} style={buttonStyle} maxLength={PREFLIGHT_LIMITS.note} value={note} onChange={(event: ChangeEvent<HTMLTextAreaElement>) => setNote(event.target.value)} />
      </label>
      <button type="button" style={buttonStyle} onClick={add}>{copy.add}</button>
    </fieldset>
    <div style={rowStyle}>
      <label style={fieldStyle} htmlFor={importId}>{copy.import}
        <input id={importId} ref={inputRef} style={buttonStyle} type="file" accept=".json,application/json" onChange={(event: ChangeEvent<HTMLInputElement>) => { void importFile(event); }} />
      </label>
      {saveFile && <button type="button" style={buttonStyle} disabled={busy} onClick={() => { void save(); }}>{copy.export}</button>}
    </div>
    {staged && <section style={cardStyle} aria-label={copy.pending}>
      <p>{copy.additions}{locale === "fr" ? "\u00a0: " : ": "}{count}</p>
      <p>{copy.collisions}{locale === "fr" ? "\u00a0: " : ": "}{conflicts}</p>
      <button type="button" style={buttonStyle} disabled={conflicts > 0 || !(stagedHistory !== null ? stagedBundlePreview?.ok : stagedPreview?.ok)} onClick={applyImport}>{copy.apply}</button>
      <button type="button" style={buttonStyle} onClick={() => { setStaged(null); setStagedHistory(null); }}>{copy.cancel}</button>
    </section>}
    <section aria-labelledby={resultsId}>
      <h3 id={resultsId}>{copy.findings}</h3>
      <div style={rowStyle}>
        <label style={fieldStyle}>{copy.search}
          <input style={buttonStyle} value={search} onChange={(event: ChangeEvent<HTMLInputElement>) => setSearch(event.target.value)} />
        </label>
        <label style={fieldStyle}>{copy.stage}
          <select style={buttonStyle} value={filterStage} onChange={(event: ChangeEvent<HTMLSelectElement>) => setFilterStage(event.target.value as TransferStage | "")}>
            <option value="">—</option>
            {TRANSFER_STAGES.map((value) => <option key={value} value={value}>{copy.stages[value]}</option>)}
          </select>
        </label>
      </div>
      {visible.length === 0 ? <p>{copy.empty}</p> : <ol>
        {visible.map((item) => {
          const assessment = assessTransferCandidate(item);
          const events = historyForCandidate(history, item.id);
          return <li key={item.id} style={cardStyle}>
            <strong>{item.packId} · {copy.kinds[item.kind]} · {copy.conditions[item.condition]}</strong>
            <p>{copy.next}{locale === "fr" ? "\u00a0: " : ": "}{copy.decisions[assessment.decision]}</p>
            <p>{copy.stage}{locale === "fr" ? "\u00a0: " : ": "}{copy.stages[item.stage]}</p>
            <p>{events.length} {locale === "fr" ? "événements manuels" : "manual events"}</p>
            <dl>
              <dt>{copy.source}</dt><dd>{item.source.name}</dd>
              <dt>{copy.licence}</dt><dd>{item.source.licence}</dd>
              <dt>{copy.date}</dt><dd>{item.source.date}</dd>
              <dt>{copy.tier}</dt><dd>{copy.tiers[item.source.tier]}</dd>
              <dt>{copy.reference}</dt><dd>{item.source.reference || "UNKNOWN"}</dd>
              <dt>{copy.expected}</dt><dd>{item.expectedBytes ?? "UNKNOWN"}</dd>
              <dt>{copy.available}</dt><dd>{item.availableBytes ?? "UNKNOWN"}</dd>
            </dl>
            {item.note && <p>{item.note}</p>}
            {item.stage === "draft" && <div style={rowStyle}>
              <button type="button" style={buttonStyle} onClick={() => transition(item.id, "reviewed")}>{copy.review}</button>
              <button type="button" style={buttonStyle} onClick={() => transition(item.id, "discarded")}>{copy.discard}</button>
            </div>}
          </li>;
        })}
      </ol>}
      <h3>{copy.counts}</h3>
      <ul>{packSummary.map((item) => <li key={item.packId}>
        {item.packId} · {item.count} · {item.expectedBytes ?? "UNKNOWN"}
      </li>)}</ul>
    </section>
  </section>;
}
