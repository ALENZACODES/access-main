import type { DashboardModel } from "./offlineDashboard";
import type { Language, RegionManifest } from "./regionDownload";
import { createOfflineAction } from "./accessibilityGuard";
import {
  createDurabilityController, createDurabilityReport,
  DURABILITY_COPY, jsonDurabilityReport, textDurabilityReport,
  type BrowserStorage, type DurabilityReport, type DurabilityState,
} from "./storageDurability";

function element<K extends keyof HTMLElementTagNameMap>(doc: Document, tag: K, text?: string): HTMLElementTagNameMap[K] {
  const node = doc.createElement(tag);
  if (text !== undefined) node.textContent = text;
  return node;
}

function row(doc: Document, term: string, value: string): HTMLDivElement {
  const wrapper = element(doc, "div");
  const name = element(doc, "dt", term);
  const description = element(doc, "dd", value);
  description.style.marginInlineStart = "1em";
  wrapper.append(name, description);
  return wrapper;
}

function safeFilename(region: string, extension: "txt" | "json"): string {
  const stem = region.toLowerCase().replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "").slice(0, 64) || "region";
  return `offline-storage-${stem}.${extension}`;
}

/** Only explicit button clicks create local report downloads. */
export function saveDurabilityReport(
  report: DurabilityReport,
  language: Language,
  format: "txt" | "json",
  doc: Document,
  createUrl: (blob: Blob) => string = (blob) => URL.createObjectURL(blob),
  revokeUrl: (url: string) => void = (url) => URL.revokeObjectURL(url),
): void {
  const content = format === "json" ? jsonDurabilityReport(report) : textDurabilityReport(report, language);
  const blob = new Blob([content], {
    type: format === "json" ? "application/json;charset=utf-8" : "text/plain;charset=utf-8",
  });
  const url = createUrl(blob);
  try {
    const anchor = element(doc, "a");
    anchor.download = safeFilename(report.region, format);
    anchor.href = url;
    anchor.hidden = true;
    doc.body.append(anchor);
    try { anchor.click(); } finally { anchor.remove(); }
  } finally { revokeUrl(url); }
}

/**
 * Mounted by the live offline dashboard. Reading starts on mount, but storage
 * retention is requested ONLY by activating the labelled button.
 */
export function mountStorageDurability(
  root: HTMLElement,
  manifest: RegionManifest,
  dashboard: DashboardModel,
  language: Language,
  storage: BrowserStorage | undefined,
): () => void {
  const doc = root.ownerDocument;
  const copy = DURABILITY_COPY[language];
  const controller = createDurabilityController(storage);
  const section = element(doc, "section");
  const heading = element(doc, "h3", copy.title);
  const intro = element(doc, "p", copy.description);
  const status = element(doc, "p");
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  status.setAttribute("aria-atomic", "true");
  const definitions = element(doc, "dl");
  const controls = element(doc, "div");
  const refreshButton = createOfflineAction(doc, copy.inspect);
  const persistButton = createOfflineAction(doc, copy.request);
  const textButton = createOfflineAction(doc, copy.exportText);
  const jsonButton = createOfflineAction(doc, copy.exportJson);
  const note = element(doc, "p", copy.localOnly);
  controls.append(refreshButton, persistButton, textButton, jsonButton);
  section.append(heading, intro, status, definitions, controls, note);
  root.append(section);
  let closed = false;

  const render = (state: DurabilityState): void => {
    if (closed) return;
    const busy = state.phase === "checking" || state.phase === "requesting";
    section.setAttribute("aria-busy", String(busy));
    refreshButton.disabled = busy;
    persistButton.disabled = busy || !state.reading.canRequest || state.reading.retention === "enabled";
    persistButton.hidden = !state.reading.canRequest;
    textButton.disabled = busy;
    jsonButton.disabled = busy;
    const reading = state.reading;
    if (state.phase === "checking") status.textContent = copy.busy;
    else if (state.phase === "requesting") status.textContent = copy.requesting;
    else if (state.outcome === "error") status.textContent = copy.error;
    else if (state.outcome === "unavailable") status.textContent = copy.unavailable;
    else status.textContent = copy[reading.retention] + (reading.readError ? ` ${copy.readError}` : "");
    const value = (bytes: number | null): string => bytes === null ? copy.unknown : `${bytes} B`;
    const retention = reading.retention === "UNKNOWN" ? copy.unknown : copy[reading.retention];
    definitions.replaceChildren(
      row(doc, copy.retention, retention),
      row(doc, copy.capacity, reading.capacity === "known" ? copy.capacityKnown : copy.unknown),
      row(doc, copy.used, value(reading.usedBytes)),
      row(doc, copy.free, value(reading.freeBytes)),
    );
  };

  const onRefresh = (): void => { void controller.refresh(); };
  const onRequest = (): void => { void controller.request(); };
  const onExport = (format: "txt" | "json"): void => {
    const today = new Date().toISOString().slice(0, 10);
    const report = createDurabilityReport(
      manifest, dashboard.getState().inventory, controller.getState().reading, today,
    );
    saveDurabilityReport(report, language, format, doc);
  };
  const onText = (): void => { onExport("txt"); };
  const onJson = (): void => { onExport("json"); };
  refreshButton.addEventListener("click", onRefresh);
  persistButton.addEventListener("click", onRequest);
  textButton.addEventListener("click", onText);
  jsonButton.addEventListener("click", onJson);
  const unsubscribe = controller.subscribe(render);
  render(controller.getState());
  void controller.refresh();
  return () => {
    closed = true;
    unsubscribe();
    controller.dispose();
    refreshButton.removeEventListener("click", onRefresh);
    persistButton.removeEventListener("click", onRequest);
    textButton.removeEventListener("click", onText);
    jsonButton.removeEventListener("click", onJson);
    section.remove();
  };
}
