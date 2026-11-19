import { createOfflineAction } from "./accessibilityGuard";
import type { DashboardModel, DashboardState } from "./offlineDashboard";
import type { Language, RegionManifest, StorageEstimate } from "./regionDownload";
import {
  browseRecovery, planRecoveryBatches, recoveryFingerprint,
  selectedRecoveryBatch, summarizeRecovery,
  type RecoveryFilter, type RecoveryOrder, type RecoveryPlan,
} from "./recoveryBatches";
import {
  recoveryBudgetText, recoveryCopy, recoveryReasonText, recoveryStateText,
} from "./recoveryBatchesCopy";
import { buildRecoveryExport, saveRecoveryExport } from "./recoveryBatchesExport";

const PAGE_SIZE = 12;

function node<K extends keyof HTMLElementTagNameMap>(
  doc: Document,
  tag: K,
  value?: string,
): HTMLElementTagNameMap[K] {
  const element = doc.createElement(tag);
  if (value !== undefined) element.textContent = value;
  return element;
}

function action(doc: Document, label: string): HTMLButtonElement {
  return createOfflineAction(doc, label);
}

function labelledSelect(
  doc: Document,
  description: string,
  options: readonly { readonly value: string; readonly label: string }[],
): { readonly root: HTMLLabelElement; readonly select: HTMLSelectElement } {
  const label = node(doc, "label");
  label.style.display = "inline-flex";
  label.style.flexDirection = "column";
  label.style.margin = "4px";
  label.style.gap = "4px";
  label.append(node(doc, "span", description));
  const select = node(doc, "select");
  select.style.minHeight = "44px";
  select.style.minWidth = "44px";
  for (const option of options) {
    const item = node(doc, "option", option.label);
    item.value = option.value;
    select.append(item);
  }
  label.append(select);
  return { root: label, select };
}

function itemDetail(doc: Document, label: string, value: string): HTMLElement {
  const holder = node(doc, "div");
  holder.append(node(doc, "dt", label), node(doc, "dd", value));
  return holder;
}

function formatBytes(value: number | null, language: Language): string {
  if (value === null || !Number.isSafeInteger(value) || value < 0) return "UNKNOWN";
  return `${new Intl.NumberFormat(language === "fr" ? "fr-CA" : "en-CA").format(value)} B`;
}

export interface RecoveryPanelView {
  readonly shown: boolean;
  readonly plan: RecoveryPlan;
  readonly search: string;
  readonly filter: RecoveryFilter;
  readonly order: RecoveryOrder;
  readonly start: number;
  readonly pending: boolean;
  readonly error: string;
}

/**
 * Mounts beside the existing offline dashboard. It never performs an implicit
 * download: the only path to downloadSelected is a deliberate batch button.
 * The panel does not alter cell storage or accessibility observations.
 */
