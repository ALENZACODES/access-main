import { useId, useMemo, useRef, useState } from "react";
import type { ChangeEvent, CSSProperties, ReactElement } from "react";
import type { LocalPackRecord } from "./packInventory";
import type { SaveTextFile } from "./recoveryExport";
import {
  CHAIN_ACTIONS, CHAIN_LIMITS, CHAIN_ROLES, CHAIN_STATES, CHAIN_TIERS,
  appendChainEvent, appendChainLink, appendChainNode, changeChainPhase,
  chainSummary, emptyChain, filterChainNodes, mergeChainDocuments,
  nextChainId, parseChain, previewChainMerge, serializeChain,
  type ChainAction, type ChainDocument, type ChainLocale, type ChainRole,
  type ChainState, type ChainTier,
} from "./recoveryHandoffChain";
import { chainNarrative, chainReport } from "./recoveryHandoffChainAnalysis";
import { recoveryHandoffChainCopy } from "./recoveryHandoffChainCopy";

export interface RecoveryHandoffChainPanelProps {
  readonly locale: ChainLocale;
  readonly records: readonly LocalPackRecord[];
  readonly inspected: boolean;
  readonly saveFile?: SaveTextFile;
}
const frame: CSSProperties = { border: "1px solid currentColor", borderRadius: 8, padding: 16, marginBlock: 16, display: "grid", gap: 14, overflowWrap: "anywhere" };
const row: CSSProperties = { display: "flex", gap: 12, flexWrap: "wrap", alignItems: "end" };
const field: CSSProperties = { display: "grid", gap: 4, minWidth: 170, flex: "1 1 170px" };
const touch: CSSProperties = { minHeight: 44, minWidth: 44, font: "inherit", padding: "10px 12px" };
const recordStyle: CSSProperties = { border: "1px solid currentColor", borderRadius: 6, padding: 12, marginBlock: 8 };
const displayedLimit = 80;

