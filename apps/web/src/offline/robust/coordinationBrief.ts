/** A user-authored coordination handoff. Nothing here asserts physical accessibility. */
export type BriefStatus = "UNKNOWN" | "asked" | "reply-recorded" | "follow-up";
export type BriefPriority = "essential" | "helpful" | "optional";
export type BriefTopic = "arrival" | "entrance" | "route" | "transfer" | "washroom" | "rest" | "communication" | "departure" | "other";
export type BriefFilter = "all" | "unanswered" | "follow-up" | "essential" | "reply-recorded";
export type BriefSort = "order" | "priority" | "topic" | "updated";
export type BriefEventKind = "created" | "edited" | "moved" | "status" | "note" | "removed" | "reopened";
export type Condition = "UNKNOWN";
export interface BriefProvenance {
  readonly source: string;
  readonly licence: string;
  readonly date: string;
}
export interface BriefStep {
  readonly id: string;
  readonly label: string;
  readonly topic: BriefTopic;
  readonly priority: BriefPriority;
  readonly question: string;
  readonly fallbackQuestion: string;
  readonly contactMethod: string;
  readonly note: string;
  readonly status: BriefStatus;
  readonly physicalCondition: Condition;
  readonly provenance: BriefProvenance | null;
  readonly order: number;
  readonly created: string;
  readonly updated: string;
}
export interface BriefEvent {
  readonly id: string;
  readonly stepId: string;
  readonly at: string;
  readonly kind: BriefEventKind;
  readonly summary: string;
}
export interface CoordinationBrief {
  readonly schema: "offline-coordination-brief-v1";
  readonly title: string;
  readonly regionId: string;
  readonly context: string;
  readonly date: string;
  readonly steps: readonly BriefStep[];
  readonly events: readonly BriefEvent[];
}
export interface StepDraft {
  readonly label: string;
  readonly topic: BriefTopic;
  readonly priority: BriefPriority;
  readonly question: string;
  readonly fallbackQuestion: string;
  readonly contactMethod: string;
  readonly note: string;
  readonly provenance: BriefProvenance | null;
}
export interface BriefPageOptions {
  readonly search: string;
  readonly filter: BriefFilter;
  readonly sort: BriefSort;
  readonly offset: number;
  readonly limit: number;
}
export interface BriefPage {
  readonly rows: readonly BriefStep[];
  readonly total: number;
  readonly previous: boolean;
  readonly next: boolean;
}
export interface BriefSummary {
  readonly total: number;
  readonly essential: number;
  readonly unanswered: number;
  readonly followUp: number;
  readonly replies: number;
  readonly unknownConditions: number;
  readonly sourceUnspecified: number;
}
export const BRIEF_MAX_STEPS = 80;
export const BRIEF_MAX_EVENTS = 320;
export const BRIEF_MAX_BYTES = 360_000;
export const BRIEF_MAX_SUMMARY = 1000;
const topics: readonly BriefTopic[] = ["arrival", "entrance", "route", "transfer", "washroom", "rest", "communication", "departure", "other"];
const priorities: readonly BriefPriority[] = ["essential", "helpful", "optional"];
const statuses: readonly BriefStatus[] = ["UNKNOWN", "asked", "reply-recorded", "follow-up"];
const eventKinds: readonly BriefEventKind[] = ["created", "edited", "moved", "status", "note", "removed", "reopened"];
const prioritiesInOrder: Readonly<Record<BriefPriority, number>> = { essential: 0, helpful: 1, optional: 2 };
function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const found = Object.keys(value);
  return found.length === keys.length && keys.every((key) => Object.prototype.hasOwnProperty.call(value, key));
}
function stringWithin(value: unknown, min: number, max: number): value is string {
  if (typeof value !== "string" || value.length < min || value.length > max) return false;
  return ![...value].some((character) => {
    const code = character.codePointAt(0) ?? 0;
    return code < 32 && code !== 9 && code !== 10 && code !== 13;
  });
}
function dateOnly(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) return false;
  const time = Date.parse(`${value}T00:00:00.000Z`);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value;
}
function idValid(value: unknown): value is string {
  return typeof value === "string" && /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/u.test(value);
}
function timestamp(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value)) return false;
  const time = Date.parse(value);
  return Number.isFinite(time) && new Date(time).toISOString() === value;
}
function topicValid(value: unknown): value is BriefTopic { return topics.includes(value as BriefTopic); }
function priorityValid(value: unknown): value is BriefPriority { return priorities.includes(value as BriefPriority); }
function statusValid(value: unknown): value is BriefStatus { return statuses.includes(value as BriefStatus); }
function eventValid(value: unknown): value is BriefEventKind { return eventKinds.includes(value as BriefEventKind); }
function enforce(value: boolean, message: string): asserts value { if (!value) throw new TypeError(message); }
function validProvenance(p: unknown): p is BriefProvenance {
  return isObject(p) && exactKeys(p, ["source", "licence", "date"]) && stringWithin(p.source, 1, 180) && stringWithin(p.licence, 1, 160) && dateOnly(p.date);
}
function assertDraft(draft: StepDraft): void {
  enforce(isObject(draft) && exactKeys(draft, ["label", "topic", "priority", "question", "fallbackQuestion",
    "contactMethod", "note", "provenance"]), "Unexpected draft fields");
  enforce(stringWithin(draft.label, 1, 140), "Invalid label");
  enforce(topicValid(draft.topic), "Invalid topic");
  enforce(priorityValid(draft.priority), "Invalid priority");
  enforce(stringWithin(draft.question, 1, 1000), "A question is required");
  enforce(stringWithin(draft.fallbackQuestion, 0, 1000), "Invalid fallback question");
  enforce(stringWithin(draft.contactMethod, 0, 160), "Invalid contact method");
  enforce(stringWithin(draft.note, 0, 2000), "Invalid note");
  enforce(draft.provenance === null || validProvenance(draft.provenance), "Invalid source metadata");
}
export function createCoordinationBrief(regionId: string, title: string, date: string, context = ""): CoordinationBrief {
  enforce(idValid(regionId), "Invalid region");
  enforce(stringWithin(title, 1, 140), "Invalid title");
  enforce(dateOnly(date), "Invalid date");
  enforce(stringWithin(context, 0, 2000), "Invalid context");
  return { schema: "offline-coordination-brief-v1", regionId, title, date, context, steps: [], events: [] };
}
function assertMutation(book: CoordinationBrief, at: string, eventId: string): void {
  enforce(timestamp(at), "Invalid timestamp");
  enforce(idValid(eventId), "Invalid event ID");
  enforce(!book.events.some((event) => event.id === eventId), "Duplicate event ID");
  enforce(book.events.length < BRIEF_MAX_EVENTS, "Event limit reached");
  const previous = book.events[book.events.length - 1];
  enforce(previous === undefined || at >= previous.at, "History must be chronological");
}
function addEvent(book: CoordinationBrief, event: BriefEvent, steps: readonly BriefStep[]): CoordinationBrief {
  return { ...book, steps, events: [...book.events, event] };
}
export function addBriefStep(book: CoordinationBrief, id: string, eventId: string, at: string, draft: StepDraft): CoordinationBrief {
  assertCoordinationBrief(book);
  assertDraft(draft);
  assertMutation(book, at, eventId);
  enforce(idValid(id) && !book.steps.some((step) => step.id === id), "Duplicate or invalid step ID");
  enforce(book.steps.length < BRIEF_MAX_STEPS, "Step limit reached");
  const step: BriefStep = { ...draft, id, status: "UNKNOWN", physicalCondition: "UNKNOWN", order: book.steps.length,
    created: at, updated: at };
  return addEvent(book, { id: eventId, at, stepId: id, kind: "created", summary: "Created by user" }, [...book.steps, step]);
}
export function editBriefStep(book: CoordinationBrief, id: string, eventId: string, at: string, draft: StepDraft): CoordinationBrief {
  assertCoordinationBrief(book);
  assertDraft(draft);
  assertMutation(book, at, eventId);
  const existing = book.steps.find((step) => step.id === id);
  enforce(existing !== undefined, "Unknown step");
  enforce(at >= existing.updated, "Edit predates step");
  return addEvent(book, { id: eventId, stepId: id, at, kind: "edited", summary: "User updated step" },
    book.steps.map((step) => step.id === id ? { ...step, ...draft, updated: at } : step));
}
export function setBriefStatus(book: CoordinationBrief, id: string, eventId: string, at: string, status: BriefStatus): CoordinationBrief {
  assertCoordinationBrief(book);
  assertMutation(book, at, eventId);
  enforce(statusValid(status), "Invalid status");
  const existing = book.steps.find((step) => step.id === id);
  enforce(existing !== undefined, "Unknown step");
  enforce(at >= existing.updated, "Status predates step");
  enforce(existing.status !== status, "No change");
  return addEvent(book, { id: eventId, stepId: id, at, kind: status === "UNKNOWN" ? "reopened" : "status", summary: status },
    book.steps.map((step) => step.id === id ? { ...step, status, updated: at } : step));
}
export function addBriefNote(book: CoordinationBrief, id: string, eventId: string, at: string, note: string): CoordinationBrief {
  assertCoordinationBrief(book);
  assertMutation(book, at, eventId);
  enforce(stringWithin(note, 1, 1000), "Invalid note");
  const existing = book.steps.find((step) => step.id === id);
  enforce(existing !== undefined, "Unknown step");
  enforce(at >= existing.updated, "Note predates step");
  const combined = existing.note ? `${existing.note}\n${note}` : note;
  enforce(combined.length <= 2000, "Notes limit reached");
  return addEvent(book, { id: eventId, at, stepId: id, kind: "note", summary: "User appended a note" },
    book.steps.map((step) => step.id === id ? { ...step, note: combined, updated: at } : step));
}
export function moveBriefStep(book: CoordinationBrief, id: string, position: number, eventId: string, at: string): CoordinationBrief {
  assertCoordinationBrief(book);
  assertMutation(book, at, eventId);
  enforce(Number.isSafeInteger(position) && position >= 0 && position < book.steps.length, "Invalid position");
  const ordered = [...book.steps].sort((a, b) => a.order - b.order);
  const index = ordered.findIndex((step) => step.id === id);
  enforce(index >= 0, "Unknown step");
  enforce(index !== position, "No movement");
  const [item] = ordered.splice(index, 1);
  enforce(item !== undefined, "Unknown step");
  enforce(at >= item.updated, "Movement predates step");
  ordered.splice(position, 0, item);
  const updated = ordered.map((step, order) => ({ ...step, order, updated: step.id === id ? at : step.updated }));
  return addEvent(book, { id: eventId, at, stepId: id, kind: "moved", summary: `New position: ${position + 1}` }, updated);
}
export function removeBriefStep(book: CoordinationBrief, id: string, eventId: string, at: string): CoordinationBrief {
  assertCoordinationBrief(book);
  assertMutation(book, at, eventId);
  const existing = book.steps.find((step) => step.id === id);
  enforce(existing !== undefined, "Unknown step");
  enforce(at >= existing.updated, "Removal predates step");
  const steps = book.steps.filter((step) => step.id !== id).sort((a, b) => a.order - b.order).map((step, order) => ({ ...step, order }));
  return addEvent(book, { id: eventId, at, stepId: id, kind: "removed", summary: "Removed by user" }, steps);
}
export function pageBriefSteps(book: CoordinationBrief, options: BriefPageOptions): BriefPage {
  enforce(typeof options.search === "string" && options.search.length <= 180, "Invalid search");
  enforce(["all", "unanswered", "follow-up", "essential", "reply-recorded"].includes(options.filter), "Invalid filter");
  enforce(["order", "priority", "topic", "updated"].includes(options.sort), "Invalid sort");
  enforce(Number.isSafeInteger(options.offset) && options.offset >= 0 && Number.isSafeInteger(options.limit) &&
    options.limit >= 1 && options.limit <= 40, "Invalid paging");
  const search = options.search.trim().toLocaleLowerCase();
  const matches = book.steps.filter((step) => {
    const accepts = options.filter === "all" ||
      (options.filter === "unanswered" && step.status !== "reply-recorded") ||
      (options.filter === "follow-up" && step.status === "follow-up") ||
      (options.filter === "essential" && step.priority === "essential") ||
      (options.filter === "reply-recorded" && step.status === "reply-recorded");
    return accepts && [step.label, step.question, step.fallbackQuestion, step.note, step.topic]
      .some((value) => value.toLocaleLowerCase().includes(search));
  });
  matches.sort((a, b) => {
    if (options.sort === "priority") return prioritiesInOrder[a.priority] - prioritiesInOrder[b.priority] || a.order - b.order;
    if (options.sort === "topic") return a.topic.localeCompare(b.topic) || a.order - b.order;
    if (options.sort === "updated") return b.updated.localeCompare(a.updated) || a.order - b.order;
    return a.order - b.order;
  });
  return { rows: matches.slice(options.offset, options.offset + options.limit), total: matches.length,
    previous: options.offset > 0, next: options.offset + options.limit < matches.length };
}
export function summarizeBrief(book: CoordinationBrief): BriefSummary {
  return { total: book.steps.length, essential: book.steps.filter((s) => s.priority === "essential").length,
    unanswered: book.steps.filter((s) => s.status !== "reply-recorded").length,
    followUp: book.steps.filter((s) => s.status === "follow-up").length,
    replies: book.steps.filter((s) => s.status === "reply-recorded").length,
    unknownConditions: book.steps.filter((s) => s.physicalCondition === "UNKNOWN").length,
    sourceUnspecified: book.steps.filter((s) => s.provenance === null).length };
}
export function assertCoordinationBrief(value: unknown): asserts value is CoordinationBrief {
  enforce(isObject(value) && value.schema === "offline-coordination-brief-v1" &&
    exactKeys(value, ["schema", "title", "regionId", "context", "date", "steps", "events"]), "Invalid schema");
  enforce(idValid(value.regionId) && stringWithin(value.title, 1, 140) && dateOnly(value.date) &&
    stringWithin(value.context, 0, 2000), "Invalid brief details");
  enforce(Array.isArray(value.steps) && value.steps.length <= BRIEF_MAX_STEPS, "Invalid steps");
  enforce(Array.isArray(value.events) && value.events.length <= BRIEF_MAX_EVENTS, "Invalid events");
  const ids = new Set<string>();
  const positions = new Set<number>();
  for (const candidate of value.steps as unknown[]) {
    enforce(isObject(candidate) && exactKeys(candidate, ["id", "label", "topic", "priority", "question",
      "fallbackQuestion", "contactMethod", "note", "status", "physicalCondition", "provenance",
      "order", "created", "updated"]), "Invalid step");
    enforce(idValid(candidate.id) && !ids.has(candidate.id), "Invalid step ID");
    ids.add(candidate.id);
    enforce(Number.isSafeInteger(candidate.order) && (candidate.order as number) >= 0 &&
      (candidate.order as number) < value.steps.length && !positions.has(candidate.order as number), "Invalid ordering");
    positions.add(candidate.order as number);
    enforce(stringWithin(candidate.label, 1, 140) && topicValid(candidate.topic) && priorityValid(candidate.priority), "Invalid step labels");
    enforce(stringWithin(candidate.question, 1, 1000) && stringWithin(candidate.fallbackQuestion, 0, 1000) &&
      stringWithin(candidate.contactMethod, 0, 160) && stringWithin(candidate.note, 0, 2000), "Invalid step text");
    enforce(statusValid(candidate.status) && candidate.physicalCondition === "UNKNOWN", "Physical condition must remain UNKNOWN");
    enforce(candidate.provenance === null || validProvenance(candidate.provenance), "Invalid provenance");
    enforce(timestamp(candidate.created) && timestamp(candidate.updated) && candidate.updated >= candidate.created, "Invalid chronology");
  }
  const eventIds = new Set<string>();
  let previous = "";
  const known = new Set<string>();
  for (const candidate of value.events as unknown[]) {
    enforce(isObject(candidate) && exactKeys(candidate, ["id", "stepId", "at", "kind", "summary"]) &&
      idValid(candidate.id) && !eventIds.has(candidate.id), "Invalid event ID");
    eventIds.add(candidate.id);
    enforce(idValid(candidate.stepId) && timestamp(candidate.at) && eventValid(candidate.kind) &&
      stringWithin(candidate.summary, 1, BRIEF_MAX_SUMMARY), "Invalid event");
    enforce(candidate.at >= previous, "Out-of-order event");
    previous = candidate.at;
    if (candidate.kind === "created") { enforce(!known.has(candidate.stepId), "Repeated creation"); known.add(candidate.stepId); }
    else { enforce(known.has(candidate.stepId), "Event references unknown step"); }
    if (candidate.kind === "removed") known.delete(candidate.stepId);
  }
  for (const id of ids) enforce(known.has(id), "Step without creation event");
  for (const id of known) enforce(ids.has(id), "Created step missing from current book");
}
export function encodeCoordinationBrief(book: CoordinationBrief): string {
  assertCoordinationBrief(book);
  const result = JSON.stringify(book, null, 2) + "\n";
  enforce(new TextEncoder().encode(result).byteLength <= BRIEF_MAX_BYTES, "Export too large");
  return result;
}
export function parseCoordinationBrief(text: string): CoordinationBrief {
  enforce(typeof text === "string" && new TextEncoder().encode(text).byteLength <= BRIEF_MAX_BYTES, "Import too large");
  let data: unknown;
  try { data = JSON.parse(text) as unknown; } catch { throw new TypeError("Invalid JSON"); }
  assertCoordinationBrief(data);
  return data;
}
/** Reconcile a saved briefing with another local region without changing the steps. */
export function briefForRegion(book: CoordinationBrief, regionId: string): "same-region" | "UNKNOWN" {
  return book.regionId === regionId && idValid(regionId) ? "same-region" : "UNKNOWN";
}
