import { createOfflineAction } from "./accessibilityGuard";
import type { DashboardModel } from "./offlineDashboard";
import type { Language, RegionManifest } from "./regionDownload";
import {
  addPreparationEntry, assessPreparationCopies, newPreparationNotebook, pagePreparationEntries,
  parsePreparationNotebook, preparationTotals, removePreparationEntry, updatePreparationEntry,
  PREPARATION_FILTERS, PREPARATION_MAX_ANSWER, PREPARATION_MAX_ENTRIES, PREPARATION_MAX_JSON_BYTES,
  PREPARATION_MAX_QUESTION, PREPARATION_MAX_SOURCE, PREPARATION_PROMPTS, PREPARATION_SORTS,
  PREPARATION_TOPICS,
  type PreparationEntry, type PreparationEvidence, type PreparationFilter,
  type PreparationSort, type PreparationStatus, type PreparationTopic,
} from "./accessPreparation";
import { createPreparationExport, savePreparationExport } from "./accessPreparationExport";
import {
  evidenceLabel, filterLabel, preparationCopy, sortLabel, statusLabel, topicLabel,
} from "./accessPreparationCopy";

const PAGE = 12;
function element<K extends keyof HTMLElementTagNameMap>(doc: Document, tag: K, content?: string): HTMLElementTagNameMap[K] {
  const created = doc.createElement(tag);
  if (content !== undefined) created.textContent = content;
  return created;
}
function action(doc: Document, text: string): HTMLButtonElement { return createOfflineAction(doc, text); }
function labelled<K extends "input" | "select" | "textarea">(
  doc: Document, tag: K, id: string, labelText: string,
): { label: HTMLLabelElement; control: HTMLElementTagNameMap[K] } {
  const label = element(doc, "label", labelText);
  const control = element(doc, tag);
  control.id = id;
  control.style.minHeight = "44px";
  control.style.minWidth = "44px";
  label.htmlFor = id;
  label.append(control);
  return { label, control };
}
function option(doc: Document, value: string, title: string): HTMLOptionElement {
  const item = element(doc, "option", title);
  item.value = value;
  return item;
}
function definition(doc: Document, term: string, value: string): HTMLDivElement {
  const group = element(doc, "div");
  const dt = element(doc, "dt", term);
  const dd = element(doc, "dd", value);
  dd.style.marginInlineStart = "1em";
  group.append(dt, dd);
  return group;
}

