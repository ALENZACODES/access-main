/** User-directed offline recovery review. No step establishes installed pack usability. */
export type GuidedLocale = "en" | "fr";
export type GuidedCondition = "UNKNOWN" | "interrupted" | "missing-data" | "permission" | "storage" | "integrity" | "handoff";
export type GuidedEvidence = "UNKNOWN" | "observed" | "reported" | "documented" | "disputed";
export type GuidedTier = "UNKNOWN" | "self-reported" | "documented" | "reviewed";
export type GuidedPhase = "draft" | "review" | "closed";
export type GuidedOutcome = "UNKNOWN" | "needs-action" | "noted" | "deferred";
export type GuidedAction = "opened" | "step-recorded" | "note-added" | "review-requested" | "reopened" | "closed";
export type GuidedIssue = "format" | "limit" | "identity" | "duplicate" | "reference" | "source" | "date" | "timestamp" | "text" | "transition" | "conflict" | "order";
export type GuidedTopic = "identify" | "connection" | "storage" | "permissions" | "integrity" | "transfer" | "follow-up";
export const GUIDED_TOPICS: readonly GuidedTopic[] = ["identify", "connection", "storage", "permissions", "integrity", "transfer", "follow-up"];
export const GUIDED_CONDITIONS: readonly GuidedCondition[] = ["UNKNOWN", "interrupted", "missing-data", "permission", "storage", "integrity", "handoff"];
export const GUIDED_EVIDENCE: readonly GuidedEvidence[] = ["UNKNOWN", "observed", "reported", "documented", "disputed"];
export const GUIDED_TIERS: readonly GuidedTier[] = ["UNKNOWN", "self-reported", "documented", "reviewed"];
export const GUIDED_PHASES: readonly GuidedPhase[] = ["draft", "review", "closed"];
export const GUIDED_OUTCOMES: readonly GuidedOutcome[] = ["UNKNOWN", "needs-action", "noted", "deferred"];
export const GUIDED_ACTIONS: readonly GuidedAction[] = ["opened", "step-recorded", "note-added", "review-requested", "reopened", "closed"];
export const GUIDED_LIMITS = Object.freeze({ bytes: 450_000, cases: 240, steps: 1600, events: 3200, text: 700, id: 100 });

export interface GuidedSource {
  readonly name: string;
  readonly licence: string;
  readonly retrievedOn: string;
  readonly reference: string;
  readonly tier: GuidedTier;
}
export interface GuidedCase {
  readonly id: string;
  readonly packId: string;
  readonly condition: GuidedCondition;
  readonly phase: GuidedPhase;
  readonly title: string;
  readonly openedAt: string;
  readonly source: GuidedSource;
}
export interface GuidedStep {
  readonly id: string;
  readonly caseId: string;
  readonly topic: GuidedTopic;
  readonly evidence: GuidedEvidence;
  readonly outcome: GuidedOutcome;
  readonly note: string;
  readonly capturedAt: string;
  readonly source: GuidedSource;
}
export interface GuidedEvent {
  readonly id: string;
  readonly caseId: string;
  readonly action: GuidedAction;
  readonly at: string;
  readonly note: string;
  readonly stepId: string | null;
}
export interface GuidedDocument {
  readonly schema: "the-app.recovery-guided-review.v1";
  readonly cases: readonly GuidedCase[];
  readonly steps: readonly GuidedStep[];
  readonly events: readonly GuidedEvent[];
}
export type GuidedResult<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly issue: GuidedIssue };
export interface GuidedMergePreview {
  readonly incomingCases: number;
  readonly incomingSteps: number;
  readonly incomingEvents: number;
  readonly newCases: number;
  readonly newSteps: number;
  readonly newEvents: number;
  readonly conflicts: readonly string[];
  readonly canMerge: boolean;
}
export interface GuidedFilter {
  readonly packId?: string;
  readonly phase?: GuidedPhase;
  readonly condition?: GuidedCondition;
  readonly query?: string;
}
export interface GuidedCounts {
  readonly cases: number;
  readonly steps: number;
  readonly events: number;
  readonly unknown: number;
  readonly disputed: number;
  readonly open: number;
  readonly distinctPacks: number;
  readonly contentReady: false;
}
const good = <T>(value: T): GuidedResult<T> => ({ ok: true, value });
const bad = <T>(issue: GuidedIssue): GuidedResult<T> => ({ ok: false, issue });
const obj = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const validId = (value: unknown): value is string => typeof value === "string" && value.length > 0 && value.length <= GUIDED_LIMITS.id && /^[A-Za-z0-9][A-Za-z0-9._-]*$/u.test(value);
const validDay = (value: unknown): value is string => {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) return false;
  const time = Date.parse(`${value}T00:00:00.000Z`);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value;
};
const validTime = (value: unknown): value is string => typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/u.test(value) && validDay(value.slice(0, 10)) && Number.isFinite(Date.parse(value));
const oneOf = <T extends string>(value: unknown, choices: readonly T[]): value is T => typeof value === "string" && choices.includes(value as T);
const text = (value: unknown, limit = GUIDED_LIMITS.text): value is string => typeof value === "string" && value.length <= limit && [...value].every((character) => {
  const code = character.charCodeAt(0);
  return code === 9 || code === 10 || code === 13 || code >= 32;
});
const exactly = (value: Record<string, unknown>, keys: readonly string[]): boolean => {
  const actual = Object.keys(value);
  return actual.length === keys.length && actual.every((key) => keys.includes(key));
};
const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);
const stableSort = <T extends { readonly id: string }>(values: readonly T[]): T[] => [...values].sort((a, b) => a.id.localeCompare(b.id));
export const emptyGuidedDocument = (): GuidedDocument => ({ schema: "the-app.recovery-guided-review.v1", cases: [], steps: [], events: [] });

