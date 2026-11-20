/** A manual, local rehearsal of recovery steps. Rehearsals never certify pack readiness. */
export type DrillLocale = "en" | "fr";
export type DrillCondition = "UNKNOWN" | "offline" | "interrupted" | "missing" | "conflict" | "recovered";
export type DrillTier = "UNKNOWN" | "self-reported" | "documented" | "reviewed";
export type DrillPhase = "draft" | "in-progress" | "paused" | "closed";
export type DrillOutcome = "UNKNOWN" | "pass" | "fail" | "not-run";
export type DrillKind = "inventory" | "offline-open" | "interruption" | "handoff" | "export";
export type DrillEventKind = "started" | "paused" | "resumed" | "closed" | "reopened" | "step-recorded" | "note";
export type DrillIssue = "format" | "limit" | "identity" | "duplicate" | "reference" | "timestamp" | "source" | "transition" | "conflict" | "text";
export const DRILL_LIMITS = Object.freeze({ bytes: 512_000, runs: 200, steps: 2400, events: 5000, text: 1000, id: 90 });
export const DRILL_CONDITIONS: readonly DrillCondition[] = ["UNKNOWN", "offline", "interrupted", "missing", "conflict", "recovered"];
export const DRILL_TIERS: readonly DrillTier[] = ["UNKNOWN", "self-reported", "documented", "reviewed"];
export const DRILL_PHASES: readonly DrillPhase[] = ["draft", "in-progress", "paused", "closed"];
export const DRILL_OUTCOMES: readonly DrillOutcome[] = ["UNKNOWN", "pass", "fail", "not-run"];
export const DRILL_KINDS: readonly DrillKind[] = ["inventory", "offline-open", "interruption", "handoff", "export"];
export const DRILL_EVENTS: readonly DrillEventKind[] = ["started", "paused", "resumed", "closed", "reopened", "step-recorded", "note"];
export interface DrillProvenance {
  readonly source: string;
  readonly licence: string;
  readonly retrievedOn: string;
  readonly tier: DrillTier;
  readonly reference: string;
}
export interface DrillStep {
  readonly id: string;
  readonly runId: string;
  readonly label: string;
  readonly condition: DrillCondition;
  readonly outcome: DrillOutcome;
  readonly note: string;
  readonly recordedAt: string;
  readonly provenance: DrillProvenance;
}
export interface DrillRun {
  readonly id: string;
  readonly packId: string;
  readonly kind: DrillKind;
  readonly phase: DrillPhase;
  readonly title: string;
  readonly openedAt: string;
  readonly condition: DrillCondition;
  readonly provenance: DrillProvenance;
}
export interface DrillEvent {
  readonly id: string;
  readonly runId: string;
  readonly at: string;
  readonly kind: DrillEventKind;
  readonly note: string;
  readonly provenance: DrillProvenance;
  readonly stepId: string | null;
}
export interface DrillDocument {
  readonly schema: "the-app.recovery-drill-run.v1";
  readonly runs: readonly DrillRun[];
  readonly steps: readonly DrillStep[];
  readonly events: readonly DrillEvent[];
}
export type DrillResult<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly issue: DrillIssue };
export interface DrillMergePreview {
  readonly newRuns: number;
  readonly existingRuns: number;
  readonly runConflicts: number;
  readonly newSteps: number;
  readonly existingSteps: number;
  readonly stepConflicts: number;
  readonly newEvents: number;
  readonly existingEvents: number;
  readonly eventConflicts: number;
}
export interface DrillFilter {
  readonly packId?: string;
  readonly kind?: DrillKind;
  readonly phase?: DrillPhase;
  readonly condition?: DrillCondition;
  readonly query?: string;
}
export interface DrillSummary {
  readonly runs: number;
  readonly active: number;
  readonly paused: number;
  readonly closed: number;
  readonly steps: number;
  readonly passed: number;
  readonly failed: number;
  readonly unknown: number;
  readonly notRun: number;
  readonly events: number;
  readonly distinctPacks: number;
  readonly contentReady: false;
}
export const emptyDrillDocument = (): DrillDocument => ({ schema: "the-app.recovery-drill-run.v1", runs: [], steps: [], events: [] });
const success = <T>(value: T): DrillResult<T> => ({ ok: true, value });
const reject = <T>(issue: DrillIssue): DrillResult<T> => ({ ok: false, issue });
const object = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const text = (v: unknown, max: number = DRILL_LIMITS.text): v is string => typeof v === "string" && v.length <= max && [...v].every((ch) => {
  const code = ch.charCodeAt(0);
  return code === 9 || code === 10 || code === 13 || code >= 32;
});
const identifier = (v: unknown): v is string => text(v, DRILL_LIMITS.id) && v.length > 0 && /^[A-Za-z0-9][A-Za-z0-9._-]*$/u.test(v);
const day = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/u.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`)) && new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) === v;
const timestamp = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/u.test(v) && !Number.isNaN(Date.parse(v));
const member = <T extends string>(v: unknown, items: readonly T[]): v is T => typeof v === "string" && items.includes(v as T);
const same = (left: unknown, right: unknown): boolean => JSON.stringify(left) === JSON.stringify(right);

export function checkDrillProvenance(value: unknown): DrillResult<DrillProvenance> {
  if (!object(value)) return reject("source");
  if (!text(value.source) || !value.source.trim() || !text(value.licence) || !value.licence.trim()) return reject("source");
  if (!day(value.retrievedOn)) return reject("source");
  if (!member(value.tier, DRILL_TIERS)) return reject("source");
  if (!text(value.reference) || !value.reference.trim()) return reject("source");
  return success({ source: value.source, licence: value.licence, retrievedOn: value.retrievedOn, tier: value.tier, reference: value.reference });
}
export function checkDrillRun(value: unknown): DrillResult<DrillRun> {
  if (!object(value)) return reject("format");
  if (!identifier(value.id) || !identifier(value.packId)) return reject("identity");
  if (!member(value.kind, DRILL_KINDS) || !member(value.phase, DRILL_PHASES) || !member(value.condition, DRILL_CONDITIONS)) return reject("format");
  if (!text(value.title) || !value.title.trim()) return reject("text");
  if (!timestamp(value.openedAt)) return reject("timestamp");
  const provenance = checkDrillProvenance(value.provenance);
  if (!provenance.ok) return reject(provenance.issue);
  return success({ id: value.id, packId: value.packId, kind: value.kind, phase: value.phase, condition: value.condition, title: value.title, openedAt: value.openedAt, provenance: provenance.value });
}
export function checkDrillStep(value: unknown): DrillResult<DrillStep> {
  if (!object(value)) return reject("format");
  if (!identifier(value.id) || !identifier(value.runId)) return reject("identity");
  if (!text(value.label) || !value.label.trim() || !text(value.note)) return reject("text");
  if (!member(value.condition, DRILL_CONDITIONS) || !member(value.outcome, DRILL_OUTCOMES)) return reject("format");
  if (!timestamp(value.recordedAt)) return reject("timestamp");
  const provenance = checkDrillProvenance(value.provenance);
  if (!provenance.ok) return reject(provenance.issue);
  return success({ id: value.id, runId: value.runId, label: value.label, condition: value.condition, outcome: value.outcome, note: value.note, recordedAt: value.recordedAt, provenance: provenance.value });
}
export function checkDrillEvent(value: unknown): DrillResult<DrillEvent> {
  if (!object(value)) return reject("format");
  if (!identifier(value.id) || !identifier(value.runId)) return reject("identity");
  if (!member(value.kind, DRILL_EVENTS) || !text(value.note)) return reject("format");
  if (!timestamp(value.at)) return reject("timestamp");
  if (value.stepId !== null && !identifier(value.stepId)) return reject("reference");
  if (value.kind === "step-recorded" && value.stepId === null) return reject("reference");
  if (value.kind !== "step-recorded" && value.stepId !== null) return reject("reference");
  const provenance = checkDrillProvenance(value.provenance);
  if (!provenance.ok) return reject(provenance.issue);
  return success({ id: value.id, runId: value.runId, at: value.at, kind: value.kind, note: value.note, provenance: provenance.value, stepId: value.stepId });
}
export function checkDrillDocument(value: unknown): DrillResult<DrillDocument> {
  if (!object(value) || value.schema !== "the-app.recovery-drill-run.v1") return reject("format");
  if (!Array.isArray(value.runs) || !Array.isArray(value.steps) || !Array.isArray(value.events)) return reject("format");
  if (value.runs.length > DRILL_LIMITS.runs || value.steps.length > DRILL_LIMITS.steps || value.events.length > DRILL_LIMITS.events) return reject("limit");
  const runs: DrillRun[] = [];
  const steps: DrillStep[] = [];
  const events: DrillEvent[] = [];
  const runIds = new Set<string>();
  const stepIds = new Set<string>();
  const eventIds = new Set<string>();
  for (const raw of value.runs) {
    const result = checkDrillRun(raw);
    if (!result.ok) return reject(result.issue);
    if (runIds.has(result.value.id)) return reject("duplicate");
    runIds.add(result.value.id);
    runs.push(result.value);
  }
  for (const raw of value.steps) {
    const result = checkDrillStep(raw);
    if (!result.ok) return reject(result.issue);
    if (stepIds.has(result.value.id)) return reject("duplicate");
    if (!runIds.has(result.value.runId)) return reject("reference");
    if (result.value.recordedAt < runs.find((run) => run.id === result.value.runId)!.openedAt) return reject("timestamp");
    stepIds.add(result.value.id);
    steps.push(result.value);
  }
  for (const raw of value.events) {
    const result = checkDrillEvent(raw);
    if (!result.ok) return reject(result.issue);
    if (eventIds.has(result.value.id)) return reject("duplicate");
    if (!runIds.has(result.value.runId)) return reject("reference");
    if (result.value.stepId !== null && !stepIds.has(result.value.stepId)) return reject("reference");
    if (result.value.stepId !== null && steps.find((step) => step.id === result.value.stepId)?.runId !== result.value.runId) return reject("reference");
    if (result.value.at < runs.find((run) => run.id === result.value.runId)!.openedAt) return reject("timestamp");
    eventIds.add(result.value.id);
    events.push(result.value);
  }
  return success({ schema: "the-app.recovery-drill-run.v1", runs, steps, events });
}
export function addDrillRun(document: DrillDocument, run: DrillRun): DrillResult<DrillDocument> {
  const checked = checkDrillRun(run);
  if (!checked.ok) return reject(checked.issue);
  if (document.runs.length >= DRILL_LIMITS.runs) return reject("limit");
  if (document.runs.some((entry) => entry.id === run.id)) return reject("duplicate");
  return checkDrillDocument({ ...document, runs: [...document.runs, checked.value] });
}
export function recordDrillStep(document: DrillDocument, step: DrillStep): DrillResult<DrillDocument> {
  const checked = checkDrillStep(step);
  if (!checked.ok) return reject(checked.issue);
  if (document.steps.length >= DRILL_LIMITS.steps) return reject("limit");
  if (document.steps.some((entry) => entry.id === step.id)) return reject("duplicate");
  const run = document.runs.find((entry) => entry.id === step.runId);
  if (!run) return reject("reference");
  if (run.phase === "closed" || run.phase === "paused" || run.phase === "draft") return reject("transition");
  return checkDrillDocument({ ...document, steps: [...document.steps, checked.value] });
}
const nextPhases: Readonly<Record<DrillPhase, readonly DrillPhase[]>> = {
  draft: ["in-progress"], "in-progress": ["paused", "closed"], paused: ["in-progress", "closed"], closed: ["in-progress"],
};
export function changeDrillPhase(document: DrillDocument, runId: string, phase: DrillPhase): DrillResult<DrillDocument> {
  const run = document.runs.find((item) => item.id === runId);
  if (!run) return reject("reference");
  if (!nextPhases[run.phase].includes(phase)) return reject("transition");
  return checkDrillDocument({ ...document, runs: document.runs.map((item) => item.id === runId ? { ...item, phase } : item) });
}
export function appendDrillEvent(document: DrillDocument, event: DrillEvent): DrillResult<DrillDocument> {
  const checked = checkDrillEvent(event);
  if (!checked.ok) return reject(checked.issue);
  if (document.events.length >= DRILL_LIMITS.events) return reject("limit");
  if (document.events.some((item) => item.id === event.id)) return reject("duplicate");
  return checkDrillDocument({ ...document, events: [...document.events, checked.value] });
}
export function nextDrillId(document: DrillDocument, type: "run" | "step" | "event"): string {
  const collection = type === "run" ? document.runs : type === "step" ? document.steps : document.events;
  const ids = new Set(collection.map((item) => item.id));
  let index = collection.length + 1;
  while (ids.has(`${type}-${index}`)) index += 1;
  return `${type}-${index}`;
}
export function filterDrillRuns(document: DrillDocument, filter: DrillFilter): readonly DrillRun[] {
  const query = (filter.query ?? "").trim().toLocaleLowerCase();
  return document.runs.filter((run) =>
    (filter.packId === undefined || run.packId === filter.packId) &&
    (filter.kind === undefined || run.kind === filter.kind) &&
    (filter.phase === undefined || run.phase === filter.phase) &&
    (filter.condition === undefined || run.condition === filter.condition) &&
    (!query || [run.title, run.packId, run.id, run.provenance.source].some((s) => s.toLocaleLowerCase().includes(query)))
  ).sort((a, b) => a.openedAt.localeCompare(b.openedAt) || a.id.localeCompare(b.id));
}
export function stepsForDrill(document: DrillDocument, runId: string): readonly DrillStep[] {
  return document.steps.filter((step) => step.runId === runId).sort((a, b) => a.recordedAt.localeCompare(b.recordedAt) || a.id.localeCompare(b.id));
}
export function eventsForDrill(document: DrillDocument, runId: string): readonly DrillEvent[] {
  return document.events.filter((event) => event.runId === runId).sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id));
}
export function summarizeDrills(document: DrillDocument): DrillSummary {
  return {
    runs: document.runs.length,
    active: document.runs.filter((item) => item.phase === "in-progress").length,
    paused: document.runs.filter((item) => item.phase === "paused").length,
    closed: document.runs.filter((item) => item.phase === "closed").length,
    steps: document.steps.length,
    passed: document.steps.filter((item) => item.outcome === "pass").length,
    failed: document.steps.filter((item) => item.outcome === "fail").length,
    unknown: document.steps.filter((item) => item.outcome === "UNKNOWN").length,
    notRun: document.steps.filter((item) => item.outcome === "not-run").length,
    events: document.events.length,
    distinctPacks: new Set(document.runs.map((item) => item.packId)).size,
    contentReady: false,
  };
}
function counts<T extends { readonly id: string }>(a: readonly T[], b: readonly T[]): [number, number, number] {
  const prior = new Map(a.map((item) => [item.id, item]));
  let added = 0; let existing = 0; let conflicts = 0;
  for (const item of b) {
    const current = prior.get(item.id);
    if (!current) added += 1;
    else if (same(current, item)) existing += 1;
    else conflicts += 1;
  }
  return [added, existing, conflicts];
}
export function previewDrillMerge(current: DrillDocument, incoming: DrillDocument): DrillMergePreview {
  const [newRuns, existingRuns, runConflicts] = counts(current.runs, incoming.runs);
  const [newSteps, existingSteps, stepConflicts] = counts(current.steps, incoming.steps);
  const [newEvents, existingEvents, eventConflicts] = counts(current.events, incoming.events);
  return { newRuns, existingRuns, runConflicts, newSteps, existingSteps, stepConflicts, newEvents, existingEvents, eventConflicts };
}
export function mergeDrillDocuments(current: DrillDocument, incoming: DrillDocument): DrillResult<DrillDocument> {
  const preview = previewDrillMerge(current, incoming);
  if (preview.runConflicts || preview.stepConflicts || preview.eventConflicts) return reject("conflict");
  return checkDrillDocument({
    schema: current.schema,
    runs: [...current.runs, ...incoming.runs.filter((item) => !current.runs.some((old) => old.id === item.id))],
    steps: [...current.steps, ...incoming.steps.filter((item) => !current.steps.some((old) => old.id === item.id))],
    events: [...current.events, ...incoming.events.filter((item) => !current.events.some((old) => old.id === item.id))],
  });
}
export function serializeDrills(document: DrillDocument): DrillResult<string> {
  const checked = checkDrillDocument(document);
  if (!checked.ok) return reject(checked.issue);
  const output = JSON.stringify(checked.value, null, 2);
  if (new TextEncoder().encode(output).length > DRILL_LIMITS.bytes) return reject("limit");
  return success(output);
}
export function parseDrills(raw: string): DrillResult<DrillDocument> {
  if (new TextEncoder().encode(raw).length > DRILL_LIMITS.bytes) return reject("limit");
  try { return checkDrillDocument(JSON.parse(raw) as unknown); } catch { return reject("format"); }
}
/** Review records never change the installed pack or establish content readiness. */
export function drillContentReady(): false { return false; }
