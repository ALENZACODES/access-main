import { createOfflineAction } from "./accessibilityGuard.ts";
import type { DashboardModel, DashboardState } from "./offlineDashboard.ts";
import type { Language, RegionManifest, StorageEstimate } from "./regionDownload.ts";
import {
  browseStorageScenario, planStorageScenario, scenarioSources,
  DEFAULT_SCENARIO_OPTIONS,
  type ScenarioFilter, type ScenarioSort, type ScenarioPlan,
} from "./storageScenario.ts";
import {
  scenarioCopy, candidateReasonText, dispositionText,
  scenarioStatusText, scenarioBlockText,
} from "./storageScenarioCopy.ts";
import { createScenarioReport, saveScenarioReport } from "./storageScenarioExport.ts";

const MIB = 1024 * 1024;
const KIB = 1024;
const PAGE_LENGTH = 10;

interface PanelOptions {
  readonly reserveMib: number;
  readonly overheadKib: number;
  readonly batchSize: number;
  readonly search: string;
  readonly filter: ScenarioFilter;
  readonly sort: ScenarioSort;
  readonly offset: number;
}

function safeNumber(value: string, maximum: number, fallback: number): number {
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= 0 && number <= maximum ? number : fallback;
}

function appendText<K extends keyof HTMLElementTagNameMap>(
  doc: Document, tag: K, value: string,
): HTMLElementTagNameMap[K] {
  const node = doc.createElement(tag);
  node.textContent = value;
  return node;
}

function labelledInput(
  doc: Document, caption: string, initial: number, max: number,
): { field: HTMLInputElement; wrap: HTMLLabelElement } {
  const wrap = doc.createElement("label");
  wrap.style.display = "inline-flex";
  wrap.style.flexDirection = "column";
  wrap.style.gap = "4px";
  wrap.style.margin = "8px";
  wrap.textContent = caption;
  const field = doc.createElement("input");
  field.type = "number";
  field.min = "0";
  field.max = String(max);
  field.step = "1";
  field.value = String(initial);
  field.style.minHeight = "44px";
  field.style.minWidth = "88px";
  field.style.padding = "8px";
  wrap.append(field);
  return { field, wrap };
}

function labelledSearch(doc: Document, caption: string): HTMLLabelElement & {
  readonly queryField?: HTMLInputElement;
} {
  const wrap = doc.createElement("label");
  wrap.style.display = "inline-flex";
  wrap.style.flexDirection = "column";
  wrap.style.margin = "8px";
  wrap.textContent = caption;
  const field = doc.createElement("input");
  field.type = "search";
  field.maxLength = 160;
  field.style.minHeight = "44px";
  field.style.minWidth = "200px";
  wrap.append(field);
  return Object.assign(wrap, { queryField: field });
}

function labelledSelect(
  doc: Document, label: string, entries: readonly { value: string; text: string }[],
): { wrap: HTMLLabelElement; field: HTMLSelectElement } {
  const wrap = doc.createElement("label");
  wrap.textContent = label;
  wrap.style.display = "inline-flex";
  wrap.style.flexDirection = "column";
  wrap.style.margin = "8px";
  const field = doc.createElement("select");
  field.style.minHeight = "44px";
  field.style.minWidth = "160px";
  for (const entry of entries) {
    const option = doc.createElement("option");
    option.value = entry.value;
    option.textContent = entry.text;
    field.append(option);
  }
  wrap.append(field);
  return { wrap, field };
}

function formattedBytes(bytes: number | null, language: Language): string {
  return bytes === null ? "UNKNOWN" :
    `${new Intl.NumberFormat(language === "fr" ? "fr-CA" : "en-CA").format(bytes)} B`;
}

function entry(doc: Document, label: string, value: string): HTMLDivElement {
  const div = doc.createElement("div");
  const dt = appendText(doc, "dt", label);
  const dd = appendText(doc, "dd", value);
  dd.style.marginInlineStart = "1em";
  div.append(dt, dd);
  return div;
}

function makePlan(
  manifest: RegionManifest, state: DashboardState,
  estimate: StorageEstimate, options: PanelOptions,
): ScenarioPlan {
  return planStorageScenario({
    manifest, inventory: state.inventory, estimate,
    reserveBytes: options.reserveMib * MIB,
    overheadBytes: options.overheadKib * KIB,
    maxBatchCells: options.batchSize,
  });
}

/**
 * One existing dashboard mount. It reads the current model but never invokes
 * downloads, removals, storage persistence, background tasks, or telemetry.
 */