export function checkGuidedSource(value: unknown): value is GuidedSource {
  if (!obj(value) || !exactly(value, ["name", "licence", "retrievedOn", "reference", "tier"])) return false;
  return text(value.name) && value.name.trim().length > 0 && text(value.licence) && value.licence.trim().length > 0
    && validDay(value.retrievedOn) && text(value.reference) && value.reference.trim().length > 0
    && oneOf(value.tier, GUIDED_TIERS);
}
export function checkGuidedCase(value: unknown): value is GuidedCase {
  if (!obj(value) || !exactly(value, ["id", "packId", "condition", "phase", "title", "openedAt", "source"])) return false;
  return validId(value.id) && validId(value.packId) && oneOf(value.condition, GUIDED_CONDITIONS)
    && oneOf(value.phase, GUIDED_PHASES) && text(value.title) && value.title.trim().length > 0
    && validTime(value.openedAt) && checkGuidedSource(value.source)
    && value.source.retrievedOn <= value.openedAt.slice(0, 10);
}
export function checkGuidedStep(value: unknown): value is GuidedStep {
  if (!obj(value) || !exactly(value, ["id", "caseId", "topic", "evidence", "outcome", "note", "capturedAt", "source"])) return false;
  return validId(value.id) && validId(value.caseId) && oneOf(value.topic, GUIDED_TOPICS)
    && oneOf(value.evidence, GUIDED_EVIDENCE) && oneOf(value.outcome, GUIDED_OUTCOMES)
    && text(value.note) && validTime(value.capturedAt) && checkGuidedSource(value.source)
    && value.source.retrievedOn <= value.capturedAt.slice(0, 10);
}
export function checkGuidedEvent(value: unknown): value is GuidedEvent {
  if (!obj(value) || !exactly(value, ["id", "caseId", "action", "at", "note", "stepId"])) return false;
  return validId(value.id) && validId(value.caseId) && oneOf(value.action, GUIDED_ACTIONS)
    && validTime(value.at) && text(value.note) && (value.stepId === null || validId(value.stepId));
}
export function guidedPhaseFromEvents(events: readonly GuidedEvent[]): GuidedPhase {
  let phase: GuidedPhase = "draft";
  for (const event of events) {
    if (event.action === "review-requested") phase = "review";
    if (event.action === "reopened") phase = "review";
    if (event.action === "closed") phase = "closed";
  }
  return phase;
}
export function checkGuidedDocument(value: unknown): value is GuidedDocument {
  if (!obj(value) || !exactly(value, ["schema", "cases", "steps", "events"])) return false;
  if (value.schema !== "the-app.recovery-guided-review.v1" || !Array.isArray(value.cases) || !Array.isArray(value.steps) || !Array.isArray(value.events)) return false;
  if (value.cases.length > GUIDED_LIMITS.cases || value.steps.length > GUIDED_LIMITS.steps || value.events.length > GUIDED_LIMITS.events) return false;
  if (!value.cases.every(checkGuidedCase) || !value.steps.every(checkGuidedStep) || !value.events.every(checkGuidedEvent)) return false;
  const cases: GuidedCase[] = value.cases;
  const steps: GuidedStep[] = value.steps;
  const events: GuidedEvent[] = value.events;
  if (new Set(cases.map((item) => item.id)).size !== cases.length) return false;
  if (new Set(steps.map((item) => item.id)).size !== steps.length) return false;
  if (new Set(events.map((item) => item.id)).size !== events.length) return false;
  const byCase = new Map(cases.map((item) => [item.id, item]));
  const byStep = new Map(steps.map((item) => [item.id, item]));
  for (const step of steps) {
    const parent = byCase.get(step.caseId);
    if (!parent || step.capturedAt < parent.openedAt) return false;
  }
  for (const event of events) {
    const parent = byCase.get(event.caseId);
    if (!parent || event.at < parent.openedAt) return false;
    if (event.stepId !== null) {
      const step = byStep.get(event.stepId);
      if (!step || step.caseId !== event.caseId || step.capturedAt > event.at) return false;
    }
    if (event.action === "step-recorded" && event.stepId === null) return false;
    if (event.action !== "step-recorded" && event.stepId !== null) return false;
  }
  for (const entry of cases) {
    const history = events.filter((event) => event.caseId === entry.id).sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id));
    let phase: GuidedPhase = "draft";
    for (const event of history) {
      if (event.action === "review-requested") { if (phase !== "draft") return false; phase = "review"; }
      if (event.action === "closed") { if (phase !== "review") return false; phase = "closed"; }
      if (event.action === "reopened") { if (phase !== "closed") return false; phase = "review"; }
    }
    if (phase !== entry.phase) return false;
  }
  return true;
}
export function guidedContentReady(_document: GuidedDocument): false { void _document; return false; }
export function nextGuidedId(document: GuidedDocument, category: "case" | "step" | "event"): string {
  const used = new Set((category === "case" ? document.cases : category === "step" ? document.steps : document.events).map((item) => item.id));
  let i = 1;
  while (used.has(`${category}-${i}`)) i++;
  return `${category}-${i}`;
}
export function beginGuidedCase(document: GuidedDocument, item: GuidedCase): GuidedResult<GuidedDocument> {
  if (!checkGuidedDocument(document)) return bad("format");
  if (!checkGuidedCase(item)) return bad("source");
  if (item.phase !== "draft") return bad("transition");
  if (document.cases.some((entry) => entry.id === item.id)) return bad("duplicate");
  if (document.cases.length >= GUIDED_LIMITS.cases) return bad("limit");
  return good({ ...document, cases: [...document.cases, item] });
}
export function recordGuidedStep(document: GuidedDocument, step: GuidedStep): GuidedResult<GuidedDocument> {
  if (!checkGuidedDocument(document)) return bad("format");
  if (!checkGuidedStep(step)) return bad("source");
  const parent = document.cases.find((item) => item.id === step.caseId);
  if (!parent) return bad("reference");
  if (parent.phase === "closed") return bad("transition");
  if (step.capturedAt < parent.openedAt) return bad("order");
  if (document.steps.some((item) => item.id === step.id)) return bad("duplicate");
  if (document.steps.length >= GUIDED_LIMITS.steps) return bad("limit");
  const event: GuidedEvent = { id: nextGuidedId(document, "event"), caseId: step.caseId, action: "step-recorded", at: step.capturedAt, note: "", stepId: step.id };
  if (document.events.length >= GUIDED_LIMITS.events) return bad("limit");
  const result: GuidedDocument = { ...document, steps: [...document.steps, step], events: [...document.events, event] };
  return checkGuidedDocument(result) ? good(result) : bad("order");
}
export function appendGuidedEvent(document: GuidedDocument, event: GuidedEvent): GuidedResult<GuidedDocument> {
  if (!checkGuidedDocument(document)) return bad("format");
  if (!checkGuidedEvent(event)) return bad("format");
  const parent = document.cases.find((item) => item.id === event.caseId);
  if (!parent) return bad("reference");
  if (event.stepId !== null || event.action === "step-recorded") return bad("reference");
  if (event.at < parent.openedAt) return bad("order");
  const previous = document.events.filter((item) => item.caseId === event.caseId).reduce((max, item) => max > item.at ? max : item.at, parent.openedAt);
  if (event.at < previous) return bad("order");
  if (document.events.some((item) => item.id === event.id)) return bad("duplicate");
  if (document.events.length >= GUIDED_LIMITS.events) return bad("limit");
  if (event.action === "review-requested" && parent.phase !== "draft") return bad("transition");
  if (event.action === "closed" && parent.phase !== "review") return bad("transition");
  if (event.action === "reopened" && parent.phase !== "closed") return bad("transition");
  if (parent.phase === "closed" && !["reopened"].includes(event.action)) return bad("transition");
  const phase: GuidedPhase = event.action === "closed" ? "closed" : event.action === "reopened" || event.action === "review-requested" ? "review" : parent.phase;
  const cases = document.cases.map((item) => item.id === event.caseId ? { ...item, phase } : item);
  const result: GuidedDocument = { ...document, cases, events: [...document.events, event] };
  return checkGuidedDocument(result) ? good(result) : bad("transition");
}
export function filterGuidedCases(document: GuidedDocument, filter: GuidedFilter): readonly GuidedCase[] {
  const query = (filter.query ?? "").toLocaleLowerCase();
  return stableSort(document.cases.filter((item) =>
    (filter.packId === undefined || item.packId === filter.packId) &&
    (filter.phase === undefined || item.phase === filter.phase) &&
    (filter.condition === undefined || item.condition === filter.condition) &&
    (`${item.id} ${item.packId} ${item.title} ${item.source.name}`.toLocaleLowerCase().includes(query))));
}
export function guidedSummary(document: GuidedDocument): GuidedCounts {
  return { cases: document.cases.length, steps: document.steps.length, events: document.events.length,
    unknown: document.cases.filter((item) => item.condition === "UNKNOWN").length + document.steps.filter((item) => item.evidence === "UNKNOWN").length,
    disputed: document.steps.filter((item) => item.evidence === "disputed").length,
    open: document.cases.filter((item) => item.phase !== "closed").length,
    distinctPacks: new Set(document.cases.map((item) => item.packId)).size, contentReady: false };
}
export function guidedEventsFor(document: GuidedDocument, caseId: string): readonly GuidedEvent[] {
  return document.events.filter((event) => event.caseId === caseId).sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id));
}
export function guidedStepsFor(document: GuidedDocument, caseId: string): readonly GuidedStep[] {
  return document.steps.filter((step) => step.caseId === caseId).sort((a, b) => a.capturedAt.localeCompare(b.capturedAt) || a.id.localeCompare(b.id));
}
export function serializeGuidedDocument(document: GuidedDocument): GuidedResult<string> {
  if (!checkGuidedDocument(document)) return bad("format");
  const value = JSON.stringify({ ...document, cases: stableSort(document.cases), steps: stableSort(document.steps), events: stableSort(document.events) }, null, 2);
  if (new TextEncoder().encode(value).byteLength > GUIDED_LIMITS.bytes) return bad("limit");
  return good(value);
}
export function parseGuidedDocument(input: string): GuidedResult<GuidedDocument> {
  if (new TextEncoder().encode(input).byteLength > GUIDED_LIMITS.bytes) return bad("limit");
  let value: unknown;
  try { value = JSON.parse(input); } catch { return bad("format"); }
  return checkGuidedDocument(value) ? good(value) : bad("format");
}
export function previewGuidedMerge(current: GuidedDocument, incoming: GuidedDocument): GuidedMergePreview {
  const conflicts: string[] = [];
  if (!checkGuidedDocument(current) || !checkGuidedDocument(incoming)) return { incomingCases: 0, incomingSteps: 0, incomingEvents: 0, newCases: 0, newSteps: 0, newEvents: 0, conflicts: ["format"], canMerge: false };
  const compare = <T extends { readonly id: string }>(before: readonly T[], after: readonly T[], label: string): number => {
    const map = new Map(before.map((item) => [item.id, item]));
    for (const item of after) if (map.has(item.id) && !same(map.get(item.id), item)) conflicts.push(`${label}:${item.id}`);
    return after.filter((item) => !map.has(item.id)).length;
  };
  const newCases = compare(current.cases, incoming.cases, "case");
  const newSteps = compare(current.steps, incoming.steps, "step");
  const newEvents = compare(current.events, incoming.events, "event");
  const all = { ...current,
    cases: [...current.cases, ...incoming.cases.filter((item) => !current.cases.some((existing) => existing.id === item.id))],
    steps: [...current.steps, ...incoming.steps.filter((item) => !current.steps.some((existing) => existing.id === item.id))],
    events: [...current.events, ...incoming.events.filter((item) => !current.events.some((existing) => existing.id === item.id))] };
  if (!checkGuidedDocument(all)) conflicts.push("combined-history");
  return { incomingCases: incoming.cases.length, incomingSteps: incoming.steps.length, incomingEvents: incoming.events.length,
    newCases, newSteps, newEvents, conflicts, canMerge: conflicts.length === 0 };
}
export function mergeGuidedDocuments(current: GuidedDocument, incoming: GuidedDocument): GuidedResult<GuidedDocument> {
  const preview = previewGuidedMerge(current, incoming);
  if (!preview.canMerge) return bad("conflict");
  const exists = <T extends { readonly id: string }>(items: readonly T[], id: string): boolean => items.some((item) => item.id === id);
  return good({ ...current,
    cases: stableSort([...current.cases, ...incoming.cases.filter((item) => !exists(current.cases, item.id))]),
    steps: stableSort([...current.steps, ...incoming.steps.filter((item) => !exists(current.steps, item.id))]),
    events: stableSort([...current.events, ...incoming.events.filter((item) => !exists(current.events, item.id))]) });
}
