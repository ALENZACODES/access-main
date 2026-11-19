import { createOfflineAction } from "./accessibilityGuard";
import type { DashboardModel, DashboardState } from "./offlineDashboard";
import type { Language, RegionManifest, StorageEstimate } from "./regionDownload";
import type { GuideFilter, GuideOrder, GuidePlan } from "./recoveryGuide";
import { buildRecoveryPlan, pageRecoveryPlan, proposeRecoveryRequest, GUIDE_MAX_REQUEST_CELLS } from "./recoveryGuide";
import { recoveryActionLabel, recoveryBytes, RECOVERY_FILTERS, RECOVERY_ORDERS,
  recoveryFilterLabel, recoveryGateLabel, recoveryGuideCopy, recoveryIssueLabel,
  recoveryOrderLabel } from "./recoveryGuideCopy";
import { createRecoveryGuideReport, saveRecoveryGuideReport } from "./recoveryGuideExport";

const PAGE_SIZE = 12;

function node<K extends keyof HTMLElementTagNameMap>(
  doc: Document, tag: K, value?: string,
): HTMLElementTagNameMap[K] {
  const element = doc.createElement(tag);
  if (value !== undefined) element.textContent = value;
  return element;
}

function action(doc: Document, value: string): HTMLButtonElement {
  return createOfflineAction(doc, value);
}

function definition(doc: Document, name: string, value: string): HTMLDivElement {
  const wrapper = node(doc, "div");
  const title = node(doc, "dt", name);
  const detail = node(doc, "dd", value);
  detail.style.marginInlineStart = "1em";
  wrapper.append(title, detail);
  return wrapper;
}

function selectControl(doc: Document, id: string, label: string): {
  readonly wrapper: HTMLLabelElement;
  readonly select: HTMLSelectElement;
} {
  const wrapper = node(doc, "label", label);
  wrapper.htmlFor = id;
  const select = node(doc, "select");
  select.id = id;
  select.style.minHeight = "44px";
  select.style.minWidth = "44px";
  wrapper.append(select);
  return { wrapper, select };
}

/**
 * Read-only until a person deliberately selects eligible cells and presses retry.
 * A fresh plan is checked before every request. No background synchronization.
 */
