import { createOfflineAction } from "./accessibilityGuard";
import type { DashboardModel, DashboardState } from "./offlineDashboard";
import type { Language, RegionManifest, StorageEstimate } from "./regionDownload";
import { DEFAULT_DRILL_SETTINGS, pageContinuityDrill, runContinuityDrill,
  type DrillFilter, type DrillResult, type DrillScenario, type DrillSort } from "./continuityDrill";
import { continuityCopy, continuityFilterLabel, continuityFormatBytes,
  continuityReasonLabel, continuityScenarioLabel, continuitySortLabel,
  DRILL_FILTERS, DRILL_SCENARIOS, DRILL_SORTS } from "./continuityDrillCopy";
import { createContinuityReport, saveContinuityReport } from "./continuityDrillExport";

const PAGE_SIZE = 12;
function el<K extends keyof HTMLElementTagNameMap>(doc: Document, name: K,
  value?: string): HTMLElementTagNameMap[K] {
  const item = doc.createElement(name);
  if (value !== undefined) item.textContent = value;
  return item;
}
function button(doc: Document, value: string): HTMLButtonElement {
  return createOfflineAction(doc, value);
}
function labelledInput(doc: Document, id: string, labelText: string,
  type: "number" | "search"): { wrapper: HTMLLabelElement; input: HTMLInputElement } {
  const wrapper = el(doc, "label", labelText);
  const input = el(doc, "input");
  input.id = id;
  input.type = type;
  input.style.minHeight = "44px";
  input.style.minWidth = "44px";
  wrapper.htmlFor = id;
  wrapper.append(input);
  return { wrapper, input };
}
function labelledSelect(doc: Document, id: string, labelText: string): {
  wrapper: HTMLLabelElement; select: HTMLSelectElement;
} {
  const wrapper = el(doc, "label", labelText);
  const select = el(doc, "select");
  select.id = id;
  select.style.minHeight = "44px";
  select.style.minWidth = "44px";
  wrapper.htmlFor = id;
  wrapper.append(select);
  return { wrapper, select };
}
function definition(doc: Document, label: string, value: string): HTMLDivElement {
  const wrap = el(doc, "div");
  const term = el(doc, "dt", label);
  const description = el(doc, "dd", value);
  description.style.marginInlineStart = "1em";
  wrap.append(term, description);
  return wrap;
}
/** All actions are local and explicitly initiated; no background subscription starts a drill. */
export function mountOfflineContinuityDrill(
  root: HTMLElement,
  manifest: RegionManifest,
  model: DashboardModel,
  language: Language,
  estimateStorage: () => Promise<StorageEstimate>,
): () => void {
  const doc = root.ownerDocument;
  const c = continuityCopy(language);
  const section = el(doc, "section");
  const heading = el(doc, "h2", c.title);
  const introduction = el(doc, "p", c.intro);
  const toggle = button(doc, c.open);
  const id = `offline-drill-${manifest.regionId.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
  const content = el(doc, "div");
  content.id = id;
  content.hidden = true;
  toggle.setAttribute("aria-controls", id);
  toggle.setAttribute("aria-expanded", "false");
  const status = el(doc, "p");
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  status.setAttribute("aria-atomic", "true");
  const form = el(doc, "div");
  const scenario = labelledSelect(doc, `${id}-scenario`, c.scenario);
  for (const option of DRILL_SCENARIOS) {
    const item = el(doc, "option", continuityScenarioLabel(option, language));
    item.value = option;
    scenario.select.append(item);
  }
  const affected = labelledInput(doc, `${id}-count`, c.quantity, "number");
  affected.input.min = "0";
  affected.input.max = "1000";
  affected.input.step = "1";
  affected.input.value = "1";
  const reduction = labelledInput(doc, `${id}-reduction`, c.reduction, "number");
  reduction.input.min = "0";
  reduction.input.step = "1";
  reduction.input.value = "0";
  const reserve = labelledInput(doc, `${id}-reserve`, c.reserve, "number");
  reserve.input.min = "0";
  reserve.input.step = "1";
  reserve.input.value = String(DEFAULT_DRILL_SETTINGS.preserveReserveBytes);
  const run = button(doc, c.run);
  const refresh = button(doc, c.refresh);
  const exportText = button(doc, c.exportText);
  const exportJson = button(doc, c.exportJson);
  const controls = el(doc, "div");
  controls.append(run, refresh, exportText, exportJson);
  form.append(scenario.wrapper, affected.wrapper, reduction.wrapper, reserve.wrapper, controls);
  const search = labelledInput(doc, `${id}-search`, c.search, "search");
  const filter = labelledSelect(doc, `${id}-filter`, c.filter);
  for (const option of DRILL_FILTERS) {
    const item = el(doc, "option", continuityFilterLabel(option, language));
    item.value = option;
    filter.select.append(item);
  }
  const sort = labelledSelect(doc, `${id}-sort`, c.sort);
  for (const option of DRILL_SORTS) {
    const item = el(doc, "option", continuitySortLabel(option, language));
    item.value = option;
    sort.select.append(item);
  }
  const viewControls = el(doc, "div");
  viewControls.append(search.wrapper, filter.wrapper, sort.wrapper);
  const summary = el(doc, "dl");
  const results = el(doc, "ol");
  const navigation = el(doc, "nav");
  navigation.setAttribute("aria-label", c.result);
  const previous = button(doc, c.previous);
  const next = button(doc, c.next);
  const position = el(doc, "span");
  navigation.append(previous, position, next);
  const disclaimer = el(doc, "p", c.note);
  content.append(form, status, summary, viewControls, results, navigation, disclaimer);
  section.append(heading, introduction, toggle, content);
  root.append(section);
  let disposed = false;
  let pending = false;
  let result: DrillResult | null = null;
  let offset = 0;
  let generation = 0;
  const getPage = () => result === null ? null : pageContinuityDrill(result, {
    search: search.input.value,
    filter: filter.select.value as DrillFilter,
    sort: sort.select.value as DrillSort,
    offset,
    limit: PAGE_SIZE,
  });
  const paint = (): void => {
    if (disposed) return;
    results.replaceChildren();
    summary.replaceChildren();
    const page = getPage();
    exportText.disabled = result === null || pending;
    exportJson.disabled = result === null || pending;
    run.disabled = pending || model.getState().phase === "downloading";
    refresh.disabled = pending || model.getState().phase === "downloading";
    if (result === null || page === null) {
      navigation.hidden = true;
      return;
    }
    navigation.hidden = false;
    previous.disabled = !page.previous;
    next.disabled = !page.next;
    position.textContent = `${page.total === 0 ? 0 : page.offset + 1}–${Math.min(page.offset + page.limit, page.total)} / ${page.total}`;
    summary.append(
      definition(doc, c.listedCount, String(result.totals.listed)),
      definition(doc, c.saved, String(result.totals.afterSaved)),
      definition(doc, c.unknown, String(result.totals.afterUnknown)),
      definition(doc, c.affectedCount, String(result.totals.affected)),
      definition(doc, c.quota, continuityFormatBytes(result.quota.freeBytes, language)),
      definition(doc, c.projected, continuityFormatBytes(result.quota.projectedFreeBytes, language)),
    );
    if (page.rows.length === 0) results.append(el(doc, "li", c.noRecords));
    for (const cell of page.rows) {
      const item = el(doc, "li");
      const name = el(doc, "strong", cell.id);
      const description = el(doc, "dl");
      description.append(
        definition(doc, c.before, cell.before),
        definition(doc, c.after, cell.after),
        definition(doc, c.reason, continuityReasonLabel(cell.reason, language)),
        definition(doc, c.bytes, continuityFormatBytes(cell.expectedBytes, language)),
        definition(doc, c.source, cell.provenance?.source ?? "UNKNOWN"),
        definition(doc, c.licence, cell.provenance?.licence ?? "UNKNOWN"),
        definition(doc, c.date, cell.provenance?.date ?? "UNKNOWN"),
        definition(doc, c.tier, "UNKNOWN"),
      );
      item.append(name, description);
      results.append(item);
    }
  };
  const onRun = async (): Promise<void> => {
    if (disposed || pending) return;
    const current = model.getState();
    if (current.phase === "downloading") return;
    pending = true;
    const operation = ++generation;
    section.setAttribute("aria-busy", "true");
    status.textContent = c.active;
    paint();
    try {
      let estimate: StorageEstimate = {};
      try { estimate = await estimateStorage(); } catch { /* UNKNOWN */ }
      if (disposed || operation !== generation) return;
      const fresh = model.getState();
      if (fresh.phase === "downloading" || fresh.phase === "checking") {
        result = null;
        status.textContent = c.unavailable;
        return;
      }
      result = runContinuityDrill(manifest, fresh.inventory, {
        scenario: scenario.select.value as DrillScenario,
        affectedCount: Number(affected.input.value),
        reductionBytes: Number(reduction.input.value),
        preserveReserveBytes: Number(reserve.input.value),
      }, estimate);
      offset = 0;
      status.textContent = result.status === "UNKNOWN" ? c.incomplete :
        result.status === "complete" ? c.complete : c.partial;
    } catch {
      result = null;
      status.textContent = c.error;
    } finally {
      if (!disposed && operation === generation) {
        pending = false;
        section.setAttribute("aria-busy", "false");
        paint();
      }
    }
  };
  const onExport = (type: "txt" | "json"): void => {
    if (!result) return;
    try {
      saveContinuityReport(createContinuityReport(result, new Date().toISOString().slice(0, 10)),
        language, type, doc);
    } catch { status.textContent = c.reportError; }
  };
  const onToggle = (): void => {
    content.hidden = !content.hidden;
    toggle.setAttribute("aria-expanded", String(!content.hidden));
    toggle.textContent = content.hidden ? c.open : c.close;
  };
  const onChange = (): void => { offset = 0; paint(); };
  const onPrevious = (): void => { offset = Math.max(0, offset - PAGE_SIZE); paint(); };
  const onNext = (): void => { offset += PAGE_SIZE; paint(); };
  const onRefresh = (): void => { void model.refresh(); result = null; paint(); };
  const onText = (): void => onExport("txt");
  const onJson = (): void => onExport("json");
  toggle.addEventListener("click", onToggle);
  run.addEventListener("click", () => { void onRun(); });
  refresh.addEventListener("click", onRefresh);
  exportText.addEventListener("click", onText);
  exportJson.addEventListener("click", onJson);
  search.input.addEventListener("input", onChange);
  filter.select.addEventListener("change", onChange);
  sort.select.addEventListener("change", onChange);
  previous.addEventListener("click", onPrevious);
  next.addEventListener("click", onNext);
  const unsubscribe = model.subscribe((state: DashboardState) => {
    if (state.phase === "downloading" || state.phase === "checking") {
      result = null;
      status.textContent = c.unavailable;
    }
    paint();
  });
  paint();
  return () => {
    disposed = true;
    generation += 1;
    unsubscribe();
    section.remove();
  };
}
