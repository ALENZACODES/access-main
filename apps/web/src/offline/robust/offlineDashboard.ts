import {
  downloadRegion,
  type DownloadDependencies,
  type DownloadResult,
  type Language,
  type RegionManifest,
  type StorageEstimate,
} from "./regionDownload";
import { dashboardCopy } from "./offlineCopy";
import { inspectRegion, inventoryPage, type RegionInventory } from "./regionInventory";
import { formatBinaryBytes, planCapacity, type CapacityPlan } from "./quotaPlanning";
import { auditManifest } from "./manifestAudit";
import { createLocalReport, saveReportFile } from "./localReport";
import { createOfflineAction } from "./accessibilityGuard";
import { selectedDownloadPlan } from "./cellTriage";
import { mountOfflineTriage } from "./offlineTriagePanel";
import { mountOfflineCleanup } from "./cleanupPanel";
import { mountOfflineUpdateReview } from "./updateReviewPanel";
import { mountOfflineSessionComparison } from "./sessionComparisonPanel";
import { mountOfflineSourceLedger } from "./sourceLedgerPanel";
import { mountOfflineTransferChecklist } from "./transferChecklistPanel";
import { mountStorageDurability } from "./storageDurabilityPanel";
import { mountOfflineDiagnostics } from "./offlineDiagnosticsPanel";
import { mountOfflineReadiness } from "./readinessPanel";
import { mountOfflineRecoveryBatches } from "./recoveryBatchesPanel";
import { mountOfflineSourceAge } from "./sourceAgePanel";
import { mountOfflineContinuityDrill } from "./continuityDrillPanel";
import { mountOfflineCasebook } from "./offlineCasebookPanel";

export type DashboardPhase = "checking" | "ready" | "downloading" | "error";

export interface DashboardState {
  readonly phase: DashboardPhase;
  readonly inventory: RegionInventory | null;
  readonly plan: CapacityPlan | null;
  readonly lastResult: DownloadResult | null;
  readonly page: number;
  readonly expanded: boolean;
}

export interface DashboardModel {
  readonly getState: () => DashboardState;
  readonly subscribe: (listener: (state: DashboardState) => void) => () => void;
  readonly refresh: () => Promise<void>;
  readonly download: () => Promise<void>;
  readonly downloadSelected: (ids: readonly string[]) => Promise<void>;
  readonly cancel: () => void;
  readonly toggleDetails: () => void;
  readonly setPage: (page: number) => void;
  readonly dispose: () => void;
}

const PAGE_SIZE = 12;

/**
 * Download and refresh operations are serialised. Late async completions after
 * disposal cannot update a view or begin a new download.
 */
export function createOfflineDashboardModel(
  manifest: RegionManifest,
  dependencies: DownloadDependencies,
): DashboardModel {
  let state: DashboardState = {
    phase: "checking", inventory: null, plan: null,
    lastResult: null, page: 0, expanded: false,
  };
  let disposed = false;
  let pending: Promise<void> | null = null;
  let abort: AbortController | null = null;
  const listeners = new Set<(state: DashboardState) => void>();
  const publish = (change: Partial<DashboardState>): void => {
    if (disposed) return;
    state = { ...state, ...change };
    for (const listener of listeners) listener(state);
  };
  const refresh = (): Promise<void> => {
    if (disposed) return Promise.resolve();
    if (pending !== null) return pending;
    publish({ phase: "checking" });
    const task = (async (): Promise<void> => {
      try {
        const inventory = await inspectRegion(manifest, dependencies.store);
        let estimate: StorageEstimate = {};
        try { estimate = await dependencies.estimateStorage(); } catch { /* UNKNOWN */ }
        const plan = planCapacity(inventory, estimate);
        publish({ inventory, plan, phase: "ready" });
      } catch {
        publish({ phase: "error", inventory: null, plan: null });
      }
    })().finally(() => { pending = null; });
    pending = task;
    return task;
  };
  const download = (requested?: readonly string[]): Promise<void> => {
    if (disposed) return Promise.resolve();
    if (pending !== null) return pending;
    if (state.inventory === null || state.inventory.complete) return Promise.resolve();
    const subManifest = requested === undefined ? manifest : selectedDownloadPlan(manifest, state.inventory, requested).manifest;
    if (subManifest.cells.length === 0) return Promise.resolve();
    abort = new AbortController();
    const signal = abort.signal;
    publish({ phase: "downloading" });
    const task = (async (): Promise<void> => {
      let result: DownloadResult | null = null;
      try {
        result = await downloadRegion(subManifest, dependencies, signal);
      } catch {
        result = {
          regionId: manifest.regionId,
          available: [],
          missing: subManifest.cells.map((cell) => cell.id),
          completed: false,
          reason: "download-error",
        };
      }
      if (disposed) return;
      // Re-read storage after interruption, including partial writes.
      try {
        const inventory = await inspectRegion(manifest, dependencies.store);
        let estimate: StorageEstimate = {};
        try { estimate = await dependencies.estimateStorage(); } catch { /* UNKNOWN */ }
        publish({
          inventory,
          plan: planCapacity(inventory, estimate),
          lastResult: result,
          phase: "ready",
        });
      } catch {
        publish({ lastResult: result, inventory: null, plan: null, phase: "error" });
      }
    })().finally(() => { abort = null; pending = null; });
    pending = task;
    return task;
  };
  return {
    getState: () => state,
    subscribe(listener) {
      if (!disposed) listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    refresh,
    download: () => download(),
    downloadSelected: (ids) => download(ids),
    cancel() { abort?.abort(); },
    toggleDetails() { publish({ expanded: !state.expanded, page: 0 }); },
    setPage(page) {
      if (!Number.isSafeInteger(page) || page < 0) return;
      const total = state.inventory?.cells.length ?? 0;
      if (page * PAGE_SIZE >= total) return;
      publish({ page });
    },
    dispose() {
      disposed = true;
      abort?.abort();
      listeners.clear();
    },
  };
}

function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  return node;
}

