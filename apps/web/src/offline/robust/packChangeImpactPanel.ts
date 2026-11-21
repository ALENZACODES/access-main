import { createOfflineAction } from "./accessibilityGuard";
import type { DashboardModel } from "./offlineDashboard";
import type { Language, RegionManifest } from "./regionDownload";
import {
  comparePackManifests, exportImpactJson, exportImpactText, pagePackChanges,
  parseManifest, safeRegionFilename, type ChangeFilter, type ChangeImpact, type ChangeSort,
} from "./packChangeImpact";
import { PACK_CHANGE_KIND, PACK_CHANGE_PRIORITY, PACK_CHANGE_SORT, packChangeCopy } from "./packChangeImpactCopy";
const PAGE_SIZE = 15;
const FILTERS: readonly ChangeFilter[] = ["all", "changed", "UNKNOWN", "saved", "added", "removed", "source", "licence", "date", "bytes", "unchanged"];
const SORTS: readonly ChangeSort[] = ["listed", "priority", "id", "largest", "source"];
function node<K extends keyof HTMLElementTagNameMap>(doc: Document, tag: K, content?: string): HTMLElementTagNameMap[K] {
  const element = doc.createElement(tag);
  if (content !== undefined) element.textContent = content;
  return element;
}
function action(doc: Document, name: string): HTMLButtonElement {
  return createOfflineAction(doc, name);
}
function textField(doc: Document, label: string, control: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement): HTMLLabelElement {
  const wrap = node(doc, "label", label);
  wrap.style.display = "block";
  wrap.style.marginBlock = "8px";
  wrap.append(control);
  control.style.display = "block";
  control.style.width = "100%";
  control.style.minHeight = "44px";
  return wrap;
}
function option(doc: Document, value: string, content: string): HTMLOptionElement {
  const opt = node(doc, "option", content);
  opt.value = value;
  return opt;
}
function summaryPair(doc: Document, label: string, value: string): HTMLDivElement {
  const row = node(doc, "div");
  const term = node(doc, "dt", label);
  const description = node(doc, "dd", value);
  row.append(term, description);
  return row;
}
/** Caller explicitly opens this optional panel; it never writes pack data. */
export function mountPackChangeImpact(root: HTMLElement, manifest: RegionManifest,
  model: DashboardModel, language: Language): () => void {
  const doc = root.ownerDocument;
  const copy = packChangeCopy(language);
  const colon = language === "fr" ? "\u00a0: " : ": ";
  const section = node(doc, "section");
  section.className = "panel stack";
  const title = node(doc, "h3", copy.title);
  const intro = node(doc, "p", copy.intro);
  const caution = node(doc, "p", copy.caution);
  const explanation = node(doc, "p", copy.help);
  const textarea = node(doc, "textarea");
  textarea.rows = 8;
  textarea.maxLength = 131072;
  textarea.spellcheck = false;
  const noteId = `pack-change-guidance-${manifest.regionId.replace(/[^a-z0-9-]/gi, "-")}`;
  explanation.id = noteId;
  textarea.setAttribute("aria-describedby", noteId);
  const input = textField(doc, copy.paste, textarea);
  const compare = action(doc, copy.compare);
  const clear = action(doc, copy.clear);
  const tools = node(doc, "div");
  tools.className = "button-row";
  tools.append(compare, clear);
  const message = node(doc, "p", copy.noResult);
  message.setAttribute("role", "status");
  message.setAttribute("aria-live", "polite");
  const summary = node(doc, "dl");
  const details = node(doc, "div");
  const search = node(doc, "input");
  search.type = "search";
  search.maxLength = 160;
  const searchLabel = textField(doc, copy.search, search);
  const filter = node(doc, "select");
  for (const key of FILTERS) {
    const label = key === "all" ? copy.all : key === "changed" ? copy.changed : key === "UNKNOWN" ? copy.unknownOnly
      : key === "saved" ? copy.savedOnly : PACK_CHANGE_KIND[language][key];
    filter.append(option(doc, key, label));
  }
  const filterLabel = textField(doc, copy.filter, filter);
  const sort = node(doc, "select");
  for (const key of SORTS) sort.append(option(doc, key, PACK_CHANGE_SORT[language][key]));
  const sortLabel = textField(doc, copy.sort, sort);
  const controls = node(doc, "div");
  controls.append(searchLabel, filterLabel, sortLabel);
  const results = node(doc, "ol");
  const counter = node(doc, "p");
  const previous = action(doc, copy.previous);
  const next = action(doc, copy.next);
  const navigation = node(doc, "nav");
  navigation.setAttribute("aria-label", copy.rowCount);
  navigation.append(previous, counter, next);
  const exportText = action(doc, copy.exportText);
  const exportJson = action(doc, copy.exportJson);
  exportText.disabled = true;
  exportJson.disabled = true;
  const exportButtons = node(doc, "div");
  exportButtons.className = "button-row";
  exportButtons.append(exportText, exportJson);
  const privacy = node(doc, "p", copy.privacy);
  const footer = node(doc, "p", copy.note);
  details.append(controls, results, navigation, exportButtons, privacy, footer);
  details.hidden = true;
  section.append(title, intro, caution, explanation, input, tools, message, summary, details);
  root.append(section);
  let disposed = false;
  let comparison: ChangeImpact | null = null;
  let submitted: RegionManifest | null = null;
  let offset = 0;
  function draw(): void {
    if (disposed) return;
    const current = comparison;
    if (current === null) {
      summary.replaceChildren();
      results.replaceChildren();
      details.hidden = true;
      exportText.disabled = true;
      exportJson.disabled = true;
      return;
    }
    details.hidden = false;
    exportText.disabled = current.status !== "ready";
    exportJson.disabled = current.status !== "ready";
    summary.replaceChildren(
      summaryPair(doc, copy.region, current.regionId),
      summaryPair(doc, copy.added, String(current.added)),
      summaryPair(doc, copy.removed, String(current.removed)),
      summaryPair(doc, copy.modified, String(current.modified)),
      summaryPair(doc, copy.unchanged, String(current.unchanged)),
      summaryPair(doc, copy.localUnknown, String(current.localUnknown)),
      summaryPair(doc, copy.beforeBytes, String(current.totalBeforeBytes)),
      summaryPair(doc, copy.afterBytes, String(current.totalAfterBytes)),
      summaryPair(doc, copy.deltaBytes, String(current.deltaBytes)),
      summaryPair(doc, copy.physical, "UNKNOWN"),
    );
    const page = pagePackChanges(current, {
      search: search.value, filter: filter.value as ChangeFilter,
      sort: sort.value as ChangeSort, offset, limit: PAGE_SIZE,
    });
    results.replaceChildren();
    if (page.rows.length === 0) results.append(node(doc, "li", copy.noMatches));
    for (const cell of page.rows) {
      const item = node(doc, "li");
      const heading = node(doc, "h4", cell.id);
      const status = node(doc, "p", `${cell.changes.map((key) => PACK_CHANGE_KIND[language][key]).join(", ")} · ${cell.localCopy}`);
      const urgency = node(doc, "p", PACK_CHANGE_PRIORITY[language][cell.priority]);
      const facts = node(doc, "dl");
      for (const [title, snapshot] of [[copy.before, cell.before], [copy.after, cell.after]] as const) {
        const provenance = snapshot?.provenance;
        facts.append(
          summaryPair(doc, title, snapshot === null ? "UNKNOWN" : snapshot.id),
          summaryPair(doc, `${title} · ${copy.source}`, provenance?.source ?? "UNKNOWN"),
          summaryPair(doc, `${title} · ${copy.licence}`, provenance?.licence ?? "UNKNOWN"),
          summaryPair(doc, `${title} · ${copy.date}`, provenance?.date ?? "UNKNOWN"),
          summaryPair(doc, `${title} · ${copy.bytes}`, snapshot === null ? "UNKNOWN" : String(snapshot.bytes)),
        );
      }
      facts.append(summaryPair(doc, copy.physical, "UNKNOWN"));
      item.append(heading, status, urgency, facts, node(doc, "p", cell.question));
      results.append(item);
    }
    previous.disabled = !page.previous;
    next.disabled = !page.next;
    counter.textContent = `${copy.rowCount}${colon}${page.total}`;
  }
  function refreshResult(): void {
    if (disposed || submitted === null) return;
    comparison = comparePackManifests(manifest, submitted, model.getState().inventory);
    draw();
  }
  function onCompare(): void {
    try {
      submitted = parseManifest(textarea.value);
      offset = 0;
      refreshResult();
      message.textContent = comparison?.status === "UNKNOWN" ? copy.wrongRegion :
        comparison?.followUpCount === 0 ? copy.noChanges : copy.result;
    } catch {
      submitted = null;
      comparison = null;
      message.textContent = copy.error;
      draw();
    }
  }
  function onClear(): void {
    textarea.value = "";
    search.value = "";
    filter.value = "all";
    sort.value = "listed";
    submitted = null;
    comparison = null;
    offset = 0;
    message.textContent = copy.noResult;
    draw();
  }
  function onFilters(): void { offset = 0; draw(); }
  function onPrevious(): void { offset = Math.max(0, offset - PAGE_SIZE); draw(); }
  function onNext(): void {
    if (comparison !== null && offset + PAGE_SIZE < comparison.rows.length) offset += PAGE_SIZE;
    draw();
  }
  function save(format: "txt" | "json"): void {
    if (disposed || comparison === null || comparison.status !== "ready") return;
    let url: string | null = null;
    try {
      const date = new Date().toISOString().slice(0, 10);
      const body = format === "txt" ? exportImpactText(comparison, language) : exportImpactJson(comparison, date);
      url = URL.createObjectURL(new Blob([body], { type: format === "txt" ? "text/plain;charset=utf-8" : "application/json;charset=utf-8" }));
      const link = node(doc, "a");
      link.href = url;
      link.download = safeRegionFilename(comparison.regionId, format);
      doc.body.append(link);
      try { link.click(); } finally { link.remove(); }
      message.textContent = copy.savedReport;
    } catch {
      message.textContent = copy.saveFailed;
    } finally {
      if (url !== null) URL.revokeObjectURL(url);
    }
  }
  const onExportText = (): void => save("txt");
  const onExportJson = (): void => save("json");
  compare.addEventListener("click", onCompare);
  clear.addEventListener("click", onClear);
  search.addEventListener("input", onFilters);
  filter.addEventListener("change", onFilters);
  sort.addEventListener("change", onFilters);
  previous.addEventListener("click", onPrevious);
  next.addEventListener("click", onNext);
  exportText.addEventListener("click", onExportText);
  exportJson.addEventListener("click", onExportJson);
  const unsubscribe = model.subscribe(refreshResult);
  return () => {
    disposed = true;
    unsubscribe();
    compare.removeEventListener("click", onCompare);
    clear.removeEventListener("click", onClear);
    search.removeEventListener("input", onFilters);
    filter.removeEventListener("change", onFilters);
    sort.removeEventListener("change", onFilters);
    previous.removeEventListener("click", onPrevious);
    next.removeEventListener("click", onNext);
    exportText.removeEventListener("click", onExportText);
    exportJson.removeEventListener("click", onExportJson);
    section.remove();
  };
}
