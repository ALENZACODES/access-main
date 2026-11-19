import { createOfflineAction } from "./accessibilityGuard";
import type { DashboardModel, DashboardState } from "./offlineDashboard";
import type { Language, RegionManifest } from "./regionDownload";
import { diagnosticActionText, diagnosticCopy, diagnosticReasonText } from "./offlineDiagnosticsCopy";
import {
  createDiagnosticExport, diagnosticFilename, encodeDiagnosticExport,
  inspectOfflineDiagnostics, queryOfflineDiagnostics,
  type DiagnosticFilter, type DiagnosticOrder, type DiagnosticSummary,
} from "./offlineDiagnostics";

const FILTERS: readonly DiagnosticFilter[] = ["all", "saved", "unknown", "download", "inspect"];
const ORDERS: readonly DiagnosticOrder[] = ["listed", "id", "bytes-desc", "bytes-asc", "reason"];

/** A read-only panel. It never writes device storage or initiates a download. */
export function mountOfflineDiagnostics(
  root: HTMLElement,
  manifest: RegionManifest,
  dashboard: DashboardModel,
  language: Language,
): () => void {
  const doc = root.ownerDocument;
  const c = diagnosticCopy(language);
  const section = doc.createElement("section");
  const heading = doc.createElement("h3");
  heading.textContent = c.title;
  const intro = doc.createElement("p");
  intro.textContent = c.intro;
  const disclosure = createOfflineAction(doc, c.inspect);
  const body = doc.createElement("div");
  const id = `offline-diagnostics-${Math.random().toString(36).slice(2)}`;
  body.id = id;
  body.hidden = true;
  disclosure.setAttribute("aria-controls", id);
  disclosure.setAttribute("aria-expanded", "false");
  const status = doc.createElement("p");
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  const controls = doc.createElement("div");
  const searchLabel = doc.createElement("label");
  searchLabel.textContent = c.search;
  const search = doc.createElement("input");
  search.type = "search";
  search.setAttribute("aria-label", c.search);
  search.style.minHeight = "44px";
  search.style.minWidth = "44px";
  searchLabel.append(search);
  const filterLabel = doc.createElement("label");
  filterLabel.textContent = c.filter;
  const filter = doc.createElement("select");
  filter.setAttribute("aria-label", c.filter);
  filter.style.minHeight = "44px";
  filter.style.minWidth = "44px";
  const filterNames = [c.all, c.savedOnly, c.unknownOnly, c.downloadOnly, c.inspectOnly];
  FILTERS.forEach((value, position) => {
    const option = doc.createElement("option");
    option.value = value;
    option.textContent = filterNames[position] ?? value;
    filter.append(option);
  });
  filterLabel.append(filter);
  const orderLabel = doc.createElement("label");
  orderLabel.textContent = c.order;
  const order = doc.createElement("select");
  order.setAttribute("aria-label", c.order);
  order.style.minHeight = "44px";
  order.style.minWidth = "44px";
  const orderNames = [c.listed, c.id, c.large, c.small, c.byReason];
  ORDERS.forEach((value, position) => {
    const option = doc.createElement("option");
    option.value = value;
    option.textContent = orderNames[position] ?? value;
    order.append(option);
  });
  orderLabel.append(order);
  const refresh = createOfflineAction(doc, c.refresh);
  const exportButton = createOfflineAction(doc, c.export);
  controls.append(searchLabel, filterLabel, orderLabel, refresh, exportButton);
  const summary = doc.createElement("dl");
  const list = doc.createElement("ol");
  const navigation = doc.createElement("nav");
  navigation.setAttribute("aria-label", c.page);
  const previous = createOfflineAction(doc, c.previous);
  const next = createOfflineAction(doc, c.next);
  const position = doc.createElement("span");
  navigation.append(previous, position, next);
  const advisory = doc.createElement("p");
  advisory.textContent = c.advisory;
  body.append(status, controls, summary, list, navigation, advisory);
  section.append(heading, intro, disclosure, body);
  root.append(section);

  let expanded = false;
  let disposed = false;
  let offset = 0;
  let latest: DiagnosticSummary | null = null;
  let lastState = dashboard.getState();
  const sep = language === "fr" ? "\u00a0:" : ":";
  const field = (name: string, value: string): HTMLElement => {
    const entry = doc.createElement("div");
    const term = doc.createElement("dt");
    const definition = doc.createElement("dd");
    term.textContent = name;
    definition.textContent = value;
    definition.style.marginInlineStart = "1em";
    entry.append(term, definition);
    return entry;
  };
  const value = (number: number | null): string => number === null ? c.unknown :
    `${number.toLocaleString(language === "fr" ? "fr-CA" : "en-CA")} B`;

  const render = (): void => {
    if (disposed || !expanded) return;
    latest = inspectOfflineDiagnostics(manifest, lastState.inventory, {
      quota: lastState.plan?.freeBytes ?? undefined,
      usage: 0,
    });
    const report = latest;
    status.textContent = report.status === "complete" ? c.complete :
      report.status === "partial" ? c.partial : c.uncertain;
    summary.replaceChildren(
      field(c.region, report.status),
      field(c.total, String(report.listed)),
      field(c.savedCount, String(report.saved)),
      field(c.unknownCount, String(report.unknown)),
      field(c.free, value(report.freeBytes)),
    );
    const page = queryOfflineDiagnostics(report, {
      search: search.value, filter: filter.value as DiagnosticFilter,
      order: order.value as DiagnosticOrder, offset, limit: 12,
    });
    list.replaceChildren();
    if (page.total === 0) {
      const item = doc.createElement("li");
      item.textContent = c.absent;
      list.append(item);
    }
    for (const cell of page.cells) {
      const item = doc.createElement("li");
      const title = doc.createElement("strong");
      title.textContent = cell.id;
      const dl = doc.createElement("dl");
      dl.append(
        field(c.reason, diagnosticReasonText(cell.reason, language)),
        field(c.action, diagnosticActionText(cell.action, language)),
        field(c.region, cell.status),
        field(c.size, value(cell.expectedBytes)),
        field(c.source, cell.source?.source ?? c.unknown),
        field(c.licence, cell.source?.licence ?? c.unknown),
        field(c.date, cell.source?.date ?? c.unknown),
        field(c.tier, cell.tier),
      );
      if (cell.observedSource !== null && cell.reason === "metadata-conflict") {
        dl.append(field(c.observed, `${cell.observedSource.source} ${cell.observedSource.date}`));
      }
      item.append(title, dl);
      list.append(item);
    }
    position.textContent = `${c.page}${sep} ${page.total === 0 ? 0 : offset + 1}–${Math.min(offset + page.limit, page.total)} / ${page.total}`;
    previous.disabled = !page.previous;
    next.disabled = !page.next;
    exportButton.disabled = lastState.phase === "checking" || lastState.phase === "downloading";
  };
  const toggle = (): void => {
    expanded = !expanded;
    body.hidden = !expanded;
    disclosure.textContent = expanded ? c.hide : c.inspect;
    disclosure.setAttribute("aria-expanded", String(expanded));
    if (expanded) render();
  };
  const change = (): void => { offset = 0; render(); };
  const onPrevious = (): void => { offset = Math.max(0, offset - 12); render(); };
  const onNext = (): void => { offset += 12; render(); };
  const onRefresh = (): void => { void dashboard.refresh(); };
  const onExport = (): void => {
    if (lastState.phase !== "ready" || latest === null) return;
    const day = new Date().toISOString().slice(0, 10);
    try {
      const data = createDiagnosticExport(latest, day);
      const blob = new Blob([encodeDiagnosticExport(data)], { type: "application/json;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      try {
        const anchor = doc.createElement("a");
        anchor.hidden = true;
        anchor.href = url;
        anchor.download = diagnosticFilename(manifest.regionId, day);
        doc.body.append(anchor);
        try { anchor.click(); } finally { anchor.remove(); }
      } finally { URL.revokeObjectURL(url); }
    } catch { status.textContent = c.exportFailed; }
  };
  disclosure.addEventListener("click", toggle);
  search.addEventListener("input", change);
  filter.addEventListener("change", change);
  order.addEventListener("change", change);
  previous.addEventListener("click", onPrevious);
  next.addEventListener("click", onNext);
  refresh.addEventListener("click", onRefresh);
  exportButton.addEventListener("click", onExport);
  const unsubscribe = dashboard.subscribe((state: DashboardState): void => {
    lastState = state;
    render();
  });
  return (): void => {
    disposed = true;
    unsubscribe();
    disclosure.removeEventListener("click", toggle);
    search.removeEventListener("input", change);
    filter.removeEventListener("change", change);
    order.removeEventListener("change", change);
    previous.removeEventListener("click", onPrevious);
    next.removeEventListener("click", onNext);
    refresh.removeEventListener("click", onRefresh);
    exportButton.removeEventListener("click", onExport);
    section.remove();
  };
}
