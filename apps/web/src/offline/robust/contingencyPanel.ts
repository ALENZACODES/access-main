import { createOfflineAction } from "./accessibilityGuard";
import type { DashboardModel } from "./offlineDashboard";
import type { Language, RegionManifest } from "./regionDownload";
import {
  addContingencyStep, attachContingencySource, captureSource, createContingencyPlan,
  moveContingencyStep, pageContingency, parseContingencyPlan,
  summaryContingency, updateContingencyStep, CONTINGENCY_MAX_FILE_BYTES,
  type CheckpointKind, type CheckpointSignal, type ContingencyPlan, type FollowUp,
  type PlanFilter, type PlanSort,
} from "./contingencyPlan";
import {
  CONTINGENCY_COPY, CONTINGENCY_FILTERS, CONTINGENCY_FOLLOWUPS,
  CONTINGENCY_KINDS, CONTINGENCY_QUESTIONS, CONTINGENCY_SIGNALS, CONTINGENCY_SORTS,
  contingencyFilterText, contingencyFollowupText, contingencyKindText,
  contingencySignalText, contingencySortText,
} from "./contingencyCopy";
import { saveContingencyFile } from "./contingencyExport";

const PAGE_SIZE = 10;
function element<K extends keyof HTMLElementTagNameMap>(doc: Document, tag: K, value?: string): HTMLElementTagNameMap[K] {
  const item = doc.createElement(tag);
  if (value !== undefined) item.textContent = value;
  return item;
}
function button(doc: Document, label: string): HTMLButtonElement {
  return createOfflineAction(doc, label);
}
function control(doc: Document, label: string, id: string, tag: "select"): {
  readonly wrapper: HTMLLabelElement; readonly input: HTMLSelectElement;
};
function control(doc: Document, label: string, id: string, tag: "input"): {
  readonly wrapper: HTMLLabelElement; readonly input: HTMLInputElement;
};
function control(doc: Document, label: string, id: string, tag: "textarea"): {
  readonly wrapper: HTMLLabelElement; readonly input: HTMLTextAreaElement;
};
function control(doc: Document, label: string, id: string, tag: "select" | "input" | "textarea") {
  const wrapper = element(doc, "label", label);
  wrapper.htmlFor = id;
  const input = doc.createElement(tag);
  input.id = id;
  input.style.minHeight = "44px";
  input.style.minWidth = "44px";
  input.style.maxWidth = "100%";
  input.style.boxSizing = "border-box";
  wrapper.style.display = "block";
  wrapper.append(input);
  return { wrapper, input };
}
function choice(doc: Document, target: HTMLSelectElement, value: string, label: string): void {
  const item = element(doc, "option", label);
  item.value = value;
  target.append(item);
}
function detail(doc: Document, name: string, value: string): HTMLDivElement {
  const wrap = element(doc, "div");
  const dt = element(doc, "dt", name);
  const dd = element(doc, "dd", value);
  dd.style.marginInlineStart = "1em";
  wrap.append(dt, dd);
  return wrap;
}
/** A planning notebook: nothing here reads network services or changes cached cells. */
export function mountOfflineContingency(
  root: HTMLElement, manifest: RegionManifest, model: DashboardModel, language: Language,
): () => void {
  const doc = root.ownerDocument;
  const copy = CONTINGENCY_COPY[language];
  const safe = manifest.regionId.replace(/[^a-zA-Z0-9_-]/gu, "-");
  const section = element(doc, "section");
  section.setAttribute("aria-label", copy.title);
  const heading = element(doc, "h2", copy.title);
  const intro = element(doc, "p", copy.intro);
  const toggle = button(doc, copy.open);
  const content = element(doc, "div");
  content.id = `contingency-content-${safe}`;
  content.hidden = true;
  toggle.setAttribute("aria-controls", content.id);
  toggle.setAttribute("aria-expanded", "false");
  const live = element(doc, "p");
  live.setAttribute("role", "status");
  live.setAttribute("aria-live", "polite");
  live.setAttribute("aria-atomic", "true");
  const warning = element(doc, "p", copy.caution);
  const privacy = element(doc, "p", copy.privacy);
  const tally = element(doc, "dl");
  const name = control(doc, copy.titleLabel, `contingency-title-${safe}`, "input");
  name.input.maxLength = 160;
  const kind = control(doc, copy.kind, `contingency-kind-${safe}`, "select");
  for (const item of CONTINGENCY_KINDS) choice(doc, kind.input, item, contingencyKindText(item, language));
  const question = control(doc, copy.question, `contingency-question-${safe}`, "textarea");
  question.input.maxLength = 1200;
  question.input.rows = 2;
  question.input.value = CONTINGENCY_QUESTIONS[language].arrival[0] ?? "";
  const add = button(doc, copy.add);
  const editor = element(doc, "div");
  editor.append(name.wrapper, kind.wrapper, question.wrapper, add);

  const selection = control(doc, copy.select, `contingency-select-${safe}`, "select");
  const observation = control(doc, copy.signal, `contingency-observation-${safe}`, "select");
  for (const item of CONTINGENCY_SIGNALS) choice(doc, observation.input, item, contingencySignalText(item, language));
  const followup = control(doc, copy.followUp, `contingency-followup-${safe}`, "select");
  for (const item of CONTINGENCY_FOLLOWUPS) choice(doc, followup.input, item, contingencyFollowupText(item, language));
  const alternative = control(doc, copy.alternative, `contingency-alternative-${safe}`, "textarea");
  alternative.input.maxLength = 1200;
  alternative.input.rows = 2;
  const note = control(doc, copy.note, `contingency-note-${safe}`, "textarea");
  note.input.maxLength = 1200;
  note.input.rows = 2;
  const save = button(doc, copy.save);
  const up = button(doc, copy.before);
  const down = button(doc, copy.after);
  const cell = control(doc, copy.source, `contingency-cell-${safe}`, "select");
  choice(doc, cell.input, "", copy.noSource);
  for (const entry of manifest.cells) choice(doc, cell.input, entry.id, entry.id);
  const attach = button(doc, copy.attach);
  const manage = element(doc, "div");
  manage.append(selection.wrapper, observation.wrapper, followup.wrapper,
    alternative.wrapper, note.wrapper, save, up, down, cell.wrapper, attach);

  const search = control(doc, copy.search, `contingency-search-${safe}`, "input");
  search.input.type = "search";
  search.input.maxLength = 160;
  const filter = control(doc, copy.filter, `contingency-filter-${safe}`, "select");
  for (const item of CONTINGENCY_FILTERS) choice(doc, filter.input, item, contingencyFilterText(item, language));
  const sort = control(doc, copy.sort, `contingency-sort-${safe}`, "select");
  for (const item of CONTINGENCY_SORTS) choice(doc, sort.input, item, contingencySortText(item, language));
  const results = element(doc, "ol");
  const nav = element(doc, "nav");
  nav.setAttribute("aria-label", copy.page);
  const previous = button(doc, copy.previous);
  const next = button(doc, copy.next);
  const position = element(doc, "span");
  nav.append(previous, position, next);
  const review = element(doc, "div");
  review.append(search.wrapper, filter.wrapper, sort.wrapper, results, nav);

  const saveJson = button(doc, copy.json);
  const saveText = button(doc, copy.text);
  const importControl = control(doc, copy.import, `contingency-import-${safe}`, "input");
  importControl.input.type = "file";
  importControl.input.accept = ".json,application/json";
  const importNotice = element(doc, "p", copy.importNotice);
  const clear = button(doc, copy.reset);
  const files = element(doc, "div");
  files.append(saveJson, saveText, importControl.wrapper, importNotice, clear);
  content.append(live, warning, tally, editor, manage, review, files, privacy);
  section.append(heading, intro, toggle, content);
  root.append(section);

  let plan: ContingencyPlan = createContingencyPlan(manifest.regionId, new Date().toISOString());
  let offset = 0;
  let expanded = false;
  let disposed = false;
  let revision = 0;
  let serial = 0;
  const now = (): string => new Date().toISOString();
  const id = (type: string): string => `${type}-${++serial}-${Date.now()}`;
  const notice = (text: string): void => { live.textContent = text; };
  const selected = (): string => selection.input.value;
  const enabled = (): boolean => plan.steps.some((step) => step.id === selected());
  const synchronize = (): void => {
    const step = plan.steps.find((item) => item.id === selected());
    if (step === undefined) return;
    observation.input.value = step.signal;
    followup.input.value = step.followUp;
    alternative.input.value = step.alternative;
    note.input.value = step.note;
    cell.input.value = step.source.cellId ?? "";
  };
  const render = (): void => {
    if (disposed || !expanded) return;
    const previousSelected = selected();
    const totals = summaryContingency(plan);
    tally.replaceChildren(detail(doc, copy.count, String(totals.listed)),
      detail(doc, copy.openCount, String(totals.open)),
      detail(doc, copy.issueCount, String(totals.issues)),
      detail(doc, copy.unknownCount, String(totals.unknownSignals)),
      detail(doc, copy.alternatives, String(totals.alternatives)),
      detail(doc, copy.savedCount, String(totals.savedSources)),
      detail(doc, copy.unknownSource, String(totals.unknownSources)),
      detail(doc, copy.eventCount, String(plan.events.length)));
    selection.input.replaceChildren();
    for (const step of plan.steps) choice(doc, selection.input, step.id, step.title);
    if (plan.steps.some((step) => step.id === previousSelected)) selection.input.value = previousSelected;
    const active = enabled();
    for (const action of [save, up, down, attach]) action.disabled = !active;
    synchronize();
    const page = pageContingency(plan, { search: search.input.value,
      filter: filter.input.value as PlanFilter, sort: sort.input.value as PlanSort,
      offset, limit: PAGE_SIZE });
    results.replaceChildren();
    for (const step of page.rows) {
      const entry = element(doc, "li");
      entry.append(element(doc, "strong", step.title));
      const details = element(doc, "dl");
      details.append(detail(doc, copy.kind, contingencyKindText(step.kind, language)),
        detail(doc, copy.question, step.question),
        detail(doc, copy.alternative, step.alternative || copy.unknown),
        detail(doc, copy.note, step.note || copy.unknown),
        detail(doc, copy.signal, contingencySignalText(step.signal, language)),
        detail(doc, copy.status, contingencyFollowupText(step.followUp, language)),
        detail(doc, copy.evidence, step.source.state),
        detail(doc, copy.sourceName, step.source.source),
        detail(doc, copy.licence, step.source.licence),
        detail(doc, copy.date, step.source.date),
        detail(doc, copy.bytes, step.source.expectedBytes === null ? copy.unknown : String(step.source.expectedBytes)));
      entry.append(details);
      results.append(entry);
    }
    if (page.rows.length === 0) results.append(element(doc, "li", plan.steps.length ? copy.noMatches : copy.empty));
    previous.disabled = !page.previous;
    next.disabled = !page.next;
    position.textContent = `${page.total === 0 ? 0 : offset + 1}–${Math.min(offset + PAGE_SIZE, page.total)} / ${page.total}`;
    saveJson.disabled = plan.steps.length === 0;
    saveText.disabled = plan.steps.length === 0;
  };
  const execute = (callback: () => void, message: string): void => {
    try { callback(); render(); notice(message); }
    catch { notice(copy.validation); }
  };
  const onToggle = (): void => {
    expanded = !expanded;
    content.hidden = !expanded;
    toggle.textContent = expanded ? copy.close : copy.open;
    toggle.setAttribute("aria-expanded", String(expanded));
    render();
  };
  const onKind = (): void => {
    const questions = CONTINGENCY_QUESTIONS[language][kind.input.value as CheckpointKind];
    question.input.value = questions[0] ?? copy.questionPrompt;
  };
  const onAdd = (): void => {
    execute(() => {
      plan = addContingencyStep(plan, { id: id("step"), eventId: id("event"),
        at: now(), title: name.input.value, kind: kind.input.value as CheckpointKind,
        question: question.input.value });
      name.input.value = "";
      offset = 0;
    }, copy.added);
  };
  const onSave = (): void => {
    if (!enabled()) return;
    execute(() => {
      plan = updateContingencyStep(plan, selected(), {
        signal: observation.input.value as CheckpointSignal,
        followUp: followup.input.value as FollowUp,
        alternative: alternative.input.value, note: note.input.value,
      }, now(), id("event"));
    }, copy.updated);
  };
  const onMove = (direction: "up" | "down"): void => {
    if (!enabled()) return;
    execute(() => { plan = moveContingencyStep(plan, selected(), direction, now(), id("event")); }, copy.reordered);
  };
  const onSource = (): void => {
    if (!enabled()) return;
    execute(() => {
      const state = model.getState();
      const source = captureSource(manifest, state.phase === "ready" ? state.inventory : null, cell.input.value || null);
      plan = attachContingencySource(plan, selected(), source, now(), id("event"));
    }, copy.sourceUpdated);
  };
  const onQuery = (): void => { offset = 0; render(); };
  const onPrevious = (): void => { offset = Math.max(0, offset - PAGE_SIZE); render(); };
  const onNext = (): void => { offset += PAGE_SIZE; render(); };
  const onExport = (format: "json" | "txt"): void => {
    execute(() => saveContingencyFile(plan, language, format, doc, now()), copy.exportWarning);
  };
  const onImport = (): void => {
    const file = importControl.input.files?.[0];
    if (!file) return;
    if (file.size > CONTINGENCY_MAX_FILE_BYTES) { notice(copy.fileTooLarge); return; }
    const token = ++revision;
    void file.text().then((text) => {
      if (disposed || token !== revision) return;
      execute(() => { plan = parseContingencyPlan(text, manifest.regionId); offset = 0; }, copy.imported);
    }).catch(() => { if (!disposed && token === revision) notice(copy.validation); });
  };
  const onClear = (): void => {
    // A double opt-in avoids discarding history on an accidental first click.
    if (clear.dataset.confirm !== "yes") { clear.dataset.confirm = "yes"; notice(copy.resetNotice); return; }
    clear.dataset.confirm = "no";
    plan = createContingencyPlan(manifest.regionId, now());
    offset = 0;
    render();
    notice(copy.empty);
  };
  const handlers: readonly [HTMLElement, string, EventListener][] = [
    [toggle, "click", onToggle], [kind.input, "change", onKind], [add, "click", onAdd],
    [selection.input, "change", synchronize], [save, "click", onSave],
    [up, "click", () => onMove("up")], [down, "click", () => onMove("down")],
    [attach, "click", onSource], [search.input, "input", onQuery],
    [filter.input, "change", onQuery], [sort.input, "change", onQuery],
    [previous, "click", onPrevious], [next, "click", onNext],
    [saveJson, "click", () => onExport("json")], [saveText, "click", () => onExport("txt")],
    [importControl.input, "change", onImport], [clear, "click", onClear],
  ];
  for (const [node, type, callback] of handlers) node.addEventListener(type, callback);
  return () => {
    disposed = true;
    revision++;
    for (const [node, type, callback] of handlers) node.removeEventListener(type, callback);
    section.remove();
  };
}