/** Notes stay in memory; no automatic persistence, downloads, or background timers. */
export function mountAccessPreparation(
  root: HTMLElement, manifest: RegionManifest, model: DashboardModel, language: Language,
): () => void {
  const doc = root.ownerDocument;
  const copy = preparationCopy(language);
  const regionSlug = manifest.regionId.replace(/[^a-zA-Z0-9_-]/gu, "-");
  const id = (suffix: string): string => `access-preparation-${regionSlug}-${suffix}`;
  const now = (): string => new Date().toISOString();
  const section = element(doc, "section");
  section.setAttribute("aria-label", copy.title);
  const heading = element(doc, "h2", copy.title);
  const intro = element(doc, "p", copy.intro);
  const privacy = element(doc, "p", copy.privacy);
  const toggle = action(doc, copy.open);
  const panel = element(doc, "div");
  panel.id = id("panel");
  panel.hidden = true;
  toggle.setAttribute("aria-expanded", "false");
  toggle.setAttribute("aria-controls", panel.id);
  const announcement = element(doc, "p", copy.start);
  announcement.setAttribute("role", "status");
  announcement.setAttribute("aria-live", "polite");
  announcement.setAttribute("aria-atomic", "true");
  const reminder = element(doc, "p", copy.reminder);
  const totals = element(doc, "dl");
  const rowList = element(doc, "ol");
  const summary = element(doc, "div");
  const localCopies = element(doc, "p");
  const refresh = action(doc, copy.refresh);

  const topic = labelled(doc, "select", id("topic"), copy.topic);
  const suggested = labelled(doc, "select", id("template"), copy.template);
  const question = labelled(doc, "textarea", id("question"), copy.question);
  question.control.maxLength = PREPARATION_MAX_QUESTION;
  question.control.rows = 2;
  question.control.style.width = "100%";
  const link = labelled(doc, "select", id("cell"), copy.cell);
  const add = action(doc, copy.add);
  link.control.append(option(doc, "", copy.noCell));
  for (const cell of manifest.cells) link.control.append(option(doc, cell.id, cell.id));
  for (const value of PREPARATION_TOPICS) topic.control.append(option(doc, value, topicLabel(value, language)));
  suggested.control.append(option(doc, "", copy.custom));
  for (const template of PREPARATION_PROMPTS) {
    suggested.control.append(option(doc, template.code, `${topicLabel(template.topic, language)} — ${template.question}`));
  }
  const creator = element(doc, "div");
  creator.append(topic.label, suggested.label, question.label, link.label, add);

  const search = labelled(doc, "input", id("search"), copy.search);
  search.control.type = "search";
  search.control.maxLength = 160;
  const filter = labelled(doc, "select", id("filter"), copy.filter);
  const topicFilter = labelled(doc, "select", id("topic-filter"), copy.topicFilter);
  const order = labelled(doc, "select", id("order"), copy.sort);
  for (const choice of PREPARATION_FILTERS) filter.control.append(option(doc, choice, filterLabel(choice, language)));
  topicFilter.control.append(option(doc, "all", copy.all));
  for (const choice of PREPARATION_TOPICS) topicFilter.control.append(option(doc, choice, topicLabel(choice, language)));
  for (const choice of PREPARATION_SORTS) order.control.append(option(doc, choice, sortLabel(choice, language)));
  const filters = element(doc, "div");
  filters.append(search.label, filter.label, topicFilter.label, order.label);
  const pager = element(doc, "nav");
  pager.setAttribute("aria-label", copy.page);
  const previous = action(doc, copy.previous);
  const next = action(doc, copy.next);
  const position = element(doc, "span");
  pager.append(previous, position, next);

  const selector = labelled(doc, "select", id("choose"), copy.select);
  const answer = labelled(doc, "textarea", id("answer"), copy.answer);
  answer.control.maxLength = PREPARATION_MAX_ANSWER;
  answer.control.rows = 3;
  answer.control.style.width = "100%";
  const status = labelled(doc, "select", id("status"), copy.status);
  for (const choice of ["UNKNOWN", "open", "answered", "not-needed"] as const) {
    status.control.append(option(doc, choice, statusLabel(choice, language)));
  }
  const evidence = labelled(doc, "select", id("evidence"), copy.evidence);
  for (const choice of ["UNKNOWN", "personal-note", "source-note"] as const) {
    evidence.control.append(option(doc, choice, evidenceLabel(choice, language)));
  }
  const sourceName = labelled(doc, "input", id("source"), copy.source);
  sourceName.control.maxLength = PREPARATION_MAX_SOURCE;
  const sourceDate = labelled(doc, "input", id("source-date"), copy.sourceDate);
  sourceDate.control.type = "date";
  const change = action(doc, copy.change);
  const remove = action(doc, copy.remove);
  const editArea = element(doc, "div");
  editArea.append(selector.label, answer.label, status.label, evidence.label,
    sourceName.label, sourceDate.label, change, remove);

  const exportJson = action(doc, copy.exportJson);
  const exportText = action(doc, copy.exportText);
  const upload = labelled(doc, "input", id("import"), copy.import);
  upload.control.type = "file";
  upload.control.accept = ".json,application/json";
  const transfers = element(doc, "div");
  transfers.append(exportJson, exportText, upload.label);
  summary.append(totals, localCopies, refresh);
  panel.append(announcement, privacy, creator, summary, filters, rowList, pager, editArea, transfers, reminder);
  section.append(heading, intro, toggle, panel);
  root.append(section);

  let notebook = newPreparationNotebook(manifest.regionId, now());
  let disposed = false;
  let expanded = false;
  let offset = 0;
  let sequence = 0;
  let selected = "";
  const assessment = () => assessPreparationCopies(manifest, model.getState().inventory, notebook);

  const draw = (): void => {
    if (disposed || !expanded) return;
    const count = preparationTotals(notebook);
    const copies = assessment();
    totals.replaceChildren(
      definition(doc, copy.total, String(count.total)),
      definition(doc, copy.openCount, String(count.open)),
      definition(doc, copy.answered, String(count.answered)),
      definition(doc, copy.unknownCount, String(count.UNKNOWN)),
      definition(doc, copy.notNeeded, String(count.notNeeded)),
      definition(doc, copy.sourceNotes, String(count.withSourceNote)),
      definition(doc, copy.linked, String(count.linkedToCell)),
    );
    localCopies.textContent = `${copy.localStatus}${language === "fr" ? "\u00a0:" : ":"} ${copies.status}. ` +
      `${copies.savedCells}/${copies.totalCells}`;
    const items = pagePreparationEntries(notebook, {
      search: search.control.value, filter: filter.control.value as PreparationFilter,
      topic: topicFilter.control.value as PreparationTopic | "all",
      sort: order.control.value as PreparationSort, offset, limit: PAGE,
    });
    rowList.replaceChildren();
    if (items.rows.length === 0) rowList.append(element(doc, "li", notebook.entries.length ? copy.noMatch : copy.start));
    const linked = new Map(copies.linked.map((record) => [record.id, record.status]));
    for (const entry of items.rows) {
      const item = element(doc, "li");
      item.append(element(doc, "strong", entry.question));
      const dl = element(doc, "dl");
      dl.append(
        definition(doc, copy.topic, topicLabel(entry.topic, language)),
        definition(doc, copy.status, statusLabel(entry.status, language)),
        definition(doc, copy.answer, entry.answer || "UNKNOWN"),
        definition(doc, copy.source, entry.sourceName || "UNKNOWN"),
        definition(doc, copy.sourceDate, entry.sourceDate || "UNKNOWN"),
        definition(doc, copy.localStatus, linked.get(entry.id) ?? "UNKNOWN"),
      );
      item.append(dl);
      rowList.append(item);
    }
    previous.disabled = !items.previous;
    next.disabled = !items.next;
    position.textContent = `${items.total === 0 ? 0 : offset + 1}–${Math.min(offset + PAGE, items.total)} / ${items.total}`;
    add.disabled = notebook.entries.length >= PREPARATION_MAX_ENTRIES;
    selector.control.replaceChildren();
    for (const entry of notebook.entries) selector.control.append(option(doc, entry.id, entry.question));
    if (notebook.entries.some((entry) => entry.id === selected)) selector.control.value = selected;
    else selected = notebook.entries[0]?.id ?? "";
    if (selected) selector.control.value = selected;
    const hasItems = notebook.entries.length > 0;
    change.disabled = !hasItems;
    remove.disabled = !hasItems;
    exportJson.disabled = !hasItems;
    exportText.disabled = !hasItems;
  };
  const loadSelected = (): void => {
    const entry: PreparationEntry | undefined = notebook.entries.find((item) => item.id === selected);
    answer.control.value = entry?.answer ?? "";
    status.control.value = entry?.status ?? "UNKNOWN";
    evidence.control.value = entry?.evidence ?? "UNKNOWN";
    sourceName.control.value = entry?.sourceName ?? "";
    sourceDate.control.value = entry?.sourceDate ?? "";
  };
  const onToggle = (): void => {
    expanded = !expanded;
    panel.hidden = !expanded;
    toggle.textContent = expanded ? copy.close : copy.open;
    toggle.setAttribute("aria-expanded", String(expanded));
    draw();
    loadSelected();
  };
  const safely = (fn: () => void, message: string): void => {
    try { fn(); announcement.textContent = message; draw(); }
    catch { announcement.textContent = copy.invalid; }
  };
  const onSuggested = (): void => {
    const template = PREPARATION_PROMPTS.find((prompt) => prompt.code === suggested.control.value);
    if (!template) return;
    topic.control.value = template.topic;
    question.control.value = template.question;
  };
  const onAdd = (): void => {
    safely(() => {
      const value = question.control.value.trim();
      if (!value) throw new TypeError("Question missing");
      const idValue = `question-${++sequence}`;
      notebook = addPreparationEntry(notebook, { id: idValue, topic: topic.control.value as PreparationTopic,
        question: value, cellId: link.control.value || null }, now());
      selected = idValue;
      question.control.value = "";
      suggested.control.value = "";
      offset = 0;
      loadSelected();
    }, copy.savedLocally);
  };
  const onSelection = (): void => { selected = selector.control.value; loadSelected(); };
  const onChange = (): void => {
    safely(() => {
      const noteType = evidence.control.value as PreparationEvidence;
      notebook = updatePreparationEntry(notebook, selected, {
        answer: answer.control.value, status: status.control.value as PreparationStatus,
        evidence: noteType,
        sourceName: noteType === "source-note" ? sourceName.control.value : "",
        sourceDate: noteType === "source-note" ? sourceDate.control.value : "",
      }, now());
    }, copy.savedLocally);
  };
  const onRemove = (): void => {
    if (!selected || !doc.defaultView?.confirm(copy.confirmDelete)) return;
    safely(() => {
      notebook = removePreparationEntry(notebook, selected, now());
      selected = notebook.entries[0]?.id ?? "";
      loadSelected();
    }, copy.removed);
  };
  const onFilter = (): void => { offset = 0; draw(); };
  const onPrevious = (): void => { offset = Math.max(0, offset - PAGE); draw(); };
  const onNext = (): void => { offset += PAGE; draw(); };
  const onRefresh = (): void => { draw(); announcement.textContent = copy.reminder; };
  const onExport = (format: "json" | "txt"): void => {
    safely(() => savePreparationExport(createPreparationExport(notebook, assessment(), language, format), doc),
      copy.exportWarning);
  };
  const onJson = (): void => onExport("json");
  const onText = (): void => onExport("txt");
  const onImport = (): void => {
    const file = upload.control.files?.[0];
    if (!file) return;
    if (file.size > PREPARATION_MAX_JSON_BYTES) { announcement.textContent = copy.invalid; return; }
    void file.text().then((content) => {
      if (disposed) return;
      safely(() => {
        const imported = parsePreparationNotebook(content, manifest.regionId);
        notebook = imported;
        sequence = Math.max(sequence, ...notebook.history.map((event) => {
          const result = /^question-(\d+)$/u.exec(event.entryId);
          return result ? Number(result[1]) : 0;
        }));
        selected = notebook.entries[0]?.id ?? "";
        offset = 0;
        loadSelected();
      }, copy.imported);
    }).catch(() => { if (!disposed) announcement.textContent = copy.invalid; });
  };
  const events: readonly [HTMLElement, string, EventListener][] = [
    [toggle, "click", onToggle], [suggested.control, "change", onSuggested],
    [add, "click", onAdd], [selector.control, "change", onSelection],
    [change, "click", onChange], [remove, "click", onRemove],
    [search.control, "input", onFilter], [filter.control, "change", onFilter],
    [topicFilter.control, "change", onFilter], [order.control, "change", onFilter],
    [previous, "click", onPrevious], [next, "click", onNext],
    [refresh, "click", onRefresh], [exportJson, "click", onJson],
    [exportText, "click", onText], [upload.control, "change", onImport],
  ];
  for (const [node, event, listener] of events) node.addEventListener(event, listener);
  const unsubscribe = model.subscribe(() => { if (expanded) draw(); });
  return () => {
    disposed = true;
    unsubscribe();
    for (const [node, event, listener] of events) node.removeEventListener(event, listener);
    section.remove();
  };
}
