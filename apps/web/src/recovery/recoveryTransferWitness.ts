/** User-controlled records of moving recovery information between devices or people.
 * A receipt documents only an action reported by the user; it never makes a pack usable.
 */
export const WITNESS_SCHEMA = "the-app.recovery-transfer-witness.v1" as const;
export const WITNESS_LIMITS = {
  bytes: 512_000,
  transfers: 240,
  events: 1440,
  text: 700,
  identifier: 90,
  label: 180,
  note: 1200,
} as const;
export const WITNESS_KINDS = ["pack-metadata", "recovery-report", "handoff-note", "evidence-list"] as const;
export const WITNESS_CHANNELS = ["manual-file", "paper", "conversation", "UNKNOWN"] as const;
export const WITNESS_CONDITIONS = ["UNKNOWN", "partial", "interrupted", "not-accessible", "review-needed"] as const;
export const WITNESS_TIERS = ["UNKNOWN", "self-reported", "documented", "reviewed"] as const;
export const WITNESS_PHASES = ["draft", "offered", "acknowledged", "disputed", "withdrawn"] as const;
export const WITNESS_ACTIONS = ["created", "note", "offered", "acknowledged", "disputed", "withdrawn", "reopened"] as const;
export type WitnessKind = typeof WITNESS_KINDS[number];
export type WitnessChannel = typeof WITNESS_CHANNELS[number];
export type WitnessCondition = typeof WITNESS_CONDITIONS[number];
export type WitnessTier = typeof WITNESS_TIERS[number];
export type WitnessPhase = typeof WITNESS_PHASES[number];
export type WitnessAction = typeof WITNESS_ACTIONS[number];
export type WitnessIssue = "format" | "size" | "identity" | "duplicate" | "reference" | "source" | "date" | "timestamp" | "text" | "transition" | "conflict" | "order";
export type WitnessResult<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly issue: WitnessIssue };

export interface WitnessSource {
  readonly name: string;
  readonly licence: string;
  readonly retrievedOn: string;
  readonly tier: WitnessTier;
  readonly reference: string;
}
export interface WitnessTransfer {
  readonly id: string;
  readonly packId: string;
  readonly label: string;
  readonly kind: WitnessKind;
  readonly channel: WitnessChannel;
  readonly condition: WitnessCondition;
  readonly phase: WitnessPhase;
  readonly recordedAt: string;
  readonly source: WitnessSource;
  readonly note: string;
  /** Digest is supplied by a human or external source; never calculated or trusted here. */
  readonly suppliedDigest: string | null;
  readonly suppliedBytes: number | null;
}
export interface WitnessEvent {
  readonly id: string;
  readonly transferId: string;
  readonly action: WitnessAction;
  readonly at: string;
  readonly note: string;
  readonly source: WitnessSource;
}
export interface WitnessDocument {
  readonly schema: typeof WITNESS_SCHEMA;
  readonly transfers: readonly WitnessTransfer[];
  readonly events: readonly WitnessEvent[];
}
export interface WitnessFilter {
  readonly packId?: string;
  readonly phase?: WitnessPhase;
  readonly kind?: WitnessKind;
  readonly condition?: WitnessCondition;
  readonly channel?: WitnessChannel;
  readonly query?: string;
}
export interface WitnessSummary {
  readonly total: number;
  readonly events: number;
  readonly drafts: number;
  readonly offered: number;
  readonly acknowledged: number;
  readonly disputed: number;
  readonly withdrawn: number;
  readonly unknown: number;
  readonly distinctPacks: number;
  readonly missingReceipt: number;
  readonly contentReady: false;
}
export interface WitnessMergePreview {
  readonly added: number;
  readonly unchanged: number;
  readonly conflicts: readonly string[];
  readonly addedEvents: number;
  readonly unchangedEvents: number;
  readonly eventConflicts: readonly string[];
  readonly contentReady: false;
}
export interface WitnessFinding {
  readonly transferId: string;
  readonly code: "unknown-condition" | "unknown-tier" | "no-receipt" | "disputed" | "partial" | "stale-source" | "conflicting-transfer" | "future-event";
  readonly severity: "review" | "attention";
  readonly detail: string;
}

