import { useId, useMemo, useRef, useState } from "react";
import type { ChangeEvent, CSSProperties, ReactElement } from "react";
import type { LocalPackRecord } from "./packInventory";
import type { SaveTextFile } from "./recoveryExport";
import {
  PACKET_CONDITIONS, PACKET_LIMITS, PACKET_OPERATIONS, PACKET_TIERS,
  appendPacketEntry, appendPacketEvent, emptyPacket, exportPacket, filterPacketEntries,
  importPacket, mergePackets, nextPacketEntryId, nextPacketEventId,
  packetPreviewMerge, packetSummary, transitionPacketEntry,
  type PacketCondition, type PacketDocument, type PacketFilter,
  type PacketLocale, type PacketOperation, type PacketStage, type PacketTier,
} from "./recoveryEvidencePacket";
import { evidenceReport, evidenceNarrative } from "./recoveryEvidenceAnalysis";
import { recoveryEvidenceCopy } from "./recoveryEvidenceCopy";

export interface RecoveryEvidencePacketPanelProps {
  readonly locale: PacketLocale;
  readonly records: readonly LocalPackRecord[];
  readonly inspected: boolean;
  readonly saveFile?: SaveTextFile;
}
const shell: CSSProperties = {
  border: "1px solid currentColor", borderRadius: 8, marginBlock: 16,
  padding: 16, display: "grid", gap: 16, overflowWrap: "anywhere",
};
const control: CSSProperties = {
  minHeight: 44, minWidth: 44, padding: "10px 14px", font: "inherit",
};
const grid: CSSProperties = {
  display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 230px), 1fr))", gap: 12,
};
const field: CSSProperties = { display: "grid", gap: 6 };
const actions: CSSProperties = { display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center" };
const observationStyle: CSSProperties = { border: "1px solid currentColor", borderRadius: 8, padding: 12, marginBlock: 10 };
const LIMIT_VISIBLE = 80;
const day = (): string => new Date().toISOString().slice(0, 10);
const timestamp = (): string => new Date().toISOString();

export function RecoveryEvidencePacketPanel({
  locale, records, inspected, saveFile,
}: RecoveryEvidencePacketPanelProps): ReactElement {
  const heading = useId();
  const formHeading = useId();
  const listHeading = useId();
  const statusId = useId();
  const fileInput = useRef<HTMLInputElement | null>(null);
  const copy = recoveryEvidenceCopy(locale);
  const [document, setDocument] = useState<PacketDocument>(emptyPacket);
  const [staged, setStaged] = useState<PacketDocument | null>(null);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [packId, setPackId] = useState("");
  const [operation, setOperation] = useState<PacketOperation>("pack");
  const [condition, setCondition] = useState<PacketCondition>("UNKNOWN");
  const [tier, setTier] = useState<PacketTier>("UNKNOWN");
  const [sourceName, setSourceName] = useState("");
  const [licence, setLicence] = useState("");
  const [retrievedOn, setRetrievedOn] = useState(day);
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [reviewNote, setReviewNote] = useState("");
  const [byteLength, setByteLength] = useState("");
  const [digest, setDigest] = useState("");
  const [filter, setFilter] = useState<PacketFilter>({});
  const packs = useMemo(() => [...new Set(records.map((item) => item.id))].sort(), [records]);
  const summary = useMemo(() => packetSummary(document), [document]);
  const report = useMemo(() => evidenceReport(document, day()), [document]);
  const preview = useMemo(() => staged ? packetPreviewMerge(document, staged) : null, [document, staged]);
  const visible = useMemo(() => filterPacketEntries(document, filter).slice(0, LIMIT_VISIBLE), [document, filter]);
  const label = (name: string, contents: ReactElement): ReactElement => <label style={field}><span>{name}</span>{contents}</label>;

  function addObservation(): void {
    if (!inspected || !packs.includes(packId)) { setMessage(copy.inspect); return; }
    const bytes = byteLength.trim() === "" ? null : Number(byteLength);
    const result = appendPacketEntry(document, {
      id: nextPacketEntryId(document), packId, operation, stage: "draft",
      recordedAt: timestamp(),
      source: { name: sourceName, licence, retrievedOn, tier, reference },
      observation: { condition, note, bytes, digest: digest.trim() || null },
    });
    if (!result.ok) { setMessage(copy.issues[result.issue]); return; }
    setDocument(result.value);
    setNote("");
    setByteLength("");
    setDigest("");
    setCondition("UNKNOWN");
    setMessage("");
  }
  function changeStage(entryId: string, to: PacketStage): void {
    const changed = transitionPacketEntry(document, entryId, to);
    if (!changed.ok) { setMessage(copy.issues[changed.issue]); return; }
    const event = appendPacketEvent(changed.value, {
      id: nextPacketEventId(changed.value), entryId,
      action: to === "closed" ? "closed" : to === "draft" ? "reopened" : "review-requested",
      at: timestamp(), note: reviewNote,
    });
    if (!event.ok) { setMessage(copy.issues[event.issue]); return; }
    setDocument(event.value);
    setReviewNote("");
    setMessage("");
  }
  async function chooseFile(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.item(0);
    event.target.value = "";
    setStaged(null);
    if (!file) return;
    if (file.size > PACKET_LIMITS.bytes) { setMessage(copy.issues.limit); return; }
    try {
      const parsed = importPacket(await file.text());
      if (!parsed.ok) { setMessage(copy.issues[parsed.issue]); return; }
      setStaged(parsed.value);
      setMessage(copy.pending);
    } catch { setMessage(copy.failed); }
  }
  function mergeStaged(): void {
    if (!staged) return;
    const result = mergePackets(document, staged);
    if (!result.ok) { setMessage(copy.issues[result.issue]); return; }
    setDocument(result.value);
    setStaged(null);
    setMessage(copy.imported);
    fileInput.current?.focus();
  }
  async function save(): Promise<void> {
    if (!saveFile || saving) return;
    const exported = exportPacket(document);
    if (!exported.ok) { setMessage(copy.issues[exported.issue]); return; }
    setSaving(true);
    try {
      await saveFile("recovery-evidence-packet.json", exported.value);
      setMessage(copy.saved);
    } catch { setMessage(copy.failed); }
    finally { setSaving(false); }
  }
  async function saveSummary(): Promise<void> {
    if (!saveFile || saving) return;
    setSaving(true);
    try {
      await saveFile("recovery-evidence-summary.txt", evidenceNarrative(document, day(), locale));
      setMessage(copy.saved);
    } catch { setMessage(copy.failed); }
    finally { setSaving(false); }
  }
  return (
    <section lang={locale} style={shell} aria-labelledby={heading}>
      <h2 id={heading}>{copy.heading}</h2>
      <p>{copy.description}</p>
      <p>{copy.caution}</p>
      <p>{copy.warning}</p>
      <p id={statusId} role="status" aria-live="polite" aria-atomic="true">{message}</p>
      <section aria-labelledby={formHeading}>
        <h3 id={formHeading}>{copy.add}</h3>
        <div style={grid}>
          {label(copy.pack, <select style={control} value={packId} onChange={(event) => setPackId(event.target.value)} disabled={!inspected}>
            <option value="">{copy.noPack}</option>
            {packs.map((id) => <option key={id} value={id}>{id}</option>)}
          </select>)}
          {label(copy.operation, <select style={control} value={operation} onChange={(event) => setOperation(event.target.value as PacketOperation)}>
            {PACKET_OPERATIONS.map((value) => <option key={value} value={value}>{copy.operations[value]}</option>)}
          </select>)}
          {label(copy.condition, <select style={control} value={condition} onChange={(event) => setCondition(event.target.value as PacketCondition)}>
            {PACKET_CONDITIONS.map((value) => <option key={value} value={value}>{copy.conditions[value]}</option>)}
          </select>)}
          {label(copy.tier, <select style={control} value={tier} onChange={(event) => setTier(event.target.value as PacketTier)}>
            {PACKET_TIERS.map((value) => <option key={value} value={value}>{copy.tiers[value]}</option>)}
          </select>)}
          {label(copy.source, <input style={control} value={sourceName} maxLength={PACKET_LIMITS.sources} onChange={(event) => setSourceName(event.target.value)} />)}
          {label(copy.licence, <input style={control} value={licence} maxLength={PACKET_LIMITS.sources} onChange={(event) => setLicence(event.target.value)} />)}
          {label(copy.retrievedOn, <input style={control} type="date" value={retrievedOn} onChange={(event) => setRetrievedOn(event.target.value)} />)}
          {label(copy.reference, <input style={control} value={reference} maxLength={PACKET_LIMITS.sources} onChange={(event) => setReference(event.target.value)} />)}
          {label("Bytes (optional)", <input style={control} inputMode="numeric" type="number" min={0} value={byteLength} onChange={(event) => setByteLength(event.target.value)} />)}
          {label("Digest (optional)", <input style={control} value={digest} maxLength={256} onChange={(event) => setDigest(event.target.value)} />)}
          {label(copy.note, <textarea style={control} value={note} maxLength={PACKET_LIMITS.text} rows={3} onChange={(event) => setNote(event.target.value)} />)}
        </div>
        <button type="button" style={control} disabled={!inspected || !packId} onClick={addObservation}>{copy.add}</button>
      </section>
      <section aria-labelledby={listHeading}>
        <h3 id={listHeading}>{copy.entries} ({summary.total})</h3>
        <div style={actions}>
          {label(copy.action, <input style={control} value={reviewNote} maxLength={PACKET_LIMITS.text} onChange={(event) => setReviewNote(event.target.value)} />)}
          {label(copy.search, <input style={control} value={filter.text ?? ""} onChange={(event) => setFilter((old) => ({ ...old, text: event.target.value }))} />)}
          {label(copy.condition, <select style={control} value={filter.condition ?? ""} onChange={(event) => setFilter((old) => ({ ...old, condition: event.target.value ? event.target.value as PacketCondition : undefined }))}>
            <option value="">{copy.filterAll}</option>
            {PACKET_CONDITIONS.map((value) => <option key={value} value={value}>{copy.conditions[value]}</option>)}
          </select>)}
          <button type="button" style={control} onClick={() => setFilter({})}>{copy.clear}</button>
        </div>
        {document.entries.length === 0 && <p>{copy.empty}</p>}
        <p>{copy.summaries}{locale === "fr" ? "\u00a0: " : ": "}{summary.drafts} / {summary.reviews} / {summary.closed}</p>
        <p>{copy.findings}{locale === "fr" ? "\u00a0: " : ": "}{report.findings.length}</p>
        <ol>
          {visible.map((entry) => (
            <li key={entry.id} style={observationStyle}>
              <h4>{entry.packId} — {entry.id}</h4>
              <p>{copy.operation}{locale === "fr" ? "\u00a0: " : ": "}{copy.operations[entry.operation]}</p>
              <p>{copy.condition}{locale === "fr" ? "\u00a0: " : ": "}{copy.conditions[entry.observation.condition]}</p>
              <p>{copy.stage}{locale === "fr" ? "\u00a0: " : ": "}{copy.stages[entry.stage]}</p>
              <p>{copy.source}{locale === "fr" ? "\u00a0: " : ": "}{entry.source.name || "UNKNOWN"}</p>
              <p>{copy.licence}{locale === "fr" ? "\u00a0: " : ": "}{entry.source.licence || "UNKNOWN"}</p>
              <p>{copy.retrievedOn}{locale === "fr" ? "\u00a0: " : ": "}{entry.source.retrievedOn}</p>
              <p>{copy.tier}{locale === "fr" ? "\u00a0: " : ": "}{copy.tiers[entry.source.tier]}</p>
              <p>{entry.observation.note}</p>
              <div style={actions}>
                {entry.stage === "draft" && <button type="button" style={control} onClick={() => changeStage(entry.id, "review")}>{copy.review}</button>}
                {entry.stage === "review" && <button type="button" style={control} onClick={() => changeStage(entry.id, "closed")}>{copy.close}</button>}
                {entry.stage === "closed" && <button type="button" style={control} onClick={() => changeStage(entry.id, "review")}>{copy.reopen}</button>}
              </div>
            </li>
          ))}
        </ol>
      </section>
      <section aria-label={copy.import}>
        <h3>{copy.import}</h3>
        {label(copy.fileLabel, <input ref={fileInput} style={control} type="file" accept=".json,application/json" onChange={(event) => { void chooseFile(event); }} />)}
        {preview && <>
          <p>{preview.additions} + {preview.duplicates} = {preview.conflicts} conflicts</p>
          <p>{preview.eventAdditions} events; {preview.eventConflicts} event conflicts</p>
          <div style={actions}>
            <button type="button" style={control} onClick={mergeStaged} disabled={preview.conflicts > 0 || preview.eventConflicts > 0}>{copy.apply}</button>
            <button type="button" style={control} onClick={() => { setStaged(null); setMessage(""); }}>{copy.reject}</button>
          </div>
        </>}
      </section>
      <section aria-label={copy.export}>
        <div style={actions}>
          <button type="button" style={control} disabled={!saveFile || saving} onClick={() => { void save(); }}>{copy.save}</button>
          <button type="button" style={control} disabled={!saveFile || saving} onClick={() => { void saveSummary(); }}>{copy.summaries}</button>
        </div>
      </section>
    </section>
  );
}