function action(text: string): HTMLButtonElement {
  return createOfflineAction(document, text);
}

function definition(term: string, value: string): HTMLElement {
  const wrapper = element("div");
  const dt = element("dt", term);
  const dd = element("dd", value);
  dd.style.marginInlineStart = "1em";
  wrapper.append(dt, dd);
  return wrapper;
}

function safeId(seed: string): string {
  return seed.replace(/[^a-zA-Z0-9_-]/g, "-");
}

/**
 * A browser-only panel for the existing offline shell mount. It uses native
 * controls, visible labels, a polite live region, and no external resources.
 */
export function mountOfflineDashboard(
  root: HTMLElement,
  manifest: RegionManifest,
  dependencies: DownloadDependencies,
  language: Language,
): () => void {
  const copy = dashboardCopy(language);
  const audit = auditManifest(manifest, new Date().toISOString().slice(0, 10));
  const model = createOfflineDashboardModel(manifest, dependencies);
  const section = element("section");
  const heading = element("h2", copy.title);
  const description = element("p", copy.description);
  const status = element("p");
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  status.setAttribute("aria-atomic", "true");
  const summary = element("dl");
  const controls = element("div");
  const refreshButton = action(copy.refresh);
  const downloadButton = action(copy.download);
  const cancelButton = action(copy.cancel);
  const detailsButton = action(copy.inspect);
  const exportTextButton = action(language === "fr" ? "Exporter le rapport texte" : "Export text report");
  const exportJsonButton = action(language === "fr" ? "Exporter le rapport JSON" : "Export JSON report");
  const auditStatus = element("p");
  auditStatus.textContent = audit.ready ?
    (language === "fr" ? "Licence et source indiquées pour chaque cellule." :
      "Licence and source recorded for each cell.") :
    (language === "fr" ? "Données non admissibles au téléchargement. État hors ligne UNKNOWN." :
      "Data cannot be downloaded. Offline status UNKNOWN.");
  const detailsId = `offline-cells-${safeId(manifest.regionId)}`;
  const details = element("div");
  details.id = detailsId;
  detailsButton.setAttribute("aria-controls", detailsId);
  const policy = element("p", copy.policy);
  const help = element("p", copy.actionHelp);
  controls.append(refreshButton, downloadButton, cancelButton, detailsButton, exportTextButton, exportJsonButton);
  section.append(heading, description, auditStatus, status, summary, controls, help, details, policy);
  root.append(section);
  const triageHost = element("div");
  section.append(triageHost);
  const unmountTriage = mountOfflineTriage(triageHost, manifest, model, language, audit.ready);
  const cleanupHost = element("div");
  section.append(cleanupHost);
  const unmountCleanup = mountOfflineCleanup(cleanupHost, manifest, model, dependencies.store, language, audit.ready);
  const reviewHost = element("div");
  section.append(reviewHost);
  const unmountReview = mountOfflineUpdateReview(reviewHost, manifest, model, language, dependencies.estimateStorage);
  const comparisonHost = element("div");
  section.append(comparisonHost);
  const unmountComparison = mountOfflineSessionComparison(comparisonHost, manifest, model, language);
  const ledgerHost = element("div");
  section.append(ledgerHost);
  const unmountLedger = mountOfflineSourceLedger(ledgerHost, manifest, model, language);
  const checklistHost = element("div");
  section.append(checklistHost);
  const unmountChecklist = mountOfflineTransferChecklist(checklistHost, manifest, model, language);
  const durabilityHost = element("div");
  section.append(durabilityHost);
  const unmountDurability = mountStorageDurability(durabilityHost, manifest, model, language,
    typeof navigator === "undefined" ? undefined : navigator.storage);

  const readinessHost = element("div");
  section.append(readinessHost);
  const unmountReadiness = mountOfflineReadiness(readinessHost, manifest, model, language, dependencies.estimateStorage);
  const diagnosticsHost = element("div");
  section.append(diagnosticsHost);
  const unmountDiagnostics = mountOfflineDiagnostics(diagnosticsHost, manifest, model, language);
  const recoveryHost = element("div");
  section.append(recoveryHost);
  const unmountRecovery = mountOfflineRecoveryBatches(recoveryHost, manifest, model, language, dependencies.estimateStorage);
  const sourceAgeHost = element("div");
  section.append(sourceAgeHost);
  const unmountSourceAge = mountOfflineSourceAge(sourceAgeHost, manifest, model, language);
  const continuityHost = element("div");
  section.append(continuityHost);
  const unmountContinuity = mountOfflineContinuityDrill(
    continuityHost, manifest, model, language, dependencies.estimateStorage,
  );
  const casebookHost = element("div");
  section.append(casebookHost);
  const unmountCasebook = mountOfflineCasebook(casebookHost, manifest, model, language);

  const handoffHost = element("div");
  section.append(handoffHost);
  let disposedHandoff = false;
  let unmountHandoff: () => void = () => undefined;
  void import("./handoffRehearsalPanel").then(({ mountOfflineHandoffRehearsal }) => {
    if (disposedHandoff) return;
    unmountHandoff = mountOfflineHandoffRehearsal(handoffHost, manifest, model, language);
  }).catch(() => {
    // Keep the rest of the dashboard operational if optional code is unavailable.
  });

  const timelineHost = element("div");
  section.append(timelineHost);
  let timelineDisposed = false;
  let unmountTimeline: () => void = () => undefined;
  void import("./localEvidenceTimelinePanel").then(({ mountLocalEvidenceTimeline }) => {
    if (timelineDisposed) return;
    unmountTimeline = mountLocalEvidenceTimeline(timelineHost, manifest, model, language);
  }).catch(() => {
    // The timeline is an optional, read-only record of local observations.
  });
  const workbookHost = element("div");
  section.append(workbookHost);
  let disposedWorkbook = false;
  let unmountWorkbook: () => void = () => undefined;
  // Keep the substantial local workbook out of the initial offline page chunk.
  void import("./reconciliationWorkbookPanel").then(({ mountOfflineReconciliationWorkbook }) => {
    if (disposedWorkbook) return;
    unmountWorkbook = mountOfflineReconciliationWorkbook(workbookHost, manifest, model, language);
  }).catch(() => {
    // The core offline dashboard remains usable if this optional panel fails.
  });

  const preparationHost = element("div");
  section.append(preparationHost);
  let disposedPreparation = false;
  let unmountPreparation: () => void = () => undefined;
  void import("./accessPreparationPanel").then(({ mountAccessPreparation }) => {
    if (disposedPreparation) return;
    unmountPreparation = mountAccessPreparation(preparationHost, manifest, model, language);
  }).catch(() => {
    // Existing offline controls remain usable when the optional module cannot load.
  });

  const inquiryHost = element("div");
  section.append(inquiryHost);
  let inquiryDisposed = false;
  let unmountInquiry: () => void = () => undefined;
  void import("./accessInquiryPanel").then(({ mountAccessInquiry }) => {
    if (inquiryDisposed) return;
    unmountInquiry = mountAccessInquiry(inquiryHost, manifest, model, language);
  }).catch(() => {
    // Existing offline controls remain usable when the optional module cannot load.
  });

  const renderDetails = (state: DashboardState): void => {
    details.replaceChildren();
    details.hidden = !state.expanded || state.inventory === null;
    detailsButton.setAttribute("aria-expanded", String(state.expanded));
    if (details.hidden || state.inventory === null) return;
    const inventory = state.inventory;
    const start = state.page * PAGE_SIZE;
    const page = inventoryPage(inventory, start, PAGE_SIZE);
    const list = element("ol");
    list.start = start + 1;
    for (const cell of page) {
      const item = element("li");
      const label = element("strong", cell.id);
      const statusText = cell.state === "saved" ? copy.savedState : copy.unknownState;
      const cause = cell.cause === "present" ? copy.present
        : cell.cause === "stale" ? copy.stale
        : cell.cause === "unreadable" ? copy.unreadable : copy.missingState;
      const stateText = element("p", `${statusText}. ${cause}`);
      const provenance = element("dl");
      provenance.append(
        definition(copy.source, cell.provenance.source),
        definition(copy.licence, cell.provenance.licence),
        definition(copy.date, cell.provenance.date),
        definition(copy.size, formatBinaryBytes(cell.expectedBytes, language)),
      );
      item.append(label, stateText, provenance);
      list.append(item);
    }
    const navigation = element("nav");
    navigation.setAttribute("aria-label", copy.position);
    const previous = action(copy.pagePrevious);
    const next = action(copy.pageNext);
    previous.disabled = state.page === 0;
    next.disabled = start + PAGE_SIZE >= inventory.cells.length;
    previous.addEventListener("click", () => { model.setPage(state.page - 1); });
    next.addEventListener("click", () => { model.setPage(state.page + 1); });
    const countText = element(
      "span",
      `${copy.position}${language === "fr" ? "\u00a0:" : ":"} ${inventory.cells.length === 0 ? 0 : start + 1}–${Math.min(start + PAGE_SIZE, inventory.cells.length)} / ${inventory.cells.length}`,
    );
    navigation.append(previous, countText, next);
    details.append(list, navigation);
  };

  const render = (state: DashboardState): void => {
    const busy = state.phase === "checking" || state.phase === "downloading";
    section.setAttribute("aria-busy", String(busy));
    refreshButton.disabled = busy;
    downloadButton.disabled = !audit.ready || busy || state.inventory === null || state.inventory.complete;
    cancelButton.hidden = state.phase !== "downloading";
    cancelButton.disabled = state.phase !== "downloading";
    detailsButton.disabled = state.inventory === null;
    detailsButton.textContent = state.expanded ? copy.hide : copy.inspect;
    downloadButton.textContent = state.lastResult === null ? copy.download : copy.resume;
    summary.replaceChildren();
    if (state.phase === "checking") status.textContent = copy.checkWorking;
    else if (state.phase === "downloading") status.textContent = copy.working;
    else if (state.phase === "error") status.textContent = copy.inventoryFailed;
    else if (state.inventory?.complete) status.textContent = copy.completed;
    else if (state.lastResult?.reason === "interrupted") status.textContent = copy.interrupted;
    else if (state.lastResult?.reason === "download-error") status.textContent = copy.stopped;
    else if (state.plan?.status === "low") status.textContent = copy.low;
    else if (state.plan?.status === "unknown") status.textContent = copy.unknownCapacity;
    else status.textContent = copy.sufficient;
    if (state.inventory !== null && state.plan !== null) {
      const plan = state.plan;
      summary.append(
        definition(copy.saved, String(state.inventory.savedCount)),
        definition(copy.missing, String(state.inventory.unknownCount)),
        definition(copy.remaining, formatBinaryBytes(plan.remainingBytes, language)),
        definition(copy.free, plan.freeBytes === null ?
          "UNKNOWN" : formatBinaryBytes(plan.freeBytes, language)),
        definition(copy.reserve, formatBinaryBytes(plan.reserveBytes, language)),
      );
    }
    renderDetails(state);
  };

  const onRefresh = (): void => { void model.refresh(); };
  const onExport = (format: "txt" | "json"): void => {
    const state = model.getState();
    const report = createLocalReport({
      regionId: manifest.regionId,
      inventory: state.inventory,
      plan: state.plan,
      result: state.lastResult,
      audit,
      date: new Date().toISOString().slice(0, 10),
    });
    saveReportFile(report, language, format, root.ownerDocument);
  };
  const onText = (): void => { onExport("txt"); };
  const onJson = (): void => { onExport("json"); };
  const onDownload = (): void => { void model.download(); };
  const onCancel = (): void => { model.cancel(); };
  const onDetails = (): void => { model.toggleDetails(); };
  refreshButton.addEventListener("click", onRefresh);
  exportTextButton.addEventListener("click", onText);
  exportJsonButton.addEventListener("click", onJson);
  downloadButton.addEventListener("click", onDownload);
  cancelButton.addEventListener("click", onCancel);
  detailsButton.addEventListener("click", onDetails);
  const unsubscribe = model.subscribe(render);
  render(model.getState());
  void model.refresh();
  return () => {
    unsubscribe();
    unmountTriage();
    unmountCleanup();
    unmountReview();
    unmountComparison();
    unmountLedger();
    unmountChecklist();
    unmountDurability();
    unmountReadiness();
    unmountDiagnostics();
    unmountRecovery();
    unmountSourceAge();
    unmountContinuity();
    unmountCasebook();
    disposedHandoff = true;
    unmountHandoff();
    timelineDisposed = true;
    unmountTimeline();
    disposedWorkbook = true;
    unmountWorkbook();
    disposedPreparation = true;
    unmountPreparation();
    inquiryDisposed = true;
    unmountInquiry();
    model.dispose();
    refreshButton.removeEventListener("click", onRefresh);
    exportTextButton.removeEventListener("click", onText);
    exportJsonButton.removeEventListener("click", onJson);
    downloadButton.removeEventListener("click", onDownload);
    cancelButton.removeEventListener("click", onCancel);
    detailsButton.removeEventListener("click", onDetails);
    section.remove();
  };
}
