import type { DashboardModel, DashboardState } from "./offlineDashboard";
import type { Language, RegionManifest } from "./regionDownload";
import { createOfflineAction } from "./accessibilityGuard";
import {
  browseSourceLedger, buildSourceLedger, encodeSourceLedger,
  type LedgerFilter, type LedgerOrder, type LedgerSummary, type SourceTierRecord,
} from "./sourceLedger";
import { reasonLabel, sourceLedgerCopy, stateLabel, tierLabel } from "./sourceLedgerCopy";

const PAGE_SIZE = 12;

function el<K extends keyof HTMLElementTagNameMap>(
  doc: Document, tag: K, content?: string,
): HTMLElementTagNameMap[K] {
  const node = doc.createElement(tag);
  if (content !== undefined) node.textContent = content;
  return node;
}

function field(doc: Document, term: string, value: string): HTMLDivElement {
  const holder = el(doc, "div");
  const dt = el(doc, "dt", term);
  const dd = el(doc, "dd", value);
  dd.style.marginInlineStart = "1em";
  holder.append(dt, dd);
  return holder;
}

function labelledSelect(
  doc: Document,
  label: string,
  choices: readonly { readonly value: string; readonly label: string }[],
): { wrapper: HTMLLabelElement; select: HTMLSelectElement } {
  const wrapper = el(doc, "label");
  const text = el(doc, "span", label);
  const select = el(doc, "select");
  for (const choice of choices) {
    const option = el(doc, "option", choice.label);
    option.value = choice.value;
    select.add(option);
  }
  select.style.minHeight = "44px";
  select.style.minWidth = "44px";
  select.style.margin = "4px";
  wrapper.append(text, select);
  wrapper.style.display = "inline-flex";
  wrapper.style.flexDirection = "column";
  return { wrapper, select };
}

function validFilter(value: string): LedgerFilter {
  if (value === "saved" || value === "unknown" || value === "tier-unknown" ||
    value === "source-issue") return value;
  return "all";
}

function validOrder(value: string): LedgerOrder {
  if (value === "id" || value === "size" || value === "date") return value;
  return "listed";
}

function stateFromModel(
  manifest: RegionManifest,
  state: DashboardState,
  tierRecords: readonly SourceTierRecord[],
): LedgerSummary {
  return buildSourceLedger(manifest, state.inventory, tierRecords);
}

