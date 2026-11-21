import type { Language, RegionManifest } from "./regionDownload";
import {
  addBriefNote, addBriefStep, createCoordinationBrief, editBriefStep, moveBriefStep,
  pageBriefSteps, parseCoordinationBrief, removeBriefStep, setBriefStatus, summarizeBrief,
  type BriefPriority, type BriefStatus, type BriefTopic, type CoordinationBrief, type StepDraft,
} from "./coordinationBrief";
import {
  COORDINATION_COPY, COORDINATION_FILTERS, COORDINATION_PRIORITIES,
  COORDINATION_SORTS, COORDINATION_STATUSES, COORDINATION_TOPICS, coordinationQuestion,
} from "./coordinationBriefCopy";
import { coordinationBriefFilename, coordinationBriefJson, coordinationBriefText, downloadCoordinationBrief } from "./coordinationBriefExport";
import { compareCoordinationBrief, coordinationDiffText } from "./coordinationBriefDiff";
function node<K extends keyof HTMLElementTagNameMap>(doc: Document, name: K, text?: string): HTMLElementTagNameMap[K] {
  const element = doc.createElement(name);
  if (text !== undefined) element.textContent = text;
  return element;
}
function button(doc: Document, caption: string): HTMLButtonElement {
  const control = node(doc, "button", caption);
  control.type = "button";
  control.style.minHeight = "44px";
  control.style.minWidth = "44px";
  return control;
}
function field<K extends "input" | "textarea">(doc: Document, caption: string, tag: K, maxLength: number): {
  readonly wrapper: HTMLLabelElement; readonly control: HTMLElementTagNameMap[K];
} {
  const wrapper = node(doc, "label", caption);
  const control = node(doc, tag);
  control.maxLength = maxLength;
  control.style.minHeight = "44px";
  wrapper.append(control);
  return { wrapper, control };
}
function options<T extends string>(doc: Document, caption: string, values: Record<T, string>): {
  readonly wrapper: HTMLLabelElement; readonly control: HTMLSelectElement;
} {
  const wrapper = node(doc, "label", caption);
  const control = node(doc, "select");
  control.style.minHeight = "44px";
  for (const [value, label] of Object.entries(values) as Array<[T, string]>) {
    const choice = node(doc, "option", label);
    choice.value = value;
    control.append(choice);
  }
  wrapper.append(control);
  return { wrapper, control };
}
function dateToday(): string { return new Date().toISOString().slice(0, 10); }
/**
 * A standalone, in-memory view. No timers, accounts, network, storage writes, or pack mutation.
 * Unmount releases every handler, including handlers added for paginated rows.
 */
