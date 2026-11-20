import { useId, useState } from "react";
import type { CSSProperties, ChangeEvent, ReactElement } from "react";
import type { RecoveryLocale } from "./index";
import type { LocalPackRecord } from "./packInventory";
import type { SaveTextFile } from "./recoveryExport";
import {
  ATTEMPT_COPY, addRecoveryAttempt, emptyAttemptDocument, exportRecoveryAttempts,
  mergeRecoveryAttempts, parseRecoveryAttempts, previewAttemptMerge,
  summarizeRecoveryAttempts, type AttemptDocument, type AttemptKind,
  type AttemptOutcome, type AttemptProvenance,
} from "./recoveryRepairReceipt";

export interface RecoveryRepairAttemptsProps {
  readonly locale: RecoveryLocale;
  readonly records: readonly LocalPackRecord[];
  readonly inspected: boolean;
  readonly saveFile?: SaveTextFile;
}

const control: CSSProperties = {
  minHeight: 44, minWidth: 44, padding: "10px 12px", font: "inherit",
};
const row: CSSProperties = { display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12 };
const column: CSSProperties = { display: "grid", gap: 4, minWidth: 170, flex: "1 1 170px" };
const panel: CSSProperties = { border: "1px solid currentColor", borderRadius: 8, padding: 16, marginBlock: 16, display: "grid", gap: 12 };
const FILE_LIMIT = 256 * 1024;
const KINDS: readonly AttemptKind[] = ["inspection", "download", "export", "storage"];
const OUTCOMES: readonly AttemptOutcome[] = ["unknown", "failed", "incomplete", "reported-complete"];
const LICENCES = ["CC0-1.0", "CC-BY-4.0", "ODbL-1.0", "OGL-Canada-2.0", "OGL-ON-1.0"];

function labelKind(kind: AttemptKind, locale: RecoveryLocale): string {
  const fr: Record<AttemptKind, string> = { inspection: "Inspection", download: "Téléchargement", export: "Exportation", storage: "Stockage" };
  const en: Record<AttemptKind, string> = { inspection: "Inspection", download: "Download", export: "Export", storage: "Storage" };
  return (locale === "fr" ? fr : en)[kind];
}

function labelOutcome(outcome: AttemptOutcome, locale: RecoveryLocale): string {
  const fr: Record<AttemptOutcome, string> = { unknown: "UNKNOWN", failed: "Échec", incomplete: "Incomplet", "reported-complete": "Déclaré terminé" };
  const en: Record<AttemptOutcome, string> = { unknown: "UNKNOWN", failed: "Failed", incomplete: "Incomplete", "reported-complete": "Reported complete" };
  return (locale === "fr" ? fr : en)[outcome];
}

function uniqueId(document: AttemptDocument): string {
  const used = new Set(document.entries.map((entry) => entry.id));
  for (let number = 1; number <= 10000; number++) {
    const id = `attempt-${number}`;
    if (!used.has(id)) return id;
  }
  return `attempt-${document.entries.length + 10001}`;
}

