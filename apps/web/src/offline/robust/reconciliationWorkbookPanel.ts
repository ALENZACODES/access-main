import { createOfflineAction } from "./accessibilityGuard";
import type { DashboardModel } from "./offlineDashboard";
import type { Language, RegionManifest } from "./regionDownload";
import {
  addWorkbookNote, captureWorkbook, changeWorkbookNote, compareWorkbook, pageWorkbook,
  parseWorkbook, removeWorkbookNote, resetWorkbookComparison, startWorkbook, updateWorkbook,
  workbookSummary, WORKBOOK_MAX_JSON_BYTES, WORKBOOK_MAX_NOTE_CHARS, WORKBOOK_MAX_NOTES,
  type Workbook, type WorkbookDisposition, type WorkbookFilter, type WorkbookKind, type WorkbookSort,
} from "./reconciliationWorkbook";
import {
  WORKBOOK_CAUSE_COPY, WORKBOOK_CHANGE_COPY, WORKBOOK_COPY, WORKBOOK_DISPOSITION_COPY,
  WORKBOOK_DISPOSITIONS, WORKBOOK_FILTER_COPY, WORKBOOK_FILTERS, WORKBOOK_KIND_COPY,
  WORKBOOK_KINDS, WORKBOOK_SORT_COPY, WORKBOOK_SORTS, workbookSummaryText,
} from "./reconciliationWorkbookCopy";
import { saveWorkbookExport } from "./reconciliationWorkbookExport";

const PAGE_SIZE = 12;
function node<K extends keyof HTMLElementTagNameMap>(doc: Document, name: K,
  caption?: string): HTMLElementTagNameMap[K] {
  const el = doc.createElement(name);
  if (caption !== undefined) el.textContent = caption;
  return el;
}
function button(doc: Document, label: string): HTMLButtonElement {
  return createOfflineAction(doc, label);
}
function labelledControl<K extends "input" | "select" | "textarea">(doc: Document, tag: K,
  id: string, caption: string): { readonly wrapper: HTMLLabelElement; readonly control: HTMLElementTagNameMap[K] } {
  const wrapper = node(doc, "label", caption);
  const control = node(doc, tag);
  wrapper.htmlFor = id;
  control.id = id;
  control.style.minWidth = "44px";
  control.style.minHeight = "44px";
  wrapper.append(control);
  return { wrapper, control };
}
function option(doc: Document, value: string, caption: string): HTMLOptionElement {
  const result = node(doc, "option", caption);
  result.value = value;
  return result;
}
function definition(doc: Document, label: string, value: string): HTMLDivElement {
  const element = node(doc, "div");
  const dt = node(doc, "dt", label);
  const dd = node(doc, "dd", value);
  dd.style.marginInlineStart = "1em";
  element.append(dt, dd);
  return element;
}

