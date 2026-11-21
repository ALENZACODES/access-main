import { createOfflineAction } from "./accessibilityGuard";
import type { DashboardModel } from "./offlineDashboard";
import type { Language, RegionManifest } from "./regionDownload";
import {
  appendPackReceipt, comparePackReceipts, createPackReceipt,
  emptyReceiptBook, encodeReceiptBook, latestReceiptDiff, pageReceiptDiff,
  parseReceiptBook, summarizeReceiptBook, RECEIPT_MAX_BYTES, RECEIPT_MAX_CAPTURES,
  RECEIPT_PAGE_SIZE, type PackReceipt, type ReceiptBook, type ReceiptDiffRow,
  type ReceiptFilter, type ReceiptOrder,
} from "./packReceipt";
import {
  PACK_RECEIPT_COPY, RECEIPT_FILTERS, RECEIPT_ORDERS,
  receiptChangeText, receiptFilterText, receiptOrderText,
} from "./packReceiptCopy";
import { saveReceiptFile } from "./packReceiptExport";

function node<K extends keyof HTMLElementTagNameMap>(
  doc: Document,
  tag: K,
  text?: string,
): HTMLElementTagNameMap[K] {
  const result = doc.createElement(tag);
  if (text !== undefined) result.textContent = text;
  return result;
}

function button(doc: Document, text: string): HTMLButtonElement {
  return createOfflineAction(doc, text);
}

function labelled<K extends "input" | "select" | "textarea">(
  doc: Document,
  tag: K,
  id: string,
  text: string,
): { readonly label: HTMLLabelElement; readonly control: HTMLElementTagNameMap[K] } {
  const label = node(doc, "label", text);
  const control = node(doc, tag);
  label.htmlFor = id;
  control.id = id;
  control.style.minHeight = "44px";
  control.style.minWidth = "44px";
  label.append(control);
  return { label, control };
}

function option(doc: Document, value: string, text: string): HTMLOptionElement {
  const result = node(doc, "option", text);
  result.value = value;
  return result;
}

function definition(doc: Document, term: string, value: string): HTMLDivElement {
  const row = node(doc, "div");
  const dt = node(doc, "dt", term);
  const dd = node(doc, "dd", value);
  dd.style.marginInlineStart = "1em";
  row.append(dt, dd);
  return row;
}

function localState(row: ReceiptDiffRow, side: "before" | "after"): string {
  return row[side]?.state ?? "UNKNOWN";
}

function sourceOf(row: ReceiptDiffRow) {
  return row.after?.source ?? row.before?.source ?? null;
}

/**
 * A manually opened receipt panel. It records only the current manifest and
 * the dashboard's current inventory reading. No file payload is copied.
 */
