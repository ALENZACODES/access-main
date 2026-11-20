import { createOfflineAction } from "./accessibilityGuard";
import { handoffReviewText, reviewHandoff } from "./handoffReview";
import type { DashboardModel } from "./offlineDashboard";
import type { Language, RegionManifest } from "./regionDownload";
import {
  appendHandoffNote, captureHandoff, changeHandoffNote, compareHandoff,
  pageHandoff, parseHandoffBook, serializeHandoffBook, startHandoff, updateHandoff,
  HANDOFF_MAX_JSON_BYTES, HANDOFF_MAX_NOTE_CHARS,
  type HandoffBook, type HandoffFilter, type HandoffNoteKind, type HandoffOrder,
  type HandoffResolution,
} from "./handoffRehearsal";
import {
  HANDOFF_CHANGE, HANDOFF_COPY, HANDOFF_FILTER, HANDOFF_NOTE_KIND,
  HANDOFF_ORDER, HANDOFF_RESOLUTION,
} from "./handoffRehearsalCopy";

const PAGE_SIZE = 10;
function node<K extends keyof HTMLElementTagNameMap>(doc: Document, tag: K, text?: string): HTMLElementTagNameMap[K] {
  const created = doc.createElement(tag);
  if (text !== undefined) created.textContent = text;
  return created;
}
function field(doc: Document, label: string, id: string, control: HTMLElement): HTMLLabelElement {
  const wrapper = node(doc, "label", label);
  wrapper.htmlFor = id;
  control.id = id;
  control.style.minHeight = "44px";
  control.style.minWidth = "44px";
  wrapper.append(control);
  return wrapper;
}
function selectOptions<K extends string>(
  doc: Document, select: HTMLSelectElement, options: Readonly<Record<K, string>>,
): void {
  for (const [key, value] of Object.entries(options)) {
    const option = node(doc, "option", String(value));
    option.value = key;
    select.append(option);
  }
}
function detail(doc: Document, term: string, text: string): HTMLDivElement {
  const wrapper = node(doc, "div");
  wrapper.append(node(doc, "dt", term), node(doc, "dd", text));
  return wrapper;
}

