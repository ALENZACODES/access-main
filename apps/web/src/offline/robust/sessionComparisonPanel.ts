import type { Language, RegionManifest } from "./regionDownload";
import type { RegionInventory } from "./regionInventory";
import type { DashboardModel } from "./offlineDashboard";
import {
  captureOfflineSnapshot, compareOfflineSnapshots, pageSnapshotComparison,
  type OfflineSnapshot, type SnapshotComparison, type ComparisonQuery,
} from "./sessionComparison";
import { CHANGE_COPY, comparisonSummary, SESSION_COPY } from "./sessionComparisonCopy";
import { saveSessionComparison } from "./sessionComparisonExport";

function node<K extends keyof HTMLElementTagNameMap>(tag: K, text?: string): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  if (text !== undefined) element.textContent = text;
  return element;
}

function action(label: string): HTMLButtonElement {
  const button = node("button", label);
  button.type = "button";
  button.style.minHeight = "44px";
  button.style.minWidth = "44px";
  button.style.padding = "8px 12px";
  return button;
}

function field(label: string, value: string): HTMLDivElement {
  const wrapper = node("div");
  const dt = node("dt", label);
  const dd = node("dd", value);
  wrapper.append(dt, dd);
  return wrapper;
}

/**
 * Device-local comparison. No timers, local-storage writes or background fetches.
 * The host dashboard performs its usual explicit refresh, then this panel reads
 * the resulting inventory state. Unreadable or inconsistent observations remain UNKNOWN.
 */