export function mountOfflineRecoveryGuide(
  root: HTMLElement,
  manifest: RegionManifest,
  model: DashboardModel,
  language: Language,
  estimateStorage: () => Promise<StorageEstimate>,
): () => void {
  const doc = root.ownerDocument;
  const c = recoveryGuideCopy(language);
  const section = node(doc, "section");
  const header = node(doc, "h2", c.title);
  const intro = node(doc, "p", c.summary);
  const toggle = action(doc, c.open);
  const content = node(doc, "div");
  const headingId = `recovery-guide-${manifest.regionId.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
  content.id = headingId;
  content.hidden = true;
  toggle.setAttribute("aria-controls", headingId);
  toggle.setAttribute("aria-expanded", "false");
  const status = node(doc, "p");
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  status.setAttribute("aria-atomic", "true");
  const totals = node(doc, "dl");
  const controls = node(doc, "div");
  const refresh = action(doc, c.refresh);
  const searchLabel = node(doc, "label", c.search);
  const search = node(doc, "input");
  search.type = "search";
  search.style.minHeight = "44px";
  search.style.minWidth = "44px";
  const searchId = `${headingId}-search`;
  search.id = searchId;
  searchLabel.htmlFor = searchId;
  searchLabel.append(search);
  const filter = selectControl(doc, `${headingId}-filter`, c.filter);
  for (const value of RECOVERY_FILTERS) {
    const option = node(doc, "option", recoveryFilterLabel(value, language));
    option.value = value;
    filter.select.append(option);
  }
  const order = selectControl(doc, `${headingId}-order`, c.order);
  for (const value of RECOVERY_ORDERS) {
    const option = node(doc, "option", recoveryOrderLabel(value, language));
    option.value = value;
    order.select.append(option);
  }
  controls.append(refresh, searchLabel, filter.wrapper, order.wrapper);
  const list = node(doc, "ol");
  const paging = node(doc, "nav");
  paging.setAttribute("aria-label", c.position);
  const previous = action(doc, c.previous);
  const next = action(doc, c.next);
  const pageStatus = node(doc, "span");
  paging.append(previous, pageStatus, next);
  const exports = node(doc, "div");
  const textReport = action(doc, c.exportText);
  const jsonReport = action(doc, c.exportJson);
  const retry = action(doc, c.retry);
  retry.disabled = true;
  exports.append(textReport, jsonReport, retry);
  const disclaimer = node(doc, "p", c.disclaimer);
  content.append(status, totals, controls, list, paging, exports, disclaimer);
  section.append(header, intro, toggle, content);
  root.append(section);

  let active = true;
  let expanded = false;
  let pending = false;
  let generation = 0;
  let plan: GuidePlan | null = null;
  let selection = new Set<string>();
  let query: { filter: GuideFilter; order: GuideOrder; text: string; start: number } = {
    filter: "all", order: "listed", text: "", start: 0,
  };

  const render = (): void => {
    if (!active || !expanded) return;
    const current = model.getState();
    const busy = current.phase === "checking" || current.phase === "downloading" || pending;
    refresh.disabled = busy;
    retry.disabled = busy || plan === null || plan.gate !== "ready" || selection.size === 0;
    textReport.disabled = plan === null;
    jsonReport.disabled = plan === null;
    totals.replaceChildren();
    list.replaceChildren();
    if (plan === null) {
      status.textContent = c.unavailable;
      previous.disabled = true;
      next.disabled = true;
      pageStatus.textContent = "";
      return;
    }
    const t = plan.totals;
    status.textContent = recoveryGateLabel(plan.gate, language);
    totals.append(
      definition(doc, c.listed, String(t.listed)),
      definition(doc, c.savedCount, String(t.saved)),
      definition(doc, c.unknownCount, String(t.unknown)),
      definition(doc, c.retryCount, String(t.retry)),
      definition(doc, c.inspectCount, String(t.inspect)),
      definition(doc, c.free, recoveryBytes(plan.freeBytes, language)),
      definition(doc, c.reserve, recoveryBytes(plan.reserveBytes, language)),
      definition(doc, c.required, recoveryBytes(t.retryBytes, language)),
    );
    const page = pageRecoveryPlan(plan, { ...query, limit: PAGE_SIZE });
    previous.disabled = !page.previous;
    next.disabled = !page.next;
    pageStatus.textContent = `${c.position}${language === "fr" ? "\u00a0:" : ":"} ` +
      `${page.total === 0 ? 0 : page.start + 1}–${Math.min(page.start + page.cells.length, page.total)} / ${page.total}`;
    if (page.cells.length === 0) list.append(node(doc, "li", c.noMatches));
    for (const cell of page.cells) {
      const item = node(doc, "li");
      const heading = node(doc, "strong", cell.id);
      const summary = node(doc, "p", `${cell.state === "saved" ? c.saved : c.unknownState}. ` +
        `${recoveryIssueLabel(cell.issue, language)}. ${recoveryActionLabel(cell.action, language)}.`);
      const details = node(doc, "dl");
      details.append(
        definition(doc, c.source, cell.provenance?.source ?? "UNKNOWN"),
        definition(doc, c.licence, cell.provenance?.licence ?? "UNKNOWN"),
        definition(doc, c.date, cell.provenance?.date ?? "UNKNOWN"),
        definition(doc, c.tier, "UNKNOWN"),
        definition(doc, c.size, recoveryBytes(cell.bytes, language)),
      );
      item.append(heading, summary, details);
      if (cell.retryAllowed) {
        const label = node(doc, "label", `${c.select}${language === "fr" ? "\u00a0:" : ":"} ${cell.id}`);
        const checkbox = node(doc, "input");
        checkbox.type = "checkbox";
        checkbox.style.minHeight = "44px";
        checkbox.style.minWidth = "44px";
        checkbox.checked = selection.has(cell.id);
        checkbox.disabled = busy || (selection.size >= GUIDE_MAX_REQUEST_CELLS && !checkbox.checked);
        checkbox.addEventListener("change", () => {
          if (checkbox.checked) {
            if (selection.size < GUIDE_MAX_REQUEST_CELLS) selection.add(cell.id);
            else checkbox.checked = false;
          } else selection.delete(cell.id);
          // Keep the focused checkbox mounted; replacing the list would move focus.
          retry.disabled = pending || plan?.gate !== "ready" || selection.size === 0;
        });
        label.prepend(checkbox);
        item.append(label);
      }
      list.append(item);
    }
  };

  const refreshPlan = async (): Promise<void> => {
    if (!active || pending || !expanded) return;
    const serial = ++generation;
    pending = true;
    status.textContent = c.checking;
    render();
    try {
      const estimate = await estimateStorage().catch((): StorageEstimate => ({}));
      if (!active || serial !== generation) return;
      const latest = model.getState();
      plan = buildRecoveryPlan(manifest, latest.inventory, estimate);
      const eligible = new Set(plan.cells.filter((cell) => cell.retryAllowed).map((cell) => cell.id));
      selection = new Set([...selection].filter((id) => eligible.has(id)));
    } catch {
      if (active && serial === generation) { plan = null; status.textContent = c.refreshError; }
    } finally {
      pending = false;
      render();
    }
  };
  const onToggle = (): void => {
    expanded = !expanded;
    content.hidden = !expanded;
    toggle.textContent = expanded ? c.close : c.open;
    toggle.setAttribute("aria-expanded", String(expanded));
    if (expanded) void refreshPlan();
  };
  const onRefresh = (): void => { void refreshPlan(); };
  const onSearch = (): void => { query = { ...query, text: search.value, start: 0 }; render(); };
  const onFilter = (): void => { query = { ...query, filter: filter.select.value as GuideFilter, start: 0 }; render(); };
  const onOrder = (): void => { query = { ...query, order: order.select.value as GuideOrder, start: 0 }; render(); };
  const onPrevious = (): void => { query = { ...query, start: Math.max(0, query.start - PAGE_SIZE) }; render(); };
  const onNext = (): void => { query = { ...query, start: query.start + PAGE_SIZE }; render(); };
  const onSave = (format: "txt" | "json"): void => {
    if (!plan) return;
    try {
      const day = new Date().toISOString().slice(0, 10);
      const proposed = proposeRecoveryRequest(plan, [...selection]);
      saveRecoveryGuideReport(createRecoveryGuideReport(plan, day, proposed), language, format, doc);
    } catch { status.textContent = c.exportError; }
  };
  const onText = (): void => onSave("txt");
  const onJson = (): void => onSave("json");
  const onRetry = (): void => {
    if (!plan || pending || model.getState().phase !== "ready") return;
    // Re-read the inventory and estimate immediately before any download.
    pending = true;
    retry.disabled = true;
    void (async () => {
      try {
        const reading = await estimateStorage().catch((): StorageEstimate => ({}));
        if (!active) return;
        const fresh = buildRecoveryPlan(manifest, model.getState().inventory, reading);
        const request = proposeRecoveryRequest(fresh, [...selection]);
        if (request.gate !== "ready") { status.textContent = c.retryBlocked; return; }
        await model.downloadSelected(request.ids);
        if (active) status.textContent = c.requestStarted;
      } catch { if (active) status.textContent = c.retryBlocked; }
      finally { pending = false; if (active) void refreshPlan(); }
    })();
  };
  toggle.addEventListener("click", onToggle);
  refresh.addEventListener("click", onRefresh);
  search.addEventListener("input", onSearch);
  filter.select.addEventListener("change", onFilter);
  order.select.addEventListener("change", onOrder);
  previous.addEventListener("click", onPrevious);
  next.addEventListener("click", onNext);
  textReport.addEventListener("click", onText);
  jsonReport.addEventListener("click", onJson);
  retry.addEventListener("click", onRetry);
  const unsubscribe = model.subscribe((_state: DashboardState) => {
    if (expanded) render();
  });
  return () => {
    active = false;
    generation += 1;
    unsubscribe();
    toggle.removeEventListener("click", onToggle);
    refresh.removeEventListener("click", onRefresh);
    search.removeEventListener("input", onSearch);
    filter.select.removeEventListener("change", onFilter);
    order.select.removeEventListener("change", onOrder);
    previous.removeEventListener("click", onPrevious);
    next.removeEventListener("click", onNext);
    textReport.removeEventListener("click", onText);
    jsonReport.removeEventListener("click", onJson);
    retry.removeEventListener("click", onRetry);
    section.remove();
  };
}
