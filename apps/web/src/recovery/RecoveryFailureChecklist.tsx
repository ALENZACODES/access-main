import { useId, useState } from "react";
import type { ChangeEvent, CSSProperties, ReactElement } from "react";
import type { RecoveryLocale } from "./index";
import type { LocalPackRecord } from "./packInventory";
import type { SaveTextFile } from "./recoveryExport";
import {
  CHECKLIST_STEPS,
  FAILURE_CHECKLIST_COPY,
  changeChecklistStep,
  checklistCounts,
  defaultChecklist,
  exportChecklist,
  importChecklist,
  previewChecklistReplacement,
  type ChecklistState,
  type ChecklistProvenance,
  type FailureChecklist,
  type FailureCause,
  type FailureKind,
  type EvidenceTier,
} from "./recoveryFailureChecklist";

export interface RecoveryFailureChecklistProps {
  readonly locale: RecoveryLocale;
  readonly records: readonly LocalPackRecord[];
  readonly inspected: boolean;
  readonly saveFile?: SaveTextFile;
}
const target: CSSProperties = {
  minHeight: 44, minWidth: 44, padding: "10px 12px", font: "inherit",
};
const panel: CSSProperties = {
  display: "grid", gap: 12, border: "1px solid currentColor",
  borderRadius: 8, padding: 16, marginBlock: 16,
};
const field: CSSProperties = { display: "grid", gap: 4, minWidth: 180, flex: "1 1 180px" };
const row: CSSProperties = { display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center" };
const KINDS: readonly FailureKind[] = ["pack", "download", "export"];
const CAUSES: readonly FailureCause[] = ["unknown", "offline", "storage", "permission", "damaged", "interrupted"];
const STATES: readonly ChecklistState[] = ["unknown", "noted", "skipped"];
const TIERS: readonly EvidenceTier[] = ["UNKNOWN", "user-observation", "file-metadata"];
const LICENCES = ["CC0-1.0", "CC-BY-4.0", "ODbL-1.0", "OGL-Canada-2.0", "OGL-ON-1.0"];

export function RecoveryFailureChecklist({
  locale, records, inspected, saveFile,
}: RecoveryFailureChecklistProps): ReactElement {
  const copy = FAILURE_CHECKLIST_COPY[locale];
  const titleId = useId();
  const fileId = useId();
  const [packId, setPackId] = useState("");
  const [kind, setKind] = useState<FailureKind>("pack");
  const [cause, setCause] = useState<FailureCause>("unknown");
  const [source, setSource] = useState("");
  const [licence, setLicence] = useState("CC0-1.0");
  const [date, setDate] = useState("");
  const [tier, setTier] = useState<EvidenceTier>("UNKNOWN");
  const [document, setDocument] = useState<FailureChecklist | null>(null);
  const [staged, setStaged] = useState<FailureChecklist | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const counts = document === null ? null : checklistCounts(document);
  const preview = staged === null ? null : previewChecklistReplacement(document, staged);

  function create(): void {
    if (!inspected || !records.some((item) => item.id === packId)) {
      setMessage(copy.error);
      return;
    }
    const provenance: ChecklistProvenance = { source, licence, date, tier };
    const draft = defaultChecklist(packId, kind, cause, date, provenance);
    const checked = exportChecklist(draft);
    if (!checked.ok) { setMessage(copy.error); return; }
    setDocument(draft);
    setStaged(null);
    setMessage("");
  }
  function update(step: FailureChecklist["steps"][number]["step"], state: ChecklistState, note: string): void {
    if (document === null) return;
    const changed = changeChecklistStep(document, step, state, note);
    if (!changed.ok) { setMessage(copy.error); return; }
    setDocument(changed.value);
    setMessage("");
  }
  async function readFile(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const selected = event.target.files?.item(0);
    event.target.value = "";
    setStaged(null);
    if (!selected || selected.size > 64 * 1024) {
      setMessage(copy.error);
      return;
    }
    try {
      const parsed = importChecklist(await selected.text());
      if (!parsed.ok) { setMessage(copy.error); return; }
      setStaged(parsed.value);
      setMessage(copy.imported);
    } catch {
      setMessage(copy.error);
    }
  }
  async function save(): Promise<void> {
    if (busy || document === null || saveFile === undefined) return;
    const result = exportChecklist(document);
    if (!result.ok) { setMessage(copy.error); return; }
    setBusy(true);
    try {
      await saveFile("failure-checklist.json", result.value);
      setMessage(copy.saved);
    } catch {
      setMessage(copy.error);
    } finally {
      setBusy(false);
    }
  }
  function applyStaged(): void {
    if (staged === null || preview?.ok !== true || !preview.value.accepted) return;
    setDocument(staged);
    setStaged(null);
    setMessage("");
  }

  return (
    <section lang={locale} style={panel} aria-labelledby={titleId}>
      <h2 id={titleId}>{copy.heading}</h2>
      <p>{copy.description}</p>
      <p role="status" aria-live="polite">{message}</p>
      <div style={row}>
        <label style={field}>{copy.pack}
          <select style={target} value={packId} disabled={!inspected} onChange={(event: ChangeEvent<HTMLSelectElement>) => setPackId(event.target.value)}>
            <option value="">—</option>
            {records.map((item) => <option key={item.id} value={item.id}>{item.id}</option>)}
          </select>
        </label>
        <label style={field}>{copy.kind}
          <select style={target} value={kind} onChange={(event: ChangeEvent<HTMLSelectElement>) => setKind(event.target.value as FailureKind)}>
            {KINDS.map((item) => <option value={item} key={item}>{copy.kinds[item]}</option>)}
          </select>
        </label>
        <label style={field}>{copy.cause}
          <select style={target} value={cause} onChange={(event: ChangeEvent<HTMLSelectElement>) => setCause(event.target.value as FailureCause)}>
            {CAUSES.map((item) => <option value={item} key={item}>{copy.causes[item]}</option>)}
          </select>
        </label>
      </div>
      <div style={row}>
        <label style={field}>{copy.source}
          <input style={target} maxLength={160} value={source} onChange={(event: ChangeEvent<HTMLInputElement>) => setSource(event.target.value)} />
        </label>
        <label style={field}>{copy.licence}
          <select style={target} value={licence} onChange={(event: ChangeEvent<HTMLSelectElement>) => setLicence(event.target.value)}>
            {LICENCES.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </label>
        <label style={field}>{copy.date}
          <input style={target} type="date" value={date} onChange={(event: ChangeEvent<HTMLInputElement>) => setDate(event.target.value)} />
        </label>
        <label style={field}>{copy.tier}
          <select style={target} value={tier} onChange={(event: ChangeEvent<HTMLSelectElement>) => setTier(event.target.value as EvidenceTier)}>
            {TIERS.map((item) => <option value={item} key={item}>{item}</option>)}
          </select>
        </label>
      </div>
      <button type="button" style={target} disabled={!inspected} onClick={create}>{copy.create}</button>
      {document !== null && <div>
        <p role="status">{counts?.unknown} UNKNOWN · {counts?.noted} {copy.status.noted} · {counts?.skipped} {copy.status.skipped}</p>
        <ol>
          {CHECKLIST_STEPS.map((step) => {
            const current = document.steps.find((item) => item.step === step);
            if (current === undefined) return null;
            return <li key={step}>
              <fieldset style={{ marginBlock: 12, padding: 12 }}>
                <legend>{copy.steps[step]}</legend>
                <div style={row}>
                  <label style={field}>{copy.state}
                    <select style={target} value={current.state} onChange={(event: ChangeEvent<HTMLSelectElement>) => update(step, event.target.value as ChecklistState, current.note)}>
                      {STATES.map((item) => <option value={item} key={item}>{copy.status[item]}</option>)}
                    </select>
                  </label>
                  <label style={field}>{copy.note}
                    <textarea style={target} rows={2} maxLength={500} value={current.note} onChange={(event: ChangeEvent<HTMLTextAreaElement>) => update(step, current.state, event.target.value)} />
                  </label>
                </div>
              </fieldset>
            </li>;
          })}
        </ol>
      </div>}
      <div style={row}>
        {saveFile && <button type="button" style={target} disabled={busy || document === null} onClick={() => { void save(); }}>{copy.save}</button>}
        <label style={field} htmlFor={fileId}>{copy.choose}
          <input style={target} id={fileId} type="file" accept="application/json,.json" onChange={(event: ChangeEvent<HTMLInputElement>) => { void readFile(event); }} />
        </label>
      </div>
      {preview?.ok === true && <div>
        <p>{preview.value.unknownSteps} UNKNOWN</p>
        <button type="button" style={target} onClick={applyStaged}>{copy.apply}</button>
      </div>}
    </section>
  );
}
