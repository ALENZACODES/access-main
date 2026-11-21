import { createOfflineAction, MIN_TARGET_PX } from "./accessibilityGuard";
import { type DashboardModel, type DashboardState } from "./offlineDashboard";
import { type Language, type RegionManifest, type StorageEstimate } from "./regionDownload";
import { type RegionAssessment, type ReviewFilter, type ReviewOrder,
  assessOfflineRegion, assessRecoveryBudget, assessSources, reviewAssessment,
  suggestRecoveryQueue } from "./updateAssessment";
import { assessmentAdviceText, assessmentBudgetText, assessmentKindText,
  assessmentSummary, labelledAssessmentBytes, updateCopy } from "./updateCopy";
import { createUpdateReview, saveUpdateReview } from "./updateReviewExport";

const PER_PAGE = 12;

function node<K extends keyof HTMLElementTagNameMap>(
  documentRef: Document, tag: K, label?: string,
): HTMLElementTagNameMap[K] {
  const element = documentRef.createElement(tag);
  if (label !== undefined) element.textContent = label;
  return element;
}

function fact(documentRef: Document, destination: HTMLElement, label: string, value: string): void {
  const wrapper = node(documentRef, "div");
  const term = node(documentRef, "dt", label);
  const description = node(documentRef, "dd", value);
  description.style.marginInlineStart = "1em";
  wrapper.append(term, description);
  destination.append(wrapper);
}

function labelledSelect(
  doc: Document, caption: string,
  options: readonly { readonly value: string; readonly caption: string }[],
): { readonly wrapper: HTMLLabelElement; readonly control: HTMLSelectElement } {
  const wrapper = node(doc, "label");
  wrapper.style.display = "inline-flex";
  wrapper.style.flexDirection = "column";
  wrapper.style.margin = "4px";
  wrapper.style.gap = "4px";
  const title = node(doc, "span", caption);
  const control = node(doc, "select");
  control.style.minHeight = `${MIN_TARGET_PX}px`;
  control.style.minWidth = `${MIN_TARGET_PX}px`;
  control.style.padding = "8px";
  options.forEach((option) => {
    const child = node(doc, "option", option.caption);
    child.value = option.value;
    control.append(child);
  });
  wrapper.append(title, control);
  return { wrapper, control };
}

/**
 * Mounted in the live offline dashboard. This feature is read-only: it never
 * writes storage, starts network activity, or treats bytes as access evidence.
 * Only the host's existing download action is allowed to fetch missing cells.
 */
