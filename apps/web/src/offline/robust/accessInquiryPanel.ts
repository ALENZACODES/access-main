import { createOfflineAction } from "./accessibilityGuard";
import type { DashboardModel } from "./offlineDashboard";
import type { Language, RegionManifest } from "./regionDownload";
import {
  addInquiryEvent, addInquiryPlace, addInquiryQuestion, addTemplateQuestions,
  emptyInquiryBook, inquiryPage, inquirySummary, INQUIRY_TEMPLATES, INQUIRY_TOPICS,
  updateInquiryQuestion, type InquiryBook, type InquiryChannel, type InquiryImportance,
  type InquiryProgress, type InquiryTopic, type InquiryFilter, type InquirySort,
} from "./accessInquiry";
import { INQUIRY_CHANNEL_LABELS, INQUIRY_COPY, INQUIRY_FILTER_LABELS,
  INQUIRY_IMPORTANCE_LABELS, INQUIRY_PROGRESS_LABELS, INQUIRY_SORT_LABELS,
  INQUIRY_TOPIC_LABELS, INQUIRY_TEMPLATE_FR } from "./accessInquiryCopy";
import { decodeInquiryExport, saveInquiryExport } from "./accessInquiryExport";

const PAGE = 12;
function node<K extends keyof HTMLElementTagNameMap>(doc: Document, name: K,
  value?: string): HTMLElementTagNameMap[K] {
  const item = doc.createElement(name);
  if (value !== undefined) item.textContent = value;
  return item;
}
function button(doc: Document, value: string): HTMLButtonElement {
  return createOfflineAction(doc, value);
}
function field(doc: Document, id: string, title: string, element: HTMLInputElement | HTMLTextAreaElement |
  HTMLSelectElement): HTMLLabelElement {
  const label = node(doc, "label", title);
  element.id = id;
  element.style.minHeight = "44px";
  element.style.minWidth = "44px";
  label.htmlFor = id;
  label.append(element);
  return label;
}
function select<K extends string>(doc: Document, options: readonly K[], labels: Readonly<Record<K, string>>): HTMLSelectElement {
  const input = node(doc, "select");
  for (const value of options) {
    const option = node(doc, "option", labels[value]);
    option.value = value;
    input.append(option);
  }
  return input;
}
function definition(doc: Document, title: string, value: string): HTMLDivElement {
  const wrapper = node(doc, "div");
  const term = node(doc, "dt", title);
  const description = node(doc, "dd", value);
  description.style.marginInlineStart = "1em";
  wrapper.append(term, description);
  return wrapper;
}
/** Explicitly opened and user-directed; never stores private replies in background. */
export function mountAccessInquiry(root: HTMLElement, manifest: RegionManifest,
  model: DashboardModel, language: Language): () => void {
  const doc = root.ownerDocument;
  const text = INQUIRY_COPY[language];
  const token = manifest.regionId.replace(/[^a-zA-Z0-9_-]/gu, "-");
  const panel = node(doc, "section");
  panel.setAttribute("aria-label", text.title);
  const heading = node(doc, "h3", text.title);
  const introduction = node(doc, "p", text.intro);
  const toggle = button(doc, text.open);
  const content = node(doc, "div");
  content.id = `access-inquiry-${token}`;
  content.hidden = true;
  toggle.setAttribute("aria-controls", content.id);
  toggle.setAttribute("aria-expanded", "false");
  const message = node(doc, "p", text.noPlaces);
  message.setAttribute("role", "status");
  message.setAttribute("aria-live", "polite");
  message.setAttribute("aria-atomic", "true");
  const notice = node(doc, "p", text.private);
  const caution = node(doc, "p", text.reason);
  const summary = node(doc, "dl");

  const placeName = node(doc, "input");
  placeName.maxLength = 180;
  const placeArea = node(doc, "input");
  placeArea.maxLength = 180;
  const plannedDate = node(doc, "input");
  plannedDate.type = "date";
  const addPlace = button(doc, text.addPlace);
  const places = node(doc, "select");
  places.style.minHeight = "44px";
  places.style.minWidth = "44px";
  const placeControls = node(doc, "div");
  placeControls.append(field(doc, `${token}-place-name`, text.place, placeName),
    field(doc, `${token}-area`, text.area, placeArea),
    field(doc, `${token}-date`, text.date, plannedDate), addPlace,
    field(doc, `${token}-places`, text.selectPlace, places));

  const prompt = node(doc, "textarea");
  prompt.maxLength = 300;
  prompt.rows = 2;
  const topics = select(doc, INQUIRY_TOPICS, INQUIRY_TOPIC_LABELS[language]);
  const priority = select<InquiryImportance>(doc, ["standard", "important", "essential"],
    INQUIRY_IMPORTANCE_LABELS[language]);
  const addQuestion = button(doc, text.addQuestion);
  const addSuggestions = button(doc, text.addTemplates);
  const questionControls = node(doc, "div");
  questionControls.append(field(doc, `${token}-question`, text.question, prompt),
    field(doc, `${token}-topic`, text.topic, topics),
    field(doc, `${token}-priority`, text.importance, priority), addQuestion, addSuggestions,
    node(doc, "p", text.templateHelp));

  const questions = node(doc, "select");
  questions.style.minHeight = "44px";
  const progress = select<InquiryProgress>(doc, ["to-ask", "asked", "reply-noted", "follow-up"],
    INQUIRY_PROGRESS_LABELS[language]);
  const changeProgress = button(doc, text.saveChanges);
  const contactMethod = select<InquiryChannel>(doc, ["phone", "email", "in-person", "web", "other"],
    INQUIRY_CHANNEL_LABELS[language]);
  const note = node(doc, "textarea");
  note.maxLength = 1200;
  note.rows = 3;
  const sourceDate = node(doc, "input");
  sourceDate.type = "date";
  const addNote = button(doc, text.addNote);
  const responseControls = node(doc, "div");
  responseControls.append(field(doc, `${token}-question-choice`, text.selectQuestion, questions),
    field(doc, `${token}-progress`, text.progress, progress), changeProgress,
    field(doc, `${token}-method`, text.channel, contactMethod),
    field(doc, `${token}-note`, text.note, note),
    field(doc, `${token}-source-date`, text.sourceDate, sourceDate), addNote);

  const filter = select<InquiryFilter>(doc, ["all", "outstanding", "reply-noted", "essential"],
    INQUIRY_FILTER_LABELS[language]);
  const order = select<InquirySort>(doc, ["listed", "topic", "priority", "recent"],
    INQUIRY_SORT_LABELS[language]);
  const search = node(doc, "input");
  search.type = "search";
  search.maxLength = 150;
  const results = node(doc, "ol");
  const navigation = node(doc, "nav");
  navigation.setAttribute("aria-label", text.page);
  const previous = button(doc, text.previous);
  const next = button(doc, text.next);
  const position = node(doc, "span");
  navigation.append(previous, position, next);
  const reviewControls = node(doc, "div");
  reviewControls.append(field(doc, `${token}-filter`, text.filter, filter),
    field(doc, `${token}-sort`, text.sort, order),
    field(doc, `${token}-search`, text.search, search), results, navigation);

  const exportJson = button(doc, text.exportJson);
  const exportText = button(doc, text.exportText);
  const upload = node(doc, "input");
  upload.type = "file";
  upload.accept = ".json,application/json";
  upload.style.minHeight = "44px";
  const exportControls = node(doc, "div");
  exportControls.append(exportJson, exportText, field(doc, `${token}-import`, text.importJson, upload));
  content.append(message, notice, summary, placeControls, questionControls,
    responseControls, reviewControls, exportControls, caution, node(doc, "p", text.hint));
  panel.append(heading, introduction, toggle, content);
  root.append(panel);

  let book: InquiryBook = emptyInquiryBook();
  let expanded = false;
  let disposed = false;
  let offset = 0;
  let sequence = 0;
  const now = (): string => new Date().toISOString();
  const makeId = (prefix: string): string => `${prefix}-${++sequence}`;
  const putOptions = (selector: HTMLSelectElement, items: readonly { id: string; label: string }[]): void => {
    const chosen = selector.value;
    selector.replaceChildren();
    for (const item of items) {
      const option = node(doc, "option", item.label);
      option.value = item.id;
      selector.append(option);
    }
    if (items.some((item) => item.id === chosen)) selector.value = chosen;
  };
  const render = (): void => {
    if (disposed || !expanded) return;
    putOptions(places, book.places.map((place) => ({ id: place.id, label: place.label })));
    putOptions(questions, book.questions.filter((question) => question.placeId === places.value)
      .map((question) => ({ id: question.id, label: question.prompt })));
    const totals = inquirySummary(book);
    summary.replaceChildren(
      definition(doc, text.totalPlaces, String(totals.places)),
      definition(doc, text.active, String(totals.questions)),
      definition(doc, text.outstanding, String(totals.questions - totals.replies)),
      definition(doc, text.replies, String(totals.replies)),
      definition(doc, text.essential, String(totals.essentialOutstanding)),
      definition(doc, text.condition, "UNKNOWN"),
    );
    const current = inquiryPage(book, { placeId: places.value, filter: filter.value as InquiryFilter,
      sort: order.value as InquirySort, search: search.value, offset, limit: PAGE });
    results.replaceChildren();
    for (const entry of current.rows) {
      const row = node(doc, "li");
      row.append(node(doc, "strong", entry.question.prompt));
      const details = node(doc, "dl");
      details.append(
        definition(doc, text.topic, INQUIRY_TOPIC_LABELS[language][entry.question.topic]),
        definition(doc, text.importance, INQUIRY_IMPORTANCE_LABELS[language][entry.question.importance]),
        definition(doc, text.progress, INQUIRY_PROGRESS_LABELS[language][entry.question.progress]),
        definition(doc, text.condition, "UNKNOWN"),
        definition(doc, text.lastNote, entry.mostRecent?.note ?? "UNKNOWN"),
        definition(doc, text.source, entry.mostRecent?.sourceDate ?? "UNKNOWN"),
      );
      row.append(details);
      results.append(row);
    }
    if (!current.rows.length) results.append(node(doc, "li", book.places.length ? text.noQuestions : text.noPlaces));
    previous.disabled = !current.previous;
    next.disabled = !current.next;
    position.textContent = `${current.total === 0 ? 0 : offset + 1}–${Math.min(offset + PAGE, current.total)} / ${current.total}`;
    addQuestion.disabled = book.places.length === 0;
    addSuggestions.disabled = book.places.length === 0;
    changeProgress.disabled = book.questions.length === 0;
    addNote.disabled = book.questions.length === 0;
    exportJson.disabled = book.questions.length === 0;
    exportText.disabled = book.questions.length === 0;
  };
  const act = (run: () => void, success: string): void => {
    try { run(); message.textContent = success; render(); }
    catch { message.textContent = text.invalidAction; }
  };
  const onToggle = (): void => {
    expanded = !expanded;
    content.hidden = !expanded;
    toggle.textContent = expanded ? text.close : text.open;
    toggle.setAttribute("aria-expanded", String(expanded));
    render();
  };
  const onAddPlace = (): void => act(() => {
    const id = makeId("place");
    book = addInquiryPlace(book, { id, label: placeName.value.trim(), area: placeArea.value.trim(),
      plannedDate: plannedDate.value || null, createdAt: now(), updatedAt: now() });
    placeName.value = "";
    placeArea.value = "";
    plannedDate.value = "";
    places.value = id;
    offset = 0;
  }, text.saved);
  const onAddQuestion = (): void => act(() => {
    book = addInquiryQuestion(book, {
      id: makeId("question"), placeId: places.value,
      topic: topics.value as InquiryTopic, prompt: prompt.value.trim(),
      importance: priority.value as InquiryImportance, progress: "to-ask", condition: "UNKNOWN",
      createdAt: now(), updatedAt: now(),
    });
    prompt.value = "";
    offset = 0;
  }, text.saved);
  const onAddSuggestions = (): void => act(() => {
    const used = new Set(book.questions.filter((question) => question.placeId === places.value)
      .map((question) => question.prompt));
    const ids = INQUIRY_TEMPLATES.filter((template) => !used.has(template.prompt)).slice(0, 6)
      .map((template) => template.id);
    if (language === "en") {
      book = addTemplateQuestions(book, places.value, ids, now());
    } else {
      for (const id of ids) {
        const template = INQUIRY_TEMPLATES.find((item) => item.id === id);
        if (!template) continue;
        book = addInquiryQuestion(book, {
          id: `${places.value}_${id}`.slice(0, 96), placeId: places.value,
          topic: template.topic, prompt: INQUIRY_TEMPLATE_FR[id] ?? template.prompt,
          importance: template.importance, progress: "to-ask", condition: "UNKNOWN",
          createdAt: now(), updatedAt: now(),
        });
      }
    }
  }, text.saved);
  const onProgress = (): void => act(() => {
    book = updateInquiryQuestion(book, questions.value, { progress: progress.value as InquiryProgress }, now());
  }, text.saved);
  const onNote = (): void => act(() => {
    book = addInquiryEvent(book, { id: makeId("entry"), questionId: questions.value,
      at: now(), channel: contactMethod.value as InquiryChannel, note: note.value.trim(),
      sourceDate: sourceDate.value || null });
    note.value = "";
    sourceDate.value = "";
  }, text.saved);
  const onPage = (): void => { offset = 0; render(); };
  const onPrevious = (): void => { offset = Math.max(0, offset - PAGE); render(); };
  const onNext = (): void => { offset += PAGE; render(); };
  const onJson = (): void => act(() => saveInquiryExport(book, language, "json", doc, now()), text.saved);
  const onText = (): void => act(() => saveInquiryExport(book, language, "txt", doc, now()), text.saved);
  const onImport = (): void => {
    const file = upload.files?.[0];
    if (!file) { message.textContent = text.noFile; return; }
    if (file.size > 524288) { message.textContent = text.invalid; return; }
    void file.text().then((value) => {
      if (disposed) return;
      act(() => { book = decodeInquiryExport(value); offset = 0; }, text.imported);
    }).catch(() => { if (!disposed) message.textContent = text.invalid; });
  };
  const listeners: readonly [HTMLElement, string, EventListener][] = [
    [toggle, "click", onToggle], [addPlace, "click", onAddPlace],
    [addQuestion, "click", onAddQuestion], [addSuggestions, "click", onAddSuggestions],
    [changeProgress, "click", onProgress], [addNote, "click", onNote],
    [places, "change", onPage], [filter, "change", onPage], [order, "change", onPage],
    [search, "input", onPage], [previous, "click", onPrevious], [next, "click", onNext],
    [exportJson, "click", onJson], [exportText, "click", onText], [upload, "change", onImport],
  ];
  for (const [element, event, callback] of listeners) element.addEventListener(event, callback);
  // The dashboard is read only here; opening this tool never schedules an inventory check.
  const unsubscribe = model.subscribe(() => { if (expanded && !disposed) render(); });
  return () => {
    disposed = true;
    unsubscribe();
    for (const [element, event, callback] of listeners) element.removeEventListener(event, callback);
    panel.remove();
  };
}
