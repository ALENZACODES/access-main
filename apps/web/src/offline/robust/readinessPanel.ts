import type { Language, RegionManifest, StorageEstimate } from "./regionDownload";
import type { DashboardModel, DashboardState } from "./offlineDashboard";
import { createOfflineAction } from "./accessibilityGuard";
import { browseReadiness, createReadinessReview, serializeReadiness,
  type ReadinessFilter, type ReadinessOrder, type ReadinessReview } from "./readinessReview";
import { readinessActionText, readinessCopy, readinessReasonText, readinessStateText } from "./readinessCopy";

interface ReadinessPanelState {
  readonly expanded: boolean;
  readonly search: string;
  readonly filter: ReadinessFilter;
  readonly order: ReadinessOrder;
  readonly page: number;
  readonly report: ReadinessReview | null;
  readonly busy: boolean;
}

function el<K extends keyof HTMLElementTagNameMap>(doc: Document, tag: K, text?: string): HTMLElementTagNameMap[K] {
  const node = doc.createElement(tag);
  if (text !== undefined) node.textContent = text;
  return node;
}

function field(doc: Document, term: string, value: string): HTMLDivElement {
  const wrapper = el(doc, "div");
  const label = el(doc, "dt", term);
  const description = el(doc, "dd", value);
  description.style.marginInlineStart = "1em";
  wrapper.append(label, description);
  return wrapper;
}

function controlSelect(
  doc: Document, title: string, choices: readonly (readonly [string, string])[],
): { readonly wrapper: HTMLLabelElement; readonly input: HTMLSelectElement } {
  const label = el(doc, "label", title);
  const select = el(doc, "select");
  select.style.minHeight = "44px";
  select.style.minWidth = "44px";
  select.style.display = "block";
  select.style.marginBlock = "6px";
  for (const [value, text] of choices) {
    const option = el(doc, "option", text);
    option.value = value;
    select.append(option);
  }
  label.append(select);
  return { wrapper: label, input: select };
}

function readableBytes(bytes: number | null, language: Language): string {
  return bytes === null ? readinessCopy(language).unknownTier :
    new Intl.NumberFormat(language === "fr" ? "fr-CA" : "en-CA").format(bytes);
}

/**
 * Opt-in, read-only device examination. No download or storage write is made.
 * Caller owns the dashboard model and its lifecycle.
 */