export function mountOfflineUpdateReview(
  root: HTMLElement,
  manifest: RegionManifest,
  model: DashboardModel,
  language: Language,
  estimateStorage: () => Promise<StorageEstimate>,
): () => void {
  const doc = root.ownerDocument;
  const copy = updateCopy(language);
  const section = node(doc, "section");
  section.style.marginBlock = "24px";
  section.setAttribute("aria-label", copy.title);
  const heading = node(doc, "h3", copy.title);
  const intro = node(doc, "p", copy.intro);
  const privacy = node(doc, "p", copy.privacy);
  const expand = createOfflineAction(doc, copy.start);
  expand.setAttribute("aria-expanded", "false");
  const panel = node(doc, "div");
  panel.hidden = true;
  const identifier = `offline-copy-review-${Math.abs(manifest.regionId.split("")
    .reduce((acc, ch) => (acc * 31 + ch.charCodeAt(0)) | 0, 0))}`;
  panel.id = identifier;
  expand.setAttribute("aria-controls", identifier);
  const toolbar = node(doc, "div");
  const searchWrapper = node(doc, "label");
  const searchTitle = node(doc, "span", copy.search);
  const search = node(doc, "input");
  search.type = "search";
  search.maxLength = 160;
  search.autocomplete = "off";
  search.style.minHeight = `${MIN_TARGET_PX}px`;
  search.style.width = "min(100%, 32rem)";
  search.style.display = "block";
  searchWrapper.append(searchTitle, search);
  const filtering = labelledSelect(doc, copy.filter, [
    { value: "all", caption: copy.all },
    { value: "saved", caption: copy.onlySaved },
    { value: "needs-download", caption: copy.needsDownload },
    { value: "unknown", caption: copy.onlyUnknown },
    { value: "source", caption: copy.sourceChanges },
  ]);
  const ordering = labelledSelect(doc, copy.order, [
    { value: "manifest", caption: copy.manifest },
    { value: "id", caption: copy.byId },
    { value: "size-desc", caption: copy.largest },
    { value: "size-asc", caption: copy.smallest },
    { value: "status", caption: copy.byStatus },
  ]);
  toolbar.append(searchWrapper, filtering.wrapper, ordering.wrapper);
  const summary = node(doc, "p");
  summary.setAttribute("role", "status");
  summary.setAttribute("aria-live", "polite");
  summary.setAttribute("aria-atomic", "true");
  const counts = node(doc, "dl");
  const budgetStatus = node(doc, "p");
  const sourcesHeading = node(doc, "h4", copy.changes);
  const sources = node(doc, "dl");
  const list = node(doc, "ol");
  const navigation = node(doc, "nav");
  navigation.setAttribute("aria-label", copy.page);
  const previous = createOfflineAction(doc, copy.previous);
  const next = createOfflineAction(doc, copy.next);
  const position = node(doc, "span");
  navigation.append(previous, position, next);
  const actions = node(doc, "div");
  const refresh = createOfflineAction(doc, copy.refresh);
  const exportText = createOfflineAction(doc, copy.export);
  const exportJson = createOfflineAction(doc, copy.exportJson);
  actions.append(refresh, exportText, exportJson);
  const advisory = node(doc, "p", copy.advisory);
  panel.append(toolbar, summary, counts, budgetStatus, sourcesHeading, sources,
    list, navigation, actions, advisory);
  section.append(heading, intro, privacy, expand, panel);
  root.append(section);

  let disposed = false;
  let opened = false;
  let filter: ReviewFilter = "all";
  let order: ReviewOrder = "manifest";
  let offset = 0;
  let searchValue = "";
  let assessment: RegionAssessment | null = null;
  let current: DashboardState = model.getState();
  let latestEstimate: StorageEstimate = {};
  let estimationSequence = 0;

  function renderRows(snapshot: RegionAssessment): void {
    list.replaceChildren();
    const page = reviewAssessment(snapshot, {
      filter, order, search: searchValue, offset, limit: PER_PAGE,
    });
    if (page.rows.length === 0) list.append(node(doc, "li", copy.none));
    for (const row of page.rows) {
      const item = node(doc, "li");
      item.style.marginBlock = "12px";
      const title = node(doc, "strong", row.id);
      const status = node(doc, "p", row.offlineStatus === "UNKNOWN" ? copy.unknown : copy.saved);
      const kind = node(doc, "p", assessmentKindText(row.kind, language));
      const advice = node(doc, "p", assessmentAdviceText(row.advice, language));
      const details = node(doc, "dl");
      fact(doc, details, copy.size, labelledAssessmentBytes(row.expectedBytes, language));
      fact(doc, details, copy.source, row.expected?.source ?? copy.notKnown);
      fact(doc, details, copy.licence, row.expected?.licence ?? copy.notKnown);
      fact(doc, details, copy.date, row.expected?.date ?? copy.notKnown);
      if (row.observed !== null && row.kind === "metadata-changed") {
        const previousHeading = node(doc, "dt", copy.observed);
        const previousBody = node(doc, "dd");
        previousBody.style.marginInlineStart = "1em";
        previousBody.textContent = [row.observed.source, row.observed.licence, row.observed.date].join(" — ");
        details.append(previousHeading, previousBody);
      }
      item.append(title, status, kind, advice, details);
      list.append(item);
    }
    previous.disabled = !page.hasPrevious;
    next.disabled = !page.hasNext;
    position.textContent = `${page.total === 0 ? 0 : page.offset + 1}–${Math.min(page.total, page.offset + page.limit)} / ${page.total}`;
  }

  function render(snapshot: DashboardState): void {
    current = snapshot;
    if (!opened || disposed) return;
    assessment = assessOfflineRegion(manifest, snapshot.inventory);
    const evaluated = assessment;
    counts.replaceChildren();
    fact(doc, counts, copy.count, String(manifest.cells.length));
    fact(doc, counts, copy.countSaved, String(evaluated.counts.saved));
    fact(doc, counts, copy.countUnknown, String(evaluated.counts.unknown));
    fact(doc, counts, copy.remaining, labelledAssessmentBytes(evaluated.remainingBytes, language));
    summary.textContent = snapshot.phase === "checking" ? copy.busy : assessmentSummary(evaluated, language);
    const queue = suggestRecoveryQueue(evaluated);
    budgetStatus.textContent = assessmentBudgetText(assessRecoveryBudget(queue, latestEstimate), language);
    sources.replaceChildren();
    for (const record of assessSources(evaluated)) {
      const value = `${record.source.source} — ${record.source.licence} — ${record.source.date}`;
      fact(doc, sources, value, `${record.saved} / ${record.count}`);
    }
    renderRows(evaluated);
  }

  async function readEstimate(): Promise<void> {
    const sequence = ++estimationSequence;
    let estimate: StorageEstimate = {};
    try { estimate = await estimateStorage(); } catch { /* unavailable estimate stays UNKNOWN */ }
    if (disposed || sequence !== estimationSequence) return;
    latestEstimate = estimate;
    render(current);
  }

  function resetAndRender(): void {
    offset = 0;
    render(current);
  }

  function save(format: "txt" | "json"): void {
    if (!opened || assessment === null) return;
    try {
      const report = createUpdateReview(assessment, latestEstimate, new Date().toISOString().slice(0, 10));
      saveUpdateReview(report, language, format, doc);
    } catch {
      summary.textContent = copy.exportError;
    }
  }

  const onExpand = (): void => {
    opened = !opened;
    panel.hidden = !opened;
    expand.textContent = opened ? copy.hide : copy.start;
    expand.setAttribute("aria-expanded", String(opened));
    if (opened) {
      render(current);
      void readEstimate();
    }
  };
  const onSearch = (): void => { searchValue = search.value; resetAndRender(); };
  const onFilter = (): void => { filter = filtering.control.value as ReviewFilter; resetAndRender(); };
  const onOrder = (): void => { order = ordering.control.value as ReviewOrder; resetAndRender(); };
  const onPrevious = (): void => { offset = Math.max(0, offset - PER_PAGE); render(current); };
  const onNext = (): void => { offset += PER_PAGE; render(current); };
  const onRefresh = (): void => { void model.refresh(); void readEstimate(); };
  const onExportText = (): void => { save("txt"); };
  const onExportJson = (): void => { save("json"); };
  const handlers: readonly [HTMLElement, string, EventListener][] = [
    [expand, "click", onExpand],
    [search, "input", onSearch],
    [filtering.control, "change", onFilter],
    [ordering.control, "change", onOrder],
    [previous, "click", onPrevious],
    [next, "click", onNext],
    [refresh, "click", onRefresh],
    [exportText, "click", onExportText],
    [exportJson, "click", onExportJson],
  ];
  for (const [element, event, handler] of handlers) element.addEventListener(event, handler);
  const unsubscribe = model.subscribe(render);
  return () => {
    disposed = true;
    ++estimationSequence;
    unsubscribe();
    for (const [element, event, handler] of handlers) element.removeEventListener(event, handler);
    section.remove();
  };
}
