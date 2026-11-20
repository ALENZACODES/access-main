import { createOfflineAction } from "./accessibilityGuard";
import type { DashboardModel, DashboardState } from "./offlineDashboard";
import type { Language, RegionManifest } from "./regionDownload";
import { reviewSourceAge, sourceAgeGroups, sourceAgePage,
  type AgeFilter, type AgeSort, type AgeSummary } from "./sourceAgeReview";
import { ageBandText, ageIssueText, copyBandText, sourceAgeCopy } from "./sourceAgeCopy";
import { createSourceAgeDocument, saveSourceAgeDocument } from "./sourceAgeExport";

const FILTERS: readonly AgeFilter[] = ["all", "recent", "older", "future", "unknown", "needs-attention"];
const SORTS: readonly AgeSort[] = ["manifest", "oldest", "newest", "source", "status"];

function element<K extends keyof HTMLElementTagNameMap>(doc: Document, tag: K, value?: string): HTMLElementTagNameMap[K] {
  const node = doc.createElement(tag);
  if (value !== undefined) node.textContent = value;
  return node;
}

function label(doc: Document, text: string, input: HTMLElement): HTMLLabelElement {
  const node = element(doc, "label", text);
  node.style.display = "block";
  node.append(input);
  return node;
}

function textInput(doc: Document, value: string, type: string): HTMLInputElement {
  const node = element(doc, "input");
  node.type = type;
  node.value = value;
  node.style.minHeight = "44px";
  node.style.minWidth = "44px";
  node.style.maxWidth = "100%";
  return node;
}

function selectInput(doc: Document, options: readonly { value: string; label: string }[]): HTMLSelectElement {
  const select = element(doc, "select");
  select.style.minHeight = "44px";
  select.style.minWidth = "44px";
  for (const item of options) {
    const option = element(doc, "option", item.label);
    option.value = item.value;
    select.append(option);
  }
  return select;
}

function definition(doc: Document, term: string, value: string): HTMLDivElement {
  const wrapper = element(doc, "div");
  wrapper.append(element(doc, "dt", term), element(doc, "dd", value));
  return wrapper;
}

export interface SourceAgePanelOptions {
  readonly today?: () => string;
  readonly defaultThreshold?: number;
}

/**
 * Explicit review on the live offline dashboard. Never downloads cells,
 * schedules work, mutates the store, or interprets physical accessibility.
 */