export function RecoveryRepairAttempts({
  locale, records, inspected, saveFile,
}: RecoveryRepairAttemptsProps): ReactElement {
  const heading = useId();
  const fileId = useId();
  const copy = ATTEMPT_COPY[locale];
  const [document, setDocument] = useState<AttemptDocument>(emptyAttemptDocument);
  const [staged, setStaged] = useState<AttemptDocument | null>(null);
  const [selectedPack, setSelectedPack] = useState("");
  const [kind, setKind] = useState<AttemptKind>("inspection");
  const [outcome, setOutcome] = useState<AttemptOutcome>("unknown");
  const [note, setNote] = useState("");
  const [source, setSource] = useState("");
  const [licence, setLicence] = useState("CC-BY-4.0");
  const [sourceDate, setSourceDate] = useState("");
  const [tier, setTier] = useState("UNKNOWN");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const summary = summarizeRecoveryAttempts(document);
  const preview = staged === null ? null : previewAttemptMerge(document, staged);

  function add(): void {
    if (!inspected || !records.some((record) => record.id === selectedPack)) {
      setMessage(copy.error);
      return;
    }
    const provenance: AttemptProvenance = { source, licence, date: sourceDate, tier };
    const result = addRecoveryAttempt(document, {
      id: uniqueId(document), packId: selectedPack, kind, outcome,
      at: new Date().toISOString(), note, provenance,
    });
    if (!result.ok) { setMessage(copy.error); return; }
    setDocument(result.value);
    setMessage("");
    setNote("");
  }

  async function importFile(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.item(0);
    event.target.value = "";
    if (!file) return;
    setStaged(null);
    if (file.size > FILE_LIMIT) { setMessage(copy.error); return; }
    try {
      const raw = await file.text();
      const result = parseRecoveryAttempts(raw);
      if (!result.ok) { setMessage(copy.error); return; }
      setStaged(result.value);
      setMessage(copy.staged);
    } catch {
      setMessage(copy.error);
    }
  }

  function importStaged(): void {
    if (!staged) return;
    const result = mergeRecoveryAttempts(document, staged);
    if (!result.ok) { setMessage(result.issue === "conflict" ? copy.conflict : copy.error); return; }
    setDocument(result.value);
    setStaged(null);
    setMessage("");
  }

  async function save(): Promise<void> {
    if (!saveFile || busy) return;
    const result = exportRecoveryAttempts(document);
    if (!result.ok) { setMessage(copy.error); return; }
    setBusy(true);
    try {
      await saveFile("recovery-attempts.json", result.value);
      setMessage(copy.saved);
    } catch {
      setMessage(copy.error);
    } finally {
      setBusy(false);
    }
  }

  return <section aria-labelledby={heading} lang={locale} style={panel}>
    <h2 id={heading}>{copy.heading}</h2>
    <p>{copy.introduction}</p>
    <p role="status" aria-live="polite">{message}</p>
    <p>{summary.total} {locale === "fr" ? "tentatives" : "attempts"} · {summary.unknown} UNKNOWN</p>
    <div style={row}>
      <label style={column}>{copy.pack}
        <select style={control} value={selectedPack} onChange={(event: ChangeEvent<HTMLSelectElement>) => setSelectedPack(event.target.value)} disabled={!inspected}>
          <option value="">—</option>
          {records.map((record) => <option key={record.id} value={record.id}>{record.id}</option>)}
        </select>
      </label>
      <label style={column}>{copy.kind}
        <select style={control} value={kind} onChange={(event: ChangeEvent<HTMLSelectElement>) => setKind(event.target.value as AttemptKind)}>
          {KINDS.map((item) => <option key={item} value={item}>{labelKind(item, locale)}</option>)}
        </select>
      </label>
      <label style={column}>{copy.outcome}
        <select style={control} value={outcome} onChange={(event: ChangeEvent<HTMLSelectElement>) => setOutcome(event.target.value as AttemptOutcome)}>
          {OUTCOMES.map((item) => <option key={item} value={item}>{labelOutcome(item, locale)}</option>)}
        </select>
      </label>
    </div>
    <div style={row}>
      <label style={column}>{copy.source}
        <input style={control} value={source} maxLength={180} onChange={(event: ChangeEvent<HTMLInputElement>) => setSource(event.target.value)} />
      </label>
      <label style={column}>{copy.licence}
        <select style={control} value={licence} onChange={(event: ChangeEvent<HTMLSelectElement>) => setLicence(event.target.value)}>
          {LICENCES.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
      </label>
      <label style={column}>{copy.date}
        <input style={control} type="date" value={sourceDate} onChange={(event: ChangeEvent<HTMLInputElement>) => setSourceDate(event.target.value)} />
      </label>
      <label style={column}>{copy.tier}
        <input style={control} maxLength={48} value={tier} onChange={(event: ChangeEvent<HTMLInputElement>) => setTier(event.target.value)} />
      </label>
    </div>
    <label style={column}>{copy.note}
      <textarea style={control} rows={3} maxLength={1200} value={note} onChange={(event: ChangeEvent<HTMLTextAreaElement>) => setNote(event.target.value)} />
    </label>
    <div style={row}>
      <button style={control} type="button" disabled={!inspected} onClick={add}>{copy.add}</button>
      {saveFile && <button style={control} type="button" disabled={busy} onClick={() => { void save(); }}>{copy.exportFile}</button>}
      <label style={column} htmlFor={fileId}>{copy.importFile}
        <input id={fileId} style={control} type="file" accept="application/json,.json" onChange={(event: ChangeEvent<HTMLInputElement>) => { void importFile(event); }} />
      </label>
    </div>
    {preview?.ok && <div style={row}>
      <p>{preview.value.append.length} {locale === "fr" ? "nouveaux éléments" : "new entries"}{locale === "fr" ? "\u202F; " : "; "}{preview.value.conflicts.length} {locale === "fr" ? "conflits" : "conflicts"}</p>
      <button style={control} type="button" disabled={preview.value.conflicts.length > 0} onClick={importStaged}>{copy.apply}</button>
    </div>}
    {document.entries.length === 0 ? <p>{copy.empty}</p> : <ol>
      {document.entries.map((entry) => <li key={entry.id}>
        <strong>{entry.packId}</strong> · {labelKind(entry.kind, locale)} · {labelOutcome(entry.outcome, locale)}
        <dl><dt>{copy.source}</dt><dd>{entry.provenance.source}</dd>
          <dt>{copy.licence}</dt><dd>{entry.provenance.licence}</dd>
          <dt>{copy.date}</dt><dd>{entry.provenance.date}</dd>
          <dt>{copy.tier}</dt><dd>{entry.provenance.tier}</dd></dl>
        {entry.note && <p>{entry.note}</p>}
      </li>)}
    </ol>}
  </section>;
}
