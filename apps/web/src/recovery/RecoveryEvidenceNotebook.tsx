import { useId, useRef, useState } from "react";
import type { ChangeEvent, CSSProperties, FormEvent, ReactElement } from "react";
import type { RecoveryLocale } from "./index";
import type { SaveTextFile } from "./recoveryExport";
import { evidenceCopy } from "./recoveryEvidenceCopy";
import {
  EVIDENCE_LIMITS,
  addEvidenceEntry,
  emptyEvidenceNotebook,
  exportEvidenceNotebook,
  mergeEvidenceNotebook,
  parseEvidenceNotebook,
  previewEvidenceMerge,
  reviewEvidenceEntry,
  summarizeEvidenceNotebook,
  type EvidenceDecision,
  type EvidenceNotebook,
  type EvidenceTier,
} from "./recoveryEvidenceNotebook";

export interface RecoveryEvidenceNotebookProps {
  readonly locale: RecoveryLocale;
  readonly saveFile?: SaveTextFile;
}

const touch: CSSProperties = { minHeight: 44, minWidth: 44, padding: "10px 14px", font: "inherit" };
const input: CSSProperties = { ...touch, boxSizing: "border-box", maxWidth: "100%", width: "100%" };
const group: CSSProperties = { display: "grid", gap: 8, marginBlock: 12 };
const row: CSSProperties = { display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" };
const formLayout: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 250px), 1fr))", gap: 12 };
const LICENCES = ["CC0-1.0", "CC-BY-4.0", "ODbL-1.0", "OGL-Canada-2.0", "OGL-ON-1.0"] as const;
const TIERS: readonly EvidenceTier[] = ["official", "community", "self-reported", "unknown"];
const DECISIONS: readonly EvidenceDecision[] = ["accepted", "superseded", "dismissed"];

function clock(): string { return new Date().toISOString(); }
function initialNotebook(): EvidenceNotebook {
  const result = emptyEvidenceNotebook(clock());
  if (!result.ok) throw new Error("Local time is unavailable");
  return result.notebook;
}

