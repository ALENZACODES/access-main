import { MIN_TARGET_PX, createOfflineAction } from "./accessibilityGuard";
import {
  boundedCleanupSelection, browseCleanup,
  planCellCleanup, reconcileCleanupSelection, type CleanupFilter, type CleanupOrder,
} from "./cleanupPlan";
import { createCleanupController, type CleanupState } from "./cleanupController";
import { cleanupCopy } from "./cleanupCopy";
import { createCleanupReceipt, cleanupReceiptCopy, saveCleanupReceipt } from "./cleanupReceipt";
import { type DashboardModel, type DashboardState } from "./offlineDashboard";
import { type PersistentCellStore } from "./indexedCellStore";
import { formatBinaryBytes } from "./quotaPlanning";
import { type RegionInventory } from "./regionInventory";
import { type Language, type RegionManifest, type CellStore } from "./regionDownload";

function node<K extends keyof HTMLElementTagNameMap>(
  documentRef: Document, tag: K, text?: string,
): HTMLElementTagNameMap[K] {
  const element = documentRef.createElement(tag);
  if (text !== undefined) element.textContent = text;
  return element;
}

function labelledSelect(
  documentRef: Document,
  description: string,
  choices: readonly { readonly value: string; readonly text: string }[],
): { readonly label: HTMLLabelElement; readonly select: HTMLSelectElement } {
  const label = node(documentRef, "label");
  label.style.display = "inline-flex";
  label.style.flexDirection = "column";
  label.style.margin = "4px";
  const select = node(documentRef, "select");
  select.style.minHeight = `${MIN_TARGET_PX}px`;
  select.style.minWidth = `${MIN_TARGET_PX}px`;
  select.style.padding = "8px";
  for (const choice of choices) {
    const option = node(documentRef, "option", choice.text);
    option.value = choice.value;
    select.append(option);
  }
  label.append(node(documentRef, "span", description), select);
  return { label, select };
}

function fact(doc: Document, dl: HTMLElement, label: string, value: string): void {
  const row = node(doc, "div");
  const dt = node(doc, "dt", label);
  const dd = node(doc, "dd", value);
  dd.style.marginInlineStart = "1em";
  row.append(dt, dd);
  dl.append(row);
}

function supportsRemoval(store: CellStore): store is PersistentCellStore {
  const candidate = store as Partial<PersistentCellStore>;
  return typeof candidate.remove === "function" && typeof candidate.close === "function";
}

/**
 * A device-local, explicitly user-activated cleanup panel. No auto-delete,
 * location lookup, remote request, or storage scheduling is performed.
 *
 * The panel subscribes to the mounted dashboard model rather than creating a
 * second inventory authority. A destructive action requires two button clicks:
 * preview, then confirm. Network/download actions remain in the dashboard.
 */
