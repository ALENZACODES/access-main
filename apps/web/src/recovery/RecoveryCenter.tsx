import { lazy, Suspense, useEffect, useId, useMemo, useState } from "react";
import type { CSSProperties, ReactElement } from "react";
import { PackDownloadSession, downloadCopy, type DownloadSnapshot, type SessionOptions } from "./downloadSession";
import { inspectInstalledPacks, inventoryCopy, type LocalPackRecord, type LocalPackStore } from "./packInventory";
import { exportCopy, saveRecoveryExport, type RecoveryExportRecord, type SaveTextFile } from "./recoveryExport";
import type { RecoveryLocale } from "./index";
import { RecoveryNotice } from "./RecoveryNotice";
import { RecoveryWorkbench } from "./RecoveryWorkbench";
import { RecoveryQueuePanel } from "./RecoveryQueuePanel";
import { RecoveryPlanReview } from "./RecoveryPlanReview";
import { RecoveryEvidenceNotebook } from "./RecoveryEvidenceNotebook";
import { RecoveryDryRunPanel } from "./RecoveryDryRunPanel";
import { RecoveryCaseJournal } from "./RecoveryCaseJournal";
import { RecoveryTaskBoard } from "./RecoveryTaskBoard";
import { RecoveryRepairAttempts } from "./RecoveryRepairAttempts";
import { RecoveryFailureChecklist } from "./RecoveryFailureChecklist";
import { RecoveryProvenanceLedger } from "./RecoveryProvenanceLedger";
import { RecoveryHandoffPanel } from "./RecoveryHandoffPanel";
import { RecoverySessionTracePanel } from "./RecoverySessionTracePanel";
import { RecoveryCheckpointPanel } from "./RecoveryCheckpointPanel";
import { RecoveryDecisionMatrix } from "./RecoveryDecisionMatrix";
import { RecoveryTransferPreflight } from "./RecoveryTransferPreflight";
import { planPackRepairs } from "./recoveryPolicy";

const RecoveryTransferWitnessPanel = lazy(async () => ({
  default: (await import("./RecoveryTransferWitnessPanel")).RecoveryTransferWitnessPanel,
}));

