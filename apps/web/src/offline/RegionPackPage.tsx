import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { createPackSource, PackClientError, type PackManifest, type PackSource, type RegionStatus } from "../../../../packages/data-client/src/index.ts";
import { CommunicationCardsLauncher } from "./communicationCards/CommunicationCardsLauncher";
import { PersonalOfflineTools } from "./PersonalOfflineTools";
import { offlineCatalog } from "./catalog.ts";
import {
  cellStatusText,
  cellSummaryText,
  createIndexedDbLedger,
  createPackCellStore,
  downloadRegion as downloadRegionCells,
  downloadResultText,
  mountStoragePressurePanel,
  OFFLINE_STRINGS,
  regionCellReport,
  regionManifestFor,
  type CellReport,
  type DownloadResult,
  type StorageEstimate,
  pressureView,
} from "./robust/index.ts";
import { checkStoredPackParts, classifyPackDownloadError, CorruptPackNotice, RecoveryNotice, packIntegrityCopy, redownloadPack, type RecoveryFailure } from "../recovery/index.ts";
import { RecoveryCenter } from "../recovery/RecoveryCenter.tsx";
import type { LocalPackStore } from "../recovery/packInventory.ts";
import { useDocumentTitle } from "../shell/useDocumentTitle.ts";
import { useOnline } from "../shell/useOnline.ts";
import { StateNotice, getRouteEmpty, getRouteError } from "../states/index.ts";

const defaultSource = createPackSource({ baseUrl: `${import.meta.env.BASE_URL}data/` });
const ledger = createIndexedDbLedger();

function localRecoveryStore(source: PackSource): LocalPackStore {
  return {
    async listIds() {
      return (await source.regions()).map((item) => item.id);
    },
    async read(id) {
      const region = (await source.regions()).find((item) => item.id === id);
      if (!region || !region.downloaded) return null;
      // Parsed storage status does not expose compressed bytes or an independent digest.
      // A downloaded flag alone cannot establish pack integrity.
      return { id, manifest: null, bytes: null };
    },
  };
}

const estimateStorage = async (): Promise<StorageEstimate> => (await globalThis.navigator?.storage?.estimate?.()) ?? {};

/** Per-cell report for every region; a region whose manifest cannot be read reads UNKNOWN cell by cell. */
async function cellReports(pack: PackManifest, statuses: RegionStatus[]): Promise<Record<string, readonly CellReport[]>> {
  const reports: Record<string, readonly CellReport[]> = {};
  for (const region of statuses) {
    try {
      const manifest = regionManifestFor(pack, region.id);
      reports[region.id] = await regionCellReport(manifest, createPackCellStore({ manifest, ledger, missingCells: new Set(region.missingCells) }));
    } catch {
      reports[region.id] = region.cells.map((id) => ({ id, lookup: { status: "unknown" } }));
    }
  }
  return reports;
}

const formatBytes = (bytes: number, language: string) => new Intl.NumberFormat(language, { maximumFractionDigits: 1 }).format(bytes / 1024) + " KiB";


/**
 * Fail-safe states the data client reports for one region (docs/failsafe.md):
 * cells the pack builder withheld, cells shown from the last checked copy, and
 * records that failed the device check. The container is a status region so a
 * change after a download or a check is announced.
 */
export function RegionFailsafeNotes({ region, language }: { region: RegionStatus; language: "en" | "fr" }) {
  const c = offlineCatalog[language];
  const unavailable = new Map<string, string[]>();
  for (const item of region.unavailable ?? []) {
    const key = item.cell ?? item.path;
    const reasons = unavailable.get(key) ?? [];
    if (!reasons.includes(item.reason)) reasons.push(item.reason);
    unavailable.set(key, reasons);
  }
  const stale = region.staleCells ?? [];
  const dropped = region.droppedRecords ?? 0;
  const droppedText = dropped === 1 ? c.failsafeDroppedOne : c.failsafeDroppedMany.replace("{count}", dropped.toLocaleString(language));
  return <div role="status" className="stack" data-testid={`failsafe-${region.id}`}>
    {unavailable.size > 0 && <div className="stack">
      <p>{c.failsafeUnavailableIntro}</p>
      <ul>{[...unavailable].map(([cell, reasons]) => <li key={cell} data-failsafe="unavailable">
        <span lang="und">{cell}</span> — <strong>{c.failsafeUnavailable}</strong>. {c.failsafeReason}{reasons.map((reason, index) => <span key={reason}>{index > 0 ? "; " : ""}<span lang="und">{reason}</span></span>)}
      </li>)}</ul>
    </div>}
    {stale.length > 0 && <div className="stack">
      <p>{c.failsafeStale}</p>
      <ul>{stale.map((cell) => <li key={cell} data-failsafe="stale"><span lang="und">{cell}</span></li>)}</ul>
    </div>}
    {dropped > 0 && <p data-failsafe="dropped">{droppedText}</p>}
  </div>;
}

