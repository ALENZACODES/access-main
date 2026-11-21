/** User-directed, local handoff notes: never an accessibility or pack-readiness assessment. */
export type BriefLocale = "en" | "fr";
export type BriefState = "draft" | "review" | "archived";
export type BriefOperation = "pack" | "download" | "storage" | "transfer" | "other";
export type BriefCondition = "UNKNOWN" | "interrupted" | "missing" | "conflicting" | "unavailable";
export type BriefTier = "UNKNOWN" | "self-reported" | "documented" | "reviewed";
export type BriefQuestionTopic = "what-happened" | "missing-evidence" | "source" | "next-step" | "handoff";
export type BriefQuestionState = "UNKNOWN" | "open" | "answered" | "deferred";
export type BriefEventAction = "created" | "question-added" | "observation-added" | "review-requested" | "reopened" | "archived";
export type BriefIssue = "format" | "limit" | "identity" | "duplicate" | "source" | "date" | "timestamp" | "text" | "reference" | "sequence" | "conflict" | "transition" | "privacy";
export const BRIEF_LIMITS = Object.freeze({ bytes: 360_000, briefs: 120, observations: 1000, questions: 1000, events: 2000, text: 560, id: 96 });
export const BRIEF_STATES: readonly BriefState[] = ["draft", "review", "archived"];
export const BRIEF_OPERATIONS: readonly BriefOperation[] = ["pack", "download", "storage", "transfer", "other"];
export const BRIEF_CONDITIONS: readonly BriefCondition[] = ["UNKNOWN", "interrupted", "missing", "conflicting", "unavailable"];
export const BRIEF_TIERS: readonly BriefTier[] = ["UNKNOWN", "self-reported", "documented", "reviewed"];
export const BRIEF_TOPICS: readonly BriefQuestionTopic[] = ["what-happened", "missing-evidence", "source", "next-step", "handoff"];
export const BRIEF_QUESTION_STATES: readonly BriefQuestionState[] = ["UNKNOWN", "open", "answered", "deferred"];
export const BRIEF_ACTIONS: readonly BriefEventAction[] = ["created", "question-added", "observation-added", "review-requested", "reopened", "archived"];