export function mountStorageScenarioPanel(
  root: HTMLElement,
  manifest: RegionManifest,
  model: DashboardModel,
  language: Language,
  estimateStorage: () => Promise<StorageEstimate>,
): () => void {
  const doc = root.ownerDocument;
  const c = scenarioCopy(language);
  let disposed = false;
  let expanded = false;
  let busy = false;
  let estimate: StorageEstimate = {};
  let hasEstimate = false;
  let options: PanelOptions = {
    reserveMib: DEFAULT_SCENARIO_OPTIONS.reserveBytes / MIB,
    overheadKib: DEFAULT_SCENARIO_OPTIONS.overheadBytes / KIB,
    batchSize: DEFAULT_SCENARIO_OPTIONS.maxBatchCells,
    search: "", filter: "all", sort: "listed", offset: 0,
  };

  const section = doc.createElement("section");
  const title = appendText(doc, "h2", c.title);
  const open = createOfflineAction(doc, c.open);
  const description = appendText(doc, "p", c.intro);
  const privacy = appendText(doc, "p", c.privacy);
  const status = doc.createElement("p");
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  status.setAttribute("aria-atomic", "true");

  const content = doc.createElement("div");
  const settings = doc.createElement("div");
  const reserve = labelledInput(doc, c.reserve, options.reserveMib, 1024);
  const overhead = labelledInput(doc, c.overhead, options.overheadKib, 1024);
  const batchSize = labelledInput(doc, c.batchSize, options.batchSize, 500);
  batchSize.field.min = "1";
  const refresh = createOfflineAction(doc, c.update);
  const exportText = createOfflineAction(doc, c.exportText);
  const exportJson = createOfflineAction(doc, c.exportJson);
  settings.append(reserve.wrap, overhead.wrap, batchSize.wrap, refresh, exportText, exportJson);

  const tools = doc.createElement("div");
  const search = labelledSearch(doc, c.search);
  const filter = labelledSelect(doc, c.filter, [
    { value: "all", text: c.all },
    { value: "candidate", text: c.candidate },
    { value: "saved", text: c.saved },
    { value: "UNKNOWN", text: c.unknownCells },
    { value: "blocked", text: c.blockedCells },
  ]);
  const sort = labelledSelect(doc, c.sort, [
    { value: "listed", text: c.listed },
    { value: "id", text: c.byId },
    { value: "largest", text: c.largest },
    { value: "smallest", text: c.smallest },
    { value: "reason", text: c.reason },
  ]);
  tools.append(search, filter.wrap, sort.wrap);

  const results = doc.createElement("div");
  const caution = appendText(doc, "p", c.advisory);
  const noAction = appendText(doc, "p", c.onlyWhenReady);
  content.append(settings, tools, status, results, caution, noAction);
  section.append(title, open, description, privacy, content);
  root.append(section);

  const latest = (): ScenarioPlan => makePlan(manifest, model.getState(), estimate, options);

  const render = (): void => {
    if (disposed) return;
    content.hidden = !expanded;
    open.setAttribute("aria-expanded", String(expanded));
    open.textContent = expanded ? c.close : c.open;
    if (!expanded) return;
    const plan = latest();
    const page = browseStorageScenario(plan, {
      filter: options.filter, sort: options.sort, search: options.search,
      offset: options.offset, limit: PAGE_LENGTH,
    });
    section.setAttribute("aria-busy", String(busy));
    refresh.disabled = busy;
    exportText.disabled = busy;
    exportJson.disabled = busy;
    status.textContent = busy ? c.working : plan.blocks.length > 0 ? c.blocked :
      hasEstimate ? scenarioStatusText(plan.status, language) : c.uncertain;
    results.replaceChildren();
    const summary = doc.createElement("dl");
    summary.append(
      entry(doc, c.savedCount, String(plan.totals.savedCells)),
      entry(doc, c.candidateCount, String(plan.totals.candidateCells)),
      entry(doc, c.unknownCount, String(plan.totals.unknownCells)),
      entry(doc, c.freeSpace, formattedBytes(plan.totals.freeBytes, language)),
      entry(doc, c.reserveSpace, formattedBytes(plan.totals.reserveBytes, language)),
      entry(doc, c.totalCost, formattedBytes(plan.totals.totalPlannedBytes, language)),
      entry(doc, c.groupCount, String(plan.batches.length)),
    );
    results.append(summary);
    for (const block of plan.blocks) {
      results.append(appendText(doc, "p", scenarioBlockText(block, language)));
    }

    const cellHeading = appendText(doc, "h3", c.all);
    const list = doc.createElement("ol");
    list.start = page.offset + 1;
    for (const cell of page.cells) {
      const item = doc.createElement("li");
      item.append(appendText(doc, "strong", cell.id));
      item.append(appendText(doc, "p", `${dispositionText(cell.disposition, language)}. ${candidateReasonText(cell.reason, language)}`));
      const details = doc.createElement("dl");
      details.append(
        entry(doc, c.size, formattedBytes(cell.listedBytes, language)),
        entry(doc, c.planned, formattedBytes(cell.plannedBytes, language)),
        entry(doc, c.source, cell.source?.source ?? "UNKNOWN"),
        entry(doc, c.licence, cell.source?.licence ?? "UNKNOWN"),
        entry(doc, c.date, cell.source?.date ?? "UNKNOWN"),
        entry(doc, c.tier, "UNKNOWN"),
      );
      item.append(details);
      list.append(item);
    }
    results.append(cellHeading, list);
    if (page.cells.length === 0) results.append(appendText(doc, "p", c.noCells));

    const pageControls = doc.createElement("nav");
    pageControls.setAttribute("aria-label", c.page);
    const previous = createOfflineAction(doc, c.previous);
    const next = createOfflineAction(doc, c.next);
    previous.disabled = !page.hasPrevious;
    next.disabled = !page.hasNext;
    previous.addEventListener("click", () => {
      options = { ...options, offset: Math.max(0, options.offset - PAGE_LENGTH) };
      render();
    });
    next.addEventListener("click", () => {
      options = { ...options, offset: options.offset + PAGE_LENGTH };
      render();
    });
    pageControls.append(previous, appendText(doc, "span", `${c.page} ${Math.floor(page.offset / PAGE_LENGTH) + 1}`), next);
    results.append(pageControls);

    const sources = scenarioSources(plan);
    const sourceHeading = appendText(doc, "h3", c.perSource);
    const sourceList = doc.createElement("ul");
    const colon = language === "fr" ? "\u00a0:" : ":";
    for (const source of sources.slice(0, 100)) {
      const item = appendText(doc, "li", `${source.source.source} — ${source.source.licence} — ${source.source.date}${colon} ${source.candidates} / ${source.cells}`);
      sourceList.append(item);
    }
    results.append(sourceHeading, sourceList);
    const groupHeading = appendText(doc, "h3", c.groupCount);
    const groupList = doc.createElement("ol");
    for (const group of plan.batches.slice(0, 100)) {
      const item = appendText(doc, "li", `${c.group} ${group.ordinal}${colon} ${formattedBytes(group.bytes, language)} — ${scenarioStatusText(group.status, language)}`);
      groupList.append(item);
    }
    results.append(groupHeading, groupList);
  };

  const onOpen = (): void => { expanded = !expanded; render(); };
  const onSettings = (): void => {
    options = {
      ...options,
      reserveMib: safeNumber(reserve.field.value, 1024, options.reserveMib),
      overheadKib: safeNumber(overhead.field.value, 1024, options.overheadKib),
      batchSize: Math.max(1, safeNumber(batchSize.field.value, 500, options.batchSize)),
      offset: 0,
    };
    render();
  };
  const onSearch = (): void => { options = { ...options, search: search.queryField?.value ?? "", offset: 0 }; render(); };
  const onFilter = (): void => { options = { ...options, filter: filter.field.value as ScenarioFilter, offset: 0 }; render(); };
  const onSort = (): void => { options = { ...options, sort: sort.field.value as ScenarioSort, offset: 0 }; render(); };
  const onRefresh = (): void => {
    if (busy || disposed) return;
    busy = true;
    render();
    void estimateStorage().then((value) => {
      if (disposed) return;
      estimate = value;
      hasEstimate = true;
    }).catch(() => {
      if (disposed) return;
      estimate = {};
      hasEstimate = false;
    }).finally(() => {
      if (disposed) return;
      busy = false;
      render();
    });
  };
  const onSave = (format: "txt" | "json"): void => {
    if (disposed || busy) return;
    try {
      const date = new Date().toISOString().slice(0, 10);
      saveScenarioReport(createScenarioReport(latest(), date), language, format, doc);
    } catch {
      status.textContent = c.exportError;
    }
  };
  const onText = (): void => { onSave("txt"); };
  const onJson = (): void => { onSave("json"); };
  open.addEventListener("click", onOpen);
  reserve.field.addEventListener("change", onSettings);
  overhead.field.addEventListener("change", onSettings);
  batchSize.field.addEventListener("change", onSettings);
  search.queryField?.addEventListener("input", onSearch);
  filter.field.addEventListener("change", onFilter);
  sort.field.addEventListener("change", onSort);
  refresh.addEventListener("click", onRefresh);
  exportText.addEventListener("click", onText);
  exportJson.addEventListener("click", onJson);
  const unsubscribe = model.subscribe(() => render());
  render();
  return () => {
    disposed = true;
    unsubscribe();
    open.removeEventListener("click", onOpen);
    reserve.field.removeEventListener("change", onSettings);
    overhead.field.removeEventListener("change", onSettings);
    batchSize.field.removeEventListener("change", onSettings);
    search.queryField?.removeEventListener("input", onSearch);
    filter.field.removeEventListener("change", onFilter);
    sort.field.removeEventListener("change", onSort);
    refresh.removeEventListener("click", onRefresh);
    exportText.removeEventListener("click", onText);
    exportJson.removeEventListener("click", onJson);
    section.remove();
  };
}
