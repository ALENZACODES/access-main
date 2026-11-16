import { createOfflineAction, MIN_TARGET_PX } from "./accessibilityGuard";
import {
  isTriageFilter, isTriageOrder, normaliseTriageQuery,
  reconcileTriageSelection, selectableIds, selectedDownloadPlan,
  triageCounts, triagePage, TRIAGE_PAGE_SIZE,
  type TriageFilter, type TriageOrder,
} from "./cellTriage";
import { type DashboardModel, type DashboardState } from "./offlineDashboard";
import { formatBinaryBytes } from "./quotaPlanning";
import { type InventoryCell, type RegionInventory } from "./regionInventory";
import { type Language, type RegionManifest } from "./regionDownload";
import { triageCopy } from "./triageCopy";
import { estimatedCapacityLabel, planTriageSelection, suggestTriageFit } from "./triageBudget";
import { createTriageRecoveryList, saveTriageRecoveryList } from "./triageExport";

const MAX_SELECTION = 500;
const causeCopy = {
  en: { missing: "No saved copy", stale: "Saved copy differs", unreadable: "Saved copy could not be read", present: "Saved copy matches listing" },
  fr: { missing: "Aucune copie enregistrée", stale: "Copie enregistrée différente", unreadable: "Copie illisible", present: "Copie conforme à la liste" },
} as const;

function node<K extends keyof HTMLElementTagNameMap>(
  documentRef: Document,
  tag: K,
  value?: string,
): HTMLElementTagNameMap[K] {
  const element = documentRef.createElement(tag);
  if (value !== undefined) element.textContent = value;
  return element;
}

function labelledSelect(
  documentRef: Document,
  labelText: string,
  options: readonly { readonly value: string; readonly label: string }[],
): { readonly wrapper: HTMLLabelElement; readonly select: HTMLSelectElement } {
  const wrapper = node(documentRef, "label");
  wrapper.style.display = "inline-flex";
  wrapper.style.flexDirection = "column";
  wrapper.style.margin = "4px";
  const title = node(documentRef, "span", labelText);
  const select = node(documentRef, "select");
  select.style.minHeight = `${MIN_TARGET_PX}px`;
  select.style.minWidth = `${MIN_TARGET_PX}px`;
  select.style.padding = "8px";
  for (const option of options) {
    const child = node(documentRef, "option", option.label);
    child.value = option.value;
    select.append(child);
  }
  wrapper.append(title, select);
  return { wrapper, select };
}

function makeCheckbox(documentRef: Document, labelText: string): {
  readonly label: HTMLLabelElement;
  readonly input: HTMLInputElement;
} {
  const label = node(documentRef, "label");
  label.style.display = "inline-flex";
  label.style.alignItems = "center";
  label.style.gap = "8px";
  label.style.minHeight = `${MIN_TARGET_PX}px`;
  label.style.padding = "4px 8px";
  const input = node(documentRef, "input");
  input.type = "checkbox";
  input.style.minHeight = "24px";
  input.style.minWidth = "24px";
  label.append(input, node(documentRef, "span", labelText));
  return { label, input };
}

function appendFact(documentRef: Document, parent: HTMLElement, label: string, value: string): void {
  const line = node(documentRef, "div");
  const term = node(documentRef, "dt", label);
  const description = node(documentRef, "dd", value);
  description.style.marginInlineStart = "1em";
  line.append(term, description);
  parent.append(line);
}

function renderCell(
  documentRef: Document,
  cell: InventoryCell,
  language: Language,
  selected: boolean,
  enabled: boolean,
  onToggle: (id: string, next: boolean) => void,
): HTMLLIElement {
  const copy = triageCopy(language);
  const item = node(documentRef, "li");
  item.style.paddingBlock = "8px";
  const title = node(documentRef, "strong", cell.id);
  const status = node(documentRef, "p", cell.state === "saved" ? copy.saved : copy.unknown);
  const reason = node(documentRef, "p", causeCopy[language][cell.cause]);
  const metadata = node(documentRef, "dl");
  appendFact(documentRef, metadata, copy.source, cell.provenance.source);
  appendFact(documentRef, metadata, copy.licence, cell.provenance.licence);
  appendFact(documentRef, metadata, copy.date, cell.provenance.date);
  appendFact(documentRef, metadata, copy.size, formatBinaryBytes(cell.expectedBytes, language));
  item.append(title, status, reason, metadata);
  if (cell.state === "unknown") {
    const check = makeCheckbox(documentRef, `${copy.select}: ${cell.id}`);
    check.input.checked = selected;
    check.input.dataset.cellId = cell.id;
    check.input.disabled = !enabled;
    check.input.addEventListener("change", () => onToggle(cell.id, check.input.checked));
    item.prepend(check.label);
  }
  return item;
}