/** User-activated export; record metadata only, never downloaded bytes. */
export function saveSourceLedger(
  ledger: LedgerSummary,
  doc: Document,
): void {
  const rawName = ledger.regionId.toLowerCase()
    .replace(/[^a-z0-9_-]+/gu, "-").replace(/^-+|-+$/gu, "").slice(0, 60);
  const filename = `offline-sources-${rawName || "region"}.json`;
  const blob = new Blob([encodeSourceLedger(ledger)], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  try {
    const anchor = el(doc, "a");
    anchor.href = url;
    anchor.download = filename;
    anchor.hidden = true;
    doc.body.append(anchor);
    try { anchor.click(); } finally { anchor.remove(); }
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Standalone DOM subtree on the existing /offline dashboard.
 * No new fetches, data writes or storage listeners are introduced.
 */
export function mountOfflineSourceLedger(
  root: HTMLElement,
  manifest: RegionManifest,
  model: DashboardModel,
  language: Language,
  tierRecords: readonly SourceTierRecord[] = [],
): () => void {
  const doc = root.ownerDocument;
  const copy = sourceLedgerCopy(language);
  const section = el(doc, "section");
  section.className = "offline-source-ledger";
  const heading = el(doc, "h3", copy.title);
  const intro = el(doc, "p", copy.intro);
  const toggle = createOfflineAction(doc, copy.open);
  toggle.setAttribute("aria-expanded", "false");
  const content = el(doc, "div");
  content.hidden = true;
  const panelId = `offline-source-ledger-${manifest.regionId.replace(/[^a-zA-Z0-9_-]/gu, "-")}`;
  content.id = panelId;
  toggle.setAttribute("aria-controls", panelId);
  const status = el(doc, "p");
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  status.setAttribute("aria-atomic", "true");
  const overview = el(doc, "dl");
  const controls = el(doc, "div");
  const searchLabel = el(doc, "label");
  searchLabel.append(el(doc, "span", copy.search));
  const search = el(doc, "input");
  search.type = "search";
  search.maxLength = 160;
  search.style.minHeight = "44px";
  search.style.minWidth = "44px";
  search.style.margin = "4px";
  searchLabel.append(search);
  searchLabel.style.display = "inline-flex";
  searchLabel.style.flexDirection = "column";
  const filters = labelledSelect(doc, copy.filter, [
    { value: "all", label: copy.all },
    { value: "saved", label: copy.saved },
    { value: "unknown", label: copy.unknown },
    { value: "tier-unknown", label: copy.tierUnknown },
    { value: "source-issue", label: copy.sourceIssues },
  ]);
  const sorting = labelledSelect(doc, copy.sort, [
    { value: "listed", label: copy.listed },
    { value: "id", label: copy.byId },
    { value: "size", label: copy.bySize },
    { value: "date", label: copy.byDate },
  ]);
  const refresh = createOfflineAction(doc, copy.refresh);
  const exportButton = createOfflineAction(doc, copy.export);
  controls.append(searchLabel, filters.wrapper, sorting.wrapper, refresh, exportButton);
  const list = el(doc, "ol");
  const navigation = el(doc, "nav");
  navigation.setAttribute("aria-label", copy.page);
  const previous = createOfflineAction(doc, copy.previous);
  const next = createOfflineAction(doc, copy.next);
  const position = el(doc, "span");
  const disclaimer = el(doc, "p", copy.disclaimer);
  navigation.append(previous, position, next);
  content.append(status, overview, controls, list, navigation, disclaimer);
  section.append(heading, intro, toggle, content);
  root.append(section);

  let shown = false;
  let disposed = false;
  let offset = 0;
  let ledger = stateFromModel(manifest, model.getState(), tierRecords);
  const labelBytes = (value: number | null): string => value === null ? copy.unknown :
    `${new Intl.NumberFormat(language === "fr" ? "fr-CA" : "en-CA").format(value)} B`;

  const render = (): void => {
    if (disposed || !shown) return;
    const state = model.getState();
    ledger = stateFromModel(manifest, state, tierRecords);
    const page = browseSourceLedger(ledger, {
      filter: validFilter(filters.select.value),
      order: validOrder(sorting.select.value),
      search: search.value,
      offset,
      limit: PAGE_SIZE,
    });
    overview.replaceChildren(
      field(doc, copy.countListed, String(ledger.rows.length)),
      field(doc, copy.countSaved, String(ledger.saved)),
      field(doc, copy.countUnknown, String(ledger.unknown)),
      field(doc, copy.countTier, String(ledger.tierUnknown)),
    );
    status.textContent = state.phase === "checking" ? copy.working :
      ledger.state === "UNKNOWN" ? copy.unavailable :
        `${copy.countSaved}: ${ledger.saved}. ${copy.countUnknown}: ${ledger.unknown}.`;
    list.replaceChildren();
    list.start = page.offset + 1;
    for (const row of page.rows) {
      const item = el(doc, "li");
      const title = el(doc, "strong", row.id);
      title.setAttribute("lang", "und");
      const details = el(doc, "dl");
      details.append(
        field(doc, copy.state, stateLabel(row.state, language)),
        field(doc, copy.reason, reasonLabel(row.reason, language)),
        field(doc, copy.size, labelBytes(row.expectedBytes)),
        field(doc, copy.source, row.source?.source ?? copy.unknown),
        field(doc, copy.licence, row.source?.licence ?? copy.unknown),
        field(doc, copy.date, row.source?.date ?? copy.unknown),
        field(doc, copy.tier, tierLabel(row.tier, language)),
        field(doc, copy.basis, row.basis ?? copy.pending),
      );
      if (row.observedSource && row.reason === "metadata-conflict") {
        details.append(field(doc, copy.observed, row.observedSource.source));
      }
      item.append(title, details);
      list.append(item);
    }
    if (page.rows.length === 0) list.append(el(doc, "li", copy.noRows));
    const separator = language === "fr" ? "\u00a0:" : ":";
    position.textContent = `${copy.page}${separator} ${page.total === 0 ? 0 : page.offset + 1}–${Math.min(page.offset + PAGE_SIZE, page.total)} / ${page.total}`;
    previous.disabled = !page.hasPrevious;
    next.disabled = !page.hasNext;
    exportButton.disabled = state.phase === "checking";
  };

  const onToggle = (): void => {
    shown = !shown;
    content.hidden = !shown;
    toggle.textContent = shown ? copy.close : copy.open;
    toggle.setAttribute("aria-expanded", String(shown));
    if (shown) render();
  };
  const onChange = (): void => { offset = 0; render(); };
  const onNext = (): void => { offset += PAGE_SIZE; render(); };
  const onPrevious = (): void => { offset = Math.max(0, offset - PAGE_SIZE); render(); };
  const onRefresh = (): void => { void model.refresh(); };
  const onExport = (): void => {
    try { saveSourceLedger(ledger, doc); }
    catch { status.textContent = copy.error; }
  };
  toggle.addEventListener("click", onToggle);
  search.addEventListener("input", onChange);
  filters.select.addEventListener("change", onChange);
  sorting.select.addEventListener("change", onChange);
  next.addEventListener("click", onNext);
  previous.addEventListener("click", onPrevious);
  refresh.addEventListener("click", onRefresh);
  exportButton.addEventListener("click", onExport);
  const unsubscribe = model.subscribe(() => render());
  return (): void => {
    disposed = true;
    unsubscribe();
    toggle.removeEventListener("click", onToggle);
    search.removeEventListener("input", onChange);
    filters.select.removeEventListener("change", onChange);
    sorting.select.removeEventListener("change", onChange);
    next.removeEventListener("click", onNext);
    previous.removeEventListener("click", onPrevious);
    refresh.removeEventListener("click", onRefresh);
    exportButton.removeEventListener("click", onExport);
    section.remove();
  };
}
