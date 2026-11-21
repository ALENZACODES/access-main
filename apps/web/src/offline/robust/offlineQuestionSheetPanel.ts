import type { Language, RegionManifest } from "./regionDownload";
import type { DashboardModel } from "./offlineDashboard";
import {
  SHEET_CATEGORIES, SHEET_PAGE_SIZE, SHEET_PRIORITIES, addSheetItem, assessQuestionSheet,
  changeSheetTitle, emptyQuestionSheet, moveSheetItem, pageQuestionSheet, parseQuestionSheet,
  removeSheetItem, summarizeQuestionSheet, updateSheetItem,
  type QuestionSheet, type SheetCategory, type SheetFilter, type SheetPriority, type SheetReply, type SheetSort,
} from "./offlineQuestionSheet";
import { questionSheetCopy, SHEET_PRIORITY_COPY, SHEET_REPLY_COPY, SHEET_TOPIC_COPY } from "./offlineQuestionSheetCopy";
import { createQuestionBackup, createQuestionHandout, makePrintHandout, saveQuestionHandout } from "./offlineQuestionSheetExport";
import { compareQuestionSheets, questionSheetDiffText } from "./offlineQuestionSheetDiff";
import { OFFLINE_QUESTION_TEMPLATES, questionTemplate } from "./offlineQuestionSheetTemplates";

function node<K extends keyof HTMLElementTagNameMap>(doc: Document, tag: K, text?: string): HTMLElementTagNameMap[K] {
  const item = doc.createElement(tag);
  if (text !== undefined) item.textContent = text;
  return item;
}
function action(doc: Document, text: string): HTMLButtonElement {
  const b = node(doc, "button", text);
  b.type = "button";
  b.style.minHeight = "44px";
  b.style.minWidth = "44px";
  return b;
}
function labelControl<T extends HTMLElement>(doc: Document, label: string, element: T): HTMLLabelElement {
  const wrap = node(doc, "label");
  const description = node(doc, "span", label);
  description.style.display = "block";
  wrap.append(description, element);
  return wrap;
}
function textInput(doc: Document, placeholder = "", maxLength = 400): HTMLInputElement {
  const input = node(doc, "input");
  input.type = "text";
  input.maxLength = maxLength;
  input.placeholder = placeholder;
  input.style.minHeight = "44px";
  input.style.minWidth = "44px";
  return input;
}
function menu<T extends string>(doc: Document, entries: readonly T[], labelOf: (entry: T) => string): HTMLSelectElement {
  const select = node(doc, "select");
  select.style.minHeight = "44px";
  select.style.minWidth = "44px";
  for (const value of entries) {
    const option = node(doc, "option", labelOf(value));
    option.value = value;
    select.append(option);
  }
  return select;
}
function memo(doc: Document, maxLength: number): HTMLTextAreaElement {
  const textarea = node(doc, "textarea");
  textarea.maxLength = maxLength;
  textarea.rows = 3;
  textarea.style.minHeight = "88px";
  return textarea;
}

