import { useId, useRef, useState } from "react";
import type { ChangeEvent, CSSProperties, ReactElement } from "react";
import type { RecoveryLocale } from "./index";
import type { LocalPackRecord } from "./packInventory";
import type { SaveTextFile } from "./recoveryExport";
import {
  addRecoveryTask,
  applyTaskMerge,
  assessRecoveryTasks,
  countTaskStates,
  exportTaskBoard,
  newTaskBoard,
  parseTaskBoard,
  previewTaskMerge,
  updateRecoveryTask,
  type EvidenceTier,
  type RecoveryTask,
  type TaskBoard,
  type TaskKind,
  type TaskProvenance,
} from "./recoveryTaskBoard";
import { taskBoardCopy } from "./recoveryTaskCopy";

export interface RecoveryTaskBoardProps {
  readonly locale: RecoveryLocale;
  readonly records: readonly LocalPackRecord[];
  readonly saveFile?: SaveTextFile;
}

const control: CSSProperties = {
  minWidth: 44,
  minHeight: 44,
  font: "inherit",
  padding: "9px 12px",
};
const panel: CSSProperties = {
  border: "1px solid currentColor",
  borderRadius: 8,
  padding: 16,
  marginBlock: 16,
  overflowWrap: "anywhere",
};
const field: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 4,
  minWidth: "min(100%, 220px)",
  flex: "1 1 220px",
};
const row: CSSProperties = { display: "flex", flexWrap: "wrap", gap: 12, alignItems: "end" };
const kinds: readonly TaskKind[] = ["inspect", "download", "source", "storage", "export"];
const tiers: readonly EvidenceTier[] = ["public", "self-reported", "operator-note", "unknown"];
const licences = ["CC0-1.0", "CC-BY-4.0", "ODbL-1.0", "OGL-Canada-2.0", "OGL-ON-1.0"] as const;