export function mountOfflineReadiness(
  root: HTMLElement,
  manifest: RegionManifest,
  model: DashboardModel,
  language: Language,
  estimateStorage: () => Promise<StorageEstimate>,
): () => void {
  const doc = root.ownerDocument;
  const c = readinessCopy(language);
  let disposed = false;
  let ticket = 0;
  let state: ReadinessPanelState = {
    expanded: false, search: "", filter: "all", order: "listed", page: 0,
    report: null, busy: false,
  };
  const section = el(doc, "section");
  const heading = el(doc, "h2", c.title);
  const introduction = el(doc, "p", c.description);
  const warning = el(doc, "p", c.locationNotice);
  const toggle = createOfflineAction(doc, c.open);
  const panel = el(doc, "div");
  const status = el(doc, "p");
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  status.setAttribute("aria-atomic", "true");
  const refresh = createOfflineAction(doc, c.refresh);
  const exportButton = createOfflineAction(doc, c.export);
  const summary = el(doc, "dl");
  const searchLabel = el(doc, "label", c.search);
  const search = el(doc, "input");
  search.type = "search";
  search.style.minHeight = "44px";
  search.style.minWidth = "44px";
  search.style.display = "block";
  search.maxLength = 160;
  searchLabel.append(search);
  const filter = controlSelect(doc, c.filter, [
    ["all", c.all], ["saved", c.onlySaved], ["unknown", c.onlyUnknown],
    ["download", c.download], ["inspect", c.inspect], ["source", c.sourceFilter],
  ]);
  const order = controlSelect(doc, c.sort, [
    ["listed", c.listed], ["id", c.byId], ["size-asc", c.smaller], ["size-desc", c.larger],
  ]);
  const results = el(doc, "div");
  const paging = el(doc, "nav");
  paging.setAttribute("aria-label", c.rowCount);
  const previous = createOfflineAction(doc, c.previous);
  const next = createOfflineAction(doc, c.next);
  const count = el(doc, "span");
  paging.append(previous, count, next);
  panel.append(status, refresh, exportButton, summary, searchLabel,
    filter.wrapper, order.wrapper, results, paging);
  section.append(heading, introduction, warning, toggle, panel);
  root.append(section);
  panel.hidden = true;
  toggle.setAttribute("aria-expanded", "false");

  const paint = (): void => {
    panel.hidden = !state.expanded;
    toggle.textContent = state.expanded ? c.close : c.open;
    toggle.setAttribute("aria-expanded", String(state.expanded));
    if (!state.expanded) return;
    refresh.disabled = state.busy;
    exportButton.disabled = state.busy || state.report === null;
    status.textContent = state.busy ? c.busy : !state.report ? c.unavailable :
      state.report.status === "complete" ? c.complete :
      state.report.status === "partial" ? c.partial : c.unknownRegion;
    summary.replaceChildren();
    results.replaceChildren();
    if (state.report === null) {
      previous.disabled = true;
      next.disabled = true;
      count.textContent = "";
      return;
    }
    const report = state.report;
    summary.append(
      field(doc, c.saved, String(report.totals.saved)),
      field(doc, c.unknown, String(report.totals.unknown)),
      field(doc, c.needed, readableBytes(report.totals.remainingBytes, language)),
      field(doc, c.quota, readableBytes(report.estimate.freeBytes, language)),
      field(doc, c.reserve, readableBytes(report.estimate.reserveBytes, language)),
    );
    summary.append(el(doc, "p", report.estimate.state === "sufficient" ? c.enough :
      report.estimate.state === "low" ? c.low : c.noEstimate));
    const subset = browseReadiness(report, {
      search: state.search, filter: state.filter, order: state.order,
      offset: state.page * 12, limit: 12,
    });
    if (subset.rows.length === 0) results.append(el(doc, "p", c.noCells));
    else {
      const list = el(doc, "ol");
      list.start = subset.offset + 1;
      for (const row of subset.rows) {
        const item = el(doc, "li");
        const name = el(doc, "strong", row.id);
        const definitions = el(doc, "dl");
        definitions.append(
          field(doc, c.state, readinessStateText(row.state, language)),
          field(doc, c.advice, readinessActionText(row.nextStep, language)),
          field(doc, c.source, row.source?.source ?? c.unknownTier),
          field(doc, c.licence, row.source?.licence ?? c.unknownTier),
          field(doc, c.date, row.source?.date ?? c.unknownTier),
          field(doc, c.tier, c.unknownTier),
          field(doc, c.size, readableBytes(row.expectedBytes, language)),
        );
        if (row.observedSource && row.reason === "mismatched-metadata") {
          definitions.append(field(doc, c.observed, row.observedSource.source));
        }
        item.append(name, el(doc, "p", readinessReasonText(row.reason, language)), definitions);
        list.append(item);
      }
      results.append(list);
    }
    count.textContent = `${subset.total === 0 ? 0 : subset.offset + 1}–${Math.min(subset.offset + subset.limit, subset.total)} / ${subset.total}`;
    previous.disabled = state.page === 0;
    next.disabled = !subset.hasNext;
  };

  const examine = async (): Promise<void> => {
    if (disposed || !state.expanded) return;
    const current = ++ticket;
    state = { ...state, busy: true };
    paint();
    try {
      await model.refresh();
      let estimate: StorageEstimate = {};
      try { estimate = await estimateStorage(); } catch { /* UNKNOWN */ }
      if (disposed || current !== ticket) return;
      const view: DashboardState = model.getState();
      state = { ...state, report: createReadinessReview(manifest, view.inventory, estimate), busy: false };
    } catch {
      if (disposed || current !== ticket) return;
      state = { ...state, report: createReadinessReview(manifest, null), busy: false };
    }
    paint();
  };
  const onToggle = (): void => {
    state = { ...state, expanded: !state.expanded };
    paint();
    if (state.expanded) void examine();
  };
  const onRefresh = (): void => { void examine(); };
  const onSearch = (): void => { state = { ...state, search: search.value, page: 0 }; paint(); };
  const onFilter = (): void => { state = { ...state, filter: filter.input.value as ReadinessFilter, page: 0 }; paint(); };
  const onOrder = (): void => { state = { ...state, order: order.input.value as ReadinessOrder, page: 0 }; paint(); };
  const onPrevious = (): void => { state = { ...state, page: Math.max(0, state.page - 1) }; paint(); };
  const onNext = (): void => { state = { ...state, page: state.page + 1 }; paint(); };
  const onExport = (): void => {
    if (!state.report || state.busy) return;
    try {
      const content = serializeReadiness(state.report);
      const blob = new Blob([content], { type: "application/json;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      try {
        const link = el(doc, "a");
        link.download = "offline-readiness.json";
        link.href = url;
        link.hidden = true;
        doc.body.append(link);
        try { link.click(); } finally { link.remove(); }
      } finally { URL.revokeObjectURL(url); }
    } catch { status.textContent = c.exportError; }
  };
  toggle.addEventListener("click", onToggle);
  refresh.addEventListener("click", onRefresh);
  exportButton.addEventListener("click", onExport);
  search.addEventListener("input", onSearch);
  filter.input.addEventListener("change", onFilter);
  order.input.addEventListener("change", onOrder);
  previous.addEventListener("click", onPrevious);
  next.addEventListener("click", onNext);
  paint();
  return () => {
    disposed = true;
    ticket += 1;
    toggle.removeEventListener("click", onToggle);
    refresh.removeEventListener("click", onRefresh);
    exportButton.removeEventListener("click", onExport);
    search.removeEventListener("input", onSearch);
    filter.input.removeEventListener("change", onFilter);
    order.input.removeEventListener("change", onOrder);
    previous.removeEventListener("click", onPrevious);
    next.removeEventListener("click", onNext);
    section.remove();
  };
}