export function mountOfflineRecoveryBatches(
  host: HTMLElement,
  manifest: RegionManifest,
  model: DashboardModel,
  language: Language,
  estimateStorage: () => Promise<StorageEstimate>,
): () => void {
  const doc = host.ownerDocument;
  const c = recoveryCopy(language);
  const section = node(doc, "section");
  const heading = node(doc, "h3", c.title);
  const introduction = node(doc, "p", c.intro);
  const toggle = action(doc, c.open);
  toggle.setAttribute("aria-expanded", "false");
  const content = node(doc, "div");
  const contentId = `offline-recovery-${Math.random().toString(36).slice(2)}`;
  content.id = contentId;
  toggle.setAttribute("aria-controls", contentId);
  content.hidden = true;
  section.append(heading, introduction, toggle, content);
  host.append(section);

  const live = node(doc, "p");
  live.setAttribute("role", "status");
  live.setAttribute("aria-live", "polite");
  live.setAttribute("aria-atomic", "true");
  const summary = node(doc, "dl");
  const guidance = node(doc, "p");
  const estimateButton = action(doc, c.refresh);
  const inventoryButton = action(doc, c.refreshInventory);
  const textButton = action(doc, c.exportText);
  const jsonButton = action(doc, c.exportJson);
  const searchLabel = node(doc, "label");
  searchLabel.style.display = "inline-flex";
  searchLabel.style.flexDirection = "column";
  searchLabel.append(node(doc, "span", c.search));
  const search = node(doc, "input");
  search.type = "search";
  search.maxLength = 160;
  search.style.minHeight = "44px";
  search.style.minWidth = "220px";
  searchLabel.append(search);
  const filterControl = labelledSelect(doc, c.filter, [
    { value: "all", label: c.all },
    { value: "needs-download", label: c.needsDownload },
    { value: "inspect", label: c.inspect },
    { value: "saved", label: c.saved },
  ]);
  const orderControl = labelledSelect(doc, c.order, [
    { value: "manifest", label: c.sortManifest },
    { value: "id", label: c.sortId },
    { value: "bytes-desc", label: c.sortLargest },
    { value: "bytes-asc", label: c.sortSmallest },
    { value: "reason", label: c.sortReason },
  ]);
  const tools = node(doc, "div");
  tools.append(estimateButton, inventoryButton, textButton, jsonButton);
  const selection = node(doc, "div");
  selection.append(searchLabel, filterControl.root, orderControl.root);
  const list = node(doc, "ol");
  const navigation = node(doc, "nav");
  navigation.setAttribute("aria-label", c.page);
  const previous = action(doc, c.previous);
  const next = action(doc, c.next);
  const position = node(doc, "span");
  navigation.append(previous, position, next);
  const batches = node(doc, "div");
  const notes = node(doc, "div");
  const disclaimer = node(doc, "p", c.disclaimer);
  content.append(live, summary, guidance, tools, selection, list,
    navigation, batches, notes, disclaimer, node(doc, "p", c.privacy));

  let disposed = false;
  let shown = false;
  let busy = false;
  let query = "";
  let filter: RecoveryFilter = "all";
  let order: RecoveryOrder = "manifest";
  let start = 0;
  let estimate: StorageEstimate = {};
  let error = "";
  let currentState: DashboardState = model.getState();
  let currentPlan = planRecoveryBatches(manifest, currentState.inventory, estimate);
  let runToken = 0;

  const renderRows = (): void => {
    const page = browseRecovery(currentPlan, { search: query, filter, order, start, limit: PAGE_SIZE });
    if (page.total <= start && start !== 0) {
      start = 0;
      return renderRows();
    }
    list.replaceChildren();
    list.start = start + 1;
    if (page.rows.length === 0) list.append(node(doc, "li", c.noMatch));
    for (const item of page.rows) {
      const entry = node(doc, "li");
      const strong = node(doc, "strong", item.id);
      const detail = node(doc, "dl");
      detail.append(
        itemDetail(doc, c.regionStatus, item.offlineStatus),
        itemDetail(doc, c.reason, recoveryReasonText(item.reason, language)),
        itemDetail(doc, c.listedSize, formatBytes(item.bytes, language)),
        itemDetail(doc, c.source, item.source?.source ?? "UNKNOWN"),
        itemDetail(doc, c.licence, item.source?.licence ?? "UNKNOWN"),
        itemDetail(doc, c.date, item.source?.date ?? "UNKNOWN"),
        itemDetail(doc, c.tier, item.tier),
      );
      const activity = item.action === "download" ? c.actionDownload :
        item.action === "inspect" ? c.actionInspect : c.actionNone;
      entry.append(strong, node(doc, "p", activity), detail);
      list.append(entry);
    }
    previous.disabled = start === 0;
    next.disabled = !page.hasNext;
    position.textContent = `${page.total === 0 ? 0 : start + 1}–${Math.min(start + PAGE_SIZE, page.total)} / ${page.total}`;
  };

  const renderBatches = (): void => {
    batches.replaceChildren();
    for (const batch of currentPlan.batches) {
      const wrapper = node(doc, "section");
      const title = node(doc, "h4", `${c.batch} ${batch.id}`);
      const details = node(doc, "dl");
      details.append(
        itemDetail(doc, c.count, String(batch.ids.length)),
        itemDetail(doc, c.listedSize, formatBytes(batch.bytes, language)),
        itemDetail(doc, c.source, batch.source.source),
        itemDetail(doc, c.licence, batch.source.licence),
        itemDetail(doc, c.date, batch.source.date),
        itemDetail(doc, c.tier, batch.tier),
      );
      const button = action(doc, c.retry);
      button.disabled = busy || currentState.phase !== "ready" ||
        currentPlan.state !== "ready" || batch.status !== "fits";
      const note = batch.status === "fits" ? c.batchFits :
        batch.status === "insufficient" ? c.batchLow : c.batchUnknown;
      button.setAttribute("aria-label", `${c.retry} ${batch.id}`);
      button.addEventListener("click", () => { void runBatch(batch.id); });
      wrapper.append(title, node(doc, "p", note), details, button);
      batches.append(wrapper);
    }
  };

  const render = (): void => {
    if (disposed) return;
    currentPlan = planRecoveryBatches(manifest, currentState.inventory, estimate);
    if (!shown) return;
    content.setAttribute("aria-busy", String(busy));
    live.textContent = busy ? c.running : error || recoveryStateText(currentPlan.state, language);
    guidance.textContent = recoveryBudgetText(currentPlan.budget, language);
    const counts = summarizeRecovery(currentPlan);
    summary.replaceChildren(
      itemDetail(doc, c.savedCount, String(counts.saved)),
      itemDetail(doc, c.candidateCount, String(counts.downloadable)),
      itemDetail(doc, c.blockedCount, String(currentPlan.blockedIds.length)),
      itemDetail(doc, c.missingCount, String(counts.missing)),
      itemDetail(doc, c.staleCount, String(counts.stale)),
      itemDetail(doc, c.unknownCount, String(counts.unknown)),
      itemDetail(doc, c.batchCount, String(counts.plannedBatches)),
      itemDetail(doc, c.estimatedFree, formatBytes(currentPlan.freeBytes, language)),
      itemDetail(doc, c.reserved, formatBytes(currentPlan.reserveBytes, language)),
      itemDetail(doc, c.suggested, formatBytes(currentPlan.suggestedBytes, language)),
    );
    estimateButton.disabled = busy || currentState.phase !== "ready";
    inventoryButton.disabled = busy || currentState.phase !== "ready";
    textButton.disabled = busy;
    jsonButton.disabled = busy;
    notes.replaceChildren(node(doc, "h4", c.notes));
    if (currentPlan.notes.length === 0) notes.append(node(doc, "p", c.emptyNotes));
    else {
      const ul = node(doc, "ul");
      for (const note of currentPlan.notes) ul.append(node(doc, "li", note));
      notes.append(ul);
    }
    renderRows();
    renderBatches();
  };

  /** Re-read before acting: a stale snapshot cannot launch the selected batch. */
  async function runBatch(batchId: string): Promise<void> {
    if (disposed || busy || currentState.phase !== "ready") return;
    const reviewed = currentPlan;
    const token = ++runToken;
    busy = true;
    error = "";
    render();
    try {
      await model.refresh();
      if (disposed || token !== runToken) return;
      const latest = model.getState();
      const fingerprint = recoveryFingerprint(manifest, latest.inventory);
      const ids = selectedRecoveryBatch(reviewed, batchId, fingerprint);
      if (latest.phase !== "ready" || ids.length === 0) {
        error = c.refreshBefore;
        return;
      }
      const reading = await estimateStorage().catch((): StorageEstimate => ({}));
      if (disposed || token !== runToken) return;
      estimate = reading;
      const freshPlan = planRecoveryBatches(manifest, latest.inventory, reading);
      const allowed = selectedRecoveryBatch(freshPlan, batchId, fingerprint);
      if (allowed.length === 0 || allowed.join("\u0000") !== ids.join("\u0000")) {
        error = c.locked;
        return;
      }
      await model.downloadSelected(allowed);
      if (disposed || token !== runToken) return;
      error = c.done;
    } catch {
      error = c.stopped;
    } finally {
      if (!disposed && token === runToken) {
        busy = false;
        currentState = model.getState();
        render();
      }
    }
  }

  async function updateEstimate(): Promise<void> {
    if (busy || disposed) return;
    const token = ++runToken;
    busy = true;
    render();
    try {
      estimate = await estimateStorage();
      error = "";
    } catch {
      estimate = {};
      error = c.quotaUnknown;
    } finally {
      if (!disposed && token === runToken) { busy = false; render(); }
    }
  }

  const onToggle = (): void => {
    shown = !shown;
    content.hidden = !shown;
    toggle.setAttribute("aria-expanded", String(shown));
    toggle.textContent = shown ? c.close : c.open;
    render();
  };
  const onEstimate = (): void => { void updateEstimate(); };
  const onInventory = (): void => { void model.refresh(); };
  const onSearch = (): void => { query = search.value; start = 0; render(); };
  const onFilter = (): void => { filter = filterControl.select.value as RecoveryFilter; start = 0; render(); };
  const onOrder = (): void => { order = orderControl.select.value as RecoveryOrder; start = 0; render(); };
  const onPrevious = (): void => { start = Math.max(0, start - PAGE_SIZE); render(); };
  const onNext = (): void => { start += PAGE_SIZE; render(); };
  const onExport = (format: "txt" | "json"): void => {
    try { saveRecoveryExport(buildRecoveryExport(currentPlan), language, format, doc); }
    catch { error = c.exportError; render(); }
  };
  const onText = (): void => { onExport("txt"); };
  const onJson = (): void => { onExport("json"); };
  toggle.addEventListener("click", onToggle);
  estimateButton.addEventListener("click", onEstimate);
  inventoryButton.addEventListener("click", onInventory);
  search.addEventListener("input", onSearch);
  filterControl.select.addEventListener("change", onFilter);
  orderControl.select.addEventListener("change", onOrder);
  previous.addEventListener("click", onPrevious);
  next.addEventListener("click", onNext);
  textButton.addEventListener("click", onText);
  jsonButton.addEventListener("click", onJson);
  const unsubscribe = model.subscribe((state) => { currentState = state; render(); });
  render();
  return () => {
    disposed = true;
    runToken += 1;
    unsubscribe();
    toggle.removeEventListener("click", onToggle);
    estimateButton.removeEventListener("click", onEstimate);
    inventoryButton.removeEventListener("click", onInventory);
    search.removeEventListener("input", onSearch);
    filterControl.select.removeEventListener("change", onFilter);
    orderControl.select.removeEventListener("change", onOrder);
    previous.removeEventListener("click", onPrevious);
    next.removeEventListener("click", onNext);
    textButton.removeEventListener("click", onText);
    jsonButton.removeEventListener("click", onJson);
    section.remove();
  };
}