export function mountOfflineCleanup(
  root: HTMLElement,
  manifest: RegionManifest,
  model: DashboardModel,
  store: CellStore,
  language: Language,
  auditReady: boolean,
): () => void {
  const doc = root.ownerDocument;
  const copy = cleanupCopy(language);
  const section = node(doc, "section");
  section.setAttribute("aria-label", copy.title);
  section.style.marginBlock = "24px";
  const heading = node(doc, "h3", copy.title);
  const introduction = node(doc, "p", copy.intro);
  const privacy = node(doc, "p", copy.privacy);
  const controls = node(doc, "div");
  const searchLabel = node(doc, "label");
  const searchTitle = node(doc, "span", copy.search);
  const search = node(doc, "input");
  search.type = "search";
  search.maxLength = 160;
  search.autocomplete = "off";
  search.style.minHeight = `${MIN_TARGET_PX}px`;
  search.style.width = "min(100%, 34rem)";
  search.style.display = "block";
  searchLabel.append(searchTitle, search);
  const filterControl = labelledSelect(doc, copy.filter, [
    { value: "all", text: copy.all },
    { value: "saved", text: copy.saved },
    { value: "unknown", text: copy.unknown },
    { value: "stale", text: copy.stale },
    { value: "unreadable", text: copy.unreadable },
  ]);
  const orderControl = labelledSelect(doc, copy.order, [
    { value: "manifest", text: copy.manifest },
    { value: "largest", text: copy.largest },
    { value: "smallest", text: copy.smallest },
    { value: "source", text: copy.sourceSort },
  ]);
  controls.append(searchLabel, filterControl.label, orderControl.label);
  const summary = node(doc, "p");
  const selectedLabel = node(doc, "p");
  const actions = node(doc, "div");
  const selectPage = createOfflineAction(doc, copy.selectPage);
  const selectStale = createOfflineAction(doc, copy.selectStale);
  const clear = createOfflineAction(doc, copy.clear);
  const previewButton = createOfflineAction(doc, copy.preview);
  actions.append(selectPage, selectStale, clear, previewButton);
  const list = node(doc, "ol");
  const pagination = node(doc, "nav");
  pagination.setAttribute("aria-label", copy.page);
  const previous = createOfflineAction(doc, copy.previous);
  const next = createOfflineAction(doc, copy.next);
  const pageLabel = node(doc, "span");
  pagination.append(previous, pageLabel, next);
  const feedback = node(doc, "p");
  feedback.setAttribute("role", "status");
  feedback.setAttribute("aria-live", "polite");
  feedback.setAttribute("aria-atomic", "true");
  const review = node(doc, "div");
  review.setAttribute("role", "group");
  review.setAttribute("aria-label", copy.headingPreview);
  const reviewTitle = node(doc, "h4", copy.headingPreview);
  const reviewHelp = node(doc, "p", copy.previewHint);
  const reviewFacts = node(doc, "dl");
  const reviewList = node(doc, "ol");
  const confirm = createOfflineAction(doc, copy.confirm);
  const cancel = createOfflineAction(doc, copy.cancel);
  const dismiss = createOfflineAction(doc, copy.dismiss);
  const receiptButton = createOfflineAction(doc, cleanupReceiptCopy(language).button);
  review.append(reviewTitle, reviewHelp, reviewFacts, reviewList, confirm, cancel, dismiss, receiptButton);
  const reminder = node(doc, "p", copy.offlineReminder);
  section.append(heading, introduction, privacy, controls, summary, selectedLabel,
    actions, feedback, list, pagination, review, reminder);
  root.append(section);

  const permittedStore = supportsRemoval(store) ? store : null;
  const controller = permittedStore ? createCleanupController(manifest, permittedStore) : null;
  let filter: CleanupFilter = "all";
  let order: CleanupOrder = "manifest";
  let page = 0;
  let query = "";
  let selected: readonly string[] = [];
  let latest: RegionInventory | null = null;
  let removed = false;

  function renderPreview(cleanup: CleanupState | null): void {
    review.hidden = cleanup?.phase !== "awaiting-confirmation" &&
      cleanup?.phase !== "removing" && cleanup?.phase !== "finished" &&
      cleanup?.phase !== "failed";
    reviewFacts.replaceChildren();
    reviewList.replaceChildren();
    confirm.hidden = cleanup?.phase !== "awaiting-confirmation";
    cancel.hidden = cleanup?.phase !== "awaiting-confirmation" && cleanup?.phase !== "removing";
    dismiss.hidden = cleanup?.phase === "awaiting-confirmation" || cleanup?.phase === "removing";
    receiptButton.hidden = !cleanup?.outcome;
    if (!cleanup) return;
    const preview = cleanup.preview;
    if (preview) {
      fact(doc, reviewFacts, copy.impact, String(preview.removableCount));
      fact(doc, reviewFacts, copy.affectedSaved, String(preview.savedCount));
      fact(doc, reviewFacts, copy.affectedUnknown, String(preview.unknownCount));
      fact(doc, reviewFacts, copy.possibleBytes,
        preview.bytesKnown ? formatBinaryBytes(preview.possibleBytes, language) : copy.unknown);
      reviewFacts.append(node(doc, "p", copy.estimate));
      for (const candidate of preview.candidates) {
        const li = node(doc, "li", candidate.id);
        const metadata = node(doc, "dl");
        fact(doc, metadata, copy.source, candidate.provenance.source);
        fact(doc, metadata, copy.licence, candidate.provenance.licence);
        fact(doc, metadata, copy.date, candidate.provenance.date);
        li.append(metadata);
        reviewList.append(li);
      }
    }
    if (cleanup.outcome) {
      fact(doc, reviewFacts, copy.removed, String(cleanup.outcome.deleted.length));
      fact(doc, reviewFacts, copy.retained, String(cleanup.outcome.retained.length));
      for (const id of cleanup.outcome.retained) reviewList.append(node(doc, "li", id));
    }
    confirm.disabled = cleanup.phase !== "awaiting-confirmation" || !preview?.ready;
    cancel.disabled = cleanup.phase !== "awaiting-confirmation" && cleanup.phase !== "removing";
  }

  function currentBusy(state: DashboardState): boolean {
    const phase = controller?.state().phase;
    return state.phase !== "ready" || phase === "inspecting" ||
      phase === "awaiting-confirmation" || phase === "removing";
  }

  function render(state: DashboardState): void {
    if (removed) return;
    latest = state.inventory;
    if (latest) selected = reconcileCleanupSelection(latest, selected);
    const cleanup = controller?.state() ?? null;
    const enabled = !!permittedStore && auditReady && !!latest && !currentBusy(state);
    list.replaceChildren();
    const display = latest ? browseCleanup(latest, {
      text: query, filter, order, page, pageSize: 10,
    }) : null;
    page = display?.page ?? 0;
    summary.textContent = `${copy.count}${language === "fr" ? "\u00a0:" : ":"} ${display?.matched ?? 0} / ${display?.total ?? 0}`;
    selectedLabel.textContent = `${copy.selected}${language === "fr" ? "\u00a0:" : ":"} ${selected.length}`;
    if (!display || display.total === 0) list.append(node(doc, "li", copy.empty));
    else if (display.matched === 0) list.append(node(doc, "li", copy.none));
    if (display) for (const cell of display.cells) {
      const li = node(doc, "li");
      li.style.paddingBlock = "8px";
      const label = node(doc, "label");
      label.style.display = "inline-flex";
      label.style.alignItems = "center";
      label.style.gap = "8px";
      label.style.minHeight = `${MIN_TARGET_PX}px`;
      label.style.padding = "4px 8px";
      const checkbox = node(doc, "input");
      checkbox.type = "checkbox";
      checkbox.style.minWidth = "24px";
      checkbox.style.minHeight = "24px";
      checkbox.checked = selected.includes(cell.id);
      checkbox.disabled = !enabled || !cell.removable;
      checkbox.dataset.cleanupCell = cell.id;
      label.append(checkbox, node(doc, "span", `${copy.select}: ${cell.id}`));
      const cause = cell.reason === "saved" ? copy.present :
        cell.reason === "stale" ? copy.differs :
          cell.reason === "unreadable" ? copy.unreadableStatus : copy.missing;
      const explanation = node(doc, "p", cause);
      const details = node(doc, "dl");
      fact(doc, details, copy.source, cell.provenance.source);
      fact(doc, details, copy.licence, cell.provenance.licence);
      fact(doc, details, copy.date, cell.provenance.date);
      fact(doc, details, copy.size, formatBinaryBytes(cell.expectedBytes, language));
      checkbox.addEventListener("change", () => {
        if (!latest || !enabled) return;
        const ids = checkbox.checked ? [...selected, cell.id] : selected.filter((id) => id !== cell.id);
        const bounded = boundedCleanupSelection(latest, ids);
        if (checkbox.checked && !bounded.includes(cell.id)) feedback.textContent = copy.selectionLimit;
        selected = bounded;
        render(model.getState());
        list.querySelectorAll<HTMLInputElement>("input[type=checkbox]").forEach((candidate) => {
          if (candidate.dataset.cleanupCell === cell.id) candidate.focus();
        });
      });
      li.append(label, explanation, details);
      list.append(li);
    }
    pageLabel.textContent = `${copy.page}${language === "fr" ? "\u00a0:" : ":"} ${(display?.page ?? 0) + 1} / ${display?.pages ?? 1}`;
    previous.disabled = !display || display.page === 0;
    next.disabled = !display || display.page >= display.pages - 1;
    selectPage.disabled = !enabled || !display?.cells.some((cell) => cell.removable);
    selectStale.disabled = !enabled || !latest?.cells.some((cell) => cell.cause === "stale");
    clear.disabled = !enabled || selected.length === 0;
    previewButton.disabled = !enabled || selected.length === 0;
    search.disabled = !latest;
    filterControl.select.disabled = !latest;
    orderControl.select.disabled = !latest;
    const busy = cleanup?.phase === "inspecting" || cleanup?.phase === "removing";
    section.setAttribute("aria-busy", String(busy));
    if (!permittedStore) feedback.textContent = copy.unavailable;
    else if (!auditReady) feedback.textContent = copy.auditBlocked;
    else if (state.phase === "downloading") feedback.textContent = copy.busy;
    else if (cleanup?.phase === "inspecting") feedback.textContent = copy.working;
    else if (cleanup?.phase === "awaiting-confirmation") feedback.textContent = copy.waiting;
    else if (cleanup?.phase === "removing") feedback.textContent = `${copy.removing} ${cleanup.progress.completed} / ${cleanup.progress.total}`;
    else if (cleanup?.outcome?.stop === "complete") feedback.textContent = copy.done;
    else if (cleanup?.outcome?.stop === "changed") feedback.textContent = copy.changed;
    else if (cleanup?.outcome?.stop === "interrupted") feedback.textContent = copy.interrupted;
    else if (cleanup?.phase === "failed") feedback.textContent = copy.failed;
    renderPreview(cleanup);
  }

  const onSearch = (): void => { query = search.value; page = 0; render(model.getState()); };
  const onFilter = (): void => { filter = filterControl.select.value as CleanupFilter; page = 0; render(model.getState()); };
  const onOrder = (): void => { order = orderControl.select.value as CleanupOrder; page = 0; render(model.getState()); };
  const onPrevious = (): void => { page = Math.max(0, page - 1); render(model.getState()); };
  const onNext = (): void => { page += 1; render(model.getState()); };
  const onSelectPage = (): void => {
    if (!latest || currentBusy(model.getState())) return;
    const cells = browseCleanup(latest, { text: query, filter, order, page, pageSize: 10 }).cells;
    selected = boundedCleanupSelection(latest, [...selected, ...cells.filter((c) => c.removable).map((c) => c.id)]);
    render(model.getState());
  };
  const onSelectStale = (): void => {
    if (!latest || currentBusy(model.getState())) return;
    selected = boundedCleanupSelection(latest, [...selected,
      ...latest.cells.filter((c) => c.cause === "stale").map((c) => c.id)]);
    render(model.getState());
  };
  const onClear = (): void => { selected = []; render(model.getState()); };
  const onPreview = (): void => {
    if (!controller || !latest || currentBusy(model.getState()) || !auditReady) return;
    const plan = planCellCleanup(manifest, latest, selected);
    if (!plan.ready || !plan.removableCount) { feedback.textContent = copy.unsafe; return; }
    void controller.prepare(selected);
  };
  const onConfirm = (): void => {
    if (!controller || model.getState().phase !== "ready") return;
    void controller.confirm().then(async (result) => {
      if (!removed && result) {
        selected = result.retained;
        await model.refresh();
      }
    });
  };
  const onCancel = (): void => { controller?.cancel(); render(model.getState()); };
  const onDismiss = (): void => { controller?.dismiss(); render(model.getState()); };
  const onReceipt = (): void => {
    const result = controller?.state().outcome;
    if (!result) return;
    try {
      const receipt = createCleanupReceipt(manifest, result, new Date().toISOString().slice(0, 10));
      saveCleanupReceipt(receipt, language, "txt", doc);
    } catch {
      feedback.textContent = cleanupReceiptCopy(language).unavailable;
    }
  };
  search.addEventListener("input", onSearch);
  filterControl.select.addEventListener("change", onFilter);
  orderControl.select.addEventListener("change", onOrder);
  previous.addEventListener("click", onPrevious);
  next.addEventListener("click", onNext);
  selectPage.addEventListener("click", onSelectPage);
  selectStale.addEventListener("click", onSelectStale);
  clear.addEventListener("click", onClear);
  previewButton.addEventListener("click", onPreview);
  confirm.addEventListener("click", onConfirm);
  cancel.addEventListener("click", onCancel);
  dismiss.addEventListener("click", onDismiss);
  receiptButton.addEventListener("click", onReceipt);
  const unsubModel = model.subscribe(render);
  const unsubCleanup = controller?.subscribe(() => render(model.getState()));
  render(model.getState());
  return () => {
    removed = true;
    unsubModel();
    unsubCleanup?.();
    controller?.dispose();
    section.remove();
  };
}