export function mountOfflinePackReceipts(
  root: HTMLElement,
  manifest: RegionManifest,
  model: DashboardModel,
  language: Language,
): () => void {
  const doc = root.ownerDocument;
  const c = PACK_RECEIPT_COPY[language];
  const suffix = manifest.regionId.replace(/[^a-zA-Z0-9_-]/g, "-");
  const section = node(doc, "section");
  section.setAttribute("aria-label", c.title);
  const heading = node(doc, "h3", c.title);
  const intro = node(doc, "p", c.intro);
  const caution = node(doc, "p", c.caution);
  const digestHelp = node(doc, "p", c.digestHelp);
  const historyLimit = node(doc, "p", c.historyLimit);
  const status = node(doc, "p");
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  status.setAttribute("aria-atomic", "true");
  const summary = node(doc, "dl");
  const capture = button(doc, c.capture);
  const compare = button(doc, c.compare);
  const exportJson = button(doc, c.exportJson);
  const exportText = button(doc, c.exportText);
  const clear = button(doc, c.clear);
  const controls = node(doc, "div");
  controls.append(capture, compare, exportJson, exportText, clear);

  const importField = labelled(doc, "textarea", "receipt-import-" + suffix, c.importJson);
  importField.control.rows = 4;
  importField.control.maxLength = RECEIPT_MAX_BYTES;
  importField.control.style.width = "100%";
  const importButton = button(doc, c.importJson);

  const search = labelled(doc, "input", "receipt-search-" + suffix, c.search);
  search.control.type = "search";
  search.control.maxLength = 160;
  const filter = labelled(doc, "select", "receipt-filter-" + suffix, c.filter);
  const order = labelled(doc, "select", "receipt-order-" + suffix, c.order);
  for (const value of RECEIPT_FILTERS) filter.control.append(option(doc, value, receiptFilterText(value, language)));
  for (const value of RECEIPT_ORDERS) order.control.append(option(doc, value, receiptOrderText(value, language)));
  const rows = node(doc, "ol");
  const pager = node(doc, "nav");
  pager.setAttribute("aria-label", c.page);
  const previous = button(doc, c.previous);
  const next = button(doc, c.next);
  const position = node(doc, "span");
  pager.append(previous, position, next);
  const listHeading = node(doc, "h4", c.summary);
  const listStatus = node(doc, "p", c.currentUnavailable);
  section.append(heading, intro, caution, digestHelp, historyLimit, status, controls,
    importField.label, importButton, summary, listHeading, listStatus,
    search.label, filter.label, order.label, rows, pager);
  root.append(section);

  let book: ReceiptBook | null = null;
  let diff: ReturnType<typeof latestReceiptDiff> = null;
  let currentFilter: ReceiptFilter = "all";
  let currentOrder: ReceiptOrder = "listed";
  let offset = 0;
  let busy = false;
  let disposed = false;

  const render = (): void => {
    if (disposed) return;
    const totals = book ? summarizeReceiptBook(book) : null;
    summary.replaceChildren();
    if (totals) {
      summary.append(
        definition(c.region, manifest.regionId),
        definition(c.captures, String(totals.captures)),
        definition(c.saved, String(totals.saved)),
        definition(c.unknown, String(totals.unknown)),
        definition(c.changed, String(totals.changed)),
        definition(c.bytes, totals.totalBytes === null ? "UNKNOWN" : String(totals.totalBytes)),
        definition(c.capturedAt, totals.latestAt ?? "UNKNOWN"),
        definition(c.status, book?.receipts.at(-1)?.status ?? "UNKNOWN"),
      );
      const latest = book?.receipts.at(-1);
      if (latest) summary.append(definition(c.digest, latest.digest.slice(0, 20) + "…"));
    } else {
      summary.append(definition(c.region, manifest.regionId), definition(c.captures, "0"),
        definition(c.saved, "0"), definition(c.unknown, "UNKNOWN"));
    }
    diff = book ? latestReceiptDiff(book) : null;
    rows.replaceChildren();
    if (!diff) {
      rows.append(node(doc, "li", book ? c.one : c.empty));
    } else {
      const page = pageReceiptDiff(diff, {
        search: search.control.value,
        filter: currentFilter,
        order: currentOrder,
        offset,
        limit: RECEIPT_PAGE_SIZE,
      });
      for (const row of page.rows) {
        const item = node(doc, "li");
        item.append(node(doc, "strong", row.id));
        item.append(node(doc, "p", receiptChangeText(row.change, language)));
        const source = sourceOf(row);
        const details = node(doc, "dl");
        details.append(
          definition(c.source, source?.source ?? "UNKNOWN"),
          definition(c.licence, source?.licence ?? "UNKNOWN"),
          definition(c.date, source?.date ?? "UNKNOWN"),
          definition(c.size, String(row.after?.bytes ?? row.before?.bytes ?? "UNKNOWN")),
          definition(c.earlierState, localState(row, "before")),
          definition(c.laterState, localState(row, "after")),
        );
        item.append(details);
        rows.append(item);
      }
      if (page.rows.length === 0) rows.append(node(doc, "li", c.noRows));
      previous.disabled = !page.previous || busy;
      next.disabled = !page.next || busy;
      position.textContent = c.position + (language === "fr" ? "\u00a0: " : ": ") +
        (page.total === 0 ? 0 : page.offset + 1) + "–" +
        Math.min(page.offset + page.limit, page.total) + " / " + page.total;
    }
    if (!diff) {
      previous.disabled = true;
      next.disabled = true;
      position.textContent = "0 / 0";
    }
    capture.disabled = busy || (book?.receipts.length ?? 0) >= RECEIPT_MAX_CAPTURES;
    compare.disabled = busy || (book?.receipts.length ?? 0) < 2;
    exportJson.disabled = busy || book === null;
    exportText.disabled = busy || book === null;
    clear.disabled = busy || book === null;
    importButton.disabled = busy || importField.control.value.trim().length === 0;
    search.control.disabled = busy || diff === null;
    filter.control.disabled = busy || diff === null;
    order.control.disabled = busy || diff === null;
    importField.control.disabled = busy;
  };

  const onCapture = async (): Promise<void> => {
    if (busy || (book?.receipts.length ?? 0) >= RECEIPT_MAX_CAPTURES) return;
    busy = true;
    status.textContent = c.busy;
    render();
    try {
      const receipt = await createPackReceipt(manifest, model.getState().inventory, new Date().toISOString());
      book = book ? appendPackReceipt(book, receipt) : { ...emptyReceiptBook(manifest.regionId), receipts: [receipt] };
      offset = 0;
      status.textContent = c.captured;
    } catch {
      status.textContent = c.error;
    } finally {
      busy = false;
      render();
    }
  };

  const onCompare = (): void => {
    if (!book || book.receipts.length < 2) return;
    try {
      const earlier = book.receipts[book.receipts.length - 2]!;
      const later = book.receipts[book.receipts.length - 1]!;
      diff = comparePackReceipts(earlier, later);
      offset = 0;
      status.textContent = c.compared;
      render();
    } catch {
      status.textContent = c.error;
    }
  };

  const onExport = (format: "json" | "txt"): void => {
    if (!book) return;
    try {
      saveReceiptFile(book, language, format, doc);
      status.textContent = c.exported;
    } catch {
      status.textContent = c.error;
    }
  };

  const onImport = async (): Promise<void> => {
    const source = importField.control.value;
    if (busy || !source.trim()) return;
    if (new TextEncoder().encode(source).byteLength > RECEIPT_MAX_BYTES) {
      status.textContent = c.tooLarge;
      return;
    }
    busy = true;
    status.textContent = c.busy;
    render();
    try {
      const imported = await parseReceiptBook(source, manifest.regionId);
      book = imported;
      importField.control.value = "";
      offset = 0;
      status.textContent = c.imported;
    } catch {
      status.textContent = c.invalid;
    } finally {
      busy = false;
      render();
    }
  };

  const onClear = (): void => {
    if (busy || !book) return;
    book = null;
    diff = null;
    offset = 0;
    importField.control.value = "";
    status.textContent = c.cleared;
    render();
  };

  const onSearch = (): void => { offset = 0; render(); };
  const onFilter = (): void => { currentFilter = filter.control.value as ReceiptFilter; offset = 0; render(); };
  const onOrder = (): void => { currentOrder = order.control.value as ReceiptOrder; offset = 0; render(); };
  const onPrevious = (): void => { offset = Math.max(0, offset - RECEIPT_PAGE_SIZE); render(); };
  const onNext = (): void => { offset += RECEIPT_PAGE_SIZE; render(); };

  const listeners: readonly [HTMLElement, string, EventListener][] = [
    [capture, "click", () => { void onCapture(); }],
    [compare, "click", onCompare],
    [exportJson, "click", () => onExport("json")],
    [exportText, "click", () => onExport("txt")],
    [clear, "click", onClear],
    [importButton, "click", () => { void onImport(); }],
    [search.control, "input", onSearch],
    [filter.control, "change", onFilter],
    [order.control, "change", onOrder],
    [previous, "click", onPrevious],
    [next, "click", onNext],
  ];
  for (const [element, type, listener] of listeners) element.addEventListener(type, listener);
  const unsubscribe = model.subscribe(() => {
    // A later dashboard refresh does not rewrite a historical receipt.
    if (!disposed && book === null) render();
  });
  render();
  return () => {
    disposed = true;
    unsubscribe();
    for (const [element, type, listener] of listeners) element.removeEventListener(type, listener);
    section.remove();
  };
}