export interface BriefSource {
  readonly name: string;
  readonly licence: string;
  readonly retrievedOn: string;
  readonly reference: string;
  readonly tier: BriefTier;
}
export interface BriefCase {
  readonly id: string;
  readonly packId: string;
  readonly title: string;
  readonly operation: BriefOperation;
  readonly condition: BriefCondition;
  readonly openedAt: string;
  readonly state: BriefState;
  readonly source: BriefSource;
}
export interface BriefObservation {
  readonly id: string;
  readonly briefId: string;
  readonly capturedAt: string;
  readonly condition: BriefCondition;
  readonly summary: string;
  readonly source: BriefSource;
}
export interface BriefQuestion {
  readonly id: string;
  readonly briefId: string;
  readonly topic: BriefQuestionTopic;
  readonly state: BriefQuestionState;
  readonly question: string;
  readonly response: string;
  readonly source: BriefSource;
  readonly capturedAt: string;
}
export interface BriefEvent {
  readonly id: string;
  readonly briefId: string;
  readonly at: string;
  readonly action: BriefEventAction;
  readonly referenceId: string | null;
  readonly note: string;
}
export interface BriefDocument {
  readonly schema: "the-app.recovery-support-brief.v1";
  readonly briefs: readonly BriefCase[];
  readonly observations: readonly BriefObservation[];
  readonly questions: readonly BriefQuestion[];
  readonly events: readonly BriefEvent[];
}
export interface BriefFilter {
  readonly packId?: string;
  readonly condition?: BriefCondition;
  readonly state?: BriefState;
  readonly search?: string;
}
export interface BriefSummary {
  readonly briefs: number;
  readonly observations: number;
  readonly questions: number;
  readonly events: number;
  readonly unknown: number;
  readonly unanswered: number;
  readonly active: number;
  readonly distinctPacks: number;
  readonly contentReady: false;
}
export interface BriefMergePreview {
  readonly incoming: number;
  readonly addedBriefs: number;
  readonly addedObservations: number;
  readonly addedQuestions: number;
  readonly addedEvents: number;
  readonly conflicts: readonly string[];
  readonly canMerge: boolean;
}
export type BriefResult<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly issue: BriefIssue };
const ok = <T>(value: T): BriefResult<T> => ({ ok: true, value });
const bad = <T>(issue: BriefIssue): BriefResult<T> => ({ ok: false, issue });
const object = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const keys = (value: Record<string, unknown>, expected: readonly string[]): boolean => Object.keys(value).length === expected.length && Object.keys(value).every((key) => expected.includes(key));
const member = <T extends string>(value: unknown, choices: readonly T[]): value is T => typeof value === "string" && choices.includes(value as T);
const id = (value: unknown): value is string => typeof value === "string" && value.length > 0 && value.length <= BRIEF_LIMITS.id && /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/u.test(value);
const safeText = (value: unknown, max = BRIEF_LIMITS.text): value is string => typeof value === "string" && value.length <= max && [...value].every((part) => {
  const point = part.codePointAt(0) ?? 0;
  return point === 9 || point === 10 || point === 13 || point >= 32;
});
export const briefDate = (value: unknown): value is string => {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) return false;
  const epoch = Date.parse(`${value}T00:00:00.000Z`);
  return Number.isFinite(epoch) && new Date(epoch).toISOString().slice(0, 10) === value;
};
export const briefTime = (value: unknown): value is string => typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/u.test(value) && briefDate(value.slice(0, 10)) && Number.isFinite(Date.parse(value));
const sortIds = <T extends { readonly id: string }>(items: readonly T[]): T[] => [...items].sort((a, b) => a.id.localeCompare(b.id));
const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);
export const emptyBriefDocument = (): BriefDocument => ({ schema: "the-app.recovery-support-brief.v1", briefs: [], observations: [], questions: [], events: [] });