/**
 * Live, browser-only triage controls for the existing offline region dashboard.
 * Search does not fetch anything. Selection never changes accessibility facts.
 * Downloads happen only after the person activates the labelled button.
 */
export function mountOfflineTriage(
  root: HTMLElement,
  manifest: RegionManifest,
  model: DashboardModel,
  language: Language,
  auditReady: boolean,
): () => void {
  const documentRef = root.ownerDocument;
  const copy = triageCopy(language);
  const section = node(documentRef, "section");
  const heading = node(documentRef, "h3", copy.heading);
  const intro = node(documentRef, "p", copy.introduction);
  const searchLabel = node(documentRef, "label");
  searchLabel.style.display = "block";
  const searchTitle = node(documentRef, "span", copy.search);
  const searchInput = node(documentRef, "input");
  searchInput.type = "search";
  searchInput.maxLength = 160;
  searchInput.style.display = "block";
  searchInput.style.minHeight = `${MIN_TARGET_PX}px`;
  searchInput.style.width = "min(100%, 34rem)";
  searchInput.setAttribute("autocomplete", "off");
  searchLabel.append(searchTitle, searchInput);
  const hint = node(documentRef, "p", copy.searchHint);
  const filters = labelledSelect(documentRef, copy.filter, [
    { value: "all", label: copy.filterAll },
    { value: "unknown", label: copy.filterUnknown },
    { value: "saved", label: copy.filterSaved },
    { value: "missing", label: copy.filterMissing },
    { value: "stale", label: copy.filterStale },
    { value: "unreadable", label: copy.filterUnreadable },
  ]);
  const sorts = labelledSelect(documentRef, copy.order, [
    { value: "manifest", label: copy.orderManifest },
    { value: "id", label: copy.orderId },
    { value: "largest", label: copy.orderLargest },
    { value: "smallest", label: copy.orderSmallest },
    { value: "source", label: copy.orderSource },
    { value: "date", label: copy.orderDate },
  ]);
  const toolbar = node(documentRef, "div");
  toolbar.append(filters.wrapper, sorts.wrapper);
  const count = node(documentRef, "p");
  const selectedCount = node(documentRef, "p");
  const summary = node(documentRef, "p");
  const actions = node(documentRef, "div");
  const selectPageButton = createOfflineAction(documentRef, copy.selectPage);
  const allButton = createOfflineAction(documentRef, copy.allUnknown);
  const deselectPageButton = createOfflineAction(documentRef, copy.deselectPage);
  const clearButton = createOfflineAction(documentRef, copy.clear);
  const fitButton = createOfflineAction(documentRef, language === "fr" ? "Sélectionner un lot selon l’espace estimé" : "Select a batch for estimated space");
  const exportButton = createOfflineAction(documentRef, language === "fr" ? "Exporter la liste de récupération" : "Export recovery list");
  const retryButton = createOfflineAction(documentRef, copy.retry);
  actions.append(selectPageButton, allButton, fitButton, deselectPageButton, clearButton, exportButton, retryButton);
  const capacityMessage = node(documentRef, "p");
  const message = node(documentRef, "p");
  message.setAttribute("role", "status");
  message.setAttribute("aria-live", "polite");
  message.setAttribute("aria-atomic", "true");
  const list = node(documentRef, "ol");
  const navigation = node(documentRef, "nav");
  navigation.setAttribute("aria-label", copy.page);
  const previous = createOfflineAction(documentRef, copy.previous);
  const next = createOfflineAction(documentRef, copy.next);
  const position = node(documentRef, "span");
  navigation.append(previous, position, next);
  const scope = node(documentRef, "p", copy.scope);
  const policy = node(documentRef, "p", copy.policy);
  section.append(heading, intro, searchLabel, hint, toolbar, count, selectedCount,
    summary, actions, capacityMessage, message, list, navigation, scope, policy);
  root.append(section);

  let search = "";
  let filter: TriageFilter = "all";
  let order: TriageOrder = "manifest";
  let page = 0;
  let selected: ReadonlySet<string> = new Set();
  let lastInventory: RegionInventory | null = null;
  let removed = false;

  function render(state: DashboardState): void {
    if (removed) return;
    const inventory = state.inventory;
    const busy = state.phase === "checking" || state.phase === "downloading";
    const enabled = auditReady && !busy && inventory !== null;
    if (inventory !== null) selected = reconcileTriageSelection(inventory, selected);
    lastInventory = inventory;
    list.replaceChildren();
    if (inventory === null) {
      count.textContent = copy.disabled;
      summary.textContent = "";
      selectedCount.textContent = "";
      position.textContent = "";
      for (const button of [selectPageButton, allButton, fitButton, deselectPageButton, clearButton, exportButton, retryButton, previous, next]) {
        button.disabled = true;
      }
      return;
    }
    const result = triagePage(inventory, { text: search, filter, order, page, pageSize: TRIAGE_PAGE_SIZE });
    page = result.page;
    const counts = triageCounts(inventory);
    count.textContent = `${copy.count}: ${result.matched} / ${result.total}`;
    summary.textContent = `${copy.counts}: ${counts.saved} / ${counts.unknown} / ${counts.missing} / ${counts.stale} / ${counts.unreadable}`;
    const plan = selectedDownloadPlan(manifest, inventory, [...selected]);
    selectedCount.textContent = `${copy.selected}: ${plan.ids.length}. ${copy.unknownSize}: ${formatBinaryBytes(plan.totalBytes, language)}`;
    capacityMessage.textContent = estimatedCapacityLabel(planTriageSelection(inventory, state.plan, plan.ids), language);
    if (inventory.cells.length === 0) list.append(node(documentRef, "li", copy.emptyRegion));
    else if (result.matched === 0) list.append(node(documentRef, "li", copy.none));
    for (const cell of result.cells) {
      list.append(renderCell(documentRef, cell, language, selected.has(cell.id), enabled, (id, checked) => {
        const updated = new Set(selected);
        if (checked && updated.size >= MAX_SELECTION && !updated.has(id)) {
          message.textContent = copy.selectionLimit;
          render(model.getState());
          return;
        }
        if (checked) updated.add(id);
        else updated.delete(id);
        selected = updated;
        message.textContent = copy.result;
        render(model.getState());
        list.querySelectorAll<HTMLInputElement>("input[type=checkbox]").forEach((candidate) => {
          if (candidate.dataset.cellId === id) candidate.focus();
        });
      }));
    }
    position.textContent = `${copy.page}: ${result.page + 1} / ${result.pages} (${result.start}–${result.end})`;
    previous.disabled = result.page === 0;
    next.disabled = result.page >= result.pages - 1;
    selectPageButton.disabled = !enabled || result.cells.every((cell) => cell.state === "saved") || selected.size >= MAX_SELECTION;
    allButton.disabled = !enabled || result.matchedUnknown === 0 || selected.size >= MAX_SELECTION;
    fitButton.disabled = !enabled || suggestTriageFit(inventory, state.plan).length === 0 || selected.size >= MAX_SELECTION;
    deselectPageButton.disabled = !enabled || !result.cells.some((cell) => selected.has(cell.id));
    clearButton.disabled = !enabled || selected.size === 0;
    retryButton.disabled = !enabled || plan.ids.length === 0;
    exportButton.disabled = !enabled || plan.ids.length === 0;
    if (!auditReady) message.textContent = copy.auditBlocked;
  }

  function selectIds(ids: readonly string[]): void {
    if (!lastInventory || model.getState().phase !== "ready" || !auditReady) return;
    const valid = selectableIds(lastInventory, ids);
    const next = new Set(selected);
    for (const id of valid) {
      if (next.size >= MAX_SELECTION) break;
      next.add(id);
    }
    selected = next;
    message.textContent = selected.size === MAX_SELECTION ? copy.selectionLimit : copy.result;
    render(model.getState());
  }
  const onSearch = (): void => {
    search = normaliseTriageQuery(searchInput.value);
    page = 0;
    render(model.getState());
  };
  const onFilter = (): void => {
    if (isTriageFilter(filters.select.value)) filter = filters.select.value;
    page = 0;
    render(model.getState());
  };
  const onOrder = (): void => {
    if (isTriageOrder(sorts.select.value)) order = sorts.select.value;
    page = 0;
    render(model.getState());
  };
  const onSelectPage = (): void => {
    if (!lastInventory) return;
    selectIds(triagePage(lastInventory, { text: search, filter, order, page, pageSize: TRIAGE_PAGE_SIZE }).cells.map((cell) => cell.id));
  };
  const onAll = (): void => {
    if (!lastInventory) return;
    const matches = new Set(selectableIds(lastInventory, lastInventory.cells.map((cell) => cell.id)));
    const searchIds = new Set(lastInventory.cells.filter((cell) => {
      const partial: RegionInventory = { ...lastInventory!, cells: [cell] };
      return triagePage(partial, { text: search, filter, order, page: 0, pageSize: 1 }).matched === 1;
    }).map((cell) => cell.id));
    selectIds([...matches].filter((id) => searchIds.has(id)));
  };
  const onFit = (): void => {
    if (!lastInventory) return;
    selectIds(suggestTriageFit(lastInventory, model.getState().plan));
  };
  const onClearPage = (): void => {
    if (!lastInventory) return;
    const ids = triagePage(lastInventory, { text: search, filter, order, page, pageSize: TRIAGE_PAGE_SIZE }).cells.map((cell) => cell.id);
    const next = new Set(selected);
    for (const id of ids) next.delete(id);
    selected = next;
    message.textContent = copy.result;
    render(model.getState());
  };
  const onClear = (): void => {
    selected = new Set();
    message.textContent = copy.result;
    render(model.getState());
  };
  const onExport = (): void => {
    if (!lastInventory || model.getState().phase !== "ready" || !auditReady) return;
    const report = createTriageRecoveryList(lastInventory, [...selected], new Date().toISOString().slice(0, 10));
    if (report.rowCount > 0) saveTriageRecoveryList(report, language, documentRef);
  };
  const onRetry = (): void => {
    if (!lastInventory || model.getState().phase !== "ready" || !auditReady) return;
    const plan = selectedDownloadPlan(manifest, lastInventory, [...selected]);
    if (plan.ids.length === 0) {
      message.textContent = copy.badSelection;
      return;
    }
    message.textContent = copy.started;
    void model.downloadSelected(plan.ids);
  };
  const onPrevious = (): void => { if (page > 0) { page--; render(model.getState()); } };
  const onNext = (): void => { page++; render(model.getState()); };

  searchInput.addEventListener("input", onSearch);
  filters.select.addEventListener("change", onFilter);
  sorts.select.addEventListener("change", onOrder);
  selectPageButton.addEventListener("click", onSelectPage);
  allButton.addEventListener("click", onAll);
  fitButton.addEventListener("click", onFit);
  deselectPageButton.addEventListener("click", onClearPage);
  clearButton.addEventListener("click", onClear);
  exportButton.addEventListener("click", onExport);
  retryButton.addEventListener("click", onRetry);
  previous.addEventListener("click", onPrevious);
  next.addEventListener("click", onNext);
  const unsubscribe = model.subscribe(render);
  render(model.getState());
  return () => {
    removed = true;
    unsubscribe();
    searchInput.removeEventListener("input", onSearch);
    filters.select.removeEventListener("change", onFilter);
    sorts.select.removeEventListener("change", onOrder);
    selectPageButton.removeEventListener("click", onSelectPage);
    allButton.removeEventListener("click", onAll);
    fitButton.removeEventListener("click", onFit);
    deselectPageButton.removeEventListener("click", onClearPage);
    clearButton.removeEventListener("click", onClear);
    exportButton.removeEventListener("click", onExport);
    retryButton.removeEventListener("click", onRetry);
    previous.removeEventListener("click", onPrevious);
    next.removeEventListener("click", onNext);
    section.remove();
  };
}
