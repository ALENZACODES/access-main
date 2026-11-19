import { createOfflineAction } from "./accessibilityGuard";
import type { DashboardModel, DashboardState } from "./offlineDashboard";
import type { Language, RegionManifest } from "./regionDownload";
import {
  appendRecoveryJournal, captureJournalEntry, clearRecoveryJournal,
  emptyRecoveryJournal, formatJournalByteCount,
  journalActionForCell, latestJournalComparison, pageJournalChanges,
  recoveryJournalTotals, type JournalEvent, type JournalQuery,
  type RecoveryJournal,
} from "./recoveryJournal";
import {
  journalCauseLabel, journalChangeLabel, journalCopy, journalEventLabel,
  journalHealthLabel, journalStatusLabel,
} from "./recoveryJournalCopy";
import { saveRecoveryJournalFile } from "./recoveryJournalExport";

/** All snapshot actions are explicit, on this device, and in memory only. */
export interface RecoveryJournalController {
  readonly getJournal: () => RecoveryJournal;
  readonly capture: (state: DashboardState, at: string, event: JournalEvent) => RecoveryJournal;
  readonly clear: () => RecoveryJournal;
}

export function createRecoveryJournalController(manifest: RegionManifest): RecoveryJournalController {
  let journal = emptyRecoveryJournal(manifest.regionId);
  return {
    getJournal: () => journal,
    capture(state, at, event) {
      if (state.phase === "checking" || state.phase === "downloading") {
        throw new Error("Inventory operation in progress");
      }
      const reading = captureJournalEntry(manifest, state.inventory, at, event, state.lastResult);
      journal = appendRecoveryJournal(journal, reading);
      return journal;
    },
    clear() {
      journal = clearRecoveryJournal(journal);
      return journal;
    },
  };
}

function node<K extends keyof HTMLElementTagNameMap>(
  doc: Document,
  name: K,
  text?: string,
): HTMLElementTagNameMap[K] {
  const result = doc.createElement(name);
  if (text !== undefined) result.textContent = text;
  return result;
}
function labeledControl(doc: Document, label: string, control: HTMLElement): HTMLLabelElement {
  const wrapper = node(doc, "label");
  wrapper.textContent = label;
  wrapper.style.display = "grid";
  wrapper.style.gap = "4px";
  wrapper.append(control);
  return wrapper;
}
function definition(doc: Document, name: string, value: string): HTMLElement {
  const item = node(doc, "div");
  item.append(node(doc, "dt", name), node(doc, "dd", value));
  return item;
}
function setTargetSize(element: HTMLElement): void {
  element.style.minHeight = "44px";
  element.style.minWidth = "44px";
}
function option(doc: Document, value: string, label: string): HTMLOptionElement {
  const result = node(doc, "option", label);
  result.value = value;
  return result;
}
function action(doc: Document, label: string): HTMLButtonElement {
  return createOfflineAction(doc, label);
}

/**
 * Adds a temporary device-local history to the existing /offline dashboard.
 * There is no scheduled capture, network request, or implied data availability.
 */