/** Explicitly mounted after a user action. Never edits the region manifest or stored cells. */
export function mountOfflineQuestionSheet(root: HTMLElement, manifest: RegionManifest | null, model: DashboardModel | null, language: Language): () => void {
  const doc = root.ownerDocument;
  const c = questionSheetCopy(language);
  const colon = language === "fr" ? "\u00a0: " : ": ";
  const section = node(doc, "section");
  section.className = "panel stack";
  section.setAttribute("aria-label", c.title);
  const heading = node(doc, "h3", c.title);
  const intro = node(doc, "p", c.intro);
  const privacy = node(doc, "p", c.privacy);
  const status = node(doc, "p");
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  const title = textInput(doc);
  title.value = c.title;
  const saveTitle = action(doc, c.update);
  const template = menu(doc, ["", ...OFFLINE_QUESTION_TEMPLATES.map((item) => item.id)],
    (id) => id === "" ? (language === "fr" ? "Choisir une question suggérée" : "Choose a suggested question") :
      OFFLINE_QUESTION_TEMPLATES.find((item) => item.id === id)?.[language] ?? "UNKNOWN");
  const question = memo(doc, 400);
  const category = menu(doc, SHEET_CATEGORIES, (value) => SHEET_TOPIC_COPY[language][value]);
  const priority = menu(doc, SHEET_PRIORITIES, (value) => SHEET_PRIORITY_COPY[language][value]);
  const cellOptions = ["", ...(manifest?.cells ?? []).map((item) => item.id)];
  const cell = menu(doc, cellOptions, (value) => value || c.noCell);
  const note = memo(doc, 1200);
  const add = action(doc, c.add);
  const edit = node(doc, "fieldset");
  edit.append(node(doc, "legend", c.questionList), labelControl(doc, c.name, title), saveTitle,
    labelControl(doc, c.question, question), labelControl(doc, c.question, template), labelControl(doc, c.category, category),
    labelControl(doc, c.priority, priority), labelControl(doc, c.cell, cell),
    labelControl(doc, c.note, note), add);
  const search = textInput(doc);
  const filterOptions: readonly SheetFilter[] = ["all", "UNKNOWN", "saved", "needs-reply", "essential"];
  const filterLabels: Record<SheetFilter, string> = { all: c.choiceAll, UNKNOWN: c.choiceUnknown, saved: c.choiceSaved,
    "needs-reply": c.choiceNeeds, essential: c.choiceEssential };
  const filter = menu(doc, filterOptions, (value) => filterLabels[value]);
  const sortOptions: readonly SheetSort[] = ["ordered", "priority", "category", "cell"];
  const sortLabels: Record<SheetSort, string> = { ordered: c.sortOrdered, priority: c.sortPriority, category: c.sortCategory, cell: c.sortCell };
  const sort = menu(doc, sortOptions, (value) => sortLabels[value]);
  const controls = node(doc, "div");
  controls.className = "stack";
  controls.append(labelControl(doc, c.search, search), labelControl(doc, c.filter, filter), labelControl(doc, c.sort, sort));
  const summary = node(doc, "p");
  const list = node(doc, "ol");
  const pagination = node(doc, "nav");
  pagination.setAttribute("aria-label", c.questionList);
  const previous = action(doc, c.previous);
  const next = action(doc, c.next);
  const pageInfo = node(doc, "span");
  pagination.append(previous, pageInfo, next);
  const exportPanel = node(doc, "fieldset");
  exportPanel.append(node(doc, "legend", c.format));
  const includeNotes = node(doc, "input");
  includeNotes.type = "checkbox";
  includeNotes.style.minHeight = "44px";
  includeNotes.style.minWidth = "44px";
  const textButton = action(doc, c.exportText);
  const jsonButton = action(doc, c.exportJson);
  const printButton = action(doc, c.exportPrint);
  exportPanel.append(labelControl(doc, c.includeNotes, includeNotes), textButton, jsonButton, printButton);
  const printHolder = node(doc, "div");
  printHolder.hidden = true;
  const printStyle = node(doc, "style");
  printStyle.textContent = "@media print { body * { visibility: hidden !important; } .offline-question-sheet-print, .offline-question-sheet-print * { visibility: visible !important; } .offline-question-sheet-print { position: absolute; top: 0; left: 0; width: 100%; color: black; background: white; } }";
  const importPanel = node(doc, "fieldset");
  importPanel.append(node(doc, "legend", c.importJson));
  const jsonArea = memo(doc, 131072);
  const previewButton = action(doc, c.importPreview);
  const applyButton = action(doc, c.applyImport);
  const cancelButton = action(doc, c.cancelImport);
  const preview = node(doc, "pre", c.confirm);
  preview.style.whiteSpace = "pre-wrap";
  preview.hidden = true;
  applyButton.disabled = true;
  importPanel.append(labelControl(doc, c.importJson, jsonArea), previewButton, preview, applyButton, cancelButton);
  section.append(printStyle, heading, intro, privacy, edit, controls, summary, list, pagination, exportPanel, importPanel, printHolder, status);
  root.append(section);
  let disposed = false;
  let sheet: QuestionSheet = emptyQuestionSheet(manifest, c.title);
  let pending: QuestionSheet | null = null;
  let offset = 0;
  const permanentListeners: Array<() => void> = [];
  let rowListeners: Array<() => void> = [];
  const listen = (element: HTMLElement, type: string, callback: EventListener, container = permanentListeners): void => {
    element.addEventListener(type, callback);
    container.push(() => element.removeEventListener(type, callback));
  };
  const clearRows = (): void => { for (const stop of rowListeners) stop(); rowListeners = []; list.replaceChildren(); };
  const update = (fn: () => QuestionSheet): void => {
    try { sheet = fn(); pending = null; applyButton.disabled = true; preview.hidden = true; status.textContent = c.changed; draw(); }
    catch { status.textContent = c.failed; }
  };
  const draw = (): void => {
    if (disposed) return;
    clearRows();
    const rows = assessQuestionSheet(sheet, manifest, model?.getState().inventory ?? null);
    const total = summarizeQuestionSheet(rows);
    summary.textContent = `${c.totals}${colon}${total.total}. ${c.unanswered}${colon}${total.unanswered}. ${c.recorded}${colon}${total.repliesNoted}. ${c.physical}${colon}UNKNOWN.`;
    const result = pageQuestionSheet(rows, { filter: filter.value as SheetFilter, sort: sort.value as SheetSort, query: search.value, offset, limit: SHEET_PAGE_SIZE });
    if (offset >= result.total && offset > 0) { offset = 0; draw(); return; }
    if (!result.rows.length) list.append(node(doc, "li", sheet.items.length ? c.noRows : c.empty));
    for (const row of result.rows) {
      const item = node(doc, "li");
      item.className = "stack";
      const titleNode = node(doc, "strong", row.question);
      const explanation = node(doc, "p", `${SHEET_PRIORITY_COPY[language][row.priority]} · ${SHEET_TOPIC_COPY[language][row.category]} · ${c.cell}${colon}${row.cellId ?? "UNKNOWN"}`);
      const conditions = node(doc, "p", `${c.storage}${colon}${row.storage}. ${c.physical}${colon}UNKNOWN. ${c.source}${colon}${row.source}. ${c.licence}${colon}${row.licence}. ${c.date}${colon}${row.date}.`);
      const replyState = menu(doc, ["not-asked", "asked", "reply-noted"] as const, (v) => SHEET_REPLY_COPY[language][v]);
      replyState.value = row.reply;
      const answer = memo(doc, 1200);
      answer.value = row.replyText;
      const annotation = memo(doc, 1200);
      annotation.value = row.note;
      const save = action(doc, c.update);
      const up = action(doc, c.up);
      const down = action(doc, c.down);
      const remove = action(doc, c.remove);
      item.append(titleNode, explanation, conditions, labelControl(doc, c.status, replyState),
        labelControl(doc, c.replyText, answer), labelControl(doc, c.note, annotation), save, up, down, remove);
      list.append(item);
      listen(save, "click", () => update(() => updateSheetItem(sheet, row.id, {
        reply: replyState.value as SheetReply, replyText: answer.value, note: annotation.value,
      })), rowListeners);
      listen(up, "click", () => update(() => moveSheetItem(sheet, row.id, "up")), rowListeners);
      listen(down, "click", () => update(() => moveSheetItem(sheet, row.id, "down")), rowListeners);
      listen(remove, "click", () => update(() => removeSheetItem(sheet, row.id)), rowListeners);
    }
    previous.disabled = offset === 0;
    next.disabled = !result.next;
    pageInfo.textContent = `${Math.min(offset + 1, result.total)}–${Math.min(offset + SHEET_PAGE_SIZE, result.total)} / ${result.total}`;
  };
  listen(template, "change", () => {
    const selection = questionTemplate(template.value, language);
    if (!selection) return;
    question.value = selection.text;
    category.value = selection.category;
    priority.value = selection.priority;
  });
  listen(add, "click", () => {
    update(() => addSheetItem(sheet, manifest, { cellId: cell.value || null, category: category.value as SheetCategory,
      priority: priority.value as SheetPriority, question: question.value, note: note.value }));
    if (status.textContent === c.changed) { question.value = ""; note.value = ""; }
  });
  listen(saveTitle, "click", () => update(() => changeSheetTitle(sheet, title.value)));
  listen(search, "input", () => { offset = 0; draw(); });
  listen(filter, "change", () => { offset = 0; draw(); });
  listen(sort, "change", () => { offset = 0; draw(); });
  listen(previous, "click", () => { offset = Math.max(0, offset - SHEET_PAGE_SIZE); draw(); });
  listen(next, "click", () => { offset += SHEET_PAGE_SIZE; draw(); });
  listen(textButton, "click", () => {
    try { saveQuestionHandout(doc, createQuestionHandout(sheet, manifest, model?.getState().inventory ?? null, language, includeNotes.checked)); status.textContent = c.privacy; }
    catch { status.textContent = c.failed; }
  });
  listen(jsonButton, "click", () => {
    try { saveQuestionHandout(doc, createQuestionBackup(sheet, manifest, language)); status.textContent = c.privacy; }
    catch { status.textContent = c.failed; }
  });
  listen(printButton, "click", () => {
    try {
      printHolder.replaceChildren(makePrintHandout(doc, createQuestionHandout(sheet, manifest, model?.getState().inventory ?? null, language, includeNotes.checked)));
      printHolder.hidden = false;
      status.textContent = c.printGuide;
      doc.defaultView?.print();
    } catch { status.textContent = c.failed; }
  });
  listen(previewButton, "click", () => {
    try {
      pending = parseQuestionSheet(jsonArea.value, manifest);
      const diff = compareQuestionSheets(sheet, pending, manifest);
      preview.textContent = `${c.confirm}\n${questionSheetDiffText(diff, language)}`;
      preview.hidden = false;
      applyButton.disabled = false;
      status.textContent = c.review;
    } catch { pending = null; applyButton.disabled = true; preview.hidden = true; status.textContent = c.fileProblem; }
  });
  listen(applyButton, "click", () => {
    if (pending === null) return;
    sheet = pending; pending = null; applyButton.disabled = true; preview.hidden = true; title.value = sheet.title;
    offset = 0; status.textContent = c.imported; draw();
  });
  listen(cancelButton, "click", () => { pending = null; applyButton.disabled = true; preview.hidden = true; jsonArea.value = ""; });
  const unsubscribe = model?.subscribe(() => draw());
  draw();
  return () => {
    disposed = true;
    if (unsubscribe) unsubscribe();
    clearRows();
    for (const stop of permanentListeners) stop();
    section.remove();
  };
}