/** Inventory and storage-headroom dashboard for one region, mounted on the live /offline page. */
function RegionInventoryDashboard({ source, pack, regionId, language }: { source: PackSource; pack: PackManifest; regionId: string; language: "en" | "fr" }) {
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    let cancelled = false;
    let unmount: (() => void) | undefined;
    void (async () => {
      try {
        const status = (await source.regions()).find((region) => region.id === regionId);
        const manifest = regionManifestFor(pack, regionId);
        const store = createPackCellStore({
          manifest,
          ledger,
          missingCells: new Set(status?.missingCells ?? manifest.cells.map((cell) => cell.id)),
        });
        if (cancelled) return;
        unmount = mountStoragePressurePanel(root, manifest, {
          store,
          estimateStorage,
          fetchCell: async (rid, cell) => {
            if (!source.downloadCell) throw new PackClientError("missing", rid);
            return source.downloadCell(rid, cell.id);
          },
        }, language);
      } catch {
        // Existing region controls stay usable if the inventory panel cannot mount.
      }
    })();
    return () => {
      cancelled = true;
      unmount?.();
    };
  }, [source, pack, regionId, language]);
  return <div ref={rootRef} className="offline-inventory" data-testid={`offline-inventory-${regionId}`} />;
}

export function OfflineRegionPage({ packSource = defaultSource }: { packSource?: PackSource } = {}) {
  const source = packSource;
  const recoveryStore = useMemo(() => localRecoveryStore(source), [source]);
  const { i18n } = useTranslation();
  const language = i18n.language.startsWith("fr") ? "fr" : "en";
  const c = offlineCatalog[language];
  const r = OFFLINE_STRINGS[language];
  const online = useOnline();
  useDocumentTitle(c.title);
  const [manifest, setManifest] = useState<PackManifest | null>(null);
  const [regions, setRegions] = useState<RegionStatus[]>([]);
  const [error, setError] = useState("");
  const [listFailed, setListFailed] = useState(false);
  const [startedWithoutRegions, setStartedWithoutRegions] = useState(false);
  const [listAttempt, setListAttempt] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [confirmation, setConfirmation] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [cells, setCells] = useState<Record<string, readonly CellReport[]>>({});
  const [results, setResults] = useState<Record<string, DownloadResult>>({});
  const [failure, setFailure] = useState<{ region: string; failure: RecoveryFailure } | null>(null);
  const [packStatus, setPackStatus] = useState<"corrupt" | "unknown" | null>(null);
  const [packRegion, setPackRegion] = useState<string | null>(null);
  // The region whose stored copy is being checked. The check reads every stored part, so it can take a while.
  const [checking, setChecking] = useState<string | null>(null);
  const [checkedStatuses, setCheckedStatuses] = useState<Record<string, "corrupt" | "unknown">>({});
  const abortRef = useRef<AbortController | null>(null);
  const keepRef = useRef<HTMLButtonElement>(null);
  const deleteRef = useRef<HTMLButtonElement>(null);
  const confirmDeleteRef = useRef<HTMLButtonElement>(null);
  const dialogTitle = useId();
  const progressTitle = useId();
  useEffect(() => { if (confirmation) keepRef.current?.focus(); }, [confirmation]);
  useEffect(() => {
    let active = true;
    source.manifest().then(async (value) => {
      const statuses = await source.regions();
      const reports = await cellReports(value, statuses);
      if (active) {
        if (statuses.length === 0) setStartedWithoutRegions(true);
        setListFailed(false); setManifest(value); setRegions(statuses); setCells(reports);
      }
    }).catch(() => {
      if (active) {
        setStartedWithoutRegions(true);
        setListFailed(true);
      }
    });
    return () => { active = false; };
  }, [source, listAttempt]);
  async function refresh() {
    const pack = await source.manifest();
    const statuses = await source.regions();
    setRegions(statuses);
    setCells(await cellReports(pack, statuses));
  }
  /**
   * Cell by cell: each cell is checked and committed on its own, free space is
   * checked before each one, and a second run resumes from the cells already saved.
   */
  async function download(id: string) {
    setBusy(id); setError(""); setMessage(""); setProgress(null); setFailure(null);
    const controller = new AbortController();
    abortRef.current = controller;
    let fetchFailure: unknown;
    try {
      const pack = await source.manifest();
      const status = (await source.regions()).find((region) => region.id === id);
      const regionManifest = regionManifestFor(pack, id);
      const store = createPackCellStore({ manifest: regionManifest, ledger, missingCells: new Set(status?.missingCells ?? regionManifest.cells.map((cell) => cell.id)) });
      const total = regionManifest.cells.reduce((sum, cell) => sum + cell.bytes, 0);
      let done = 0;
      setProgress({ done, total });
      const result = await downloadRegionCells(regionManifest, {
        store,
        estimateStorage,
        fetchCell: async (regionId, cell) => {
          if (!source.downloadCell) throw new PackClientError("missing", regionId);
          try {
            return await source.downloadCell(regionId, cell.id, (size) => { done += size; setProgress({ done: Math.min(done, total), total }); });
          } catch (cause) {
            fetchFailure = cause;
            throw cause;
          }
        },
      }, controller.signal);
      setResults((current) => ({ ...current, [id]: result }));
      await refresh();
      // A download changes what is stored, so an earlier "Check again" result no longer applies.
      // The region line returns to the stored state; only an explicit check sets a checked status.
      setCheckedStatuses((previous) => { const next = { ...previous }; delete next[id]; return next; });
      if (result.completed) setMessage(c.complete);
      else if (result.reason === "download-error") {
        // Digest, size or record-count mismatches use the recovery notice.
        // A failed fetch that still saved earlier cells stays a partial result
        // so the user can resume.
        const classified = classifyPackDownloadError(fetchFailure, navigator.onLine);
        if (classified.reason === "invalid-data") setFailure({ region: id, failure: classified });
        else setError(downloadResultText(language, result));
      } else setError(downloadResultText(language, result));
    } catch (cause) {
      // Recovery copy names the cause and the next step; raw error text is never shown.
      setFailure({ region: id, failure: classifyPackDownloadError(cause, navigator.onLine) });
      setCheckedStatuses((previous) => { const next = { ...previous }; delete next[id]; return next; });
      await refresh().catch(() => undefined);
    } finally { abortRef.current = null; setBusy(null); }
  }
  /** Runs a real digest and record-count check over the stored pack. */
  async function recheck(id: string) {
    if (checking !== null) return;
    setChecking(id);
    setPackStatus(null); setMessage(""); setFailure(null);
    try {
      const snapshot = await source.storedRegionIntegrity(id);
      const pack = await source.manifest();
      const statuses = await source.regions();
      setRegions(statuses);
      setCells(await cellReports(pack, statuses));
      // The row keeps the result of the last check, also after the notice is closed.
      if (!snapshot) { setPackRegion(id); setPackStatus("unknown"); setCheckedStatuses((previous) => ({ ...previous, [id]: "unknown" })); return; }
      const check = await checkStoredPackParts(snapshot.parts);
      if (check.status === "complete") { setCheckedStatuses((previous) => { const next = { ...previous }; delete next[id]; return next; }); setMessage(c.downloaded); return; }
      setPackRegion(id); setPackStatus(check.status);
      setCheckedStatuses((previous) => ({ ...previous, [id]: check.status === "corrupt" ? "corrupt" : "unknown" }));
    } catch {
      // A check that could not run says nothing about the stored copy: it stays UNKNOWN, never "fine".
      setPackRegion(id); setPackStatus("unknown");
      setCheckedStatuses((previous) => ({ ...previous, [id]: "unknown" }));
    } finally { setChecking(null); }
  }
  async function redownload(id: string) {
    setBusy(id); setError(""); setMessage(""); setProgress(null); setFailure(null);
    try {
      const snapshot = await source.storedRegionIntegrity(id);
      const parts = snapshot?.parts;
      if (!parts || parts.length === 0) {
        setPackRegion(id); setPackStatus("unknown"); return;
      }
      const pending: Array<{ sha256: string; data: Uint8Array }> = [];
      let done = 0;
      const total = parts.reduce((sum, part) => sum + part.expectedBytes, 0);
      setProgress({ done, total });
      for (const part of parts) {
        const result = await redownloadPack(
          () => source.fetchRegionPartBytes(part.path),
          { byteLength: part.expectedBytes, sha256: part.expectedSha256, source: part.source },
          async (data) => { pending.push({ sha256: part.expectedSha256, data }); },
        );
        if (result.status === "failed") {
          setPackStatus(null);
          setFailure({ region: id, failure: { operation: "download", reason: result.reason } });
          await refresh().catch(() => undefined);
          return;
        }
        if (result.status !== "complete") {
          setPackRegion(id); setPackStatus(result.status === "corrupt" ? "corrupt" : "unknown");
          await refresh().catch(() => undefined);
          return;
        }
        done += part.expectedBytes;
        setProgress({ done, total });
      }
      await source.commitCheckedRegion(id, pending);
      await refresh();
      setCheckedStatuses((previous) => { const next = { ...previous }; delete next[id]; return next; });
      setPackStatus(null);
      setMessage(c.complete);
    } catch (cause) {
      setPackStatus(null);
      setFailure({ region: id, failure: classifyPackDownloadError(cause, navigator.onLine) });
      await refresh().catch(() => undefined);
    } finally { setBusy(null); }
  }
  async function remove() {
    const id = confirmation;
    if (!id) return;
    setConfirmation(null); setBusy(id);
    try { await source.deleteRegion(id); await ledger.deleteRegion(id); setResults((current) => { const next = { ...current }; delete next[id]; return next; }); await refresh(); setCheckedStatuses((previous) => { const next = { ...previous }; delete next[id]; return next; }); setMessage(c.deleted); setProgress(null); }
    catch { setError(c.error); }
    finally { setBusy(null); requestAnimationFrame(() => deleteRef.current?.focus()); }
  }
  return <div className="stack">
    <h1>{c.title}</h1>
    <p>{c.intro}</p>
    {!online && <p role="status" className="offline-banner">{c.offline}</p>}
    {listFailed ? <StateNotice lang={language} view={getRouteError("offline", "region-list-unavailable", language)} onAction={{ retry: () => { setListFailed(false); setListAttempt((n) => n + 1); } }} /> : null}
    <CommunicationCardsLauncher language={language} />
    {startedWithoutRegions && <PersonalOfflineTools language={language} />}
    {error && <p role="alert">{error}</p>}
    {packStatus ? (
      <CorruptPackNotice
        status={packStatus}
        locale={language}
        onRedownload={() => { if (packRegion) void redownload(packRegion); }}
        onDismiss={() => setPackStatus(null)}
        busy={!!busy}
      />
    ) : null}
    {message && <p role="status" tabIndex={-1}>{message}</p>}
    {manifest && <>
      <p>{c.built}: <time dateTime={manifest.builtAt}>{manifest.builtAt.slice(0, 10)}</time>. {c.counts}: {manifest.counts.records.toLocaleString(language)}.</p>
      <section className="panel stack" aria-labelledby="offline-sources"><h2 id="offline-sources">{c.sources}</h2>
        <ul>{manifest.sources.filter((entry) => entry.inWebPack).map((entry) => <li key={entry.sourceId}>{entry.name} — {entry.licence} — {c.retrieved}: {entry.retrieved}</li>)}</ul>
        {manifest.sources.some((entry) => entry.sourceId.includes("osm") && entry.inWebPack) && <p>{c.credit}</p>}
      </section>
      {regions.length === 0 ? <StateNotice lang={language} view={getRouteEmpty("offline", language)!} /> : null}
      <ul className="record-list">{regions.map((region) => {
        const report = cells[region.id] ?? [];
        const statuses = report.map((cell) => cell.lookup.status);
        const partial = !region.downloaded && statuses.some((status) => status === "available");
        const result = results[region.id];
        return <li key={region.id} className="panel stack">
        <h2>{region.label[language]}</h2>
        <p>{c.size}: {formatBytes(region.bytes, language)}. {c.counts}: {region.count.toLocaleString(language)}.</p>
        <p data-testid="region-state">{checkedStatuses[region.id] === "corrupt" ? packIntegrityCopy(language, "corrupt").title : checkedStatuses[region.id] === "unknown" ? c.unknown : region.downloaded ? c.downloaded : statuses.includes("stale") ? r.staleRegion : partial ? r.partial : c.notDownloaded}</p>
        <RegionFailsafeNotes region={region} language={language} />
        {report.length > 0 && <details className="region-cells">
          <summary style={{ minHeight: 44, display: "flex", alignItems: "center" }}>{cellSummaryText(language, statuses)}</summary>
          <ul>{report.map((cell) => <li key={cell.id} data-cell-status={cell.lookup.status}>
            <span lang="und">{cell.id}</span> — {cellStatusText(language, cell.lookup)}
          </li>)}</ul>
        </details>}
        {result && !result.completed && failure?.region !== region.id && busy !== region.id && (() => {
          const view = pressureView({ phase: "stopped", result }, language);
          return <p data-testid="storage-pressure">{view.message} {view.details}</p>;
        })()}
        <div className="button-row">
          {!region.downloaded && <button type="button" style={{ minHeight: 44, minWidth: 44 }} disabled={!online || !!busy} onClick={() => void download(region.id)}>{statuses.includes("stale") ? r.update : partial ? r.resume : c.download}</button>}
          {busy === region.id && <button type="button" style={{ minHeight: 44, minWidth: 44 }} onClick={() => abortRef.current?.abort()}>{r.pause}</button>}
          {region.downloaded && <button type="button" style={{ minHeight: 44, minWidth: 44 }} disabled={!!busy || checking !== null} aria-busy={checking === region.id} onClick={() => void recheck(region.id)}>{c.recheck}</button>}
          {(region.downloaded || statuses.some((status) => status === "available" || status === "stale")) && <button ref={deleteRef} type="button" style={{ minHeight: 44, minWidth: 44 }} disabled={!!busy} onClick={() => setConfirmation(region.id)}>{c.delete}</button>}
        </div>
        {failure?.region === region.id && <RecoveryNotice failure={failure.failure} locale={language} onRetry={() => void download(region.id)} onDismiss={() => setFailure(null)} />}
        {busy === region.id && progress && <div className="stack"><label id={`${progressTitle}-${region.id}`}>{c.progress}: {Math.round(progress.total ? 100 * progress.done / progress.total : 100)}%</label><progress aria-labelledby={`${progressTitle}-${region.id}`} value={progress.done} max={progress.total || 1}/></div>}
        {manifest && <RegionInventoryDashboard source={source} pack={manifest} regionId={region.id} language={language} />}
      </li>; })}</ul>
    </>}
    <RecoveryCenter locale={language} store={recoveryStore} />
    {confirmation && <dialog open aria-labelledby={dialogTitle} className="panel stack" onKeyDown={(event) => {
      if (event.key === "Escape") setConfirmation(null);
      if (event.key === "Tab") { const buttons = [keepRef.current, confirmDeleteRef.current].filter(Boolean); if (event.shiftKey && document.activeElement === buttons[0]) { event.preventDefault(); buttons[1]?.focus(); } else if (!event.shiftKey && document.activeElement === buttons[1]) { event.preventDefault(); buttons[0]?.focus(); } }
    }}>
      <h2 id={dialogTitle}>{c.confirm}</h2><div className="button-row">
        <button ref={keepRef} type="button" style={{ minHeight: 44, minWidth: 44 }} onClick={() => setConfirmation(null)}>{c.keep}</button>
        <button ref={confirmDeleteRef} type="button" style={{ minHeight: 44, minWidth: 44 }} onClick={() => void remove()}>{c.delete}</button>
      </div>
    </dialog>}
  </div>;
}