export function mountOfflineRecoveryJournal(
  root: HTMLElement,
  manifest: RegionManifest,
  model: DashboardModel,
  language: Language,
): () => void {
  const doc = root.ownerDocument;
  const c = journalCopy(language);
  const controller = createRecoveryJournalController(manifest);
  let disposed = false;
  let expanded = false;
  let confirmingClear = false;
  let page = 0;
  let search = "";
  let filter: JournalQuery["filter"] = "all";
  let sort: JournalQuery["sort"] = "listed";

  const section = node(doc, "section");
  const heading = node(doc, "h2", c.title);
  const intro = node(doc, "p", c.intro);
  const disclosure = action(doc, c.open);
  disclosure.setAttribute("aria-expanded", "false");
  const content = node(doc, "div");
  const contentId = `offline-recovery-journal-${manifest.regionId.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
  content.id = contentId;
  content.hidden = true;
  disclosure.setAttribute("aria-controls", contentId);
  const privacy = node(doc, "p", c.privacy);
  const caution = node(doc, "p", c.caution);
  const limit = node(doc, "p", c.limit);
  const status = node(doc, "p");
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  status.setAttribute("aria-atomic", "true");
  const controls = node(doc, "div");
  controls.style.display = "flex";
  controls.style.flexWrap = "wrap";
  const capture = action(doc, c.capture);
  const after = action(doc, c.captureAfter);
  const before = action(doc, c.captureBefore);
  const review = action(doc, c.captureReview);
  const saveJson = action(doc, c.saveJson);
  const saveText = action(doc, c.saveText);
  const clear = action(doc, c.clear);
  controls.append(capture, after, before, review, saveJson, saveText, clear);

  const confirmation = node(doc, "div");
  confirmation.hidden = true;
  const confirmText = node(doc, "p", c.confirmClear);
  const confirmYes = action(doc, c.confirmYes);
  const confirmNo = action(doc, c.confirmNo);
  confirmation.append(confirmText, confirmNo, confirmYes);
  const summary = node(doc, "dl");
  const searchInput = node(doc, "input");
  searchInput.type = "search";
  searchInput.maxLength = 120;
  setTargetSize(searchInput);
  const filterSelect = node(doc, "select");
  const sortSelect = node(doc, "select");
  setTargetSize(filterSelect);
  setTargetSize(sortSelect);
  filterSelect.append(
    option(doc, "all", c.all), option(doc, "saved", c.onlySaved),
    option(doc, "UNKNOWN", c.onlyUnknown), option(doc, "changed", c.onlyChanged),
    option(doc, "needs-inspection", c.needsInspection),
  );
  sortSelect.append(
    option(doc, "listed", c.listed), option(doc, "id", c.sortId),
    option(doc, "status", c.sortStatus), option(doc, "size", c.sortSize),
  );
  const filterControls = node(doc, "div");
  filterControls.style.display = "flex";
  filterControls.style.flexWrap = "wrap";
  filterControls.style.gap = "12px";
  filterControls.append(
    labeledControl(doc, c.search, searchInput),
    labeledControl(doc, c.filter, filterSelect),
    labeledControl(doc, c.sort, sortSelect),
  );
  const list = node(doc, "ol");
  const navigation = node(doc, "nav");
  navigation.setAttribute("aria-label", c.page);
  const previous = action(doc, c.previous);
  const next = action(doc, c.next);
  const pageLabel = node(doc, "span");
  navigation.append(previous, pageLabel, next);
  const message = node(doc, "p", c.noSnapshots);
  content.append(privacy, caution, limit, status, controls, confirmation, summary,
    filterControls, message, list, navigation);
  section.append(heading, intro, disclosure, content);
  root.append(section);

  const render = (): void => {
    if (disposed) return;
    const journal = controller.getJournal();
    const totals = recoveryJournalTotals(journal);
    const state = model.getState();
    const busy = state.phase === "checking" || state.phase === "downloading";
    capture.disabled = busy;
    after.disabled = busy;
    before.disabled = busy;
    review.disabled = busy;
    saveJson.disabled = journal.entries.length === 0;
    saveText.disabled = journal.entries.length === 0;
    clear.disabled = journal.entries.length === 0;
    confirmation.hidden = !confirmingClear;
    summary.replaceChildren(
      definition(doc, c.snapshots, String(totals.snapshots)),
      definition(doc, c.saved, String(totals.latestSaved)),
      definition(doc, c.unknownCount, String(totals.latestUnknown)),
      definition(doc, c.missing, String(totals.missing)),
      definition(doc, c.stale, String(totals.stale)),
      definition(doc, c.unreadable, String(totals.unreadable)),
      definition(doc, c.conflicts, String(totals.sourceConflicts)),
      definition(doc, c.health, journalHealthLabel(totals.health, language)),
      definition(doc, c.lastCapture, totals.lastCapture ?? "UNKNOWN"),
    );
    const last = journal.entries.at(-1);
    if (last !== undefined) {
      summary.append(
        definition(doc, c.lastEvent, journalEventLabel(last.event, language)),
        definition(doc, c.lastStop, last.downloadReason ?? "UNKNOWN"),
      );
    }
    list.replaceChildren();
    const comparison = latestJournalComparison(journal);
    if (comparison === null) {
      message.textContent = c.noSnapshots;
      navigation.hidden = true;
      return;
    }
    const query: JournalQuery = { search, filter, sort, page, pageSize: 10 };
    const result = pageJournalChanges(comparison, query);
    page = result.page;
    const previousReading = journal.entries.at(-2) ?? null;
    message.textContent = previousReading === null ? c.firstSnapshot :
      result.total === 0 ? c.none : `${c.changed}${language === "fr" ? "\u00a0:" : ":"} ${result.total}`;
    for (const delta of result.rows) {
      const item = node(doc, "li");
      const row = delta.after ?? delta.before;
      if (row === null) continue;
      const label = node(doc, "strong", row.id);
      const details = node(doc, "dl");
      const recommended = journalActionForCell(row);
      const nextStep = recommended === "download" ? c.download :
        recommended === "inspect" ? c.review :
        recommended === "review-source" ? c.reviewSource : c.noAction;
      details.append(
        definition(doc, c.change, journalChangeLabel(delta.kind, language)),
        definition(doc, c.prior, delta.before?.status === undefined ? "UNKNOWN" :
          journalStatusLabel(delta.before.status, language)),
        definition(doc, c.state, delta.after === null ? "UNKNOWN" :
          journalStatusLabel(delta.after.status, language)),
        definition(doc, c.reason, journalCauseLabel(row.cause, language)),
        definition(doc, c.expectedBytes, formatJournalByteCount(row.bytes, language)),
        definition(doc, c.source, row.provenance?.source ?? "UNKNOWN"),
        definition(doc, c.licence, row.provenance?.licence ?? "UNKNOWN"),
        definition(doc, c.sourceDate, row.provenance?.date ?? "UNKNOWN"),
        definition(doc, c.recommended, nextStep),
      );
      item.append(label, details);
      list.append(item);
    }
    navigation.hidden = result.pages <= 1;
    previous.disabled = !result.hasPrevious;
    next.disabled = !result.hasNext;
    pageLabel.textContent = `${c.page}${language === "fr" ? "\u00a0:" : ":"} ${result.page + 1} / ${result.pages}`;
  };

  const onDisclosure = (): void => {
    expanded = !expanded;
    content.hidden = !expanded;
    disclosure.textContent = expanded ? c.close : c.open;
    disclosure.setAttribute("aria-expanded", String(expanded));
    if (expanded) render();
  };
  const onCapture = (event: JournalEvent): void => {
    try {
      controller.capture(model.getState(), new Date().toISOString().replace(/\.\d{3}Z$/, "Z"), event);
      status.textContent = c.captured;
    } catch {
      status.textContent = c.captureFailed;
    }
    render();
  };
  const onClear = (): void => { confirmingClear = true; render(); confirmNo.focus(); };
  const onConfirm = (): void => {
    controller.clear();
    confirmingClear = false;
    status.textContent = c.clearDone;
    render();
    capture.focus();
  };
  const onKeep = (): void => { confirmingClear = false; render(); clear.focus(); };
  const onExport = (format: "txt" | "json"): void => {
    try { saveRecoveryJournalFile(controller.getJournal(), language, format, doc); }
    catch { status.textContent = c.exportFailed; }
  };
  const onSearch = (): void => { search = searchInput.value; page = 0; render(); };
  const onFilter = (): void => { filter = filterSelect.value as JournalQuery["filter"]; page = 0; render(); };
  const onSort = (): void => { sort = sortSelect.value as JournalQuery["sort"]; page = 0; render(); };
  const onPrevious = (): void => { page -= 1; render(); };
  const onNext = (): void => { page += 1; render(); };

  const eventListeners: readonly [HTMLElement, string, EventListener][] = [
    [disclosure, "click", onDisclosure],
    [capture, "click", () => onCapture("snapshot")],
    [after, "click", () => onCapture("after-download")],
    [before, "click", () => onCapture("before-cleanup")],
    [review, "click", () => onCapture("manual-review")],
    [clear, "click", onClear], [confirmYes, "click", onConfirm], [confirmNo, "click", onKeep],
    [saveJson, "click", () => onExport("json")], [saveText, "click", () => onExport("txt")],
    [searchInput, "input", onSearch], [filterSelect, "change", onFilter],
    [sortSelect, "change", onSort], [previous, "click", onPrevious], [next, "click", onNext],
  ];
  for (const [target, event, listener] of eventListeners) target.addEventListener(event, listener);
  const unsubscribe = model.subscribe(() => { if (expanded) render(); });
  render();
  return () => {
    disposed = true;
    unsubscribe();
    for (const [target, event, listener] of eventListeners) target.removeEventListener(event, listener);
    section.remove();
  };
}