/** All operations are manual and local; no background reads or writes. */
export function RecoveryTaskBoard({ locale, records, saveFile }: RecoveryTaskBoardProps): ReactElement {
  const copy = taskBoardCopy(locale);
  const sep = locale === "fr" ? "\u00a0: " : ": ";
  const observedStates: Readonly<Record<LocalPackRecord["state"], string>> = locale === "fr"
    ? { absent: "Non enregistré", ready: "Présent localement", corrupt: "Endommagé", unknown: "UNKNOWN" }
    : { absent: "Not saved", ready: "Present locally", corrupt: "Damaged", unknown: "UNKNOWN" };
  const heading = useId();
  const fileId = useId();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [board, setBoard] = useState<TaskBoard>(() => newTaskBoard(new Date().toISOString()));
  const [incoming, setIncoming] = useState<TaskBoard | null>(null);
  const [packId, setPackId] = useState("");
  const [kind, setKind] = useState<TaskKind>("inspect");
  const [note, setNote] = useState("");
  const [sourceName, setSourceName] = useState("");
  const [licence, setLicence] = useState<(typeof licences)[number]>("CC-BY-4.0");
  const [sourceDate, setSourceDate] = useState("");
  const [tier, setTier] = useState<EvidenceTier>("unknown");
  const [status, setStatus] = useState("");
  const [errors, setErrors] = useState<readonly string[]>([]);
  const [saving, setSaving] = useState(false);
  const assessment = assessRecoveryTasks(board, records);
  const preview = incoming === null ? null : previewTaskMerge(board, incoming);
  const counts = countTaskStates(board);

  function addTask(): void {
    const now = new Date().toISOString();
    if (Boolean(sourceName.trim()) !== Boolean(sourceDate)) { setStatus(copy.invalid); return; }
    const provenance: TaskProvenance | null = sourceName.trim() && sourceDate
      ? { name: sourceName.trim(), licence, date: sourceDate, tier } : null;
    const input: Omit<RecoveryTask, "createdAt" | "updatedAt" | "state"> = {
      id: `task_${now.replace(/[^0-9]/g, "")}_${board.tasks.length}`,
      packId: packId.trim(), kind, note: note.trim(), provenance,
    };
    const next = addRecoveryTask(board, input, now, now.slice(0, 10));
    if (!next.ok) { setStatus(copy.invalid); return; }
    setBoard(next.board);
    setNote("");
    setStatus("");
    setErrors([]);
  }

  function moveTask(id: string, nextState: RecoveryTask["state"]): void {
    const now = new Date().toISOString();
    const next = updateRecoveryTask(board, id, nextState, now, now.slice(0, 10));
    if (!next.ok) { setStatus(copy.invalid); return; }
    setBoard(next.board);
    setStatus("");
  }

  async function importFile(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const selected = event.currentTarget.files?.[0];
    setIncoming(null);
    setErrors([]);
    if (!selected) return;
    const now = new Date().toISOString();
    try {
      if (selected.size > 256 * 1024) { setStatus(copy.invalid); return; }
      const parsed = parseTaskBoard(await selected.text(), { today: now.slice(0, 10) });
      if (!parsed.ok) {
        setErrors(parsed.findings.map((finding) => `${finding.path}${sep}${copy.issue[finding.issue]}`));
        setStatus(copy.invalid);
      } else {
        setIncoming(parsed.board);
        setStatus("");
      }
    } catch { setStatus(copy.readError); }
    finally { if (fileRef.current) fileRef.current.value = ""; }
  }

  function merge(): void {
    if (incoming === null || preview === null || preview.conflicts.length > 0) return;
    const now = new Date().toISOString();
    const merged = applyTaskMerge(board, incoming, now, now.slice(0, 10));
    if (!merged.ok) { setStatus(copy.conflict); return; }
    setBoard(merged.board);
    setIncoming(null);
    setStatus("");
  }

  async function save(): Promise<void> {
    if (saveFile === undefined || saving) return;
    const now = new Date().toISOString();
    const content = exportTaskBoard(board, now.slice(0, 10));
    if (content === null) { setStatus(copy.invalid); return; }
    setSaving(true);
    try {
      await saveFile(`recovery-tasks-${now.slice(0, 10)}.json`, content);
      setStatus(copy.saved);
    } catch { setStatus(copy.readError); }
    finally { setSaving(false); }
  }

  return (
    <section style={panel} lang={locale} aria-labelledby={heading}>
      <h2 id={heading}>{copy.heading}</h2>
      <p>{copy.intro}</p>
      <p>{copy.noAutomatic}</p>
      <div style={row}>
        <label style={field}>{copy.pack}
          <input style={control} value={packId} maxLength={128} list={`${heading}-packs`}
            onChange={(event: ChangeEvent<HTMLInputElement>) => setPackId(event.currentTarget.value)} />
        </label>
        <datalist id={`${heading}-packs`}>
          {records.map((record) => <option key={record.id} value={record.id} />)}
        </datalist>
        <label style={field}>{copy.kind}
          <select style={control} value={kind} onChange={(event: ChangeEvent<HTMLSelectElement>) => setKind(event.currentTarget.value as TaskKind)}>
            {kinds.map((value) => <option key={value} value={value}>{copy.taskKinds[value]}</option>)}
          </select>
        </label>
      </div>
      <label style={{ ...field, marginBlock: 12 }}>{copy.note}
        <textarea value={note} maxLength={1200} rows={3}
          onChange={(event: ChangeEvent<HTMLTextAreaElement>) => setNote(event.currentTarget.value)} style={{ ...control, width: "100%" }} />
      </label>
      <div style={row}>
        <label style={field}>{copy.source}
          <input style={control} value={sourceName} maxLength={180} onChange={(event: ChangeEvent<HTMLInputElement>) => setSourceName(event.currentTarget.value)} />
        </label>
        <label style={field}>{copy.licence}
          <select style={control} value={licence} onChange={(event: ChangeEvent<HTMLSelectElement>) => setLicence(event.currentTarget.value as (typeof licences)[number])}>
            {licences.map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
        </label>
        <label style={field}>{copy.date}
          <input type="date" style={control} value={sourceDate} onChange={(event: ChangeEvent<HTMLInputElement>) => setSourceDate(event.currentTarget.value)} />
        </label>
        <label style={field}>{copy.tier}
          <select style={control} value={tier} onChange={(event: ChangeEvent<HTMLSelectElement>) => setTier(event.currentTarget.value as EvidenceTier)}>
            {tiers.map((value) => <option key={value} value={value}>{copy.tierOptions[value]}</option>)}
          </select>
        </label>
      </div>
      <div style={{ ...row, marginBlock: 12 }}>
        <button type="button" style={control} onClick={addTask}>{copy.add}</button>
        {saveFile !== undefined && <button type="button" style={control} disabled={saving} onClick={() => { void save(); }}>{copy.save}</button>}
        <button type="button" style={control} onClick={() => { setBoard(newTaskBoard(new Date().toISOString())); setIncoming(null); setStatus(""); }}>{copy.clear}</button>
      </div>
      <p role="status" aria-live="polite">{status}</p>
      {errors.length > 0 && <ul>{errors.slice(0, 15).map((error, index) => <li key={`${index}-${error}`}>{error}</li>)}</ul>}
      <p>{copy.taskStates.pending}{sep}{counts.pending}. {copy.taskStates["in-progress"]}{sep}{counts["in-progress"]}. {copy.taskStates.paused}{sep}{counts.paused}. {copy.taskStates.closed}{sep}{counts.closed}.</p>
      {board.tasks.length === 0 ? <p>{copy.empty}</p> : (
        <ol>
          {assessment.map(({ task, risk, reasons, observedPackState }) => (
            <li key={task.id} style={{ marginBlock: 14 }}>
              <strong>{task.packId}</strong>{" — "}{copy.taskKinds[task.kind]}{" — "}{copy.taskStates[task.state]}
              <p>{copy.risks[risk]} · {observedStates[observedPackState]}</p>
              {task.note && <p>{task.note}</p>}
              <ul>{reasons.map((reason) => <li key={reason}>{copy.reasons[reason] ?? copy.risks.unknown}</li>)}</ul>
              {task.provenance && <p>{copy.source}{sep}{task.provenance.name} · {copy.licence}{sep}{task.provenance.licence} · {copy.date}{sep}{task.provenance.date} · {copy.tier}{sep}{copy.tierOptions[task.provenance.tier]}</p>}
              <label>{copy.status}{" "}
                <select style={control} value={task.state} disabled={task.state === "closed"}
                  onChange={(event: ChangeEvent<HTMLSelectElement>) => moveTask(task.id, event.currentTarget.value as RecoveryTask["state"])}>
                  <option value={task.state}>{copy.taskStates[task.state]}</option>
                  {(["pending", "in-progress", "paused", "closed"] as const)
                    .filter((state) => state !== task.state && task.state !== "closed" &&
                      (task.state !== "in-progress" || state !== "pending") &&
                      (task.state !== "paused" || state !== "pending"))
                    .map((state) => <option key={state} value={state}>{copy.taskStates[state]}</option>)}
                </select>
              </label>
            </li>
          ))}
        </ol>
      )}
      <div style={{ marginBlock: 14 }}>
        <label htmlFor={fileId}>{copy.load}</label>
        <input id={fileId} ref={fileRef} type="file" accept="application/json,.json" onChange={(event: ChangeEvent<HTMLInputElement>) => { void importFile(event); }} style={{ ...control, display: "block", maxWidth: "100%" }} />
      </div>
      {preview !== null && (
        <section style={panel} aria-label={copy.preview}>
          <h3>{copy.preview}</h3>
          <p>{copy.accepted}{sep}{preview.accepted.length}. {copy.identical}{sep}{preview.identical.length}. {copy.conflicts}{sep}{preview.conflicts.length}.</p>
          {preview.conflicts.length > 0 && <p role="alert">{copy.conflict}</p>}
          <div style={row}>
            <button type="button" style={control} disabled={preview.conflicts.length > 0} onClick={merge}>{copy.merge}</button>
            <button type="button" style={control} onClick={() => setIncoming(null)}>{copy.cancel}</button>
          </div>
        </section>
      )}
    </section>
  );
}
