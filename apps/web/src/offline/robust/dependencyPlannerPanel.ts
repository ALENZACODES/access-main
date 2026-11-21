import { createOfflineAction } from "./accessibilityGuard";
import type { DashboardModel } from "./offlineDashboard";
import type { Language, RegionManifest } from "./regionDownload";
import {
  addDependency, assessDependency, createDependencyBook, editDependency, pageDependencies, parseDependencyBook,
  removeDependency, summarizeDependencies,
  type DependencyBook, type DependencyCategory, type DependencyFilter, type DependencyPriority,
  type DependencyProgress, type DependencySort,
} from "./dependencyPlanner";
import {
  DEPENDENCY_CATEGORIES, DEPENDENCY_COPY, DEPENDENCY_FILTERS, DEPENDENCY_PRIORITIES,
  DEPENDENCY_PROGRESS, DEPENDENCY_SORTS, dependencyReason,
} from "./dependencyPlannerCopy";
import { dependencyFileName, dependencyReportJson, dependencyReportText, downloadDependencyFile } from "./dependencyPlannerExport";

function el<K extends keyof HTMLElementTagNameMap>(doc: Document, tag: K, content?: string): HTMLElementTagNameMap[K] {
  const node = doc.createElement(tag);
  if (content !== undefined) node.textContent = content;
  return node;
}
function action(doc: Document, caption: string): HTMLButtonElement {
  const result = createOfflineAction(doc, caption);
  result.type = "button";
  result.style.minHeight = "44px";
  result.style.minWidth = "44px";
  return result;
}
function labelled<K extends "input" | "textarea">(doc: Document, tag: K, caption: string, max: number): {
  readonly wrapper: HTMLLabelElement; readonly control: HTMLElementTagNameMap[K];
} {
  const wrapper = el(doc, "label", caption);
  const field = el(doc, tag);
  field.maxLength = max;
  field.style.minHeight = "44px";
  wrapper.append(field);
  return { wrapper, control: field };
}
function selectOf<T extends string>(doc: Document, caption: string, options: Record<T, string>): {
  readonly wrapper: HTMLLabelElement; readonly control: HTMLSelectElement;
} {
  const wrapper = el(doc, "label", caption);
  const control = el(doc, "select");
  control.style.minHeight = "44px";
  for (const [value, name] of Object.entries(options) as Array<[T, string]>) {
    const option = el(doc, "option", name);
    option.value = value;
    control.append(option);
  }
  wrapper.append(control);
  return { wrapper, control };
}
export function mountOfflineDependencyPlanner(root: HTMLElement, manifest: RegionManifest,
  model: DashboardModel, language: Language): () => void {
  const doc = root.ownerDocument;
  const copy = DEPENDENCY_COPY[language];
  const colon = language === "fr" ? "\u00a0: " : ": ";
  const section = el(doc, "section");
  section.className = "panel stack";
  section.setAttribute("aria-label", copy.title);
  const heading = el(doc, "h3", copy.title);
  const intro = el(doc, "p", copy.intro);
  const caution = el(doc, "p", copy.caution);
  const status = el(doc, "p", copy.dataOnly);
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  const baseDate = "2026-01-01";
  let book: DependencyBook = createDependencyBook(manifest.regionId, manifest.regionId, baseDate);
  let serial = 0;
  let disposed = false;
  let currentPage = 0;
  let selected: string | null = null;
  const subscriptions: Array<() => void> = [];
  const rowSubscriptions: Array<() => void> = [];
  const listen = (element: HTMLElement, type: string, handler: EventListener): void => {
    element.addEventListener(type, handler);
    subscriptions.push(() => element.removeEventListener(type, handler));
  };
  const listenRow = (element: HTMLElement, type: string, handler: EventListener): void => {
    element.addEventListener(type, handler);
    rowSubscriptions.push(() => element.removeEventListener(type, handler));
  };
  const clearRows = (): void => {
    for (const removeHandler of rowSubscriptions) removeHandler();
    rowSubscriptions.length = 0;
  };
  const inputs = el(doc, "div");
  inputs.className = "stack";
  const title = labelled(doc, "input", copy.addTitle, 140);
  const purpose = labelled(doc, "textarea", copy.purpose, 1200);
  const note = labelled(doc, "textarea", copy.note, 1200);
  const cellIds = labelled(doc, "input", copy.cellId, 1200);
  const category = selectOf<DependencyCategory>(doc, copy.category, DEPENDENCY_CATEGORIES[language]);
  const priority = selectOf<DependencyPriority>(doc, copy.priority, DEPENDENCY_PRIORITIES[language]);
  const progress = selectOf<DependencyProgress>(doc, copy.progress, DEPENDENCY_PROGRESS[language]);
  const save = action(doc, copy.add);
  const cancel = action(doc, copy.cancel);
  const remove = action(doc, copy.remove);
  const clear = action(doc, copy.clear);
  const controls = el(doc, "div");
  controls.className = "button-row";
  controls.append(save, cancel, remove, clear);
  inputs.append(title.wrapper, purpose.wrapper, cellIds.wrapper, category.wrapper, priority.wrapper, progress.wrapper, note.wrapper, controls);
  const exportControls = el(doc, "div");
  exportControls.className = "button-row";
  const json = action(doc, copy.exportJson);
  const text = action(doc, copy.exportText);
  const importButton = action(doc, copy.importJson);
  const importInput = el(doc, "input");
  importInput.type = "file";
  importInput.accept = ".json,application/json";
  importInput.style.minHeight = "44px";
  importInput.setAttribute("aria-label", copy.importJson);
  exportControls.append(json, text, importInput, importButton);
  const filters = el(doc, "div");
  filters.className = "button-row";
  const search = labelled(doc, "input", copy.search, 160);
  const filter = selectOf<DependencyFilter>(doc, copy.filter, DEPENDENCY_FILTERS[language]);
  const sort = selectOf<DependencySort>(doc, copy.sort, DEPENDENCY_SORTS[language]);
  filters.append(search.wrapper, filter.wrapper, sort.wrapper);
  const summary = el(doc, "p");
  summary.setAttribute("role", "status");
  const rows = el(doc, "ol");
  const pager = el(doc, "div");
  pager.className = "button-row";
  const previous = action(doc, copy.previous);
  const next = action(doc, copy.next);
  const pageMessage = el(doc, "span");
  pager.append(previous, pageMessage, next);
  section.append(heading, intro, caution, status, inputs, exportControls, filters, summary, rows, pager);
  root.append(section);
  const today = (): string => {
    // User-directed action date, not a scheduled workflow or a source-observation timestamp.
    const date = new Date().toISOString().slice(0, 10);
    return date >= baseDate ? date : baseDate;
  };
  const clearForm = (): void => {
    selected = null;
    title.control.value = "";
    purpose.control.value = "";
    cellIds.control.value = "";
    category.control.value = "arrival";
    priority.control.value = "essential";
    progress.control.value = "not-reviewed";
    note.control.value = "";
    save.textContent = copy.add;
    remove.disabled = true;
  };
  const refresh = (): void => {
    if (disposed) return;
    const assessments = assessDependency(book, manifest, model.getState().inventory);
    const stats = summarizeDependencies(assessments);
    summary.textContent = `${copy.summary}${colon}${stats.total}. ${copy.essentials}${colon}${stats.essentials}. ${copy.saved}${colon}${stats.savedInformation}. ${copy.unknown}${colon}${stats.unknownInformation}. ${copy.followUp}${colon}${stats.requireFollowUp}. ${copy.unknownPhysical}`;
    const page = pageDependencies(assessments, { filter: filter.control.value as DependencyFilter,
      sort: sort.control.value as DependencySort, query: search.control.value, offset: currentPage * 10, limit: 10 });
    if (currentPage > 0 && page.rows.length === 0) {
      currentPage -= 1;
      refresh();
      return;
    }
    clearRows();
    rows.replaceChildren();
    if (page.rows.length === 0) rows.append(el(doc, "li", copy.noItems));
    for (const item of page.rows) {
      const entry = el(doc, "li");
      entry.className = "stack";
      const name = el(doc, "h4", item.title);
      const state = el(doc, "p", `${DEPENDENCY_PRIORITIES[language][item.priority]} — ${item.availability}. ${copy.unknownPhysical}`);
      const followUp = el(doc, "p", item.followUp ? copy.followUp : copy.dataOnly);
      const edit = action(doc, `${copy.edit}${colon}${item.title}`);
      listenRow(edit, "click", () => {
        const original = book.items.find((value) => value.id === item.itemId);
        if (!original) return;
        selected = original.id;
        title.control.value = original.title;
        purpose.control.value = original.purpose;
        cellIds.control.value = original.cellIds.join(", ");
        category.control.value = original.category;
        priority.control.value = original.priority;
        progress.control.value = original.progress;
        note.control.value = original.note;
        save.textContent = copy.save;
        remove.disabled = false;
        title.control.focus();
      });
      entry.append(name, state, followUp);
      for (const cell of item.cells) {
        const details = el(doc, "p", `${copy.cellId}${colon}${cell.cellId} — ${cell.availability}. ${copy.reason}${colon}${dependencyReason(cell.reason, language)}. ${copy.source}${colon}${cell.source?.source ?? "UNKNOWN"}. ${copy.licence}${colon}${cell.source?.licence ?? "UNKNOWN"}. ${copy.date}${colon}${cell.source?.date ?? "UNKNOWN"}.`);
        entry.append(details);
      }
      if (!item.cells.length) entry.append(el(doc, "p", copy.emptyCell));
      entry.append(edit);
      rows.append(entry);
    }
    previous.disabled = !page.previous;
    next.disabled = !page.next;
    pageMessage.textContent = `${copy.page}${colon}${page.rows.length} / ${page.total}`;
  };
  const onSave = (): void => {
    try {
      const ids = cellIds.control.value.split(",").map((id) => id.trim()).filter(Boolean);
      const patch = { title: title.control.value, purpose: purpose.control.value, note: note.control.value,
        cellIds: ids, category: category.control.value as DependencyCategory,
        priority: priority.control.value as DependencyPriority, progress: progress.control.value as DependencyProgress };
      if (selected) book = editDependency(book, selected, patch, today());
      else book = addDependency(book, { id: `local-${++serial}`, ...patch }, today());
      clearForm();
      status.textContent = copy.savedMessage;
      refresh();
    } catch { status.textContent = copy.error; }
  };
  const onRemove = (): void => {
    if (selected === null || !doc.defaultView?.confirm(copy.confirm)) return;
    try { book = removeDependency(book, selected, today()); clearForm(); status.textContent = copy.savedMessage; refresh(); }
    catch { status.textContent = copy.error; }
  };
  const onClear = (): void => {
    if (!doc.defaultView?.confirm(copy.confirm)) return;
    book = createDependencyBook(manifest.regionId, manifest.regionId, today());
    currentPage = 0; clearForm(); status.textContent = copy.savedMessage; refresh();
  };
  const onDownload = (kind: "json" | "txt"): void => {
    try {
      const assessments = assessDependency(book, manifest, model.getState().inventory);
      const statistics = summarizeDependencies(assessments);
      const content = kind === "json" ? dependencyReportJson(book, assessments, statistics) : dependencyReportText(book, assessments, statistics, language);
      downloadDependencyFile(doc, content, dependencyFileName(manifest.regionId, kind), kind === "json" ? "application/json;charset=utf-8" : "text/plain;charset=utf-8");
      status.textContent = copy.privacy;
    } catch { status.textContent = copy.error; }
  };
  const onImport = (): void => {
    const file = importInput.files?.item(0);
    if (!file) { status.textContent = copy.invalid; return; }
    void file.text().then((raw) => {
      if (disposed) return;
      try {
        book = parseDependencyBook(raw, manifest.regionId);
        serial = book.items.reduce((high, item) => Math.max(high, Number(item.id.match(/^local-(\d+)$/)?.[1] ?? 0)), 0);
        clearForm(); currentPage = 0; status.textContent = copy.imported; refresh();
      } catch { status.textContent = copy.invalid; }
    }).catch(() => { if (!disposed) status.textContent = copy.invalid; });
  };
  listen(save, "click", onSave);
  listen(cancel, "click", () => clearForm());
  listen(remove, "click", onRemove);
  listen(clear, "click", onClear);
  listen(json, "click", () => onDownload("json"));
  listen(text, "click", () => onDownload("txt"));
  listen(importButton, "click", onImport);
  listen(previous, "click", () => { currentPage -= 1; refresh(); });
  listen(next, "click", () => { currentPage += 1; refresh(); });
  for (const control of [filter.control, sort.control, search.control]) listen(control, "change", () => { currentPage = 0; refresh(); });
  const unsubscribe = model.subscribe(() => refresh());
  clearForm();
  refresh();
  return () => {
    disposed = true;
    unsubscribe();
    for (const unlisten of subscriptions) unlisten();
    clearRows();
    section.remove();
  };
}
