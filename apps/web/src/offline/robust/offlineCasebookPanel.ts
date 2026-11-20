import { createOfflineAction } from "./accessibilityGuard";
import type { DashboardModel, DashboardState } from "./offlineDashboard";
import type { Language, RegionManifest } from "./regionDownload";
import {
  addCaseNote, casebookSummary, changeCaseStatus, emptyCasebook,
  importCasebook, openCase, pageCasebook, reconcileCasebook,
  CASEBOOK_MAX_BYTES, CASEBOOK_MAX_NOTE_LENGTH,
  type CaseFilter, type CaseOrder, type CaseReason, type CaseStatus,
} from "./offlineCasebook";
import {
  CASEBOOK_COPY, CASE_FILTERS, CASE_ORDERS, CASE_REASONS, CASE_STATUSES,
  caseEvidenceText, caseFilterText, caseOrderText, caseReasonText, caseStatusText,
} from "./offlineCasebookCopy";
import { saveCasebookFile } from "./offlineCasebookExport";

const PAGE_SIZE = 10;

function el<K extends keyof HTMLElementTagNameMap>(
  doc: Document, tag: K, value?: string,
): HTMLElementTagNameMap[K] {
  const result = doc.createElement(tag);
  if (value !== undefined) result.textContent = value;
  return result;
}

function button(doc: Document, label: string): HTMLButtonElement {
  return createOfflineAction(doc, label);
}

function labelledSelect(doc: Document, label: string, id: string): {
  readonly wrapper: HTMLLabelElement;
  readonly select: HTMLSelectElement;
} {
  const wrapper = el(doc, "label");
  wrapper.textContent = label;
  wrapper.htmlFor = id;
  const select = el(doc, "select");
  select.id = id;
  select.style.minHeight = "44px";
  select.style.minWidth = "44px";
  wrapper.append(select);
  return { wrapper, select };
}

function option(doc: Document, value: string, label: string): HTMLOptionElement {
  const item = el(doc, "option", label);
  item.value = value;
  return item;
}

function definition(doc: Document, label: string, value: string): HTMLDivElement {
  const block = el(doc, "div");
  const name = el(doc, "dt", label);
  const term = el(doc, "dd", value);
  term.style.marginInlineStart = "1em";
  block.append(name, term);
  return block;
}

