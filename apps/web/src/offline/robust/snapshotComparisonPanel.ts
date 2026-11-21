import { createOfflineAction } from "./accessibilityGuard";
import type { DashboardModel } from "./offlineDashboard";
import type { Language, RegionManifest } from "./regionDownload";
import { compareSnapshots, fromRegionManifest, pageSnapshotMatrix, parseSnapshot,
  type SnapshotFilter, type SnapshotMatrix, type SnapshotOrder, type SnapshotDocument } from "./snapshotComparison";
import { SNAPSHOT_CHANGE_LABELS, SNAPSHOT_FILTER_LABELS, SNAPSHOT_ORDER_LABELS, snapshotCopy } from "./snapshotComparisonCopy";
import { createSnapshotReport, saveSnapshotDocument, saveSnapshotReport } from "./snapshotComparisonExport";

function node<K extends keyof HTMLElementTagNameMap>(doc: Document, tag: K, content?: string): HTMLElementTagNameMap[K] {
  const result = doc.createElement(tag);
  if (content !== undefined) result.textContent = content;
  return result;
}
function action(doc: Document, content: string): HTMLButtonElement { return createOfflineAction(doc, content); }
function field(doc: Document, name: string, control: HTMLTextAreaElement | HTMLInputElement | HTMLSelectElement): HTMLLabelElement {
  const label = node(doc, "label", name);
  label.append(control);
  return label;
}
function input(doc: Document, type: string): HTMLInputElement {
  const item = node(doc, "input");
  item.type = type;
  item.style.minHeight = "44px";
  item.style.minWidth = "44px";
  return item;
}
function select<T extends string>(doc: Document, options: Readonly<Record<T, string>>, initial: T): HTMLSelectElement {
  const element = node(doc, "select");
  element.style.minHeight = "44px";
  element.style.minWidth = "44px";
  for (const [key, title] of Object.entries(options) as Array<[T, string]>) {
    const option = node(doc, "option", title);
    option.value = key;
    element.append(option);
  }
  element.value = initial;
  return element;
}

