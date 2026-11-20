/** Manual, offline evidence packet. Nothing in a packet authorizes use of a pack. */
export type PacketLocale = "en" | "fr";
export type PacketOperation = "pack" | "download" | "export" | "handoff";
export type PacketCondition = "UNKNOWN" | "incomplete" | "interrupted" | "unavailable" | "needs-review";
export type PacketTier = "UNKNOWN" | "self-reported" | "documented" | "reviewed";
export type PacketStage = "draft" | "review" | "closed";
export type PacketAction = "created" | "noted" | "review-requested" | "reopened" | "closed";
export type PacketFindingCode = "missing-source" | "missing-date" | "unknown-tier" | "unknown-condition" | "out-of-order" | "conflicting-observation" | "unreviewed" | "stale";
export type PacketIssue = "format" | "limit" | "identity" | "duplicate" | "reference" | "transition" | "source" | "date" | "text" | "timestamp" | "conflict";
export const PACKET_LIMITS = Object.freeze({ bytes: 512_000, entries: 400, events: 2400, text: 800, id: 100, sources: 400 });
export const PACKET_OPERATIONS: readonly PacketOperation[] = ["pack", "download", "export", "handoff"];
export const PACKET_CONDITIONS: readonly PacketCondition[] = ["UNKNOWN", "incomplete", "interrupted", "unavailable", "needs-review"];
export const PACKET_TIERS: readonly PacketTier[] = ["UNKNOWN", "self-reported", "documented", "reviewed"];
export const PACKET_STAGES: readonly PacketStage[] = ["draft", "review", "closed"];
export const PACKET_ACTIONS: readonly PacketAction[] = ["created", "noted", "review-requested", "reopened", "closed"];

export interface PacketSource {
  readonly name: string;
  readonly licence: string;
  readonly retrievedOn: string;
  readonly tier: PacketTier;
  readonly reference: string;
}
export interface PacketObservation {
  readonly condition: PacketCondition;
  readonly note: string;
  readonly bytes: number | null;
  readonly digest: string | null;
}
export interface PacketEntry {
  readonly id: string;
  readonly packId: string;
  readonly operation: PacketOperation;
  readonly stage: PacketStage;
  readonly recordedAt: string;
  readonly source: PacketSource;
  readonly observation: PacketObservation;
}
export interface PacketEvent {
  readonly id: string;
  readonly entryId: string;
  readonly action: PacketAction;
  readonly at: string;
  readonly note: string;
}
export interface PacketDocument {
  readonly schema: "the-app.recovery-evidence-packet.v1";
  readonly entries: readonly PacketEntry[];
  readonly events: readonly PacketEvent[];
}
export type PacketResult<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly issue: PacketIssue };
export interface PacketSummary {
  readonly total: number;
  readonly drafts: number;
  readonly reviews: number;
  readonly closed: number;
  readonly unknown: number;
  readonly sourcesUnknown: number;
  readonly events: number;
  readonly distinctPacks: number;
}
export interface PacketFilter {
  readonly text?: string;
  readonly operation?: PacketOperation;
  readonly condition?: PacketCondition;
  readonly tier?: PacketTier;
  readonly stage?: PacketStage;
  readonly packId?: string;
}
export interface PacketMergePreview {
  readonly additions: number;
  readonly duplicates: number;
  readonly conflicts: number;
  readonly eventAdditions: number;
  readonly eventConflicts: number;
}
export interface PacketFinding {
  readonly entryId: string;
  readonly code: PacketFindingCode;
  readonly detail: string;
}
export interface PacketDiff {
  readonly onlyLeft: readonly string[];
  readonly onlyRight: readonly string[];
  readonly changed: readonly string[];
  readonly shared: readonly string[];
}

