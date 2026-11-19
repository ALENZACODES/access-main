import { createOfflineAction } from "./accessibilityGuard";
import { type DashboardModel, type DashboardState } from "./offlineDashboard";
import { type Language, type RegionManifest } from "./regionDownload";
import { TRANSFER_COPY, transferCopy } from "./transferChecklistCopy";
import {
  buildTransferChecklist, compareTransferChecklist, encodeTransferChecklist,
  filteredChecklistRows, parseTransferChecklist, transferChecklistFilename,
  type ChecklistComparison, type TransferChecklist,
} from "./transferChecklist";

function el<K extends keyof HTMLElementTagNameMap>(documentRef: Document, tag: K, text?: string): HTMLElementTagNameMap[K] {
  const node = documentRef.createElement(tag);
  if (text !== undefined) node.textContent = text;
  return node;
}

function dataField(documentRef: Document, term: string, value: string): HTMLDivElement {
  const wrapper = el(documentRef, "div");
  wrapper.append(el(documentRef, "dt", term), el(documentRef, "dd", value));
  return wrapper;
}

function today(): string { return new Date().toISOString().slice(0, 10); }

function saveText(documentRef: Document, text: string, name: string): void {
  const blob = new Blob([text], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  try {
    const anchor = el(documentRef, "a");
    anchor.href = url;
    anchor.download = name;
    anchor.hidden = true;
    documentRef.body.append(anchor);
    try { anchor.click(); } finally { anchor.remove(); }
  } finally { URL.revokeObjectURL(url); }
}

/**
 * Explicitly user-controlled import: no uploads, storage writes or implicit
 * downloads. The imported file is only a description of another device.
 */
export function mountOfflineTransferChecklist(
  root: HTMLElement,
  manifest: RegionManifest,
  model: DashboardModel,
  language: Language,
): () => void {
  const doc = root.ownerDocument;
  const c = transferCopy(language);
  const section = el(doc, "section");
  const heading = el(doc, "h3", c.title);
  const intro = el(doc, "p", c.intro);
  const privacy = el(doc, "p", c.privacy);
  const status = el(doc, "p");
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  const controls = el(doc, "div");
  const saveButton = createOfflineAction(doc, c.save);
  const loadLabel = el(doc, "label", c.load);
  const file = el(doc, "input");
  file.type = "file";
  file.accept = ".json,application/json";
  file.style.minHeight = "44px";
  file.style.minWidth = "44px";
  loadLabel.style.display = "block";
  loadLabel.append(file);
  const clearButton = createOfflineAction(doc, c.clear);
  const searchLabel = el(doc, "label", c.search);
  const search = el(doc, "input");
  search.type = "search";
  search.maxLength = 160;
  search.style.minHeight = "44px";
  search.style.minWidth = "44px";
  searchLabel.append(search);
  const filterLabel = el(doc, "label", c.filter);
  const filter = el(doc, "select");
  filter.style.minHeight = "44px";
  filter.style.minWidth = "44px";
  const filters = [
    ["all", c.all], ["changed", c.changed], ["UNKNOWN", c.onlyUnknown],
  ] as const;
  for (const [value, label] of filters) {
    const option = el(doc, "option", label);
    option.value = value;
    filter.append(option);
  }
  filterLabel.append(filter);
  const results = el(doc, "div");
  const navigation = el(doc, "div");
  const back = createOfflineAction(doc, c.back);
  const next = createOfflineAction(doc, c.next);
  const count = el(doc, "span");
  navigation.append(back, count, next);
  controls.append(saveButton, loadLabel, clearButton, searchLabel, filterLabel);
  section.append(heading, intro, privacy, controls, status, results, navigation);
  root.append(section);

  let previous: TransferChecklist | null = null;
  let comparison: ChecklistComparison | null = null;
  let state: DashboardState = model.getState();
  let page = 0;
  let disposed = false;
  let requestId = 0;

  const render = (): void => {
    results.replaceChildren();
    const busy = state.phase === "checking" || state.phase === "downloading";
    saveButton.disabled = busy || state.inventory === null;
    const ready = comparison !== null;
    clearButton.disabled = !ready;
    search.disabled = !ready;
    filter.disabled = !ready;
    navigation.hidden = !ready;
    if (!ready || comparison === null) return;
    const selected = filter.value === "changed" || filter.value === "UNKNOWN" ? filter.value : "all";
    const visible = filteredChecklistRows(comparison, selected, search.value, page);
    const totalPages = visible.pages;
    page = Math.max(0, Math.min(page, totalPages - 1));
    count.textContent = `${c.count}${language === "fr" ? "\u00a0:" : ":"} ${visible.total}`;
    back.disabled = page === 0;
    next.disabled = page + 1 >= totalPages;
    if (visible.rows.length === 0) results.append(el(doc, "p", c.empty));
    const list = el(doc, "ol");
    for (const row of visible.rows) {
      const item = el(doc, "li");
      const headingCell = el(doc, "h4", row.id);
      const statusText = row.currentStatus === "saved" ? c.saved : c.unknown;
      const changeLabel = row.kind === "same" ? c.changeSame :
        row.kind === "new" ? c.changeNew : row.kind === "removed" ? c.changeRemoved :
        row.kind === "changed" ? c.changeChanged : c.changeUnknown;
      const dl = el(doc, "dl");
      const record = row.current ?? row.previous;
      dl.append(dataField(doc, c.status, statusText), dataField(doc, c.kind, changeLabel));
      if (record !== null) {
        dl.append(dataField(doc, c.source, record.source),
          dataField(doc, c.licence, record.licence),
          dataField(doc, c.date, record.date),
          dataField(doc, c.tier, record.tier === "UNKNOWN" ? c.unknown : record.tier),
          dataField(doc, c.size, String(record.expectedBytes)));
      }
      item.append(headingCell, dl);
      list.append(item);
    }
    results.append(list, el(doc, "p", c.explanation));
  };

  const onSave = (): void => {
    try {
      const checklist = buildTransferChecklist(manifest, state.inventory, today());
      saveText(doc, encodeTransferChecklist(checklist), transferChecklistFilename(manifest.regionId, today()));
    } catch { status.textContent = c.error; }
  };
  const onImport = (): void => {
    const chosen = file.files?.[0];
    if (!chosen) return;
    const currentRequest = ++requestId;
    if (chosen.size > 256 * 1024) {
      status.textContent = c.error;
      file.value = "";
      return;
    }
    void chosen.text().then((text) => {
      if (disposed || currentRequest !== requestId) return;
      previous = parseTransferChecklist(text);
      comparison = compareTransferChecklist(previous, manifest, state.inventory, today());
      page = 0;
      status.textContent = comparison.notes.includes("region-mismatch") ? c.region : c.ready;
      render();
    }).catch(() => {
      if (disposed || currentRequest !== requestId) return;
      previous = null;
      comparison = null;
      status.textContent = c.error;
      render();
    });
  };
  const onClear = (): void => {
    ++requestId;
    previous = null;
    comparison = null;
    file.value = "";
    status.textContent = "";
    page = 0;
    render();
  };
  const onFilter = (): void => { page = 0; render(); };
  const onBack = (): void => { page -= 1; render(); };
  const onNext = (): void => { page += 1; render(); };
  const unsubscribe = model.subscribe((nextState) => {
    state = nextState;
    if (previous) {
      try { comparison = compareTransferChecklist(previous, manifest, state.inventory, today()); }
      catch { comparison = null; status.textContent = c.error; }
    }
    render();
  });
  saveButton.addEventListener("click", onSave);
  file.addEventListener("change", onImport);
  clearButton.addEventListener("click", onClear);
  search.addEventListener("input", onFilter);
  filter.addEventListener("change", onFilter);
  back.addEventListener("click", onBack);
  next.addEventListener("click", onNext);
  render();
  return () => {
    disposed = true;
    ++requestId;
    unsubscribe();
    saveButton.removeEventListener("click", onSave);
    file.removeEventListener("change", onImport);
    clearButton.removeEventListener("click", onClear);
    search.removeEventListener("input", onFilter);
    filter.removeEventListener("change", onFilter);
    back.removeEventListener("click", onBack);
    next.removeEventListener("click", onNext);
    section.remove();
  };
}

/** Copy completeness is independently checked in the test runner. */
export function transferCopyKeys(): readonly string[] {
  return Object.keys(TRANSFER_COPY.en);
}