/** Complete local recovery shell. No timer, automatic retry or remote transmission. */
export interface RecoveryCenterProps {
  readonly locale: RecoveryLocale;
  readonly store: LocalPackStore;
  readonly download?: SessionOptions;
  readonly saveFile?: SaveTextFile;
  readonly onPackReady?: () => void;
}
const button: CSSProperties = { minHeight: 44, minWidth: 44, font: "inherit", padding: "10px 16px", cursor: "pointer" };
const section: CSSProperties = { border: "1px solid currentColor", borderRadius: 8, padding: 16, marginBlock: 16, overflowWrap: "anywhere" };
const actions: CSSProperties = { display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" };
function formatCount(value: number, locale: RecoveryLocale): string {
  return new Intl.NumberFormat(locale === "fr" ? "fr-CA" : "en-CA").format(value);
}
function initialDownload(): DownloadSnapshot {
  return { phase: "idle", received: 0, expected: null, percent: null };
}
export function RecoveryCenter({ locale, store, download, saveFile, onPackReady }: RecoveryCenterProps): ReactElement {
  const inventoryHeading = useId();
  const transferHeading = useId();
  const exportHeading = useId();
  const [inventory, setInventory] = useState<LocalPackRecord[]>([]);
  const [previousInventory, setPreviousInventory] = useState<LocalPackRecord[] | null>(null);
  const [inspectionDate, setInspectionDate] = useState("");
  const [checking, setChecking] = useState(false);
  const [inventoryFailure, setInventoryFailure] = useState(false);
  const [hasInspected, setHasInspected] = useState(false);
  const [transfer, setTransfer] = useState<DownloadSnapshot>(initialDownload);
  const [showFailure, setShowFailure] = useState(true);
  const [exportStatus, setExportStatus] = useState<"idle" | "saving" | "saved" | "failed" | "invalid">("idle");
  const session = useMemo(() => new PackDownloadSession(), []);
  const copy = inventoryCopy(locale);
  const transferCopy = downloadCopy(locale);
  const fileCopy = exportCopy(locale);
  const policy = useMemo(() => hasInspected && !checking && !inventoryFailure
    ? planPackRepairs(inventory, { date: inspectionDate }) : null,
    [hasInspected, checking, inventoryFailure, inventory, inspectionDate]);
  useEffect(() => session.subscribe(setTransfer), [session]);
  useEffect(() => () => { session.cancel(); }, [session]);
  async function refresh(): Promise<void> {
    if (checking) return;
    setChecking(true);
    setInventoryFailure(false);
    setHasInspected(false);
    try {
      const records = await inspectInstalledPacks(store);
      setPreviousInventory(hasInspected ? inventory : null);
      setInventory(records);
      setInspectionDate(new Date().toISOString().slice(0, 10));
      setHasInspected(true);
    } catch {
      setInventory([]);
      setInventoryFailure(true);
    } finally {
      setChecking(false);
    }
  }
  async function startDownload(): Promise<void> {
    if (download === undefined || session.busy) return;
    setShowFailure(true);
    const result = await session.start(download);
    if (result.phase === "complete") {
      onPackReady?.();
      await refresh();
    }
  }
  async function exportReport(): Promise<void> {
    if (saveFile === undefined || exportStatus === "saving" || !hasInspected) return;
    setExportStatus("saving");
    const createdAt = new Date().toISOString();
    const records: RecoveryExportRecord[] = inventory.map((record) => ({
      id: record.id, packId: record.id,
      state: record.state === "ready" ? "ready" : record.state,
      ...(record.source === undefined ? {} : { source: record.source }),
      ...(record.problem === undefined ? {} : { reason: record.problem }),
      checkedAt: createdAt,
    }));
    const result = await saveRecoveryExport(records, createdAt, saveFile);
    setExportStatus(result.ok ? "saved" : result.reason === "unsafe-input" ? "invalid" : "failed");
  }
  const isActive = session.busy;
  return (
    <div lang={locale}>
      <section aria-labelledby={inventoryHeading} style={section}>
        <h2 id={inventoryHeading}>{copy.heading}</h2>
        <p>{locale === "fr" ? "Les ensembles sont contrôlés localement. Un état UNKNOWN ne signifie pas que l’ensemble est utilisable."
          : "Packs are checked locally. UNKNOWN does not mean a pack can be used."}</p>
        <button type="button" style={button} disabled={checking} onClick={() => { void refresh(); }}>{copy.refresh}</button>
        <p role="status" aria-live="polite">{checking ? copy.pending : inventoryFailure
          ? (locale === "fr" ? "État local UNKNOWN" : "Local status UNKNOWN") : ""}</p>
        {hasInspected && !checking && inventory.length === 0 && !inventoryFailure && <p>{copy.empty}</p>}
        <ul>
          {inventory.map((record) => (
            <li key={record.id} style={{ marginBlock: 12 }}>
              <strong>{record.id}</strong>{" — "}{copy.states[record.state]}
              {record.problem !== undefined && <p>{copy.problems[record.problem]}</p>}
              {record.source !== undefined && (
                <dl>
                  <dt>{copy.source}</dt><dd>{record.source.name}</dd>
                  <dt>{copy.licence}</dt><dd>{record.source.licence}</dd>
                  <dt>{copy.date}</dt><dd>{record.source.date}</dd>
                </dl>
              )}
              {record.byteLength !== undefined && <p>{copy.size}{locale === "fr" ? "\u00a0: " : ": "}{formatCount(record.byteLength, locale)}</p>}
            </li>
          ))}
        </ul>
      </section>
      <RecoveryWorkbench locale={locale} records={inventory} previous={previousInventory}
        inspected={hasInspected && !checking && !inventoryFailure} inspectionDate={inspectionDate}
        onInspect={() => { void refresh(); }} />
      {hasInspected && !checking && !inventoryFailure && (
        <RecoveryQueuePanel locale={locale} records={inventory}
          inspected={hasInspected && !checking && !inventoryFailure}
          inspectionDate={inspectionDate} onInspect={() => { void refresh(); }} saveFile={saveFile} />
      )}
      <RecoveryPlanReview locale={locale} current={policy}
        inspected={hasInspected && !checking && !inventoryFailure}
        onInspect={() => { void refresh(); }} saveFile={saveFile} />
      <RecoveryEvidenceNotebook locale={locale} saveFile={saveFile} />
      <RecoveryDryRunPanel locale={locale} records={inventory} inspectionDate={inspectionDate}
        inspected={hasInspected && !checking && !inventoryFailure} saveFile={saveFile} />
      <RecoveryCaseJournal locale={locale} records={inventory}
        inspected={hasInspected && !checking && !inventoryFailure} saveFile={saveFile} />
      <RecoveryTaskBoard locale={locale} records={inventory} saveFile={saveFile} />
      <RecoveryRepairAttempts locale={locale} records={inventory}
        inspected={hasInspected && !checking && !inventoryFailure} saveFile={saveFile} />
      <RecoveryTransferPreflight locale={locale} records={inventory}
        inspected={hasInspected && !checking && !inventoryFailure} saveFile={saveFile} />
      <RecoveryFailureChecklist locale={locale} records={inventory}
        inspected={hasInspected && !checking && !inventoryFailure} saveFile={saveFile} />
      <RecoveryProvenanceLedger locale={locale} records={inventory}
        inspected={hasInspected && !checking && !inventoryFailure} saveFile={saveFile} />
      <RecoveryHandoffPanel locale={locale} records={inventory}
        inspected={hasInspected && !checking && !inventoryFailure} saveFile={saveFile} />
      <RecoverySessionTracePanel locale={locale} records={inventory}
        inspected={hasInspected && !checking && !inventoryFailure} saveFile={saveFile} />
      <RecoveryCheckpointPanel locale={locale} records={inventory}
        inspected={hasInspected && !checking && !inventoryFailure} saveFile={saveFile} />
      <RecoveryDecisionMatrix locale={locale} records={inventory}
        inspected={hasInspected && !checking && !inventoryFailure} saveFile={saveFile} />
      <Suspense fallback={<p role="status" aria-live="polite">{locale === "fr" ? "Chargement du registre local…" : "Loading local register…"}</p>}>
      <RecoveryTransferWitnessPanel locale={locale} records={inventory}
        inspected={hasInspected && !checking && !inventoryFailure} saveFile={saveFile} />
      </Suspense>
      {download !== undefined && (
        <section aria-labelledby={transferHeading} style={section} aria-busy={isActive}>
          <h2 id={transferHeading}>{transferCopy.heading}</h2>
          <p>{transferCopy.warning}</p>
          <p role="status" aria-live="polite" aria-atomic="true">{transferCopy.phases[transfer.phase]}</p>
          <p>{transferCopy.received}{locale === "fr" ? "\u00a0: " : ": "}
            {formatCount(transfer.received, locale)} {transferCopy.bytes}
            {transfer.expected === null ? "" : ` ${transferCopy.of} ${formatCount(transfer.expected, locale)}`}</p>
          {transfer.expected !== null && (
            <progress max={transfer.expected === 0 ? 1 : transfer.expected} value={transfer.received}
              aria-label={locale === "fr" ? "Progression du téléchargement" : "Download progress"} />
          )}
          {showFailure && transfer.phase === "failed" && transfer.failure !== undefined && (
            <RecoveryNotice failure={{ operation: "download", reason: transfer.failure }} locale={locale}
              onRetry={() => { void startDownload(); }} onDismiss={() => { setShowFailure(false); }} />
          )}
          <div style={actions}>
            <button type="button" style={button} disabled={isActive} onClick={() => { void startDownload(); }}>
              {transfer.phase === "idle" ? transferCopy.begin : transferCopy.again}</button>
            {isActive && <button type="button" style={button} onClick={() => { session.cancel(); }}>{transferCopy.cancel}</button>}
          </div>
        </section>
      )}
      {saveFile !== undefined && (
        <section aria-labelledby={exportHeading} style={section}>
          <h2 id={exportHeading}>{fileCopy.heading}</h2>
          <p>{fileCopy.description}</p>
          <button type="button" style={button}
            disabled={exportStatus === "saving" || checking || inventoryFailure || !hasInspected}
            onClick={() => { void exportReport(); }}>{fileCopy.action}</button>
          <p role="status" aria-live="polite">{exportStatus === "saved" ? fileCopy.done :
            exportStatus === "failed" ? fileCopy.failed : exportStatus === "invalid" ? fileCopy.invalid : ""}</p>
        </section>
      )}
    </div>
  );
}