/** This panel never downloads, deletes, or changes cached offline content. */
export function mountOfflineCasebook(
  root: HTMLElement,
  manifest: RegionManifest,
  model: DashboardModel,
  language: Language,
): () => void {
  const doc = root.ownerDocument;
  const c = CASEBOOK_COPY[language];
  const instance = manifest.regionId.replace(/[^a-zA-Z0-9_-]/g, "-");
  const section = el(doc, "section");
  section.setAttribute("aria-label", c.title);
  const heading = el(doc, "h2", c.title);
  const intro = el(doc, "p", c.intro);
  const toggle = button(doc, c.open);
  const content = el(doc, "div");
  content.id = `offline-casebook-${instance}`;
  content.hidden = true;
  toggle.setAttribute("aria-controls", content.id);
  toggle.setAttribute("aria-expanded", "false");

  const status = el(doc, "p");
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  status.setAttribute("aria-atomic", "true");
  const privacy = el(doc, "p", c.private);
  const warning = el(doc, "p", c.importWarning);
  const summary = el(doc, "dl");

  const cellChoice = labelledSelect(doc, c.selectCell, `casebook-cell-${instance}`);
  const reasonChoice = labelledSelect(doc, c.reason, `casebook-reason-${instance}`);
  for (const cell of manifest.cells) {
    cellChoice.select.append(option(doc, cell.id, cell.id));
  }
  for (const reason of CASE_REASONS) {
    reasonChoice.select.append(option(doc, reason, caseReasonText(reason, language)));
  }
  const noteLabel = el(doc, "label", c.enterNote);
  const note = el(doc, "textarea");
  note.id = `casebook-note-${instance}`;
  noteLabel.htmlFor = note.id;
  note.maxLength = CASEBOOK_MAX_NOTE_LENGTH;
  note.rows = 3;
  note.style.minHeight = "44px";
  note.style.width = "100%";
  const addButton = button(doc, c.add);

  const searchLabel = el(doc, "label", c.search);
  const search = el(doc, "input");
  search.type = "search";
  search.id = `casebook-search-${instance}`;
  search.maxLength = 160;
  search.style.minHeight = "44px";
  searchLabel.htmlFor = search.id;
  const filterChoice = labelledSelect(doc, c.filter, `casebook-filter-${instance}`);
  const orderChoice = labelledSelect(doc, c.order, `casebook-order-${instance}`);
  for (const filter of CASE_FILTERS) {
    filterChoice.select.append(option(doc, filter, caseFilterText(filter, language)));
  }
  for (const order of CASE_ORDERS) {
    orderChoice.select.append(option(doc, order, caseOrderText(order, language)));
  }

  const caseChoice = labelledSelect(doc, c.selectCase, `casebook-select-${instance}`);
  const caseStatusChoice = labelledSelect(doc, c.status, `casebook-status-${instance}`);
  for (const value of CASE_STATUSES) {
    caseStatusChoice.select.append(option(doc, value, caseStatusText(value, language)));
  }
  const changeButton = button(doc, c.change);
  const noteButton = button(doc, c.addNote);
  const checkButton = button(doc, c.reconcile);
  const saveJson = button(doc, c.export);
  const saveText = button(doc, c.exportText);
  const uploadLabel = el(doc, "label", c.import);
  const upload = el(doc, "input");
  upload.type = "file";
  upload.accept = ".json,application/json";
  upload.id = `casebook-upload-${instance}`;
  upload.style.minHeight = "44px";
  uploadLabel.htmlFor = upload.id;
  const results = el(doc, "ol");
  const pager = el(doc, "nav");
  pager.setAttribute("aria-label", c.page);
  const previous = button(doc, c.previous);
  const next = button(doc, c.next);
  const position = el(doc, "span");
  pager.append(previous, position, next);
  const actionArea = el(doc, "div");
  actionArea.append(cellChoice.wrapper, reasonChoice.wrapper, noteLabel, note, addButton);
  const reviewArea = el(doc, "div");
  reviewArea.append(searchLabel, search, filterChoice.wrapper, orderChoice.wrapper,
    caseChoice.wrapper, caseStatusChoice.wrapper, changeButton, noteButton,
    checkButton, results, pager);
  const exportArea = el(doc, "div");
  exportArea.append(saveJson, saveText, uploadLabel, upload);
  content.append(status, privacy, warning, summary, actionArea, reviewArea, exportArea);
  section.append(heading, intro, toggle, content);
  root.append(section);

  let book = emptyCasebook(manifest.regionId);
  let filter: CaseFilter = "all";
  let order: CaseOrder = "newest";
  let offset = 0;
  let disposed = false;
  let expanded = false;

  const render = (): void => {
    if (disposed || !expanded) return;
    const totals = casebookSummary(book);
    summary.replaceChildren(
      definition(doc, c.total, String(totals.total)),
      definition(doc, c.openCount, String(totals.open)),
      definition(doc, c.reviewCount, String(totals.inReview)),
      definition(doc, c.closedCount, String(totals.closed)),
      definition(doc, c.unknownCount, String(totals.unknown)),
      definition(doc, c.retryCount, String(totals.potentialRetry)),
      definition(doc, c.inspectCount, String(totals.needsInspection)),
      definition(doc, c.bytes, totals.recordedBytes === null ? "UNKNOWN" : String(totals.recordedBytes)),
    );
    const selected = caseChoice.select.value;
    caseChoice.select.replaceChildren();
    for (const item of book.cases) {
      caseChoice.select.append(option(doc, item.id, `${item.cellId} (${item.id})`));
    }
    if (book.cases.some((item) => item.id === selected)) caseChoice.select.value = selected;
    const page = pageCasebook(book, {
      filter, order, search: search.value, offset, limit: PAGE_SIZE,
    });
    results.replaceChildren();
    for (const item of page.rows) {
      const li = el(doc, "li");
      li.append(el(doc, "strong", item.cellId));
      const dl = el(doc, "dl");
      dl.append(
        definition(doc, c.status, caseStatusText(item.status, language)),
        definition(doc, c.reason, caseReasonText(item.reason, language)),
        definition(doc, c.evidence, caseEvidenceText(item.evidence, language)),
        definition(doc, c.tier, item.sourceTier),
        definition(doc, c.source, item.source.source),
        definition(doc, c.licence, item.source.licence),
        definition(doc, c.date, item.source.date),
        definition(doc, c.size, String(item.expectedBytes)),
        definition(doc, c.updated, item.updatedAt),
        definition(doc, c.comments, String(item.noteCount)),
      );
      li.append(dl);
      results.append(li);
    }
    if (page.rows.length === 0) results.append(el(doc, "li", book.cases.length ? c.noMatch : c.noCases));
    previous.disabled = !page.previous;
    next.disabled = !page.next;
    position.textContent = `${page.total === 0 ? 0 : page.offset + 1}–${Math.min(page.offset + PAGE_SIZE, page.total)} / ${page.total}`;
    changeButton.disabled = book.cases.length === 0;
    noteButton.disabled = book.cases.length === 0;
    checkButton.disabled = book.cases.length === 0;
    saveJson.disabled = book.cases.length === 0;
    saveText.disabled = book.cases.length === 0;
  };

  const safely = (action: () => void, success: string): void => {
    try { action(); status.textContent = success; render(); }
    catch { status.textContent = c.error; }
  };
  const now = (): string => new Date().toISOString();
  const onToggle = (): void => {
    expanded = !expanded;
    content.hidden = !expanded;
    toggle.textContent = expanded ? c.close : c.open;
    toggle.setAttribute("aria-expanded", String(expanded));
    render();
  };
  const onAdd = (): void => {
    const cellId = cellChoice.select.value;
    const reason = reasonChoice.select.value as CaseReason;
    safely(() => {
      book = openCase(book, manifest, model.getState().inventory, cellId, reason, now(), note.value);
      note.value = "";
      offset = 0;
    }, c.savedLocally);
  };
  const onNote = (): void => {
    if (!note.value.trim()) { status.textContent = c.emptyNote; return; }
    safely(() => {
      book = addCaseNote(book, caseChoice.select.value, now(), note.value);
      note.value = "";
    }, c.noteSaved);
  };
  const onStatus = (): void => {
    safely(() => {
      book = changeCaseStatus(book, caseChoice.select.value, now(), caseStatusChoice.select.value as CaseStatus);
    }, c.statusSaved);
  };
  const onCheck = (): void => {
    safely(() => {
      const updated = reconcileCasebook(book, manifest, model.getState().inventory, now());
      book = updated.book;
      status.textContent = updated.changed.length ? c.evidenceUpdated : c.unchanged;
    }, c.evidenceUpdated);
  };
  const onExport = (format: "json" | "txt"): void => {
    safely(() => { saveCasebookFile(book, language, format, doc, now()); }, c.exportWarning);
  };
  const onImport = (): void => {
    const file = upload.files?.[0];
    if (!file) return;
    if (file.size > CASEBOOK_MAX_BYTES) { status.textContent = c.validation; return; }
    void file.text().then((text) => {
      if (disposed) return;
      safely(() => {
        const parsed = importCasebook(text, manifest.regionId);
        book = parsed;
        offset = 0;
      }, c.imported);
    }).catch(() => { if (!disposed) status.textContent = c.validation; });
  };
  const onSearch = (): void => { offset = 0; render(); };
  const onFilter = (): void => { filter = filterChoice.select.value as CaseFilter; offset = 0; render(); };
  const onOrder = (): void => { order = orderChoice.select.value as CaseOrder; offset = 0; render(); };
  const onPrevious = (): void => { offset = Math.max(0, offset - PAGE_SIZE); render(); };
  const onNext = (): void => { offset += PAGE_SIZE; render(); };
  const onDashboard = (_state: DashboardState): void => {
    // Existing records intentionally stay historical until a manual recheck.
    if (!disposed && expanded) render();
  };
  const listeners: readonly [HTMLElement, string, EventListener][] = [
    [toggle, "click", onToggle], [addButton, "click", onAdd],
    [noteButton, "click", onNote], [changeButton, "click", onStatus],
    [checkButton, "click", onCheck], [saveJson, "click", () => onExport("json")],
    [saveText, "click", () => onExport("txt")], [upload, "change", onImport],
    [search, "input", onSearch], [filterChoice.select, "change", onFilter],
    [orderChoice.select, "change", onOrder], [previous, "click", onPrevious],
    [next, "click", onNext],
  ];
  for (const [element, type, listener] of listeners) element.addEventListener(type, listener);
  const unsubscribe = model.subscribe(onDashboard);
  return () => {
    disposed = true;
    unsubscribe();
    for (const [element, type, listener] of listeners) element.removeEventListener(type, listener);
    section.remove();
  };
}