/** Session-only UI. Import and export require user action; no automatic writes. */
export function RecoveryEvidenceNotebook({ locale, saveFile }: RecoveryEvidenceNotebookProps): ReactElement {
  const copy = evidenceCopy(locale);
  const titleId = useId();
  const fileId = useId();
  const statusId = useId();
  const [notebook, setNotebook] = useState<EvidenceNotebook>(initialNotebook);
  const [candidate, setCandidate] = useState<EvidenceNotebook | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [packId, setPackId] = useState("");
  const [field, setField] = useState("");
  const [value, setValue] = useState("");
  const [valueUnknown, setValueUnknown] = useState(true);
  const [source, setSource] = useState("");
  const [licence, setLicence] = useState<(typeof LICENCES)[number]>(LICENCES[0]);
  const [date, setDate] = useState("");
  const [tier, setTier] = useState<EvidenceTier>("unknown");
  const [note, setNote] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const summary = summarizeEvidenceNotebook(notebook);
  const preview = candidate === null ? null : previewEvidenceMerge(notebook, candidate);

  function addEntry(): void {
    const now = clock();
    const id = `e-${now.replace(/[^0-9]/g, "")}-${notebook.entries.length + 1}`;
    const result = addEvidenceEntry(notebook, id, {
      packId: packId.trim(), field: field.trim(), value: valueUnknown ? "UNKNOWN" : value,
      provenance: { source: source.trim(), licence, date, tier }, note: note.trim(),
    }, now);
    if (!result.ok) { setMessage(copy.issues[result.reason]); return; }
    setNotebook(result.notebook);
    setMessage(copy.add);
    setNote("");
    setValue("");
    setValueUnknown(true);
  }

  function changeDecision(id: string, decision: EvidenceDecision): void {
    const result = reviewEvidenceEntry(notebook, id, decision, clock());
    if (!result.ok) { setMessage(copy.issues[result.reason]); return; }
    setNotebook(result.notebook);
    setMessage(copy.review);
  }

  async function selectFile(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const selected = event.target.files?.item(0);
    if (fileRef.current) fileRef.current.value = "";
    setCandidate(null);
    if (selected === null || selected === undefined) return;
    if (selected.size > EVIDENCE_LIMITS.maxBytes) { setMessage(copy.issues["too-large"]); return; }
    setBusy(true);
    setMessage(copy.pending);
    try {
      const content = await selected.text();
      const result = parseEvidenceNotebook(content);
      if (!result.ok) { setMessage(copy.issues[result.reason]); return; }
      setCandidate(result.notebook);
      setMessage(copy.details);
    } catch {
      setMessage(copy.stopped);
    } finally { setBusy(false); }
  }

  function merge(): void {
    if (candidate === null || preview === null || preview.conflicts.length > 0) return;
    const result = mergeEvidenceNotebook(notebook, candidate, clock());
    if (!result.ok) { setMessage(copy.issues[result.reason]); return; }
    setNotebook(result.notebook);
    setCandidate(null);
    setMessage(copy.imported);
  }

  async function save(): Promise<void> {
    if (saveFile === undefined || busy) return;
    const content = exportEvidenceNotebook(notebook);
    if (content === null) { setMessage(copy.unsupported); return; }
    setBusy(true);
    try {
      await saveFile("local-recovery-evidence.json", content);
      setMessage(copy.exported);
    } catch {
      setMessage(copy.stopped);
    } finally { setBusy(false); }
  }

  return (
    <section aria-labelledby={titleId} lang={locale} style={{ border: "1px solid currentColor", borderRadius: 8, padding: 16, marginBlock: 16 }}>
      <h2 id={titleId}>{copy.title}</h2>
      <p>{copy.intro}</p>
      <p aria-live="polite" role="status" id={statusId}>{message}</p>
      <div aria-label={copy.summary} style={row}>
        <span>{copy.all}{locale === "fr" ? "\u00a0: " : ": "}{summary.total}</span>
        <span>{copy.known}{locale === "fr" ? "\u00a0: " : ": "}{summary.known}</span>
        <span>{copy.unknown}{locale === "fr" ? "\u00a0: " : ": "}{summary.unknown}</span>
      </div>
      <form onSubmit={(event: FormEvent<HTMLFormElement>) => { event.preventDefault(); addEntry(); }}>
        <div style={formLayout}>
          <label style={group}>{copy.packId}
            <input style={input} required maxLength={128} value={packId} onChange={(event: ChangeEvent<HTMLInputElement>) => setPackId(event.target.value)} />
          </label>
          <label style={group}>{copy.field}
            <input style={input} required maxLength={80} value={field} onChange={(event: ChangeEvent<HTMLInputElement>) => setField(event.target.value)} />
          </label>
          <label style={group}>{copy.source}
            <input style={input} required maxLength={240} value={source} onChange={(event: ChangeEvent<HTMLInputElement>) => setSource(event.target.value)} />
          </label>
          <label style={group}>{copy.licence}
            <select style={input} value={licence} onChange={(event: ChangeEvent<HTMLSelectElement>) => setLicence(event.target.value as (typeof LICENCES)[number])}>
              {LICENCES.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>
          <label style={group}>{copy.date}
            <input style={input} required type="date" max={clock().slice(0, 10)} value={date} onChange={(event: ChangeEvent<HTMLInputElement>) => setDate(event.target.value)} />
          </label>
          <label style={group}>{copy.tier}
            <select style={input} value={tier} onChange={(event: ChangeEvent<HTMLSelectElement>) => setTier(event.target.value as EvidenceTier)}>
              {TIERS.map((item) => <option key={item} value={item}>{copy.tiers[item]}</option>)}
            </select>
          </label>
        </div>
        <label style={{ ...group, ...row, minHeight: 44 }}>
          <input type="checkbox" checked={valueUnknown} onChange={(event: ChangeEvent<HTMLInputElement>) => setValueUnknown(event.target.checked)} />
          {copy.unknownValue}
        </label>
        {!valueUnknown && <label style={group}>{copy.value}
          <input style={input} required maxLength={240} value={value} onChange={(event: ChangeEvent<HTMLInputElement>) => setValue(event.target.value)} />
        </label>}
        <label style={group}>{copy.note}
          <textarea style={input} maxLength={800} rows={3} value={note} onChange={(event: ChangeEvent<HTMLTextAreaElement>) => setNote(event.target.value)} />
        </label>
        <button type="submit" style={touch} disabled={busy || summary.total >= EVIDENCE_LIMITS.maxEntries}>{copy.add}</button>
      </form>
      <details style={{ marginBlock: 16 }}>
        <summary style={{ minHeight: 44, display: "flex", alignItems: "center", cursor: "pointer" }}>{copy.inspect}</summary>
        {notebook.entries.length === 0 ? <p>{copy.empty}</p> : (
          <ol>
            {notebook.entries.map((entry) => (
              <li key={entry.id} style={{ paddingBlock: 12 }}>
                <strong>{entry.packId} / {entry.field}</strong>
                <p>{entry.value === "UNKNOWN" ? copy.unknown : String(entry.value)}</p>
                <dl>
                  <dt>{copy.source}</dt><dd>{entry.provenance.source}</dd>
                  <dt>{copy.licence}</dt><dd>{entry.provenance.licence}</dd>
                  <dt>{copy.date}</dt><dd>{entry.provenance.date}</dd>
                  <dt>{copy.tier}</dt><dd>{copy.tiers[entry.provenance.tier]}</dd>
                  <dt>{copy.status}</dt><dd>{copy.state[entry.decision]}</dd>
                </dl>
                {entry.note && <p>{entry.note}</p>}
                {entry.decision === "open" && <div style={row}>
                  {DECISIONS.map((decision) => (
                    <button type="button" key={decision} style={touch} disabled={busy}
                      onClick={() => changeDecision(entry.id, decision)}>{copy.state[decision]}</button>
                  ))}
                </div>}
              </li>
            ))}
          </ol>
        )}
      </details>
      <div style={row}>
        <label htmlFor={fileId} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {copy.load}
          <input id={fileId} ref={fileRef} type="file" accept=".json,application/json"
            style={{ ...input, minHeight: 44 }} disabled={busy} onChange={(event: ChangeEvent<HTMLInputElement>) => { void selectFile(event); }} />
        </label>
        {saveFile !== undefined && <button type="button" style={touch} disabled={busy} onClick={() => { void save(); }}>
          {copy.save}
        </button>}
        <button type="button" style={touch} disabled={busy || summary.total === 0}
          onClick={() => { setNotebook(initialNotebook()); setCandidate(null); setMessage(copy.empty); }}>{copy.reset}</button>
      </div>
      {preview !== null && (
        <section aria-label={copy.details} style={{ marginBlock: 12, border: "1px solid currentColor", padding: 12 }}>
          <h3>{copy.details}</h3>
          <p>{copy.additions}{locale === "fr" ? "\u00a0: " : ": "}{preview.added}</p>
          <p>{copy.duplicates}{locale === "fr" ? "\u00a0: " : ": "}{preview.duplicates}</p>
          <p>{copy.conflicts}{locale === "fr" ? "\u00a0: " : ": "}{preview.conflicts.length}</p>
          {preview.conflicts.length > 0 && <ul>{preview.conflicts.map((entry) => <li key={entry.id}>{entry.id} — {copy.issues.conflict}</li>)}</ul>}
          <div style={row}>
            <button type="button" style={touch} disabled={busy || preview.conflicts.length > 0} onClick={merge}>{copy.merge}</button>
            <button type="button" style={touch} onClick={() => setCandidate(null)}>{copy.cancel}</button>
          </div>
        </section>
      )}
    </section>
  );
}