const ok = <T>(value: T): WitnessResult<T> => ({ ok: true, value });
const bad = <T>(issue: WitnessIssue): WitnessResult<T> => ({ ok: false, issue });
const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);
const among = <T extends string>(value: unknown, choices: readonly T[]): value is T => typeof value === "string" && choices.includes(value as T);
const safeText = (value: unknown, limit: number): value is string => {
  if (typeof value !== "string" || value.length > limit) return false;
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    if (code <= 8 || code === 11 || code === 12 || (code >= 14 && code <= 31)) return false;
  }
  return true;
};
const safeId = (value: unknown): value is string => {
  if (!safeText(value, WITNESS_LIMITS.identifier) || value.length === 0) return false;
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    if (!(code >= 48 && code <= 57) && !(code >= 65 && code <= 90) &&
        !(code >= 97 && code <= 122) && !"._-".includes(value[i] ?? "")) return false;
  }
  return true;
};
const calendarDay = (value: unknown): value is string => {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
};
const instant = (value: unknown): value is string => {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/u.test(value)) return false;
  const time = Date.parse(value);
  return !Number.isNaN(time);
};
const bytes = (value: unknown): value is number | null => value === null ||
  (typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= Number.MAX_SAFE_INTEGER);

export function emptyWitnessDocument(): WitnessDocument {
  return { schema: WITNESS_SCHEMA, transfers: [], events: [] };
}
export function validateWitnessSource(value: unknown): value is WitnessSource {
  if (!object(value)) return false;
  return safeText(value.name, WITNESS_LIMITS.label) && value.name.trim().length > 0 &&
    safeText(value.licence, WITNESS_LIMITS.label) && value.licence.trim().length > 0 &&
    calendarDay(value.retrievedOn) && among(value.tier, WITNESS_TIERS) &&
    safeText(value.reference, WITNESS_LIMITS.label) && value.reference.trim().length > 0;
}
export function validateWitnessTransfer(value: unknown): value is WitnessTransfer {
  if (!object(value)) return false;
  return safeId(value.id) && safeId(value.packId) &&
    safeText(value.label, WITNESS_LIMITS.label) && value.label.trim().length > 0 &&
    among(value.kind, WITNESS_KINDS) && among(value.channel, WITNESS_CHANNELS) &&
    among(value.condition, WITNESS_CONDITIONS) && among(value.phase, WITNESS_PHASES) &&
    instant(value.recordedAt) && validateWitnessSource(value.source) &&
    safeText(value.note, WITNESS_LIMITS.note) &&
    (value.suppliedDigest === null || (safeText(value.suppliedDigest, WITNESS_LIMITS.label) && value.suppliedDigest.length > 0)) &&
    bytes(value.suppliedBytes);
}
export function validateWitnessEvent(value: unknown): value is WitnessEvent {
  if (!object(value)) return false;
  return safeId(value.id) && safeId(value.transferId) &&
    among(value.action, WITNESS_ACTIONS) && instant(value.at) &&
    safeText(value.note, WITNESS_LIMITS.note) && validateWitnessSource(value.source);
}
export function validateWitnessDocument(input: unknown): WitnessResult<WitnessDocument> {
  if (!object(input) || input.schema !== WITNESS_SCHEMA || !Array.isArray(input.transfers) || !Array.isArray(input.events)) return bad("format");
  if (input.transfers.length > WITNESS_LIMITS.transfers || input.events.length > WITNESS_LIMITS.events) return bad("size");
  if (!input.transfers.every(validateWitnessTransfer) || !input.events.every(validateWitnessEvent)) return bad("format");
  const transfers: WitnessTransfer[] = input.transfers;
  const events: WitnessEvent[] = input.events;
  if (new Set(transfers.map((item) => item.id)).size !== transfers.length) return bad("duplicate");
  if (new Set(events.map((item) => item.id)).size !== events.length) return bad("duplicate");
  const known = new Map(transfers.map((item) => [item.id, item]));
  for (const event of events) {
    const transfer = known.get(event.transferId);
    if (!transfer) return bad("reference");
    if (event.at < transfer.recordedAt) return bad("order");
  }
  return ok({ schema: WITNESS_SCHEMA, transfers, events });
}
export function appendWitnessTransfer(document: WitnessDocument, transfer: WitnessTransfer): WitnessResult<WitnessDocument> {
  if (!validateWitnessTransfer(transfer)) return bad("format");
  if (document.transfers.length >= WITNESS_LIMITS.transfers) return bad("size");
  if (document.transfers.some((item) => item.id === transfer.id)) return bad("duplicate");
  if (transfer.phase !== "draft") return bad("transition");
  return ok({ ...document, transfers: [...document.transfers, transfer] });
}
const transitions: Readonly<Record<WitnessPhase, readonly WitnessAction[]>> = {
  draft: ["note", "offered", "withdrawn"],
  offered: ["note", "acknowledged", "disputed", "withdrawn"],
  acknowledged: ["note", "disputed", "reopened"],
  disputed: ["note", "reopened", "withdrawn"],
  withdrawn: ["note", "reopened"],
};
export function nextWitnessPhase(current: WitnessPhase, action: WitnessAction): WitnessPhase | null {
  if (!transitions[current].includes(action)) return null;
  switch (action) {
    case "note": return current;
    case "offered": return "offered";
    case "acknowledged": return "acknowledged";
    case "disputed": return "disputed";
    case "withdrawn": return "withdrawn";
    case "reopened": return "draft";
    case "created": return null;
  }
}
export function appendWitnessEvent(document: WitnessDocument, event: WitnessEvent): WitnessResult<WitnessDocument> {
  if (!validateWitnessEvent(event)) return bad("format");
  if (document.events.length >= WITNESS_LIMITS.events) return bad("size");
  if (document.events.some((item) => item.id === event.id)) return bad("duplicate");
  const transfer = document.transfers.find((item) => item.id === event.transferId);
  if (!transfer) return bad("reference");
  if (event.at < transfer.recordedAt) return bad("order");
  const orderedEvents = document.events.filter((item) => item.transferId === transfer.id);
  if (orderedEvents.some((item) => item.at > event.at)) return bad("order");
  const phase = nextWitnessPhase(transfer.phase, event.action);
  if (phase === null) return bad("transition");
  return ok({ ...document, events: [...document.events, event],
    transfers: document.transfers.map((item) => item.id === transfer.id ? { ...item, phase } : item) });
}
export function witnessEventsFor(document: WitnessDocument, transferId: string): readonly WitnessEvent[] {
  return document.events.filter((event) => event.transferId === transferId)
    .sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id));
}
export function nextWitnessId(document: WitnessDocument, category: "transfer" | "event"): string {
  const prefix = category === "transfer" ? "witness" : "witness-event";
  const ids = new Set(category === "transfer" ? document.transfers.map((item) => item.id) : document.events.map((item) => item.id));
  let index = 1;
  while (ids.has(`${prefix}-${index}`)) index += 1;
  return `${prefix}-${index}`;
}
export function filterWitnessTransfers(document: WitnessDocument, filter: WitnessFilter): readonly WitnessTransfer[] {
  const query = filter.query?.trim().toLocaleLowerCase() ?? "";
  return document.transfers.filter((item) =>
    (filter.packId === undefined || item.packId === filter.packId) &&
    (filter.kind === undefined || item.kind === filter.kind) &&
    (filter.channel === undefined || item.channel === filter.channel) &&
    (filter.condition === undefined || item.condition === filter.condition) &&
    (filter.phase === undefined || item.phase === filter.phase) &&
    (!query || [item.label, item.packId, item.id, item.note, item.source.name, item.source.reference]
      .some((value) => value.toLocaleLowerCase().includes(query)))
  ).sort((a, b) => a.recordedAt.localeCompare(b.recordedAt) || a.id.localeCompare(b.id));
}
export function summarizeWitnessDocument(document: WitnessDocument): WitnessSummary {
  const count = (phase: WitnessPhase): number => document.transfers.filter((item) => item.phase === phase).length;
  return {
    total: document.transfers.length,
    events: document.events.length,
    drafts: count("draft"),
    offered: count("offered"),
    acknowledged: count("acknowledged"),
    disputed: count("disputed"),
    withdrawn: count("withdrawn"),
    unknown: document.transfers.filter((item) => item.condition === "UNKNOWN" || item.source.tier === "UNKNOWN").length,
    distinctPacks: new Set(document.transfers.map((item) => item.packId)).size,
    missingReceipt: document.transfers.filter((item) => item.phase !== "acknowledged").length,
    contentReady: false,
  };
}
export function previewWitnessMerge(current: WitnessDocument, incoming: WitnessDocument): WitnessMergePreview {
  const oldTransfers = new Map(current.transfers.map((item) => [item.id, JSON.stringify(item)]));
  const oldEvents = new Map(current.events.map((item) => [item.id, JSON.stringify(item)]));
  const conflicts = incoming.transfers.filter((item) => oldTransfers.has(item.id) && oldTransfers.get(item.id) !== JSON.stringify(item));
  const eventConflicts = incoming.events.filter((item) => oldEvents.has(item.id) && oldEvents.get(item.id) !== JSON.stringify(item));
  return {
    added: incoming.transfers.filter((item) => !oldTransfers.has(item.id)).length,
    unchanged: incoming.transfers.filter((item) => oldTransfers.get(item.id) === JSON.stringify(item)).length,
    conflicts: conflicts.map((item) => item.id).sort(),
    addedEvents: incoming.events.filter((item) => !oldEvents.has(item.id)).length,
    unchangedEvents: incoming.events.filter((item) => oldEvents.get(item.id) === JSON.stringify(item)).length,
    eventConflicts: eventConflicts.map((item) => item.id).sort(),
    contentReady: false,
  };
}
export function mergeWitnessDocuments(current: WitnessDocument, incoming: WitnessDocument): WitnessResult<WitnessDocument> {
  const a = validateWitnessDocument(current);
  const b = validateWitnessDocument(incoming);
  if (!a.ok) return bad(a.issue);
  if (!b.ok) return bad(b.issue);
  const preview = previewWitnessMerge(current, incoming);
  if (preview.conflicts.length || preview.eventConflicts.length) return bad("conflict");
  const transferIds = new Set(current.transfers.map((item) => item.id));
  const eventIds = new Set(current.events.map((item) => item.id));
  return validateWitnessDocument({ schema: WITNESS_SCHEMA,
    transfers: [...current.transfers, ...incoming.transfers.filter((item) => !transferIds.has(item.id))],
    events: [...current.events, ...incoming.events.filter((item) => !eventIds.has(item.id))],
  });
}
export function serializeWitnessDocument(document: WitnessDocument): WitnessResult<string> {
  const validated = validateWitnessDocument(document);
  if (!validated.ok) return bad(validated.issue);
  const json = JSON.stringify(document, null, 2);
  if (new TextEncoder().encode(json).length > WITNESS_LIMITS.bytes) return bad("size");
  return ok(json);
}
export function parseWitnessDocument(text: string): WitnessResult<WitnessDocument> {
  if (new TextEncoder().encode(text).length > WITNESS_LIMITS.bytes) return bad("size");
  try { return validateWitnessDocument(JSON.parse(text) as unknown); }
  catch { return bad("format"); }
}
/** A manual receipt is never evidence of pack completeness. */
export function witnessContentReady(document: WitnessDocument): false {
  void document;
  return false;
}
