import { createOfflineAction } from "./accessibilityGuard";
import type { Language } from "./regionDownload";
import {
  HANDBACK_CATEGORIES,
  HANDBACK_FILTERS,
  HANDBACK_ITEMS,
  HANDBACK_ORDERS,
  HANDBACK_PAGE_SIZE,
  createSharedDeviceHandback,
  pageHandback,
  parseSharedDeviceHandback,
  summarizeHandback,
  updateHandbackEntry,
  type HandbackCategory,
  type HandbackFilter,
  type HandbackItemState,
  type HandbackOrder,
  type SharedDeviceHandback,
} from "./sharedDeviceHandback";
import {
  HANDBACK_COPY,
  HANDBACK_ITEM_COPY,
  handbackCategoryText,
  handbackFilterText,
  handbackOrderText,
} from "./sharedDeviceHandbackCopy";
import { saveSharedDeviceHandback } from "./sharedDeviceHandbackExport";

function element<K extends keyof HTMLElementTagNameMap>(
  doc: Document,
  tag: K,
  text?: string,
): HTMLElementTagNameMap[K] {
  const result = doc.createElement(tag);
  if (text !== undefined) result.textContent = text;
  return result;
}

function action(doc: Document, text: string): HTMLButtonElement {
  return createOfflineAction(doc, text);
}

function labelled(
  doc: Document,
  id: string,
  text: string,
  control: HTMLElement,
): HTMLLabelElement {
  const label = element(doc, "label", text);
  label.htmlFor = id;
  control.id = id;
  control.style.minHeight = "44px";
  control.style.minWidth = "44px";
  label.append(control);
  return label;
}

function option(doc: Document, value: string, text: string): HTMLOptionElement {
  const result = element(doc, "option", text);
  result.value = value;
  return result;
}

function definition(doc: Document, term: string, value: string): HTMLDivElement {
  const wrapper = element(doc, "div");
  const name = element(doc, "dt", term);
  const description = element(doc, "dd", value);
  description.style.marginInlineStart = "1em";
  wrapper.append(name, description);
  return wrapper;
}

function stateLabel(state: HandbackItemState, language: Language): string {
  const c = HANDBACK_COPY[language];
  if (state === "pending") return c.pending;
  if (state === "done") return c.done;
  if (state === "UNKNOWN") return "UNKNOWN";
  return c.notApplicable;
}

