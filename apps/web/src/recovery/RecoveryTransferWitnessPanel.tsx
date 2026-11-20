import { useId, useMemo, useRef, useState } from "react";
import type { ChangeEvent, CSSProperties, ReactElement } from "react";
import type { LocalPackRecord } from "./packInventory";
import type { SaveTextFile } from "./recoveryExport";
import {
  WITNESS_CHANNELS, WITNESS_CONDITIONS, WITNESS_KINDS, WITNESS_LIMITS,
  WITNESS_PHASES, WITNESS_TIERS, appendWitnessEvent, appendWitnessTransfer,
  emptyWitnessDocument, filterWitnessTransfers, mergeWitnessDocuments,
  nextWitnessId, parseWitnessDocument, previewWitnessMerge,
  serializeWitnessDocument, summarizeWitnessDocument, witnessEventsFor,
  type WitnessAction, type WitnessChannel, type WitnessCondition,
  type WitnessDocument, type WitnessKind, type WitnessPhase,
  type WitnessSource, type WitnessTier,
} from "./recoveryTransferWitness";
import { witnessFindings, witnessTextReport } from "./recoveryTransferWitnessAnalysis";
import { recoveryTransferWitnessCopy } from "./recoveryTransferWitnessCopy";

export interface RecoveryTransferWitnessPanelProps {
  readonly locale: "en" | "fr";
  readonly records: readonly LocalPackRecord[];
  readonly inspected: boolean;
  readonly saveFile?: SaveTextFile;
}
const frame: CSSProperties = {
  border: "1px solid currentColor", borderRadius: 8, padding: 16, marginBlock: 16,
  display: "grid", gap: 14, overflowWrap: "anywhere",
};
const touch: CSSProperties = { minHeight: 44, minWidth: 44, padding: "10px 14px", font: "inherit" };
const row: CSSProperties = { display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12 };
const field: CSSProperties = { display: "grid", gap: 4, flex: "1 1 170px", minWidth: 170 };
const card: CSSProperties = { border: "1px solid currentColor", padding: 12, borderRadius: 8, marginBlock: 8 };
const MAX_VISIBLE = 100;