/** Optional, explicitly opened region-list comparison. Never changes downloaded data. */
export function mountSnapshotComparison(root: HTMLElement, manifest: RegionManifest | null, model: DashboardModel | null, language: Language): () => void {
  const doc = root.ownerDocument;
  const c = snapshotCopy(language);
  const colon = language === "fr" ? "\u00a0: " : ": ";
  const section = node(doc, "section");
  section.className = "panel stack";
  const heading = node(doc, "h3", c.title);
  const intro = node(doc, "p", c.intro);
  const warning = node(doc, "p", c.notProof);
  const paste = node(doc, "p", c.paste);
  const aInput = node(doc, "textarea");
  const bInput = node(doc, "textarea");
  const baselineInput = manifest === null ? node(doc, "textarea") : null;
  for (const area of baselineInput ? [baselineInput, aInput, bInput] : [aInput, bInput]) {
    area.rows = 4;
    area.style.minHeight = "88px";
    area.style.minWidth = "44px";
    area.maxLength = 196608;
    area.autocomplete = "off";
    area.spellcheck = false;
  }
  const aLabel = field(doc, c.optionA, aInput);
  const bLabel = field(doc, c.optionB, bInput);
  const compare = action(doc, c.compare);
  const clearA = action(doc, c.clearA);
  const clearB = action(doc, c.clearB);
  const controls = node(doc, "div");
  controls.className = "button-row";
  controls.append(compare, clearA, clearB);
  const status = node(doc, "p", baselineInput ? c.baselineMissing : c.optionsMissing);
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  const summary = node(doc, "dl");
  const search = input(doc, "search");
  search.maxLength = 160;
  const filter = select(doc, SNAPSHOT_FILTER_LABELS[language], "all" as SnapshotFilter);
  const order = select(doc, SNAPSHOT_ORDER_LABELS[language], "listed" as SnapshotOrder);
  const searchControls = node(doc, "div");
  searchControls.className = "stack";
  searchControls.append(field(doc, c.search, search), field(doc, c.filter, filter), field(doc, c.sort, order));
  const results = node(doc, "ol");
  const navigation = node(doc, "div");
  navigation.className = "button-row";
  const previous = action(doc, c.previous);
  const next = action(doc, c.next);
  const pageStatus = node(doc, "p");
  navigation.append(previous, pageStatus, next);
  const exportBaseline = action(doc, c.exportBaseline);
  const exportText = action(doc, c.exportText);
  const exportJson = action(doc, c.exportJson);
  const exportControls = node(doc, "div");
  exportControls.className = "button-row";
  if (manifest !== null) exportControls.append(exportBaseline);
  exportControls.append(exportText, exportJson);
  const privacy = node(doc, "p", c.privacy);
  section.append(heading, intro, warning, paste);
  if (baselineInput) section.append(field(doc, c.baselineInput, baselineInput));
  section.append(aLabel, bLabel, controls, status, summary, searchControls, results, navigation, privacy, exportControls);
  root.append(section);
  let disposed = false;
  let page = 0;
  let matrix: SnapshotMatrix | null = null;
  let candidateA: SnapshotDocument | null = null;
  let candidateB: SnapshotDocument | null = null;
  const listenerDisposers: Array<() => void> = [];
  function listen(target: HTMLElement, event: string, handler: EventListener): void {
    target.addEventListener(event, handler);
    listenerDisposers.push(() => target.removeEventListener(event, handler));
  }
  function line(term: string, description: string): HTMLDivElement {
    const wrapper = node(doc, "div");
    const key = node(doc, "dt", term);
    const value = node(doc, "dd", description);
    wrapper.append(key, value);
    return wrapper;
  }
  function draw(): void {
    results.replaceChildren();
    summary.replaceChildren();
    if (disposed || matrix === null) {
      exportText.disabled = true;
      exportJson.disabled = true;
      previous.disabled = true;
      next.disabled = true;
      pageStatus.textContent = "";
      return;
    }
    exportText.disabled = false;
    exportJson.disabled = false;
    summary.append(line(c.listed, String(matrix.rows.length)), line(c.changed, String(matrix.reviewCount)),
      line(c.local, String(matrix.localSaved)), line(c.unknown, String(matrix.localUnknown)), line(c.physical, "UNKNOWN"));
    const options = { filter: filter.value as SnapshotFilter, order: order.value as SnapshotOrder,
      search: search.value, offset: page * 10, limit: 10 };
    const view = pageSnapshotMatrix(matrix, options);
    if (view.rows.length === 0) results.append(node(doc, "li", c.noRows));
    for (const row of view.rows) {
      const item = node(doc, "li");
      const title = node(doc, "strong", row.cellId);
      const saved = node(doc, "p", `${c.statusLabel}${colon}${row.localState}`);
      const a = node(doc, "p", `A${colon}${SNAPSHOT_CHANGE_LABELS[language][row.optionA.kind]}`);
      const b = node(doc, "p", `B${colon}${SNAPSHOT_CHANGE_LABELS[language][row.optionB.kind]}`);
      const details = node(doc, "details");
      const detailsTitle = node(doc, "summary", c.detail);
      detailsTitle.style.minHeight = "44px";
      const sources = node(doc, "dl");
      for (const [name, assessment] of [["A", row.optionA], ["B", row.optionB]] as const) {
        sources.append(line(`${name} ${c.question}`, assessment.question));
        if (assessment.after !== null) {
          sources.append(line(`${name} ${c.source}`, assessment.after.provenance.source),
            line(`${name} ${c.licence}`, assessment.after.provenance.licence),
            line(`${name} ${c.date}`, assessment.after.provenance.date),
            line(`${name} ${c.size}`, String(assessment.after.bytes)));
        }
      }
      details.append(detailsTitle, sources);
      item.append(title, saved, a, b, details);
      results.append(item);
    }
    previous.disabled = !view.previous;
    next.disabled = !view.next;
    pageStatus.textContent = `${view.total === 0 ? 0 : options.offset + 1}–${Math.min(view.total, options.offset + 10)} / ${view.total}`;
  }
  function refresh(): void {
    if (disposed) return;
    try {
      // Parse both inputs before changing state: a failed import never replaces a successful comparison.
      const newA = aInput.value.trim() ? parseSnapshot(aInput.value) : null;
      const newB = bInput.value.trim() ? parseSnapshot(bInput.value) : null;
      const today = new Date().toISOString().slice(0, 10);
      if (manifest === null && !baselineInput?.value.trim()) {
        status.textContent = c.baselineMissing;
        return;
      }
      const baseline = manifest ? fromRegionManifest(manifest, today) : parseSnapshot(baselineInput?.value ?? "");
      const nextMatrix = compareSnapshots(baseline, newA, newB, model?.getState().inventory ?? null);
      candidateA = newA;
      candidateB = newB;
      matrix = nextMatrix;
      page = 0;
      status.textContent = nextMatrix.status === "UNKNOWN" ? c.optionsMissing : c.ready;
      draw();
    } catch (error) {
      status.textContent = error instanceof Error && error.message === "Region mismatch" ? c.mismatch : c.invalid;
    }
  }
  const onCompare: EventListener = () => refresh();
  const onClearA: EventListener = () => { aInput.value = ""; refresh(); };
  const onClearB: EventListener = () => { bInput.value = ""; refresh(); };
  const onFilter: EventListener = () => { page = 0; draw(); };
  const onNext: EventListener = () => { page += 1; draw(); };
  const onPrevious: EventListener = () => { page = Math.max(0, page - 1); draw(); };
  const onExport = (format: "json" | "txt"): void => {
    if (matrix === null) return;
    try {
      saveSnapshotReport(createSnapshotReport(matrix), language, format, doc);
      status.textContent = c.exported;
    } catch { status.textContent = c.downloadError; }
  };
  listen(compare, "click", onCompare);
  listen(clearA, "click", onClearA);
  listen(clearB, "click", onClearB);
  listen(search, "input", onFilter);
  listen(filter, "change", onFilter);
  listen(order, "change", onFilter);
  listen(next, "click", onNext);
  listen(previous, "click", onPrevious);
  if (manifest !== null) listen(exportBaseline, "click", () => {
    try {
      saveSnapshotDocument(fromRegionManifest(manifest, new Date().toISOString().slice(0, 10)), doc);
      status.textContent = c.exported;
    } catch { status.textContent = c.downloadError; }
  });
  listen(exportText, "click", () => onExport("txt"));
  listen(exportJson, "click", () => onExport("json"));
  const unsubscribe = model?.subscribe(() => { if (candidateA !== null || candidateB !== null) refresh(); });
  draw();
  return () => {
    disposed = true;
    unsubscribe?.();
    for (const off of listenerDisposers) off();
    listenerDisposers.length = 0;
    section.remove();
  };
}