/** Explicit, in-memory local review; imports cannot prove device status. */
export function mountOfflineReconciliationWorkbook(root: HTMLElement, manifest: RegionManifest,
  model: DashboardModel, language: Language): () => void {
  const doc = root.ownerDocument;
  const c = WORKBOOK_COPY[language];
  const prefix = `offline-workbook-${manifest.regionId.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
  const section = node(doc, "section");
  section.setAttribute("aria-label", c.title);
  const title = node(doc, "h3", c.title);
  const introduction = node(doc, "p", c.introduction);
  const toggle = button(doc, c.open);
  const content = node(doc, "div");
  content.id = `${prefix}-content`;
  content.hidden = true;
  toggle.setAttribute("aria-expanded", "false");
  toggle.setAttribute("aria-controls", content.id);
  const status = node(doc, "p", c.noStart);
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  status.setAttribute("aria-atomic", "true");
  const historical = node(doc, "p", c.historical);
  const uncertainty = node(doc, "p", c.uncertainty);
  const privacy = node(doc, "p", c.privacy);
  const readOnly = node(doc, "p", c.readOnly);
  const controls = node(doc, "div");
  const start = button(doc, c.start);
  const compare = button(doc, c.compare);
  const reset = button(doc, c.reset);
  const clear = button(doc, c.clear);
  const json = button(doc, c.saveJson);
  const text = button(doc, c.saveText);
  controls.append(start, compare, reset, clear, json, text);
  const upload = labelledControl(doc, "input", `${prefix}-upload`, c.load);
  upload.control.type = "file";
  upload.control.accept = ".json,application/json";
  const summary = node(doc, "p");
  const search = labelledControl(doc, "input", `${prefix}-search`, c.search);
  search.control.type = "search";
  search.control.maxLength = 160;
  const filter = labelledControl(doc, "select", `${prefix}-filter`, c.filter);
  for (const kind of WORKBOOK_FILTERS) {
    filter.control.append(option(doc, kind, WORKBOOK_FILTER_COPY[language][kind]));
  }
  const sort = labelledControl(doc, "select", `${prefix}-sort`, c.sort);
  for (const kind of WORKBOOK_SORTS) {
    sort.control.append(option(doc, kind, WORKBOOK_SORT_COPY[language][kind]));
  }
  const results = node(doc, "ol");
  const pager = node(doc, "nav");
  pager.setAttribute("aria-label", c.page);
  const previous = button(doc, c.previous);
  const next = button(doc, c.next);
  const position = node(doc, "span");
  pager.append(previous, position, next);
  const noteBox = node(doc, "div");
  const cell = labelledControl(doc, "select", `${prefix}-cell`, c.selectCell);
  for (const entry of manifest.cells) cell.control.append(option(doc, entry.id, entry.id));
  const kind = labelledControl(doc, "select", `${prefix}-kind`, c.kind);
  for (const item of WORKBOOK_KINDS) kind.control.append(option(doc, item, WORKBOOK_KIND_COPY[language][item]));
  const message = labelledControl(doc, "textarea", `${prefix}-note`, c.note);
  message.control.maxLength = WORKBOOK_MAX_NOTE_CHARS;
  message.control.rows = 3;
  message.control.style.width = "100%";
  const add = button(doc, c.addNote);
  const chosenNote = labelledControl(doc, "select", `${prefix}-select-note`, c.selectNote);
  const disposition = labelledControl(doc, "select", `${prefix}-disposition`, c.disposition);
  for (const item of WORKBOOK_DISPOSITIONS) {
    disposition.control.append(option(doc, item, WORKBOOK_DISPOSITION_COPY[language][item]));
  }
  const updateNote = button(doc, c.updateNote);
  const removeNote = button(doc, c.removeNote);
  const notesList = node(doc, "ol");
  noteBox.append(cell.wrapper, kind.wrapper, message.wrapper, add, chosenNote.wrapper,
    disposition.wrapper, updateNote, removeNote, notesList);
  content.append(status, historical, uncertainty, privacy, readOnly, controls, upload.wrapper,
    summary, search.wrapper, filter.wrapper, sort.wrapper, results, pager, noteBox);
  section.append(title, introduction, toggle, content);
  root.append(section);

  let workbook: Workbook | null = null;
  let expanded = false;
  let disposed = false;
  let busy = false;
  let revision = 0;
  let pageOffset = 0;
  let sequence = 0;

  const render = (): void => {
    if (disposed || !expanded) return;
    const comparison = workbook?.after === null || workbook === null ? null :
      compareWorkbook(workbook.before, workbook.after);
    start.disabled = busy;
    compare.disabled = busy || workbook === null;
    reset.disabled = busy || workbook?.after === null || workbook === null;
    clear.disabled = busy || workbook === null;
    json.disabled = busy || workbook === null;
    text.disabled = busy || workbook === null;
    add.disabled = busy || workbook === null || workbook.notes.length >= WORKBOOK_MAX_NOTES;
    search.control.disabled = comparison === null;
    filter.control.disabled = comparison === null;
    sort.control.disabled = comparison === null;
    summary.textContent = workbook === null ? "" : workbookSummaryText(workbookSummary(workbook), language);
    results.replaceChildren();
    previous.disabled = true;
    next.disabled = true;
    position.textContent = "";
    if (comparison !== null) {
      const page = pageWorkbook(comparison, { search: search.control.value, filter: filter.control.value as WorkbookFilter,
        sort: sort.control.value as WorkbookSort, offset: pageOffset, limit: PAGE_SIZE });
      previous.disabled = !page.previous;
      next.disabled = !page.next;
      position.textContent = `${page.total === 0 ? 0 : pageOffset + 1}–${Math.min(pageOffset + PAGE_SIZE, page.total)} / ${page.total}`;
      for (const entry of page.rows) {
        const li = node(doc, "li");
        li.append(node(doc, "strong", entry.id));
        const detail = node(doc, "dl");
        const origin = entry.after?.source ?? entry.before?.source;
        detail.append(
          definition(doc, c.change, WORKBOOK_CHANGE_COPY[language][entry.change]),
          definition(doc, c.before, entry.before?.state ?? "UNKNOWN"),
          definition(doc, c.after, entry.after?.state ?? "UNKNOWN"),
          definition(doc, c.cause, entry.after ? WORKBOOK_CAUSE_COPY[language][entry.after.cause] : "UNKNOWN"),
          definition(doc, c.source, origin?.source ?? "UNKNOWN"),
          definition(doc, c.licence, origin?.licence ?? "UNKNOWN"),
          definition(doc, c.date, origin?.date ?? "UNKNOWN"),
          definition(doc, c.bytes, origin === undefined ? "UNKNOWN" : String(origin.bytes)),
          definition(doc, c.action, entry.action === "none" ? c.noAction :
            entry.action === "inspect" ? c.inspect : c.consider),
        );
        li.append(detail);
        results.append(li);
      }
      if (page.rows.length === 0) results.append(node(doc, "li", c.noRows));
    } else {
      results.append(node(doc, "li", workbook === null ? c.noStart : c.noComparison));
    }
    const selected = chosenNote.control.value;
    chosenNote.control.replaceChildren();
    notesList.replaceChildren();
    for (const entry of workbook?.notes ?? []) {
      chosenNote.control.append(option(doc, entry.id, `${entry.cellId} — ${entry.id}`));
      const li = node(doc, "li");
      li.append(node(doc, "strong", entry.cellId), node(doc, "p", entry.text),
        node(doc, "p", WORKBOOK_DISPOSITION_COPY[language][entry.disposition]));
      notesList.append(li);
    }
    if ((workbook?.notes ?? []).some((entry) => entry.id === selected)) chosenNote.control.value = selected;
    if (notesList.childElementCount === 0) notesList.append(node(doc, "li", c.emptyNotes));
    updateNote.disabled = busy || !workbook?.notes.length;
    removeNote.disabled = busy || !workbook?.notes.length;
  };

  const read = async (): Promise<ReturnType<typeof captureWorkbook>> => {
    await model.refresh();
    const state = model.getState();
    return captureWorkbook(manifest, state.phase === "ready" ? state.inventory : null, new Date().toISOString());
  };
  const onRead = async (mode: "start" | "compare"): Promise<void> => {
    if (disposed || busy) return;
    if (model.getState().phase === "downloading") { status.textContent = c.busy; return; }
    busy = true;
    const token = ++revision;
    status.textContent = c.reading;
    render();
    try {
      const captured = await read();
      if (disposed || revision !== token) return;
      if (mode === "start") {
        workbook = startWorkbook(captured);
      } else if (workbook !== null) {
        workbook = updateWorkbook(workbook, captured);
      }
      pageOffset = 0;
      status.textContent = captured.status === "UNKNOWN" ? c.uncertain : mode === "start" ? c.captured : c.compared;
    } catch {
      if (!disposed && revision === token) status.textContent = c.error;
    } finally {
      if (!disposed && revision === token) { busy = false; render(); }
    }
  };
  const change = (operation: () => void, success: string): void => {
    try { operation(); status.textContent = success; render(); }
    catch { status.textContent = c.error; }
  };
  const onStart = (): void => { void onRead("start"); };
  const onCompare = (): void => { void onRead("compare"); };
  const onReset = (): void => { change(() => {
    if (workbook !== null) workbook = resetWorkbookComparison(workbook);
    pageOffset = 0;
  }, c.resetDone); };
  const onClear = (): void => {
    revision += 1;
    workbook = null;
    pageOffset = 0;
    message.control.value = "";
    status.textContent = c.cleared;
    render();
  };
  const onExport = (format: "json" | "txt"): void => {
    if (workbook === null) return;
    change(() => { if (workbook !== null) saveWorkbookExport(workbook, language, format, doc); }, c.exported);
  };
  const onImport = (): void => {
    const file = upload.control.files?.[0];
    if (file === undefined) return;
    if (file.size > WORKBOOK_MAX_JSON_BYTES) { status.textContent = c.invalid; return; }
    const token = ++revision;
    void file.text().then((value) => {
      if (disposed || revision !== token) return;
      try { workbook = parseWorkbook(value, manifest.regionId); pageOffset = 0; status.textContent = c.imported; render(); }
      catch { status.textContent = c.invalid; }
    }).catch(() => { if (!disposed && revision === token) status.textContent = c.invalid; });
  };
  const onAdd = (): void => {
    if (workbook === null) return;
    if (!message.control.value.trim()) { status.textContent = c.emptyNote; return; }
    if (workbook.notes.length >= WORKBOOK_MAX_NOTES) { status.textContent = c.fullNotes; return; }
    change(() => {
      if (workbook === null) return;
      const at = new Date().toISOString();
      sequence += 1;
      workbook = addWorkbookNote(workbook, { id: `note-${at}-${sequence}`, at,
        cellId: cell.control.value, kind: kind.control.value as WorkbookKind,
        disposition: "open", text: message.control.value });
      message.control.value = "";
    }, c.noteAdded);
  };
  const onUpdate = (): void => { if (workbook !== null) change(() => {
    if (workbook !== null) workbook = changeWorkbookNote(workbook, chosenNote.control.value,
      disposition.control.value as WorkbookDisposition);
  }, c.noteUpdated); };
  const onRemove = (): void => { if (workbook !== null) change(() => {
    if (workbook !== null) workbook = removeWorkbookNote(workbook, chosenNote.control.value);
  }, c.noteRemoved); };
  const onFilter = (): void => { pageOffset = 0; render(); };
  const onPrevious = (): void => { pageOffset = Math.max(0, pageOffset - PAGE_SIZE); render(); };
  const onNext = (): void => { pageOffset += PAGE_SIZE; render(); };
  const onToggle = (): void => {
    expanded = !expanded;
    content.hidden = !expanded;
    toggle.textContent = expanded ? c.close : c.open;
    toggle.setAttribute("aria-expanded", String(expanded));
    render();
  };
  const listeners: readonly [HTMLElement, string, EventListener][] = [
    [toggle, "click", onToggle], [start, "click", onStart], [compare, "click", onCompare],
    [reset, "click", onReset], [clear, "click", onClear],
    [json, "click", () => onExport("json")], [text, "click", () => onExport("txt")],
    [upload.control, "change", onImport], [add, "click", onAdd],
    [updateNote, "click", onUpdate], [removeNote, "click", onRemove],
    [search.control, "input", onFilter], [filter.control, "change", onFilter],
    [sort.control, "change", onFilter], [previous, "click", onPrevious], [next, "click", onNext],
  ];
  for (const [target, event, listener] of listeners) target.addEventListener(event, listener);
  const unsubscribe = model.subscribe(() => { if (!disposed && expanded) render(); });
  return () => {
    disposed = true;
    revision += 1;
    unsubscribe();
    for (const [target, event, listener] of listeners) target.removeEventListener(event, listener);
    section.remove();
  };
}