/** Only explicit user input changes the local session document. */
export function RecoveryHandoffChainPanel({ locale, records, inspected, saveFile }: RecoveryHandoffChainPanelProps): ReactElement {
  const heading = useId();
  const listHeading = useId();
  const summaryHeading = useId();
  const fileInput = useRef<HTMLInputElement | null>(null);
  const copy = recoveryHandoffChainCopy(locale);
  const [document, setDocument] = useState<ChainDocument>(emptyChain);
  const [staged, setStaged] = useState<ChainDocument | null>(null);
  const [packId, setPackId] = useState("");
  const [stepTitle, setStepTitle] = useState("");
  const [role, setRole] = useState<ChainRole>("origin");
  const [state, setState] = useState<ChainState>("UNKNOWN");
  const [note, setNote] = useState("");
  const [sourceName, setSourceName] = useState("");
  const [licence, setLicence] = useState("");
  const [retrievedOn, setRetrievedOn] = useState("");
  const [tier, setTier] = useState<ChainTier>("UNKNOWN");
  const [reference, setReference] = useState("");
  const [fromId, setFromId] = useState("");
  const [toId, setToId] = useState("");
  const [eventNode, setEventNode] = useState("");
  const [action, setAction] = useState<ChainAction>("noted");
  const [filter, setFilter] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const packs = useMemo(() => [...new Set(records.map((item) => item.id))].sort(), [records]);
  const availableNodes = useMemo(() => document.nodes.filter((item) => item.packId === packId), [document, packId]);
  const visible = useMemo(() => filterChainNodes(document, { text: filter }).slice(0, displayedLimit), [document, filter]);
  const summary = useMemo(() => chainSummary(document), [document]);
  const report = useMemo(() => chainReport(document, new Date().toISOString().slice(0, 10)), [document]);
  const preview = useMemo(() => staged ? previewChainMerge(document, staged) : null, [document, staged]);
  const number = (value: number): string => new Intl.NumberFormat(locale === "fr" ? "fr-CA" : "en-CA").format(value);
  const sep = locale === "fr" ? "\u00a0: " : ": ";
  const source = () => ({ name: sourceName, licence, retrievedOn, tier, reference });
  const at = () => new Date().toISOString();

  function addStep(): void {
    if (!inspected || !packs.includes(packId)) { setMessage(copy.inspect); return; }
    const result = appendChainNode(document, {
      id: nextChainId(document, "node"), packId, title: stepTitle,
      role, state, phase: "draft", note, recordedAt: at(), source: source(),
    });
    if (!result.ok) { setMessage(copy.issues[result.issue]); return; }
    setDocument(result.value);
    setStepTitle("");
    setNote("");
    setState("UNKNOWN");
    setMessage("");
  }
  function addLink(): void {
    if (!inspected || !packs.includes(packId)) { setMessage(copy.inspect); return; }
    const result = appendChainLink(document, {
      id: nextChainId(document, "link"), fromId, toId, state, note,
      recordedAt: at(), source: source(),
    });
    if (!result.ok) { setMessage(copy.issues[result.issue]); return; }
    setDocument(result.value);
    setFromId(""); setToId(""); setNote(""); setMessage("");
  }
  function recordEvent(): void {
    if (!inspected || !packs.includes(packId)) { setMessage(copy.inspect); return; }
    const result = appendChainEvent(document, {
      id: nextChainId(document, "event"), nodeId: eventNode, action,
      note, at: at(), source: source(),
    });
    if (!result.ok) { setMessage(copy.issues[result.issue]); return; }
    setDocument(result.value);
    setEventNode(""); setNote(""); setMessage("");
  }
  function markReview(nodeId: string, phase: "review" | "closed"): void {
    const result = changeChainPhase(document, nodeId, phase);
    if (!result.ok) { setMessage(copy.issues[result.issue]); return; }
    setDocument(result.value); setMessage("");
  }
  async function chooseFile(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.item(0);
    event.target.value = "";
    setStaged(null);
    if (!file) return;
    if (file.size > CHAIN_LIMITS.bytes) { setMessage(copy.issues.limit); return; }
    setMessage(copy.pending);
    try {
      const parsed = parseChain(await file.text());
      if (!parsed.ok) { setMessage(copy.issues[parsed.issue]); return; }
      setStaged(parsed.value);
      setMessage("");
    } catch { setMessage(copy.failed); }
  }
  function applyImport(): void {
    if (!staged) return;
    const merged = mergeChainDocuments(document, staged);
    if (!merged.ok) { setMessage(copy.issues[merged.issue]); return; }
    setDocument(merged.value);
    setStaged(null);
    setMessage("");
    fileInput.current?.focus();
  }
  async function saveJson(): Promise<void> {
    if (!saveFile || busy) return;
    const payload = serializeChain(document);
    if (!payload.ok) { setMessage(copy.issues[payload.issue]); return; }
    setBusy(true);
    try { await saveFile("recovery-handoff-chain.json", payload.value); setMessage(copy.saved); }
    catch { setMessage(copy.failed); }
    finally { setBusy(false); }
  }
  async function saveText(): Promise<void> {
    if (!saveFile || busy) return;
    setBusy(true);
    try { await saveFile("recovery-handoff-chain.txt", chainNarrative(document, new Date().toISOString().slice(0, 10), locale)); setMessage(copy.saved); }
    catch { setMessage(copy.failed); }
    finally { setBusy(false); }
  }

  return (
    <section style={frame} aria-labelledby={heading} lang={locale}>
      <h2 id={heading}>{copy.heading}</h2>
      <p>{copy.introduction}</p>
      <p>{copy.warning}</p>
      <fieldset disabled={!inspected} style={{ border: "1px solid currentColor", padding: 12 }}>
        <legend>{copy.newStep}</legend>
        <div style={row}>
          <label style={field}>{copy.pack}
            <select style={touch} value={packId} onChange={(event) => setPackId(event.target.value)}>
              <option value="">{copy.all}</option>
              {packs.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>
          <label style={field}>{copy.title}
            <input style={touch} value={stepTitle} maxLength={200} onChange={(event) => setStepTitle(event.target.value)} />
          </label>
          <label style={field}>{copy.role}
            <select style={touch} value={role} onChange={(event) => setRole(event.target.value as ChainRole)}>
              {CHAIN_ROLES.map((item) => <option key={item} value={item}>{copy.roles[item]}</option>)}
            </select>
          </label>
          <label style={field}>{copy.state}
            <select style={touch} value={state} onChange={(event) => setState(event.target.value as ChainState)}>
              {CHAIN_STATES.map((item) => <option key={item} value={item}>{copy.states[item]}</option>)}
            </select>
          </label>
        </div>
        <div style={row}>
          <label style={field}>{copy.source}
            <input style={touch} value={sourceName} maxLength={200} onChange={(event) => setSourceName(event.target.value)} />
          </label>
          <label style={field}>{copy.licence}
            <input style={touch} value={licence} maxLength={200} onChange={(event) => setLicence(event.target.value)} />
          </label>
          <label style={field}>{copy.retrievedOn}
            <input style={touch} type="date" value={retrievedOn} onChange={(event) => setRetrievedOn(event.target.value)} />
          </label>
          <label style={field}>{copy.tier}
            <select style={touch} value={tier} onChange={(event) => setTier(event.target.value as ChainTier)}>
              {CHAIN_TIERS.map((item) => <option key={item} value={item}>{copy.tiers[item]}</option>)}
            </select>
          </label>
          <label style={field}>{copy.reference}
            <input style={touch} value={reference} maxLength={CHAIN_LIMITS.references} onChange={(event) => setReference(event.target.value)} />
          </label>
        </div>
        <label style={field}>{copy.note}
          <textarea style={touch} value={note} maxLength={CHAIN_LIMITS.text} onChange={(event) => setNote(event.target.value)} />
        </label>
        <div style={row}>
          <button style={touch} type="button" onClick={addStep}>{copy.newStep}</button>
          <label style={field}>{copy.from}
            <select style={touch} value={fromId} onChange={(event) => setFromId(event.target.value)}>
              <option value="">{copy.all}</option>
              {availableNodes.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
            </select>
          </label>
          <label style={field}>{copy.to}
            <select style={touch} value={toId} onChange={(event) => setToId(event.target.value)}>
              <option value="">{copy.all}</option>
              {availableNodes.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
            </select>
          </label>
          <button type="button" style={touch} onClick={addLink}>{copy.newLink}</button>
        </div>
        <div style={row}>
          <label style={field}>{copy.node}
            <select style={touch} value={eventNode} onChange={(event) => setEventNode(event.target.value)}>
              <option value="">{copy.all}</option>
              {availableNodes.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
            </select>
          </label>
          <label style={field}>{copy.action}
            <select style={touch} value={action} onChange={(event) => setAction(event.target.value as ChainAction)}>
              {CHAIN_ACTIONS.map((item) => <option key={item} value={item}>{copy.actions[item]}</option>)}
            </select>
          </label>
          <button type="button" style={touch} onClick={recordEvent}>{copy.newEvent}</button>
        </div>
      </fieldset>
      {!inspected && <p>{copy.inspect}</p>}
      {inspected && packs.length === 0 && <p>{copy.noPacks}</p>}
      <section aria-labelledby={summaryHeading}>
        <h3 id={summaryHeading}>{copy.summary}</h3>
        <p>{copy.steps}{sep}{number(summary.nodes)} · {copy.links}{sep}{number(summary.links)} · {copy.packs}{sep}{number(summary.packs)}</p>
        <p>{copy.unknown}{sep}{number(summary.unknown)} · {copy.disputed}{sep}{number(summary.disputed)} · {copy.unresolved}{sep}{number(summary.unresolved)}</p>
        <p>{copy.contentDisclaimer}</p>
        <p>{copy.review}{sep}{number(report.findings.length)}</p>
      </section>
      <section aria-labelledby={listHeading}>
        <h3 id={listHeading}>{copy.steps}</h3>
        <label style={field}>{copy.find}
          <input style={touch} value={filter} onChange={(event) => setFilter(event.target.value)} />
        </label>
        {visible.length === 0 && <p>{copy.empty}</p>}
        <ul>
          {visible.map((item) => (
            <li key={item.id} style={recordStyle}>
              <strong>{item.title}</strong> — {item.packId}
              <p>{copy.role}{sep}{copy.roles[item.role]} · {copy.state}{sep}{copy.states[item.state]}</p>
              <p>{copy.phase}{sep}{copy.phases[item.phase]}</p>
              <p>{copy.source}{sep}{item.source.name || "UNKNOWN"}</p>
              <p>{copy.licence}{sep}{item.source.licence || "UNKNOWN"}</p>
              <p>{copy.retrievedOn}{sep}{item.source.retrievedOn}</p>
              <p>{copy.tier}{sep}{copy.tiers[item.source.tier]}</p>
              {item.note && <p>{item.note}</p>}
              {item.phase === "draft" && <button type="button" style={touch} onClick={() => markReview(item.id, "review")}>{copy.phases.review}</button>}
              {item.phase === "review" && <button type="button" style={touch} onClick={() => markReview(item.id, "closed")}>{copy.phases.closed}</button>}
              {item.phase === "closed" && <button type="button" style={touch} onClick={() => markReview(item.id, "review")}>{copy.actions.reopened}</button>}
            </li>
          ))}
        </ul>
      </section>
      <div style={row}>
        <label style={field}>{copy.open}
          <input ref={fileInput} style={touch} type="file" accept=".json,application/json" onChange={(event) => { void chooseFile(event); }} />
        </label>
        <button type="button" style={touch} onClick={() => { void saveJson(); }} disabled={!saveFile || busy}>{copy.save}</button>
        <button type="button" style={touch} onClick={() => { void saveText(); }} disabled={!saveFile || busy}>{copy.summary}</button>
      </div>
      {staged && preview && (
        <div style={recordStyle}>
          <p>{copy.merge}{sep}{number(preview.nodesAdded + preview.linksAdded + preview.eventsAdded)}</p>
          <p>{copy.conflict}{sep}{number(preview.nodeConflicts + preview.linkConflicts + preview.eventConflicts)}</p>
          <button type="button" style={touch} disabled={preview.nodeConflicts + preview.linkConflicts + preview.eventConflicts > 0} onClick={applyImport}>{copy.apply}</button>
          <button type="button" style={touch} onClick={() => setStaged(null)}>{copy.cancel}</button>
        </div>
      )}
      <p role="status" aria-live="polite" aria-atomic="true">{message}</p>
    </section>
  );
}