export function mountOfflineCoordinationBrief(root: HTMLElement, manifest: RegionManifest, language: Language): () => void {
  const doc = root.ownerDocument;
  const c = COORDINATION_COPY[language];
  const section = node(doc, "section");
  section.className = "panel stack";
  section.setAttribute("aria-label", c.title);
  const heading = node(doc, "h3", c.title);
  const intro = node(doc, "p", c.intro);
  const caution = node(doc, "p", c.caution);
  const privacy = node(doc, "p", c.local);
  const announcement = node(doc, "p", c.empty);
  announcement.setAttribute("role", "status");
  announcement.setAttribute("aria-live", "polite");
  const regionId = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/u.test(manifest.regionId) ? manifest.regionId : "local-region";
  let brief: CoordinationBrief = createCoordinationBrief(regionId, regionId, dateToday());
  let nonce = 0;
  let selected: string | null = null;
  let pendingImport: CoordinationBrief | null = null;
  let offset = 0;
  let disposed = false;
  const listeners: Array<() => void> = [];
  const rowListeners: Array<() => void> = [];
  const listen = (target: HTMLElement, type: string, callback: EventListener): void => {
    target.addEventListener(type, callback);
    listeners.push(() => target.removeEventListener(type, callback));
  };
  const listenRow = (target: HTMLElement, type: string, callback: EventListener): void => {
    target.addEventListener(type, callback);
    rowListeners.push(() => target.removeEventListener(type, callback));
  };
  const clearRowListeners = (): void => { for (const clean of rowListeners) clean(); rowListeners.length = 0; };
  function nextId(prefix: string): string {
    let id: string;
    do {
      nonce += 1;
      id = `${prefix}-${nonce}`;
    } while (brief.steps.some((step) => step.id === id) || brief.events.some((event) => event.id === id));
    return id;
  }
  function atNow(): string {
    const current = new Date().toISOString();
    const previous = brief.events[brief.events.length - 1]?.at;
    return previous && current < previous ? previous : current;
  }
  const info = node(doc, "p", c.effect);
  const title = field(doc, c.brief, "input", 140);
  title.control.value = regionId;
  const context = field(doc, c.context, "textarea", 2000);
  const label = field(doc, c.name, "input", 140);
  const question = field(doc, c.question, "textarea", 1000);
  const fallback = field(doc, c.fallback, "textarea", 1000);
  const contact = field(doc, c.contact, "input", 160);
  const note = field(doc, c.note, "textarea", 2000);
  const source = field(doc, c.source, "input", 180);
  const licence = field(doc, c.licence, "input", 160);
  const sourceDate = field(doc, c.sourceDate, "input", 10);
  sourceDate.control.placeholder = "YYYY-MM-DD";
  const topic = options<BriefTopic>(doc, c.topic, COORDINATION_TOPICS[language]);
  const priority = options<BriefPriority>(doc, c.priority, COORDINATION_PRIORITIES[language]);
  const save = button(doc, c.addStep);
  const cancel = button(doc, c.cancel);
  const remove = button(doc, c.remove);
  const moveUp = button(doc, c.moveUp);
  const moveDown = button(doc, c.moveDown);
  const editActions = node(doc, "div");
  editActions.className = "button-row";
  editActions.append(save, cancel, remove, moveUp, moveDown);
  const entry = node(doc, "div");
  entry.className = "stack";
  entry.append(title.wrapper, context.wrapper, label.wrapper, topic.wrapper, priority.wrapper,
    question.wrapper, fallback.wrapper, contact.wrapper, note.wrapper, source.wrapper, licence.wrapper,
    sourceDate.wrapper, editActions);
  const statusChoice = options<BriefStatus>(doc, c.changes, COORDINATION_STATUSES[language]);
  const setStatus = button(doc, c.status);
  const appendText = field(doc, c.appendNote, "textarea", 1000);
  const appendButton = button(doc, c.addNote);
  const followUp = node(doc, "div");
  followUp.className = "stack";
  followUp.append(statusChoice.wrapper, setStatus, appendText.wrapper, appendButton);
  const search = field(doc, c.search, "input", 180);
  const filter = options(doc, c.filter, COORDINATION_FILTERS[language]);
  const sort = options(doc, c.sort, COORDINATION_SORTS[language]);
  const previous = button(doc, c.previous);
  const next = button(doc, c.next);
  const summary = node(doc, "p");
  const list = node(doc, "ol");
  const pager = node(doc, "div");
  pager.className = "button-row";
  pager.append(previous, next);
  const json = button(doc, c.saveJson);
  const plain = button(doc, c.saveText);
  const importButton = button(doc, c.importJson);
  const importField = node(doc, "input");
  importField.type = "file";
  importField.accept = ".json,application/json";
  importField.style.minHeight = "44px";
  const importLabel = node(doc, "label", c.importWarning);
  importLabel.append(importField);
  const clear = button(doc, c.clear);
  const importPreview = node(doc, "section");
  importPreview.className = "stack";
  importPreview.hidden = true;
  importPreview.setAttribute("aria-label", c.importPreview);
  const previewText = node(doc, "p");
  previewText.setAttribute("role", "status");
  previewText.setAttribute("aria-live", "polite");
  const applyImport = button(doc, c.applyImport);
  const cancelImport = button(doc, c.cancelImport);
  importPreview.append(node(doc, "h4", c.importPreview), previewText, applyImport, cancelImport);
  const exportActions = node(doc, "div");
  exportActions.className = "button-row";
  exportActions.append(json, plain, importButton, clear);
  const history = node(doc, "details");
  const historyTitle = node(doc, "summary", c.history);
  historyTitle.style.minHeight = "44px";
  const historyList = node(doc, "ol");
  history.append(historyTitle, historyList);
  const controls = node(doc, "div");
  controls.className = "stack";
  controls.append(search.wrapper, filter.wrapper, sort.wrapper, summary, list, pager);
  section.append(heading, intro, caution, privacy, announcement, entry, followUp, controls,
    importLabel, importPreview, exportActions, history, info);
  root.append(section);
  const draft = (): StepDraft => {
    const hasSource = source.control.value.trim() || licence.control.value.trim() || sourceDate.control.value.trim();
    return {
      label: label.control.value.trim(), topic: topic.control.value as BriefTopic,
      priority: priority.control.value as BriefPriority,
      question: question.control.value.trim(), fallbackQuestion: fallback.control.value.trim(),
      contactMethod: contact.control.value.trim(), note: note.control.value.trim(),
      provenance: hasSource ? { source: source.control.value.trim(), licence: licence.control.value.trim(),
        date: sourceDate.control.value.trim() } : null,
    };
  };
  const clearEditor = (): void => {
    selected = null;
    for (const input of [label.control, question.control, fallback.control, contact.control,
      note.control, source.control, licence.control, sourceDate.control]) input.value = "";
    topic.control.value = "arrival";
    priority.control.value = "essential";
    statusChoice.control.value = "UNKNOWN";
    save.textContent = c.addStep;
  };
  const showSelected = (id: string): void => {
    const item = brief.steps.find((step) => step.id === id);
    if (!item) return;
    selected = id;
    label.control.value = item.label;
    question.control.value = item.question;
    fallback.control.value = item.fallbackQuestion;
    contact.control.value = item.contactMethod;
    note.control.value = item.note;
    topic.control.value = item.topic;
    priority.control.value = item.priority;
    source.control.value = item.provenance?.source ?? "";
    licence.control.value = item.provenance?.licence ?? "";
    sourceDate.control.value = item.provenance?.date ?? "";
    statusChoice.control.value = item.status;
    save.textContent = c.editStep;
    announcement.textContent = `${c.opened}: ${item.label}`;
  };
  const update = (): void => {
    if (disposed) return;
    clearRowListeners();
    const stats = summarizeBrief(brief);
    summary.textContent = `${c.count}: ${stats.total}. ${c.unanswered}: ${stats.unanswered}. ${c.replies}: ${stats.replies}. ${c.essentials}: ${stats.essential}. ${c.physicalUnknown}`;
    const options = { search: search.control.value, filter: filter.control.value as keyof typeof COORDINATION_FILTERS.en,
      sort: sort.control.value as keyof typeof COORDINATION_SORTS.en, offset, limit: 10 };
    const page = pageBriefSteps(brief, options);
    if (offset >= page.total && offset > 0) {
      offset = Math.max(0, Math.floor(Math.max(0, page.total - 1) / 10) * 10);
      update();
      return;
    }
    previous.disabled = !page.previous;
    next.disabled = !page.next;
    list.replaceChildren();
    if (page.total === 0) list.append(node(doc, "li", brief.steps.length ? c.noMatches : c.empty));
    for (const item of page.rows) {
      const row = node(doc, "li");
      const name = node(doc, "span", `${item.order + 1}. ${item.label} — ${COORDINATION_STATUSES[language][item.status]}. ${c.physicalUnknown}`);
      const edit = button(doc, `${c.edit}: ${item.label}`);
      listenRow(edit, "click", () => showSelected(item.id));
      row.append(name, edit);
      list.append(row);
    }
    historyList.replaceChildren();
    for (const event of brief.events.slice(-12)) {
      historyList.append(node(doc, "li", `${event.at}: ${event.stepId} — ${event.kind}`));
    }
    const chosen = brief.steps.find((step) => step.id === selected);
    remove.disabled = chosen === undefined;
    moveUp.disabled = chosen === undefined || chosen.order === 0;
    moveDown.disabled = chosen === undefined || chosen.order >= brief.steps.length - 1;
    setStatus.disabled = chosen === undefined;
    appendButton.disabled = chosen === undefined;
  };
  const apply = (operation: () => CoordinationBrief): void => {
    try { brief = operation(); announcement.textContent = c.saved; update(); }
    catch { announcement.textContent = c.failure; }
  };
  listen(topic.control, "change", () => {
    if (!selected && !question.control.value) question.control.value = coordinationQuestion(topic.control.value as BriefTopic, language);
  });
  listen(save, "click", () => apply(() => {
    const d = draft();
    if (selected) return editBriefStep(brief, selected, nextId("event"), atNow(), d);
    const newBook = addBriefStep(brief, nextId("step"), nextId("event"), atNow(), d);
    clearEditor();
    return newBook;
  }));
  listen(cancel, "click", () => { clearEditor(); announcement.textContent = c.closed; update(); });
  listen(remove, "click", () => {
    const id = selected;
    if (!id) return;
    apply(() => removeBriefStep(brief, id, nextId("event"), atNow()));
    clearEditor(); update();
  });
  for (const [control, delta] of [[moveUp, -1], [moveDown, 1]] as const) {
    listen(control, "click", () => {
      const item = brief.steps.find((step) => step.id === selected);
      if (!item) return;
      apply(() => moveBriefStep(brief, item.id, item.order + delta, nextId("event"), atNow()));
    });
  }
  listen(setStatus, "click", () => {
    const id = selected;
    if (!id) return;
    apply(() => setBriefStatus(brief, id, nextId("event"), atNow(), statusChoice.control.value as BriefStatus));
  });
  listen(appendButton, "click", () => {
    const id = selected;
    if (!id) return;
    apply(() => addBriefNote(brief, id, nextId("event"), atNow(), appendText.control.value));
    appendText.control.value = "";
  });
  const searchChange = (): void => { offset = 0; update(); };
  listen(search.control, "input", searchChange);
  listen(filter.control, "change", searchChange);
  listen(sort.control, "change", searchChange);
  listen(previous, "click", () => { offset = Math.max(0, offset - 10); update(); });
  listen(next, "click", () => { offset += 10; update(); });
  listen(json, "click", () => {
    try { downloadCoordinationBrief(doc, coordinationBriefJson(brief), coordinationBriefFilename(brief.regionId, brief.date, "json"), "json"); }
    catch { announcement.textContent = c.failure; }
  });
  listen(plain, "click", () => {
    try { downloadCoordinationBrief(doc, coordinationBriefText(brief, language), coordinationBriefFilename(brief.regionId, brief.date, "txt"), "txt"); }
    catch { announcement.textContent = c.failure; }
  });
  listen(importButton, "click", () => importField.click());
  const importChange = (): void => {
    const file = importField.files?.item(0);
    if (!file || file.size > 360_000) { announcement.textContent = c.invalid; return; }
    void file.text().then((contents) => {
      if (disposed) return;
      const candidate = parseCoordinationBrief(contents);
      if (candidate.regionId !== brief.regionId) throw new TypeError("Region mismatch");
      const differences = compareCoordinationBrief(brief, candidate);
      if (differences.status === "UNKNOWN") throw new TypeError("Region mismatch");
      pendingImport = candidate;
      previewText.textContent = `${c.importPending} ${coordinationDiffText(differences, language)}`;
      importPreview.hidden = false;
      announcement.textContent = c.importPreview;
    }).catch(() => { if (!disposed) announcement.textContent = c.invalid; }).finally(() => { importField.value = ""; });
  };
  listen(importField, "change", importChange);
  listen(applyImport, "click", () => {
    if (pendingImport === null) return;
    brief = pendingImport;
    pendingImport = null;
    importPreview.hidden = true;
    selected = null;
    offset = 0;
    nonce = Math.max(nonce, brief.steps.length + brief.events.length) + 1;
    title.control.value = brief.title;
    context.control.value = brief.context;
    clearEditor();
    announcement.textContent = c.imported;
    update();
  });
  listen(cancelImport, "click", () => {
    pendingImport = null;
    importPreview.hidden = true;
    announcement.textContent = c.closed;
  });
  listen(clear, "click", () => {
    if (!doc.defaultView?.confirm(c.confirmation)) return;
    pendingImport = null;
    importPreview.hidden = true;
    brief = createCoordinationBrief(regionId, title.control.value.trim() || regionId, dateToday(), context.control.value);
    nonce = 0;
    clearEditor();
    offset = 0;
    announcement.textContent = c.saved;
    update();
  });
  update();
  return () => {
    disposed = true;
    clearRowListeners();
    for (const off of listeners) off();
    section.remove();
  };
}