export function RecoveryTransferWitnessPanel({
  locale, records, inspected, saveFile,
}: RecoveryTransferWitnessPanelProps): ReactElement {
  const heading = useId();
  const listHeading = useId();
  const formHeading = useId();
  const filesHeading = useId();
  const messageId = useId();
  const chooser = useRef<HTMLInputElement | null>(null);
  const copy = recoveryTransferWitnessCopy(locale);
  const [document, setDocument] = useState<WitnessDocument>(emptyWitnessDocument);
  const [staged, setStaged] = useState<WitnessDocument | null>(null);
  const [packId, setPackId] = useState("");
  const [label, setLabel] = useState("");
  const [kind, setKind] = useState<WitnessKind>("recovery-report");
  const [channel, setChannel] = useState<WitnessChannel>("UNKNOWN");
  const [condition, setCondition] = useState<WitnessCondition>("UNKNOWN");
  const [sourceName, setSourceName] = useState("");
  const [licence, setLicence] = useState("");
  const [retrievedOn, setRetrievedOn] = useState("");
  const [tier, setTier] = useState<WitnessTier>("UNKNOWN");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [reportedBytes, setReportedBytes] = useState("");
  const [suppliedDigest, setSuppliedDigest] = useState("");
  const [eventTransfer, setEventTransfer] = useState("");
  const [action, setAction] = useState<WitnessAction>("note");
  const [eventNote, setEventNote] = useState("");
  const [search, setSearch] = useState("");
  const [phaseFilter, setPhaseFilter] = useState<WitnessPhase | "all">("all");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const packs = useMemo(() => [...new Set(records.map((item) => item.id))].sort(), [records]);
  const summary = useMemo(() => summarizeWitnessDocument(document), [document]);
  const visible = useMemo(() => filterWitnessTransfers(document, {
    query: search, ...(phaseFilter === "all" ? {} : { phase: phaseFilter }),
  }).slice(0, MAX_VISIBLE), [document, phaseFilter, search]);
  const preview = useMemo(() => staged ? previewWitnessMerge(document, staged) : null, [document, staged]);
  const findings = useMemo(() => witnessFindings(document, new Date().toISOString().slice(0, 10)), [document]);
  const canAdd = inspected && packs.includes(packId);
  const provenance = (): WitnessSource => ({
    name: sourceName, licence, retrievedOn, tier, reference,
  });
  const now = (): string => new Date().toISOString();

  function addTransfer(): void {
    if (!canAdd) { setMessage(copy.noPacks); return; }
    const numeric = reportedBytes.trim() ? Number(reportedBytes) : null;
    const result = appendWitnessTransfer(document, {
      id: nextWitnessId(document, "transfer"), packId, label, kind, channel,
      condition, phase: "draft", recordedAt: now(), source: provenance(), note,
      suppliedDigest: suppliedDigest.trim() || null, suppliedBytes: numeric,
    });
    if (!result.ok) { setMessage(copy.issues[result.issue]); return; }
    setDocument(result.value);
    setLabel("");
    setNote("");
    setReportedBytes("");
    setSuppliedDigest("");
    setCondition("UNKNOWN");
    setMessage("");
  }
  function addEvent(): void {
    const result = appendWitnessEvent(document, {
      id: nextWitnessId(document, "event"), transferId: eventTransfer,
      action, at: now(), note: eventNote, source: provenance(),
    });
    if (!result.ok) { setMessage(copy.issues[result.issue]); return; }
    setDocument(result.value);
    setEventNote("");
    setMessage("");
  }
  async function chooseFile(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.item(0);
    event.target.value = "";
    setStaged(null);
    if (!file) return;
    if (file.size > WITNESS_LIMITS.bytes) { setMessage(copy.issues.size); return; }
    setMessage(copy.pending);
    try {
      const parsed = parseWitnessDocument(await file.text());
      if (!parsed.ok) { setMessage(copy.issues[parsed.issue]); return; }
      setStaged(parsed.value);
      setMessage(copy.staged);
    } catch { setMessage(copy.failed); }
  }
  function merge(): void {
    if (!staged) return;
    const result = mergeWitnessDocuments(document, staged);
    if (!result.ok) { setMessage(copy.issues[result.issue]); return; }
    setDocument(result.value);
    setStaged(null);
    setMessage(copy.merged);
    chooser.current?.focus();
  }
  async function save(type: "json" | "text"): Promise<void> {
    if (!saveFile || saving) return;
    const payload = type === "json" ? serializeWitnessDocument(document) :
      { ok: true as const, value: witnessTextReport(document, new Date().toISOString().slice(0, 10), locale) };
    if (!payload.ok) { setMessage(copy.issues[payload.issue]); return; }
    setSaving(true);
    try {
      await saveFile(type === "json" ? "recovery-transfer-witness.json" : "recovery-transfer-witness.txt", payload.value);
      setMessage(copy.saved);
    } catch { setMessage(copy.failed); }
    finally { setSaving(false); }
  }

  return (
    <section style={frame} aria-labelledby={heading} lang={locale}>
      <h2 id={heading}>{copy.heading}</h2>
      <p>{copy.introduction}</p>
      <p>{copy.caution}</p>
      <p role="status" aria-live="polite" aria-atomic="true" id={messageId}>{message}</p>
      <p>{copy.entries}{locale === "fr" ? "\u00a0: " : ": "}{summary.total}{" · "}{copy.events}{locale === "fr" ? "\u00a0: " : ": "}{summary.events}</p>
      {!inspected && <p>{copy.noPacks}</p>}
      <fieldset style={frame} aria-labelledby={formHeading}>
        <legend id={formHeading}>{copy.add}</legend>
        <div style={row}>
          <label style={field}>{copy.packId}
            <select style={touch} value={packId} onChange={(event) => setPackId(event.target.value)} disabled={!inspected}>
              <option value="">{copy.unknown}</option>
              {packs.map((id) => <option key={id} value={id}>{id}</option>)}
            </select>
          </label>
          <label style={field}>{copy.label}
            <input style={touch} value={label} maxLength={WITNESS_LIMITS.label} onChange={(event) => setLabel(event.target.value)} />
          </label>
          <label style={field}>{copy.kind}
            <select style={touch} value={kind} onChange={(event) => setKind(event.target.value as WitnessKind)}>
              {WITNESS_KINDS.map((value) => <option key={value} value={value}>{copy.kinds[value]}</option>)}
            </select>
          </label>
          <label style={field}>{copy.channel}
            <select style={touch} value={channel} onChange={(event) => setChannel(event.target.value as WitnessChannel)}>
              {WITNESS_CHANNELS.map((value) => <option key={value} value={value}>{copy.channels[value]}</option>)}
            </select>
          </label>
          <label style={field}>{copy.condition}
            <select style={touch} value={condition} onChange={(event) => setCondition(event.target.value as WitnessCondition)}>
              {WITNESS_CONDITIONS.map((value) => <option key={value} value={value}>{copy.conditionNames[value]}</option>)}
            </select>
          </label>
        </div>
        <h3>{copy.sourceHeading}</h3>
        <div style={row}>
          <label style={field}>{copy.source}<input style={touch} value={sourceName} maxLength={WITNESS_LIMITS.label} onChange={(event) => setSourceName(event.target.value)} /></label>
          <label style={field}>{copy.licence}<input style={touch} value={licence} maxLength={WITNESS_LIMITS.label} onChange={(event) => setLicence(event.target.value)} /></label>
          <label style={field}>{copy.retrievedOn}<input style={touch} type="date" value={retrievedOn} onChange={(event) => setRetrievedOn(event.target.value)} /></label>
          <label style={field}>{copy.tier}
            <select style={touch} value={tier} onChange={(event) => setTier(event.target.value as WitnessTier)}>
              {WITNESS_TIERS.map((value) => <option key={value} value={value}>{copy.tiers[value]}</option>)}
            </select>
          </label>
          <label style={field}>{copy.reference}<input style={touch} value={reference} maxLength={WITNESS_LIMITS.label} onChange={(event) => setReference(event.target.value)} /></label>
        </div>
        <div style={row}>
          <label style={field}>{copy.bytes}<input style={touch} type="number" min="0" value={reportedBytes} onChange={(event) => setReportedBytes(event.target.value)} /></label>
          <label style={field}>{copy.digest}<input style={touch} value={suppliedDigest} maxLength={WITNESS_LIMITS.label} onChange={(event) => setSuppliedDigest(event.target.value)} /></label>
        </div>
        <label style={field}>{copy.note}<textarea style={touch} value={note} maxLength={WITNESS_LIMITS.note} onChange={(event) => setNote(event.target.value)} /></label>
        <button type="button" style={touch} disabled={!canAdd} onClick={addTransfer}>{copy.add}</button>
      </fieldset>
      <fieldset style={frame}>
        <legend>{copy.action}</legend>
        <div style={row}>
          <label style={field}>{copy.entries}
            <select style={touch} value={eventTransfer} onChange={(event) => setEventTransfer(event.target.value)}>
              <option value="">{copy.unknown}</option>
              {document.transfers.map((item) => <option key={item.id} value={item.id}>{item.label} ({item.id})</option>)}
            </select>
          </label>
          <label style={field}>{copy.action}
            <select style={touch} value={action} onChange={(event) => setAction(event.target.value as WitnessAction)}>
              {(["note", "offered", "acknowledged", "disputed", "withdrawn", "reopened"] as const)
                .map((value) => <option value={value} key={value}>{copy.actions[value]}</option>)}
            </select>
          </label>
          <label style={field}>{copy.reviewNote}<input style={touch} value={eventNote} maxLength={WITNESS_LIMITS.note} onChange={(event) => setEventNote(event.target.value)} /></label>
          <button type="button" style={touch} disabled={!eventTransfer} onClick={addEvent}>{copy.record}</button>
        </div>
      </fieldset>
      <section aria-labelledby={filesHeading} style={frame}>
        <h3 id={filesHeading}>{copy.files}</h3>
        <label style={field}>{copy.open}
          <input ref={chooser} style={touch} type="file" accept=".json,application/json" onChange={(event) => { void chooseFile(event); }} />
        </label>
        {staged && preview && <div>
          <p>{copy.importWarning}</p>
          <p>{copy.entries}{locale === "fr" ? "\u00a0: " : ": "}{preview.added} / {preview.conflicts.length}</p>
          <p>{copy.events}{locale === "fr" ? "\u00a0: " : ": "}{preview.addedEvents} / {preview.eventConflicts.length}</p>
          <button type="button" style={touch} disabled={preview.conflicts.length > 0 || preview.eventConflicts.length > 0} onClick={merge}>{copy.merge}</button>
          <button type="button" style={touch} onClick={() => setStaged(null)}>{copy.cancel}</button>
        </div>}
        <div style={row}>
          <button type="button" style={touch} disabled={!saveFile || saving} onClick={() => { void save("json"); }}>{copy.export}</button>
          <button type="button" style={touch} disabled={!saveFile || saving} onClick={() => { void save("text"); }}>{copy.report}</button>
        </div>
      </section>
      <section aria-labelledby={listHeading}>
        <h3 id={listHeading}>{copy.entries}</h3>
        <div style={row}>
          <label style={field}>{copy.search}<input style={touch} value={search} onChange={(event) => setSearch(event.target.value)} /></label>
          <label style={field}>{copy.filter}
            <select style={touch} value={phaseFilter} onChange={(event) => setPhaseFilter(event.target.value as WitnessPhase | "all")}>
              <option value="all">{copy.all}</option>
              {WITNESS_PHASES.map((value) => <option value={value} key={value}>{copy.phases[value]}</option>)}
            </select>
          </label>
          <button type="button" style={touch} onClick={() => setSearch("")}>{copy.clear}</button>
        </div>
        {visible.length === 0 && <p>{copy.empty}</p>}
        <ul>
          {visible.map((item) => <li key={item.id} style={card}>
            <strong>{item.label}</strong> ({item.id})
            <dl>
              <dt>{copy.packId}</dt><dd>{item.packId}</dd>
              <dt>{copy.phase}</dt><dd>{copy.phases[item.phase]}</dd>
              <dt>{copy.condition}</dt><dd>{copy.conditionNames[item.condition]}</dd>
              <dt>{copy.channel}</dt><dd>{copy.channels[item.channel]}</dd>
              <dt>{copy.source}</dt><dd>{item.source.name}</dd>
              <dt>{copy.licence}</dt><dd>{item.source.licence}</dd>
              <dt>{copy.retrievedOn}</dt><dd>{item.source.retrievedOn}</dd>
              <dt>{copy.tier}</dt><dd>{copy.tiers[item.source.tier]}</dd>
              <dt>{copy.reference}</dt><dd>{item.source.reference}</dd>
            </dl>
            <p>{item.note}</p>
            <ul>{witnessEventsFor(document, item.id).map((event) =>
              <li key={event.id}>{event.at}{" — "}{copy.actions[event.action]}{" — "}{event.note}</li>)}</ul>
          </li>)}
        </ul>
      </section>
      {findings.length > 0 && <section aria-label={copy.issuesHeading}>
        <h3>{copy.issuesHeading}</h3>
        <ul>{findings.slice(0, MAX_VISIBLE).map((finding, index) =>
          <li key={`${finding.transferId}-${finding.code}-${index}`}>{finding.transferId}{" — "}{finding.detail}</li>)}</ul>
      </section>}
    </section>
  );
}