/** No automatic capture, storage write, network request or background operation. */
export function mountOfflineHandoffRehearsal(
  root: HTMLElement,
  manifest: RegionManifest,
  model: DashboardModel,
  language: Language,
): () => void {
  const doc = root.ownerDocument;
  const copy = HANDOFF_COPY[language];
  const prefix = `handoff-${manifest.regionId.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
  const section = node(doc, "section");
  section.setAttribute("aria-label", copy.title);
  const status = node(doc, "p", copy.noCapture);
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  status.setAttribute("aria-atomic", "true");
  const start = createOfflineAction(doc, copy.before);
  const compare = createOfflineAction(doc, copy.after);
  const clear = createOfflineAction(doc, copy.reset);
  const save = createOfflineAction(doc, copy.download);
  const upload = node(doc, "input");
  upload.type = "file";
  upload.accept = ".json,application/json";
  const uploadLabel = field(doc, copy.import, `${prefix}-upload`, upload);
  const controls = node(doc, "div");
  controls.append(start, compare, clear, save, uploadLabel);

  const search = node(doc, "input");
  search.type = "search";
  search.maxLength = 160;
  const searchLabel = field(doc, copy.search, `${prefix}-search`, search);
  const filter = node(doc, "select");
  selectOptions(doc, filter, HANDOFF_FILTER[language]);
  const filterLabel = field(doc, copy.filter, `${prefix}-filter`, filter);
  const order = node(doc, "select");
  selectOptions(doc, order, HANDOFF_ORDER[language]);
  const orderLabel = field(doc, copy.order, `${prefix}-order`, order);
  const rows = node(doc, "ol");
  const results = node(doc, "section");
  results.append(node(doc, "h4", copy.results), searchLabel, filterLabel, orderLabel, rows);
  const pager = node(doc, "nav");
  pager.setAttribute("aria-label", copy.page);
  const previous = createOfflineAction(doc, copy.previous);
  const next = createOfflineAction(doc, copy.next);
  const position = node(doc, "span");
  pager.append(previous, position, next);
  results.append(pager);

  const selectCell = node(doc, "select");
  for (const cell of manifest.cells) {
    const option = node(doc, "option", cell.id);
    option.value = cell.id;
    selectCell.append(option);
  }
  const cellLabel = field(doc, copy.cellLabel, `${prefix}-cell`, selectCell);
  const kind = node(doc, "select");
  selectOptions(doc, kind, HANDOFF_NOTE_KIND[language]);
  const kindLabel = field(doc, copy.noteKind, `${prefix}-kind`, kind);
  const note = node(doc, "textarea");
  note.maxLength = HANDOFF_MAX_NOTE_CHARS;
  note.rows = 3;
  const noteLabel = field(doc, copy.noteLabel, `${prefix}-note`, note);
  const addNote = createOfflineAction(doc, copy.addNote);
  const notesList = node(doc, "ol");
  const notesHost = node(doc, "section");
  notesHost.append(node(doc, "h4", copy.notes), cellLabel, kindLabel, noteLabel, addNote, notesList);
  const reviewSummary = node(doc, "pre");
  reviewSummary.style.whiteSpace = "pre-wrap";
  const reviewTextButton = createOfflineAction(doc, language === "fr" ? "Exporter l’examen texte" : "Export text review");
  const privacy = node(doc, "p", copy.privacy);
  const warning = node(doc, "p", copy.fileWarning);
  section.append(node(doc, "h3", copy.title), node(doc, "p", copy.intro),
    status, controls, results, notesHost, reviewSummary, reviewTextButton, privacy, warning);
  root.append(section);

  let book: HandoffBook | null = null;
  let offset = 0;
  let busy = false;
  let disposed = false;
  let revision = 0;
  let nextNote = 0;
  const render = (): void => {
    compare.disabled = busy || book === null;
    start.disabled = busy;
    clear.disabled = busy || book === null;
    save.disabled = busy || book === null;
    upload.disabled = busy;
    reviewTextButton.disabled = busy || book === null;
    const review = book === null ? null : reviewHandoff(book);
    reviewSummary.textContent = review === null ? "" : handoffReviewText({
      ...review, reviewItems: review.reviewItems.slice(0, 10),
    }, language) + (review.totalItems > 10 ?
      (language === "fr" ? "\nD’autres éléments figurent dans l’exportation texte." :
        "\nAdditional items are included in the text export.") : "");
    addNote.disabled = busy || book === null || manifest.cells.length === 0;
    search.disabled = book?.after === null || book === null;
    filter.disabled = search.disabled;
    order.disabled = search.disabled;
    rows.replaceChildren();
    notesList.replaceChildren();
    previous.disabled = true;
    next.disabled = true;
    results.hidden = book?.after === null || book === null;
    notesHost.hidden = book === null;
    if (book === null) return;
    for (const entry of book.notes) {
      const li = node(doc, "li");
      li.append(node(doc, "strong", entry.cellId), node(doc, "p", entry.text),
        node(doc, "p", `${HANDOFF_NOTE_KIND[language][entry.kind]} · ${entry.at}`));
      const state = node(doc, "select");
      selectOptions(doc, state, HANDOFF_RESOLUTION[language]);
      state.value = entry.resolution;
      state.style.minHeight = "44px";
      const label = field(doc, copy.noteStatus, `${prefix}-status-${entry.id.replace(/[^a-zA-Z0-9_-]/g, "-")}`, state);
      const button = createOfflineAction(doc, copy.changeNote);
      button.addEventListener("click", () => {
        if (book === null) return;
        try {
          book = changeHandoffNote(book, entry.id, state.value as HandoffResolution);
          status.textContent = copy.noteChanged;
          render();
        } catch { status.textContent = copy.invalid; }
      });
      li.append(label, button);
      notesList.append(li);
    }
    if (book.notes.length === 0) notesList.append(node(doc, "li", copy.noNotes));
    if (book.after === null) return;
    const comparison = compareHandoff(book.before, book.after);
    const page = pageHandoff(comparison, {
      search: search.value, filter: filter.value as HandoffFilter,
      order: order.value as HandoffOrder, offset, limit: PAGE_SIZE,
    });
    for (const entry of page.rows) {
      const li = node(doc, "li");
      const source = entry.after?.source ?? entry.before?.source;
      const dl = node(doc, "dl");
      dl.append(
        detail(doc, copy.change, HANDOFF_CHANGE[language][entry.change]),
        detail(doc, copy.before, entry.before?.state ?? copy.unknown),
        detail(doc, copy.after, entry.after?.state ?? copy.unknown),
        detail(doc, copy.cause, entry.after?.cause ?? copy.unknown),
        detail(doc, copy.source, source?.source ?? copy.unknown),
        detail(doc, copy.licence, source?.licence ?? copy.unknown),
        detail(doc, copy.date, source?.date ?? copy.unknown),
        detail(doc, copy.bytes, source === undefined ? copy.unknown : String(source.bytes)),
      );
      li.append(node(doc, "strong", entry.id), dl);
      rows.append(li);
    }
    if (page.rows.length === 0) rows.append(node(doc, "li", copy.empty));
    previous.disabled = !page.previous;
    next.disabled = !page.next;
    position.textContent = `${page.total === 0 ? 0 : offset + 1}–${Math.min(offset + PAGE_SIZE, page.total)} / ${page.total}`;
  };
  const read = async (kind: "start" | "compare"): Promise<void> => {
    if (busy || disposed) return;
    busy = true;
    const token = ++revision;
    status.textContent = copy.busy;
    render();
    try {
      await model.refresh();
      if (disposed || token !== revision) return;
      const state = model.getState();
      const capture = captureHandoff(manifest, state.phase === "ready" ? state.inventory : null,
        new Date().toISOString());
      if (kind === "start") book = startHandoff(capture);
      else if (book !== null) book = updateHandoff(book, capture);
      offset = 0;
      status.textContent = `${kind === "start" ? copy.initialRecorded : copy.comparisonRecorded} ${capture.status === "UNKNOWN" ? copy.unknownNotice : ""}`;
    } catch { if (!disposed && token === revision) status.textContent = copy.invalid; }
    finally { if (!disposed && token === revision) { busy = false; render(); } }
  };
  const onStart = (): void => { void read("start"); };
  const onCompare = (): void => { void read("compare"); };
  const onClear = (): void => {
    if (busy) return;
    book = null;
    revision += 1;
    offset = 0;
    note.value = "";
    status.textContent = copy.noCapture;
    render();
  };
  const onNote = (): void => {
    if (book === null || !note.value.trim() || !selectCell.value) { status.textContent = copy.noteRequired; return; }
    try {
      const now = new Date().toISOString();
      book = appendHandoffNote(book, {
        id: `note-${now}-${nextNote++}`, cellId: selectCell.value,
        text: note.value, kind: kind.value as HandoffNoteKind,
        resolution: "open", at: now,
      });
      note.value = "";
      status.textContent = copy.noteSaved;
      render();
    } catch { status.textContent = copy.invalid; }
  };
  const onSave = (): void => {
    if (book === null) return;
    try {
      const contents = serializeHandoffBook(book);
      const blob = new Blob([contents], { type: "application/json;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const anchor = node(doc, "a");
      anchor.href = url;
      anchor.download = `offline-handoff-${manifest.regionId.replace(/[^a-zA-Z0-9_-]/g, "-")}.json`;
      anchor.click();
      URL.revokeObjectURL(url);
      status.textContent = copy.exported;
    } catch { status.textContent = copy.invalid; }
  };
  const onReviewText = (): void => {
    if (book === null) return;
    try {
      const contents = handoffReviewText(reviewHandoff(book), language);
      const blob = new Blob([contents], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const anchor = node(doc, "a");
      anchor.href = url;
      anchor.download = `offline-handoff-review-${manifest.regionId.replace(/[^a-zA-Z0-9_-]/g, "-")}.txt`;
      anchor.click();
      URL.revokeObjectURL(url);
      status.textContent = copy.exported;
    } catch { status.textContent = copy.invalid; }
  };
  const onImport = (): void => {
    const file = upload.files?.[0];
    if (!file) return;
    if (file.size > HANDOFF_MAX_JSON_BYTES) { status.textContent = copy.invalid; return; }
    const token = ++revision;
    void file.arrayBuffer().then((bytes) => {
      const value = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      if (disposed || token !== revision) return;
      try {
        const parsed = parseHandoffBook(value, manifest.regionId);
        book = parsed;
        offset = 0;
        status.textContent = copy.imported;
        render();
      } catch { status.textContent = copy.invalid; }
    }).catch(() => { if (!disposed && token === revision) status.textContent = copy.invalid; });
  };
  const onSearch = (): void => { offset = 0; render(); };
  const onPrevious = (): void => { offset = Math.max(0, offset - PAGE_SIZE); render(); };
  const onNext = (): void => { offset += PAGE_SIZE; render(); };
  const listeners: readonly [HTMLElement, string, EventListener][] = [
    [start, "click", onStart], [compare, "click", onCompare], [clear, "click", onClear],
    [save, "click", onSave], [reviewTextButton, "click", onReviewText],
    [upload, "change", onImport], [addNote, "click", onNote],
    [search, "input", onSearch], [filter, "change", onSearch], [order, "change", onSearch],
    [previous, "click", onPrevious], [next, "click", onNext],
  ];
  for (const [element, type, handler] of listeners) element.addEventListener(type, handler);
  render();
  return () => {
    disposed = true;
    revision += 1;
    for (const [element, type, handler] of listeners) element.removeEventListener(type, handler);
    section.remove();
  };
}
