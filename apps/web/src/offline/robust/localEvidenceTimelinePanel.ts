import { createOfflineAction } from "./accessibilityGuard";
import type { DashboardModel } from "./offlineDashboard";
import type { Language, RegionManifest } from "./regionDownload";
import {
  appendTimeline, appendTimelineNote, captureTimeline, compareLatestTimeline, newTimeline,
  pageTimeline, parseTimelineBook, updateTimelineNote, TIMELINE_MAX_BYTES,
  TIMELINE_MAX_CAPTURES, TIMELINE_MAX_NOTE_LENGTH, TIMELINE_MAX_NOTES,
  type TimelineBook, type TimelineFilter, type TimelineOrder, type TimelineNoteStatus,
} from "./localEvidenceTimeline";
import {
  TIMELINE_COPY, TIMELINE_FILTERS, TIMELINE_ORDERS, TIMELINE_NOTE_STATUSES,
  timelineChangeText, timelineCauseText, timelineFilterText, timelineOrderText,
  timelineNoteStatusText,
} from "./localEvidenceTimelineCopy";
import { saveTimelineFile } from "./localEvidenceTimelineExport";
const PAGE_SIZE = 12;
function node<K extends keyof HTMLElementTagNameMap>(doc: Document, tag: K, content?: string): HTMLElementTagNameMap[K] {
  const element = doc.createElement(tag);
  if (content !== undefined) element.textContent = content;
  return element;
}
function action(doc: Document, label: string): HTMLButtonElement { return createOfflineAction(doc, label); }
function labelled<K extends "input" | "select" | "textarea">(doc: Document, tag: K, id: string, text: string): {
  readonly label: HTMLLabelElement;
  readonly control: HTMLElementTagNameMap[K];
} {
  const label = node(doc, "label", text);
  const control = node(doc, tag);
  label.htmlFor = id;
  control.id = id;
  control.style.minHeight = "44px";
  control.style.minWidth = "44px";
  label.append(control);
  return { label, control };
}
function option(doc: Document, value: string, name: string): HTMLOptionElement {
  const result = node(doc, "option", name);
  result.value = value;
  return result;
}
function definition(doc: Document, name: string, value: string): HTMLDivElement {
  const item = node(doc, "div");
  const term = node(doc, "dt", name);
  const description = node(doc, "dd", value);
  description.style.marginInlineStart = "1em";
  item.append(term, description);
  return item;
}
/** User-triggered review with page-memory history only; no automatic persistence. */
export function mountLocalEvidenceTimeline(root: HTMLElement, manifest: RegionManifest, model: DashboardModel, language: Language): () => void {
  const doc = root.ownerDocument;
  const c = TIMELINE_COPY[language];
  const suffix = manifest.regionId.replace(/[^a-zA-Z0-9_-]/g, "-");
  const section = node(doc, "section");
  section.setAttribute("aria-label", c.title);
  const title = node(doc, "h3", c.title);
  const intro = node(doc, "p", c.intro);
  const alert = node(doc, "p", c.noHistory);
  alert.setAttribute("role", "status");
  alert.setAttribute("aria-live", "polite");
  alert.setAttribute("aria-atomic", "true");
  const capture = action(doc, c.capture);
  const compare = action(doc, c.compare);
  const reset = action(doc, c.reset);
  const exportJson = action(doc, c.exportJson);
  const exportText = action(doc, c.exportText);
  const importControl = labelled(doc, "input", `timeline-import-${suffix}`, c.importJson);
  importControl.control.type = "file";
  importControl.control.accept = ".json,application/json";
  const summary = node(doc, "dl");
  const searchField = labelled(doc, "input", `timeline-search-${suffix}`, c.search);
  searchField.control.type = "search";
  searchField.control.maxLength = 160;
  const filterField = labelled(doc, "select", `timeline-filter-${suffix}`, c.filter);
  const orderField = labelled(doc, "select", `timeline-order-${suffix}`, c.order);
  for (const filter of TIMELINE_FILTERS) filterField.control.append(option(doc, filter, timelineFilterText(filter, language)));
  for (const order of TIMELINE_ORDERS) orderField.control.append(option(doc, order, timelineOrderText(order, language)));
  const rows = node(doc, "ol");
  const nav = node(doc, "nav");
  nav.setAttribute("aria-label", c.page);
  const previous = action(doc, c.previous);
  const next = action(doc, c.next);
  const position = node(doc, "span");
  nav.append(previous, position, next);
  const cellField = labelled(doc, "select", `timeline-note-cell-${suffix}`, c.noteCell);
  for (const cell of manifest.cells) cellField.control.append(option(doc, cell.id, cell.id));
  const textField = labelled(doc, "textarea", `timeline-note-${suffix}`, c.noteText);
  textField.control.maxLength = TIMELINE_MAX_NOTE_LENGTH;
  textField.control.rows = 3;
  textField.control.style.width = "100%";
  const noteSave = action(doc, c.noteSave);
  const noteSelect = labelled(doc, "select", `timeline-select-note-${suffix}`, c.noteSelect);
  const statusSelect = labelled(doc, "select", `timeline-status-note-${suffix}`, c.noteStatus);
  for (const status of TIMELINE_NOTE_STATUSES) statusSelect.control.append(option(doc, status, timelineNoteStatusText(status, language)));
  const noteUpdate = action(doc, c.noteUpdate);
  const noteList = node(doc, "ol");
  const actions = node(doc, "div");
  actions.append(capture, compare, reset, exportJson, exportText, importControl.label);
  const filters = node(doc, "div");
  filters.append(searchField.label, filterField.label, orderField.label);
  const notes = node(doc, "div");
  notes.append(node(doc, "h4", c.noteList), cellField.label, textField.label, noteSave, noteSelect.label,
    statusSelect.label, noteUpdate, noteList);
  section.append(title, intro, alert, node(doc, "p", c.notes), actions, summary, filters, rows, nav, notes,
    node(doc, "p", c.removeWarning));
  root.append(section);
  let book: TimelineBook | null = null;
  let offset = 0;
  let disposed = false;
  let busy = false;
  let operation = 0;
  const render = (): void => {
    if (disposed) return;
    const result = book === null ? null : compareLatestTimeline(book);
    const count = book?.captures.length ?? 0;
    capture.disabled = busy || count >= TIMELINE_MAX_CAPTURES;
    compare.disabled = busy || result === null;
    reset.disabled = busy || book === null;
    exportJson.disabled = busy || book === null;
    exportText.disabled = busy || book === null;
    noteSave.disabled = busy || book === null || (book?.notes.length ?? 0) >= TIMELINE_MAX_NOTES;
    noteUpdate.disabled = busy || (book?.notes.length ?? 0) === 0;
    rows.replaceChildren();
    noteList.replaceChildren();
    noteSelect.control.replaceChildren();
    summary.replaceChildren();
    previous.disabled = true;
    next.disabled = true;
    if (book !== null) {
      summary.append(definition(doc, c.status, result?.status ?? "UNKNOWN"),
        definition(doc, c.total, String(book.captures.at(-1)?.cells.length ?? 0)));
      for (const note of book.notes) {
        noteSelect.control.append(option(doc, note.id, `${note.cellId} — ${note.id}`));
        const li = node(doc, "li");
        li.append(node(doc, "strong", note.cellId), node(doc, "p", note.text),
          node(doc, "p", timelineNoteStatusText(note.status, language)));
        noteList.append(li);
      }
    }
    if (result === null) {
      position.textContent = c.onlyOne;
      return;
    }
    summary.append(definition(doc, c.lost, String(result.counts.lost)),
      definition(doc, c.gained, String(result.counts.gained)),
      definition(doc, c.changed, String(result.counts.changed)),
      definition(doc, c.unknownCount, String(result.counts.UNKNOWN)));
    const page = pageTimeline(result, {
      search: searchField.control.value, filter: filterField.control.value as TimelineFilter,
      order: orderField.control.value as TimelineOrder, offset, limit: PAGE_SIZE,
    });
    previous.disabled = !page.previous;
    next.disabled = !page.next;
    position.textContent = `${page.total === 0 ? 0 : offset + 1}–${Math.min(offset + PAGE_SIZE, page.total)} / ${page.total}`;
    for (const item of page.rows) {
      const li = node(doc, "li");
      const dl = node(doc, "dl");
      dl.append(definition(doc, c.change, timelineChangeText(item.change, language)),
        definition(doc, c.before, item.before?.state ?? "UNKNOWN"),
        definition(doc, c.after, item.after?.state ?? "UNKNOWN"),
        definition(doc, c.cause, item.after === null ? "UNKNOWN" : timelineCauseText(item.after.cause, language)),
        definition(doc, c.source, item.after?.source.source ?? item.before?.source.source ?? "UNKNOWN"),
        definition(doc, c.licence, item.after?.source.licence ?? item.before?.source.licence ?? "UNKNOWN"),
        definition(doc, c.date, item.after?.source.date ?? item.before?.source.date ?? "UNKNOWN"),
        definition(doc, c.size, String(item.after?.source.bytes ?? item.before?.source.bytes ?? "UNKNOWN")),
        definition(doc, c.noteCount, String(item.noteCount)));
      li.append(node(doc, "strong", item.cellId), dl);
      rows.append(li);
    }
    if (page.rows.length === 0) rows.append(node(doc, "li", c.noResults));
  };
  const onCapture = async (): Promise<void> => {
    if (disposed || busy) return;
    busy = true;
    const token = ++operation;
    alert.textContent = c.reading;
    render();
    try {
      await model.refresh();
      if (disposed || token !== operation) return;
      const state = model.getState();
      const reading = captureTimeline(manifest, state.phase === "ready" ? state.inventory : null, new Date().toISOString());
      book = book === null ? newTimeline(reading) : appendTimeline(book, reading);
      alert.textContent = c.captured;
      offset = 0;
    } catch {
      if (!disposed && token === operation) alert.textContent = c.error;
    } finally {
      if (!disposed && token === operation) { busy = false; render(); }
    }
  };
  const onCompare = (): void => {
    alert.textContent = book === null ? "UNKNOWN" : compareLatestTimeline(book)?.status ?? "UNKNOWN";
    render();
  };
  const onReset = (): void => {
    operation++;
    book = null;
    busy = false;
    offset = 0;
    searchField.control.value = "";
    alert.textContent = c.noHistory;
    render();
  };
  const onNote = (): void => {
    if (book === null || textField.control.value.trim().length === 0) { alert.textContent = c.emptyNote; return; }
    try {
      book = appendTimelineNote(book, {
        id: `note-${book.notes.length + 1}-${new Date().toISOString()}`,
        cellId: cellField.control.value, at: new Date().toISOString(), text: textField.control.value, status: "open",
      });
      textField.control.value = "";
      alert.textContent = c.captured;
      render();
    } catch { alert.textContent = c.error; }
  };
  const onNoteStatus = (): void => {
    if (book === null) return;
    try {
      book = updateTimelineNote(book, noteSelect.control.value, statusSelect.control.value as TimelineNoteStatus);
      render();
    } catch { alert.textContent = c.error; }
  };
  const onExportJson = (): void => { if (book !== null) { saveTimelineFile(book, language, "json", doc); alert.textContent = c.exportDone; } };
  const onExportText = (): void => { if (book !== null) { saveTimelineFile(book, language, "txt", doc); alert.textContent = c.exportDone; } };
  const onImport = (): void => {
    const file = importControl.control.files?.[0];
    if (!file) return;
    if (file.size > TIMELINE_MAX_BYTES) { alert.textContent = c.invalid; return; }
    const token = ++operation;
    void file.text().then((content) => {
      if (disposed || token !== operation) return;
      try { book = parseTimelineBook(content, manifest.regionId); alert.textContent = c.importDone; offset = 0; render(); }
      catch { alert.textContent = c.invalid; }
    }).catch(() => { if (!disposed && token === operation) alert.textContent = c.invalid; });
  };
  const onFilter = (): void => { offset = 0; render(); };
  const onPrevious = (): void => { offset = Math.max(0, offset - PAGE_SIZE); render(); };
  const onNext = (): void => { offset += PAGE_SIZE; render(); };
  const listeners: readonly [HTMLElement, string, EventListener][] = [
    [capture, "click", () => { void onCapture(); }], [compare, "click", onCompare], [reset, "click", onReset],
    [exportJson, "click", onExportJson], [exportText, "click", onExportText],
    [importControl.control, "change", onImport], [noteSave, "click", onNote],
    [noteUpdate, "click", onNoteStatus], [searchField.control, "input", onFilter],
    [filterField.control, "change", onFilter], [orderField.control, "change", onFilter],
    [previous, "click", onPrevious], [next, "click", onNext],
  ];
  for (const [element, type, listener] of listeners) element.addEventListener(type, listener);
  render();
  return () => {
    disposed = true;
    operation++;
    for (const [element, type, listener] of listeners) element.removeEventListener(type, listener);
    section.remove();
  };
}
