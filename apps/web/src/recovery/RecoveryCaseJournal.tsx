import { useId, useState } from "react";
import type { CSSProperties, ChangeEvent, FormEvent, ReactElement } from "react";
import type { RecoveryLocale } from "./index";
import type { LocalPackRecord } from "./packInventory";
import type { SaveTextFile } from "./recoveryExport";
import {
  appendCaseEvent,
  caseCounts,
  caseViewCopy,
  changeCasePhase,
  currentPackOutcome,
  effectiveCaseOutcome,
  newCaseDocument,
  parseCaseDocument,
  serializeCaseDocument,
  startCase,
  validCalendarDay,
  validCaseEvidence,
  type CaseDocument,
  type CaseEvent,
  type CaseIssue,
  type CaseKind,
  type CaseOutcome,
  type CasePhase,
} from "./recoveryCaseJournal";
import { compareCaseDocuments, journalCompareCopy, mergeCaseDocuments } from "./recoveryJournalCompare";

export interface RecoveryCaseJournalProps {
  readonly locale: RecoveryLocale;
  readonly records: readonly LocalPackRecord[];
  readonly inspected: boolean;
  readonly saveFile?: SaveTextFile;
}

const control: CSSProperties = {
  minHeight: 44,
  minWidth: 44,
  padding: "10px 12px",
  font: "inherit",
};
const panel: CSSProperties = {
  border: "1px solid currentColor",
  padding: 16,
  borderRadius: 8,
  display: "grid",
  gap: 12,
  marginBlock: 16,
  overflowWrap: "anywhere",
};
const row: CSSProperties = { display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center" };
const field: CSSProperties = { display: "grid", gap: 4, minWidth: 180, flex: "1 1 180px" };
const MAX_UPLOAD_BYTES = 384 * 1024;

function fresh(): CaseDocument {
  const now = new Date().toISOString();
  const result = newCaseDocument(now);
  if (!result.ok) throw new Error("Clock unavailable");
  return result.value;
}

function nextId(prefix: string, existing: readonly string[]): string {
  const used = new Set(existing);
  let number = 1;
  while (used.has(`${prefix}-${number}`)) number++;
  return `${prefix}-${number}`;
}

/**
 * All data remains in React state until the user explicitly imports or saves.
 * An event is a note about an operation, not permission to perform it.
 */
export function RecoveryCaseJournal({
  locale, records, inspected, saveFile,
}: RecoveryCaseJournalProps): ReactElement {
  const headingId = useId();
  const uploadId = useId();
  const caseId = useId();
  const sourceId = useId();
  const [document, setDocument] = useState<CaseDocument>(fresh);
  const [selectedPack, setSelectedPack] = useState("");
  const [staged, setStaged] = useState<CaseDocument | null>(null);
  const [selectedCase, setSelectedCase] = useState("");
  const [kind, setKind] = useState<CaseKind>("review");
  const [outcome, setOutcome] = useState<CaseOutcome>("unknown");
  const [note, setNote] = useState("");
  const [source, setSource] = useState("");
  const [licence, setLicence] = useState("CC-BY-4.0");
  const [sourceDate, setSourceDate] = useState("");
  const [tier, setTier] = useState("");
  const [withEvidence, setWithEvidence] = useState(false);
  const [issue, setIssue] = useState<CaseIssue | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, setPending] = useState(false);
  const copy = caseViewCopy(locale);
  const compareCopy = journalCompareCopy(locale);
  const comparison = staged === null ? null : compareCaseDocuments(document, staged);
  const counts = caseCounts(document, records);
  const selected = document.cases.find((item) => item.id === selectedCase);
  const recordMap = new Map(records.map((item) => [item.id, item]));

  function apply(result: { readonly ok: true; readonly value: CaseDocument } |
    { readonly ok: false; readonly issue: CaseIssue }): void {
    setSaved(false);
    if (result.ok) { setDocument(result.value); setIssue(null); setStaged(null); }
    else setIssue(result.issue);
  }

  function open(): void {
    if (!inspected || !selectedPack || !recordMap.has(selectedPack)) {
      setIssue("invalid-case");
      return;
    }
    const id = nextId("case", document.cases.map((item) => item.id));
    const result = startCase(document, id, selectedPack, new Date().toISOString());
    apply(result);
    if (result.ok) setSelectedCase(id);
  }

  function recordEvent(): void {
    if (!selected || selected.phase !== "open") {
      setIssue("invalid-transition");
      return;
    }
    const evidence = withEvidence ? { source, licence, date: sourceDate, tier } : null;
    if (withEvidence && (!validCalendarDay(sourceDate) || !validCaseEvidence(evidence))) {
      setIssue("invalid-source");
      return;
    }
    const event: CaseEvent = {
      id: nextId("event", selected.events.map((item) => item.id)),
      caseId: selected.id,
      kind,
      outcome,
      at: new Date().toISOString(),
      note,
      evidence,
    };
    const result = appendCaseEvent(document, selected.id, event);
    apply(result);
    if (result.ok) setNote("");
  }

  function setPhase(phase: CasePhase): void {
    if (!selected) { setIssue("invalid-case"); return; }
    apply(changeCasePhase(document, selected.id, phase));
  }

  async function importFile(file: File | undefined): Promise<void> {
    if (!file) return;
    setIssue(null);
    setSaved(false);
    if (file.size > MAX_UPLOAD_BYTES) { setIssue("too-large"); return; }
    setPending(true);
    try {
      const raw = await file.text();
      const result = parseCaseDocument(raw);
      if (result.ok) {
        setStaged(result.value);
        setIssue(null);
      } else setIssue(result.issue);
    } catch {
      setIssue("invalid-document");
    } finally { setPending(false); }
  }

  function applyImport(): void {
    if (staged === null) return;
    const result = mergeCaseDocuments(document, staged);
    if (!result.ok) { setIssue("invalid-document"); return; }
    apply({ ok: true, value: result.document });
    setSelectedCase("");
  }

  async function exportFile(): Promise<void> {
    if (!saveFile || pending) return;
    const checked = serializeCaseDocument(document);
    if (!checked.ok) { setIssue(checked.issue); return; }
    setPending(true);
    try {
      await saveFile("local-recovery-journal.json", checked.value);
      setSaved(true);
      setIssue(null);
    } catch {
      setIssue("invalid-document");
    } finally { setPending(false); }
  }

  return (
    <section style={panel} aria-labelledby={headingId} lang={locale}>
      <h2 id={headingId}>{copy.heading}</h2>
      <p>{copy.description}</p>
      <p role="status" aria-live="polite">
        {counts.total} {locale === "fr" ? "dossiers" : "cases"} ·
        {" "}{counts.unknown} {copy.unknown} · {counts.open} {copy.phase.open}
      </p>
      <div style={row}>
        <label style={field} htmlFor={caseId}>
          {copy.choosePack}
          <select id={caseId} style={control} value={selectedPack}
            disabled={!inspected || pending}
            onChange={(event: ChangeEvent<HTMLSelectElement>) => setSelectedPack(event.currentTarget.value)}>
            <option value="">{copy.choosePack}</option>
            {records.map((record) => <option key={record.id} value={record.id}>
              {record.id} — {copy.outcomes[currentPackOutcome(record)]}
            </option>)}
          </select>
        </label>
        <button type="button" style={control} disabled={!inspected || !selectedPack || pending}
          onClick={open}>{copy.newCase}</button>
      </div>
      <div style={row}>
        <label style={field}>
          {locale === "fr" ? "Dossier actif" : "Selected case"}
          <select style={control} value={selectedCase} disabled={pending}
            onChange={(event: ChangeEvent<HTMLSelectElement>) => setSelectedCase(event.currentTarget.value)}>
            <option value="">{locale === "fr" ? "Choisir un dossier" : "Choose a case"}</option>
            {document.cases.map((entry) => <option key={entry.id} value={entry.id}>
              {entry.id} — {entry.packId} — {copy.phase[entry.phase]}
            </option>)}
          </select>
        </label>
      </div>
      {selected && (
        <section style={panel} aria-label={`${selected.id} — ${selected.packId}`}>
          <h3>{selected.id} — {selected.packId}</h3>
          <p>{copy.phase[selected.phase]} · {copy.outcomes[effectiveCaseOutcome(selected, recordMap.get(selected.packId))]}</p>
          <div style={row}>
            {selected.phase === "open" && <button type="button" style={control}
              onClick={() => setPhase("paused")}>{copy.paused}</button>}
            {selected.phase === "paused" && <button type="button" style={control}
              onClick={() => setPhase("open")}>{copy.resumed}</button>}
            {selected.phase !== "closed" && <button type="button" style={control}
              onClick={() => setPhase("closed")}>{copy.closed}</button>}
          </div>
          {selected.phase === "open" && (
            <form style={panel} onSubmit={(event: FormEvent<HTMLFormElement>) => { event.preventDefault(); recordEvent(); }}>
              <div style={row}>
                <label style={field}>{copy.kind}
                  <select style={control} value={kind}
                    onChange={(event: ChangeEvent<HTMLSelectElement>) => setKind(event.currentTarget.value as CaseKind)}>
                    {(["inspection", "download", "export", "review"] as const).map((value) =>
                      <option value={value} key={value}>{copy.kinds[value]}</option>)}
                  </select>
                </label>
                <label style={field}>{copy.outcome}
                  <select style={control} value={outcome}
                    onChange={(event: ChangeEvent<HTMLSelectElement>) => setOutcome(event.currentTarget.value as CaseOutcome)}>
                    {(["unknown", "failed", "incomplete", "complete"] as const).map((value) =>
                      <option value={value} key={value}>{copy.outcomes[value]}</option>)}
                  </select>
                </label>
              </div>
              <label style={field}>{copy.note}
                <textarea style={{ ...control, minHeight: 88 }} maxLength={1200}
                  value={note} onChange={(event: ChangeEvent<HTMLTextAreaElement>) => setNote(event.currentTarget.value)} />
              </label>
              <label style={{ ...row, minHeight: 44 }} htmlFor={sourceId}>
                <input id={sourceId} type="checkbox" style={{ width: 24, height: 24 }}
                  checked={withEvidence} onChange={(event: ChangeEvent<HTMLInputElement>) => setWithEvidence(event.currentTarget.checked)} />
                {copy.optional}
              </label>
              {outcome === "complete" && !withEvidence && <p role="status">{copy.sourceRequired}</p>}
              {withEvidence && <div style={row}>
                <label style={field}>{copy.source}
                  <input style={control} value={source} maxLength={160}
                    onChange={(event: ChangeEvent<HTMLInputElement>) => setSource(event.currentTarget.value)} />
                </label>
                <label style={field}>{copy.licence}
                  <select style={control} value={licence}
                    onChange={(event: ChangeEvent<HTMLSelectElement>) => setLicence(event.currentTarget.value)}>
                    {["CC0-1.0", "CC-BY-4.0", "CC-BY-SA-4.0", "ODbL-1.0", "OGL-Canada-2.0", "OGL-ON-1.0"].map((value) =>
                      <option key={value} value={value}>{value}</option>)}
                  </select>
                </label>
                <label style={field}>{copy.date}
                  <input type="date" style={control} value={sourceDate}
                    onChange={(event: ChangeEvent<HTMLInputElement>) => setSourceDate(event.currentTarget.value)} />
                </label>
                <label style={field}>{copy.tier}
                  <input style={control} value={tier} maxLength={64}
                    onChange={(event: ChangeEvent<HTMLInputElement>) => setTier(event.currentTarget.value)} />
                </label>
              </div>}
              <button type="submit" style={control}>{copy.addEvent}</button>
            </form>
          )}
          <ol>
            {selected.events.map((event) => <li key={event.id}>
              <strong>{copy.kinds[event.kind]} — {copy.outcomes[event.outcome]}</strong>
              <p><time dateTime={event.at}>{event.at}</time></p>
              {event.note && <p>{event.note}</p>}
              {event.evidence && <dl>
                <dt>{copy.source}</dt><dd>{event.evidence.source}</dd>
                <dt>{copy.licence}</dt><dd>{event.evidence.licence}</dd>
                <dt>{copy.date}</dt><dd>{event.evidence.date}</dd>
                <dt>{copy.tier}</dt><dd>{event.evidence.tier}</dd>
              </dl>}
            </li>)}
          </ol>
        </section>
      )}
      {document.cases.length === 0 && <p>{copy.empty}</p>}
      <div style={row}>
        <label style={field} htmlFor={uploadId}>{copy.import}
          <input id={uploadId} type="file" accept="application/json,.json"
            style={{ ...control, maxWidth: "100%" }} disabled={pending}
            onChange={(event: ChangeEvent<HTMLInputElement>) => { void importFile(event.currentTarget.files?.[0]); event.currentTarget.value = ""; }} />
        </label>
        {saveFile && <button type="button" style={control} disabled={pending}
          onClick={() => { void exportFile(); }}>{copy.export}</button>}
      </div>
      {staged && comparison && (
        <section style={panel} aria-label={compareCopy.heading}>
          <h3>{compareCopy.heading}</h3>
          <p>{compareCopy.description}</p>
          <ul>
            <li>{compareCopy.new}: {comparison.newCount}</li>
            <li>{compareCopy.identical}: {comparison.identicalCount}</li>
            <li>{compareCopy.conflict}: {comparison.conflictCount}</li>
            <li>{compareCopy.retained}: {comparison.localOnlyCount}</li>
          </ul>
          <details>
            <summary style={{ ...control, display: "flex", alignItems: "center" }}>
              {locale === "fr" ? "Détails des dossiers" : "Case details"}
            </summary>
            <ul>
              {comparison.differences.map((difference) => (
                <li key={difference.id}>
                  <strong>{difference.id} — {compareCopy.states[difference.state]}</strong>
                  <span> · {difference.packId} · {compareCopy.events}: {difference.importedEvents}</span>
                </li>
              ))}
            </ul>
          </details>
          {!comparison.canMerge && <p role="alert">{compareCopy.blocked}</p>}
          {comparison.canMerge && comparison.newCount === 0 && <p>{compareCopy.noChanges}</p>}
          <div style={row}>
            <button type="button" style={control}
              disabled={!comparison.canMerge || comparison.newCount === 0}
              onClick={applyImport}>{compareCopy.apply}</button>
            <button type="button" style={control} onClick={() => setStaged(null)}>
              {compareCopy.discard}
            </button>
          </div>
        </section>
      )}
      <p role="status" aria-live="polite">
        {issue ? copy.issues[issue] : saved ? copy.done : ""}
      </p>
    </section>
  );
}