export const emptyPacket = (): PacketDocument => ({ schema: "the-app.recovery-evidence-packet.v1", entries: [], events: [] });
const ok = <T>(value: T): PacketResult<T> => ({ ok: true, value });
const bad = <T>(issue: PacketIssue): PacketResult<T> => ({ ok: false, issue });
const object = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const string = (v: unknown, max: number): v is string => typeof v === "string" && v.length <= max && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(v);
const id = (v: unknown): v is string => string(v, PACKET_LIMITS.id) && v.length > 0 && /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/u.test(v);
const isoDay = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/u.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`)) && new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) === v;
const isoTime = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/u.test(v) && !Number.isNaN(Date.parse(v));
const choice = <T extends string>(v: unknown, values: readonly T[]): v is T => typeof v === "string" && values.includes(v as T);
const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

export function checkPacketSource(value: unknown): PacketResult<PacketSource> {
  if (!object(value)) return bad("source");
  if (!string(value.name, PACKET_LIMITS.sources) || !string(value.licence, PACKET_LIMITS.sources) || !string(value.reference, PACKET_LIMITS.sources)) return bad("source");
  if (!isoDay(value.retrievedOn)) return bad("date");
  if (!choice(value.tier, PACKET_TIERS)) return bad("source");
  return ok(value as unknown as PacketSource);
}
export function checkPacketObservation(value: unknown): PacketResult<PacketObservation> {
  if (!object(value) || !choice(value.condition, PACKET_CONDITIONS)) return bad("format");
  if (!string(value.note, PACKET_LIMITS.text)) return bad("text");
  if (value.bytes !== null && (typeof value.bytes !== "number" || !Number.isSafeInteger(value.bytes) || value.bytes < 0)) return bad("format");
  if (value.digest !== null && (!string(value.digest, 256) || value.digest.length === 0)) return bad("format");
  return ok(value as unknown as PacketObservation);
}
export function checkPacketEntry(value: unknown): PacketResult<PacketEntry> {
  if (!object(value)) return bad("format");
  if (!id(value.id) || !id(value.packId)) return bad("identity");
  if (!choice(value.operation, PACKET_OPERATIONS) || !choice(value.stage, PACKET_STAGES)) return bad("format");
  if (!isoTime(value.recordedAt)) return bad("timestamp");
  const source = checkPacketSource(value.source);
  if (!source.ok) return bad(source.issue);
  const observation = checkPacketObservation(value.observation);
  if (!observation.ok) return bad(observation.issue);
  return ok(value as unknown as PacketEntry);
}
export function checkPacketEvent(value: unknown): PacketResult<PacketEvent> {
  if (!object(value) || !id(value.id) || !id(value.entryId)) return bad("identity");
  if (!choice(value.action, PACKET_ACTIONS)) return bad("format");
  if (!isoTime(value.at)) return bad("timestamp");
  if (!string(value.note, PACKET_LIMITS.text)) return bad("text");
  return ok(value as unknown as PacketEvent);
}
export function checkPacketDocument(value: unknown): PacketResult<PacketDocument> {
  if (!object(value) || value.schema !== "the-app.recovery-evidence-packet.v1") return bad("format");
  if (!Array.isArray(value.entries) || !Array.isArray(value.events)) return bad("format");
  if (value.entries.length > PACKET_LIMITS.entries || value.events.length > PACKET_LIMITS.events) return bad("limit");
  const entries = new Map<string, PacketEntry>();
  for (const entry of value.entries) {
    const result = checkPacketEntry(entry);
    if (!result.ok) return bad(result.issue);
    if (entries.has(result.value.id)) return bad("duplicate");
    entries.set(result.value.id, result.value);
  }
  const eventIds = new Set<string>();
  for (const event of value.events) {
    const result = checkPacketEvent(event);
    if (!result.ok) return bad(result.issue);
    if (eventIds.has(result.value.id)) return bad("duplicate");
    if (!entries.has(result.value.entryId)) return bad("reference");
    eventIds.add(result.value.id);
  }
  return ok(value as unknown as PacketDocument);
}
export function nextPacketEntryId(document: PacketDocument): string {
  const seen = new Set(document.entries.map((entry) => entry.id));
  let i = document.entries.length + 1;
  while (seen.has(`packet-${i}`)) i++;
  return `packet-${i}`;
}
export function nextPacketEventId(document: PacketDocument): string {
  const seen = new Set(document.events.map((event) => event.id));
  let i = document.events.length + 1;
  while (seen.has(`event-${i}`)) i++;
  return `event-${i}`;
}
export function appendPacketEntry(document: PacketDocument, entry: PacketEntry): PacketResult<PacketDocument> {
  const validDocument = checkPacketDocument(document);
  if (!validDocument.ok) return bad(validDocument.issue);
  const valid = checkPacketEntry(entry);
  if (!valid.ok) return bad(valid.issue);
  if (document.entries.length >= PACKET_LIMITS.entries) return bad("limit");
  if (document.entries.some((item) => item.id === entry.id)) return bad("duplicate");
  if (entry.stage !== "draft") return bad("transition");
  return ok({ ...document, entries: [...document.entries, entry] });
}
export function appendPacketEvent(document: PacketDocument, event: PacketEvent): PacketResult<PacketDocument> {
  const validDocument = checkPacketDocument(document);
  if (!validDocument.ok) return bad(validDocument.issue);
  const valid = checkPacketEvent(event);
  if (!valid.ok) return bad(valid.issue);
  if (document.events.length >= PACKET_LIMITS.events) return bad("limit");
  if (document.events.some((item) => item.id === event.id)) return bad("duplicate");
  if (!document.entries.some((item) => item.id === event.entryId)) return bad("reference");
  return ok({ ...document, events: [...document.events, event] });
}
export function transitionPacketEntry(document: PacketDocument, entryId: string, to: PacketStage): PacketResult<PacketDocument> {
  if (!choice(to, PACKET_STAGES)) return bad("transition");
  const validDocument = checkPacketDocument(document);
  if (!validDocument.ok) return bad(validDocument.issue);
  const found = document.entries.find((item) => item.id === entryId);
  if (!found) return bad("reference");
  const permitted = (found.stage === "draft" && to === "review") || (found.stage === "review" && (to === "closed" || to === "draft")) || (found.stage === "closed" && to === "review");
  if (!permitted) return bad("transition");
  return ok({ ...document, entries: document.entries.map((item) => item.id === entryId ? { ...item, stage: to } : item) });
}
export function filterPacketEntries(document: PacketDocument, filter: PacketFilter): readonly PacketEntry[] {
  const query = filter.text?.trim().toLocaleLowerCase() ?? "";
  return document.entries.filter((item) => {
    if (filter.operation && item.operation !== filter.operation) return false;
    if (filter.condition && item.observation.condition !== filter.condition) return false;
    if (filter.tier && item.source.tier !== filter.tier) return false;
    if (filter.stage && item.stage !== filter.stage) return false;
    if (filter.packId && item.packId !== filter.packId) return false;
    if (!query) return true;
    return [item.id, item.packId, item.source.name, item.source.reference, item.observation.note]
      .some((value) => value.toLocaleLowerCase().includes(query));
  });
}
export function packetSummary(document: PacketDocument): PacketSummary {
  const entries = document.entries;
  return {
    total: entries.length,
    drafts: entries.filter((entry) => entry.stage === "draft").length,
    reviews: entries.filter((entry) => entry.stage === "review").length,
    closed: entries.filter((entry) => entry.stage === "closed").length,
    unknown: entries.filter((entry) => entry.observation.condition === "UNKNOWN").length,
    sourcesUnknown: entries.filter((entry) => entry.source.tier === "UNKNOWN" || !entry.source.name.trim() || !entry.source.licence.trim()).length,
    events: document.events.length,
    distinctPacks: new Set(entries.map((entry) => entry.packId)).size,
  };
}
export function packetEventsFor(document: PacketDocument, entryId: string): readonly PacketEvent[] {
  return document.events.filter((event) => event.entryId === entryId).sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id));
}
export function packetPreviewMerge(left: PacketDocument, right: PacketDocument): PacketMergePreview {
  const oldEntries = new Map(left.entries.map((entry) => [entry.id, entry]));
  const oldEvents = new Map(left.events.map((event) => [event.id, event]));
  return {
    additions: right.entries.filter((entry) => !oldEntries.has(entry.id)).length,
    duplicates: right.entries.filter((entry) => oldEntries.has(entry.id) && same(oldEntries.get(entry.id), entry)).length,
    conflicts: right.entries.filter((entry) => oldEntries.has(entry.id) && !same(oldEntries.get(entry.id), entry)).length,
    eventAdditions: right.events.filter((event) => !oldEvents.has(event.id)).length,
    eventConflicts: right.events.filter((event) => oldEvents.has(event.id) && !same(oldEvents.get(event.id), event)).length,
  };
}
export function mergePackets(left: PacketDocument, right: PacketDocument): PacketResult<PacketDocument> {
  const a = checkPacketDocument(left);
  if (!a.ok) return bad(a.issue);
  const b = checkPacketDocument(right);
  if (!b.ok) return bad(b.issue);
  const preview = packetPreviewMerge(left, right);
  if (preview.conflicts || preview.eventConflicts) return bad("conflict");
  const entryIds = new Set(left.entries.map((item) => item.id));
  const eventIds = new Set(left.events.map((item) => item.id));
  const merged: PacketDocument = {
    schema: left.schema,
    entries: [...left.entries, ...right.entries.filter((item) => !entryIds.has(item.id))],
    events: [...left.events, ...right.events.filter((item) => !eventIds.has(item.id))],
  };
  return checkPacketDocument(merged);
}
export function packetDifference(left: PacketDocument, right: PacketDocument): PacketDiff {
  const a = new Map(left.entries.map((entry) => [entry.id, entry]));
  const b = new Map(right.entries.map((entry) => [entry.id, entry]));
  return {
    onlyLeft: [...a.keys()].filter((key) => !b.has(key)).sort(),
    onlyRight: [...b.keys()].filter((key) => !a.has(key)).sort(),
    changed: [...a.keys()].filter((key) => b.has(key) && !same(a.get(key), b.get(key))).sort(),
    shared: [...a.keys()].filter((key) => b.has(key) && same(a.get(key), b.get(key))).sort(),
  };
}
export function exportPacket(document: PacketDocument): PacketResult<string> {
  const valid = checkPacketDocument(document);
  if (!valid.ok) return bad(valid.issue);
  const text = JSON.stringify(document, null, 2);
  if (new TextEncoder().encode(text).length > PACKET_LIMITS.bytes) return bad("limit");
  return ok(text);
}
export function importPacket(text: string): PacketResult<PacketDocument> {
  if (new TextEncoder().encode(text).length > PACKET_LIMITS.bytes) return bad("limit");
  let parsed: unknown;
  try { parsed = JSON.parse(text) as unknown; } catch { return bad("format"); }
  return checkPacketDocument(parsed);
}
export function packetFindings(document: PacketDocument, asOf: string, staleDays = 180): readonly PacketFinding[] {
  const findings: PacketFinding[] = [];
  const now = Date.parse(`${asOf}T00:00:00Z`);
  for (const entry of document.entries) {
    if (!entry.source.name.trim() || !entry.source.licence.trim() || !entry.source.reference.trim()) findings.push({ entryId: entry.id, code: "missing-source", detail: "Source information is incomplete" });
    if (!isoDay(entry.source.retrievedOn)) findings.push({ entryId: entry.id, code: "missing-date", detail: "Source date is UNKNOWN" });
    if (entry.source.tier === "UNKNOWN") findings.push({ entryId: entry.id, code: "unknown-tier", detail: "Evidence tier is UNKNOWN" });
    if (entry.observation.condition === "UNKNOWN") findings.push({ entryId: entry.id, code: "unknown-condition", detail: "Condition is UNKNOWN" });
    if (entry.stage !== "closed") findings.push({ entryId: entry.id, code: "unreviewed", detail: "Manual review is incomplete" });
    const day = Date.parse(`${entry.source.retrievedOn}T00:00:00Z`);
    if (Number.isFinite(now) && Number.isFinite(day) && now - day > staleDays * 86_400_000) findings.push({ entryId: entry.id, code: "stale", detail: "Source age needs manual review" });
    for (const event of packetEventsFor(document, entry.id)) {
      if (Date.parse(event.at) < Date.parse(entry.recordedAt)) {
        findings.push({ entryId: entry.id, code: "out-of-order", detail: "Event precedes entry" });
        break;
      }
    }
  }
  const pairs = new Map<string, PacketEntry[]>();
  for (const entry of document.entries) {
    const key = `${entry.packId}:${entry.operation}`;
    pairs.set(key, [...(pairs.get(key) ?? []), entry]);
  }
  for (const group of pairs.values()) {
    const conditions = new Set(group.map((entry) => entry.observation.condition));
    if (conditions.size > 1) for (const entry of group) findings.push({ entryId: entry.id, code: "conflicting-observation", detail: "Observations disagree; no outcome is inferred" });
  }
  return findings.sort((a, b) => a.entryId.localeCompare(b.entryId) || a.code.localeCompare(b.code));
}
/** The packet cannot determine whether a regional pack is complete or usable. */
export function packetContentReady(_document: PacketDocument): false { return false; }