export function mountOfflineSessionComparison(
  root: HTMLElement,
  manifest: RegionManifest,
  model: DashboardModel,
  language: Language,
): () => void {
  const c = SESSION_COPY[language];
  const section = node("section");
  const heading = node("h3", c.title);
  const description = node("p", c.intro);
  const message = node("p", c.noBaseline);
  message.setAttribute("role", "status");
  message.setAttribute("aria-live", "polite");
  message.setAttribute("aria-atomic", "true");
  const controls = node("div");
  controls.style.display = "flex";
  controls.style.flexWrap = "wrap";
  controls.style.gap = "8px";
  const captureButton = action(c.capture);
  const compareButton = action(c.compare);
  const resetButton = action(c.reset);
  const textButton = action(c.exportText);
  const jsonButton = action(c.exportJson);
  controls.append(captureButton, compareButton, resetButton, textButton, jsonButton);
  const summary = node("p");
  const filters = node("div");
  const searchLabel = node("label", c.search);
  const search = node("input");
  search.type = "search";
  search.style.minHeight = "44px";
  search.style.minWidth = "44px";
  search.maxLength = 160;
  const filterLabel = node("label", c.filter);
  const filter = node("select");
  filter.style.minHeight = "44px";
  filter.style.minWidth = "44px";
  const options: Array<[ComparisonQuery["filter"], string]> = [
    ["all", c.all], ["changed", c.changed], ["unknown", c.unknown], ["saved", c.saved],
  ];
  for (const [value, caption] of options) {
    const option = node("option", caption);
    option.value = value;
    filter.append(option);
  }
  const searchId = `offline-session-search-${manifest.regionId.replace(/[^\w-]/g, "-")}`;
  const filterId = `offline-session-filter-${manifest.regionId.replace(/[^\w-]/g, "-")}`;
  search.id = searchId;
  filter.id = filterId;
  searchLabel.htmlFor = searchId;
  filterLabel.htmlFor = filterId;
  filters.append(searchLabel, search, filterLabel, filter);
  filters.style.display = "grid";
  filters.style.gap = "8px";
  const rows = node("ol");
  const pagination = node("nav");
  pagination.setAttribute("aria-label", c.page);
  const previousButton = action(c.previous);
  const nextButton = action(c.next);
  const pageInfo = node("span");
  pagination.append(previousButton, pageInfo, nextButton);
  const note = node("p", c.note);
  section.append(heading, description, message, controls, summary, filters, rows, pagination, note);
  root.append(section);

  let initial: OfflineSnapshot | null = null;
  let result: SnapshotComparison | null = null;
  let disposed = false;
  let busy = false;
  let revision = 0;
  let offset = 0;
  const limit = 12;

  const render = (): void => {
    captureButton.disabled = busy;
    compareButton.disabled = busy || initial === null;
    resetButton.disabled = busy || (initial === null && result === null);
    textButton.disabled = busy || result === null;
    jsonButton.disabled = busy || result === null;
    search.disabled = result === null;
    filter.disabled = result === null;
    previousButton.disabled = true;
    nextButton.disabled = true;
    rows.replaceChildren();
    summary.textContent = result === null ? "" : comparisonSummary(result, language);
    filters.hidden = result === null;
    pagination.hidden = result === null;
    if (result === null) return;
    const selection = pageSnapshotComparison(result, {
      filter: filter.value as ComparisonQuery["filter"],
      search: search.value,
      offset, limit,
    });
    previousButton.disabled = !selection.hasPrevious;
    nextButton.disabled = !selection.hasNext;
    const first = selection.total === 0 ? 0 : selection.offset + 1;
    pageInfo.textContent = `${first}–${Math.min(selection.offset + limit, selection.total)} / ${selection.total}`;
    if (selection.rows.length === 0) {
      rows.append(node("li", c.noRows));
      return;
    }
    for (const row of selection.rows) {
      const item = node("li");
      const title = node("strong", row.cellId);
      const change = node("p", CHANGE_COPY[language][row.change]);
      const details = node("dl");
      details.append(
        field(c.before, row.before?.state === "saved" ? c.savedLabel : c.unknownLabel),
        field(c.after, row.after?.state === "saved" ? c.savedLabel : c.unknownLabel),
      );
      const source = row.after?.source ?? row.before?.source;
      details.append(
        field(c.source, source?.source ?? c.unknownLabel),
        field(c.licence, source?.licence ?? c.unknownLabel),
        field(c.date, source?.date ?? c.unknownLabel),
      );
      item.append(title, change, details);
      rows.append(item);
    }
  };

  const readSnapshot = async (): Promise<OfflineSnapshot> => {
    // A refresh may fail; in that case do not reuse a previously successful reading.
    await model.refresh();
    const state = model.getState();
    const inventory: RegionInventory | null = state.phase === "ready" ? state.inventory : null;
    return captureOfflineSnapshot(manifest, inventory, new Date().toISOString());
  };

  const withReading = async (kind: "start" | "compare"): Promise<void> => {
    if (busy || disposed) return;
    busy = true;
    const token = ++revision;
    message.textContent = c.comparing;
    render();
    try {
      const captured = await readSnapshot();
      if (disposed || token !== revision) return;
      if (kind === "start") {
        initial = captured;
        result = null;
        message.textContent = captured.state === "UNKNOWN" ? c.unavailable : c.captured;
      } else if (initial !== null) {
        result = compareOfflineSnapshots(initial, captured);
        message.textContent = result.status === "UNKNOWN" ? c.unavailable : c.complete;
      }
      offset = 0;
    } catch {
      if (!disposed && token === revision) {
        // Preserve the earlier starting reading, but do not fabricate a newer one.
        message.textContent = c.unavailable;
      }
    } finally {
      if (!disposed && token === revision) {
        busy = false;
        render();
      }
    }
  };

  const onStart = (): void => { void withReading("start"); };
  const onCompare = (): void => { void withReading("compare"); };
  const onReset = (): void => {
    revision += 1;
    initial = null;
    result = null;
    offset = 0;
    search.value = "";
    filter.value = "all";
    message.textContent = c.noBaseline;
    render();
  };
  const onFilter = (): void => { offset = 0; render(); };
  const onPrevious = (): void => { offset = Math.max(0, offset - limit); render(); };
  const onNext = (): void => { offset += limit; render(); };
  const onText = (): void => { if (result !== null) saveSessionComparison(result, language, "txt", root.ownerDocument); };
  const onJson = (): void => { if (result !== null) saveSessionComparison(result, language, "json", root.ownerDocument); };
  captureButton.addEventListener("click", onStart);
  compareButton.addEventListener("click", onCompare);
  resetButton.addEventListener("click", onReset);
  search.addEventListener("input", onFilter);
  filter.addEventListener("change", onFilter);
  previousButton.addEventListener("click", onPrevious);
  nextButton.addEventListener("click", onNext);
  textButton.addEventListener("click", onText);
  jsonButton.addEventListener("click", onJson);
  render();

  return () => {
    disposed = true;
    revision += 1;
    captureButton.removeEventListener("click", onStart);
    compareButton.removeEventListener("click", onCompare);
    resetButton.removeEventListener("click", onReset);
    search.removeEventListener("input", onFilter);
    filter.removeEventListener("change", onFilter);
    previousButton.removeEventListener("click", onPrevious);
    nextButton.removeEventListener("click", onNext);
    textButton.removeEventListener("click", onText);
    jsonButton.removeEventListener("click", onJson);
    section.remove();
  };
}