export function mountOfflineSourceAge(
  host: HTMLElement,
  manifest: RegionManifest,
  model: DashboardModel,
  language: Language,
  options: SourceAgePanelOptions = {},
): () => void {
  const doc = host.ownerDocument;
  const c = sourceAgeCopy(language);
  const today = options.today ?? (() => new Date().toISOString().slice(0, 10));
  const section = element(doc, "section");
  section.setAttribute("aria-label", c.title);
  section.append(element(doc, "h3", c.title));
  const opener = createOfflineAction(doc, c.show);
  const details = element(doc, "div");
  const detailsId = `source-age-${manifest.regionId.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
  details.id = detailsId;
  details.hidden = true;
  opener.setAttribute("aria-controls", detailsId);
  opener.setAttribute("aria-expanded", "false");
  const intro = element(doc, "p", c.intro);
  const disclaimer = element(doc, "p", c.disclaimer);
  const status = element(doc, "p");
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  status.setAttribute("aria-atomic", "true");
  const threshold = textInput(doc, String(options.defaultThreshold ?? 365), "number");
  threshold.min = "1";
  threshold.max = "3650";
  threshold.step = "1";
  threshold.title = c.thresholdHelp;
  const search = textInput(doc, "", "search");
  search.maxLength = 160;
  const filter = selectInput(doc, FILTERS.map((value) => ({
    value,
    label: value === "all" ? c.all : value === "recent" ? c.recent :
      value === "older" ? c.older : value === "future" ? c.future :
        value === "unknown" ? c.unknownOnly : c.attention,
  })));
  const order = selectInput(doc, SORTS.map((value) => ({
    value,
    label: value === "manifest" ? c.orderManifest : value === "oldest" ? c.orderOldest :
      value === "newest" ? c.orderNewest : value === "source" ? c.orderSource : c.orderStatus,
  })));
  const refresh = createOfflineAction(doc, c.refresh);
  const textButton = createOfflineAction(doc, c.exportText);
  const jsonButton = createOfflineAction(doc, c.exportJson);
  const summary = element(doc, "dl");
  const groupHeading = element(doc, "h4", c.group);
  const groups = element(doc, "ul");
  const list = element(doc, "ol");
  const paging = element(doc, "nav");
  paging.setAttribute("aria-label", c.page);
  const first = createOfflineAction(doc, c.firstPage);
  const previous = createOfflineAction(doc, c.previous);
  const next = createOfflineAction(doc, c.next);
  const last = createOfflineAction(doc, c.lastPage);
  const pageLabel = element(doc, "span");
  paging.append(first, previous, pageLabel, next, last);
  details.append(intro, label(doc, c.ageThreshold, threshold),
    label(doc, c.search, search), label(doc, c.filter, filter),
    label(doc, c.sort, order), refresh, status, summary, groupHeading, groups,
    list, paging, textButton, jsonButton, disclaimer);
  section.append(opener, details);
  host.append(section);

  let disposed = false;
  let open = false;
  let page = 0;
  let review: AgeSummary | null = null;
  let latestState: DashboardState = model.getState();

  const updateReview = (): void => {
    if (disposed || !open) return;
    const days = Number(threshold.value);
    if (!Number.isSafeInteger(days) || days < 1 || days > 3650) {
      review = null;
      status.textContent = c.thresholdHelp;
      render();
      return;
    }
    try {
      review = reviewSourceAge(manifest, latestState.inventory, today(), days);
      status.textContent = review.state === "UNKNOWN" ? c.caution : c.ready;
    } catch {
      review = null;
      status.textContent = c.error;
    }
    render();
  };

  const render = (): void => {
    summary.replaceChildren();
    groups.replaceChildren();
    list.replaceChildren();
    if (!review) {
      paging.hidden = true;
      textButton.disabled = true;
      jsonButton.disabled = true;
      return;
    }
    const data = review;
    const values: readonly [string, number][] = [
      [c.total, data.total], [c.available, data.saved],
      [c.missingCount, data.missing], [c.staleCount, data.stale],
      [c.unreadableCount, data.unreadable], [c.recentCount, data.recent],
      [c.olderCount, data.older], [c.futureCount, data.future],
      [c.unknownCount, data.unknown],
    ];
    for (const [term, value] of values) summary.append(definition(doc, term, String(value)));
    for (const source of sourceAgeGroups(data)) {
      groups.append(element(doc, "li", `${source.source.source} — ${source.source.licence} — ${source.source.date}`));
    }
    const view = sourceAgePage(data, {
      page, pageSize: 12, search: search.value,
      filter: filter.value as AgeFilter,
      sort: order.value as AgeSort,
    });
    page = view.page;
    for (const row of view.rows) {
      const item = element(doc, "li");
      const heading = element(doc, "strong", row.id);
      const cell = element(doc, "dl");
      cell.append(
        definition(doc, c.status, copyBandText(row.copyBand, language)),
        definition(doc, c.filter, ageBandText(row.ageBand, language)),
        definition(doc, c.issue, ageIssueText(row.issue, language)),
        definition(doc, c.source, row.provenance?.source ?? c.unknown),
        definition(doc, c.licence, row.provenance?.licence ?? c.unknown),
        definition(doc, c.sourceDate, row.provenance?.date ?? c.unknown),
        definition(doc, c.age, row.ageDays === null ? c.unknown : String(row.ageDays)),
        definition(doc, c.size, row.listedBytes === null ? c.unknown : String(row.listedBytes)),
        definition(doc, c.tier, c.unknown),
      );
      item.append(heading, cell);
      list.append(item);
    }
    if (view.rows.length === 0) list.append(element(doc, "li", c.noRows));
    pageLabel.textContent = `${c.page}${language === "fr" ? "\u00a0:" : ":"} ${view.page + 1} / ${view.pages}`;
    paging.hidden = false;
    first.disabled = !view.previous;
    previous.disabled = !view.previous;
    next.disabled = !view.next;
    last.disabled = !view.next;
    textButton.disabled = false;
    jsonButton.disabled = false;
  };

  const openPanel = (): void => {
    open = !open;
    details.hidden = !open;
    opener.textContent = open ? c.hide : c.show;
    opener.setAttribute("aria-expanded", String(open));
    if (open) updateReview();
  };
  const onChange = (): void => { page = 0; updateReview(); };
  const onRefresh = (): void => { void model.refresh().then(() => updateReview()); };
  const save = (format: "txt" | "json"): void => {
    if (!review || disposed) return;
    try { saveSourceAgeDocument(createSourceAgeDocument(review), language, format, doc); }
    catch { status.textContent = c.exportFailed; }
  };
  const onText = (): void => save("txt");
  const onJson = (): void => save("json");
  const onFirst = (): void => { page = 0; render(); };
  const onPrevious = (): void => { page = Math.max(0, page - 1); render(); };
  const onNext = (): void => { page += 1; render(); };
  const onLast = (): void => { if (review) page = Math.max(0, Math.ceil(sourceAgePage(review, {
    filter: filter.value as AgeFilter, sort: order.value as AgeSort,
    search: search.value, page: 0, pageSize: 12,
  }).total / 12) - 1); render(); };

  opener.addEventListener("click", openPanel);
  threshold.addEventListener("change", onChange);
  search.addEventListener("input", onChange);
  filter.addEventListener("change", onChange);
  order.addEventListener("change", onChange);
  refresh.addEventListener("click", onRefresh);
  textButton.addEventListener("click", onText);
  jsonButton.addEventListener("click", onJson);
  first.addEventListener("click", onFirst);
  previous.addEventListener("click", onPrevious);
  next.addEventListener("click", onNext);
  last.addEventListener("click", onLast);
  const unsubscribe = model.subscribe((state) => {
    latestState = state;
    if (open && state.phase !== "downloading" && state.phase !== "checking") updateReview();
  });
  return () => {
    disposed = true;
    unsubscribe();
    opener.removeEventListener("click", openPanel);
    threshold.removeEventListener("change", onChange);
    search.removeEventListener("input", onChange);
    filter.removeEventListener("change", onChange);
    order.removeEventListener("change", onChange);
    refresh.removeEventListener("click", onRefresh);
    textButton.removeEventListener("click", onText);
    jsonButton.removeEventListener("click", onJson);
    first.removeEventListener("click", onFirst);
    previous.removeEventListener("click", onPrevious);
    next.removeEventListener("click", onNext);
    last.removeEventListener("click", onLast);
    section.remove();
  };
}