/** Explicit, in-memory review. It never changes the shared device itself. */
export function mountSharedDeviceHandback(
  root: HTMLElement,
  regionId: string | null,
  language: Language,
): () => void {
  const doc = root.ownerDocument;
  const c = HANDBACK_COPY[language];
  const section = element(doc, "section");
  section.setAttribute("aria-label", c.title);
  const heading = element(doc, "h3", c.title);
  const intro = element(doc, "p", c.intro);
  const boundary = element(doc, "p", c.boundary);
  const privacy = element(doc, "p", c.privacy);
  const history = element(doc, "p", c.history);
  const resetBoundary = element(doc, "p", c.resetDoesNotDelete);
  const status = element(doc, "p");
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  status.setAttribute("aria-atomic", "true");
  const exportHint = element(doc, "p", c.filePrivate);
  const controls = element(doc, "div");
  const start = action(doc, c.capture);
  const reset = action(doc, c.reset);
  const exportJson = action(doc, c.exportJson);
  const exportText = action(doc, c.exportText);
  controls.append(start, reset, exportJson, exportText);

  const importText = element(doc, "textarea");
  importText.rows = 4;
  importText.maxLength = 65536;
  importText.style.width = "100%";
  const importLabel = labelled(doc, "shared-handback-import", c.importJson, importText);
  const importHint = element(doc, "p", c.importHint);
  const importButton = action(doc, c.importJson);

  const summaryHeading = element(doc, "h4", c.summary);
  const summary = element(doc, "dl");
  const filterControls = element(doc, "div");
  const categorySelect = element(doc, "select");
  const filterSelect = element(doc, "select");
  const orderSelect = element(doc, "select");
  categorySelect.append(option(doc, "all", c.allCategories));
  for (const category of HANDBACK_CATEGORIES) {
    categorySelect.append(option(doc, category, handbackCategoryText(category, language)));
  }
  for (const filter of HANDBACK_FILTERS) {
    filterSelect.append(option(doc, filter, handbackFilterText(filter, language)));
  }
  for (const order of HANDBACK_ORDERS) {
    orderSelect.append(option(doc, order, handbackOrderText(order, language)));
  }
  const search = element(doc, "input");
  search.type = "search";
  search.maxLength = 120;
  const categoryLabel = labelled(doc, "shared-handback-category", c.category, categorySelect);
  const filterLabel = labelled(doc, "shared-handback-filter", c.filter, filterSelect);
  const orderLabel = labelled(doc, "shared-handback-order", c.order, orderSelect);
  const searchLabel = labelled(doc, "shared-handback-search", c.search, search);
  filterControls.append(categoryLabel, filterLabel, orderLabel, searchLabel);

  const list = element(doc, "ol");
  const pager = element(doc, "nav");
  pager.setAttribute("aria-label", c.page);
  const previous = action(doc, c.previous);
  const next = action(doc, c.next);
  const position = element(doc, "span");
  pager.append(previous, position, next);
  const pageHost = element(doc, "div");
  pageHost.append(list, pager);

  section.append(
    heading, intro, boundary, privacy, history, resetBoundary, status, controls,
    exportHint, importLabel, importHint, importButton, summaryHeading, summary,
    filterControls, pageHost,
  );
  root.append(section);

  let review: SharedDeviceHandback | null = null;
  let currentFilter: HandbackFilter = "all";
  let currentCategory: HandbackCategory | "all" = "all";
  let currentOrder: HandbackOrder = "listed";
  let offset = 0;
  let sequence = 0;
  let disposed = false;

  const now = (): string => new Date().toISOString();
  const nextId = (at: string): string => {
    sequence += 1;
    return "handback-" + at.replace(/[^0-9]/g, "").slice(0, 17) + "-" + sequence;
  };

  const renderSummary = (): void => {
    summary.replaceChildren();
    if (!review) {
      summary.append(definition(doc, c.overall, "UNKNOWN"));
      return;
    }
    const totals = summarizeHandback(review);
    const overallText = totals.overall === "ready" ? c.ready
      : totals.overall === "UNKNOWN" ? "UNKNOWN" : c.progress;
    summary.append(
      definition(doc, c.overall, overallText),
      definition(doc, c.total, String(totals.total)),
      definition(doc, c.required, String(totals.required)),
      definition(doc, c.done, String(totals.done)),
      definition(doc, c.pending, String(totals.pending)),
      definition(doc, c.unknownCount, String(totals.unknown)),
      definition(doc, c.notApplicable, String(totals.notApplicable)),
      definition(doc, c.remaining, String(totals.remainingRequired)),
      definition(doc, c.updated, totals.updatedAt),
    );
  };

  const renderEntries = (): void => {
    list.replaceChildren();
    if (!review) {
      list.append(element(doc, "li", c.empty));
      previous.disabled = true;
      next.disabled = true;
      position.textContent = "0 / 0";
      return;
    }
    const page = pageHandback(review, {
      search: search.value,
      category: currentCategory,
      filter: currentFilter,
      order: currentOrder,
      offset,
      limit: HANDBACK_PAGE_SIZE,
    });
    for (const entry of page.entries) {
      const definitionItem = HANDBACK_ITEMS.find((item) => item.id === entry.itemId)!;
      const item = element(doc, "li");
      const title = element(doc, "strong", HANDBACK_ITEM_COPY[language][entry.itemId] ?? "UNKNOWN");
      const metadata = element(
        doc,
        "p",
        handbackCategoryText(definitionItem.category, language) + " · " +
          (definitionItem.required ? c.requiredMark : c.optionalMark),
      );
      const select = element(doc, "select");
      select.style.minHeight = "44px";
      select.style.minWidth = "44px";
      select.setAttribute("aria-label", c.status + " — " + title.textContent);
      select.append(
        option(doc, "pending", c.setPending),
        option(doc, "done", c.setDone),
        option(doc, "UNKNOWN", c.setUnknown),
        option(doc, "not-applicable", c.setNotApplicable),
      );
      select.value = entry.state;
      select.addEventListener("change", () => {
        if (!review) return;
        try {
          review = updateHandbackEntry(review, entry.itemId, select.value as HandbackItemState, now());
          status.textContent = c.started;
          renderSummary();
          renderEntries();
        } catch {
          status.textContent = c.error;
        }
      });
      const stateText = element(doc, "p", c.status + ": " + stateLabel(entry.state, language));
      const updated = element(doc, "p", entry.updatedAt ?? "UNKNOWN");
      item.append(title, metadata, select, stateText, updated);
      list.append(item);
    }
    if (page.entries.length === 0) list.append(element(doc, "li", c.noMatches));
    previous.disabled = !page.previous;
    next.disabled = !page.next;
    position.textContent = c.position + (language === "fr" ? "\u00a0: " : ": ") +
      (page.total === 0 ? 0 : page.offset + 1) + "–" +
      Math.min(page.offset + page.limit, page.total) + " / " + page.total;
  };

  const render = (): void => {
    if (disposed) return;
    reset.disabled = review === null;
    exportJson.disabled = review === null;
    exportText.disabled = review === null;
    importButton.disabled = importText.value.trim().length === 0;
    categorySelect.disabled = review === null;
    filterSelect.disabled = review === null;
    orderSelect.disabled = review === null;
    search.disabled = review === null;
    renderSummary();
    renderEntries();
  };

  const onStart = (): void => {
    const at = now();
    try {
      review = createSharedDeviceHandback(nextId(at), regionId, at);
      offset = 0;
      status.textContent = c.started;
      render();
    } catch {
      status.textContent = c.error;
    }
  };

  const onReset = (): void => {
    if (!review) return;
    try {
      review = createSharedDeviceHandback(review.reviewId, review.regionId, now());
      offset = 0;
      status.textContent = c.resetDone;
      render();
    } catch {
      status.textContent = c.error;
    }
  };

  const onExport = (format: "json" | "txt"): void => {
    if (!review) return;
    try {
      saveSharedDeviceHandback(review, language, format, doc);
      status.textContent = c.exported;
    } catch {
      status.textContent = c.error;
    }
  };

  const onImport = (): void => {
    const text = importText.value;
    if (!text.trim()) return;
    try {
      review = parseSharedDeviceHandback(text, regionId);
      importText.value = "";
      offset = 0;
      status.textContent = c.imported;
      render();
    } catch (error) {
      status.textContent = error instanceof Error && error.message.includes("region")
        ? c.regionMismatch : c.invalid;
    }
  };

  const onCategory = (): void => {
    currentCategory = categorySelect.value as HandbackCategory | "all";
    offset = 0;
    renderEntries();
  };
  const onFilter = (): void => {
    currentFilter = filterSelect.value as HandbackFilter;
    offset = 0;
    renderEntries();
  };
  const onOrder = (): void => {
    currentOrder = orderSelect.value as HandbackOrder;
    offset = 0;
    renderEntries();
  };
  const onSearch = (): void => { offset = 0; renderEntries(); };
  const onPrevious = (): void => { offset = Math.max(0, offset - HANDBACK_PAGE_SIZE); renderEntries(); };
  const onNext = (): void => { offset += HANDBACK_PAGE_SIZE; renderEntries(); };

  const listeners: readonly [HTMLElement, string, EventListener][] = [
    [start, "click", onStart],
    [reset, "click", onReset],
    [exportJson, "click", () => onExport("json")],
    [exportText, "click", () => onExport("txt")],
    [importButton, "click", onImport],
    [importText, "input", render],
    [categorySelect, "change", onCategory],
    [filterSelect, "change", onFilter],
    [orderSelect, "change", onOrder],
    [search, "input", onSearch],
    [previous, "click", onPrevious],
    [next, "click", onNext],
  ];
  for (const [target, event, listener] of listeners) target.addEventListener(event, listener);
  render();
  return () => {
    disposed = true;
    for (const [target, event, listener] of listeners) target.removeEventListener(event, listener);
    section.remove();
  };
}