export function validBriefSource(value: unknown): value is BriefSource {
  if (!object(value) || !keys(value, ["name", "licence", "retrievedOn", "reference", "tier"])) return false;
  return safeText(value.name) && value.name.trim().length > 0 && safeText(value.licence) && value.licence.trim().length > 0
    && safeText(value.reference) && value.reference.trim().length > 0 && briefDate(value.retrievedOn) && member(value.tier, BRIEF_TIERS);
}
export function validBriefCase(value: unknown): value is BriefCase {
  if (!object(value) || !keys(value, ["id", "packId", "title", "operation", "condition", "openedAt", "state", "source"])) return false;
  return id(value.id) && id(value.packId) && safeText(value.title) && value.title.trim().length > 0
    && member(value.operation, BRIEF_OPERATIONS) && member(value.condition, BRIEF_CONDITIONS)
    && briefTime(value.openedAt) && member(value.state, BRIEF_STATES) && validBriefSource(value.source)
    && value.source.retrievedOn <= value.openedAt.slice(0, 10);
}
export function validBriefObservation(value: unknown): value is BriefObservation {
  if (!object(value) || !keys(value, ["id", "briefId", "capturedAt", "condition", "summary", "source"])) return false;
  return id(value.id) && id(value.briefId) && briefTime(value.capturedAt)
    && member(value.condition, BRIEF_CONDITIONS) && safeText(value.summary)
    && validBriefSource(value.source) && value.source.retrievedOn <= value.capturedAt.slice(0, 10);
}
export function validBriefQuestion(value: unknown): value is BriefQuestion {
  if (!object(value) || !keys(value, ["id", "briefId", "topic", "state", "question", "response", "source", "capturedAt"])) return false;
  return id(value.id) && id(value.briefId) && member(value.topic, BRIEF_TOPICS)
    && member(value.state, BRIEF_QUESTION_STATES) && safeText(value.question) && value.question.trim().length > 0
    && safeText(value.response) && validBriefSource(value.source) && briefTime(value.capturedAt)
    && value.source.retrievedOn <= value.capturedAt.slice(0, 10)
    && (value.state !== "answered" || value.response.trim().length > 0);
}
export function validBriefEvent(value: unknown): value is BriefEvent {
  if (!object(value) || !keys(value, ["id", "briefId", "at", "action", "referenceId", "note"])) return false;
  return id(value.id) && id(value.briefId) && briefTime(value.at) && member(value.action, BRIEF_ACTIONS)
    && (value.referenceId === null || id(value.referenceId)) && safeText(value.note);
}
export function expectedBriefState(events: readonly BriefEvent[]): BriefState {
  let state: BriefState = "draft";
  for (const event of events) {
    if (event.action === "review-requested" || event.action === "reopened") state = "review";
    if (event.action === "archived") state = "archived";
  }
  return state;
}
export function validBriefDocument(value: unknown): value is BriefDocument {
  if (!object(value) || !keys(value, ["schema", "briefs", "observations", "questions", "events"])) return false;
  if (value.schema !== "the-app.recovery-support-brief.v1" || !Array.isArray(value.briefs)
    || !Array.isArray(value.observations) || !Array.isArray(value.questions) || !Array.isArray(value.events)) return false;
  if (value.briefs.length > BRIEF_LIMITS.briefs || value.observations.length > BRIEF_LIMITS.observations
    || value.questions.length > BRIEF_LIMITS.questions || value.events.length > BRIEF_LIMITS.events) return false;
  if (!value.briefs.every(validBriefCase) || !value.observations.every(validBriefObservation)
    || !value.questions.every(validBriefQuestion) || !value.events.every(validBriefEvent)) return false;
  const briefs: BriefCase[] = value.briefs;
  const observations: BriefObservation[] = value.observations;
  const questions: BriefQuestion[] = value.questions;
  const events: BriefEvent[] = value.events;
  for (const items of [briefs, observations, questions, events]) {
    if (new Set(items.map((item) => item.id)).size !== items.length) return false;
  }
  const byBrief = new Map(briefs.map((item) => [item.id, item]));
  const byObservation = new Map(observations.map((item) => [item.id, item]));
  const byQuestion = new Map(questions.map((item) => [item.id, item]));
  for (const item of [...observations, ...questions]) {
    const parent = byBrief.get(item.briefId);
    if (!parent || item.capturedAt < parent.openedAt) return false;
  }
  for (const entry of briefs) {
    const history = events.filter((item) => item.briefId === entry.id).sort((a, b) => a.at.localeCompare(b.at));
    if (history.length === 0 || history[0]?.action !== "created" || history[0].at !== entry.openedAt) return false;
    if (history.filter((item) => item.action === "created").length !== 1) return false;
    let state: BriefState = "draft";
    for (const event of history) {
      if (event.at < entry.openedAt) return false;
      if (event.action === "review-requested" && state !== "draft") return false;
      if (event.action === "archived" && state !== "review") return false;
      if (event.action === "reopened" && state !== "archived") return false;
      if (event.action === "review-requested" || event.action === "reopened") state = "review";
      if (event.action === "archived") state = "archived";
    }
    if (state !== entry.state) return false;
  }
  for (const event of events) {
    if (!byBrief.has(event.briefId)) return false;
    if (event.action === "observation-added") {
      const observation = event.referenceId === null ? undefined : byObservation.get(event.referenceId);
      if (!observation || observation.briefId !== event.briefId || observation.capturedAt > event.at) return false;
    } else if (event.action === "question-added") {
      const question = event.referenceId === null ? undefined : byQuestion.get(event.referenceId);
      if (!question || question.briefId !== event.briefId || question.capturedAt > event.at) return false;
    } else if (event.referenceId !== null) return false;
  }
  for (const item of observations) {
    if (events.filter((event) => event.action === "observation-added" && event.referenceId === item.id && event.briefId === item.briefId).length !== 1) return false;
  }
  for (const item of questions) {
    if (events.filter((event) => event.action === "question-added" && event.referenceId === item.id && event.briefId === item.briefId).length !== 1) return false;
  }
  return true;
}

