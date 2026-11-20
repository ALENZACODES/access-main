import type { RegionManifest } from "./regionDownload";
import type { RegionInventory } from "./regionInventory";

/** Device-local notes about possible disruptions, never an assessment of a place. */
export const CONTINGENCY_MAX_STEPS = 80;
export const CONTINGENCY_MAX_EVENTS = 320;
export const CONTINGENCY_MAX_TEXT = 1200;
export const CONTINGENCY_MAX_FILE_BYTES = 262144;
export const CONTINGENCY_PAGE_LIMIT = 25;
export type CheckpointKind = "arrival" | "entrance" | "path" | "lift" | "transport" | "washroom" | "rest" | "departure" | "other";
export type CheckpointSignal = "UNKNOWN" | "noted" | "issue" | "changed" | "not-applicable";
export type FollowUp = "open" | "question-ready" | "alternative-noted" | "closed-note";
export type SourceStatus = "saved" | "UNKNOWN";
export type PlanFilter = "all" | "open" | "issue" | "UNKNOWN" | "closed-note";
export type PlanSort = "listed" | "recent" | "kind";
export interface SourceReading {
  readonly cellId: string | null;
  readonly state: SourceStatus;
  readonly source: string;
  readonly licence: string;
  readonly date: string;
  readonly expectedBytes: number | null;
}
export interface ContingencyStep {
  readonly id: string;
  readonly kind: CheckpointKind;
  readonly title: string;
  readonly question: string;
  readonly alternative: string;
  readonly note: string;
  readonly signal: CheckpointSignal;
  readonly followUp: FollowUp;
  readonly source: SourceReading;
  readonly editedAt: string;
}
export interface ContingencyEvent {
  readonly id: string;
  readonly stepId: string;
  readonly at: string;
  readonly action: "created" | "observed" | "question" | "alternative" | "note" | "follow-up" | "source" | "reordered";
  readonly detail: string;
}
export interface ContingencyPlan {
  readonly schema: "offline-contingency-v1";
  readonly regionId: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly steps: readonly ContingencyStep[];
  readonly events: readonly ContingencyEvent[];
}
export interface StepPatch {
  readonly question?: string;
  readonly alternative?: string;
  readonly note?: string;
  readonly signal?: CheckpointSignal;
  readonly followUp?: FollowUp;
  readonly title?: string;
}
export interface PlanTotals {
  readonly listed: number;
  readonly open: number;
  readonly issues: number;
  readonly unknownSignals: number;
  readonly closedNotes: number;
  readonly savedSources: number;
  readonly unknownSources: number;
  readonly alternatives: number;
}
export interface PlanPage {
  readonly rows: readonly ContingencyStep[];
  readonly total: number;
  readonly next: boolean;
  readonly previous: boolean;
}
export interface PlanQuery {
  readonly filter: PlanFilter;
  readonly sort: PlanSort;
  readonly search: string;
  readonly offset: number;
  readonly limit: number;
}
const SIGNALS: readonly CheckpointSignal[] = ["UNKNOWN", "noted", "issue", "changed", "not-applicable"];
const FOLLOW_UPS: readonly FollowUp[] = ["open", "question-ready", "alternative-noted", "closed-note"];
const KINDS: readonly CheckpointKind[] = ["arrival", "entrance", "path", "lift", "transport", "washroom", "rest", "departure", "other"];
const ACTIONS: readonly ContingencyEvent["action"][] = ["created", "observed", "question", "alternative", "note", "follow-up", "source", "reordered"];
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function timestamp(value: unknown): asserts value is string {
  if (typeof value !== "string" || !ISO.test(value) || Number.isNaN(Date.parse(value)) ||
    new Date(value).toISOString() !== value) throw new TypeError("Invalid timestamp");
}
function identifier(value: unknown): asserts value is string {
  if (typeof value !== "string" || value.trim().length < 1 || value.length > 160 ||
    [...value].some((c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127)) {
    throw new TypeError("Invalid identifier");
  }
}
function noteText(value: unknown, allowBlank = true): asserts value is string {
  if (typeof value !== "string" || value.length > CONTINGENCY_MAX_TEXT ||
    (!allowBlank && !value.trim()) || value.includes("\u0000")) throw new TypeError("Invalid text");
}
function sourceReading(value: unknown): SourceReading {
  if (!record(value)) throw new TypeError("Invalid source");
  if (value.cellId !== null) identifier(value.cellId);
  if (value.state !== "saved" && value.state !== "UNKNOWN") throw new TypeError("Invalid source status");
  for (const key of ["source", "licence", "date"] as const) {
    noteText(value[key]);
    if (value[key].length > 160) throw new TypeError("Invalid source field");
  }
  if (value.expectedBytes !== null && (!Number.isSafeInteger(value.expectedBytes) ||
    typeof value.expectedBytes !== "number" || value.expectedBytes < 0)) throw new TypeError("Invalid byte count");
  if (value.cellId === null && (value.state !== "UNKNOWN" || value.expectedBytes !== null)) {
    throw new TypeError("Unlisted source cannot be saved");
  }
  return {
    cellId: value.cellId, state: value.state,
    source: value.source as string, licence: value.licence as string,
    date: value.date as string, expectedBytes: value.expectedBytes as number | null,
  };
}
export function emptySource(): SourceReading {
  return { cellId: null, state: "UNKNOWN", source: "UNKNOWN", licence: "UNKNOWN", date: "UNKNOWN", expectedBytes: null };
}
/** A manifest alone never establishes that a copy is currently saved. */
export function captureSource(manifest: RegionManifest, inventory: RegionInventory | null, cellId: string | null): SourceReading {
  if (cellId === null) return emptySource();
  const listed = manifest.cells.find((cell) => cell.id === cellId);
  if (listed === undefined) return emptySource();
  const reading = inventory?.regionId === manifest.regionId &&
    inventory.cells.length === manifest.cells.length &&
    new Set(inventory.cells.map((cell) => cell.id)).size === manifest.cells.length ?
      inventory.cells.find((cell) => cell.id === cellId) : undefined;
  const aligned = reading !== undefined && reading.id === cellId && reading.expectedBytes === listed.bytes &&
    reading.provenance.source === listed.provenance.source && reading.provenance.licence === listed.provenance.licence &&
    reading.provenance.date === listed.provenance.date;
  const state = aligned && reading.state === "saved" && reading.cause === "present" ? "saved" : "UNKNOWN";
  return { cellId, state, source: listed.provenance.source || "UNKNOWN", licence: listed.provenance.licence || "UNKNOWN",
    date: listed.provenance.date || "UNKNOWN", expectedBytes: Number.isSafeInteger(listed.bytes) && listed.bytes >= 0 ? listed.bytes : null };
}
export function createContingencyPlan(regionId: string, at: string): ContingencyPlan {
  identifier(regionId);
  timestamp(at);
  return { schema: "offline-contingency-v1", regionId, createdAt: at, updatedAt: at, steps: [], events: [] };
}
function withEvent(plan: ContingencyPlan, next: readonly ContingencyStep[], event: ContingencyEvent): ContingencyPlan {
  if (plan.events.length >= CONTINGENCY_MAX_EVENTS) throw new RangeError("Event limit reached");
  if (Date.parse(event.at) < Date.parse(plan.updatedAt)) throw new TypeError("Events must be chronological");
  if (plan.events.some((item) => item.id === event.id)) throw new TypeError("Duplicate event ID");
  return { ...plan, updatedAt: event.at, steps: next, events: [...plan.events, event] };
}
export function addContingencyStep(plan: ContingencyPlan, input: {
  id: string; title: string; kind: CheckpointKind; question: string; at: string; eventId: string;
}): ContingencyPlan {
  if (plan.steps.length >= CONTINGENCY_MAX_STEPS) throw new RangeError("Step limit reached");
  identifier(input.id);
  identifier(input.eventId);
  noteText(input.title, false);
  noteText(input.question, false);
  timestamp(input.at);
  if (!KINDS.includes(input.kind) || plan.steps.some((step) => step.id === input.id)) throw new TypeError("Invalid step");
  const step: ContingencyStep = { id: input.id, title: input.title.trim(), kind: input.kind,
    question: input.question.trim(), alternative: "", note: "", signal: "UNKNOWN", followUp: "open",
    source: emptySource(), editedAt: input.at };
  return withEvent(plan, [...plan.steps, step], { id: input.eventId, stepId: step.id, at: input.at, action: "created", detail: step.title });
}
function actionFor(patch: StepPatch): ContingencyEvent["action"] {
  if (patch.signal !== undefined) return "observed";
  if (patch.followUp !== undefined) return "follow-up";
  if (patch.alternative !== undefined) return "alternative";
  if (patch.question !== undefined) return "question";
  return "note";
}
/** Explicit user edits only. A closed note never changes UNKNOWN evidence. */
export function updateContingencyStep(plan: ContingencyPlan, stepId: string, patch: StepPatch,
  at: string, eventId: string): ContingencyPlan {
  timestamp(at);
  identifier(eventId);
  if (!plan.steps.some((step) => step.id === stepId)) throw new TypeError("Unknown step");
  if (Object.keys(patch).length === 0) throw new TypeError("No changes");
  for (const value of [patch.question, patch.alternative, patch.note, patch.title]) {
    if (value !== undefined) noteText(value);
  }
  if (patch.title !== undefined && !patch.title.trim()) throw new TypeError("Blank title");
  if (patch.question !== undefined && !patch.question.trim()) throw new TypeError("Blank question");
  if (patch.signal !== undefined && !SIGNALS.includes(patch.signal)) throw new TypeError("Invalid observation");
  if (patch.followUp !== undefined && !FOLLOW_UPS.includes(patch.followUp)) throw new TypeError("Invalid follow-up");
  const rows = plan.steps.map((step): ContingencyStep => step.id === stepId ? {
    ...step, ...patch, editedAt: at,
  } : step);
  const action = actionFor(patch);
  return withEvent(plan, rows, { id: eventId, stepId, at, action,
    detail: action === "observed" ? patch.signal ?? "UNKNOWN" :
      action === "follow-up" ? patch.followUp ?? "open" : "manual edit" });
}
export function attachContingencySource(plan: ContingencyPlan, stepId: string,
  source: SourceReading, at: string, eventId: string): ContingencyPlan {
  timestamp(at);
  identifier(eventId);
  const checked = sourceReading(source);
  if (!plan.steps.some((step) => step.id === stepId)) throw new TypeError("Unknown step");
  return withEvent(plan, plan.steps.map((step) => step.id === stepId ? { ...step, source: checked, editedAt: at } : step),
    { id: eventId, stepId, at, action: "source", detail: checked.cellId ?? "UNKNOWN" });
}
export function moveContingencyStep(plan: ContingencyPlan, stepId: string, direction: "up" | "down",
  at: string, eventId: string): ContingencyPlan {
  timestamp(at);
  identifier(eventId);
  const position = plan.steps.findIndex((step) => step.id === stepId);
  if (position < 0) throw new TypeError("Unknown step");
  const nextPosition = position + (direction === "up" ? -1 : 1);
  if (nextPosition < 0 || nextPosition >= plan.steps.length) return plan;
  const moved = [...plan.steps];
  const [selected] = moved.splice(position, 1);
  if (!selected) throw new Error("Missing step");
  moved.splice(nextPosition, 0, { ...selected, editedAt: at });
  return withEvent(plan, moved, { id: eventId, stepId, at, action: "reordered", detail: direction });
}
export function summaryContingency(plan: ContingencyPlan): PlanTotals {
  return { listed: plan.steps.length, open: plan.steps.filter((step) => step.followUp !== "closed-note").length,
    issues: plan.steps.filter((step) => step.signal === "issue").length,
    unknownSignals: plan.steps.filter((step) => step.signal === "UNKNOWN").length,
    closedNotes: plan.steps.filter((step) => step.followUp === "closed-note").length,
    savedSources: plan.steps.filter((step) => step.source.state === "saved").length,
    unknownSources: plan.steps.filter((step) => step.source.state === "UNKNOWN").length,
    alternatives: plan.steps.filter((step) => step.alternative.trim().length > 0).length };
}
export function pageContingency(plan: ContingencyPlan, query: PlanQuery): PlanPage {
  if (!Number.isSafeInteger(query.offset) || query.offset < 0 ||
    !Number.isSafeInteger(query.limit) || query.limit < 1 || query.limit > CONTINGENCY_PAGE_LIMIT) {
    throw new RangeError("Invalid page");
  }
  if (!["all", "open", "issue", "UNKNOWN", "closed-note"].includes(query.filter) ||
    !["listed", "recent", "kind"].includes(query.sort)) throw new TypeError("Invalid query");
  const term = query.search.trim().toLocaleLowerCase();
  const rows = plan.steps.filter((step) => {
    const matching = [step.title, step.question, step.note, step.alternative, step.kind, step.source.cellId ?? ""]
      .some((text) => text.toLocaleLowerCase().includes(term));
    if (!matching) return false;
    if (query.filter === "open") return step.followUp !== "closed-note";
    if (query.filter === "issue") return step.signal === "issue";
    if (query.filter === "UNKNOWN") return step.signal === "UNKNOWN" || step.source.state === "UNKNOWN";
    if (query.filter === "closed-note") return step.followUp === "closed-note";
    return true;
  });
  if (query.sort === "recent") rows.sort((a, b) => b.editedAt.localeCompare(a.editedAt) || a.id.localeCompare(b.id));
  if (query.sort === "kind") rows.sort((a, b) => a.kind.localeCompare(b.kind) || a.id.localeCompare(b.id));
  return { rows: rows.slice(query.offset, query.offset + query.limit), total: rows.length,
    previous: query.offset > 0, next: query.offset + query.limit < rows.length };
}
export function validateContingencyPlan(value: unknown, regionId?: string): ContingencyPlan {
  if (!record(value) || value.schema !== "offline-contingency-v1") throw new TypeError("Invalid file schema");
  identifier(value.regionId);
  if (regionId !== undefined && value.regionId !== regionId) throw new TypeError("Different region");
  timestamp(value.createdAt);
  timestamp(value.updatedAt);
  if (Date.parse(value.updatedAt) < Date.parse(value.createdAt) || !Array.isArray(value.steps) ||
    value.steps.length > CONTINGENCY_MAX_STEPS || !Array.isArray(value.events) ||
    value.events.length > CONTINGENCY_MAX_EVENTS) throw new TypeError("Invalid plan");
  const steps: ContingencyStep[] = [];
  const ids = new Set<string>();
  for (const raw of value.steps as unknown[]) {
    if (!record(raw)) throw new TypeError("Invalid step record");
    identifier(raw.id);
    if (ids.has(raw.id)) throw new TypeError("Repeated step ID");
    ids.add(raw.id);
    if (!KINDS.includes(raw.kind as CheckpointKind) || !SIGNALS.includes(raw.signal as CheckpointSignal) ||
      !FOLLOW_UPS.includes(raw.followUp as FollowUp)) throw new TypeError("Invalid step status");
    for (const key of ["title", "question", "alternative", "note"] as const) noteText(raw[key], key !== "title" && key !== "question");
    timestamp(raw.editedAt);
    if (Date.parse(raw.editedAt) < Date.parse(value.createdAt) || Date.parse(raw.editedAt) > Date.parse(value.updatedAt)) {
      throw new TypeError("Step date outside plan");
    }
    steps.push({ id: raw.id, kind: raw.kind as CheckpointKind, title: raw.title as string,
      question: raw.question as string, alternative: raw.alternative as string, note: raw.note as string,
      signal: raw.signal as CheckpointSignal, followUp: raw.followUp as FollowUp,
      editedAt: raw.editedAt, source: sourceReading(raw.source) });
  }
  const events: ContingencyEvent[] = [];
  const eventIds = new Set<string>();
  let previous = value.createdAt;
  for (const raw of value.events as unknown[]) {
    if (!record(raw)) throw new TypeError("Invalid event record");
    identifier(raw.id);
    identifier(raw.stepId);
    timestamp(raw.at);
    noteText(raw.detail);
    if (eventIds.has(raw.id) || !ids.has(raw.stepId) || !ACTIONS.includes(raw.action as ContingencyEvent["action"]) ||
      Date.parse(raw.at) < Date.parse(previous) || Date.parse(raw.at) > Date.parse(value.updatedAt)) {
      throw new TypeError("Invalid event sequence");
    }
    eventIds.add(raw.id);
    previous = raw.at;
    events.push({ id: raw.id, stepId: raw.stepId, at: raw.at, action: raw.action as ContingencyEvent["action"], detail: raw.detail as string });
  }
  return { schema: "offline-contingency-v1", regionId: value.regionId, createdAt: value.createdAt,
    updatedAt: value.updatedAt, steps, events };
}
export function serializeContingencyPlan(plan: ContingencyPlan): string {
  const checked = validateContingencyPlan(plan);
  const value = JSON.stringify(checked, null, 2);
  if (new TextEncoder().encode(value).length > CONTINGENCY_MAX_FILE_BYTES) throw new RangeError("Export too large");
  return value;
}
export function parseContingencyPlan(json: string, regionId: string): ContingencyPlan {
  if (new TextEncoder().encode(json).length > CONTINGENCY_MAX_FILE_BYTES) throw new RangeError("Import too large");
  const historical = validateContingencyPlan(JSON.parse(json) as unknown, regionId);
  // Imported source evidence is historical; it cannot establish present local storage.
  return { ...historical, steps: historical.steps.map((step) => ({
    ...step, source: { ...step.source, state: "UNKNOWN" },
  })) };
}