export function beginBrief(document: BriefDocument, entry: BriefCase): BriefResult<BriefDocument> {
  if (!validBriefDocument(document) || !validBriefCase(entry) || entry.state !== "draft") return bad("format");
  if (document.briefs.some((item) => item.id === entry.id)) return bad("duplicate");
  const event: BriefEvent = { id: nextBriefId(document, "event"), briefId: entry.id, at: entry.openedAt, action: "created", note: "", referenceId: null };
  const next: BriefDocument = { ...document, briefs: sortIds([...document.briefs, entry]), events: [...document.events, event] };
  return validBriefDocument(next) ? ok(next) : bad("limit");
}
export function addBriefObservation(document: BriefDocument, entry: BriefObservation): BriefResult<BriefDocument> {
  if (!validBriefDocument(document) || !validBriefObservation(entry)) return bad("format");
  if (document.observations.some((item) => item.id === entry.id)) return bad("duplicate");
  const parent = document.briefs.find((item) => item.id === entry.briefId);
  if (!parent || parent.state === "archived") return bad("reference");
  const event: BriefEvent = { id: nextBriefId(document, "event"), briefId: entry.briefId, at: entry.capturedAt, action: "observation-added", referenceId: entry.id, note: "" };
  const next: BriefDocument = { ...document, observations: sortIds([...document.observations, entry]), events: [...document.events, event] };
  return validBriefDocument(next) ? ok(next) : bad("sequence");
}
export function addBriefQuestion(document: BriefDocument, entry: BriefQuestion): BriefResult<BriefDocument> {
  if (!validBriefDocument(document) || !validBriefQuestion(entry)) return bad("format");
  if (document.questions.some((item) => item.id === entry.id)) return bad("duplicate");
  const parent = document.briefs.find((item) => item.id === entry.briefId);
  if (!parent || parent.state === "archived") return bad("reference");
  const event: BriefEvent = { id: nextBriefId(document, "event"), briefId: entry.briefId, at: entry.capturedAt, action: "question-added", referenceId: entry.id, note: "" };
  const next: BriefDocument = { ...document, questions: sortIds([...document.questions, entry]), events: [...document.events, event] };
  return validBriefDocument(next) ? ok(next) : bad("sequence");
}
export function changeBriefState(document: BriefDocument, briefId: string, action: "review-requested" | "archived" | "reopened", at: string): BriefResult<BriefDocument> {
  if (!validBriefDocument(document) || !briefTime(at)) return bad("format");
  const original = document.briefs.find((item) => item.id === briefId);
  if (!original) return bad("reference");
  if ((action === "review-requested" && original.state !== "draft") || (action === "archived" && original.state !== "review")
    || (action === "reopened" && original.state !== "archived")) return bad("transition");
  const state: BriefState = action === "archived" ? "archived" : "review";
  const event: BriefEvent = { id: nextBriefId(document, "event"), briefId, at, action, note: "", referenceId: null };
  const next: BriefDocument = { ...document, briefs: document.briefs.map((item) => item.id === briefId ? { ...item, state } : item), events: [...document.events, event] };
  return validBriefDocument(next) ? ok(next) : bad("sequence");
}
export function nextBriefId(document: BriefDocument, type: "brief" | "observation" | "question" | "event"): string {
  const values = type === "brief" ? document.briefs : type === "question" ? document.questions : type === "event" ? document.events : document.observations;
  let number = values.length + 1;
  const seen = new Set(values.map((item) => item.id));
  while (seen.has(`${type}-${number}`)) number += 1;
  return `${type}-${number}`;
}
export function filterBriefs(document: BriefDocument, filter: BriefFilter): BriefCase[] {
  const query = filter.search?.trim().toLocaleLowerCase() ?? "";
  return document.briefs.filter((item) => (!filter.packId || item.packId === filter.packId)
    && (!filter.state || item.state === filter.state) && (!filter.condition || item.condition === filter.condition)
    && (!query || `${item.id} ${item.packId} ${item.title}`.toLocaleLowerCase().includes(query)))
    .sort((a, b) => a.openedAt.localeCompare(b.openedAt) || a.id.localeCompare(b.id));
}
export function briefSummary(document: BriefDocument): BriefSummary {
  return {
    briefs: document.briefs.length, observations: document.observations.length, questions: document.questions.length,
    events: document.events.length, unknown: document.briefs.filter((item) => item.condition === "UNKNOWN").length
      + document.observations.filter((item) => item.condition === "UNKNOWN").length
      + document.questions.filter((item) => item.state === "UNKNOWN").length,
    unanswered: document.questions.filter((item) => item.state !== "answered").length,
    active: document.briefs.filter((item) => item.state !== "archived").length,
    distinctPacks: new Set(document.briefs.map((item) => item.packId)).size, contentReady: false,
  };
}
export function exportBriefs(document: BriefDocument): BriefResult<string> {
  if (!validBriefDocument(document)) return bad("format");
  const text = JSON.stringify(document, null, 2);
  return new TextEncoder().encode(text).byteLength <= BRIEF_LIMITS.bytes ? ok(text) : bad("limit");
}
export function importBriefs(raw: string): BriefResult<BriefDocument> {
  if (new TextEncoder().encode(raw).byteLength > BRIEF_LIMITS.bytes) return bad("limit");
  try {
    const parsed: unknown = JSON.parse(raw);
    return validBriefDocument(parsed) ? ok(parsed) : bad("format");
  } catch { return bad("format"); }
}
export function previewBriefMerge(current: BriefDocument, incoming: BriefDocument): BriefMergePreview {
  const collisions: string[] = [];
  const adds = (a: readonly { readonly id: string }[], b: readonly { readonly id: string }[], kind: string): number => {
    const ids = new Map(a.map((item) => [item.id, item]));
    for (const item of b) { const old = ids.get(item.id); if (old && !same(old, item)) collisions.push(`${kind}:${item.id}`); }
    return b.filter((item) => !ids.has(item.id)).length;
  };
  const counts = [adds(current.briefs, incoming.briefs, "brief"), adds(current.observations, incoming.observations, "observation"),
    adds(current.questions, incoming.questions, "question"), adds(current.events, incoming.events, "event")];
  return { incoming: incoming.briefs.length, addedBriefs: counts[0] ?? 0, addedObservations: counts[1] ?? 0,
    addedQuestions: counts[2] ?? 0, addedEvents: counts[3] ?? 0, conflicts: collisions,
    canMerge: validBriefDocument(current) && validBriefDocument(incoming) && collisions.length === 0 };
}
export function mergeBriefs(current: BriefDocument, incoming: BriefDocument): BriefResult<BriefDocument> {
  const preview = previewBriefMerge(current, incoming);
  if (!preview.canMerge) return bad("conflict");
  const unite = <T extends { readonly id: string }>(a: readonly T[], b: readonly T[]): T[] => {
    const ids = new Map(a.map((item) => [item.id, item]));
    for (const item of b) if (!ids.has(item.id)) ids.set(item.id, item);
    return [...ids.values()].sort((x, y) => x.id.localeCompare(y.id));
  };
  const merged: BriefDocument = { schema: "the-app.recovery-support-brief.v1", briefs: unite(current.briefs, incoming.briefs),
    observations: unite(current.observations, incoming.observations), questions: unite(current.questions, incoming.questions),
    events: unite(current.events, incoming.events) };
  return validBriefDocument(merged) ? ok(merged) : bad("conflict");
}
/** A note or acknowledgement never authorizes use of installed data. */
export function briefContentReady(): false { return false; }
