import { isSafePackId } from "./packInventory";
import { isOpenLicence, parseCalendarDate } from "./recoveryDiagnostics";

/** Local, manually supplied source statements. Not a declaration of accessibility. */
export type LedgerValue = "UNKNOWN" | "present" | "absent" | "conflicting";
export type LedgerTier = "UNKNOWN" | "source-document" | "personal-observation" | "third-party-report";
export type LedgerPhase = "draft" | "reviewed" | "disputed";
export type LedgerIssue =
  | "format" | "limit" | "text" | "identifier" | "duplicate" | "date" | "source"
  | "licence" | "tier" | "value" | "phase" | "transition" | "conflict" | "order";

export interface LedgerSource {
  readonly name: string;
  readonly licence: string;
  readonly date: string;
  readonly tier: LedgerTier;
  readonly reference: string;
}
export interface LedgerStatement {
  readonly id: string;
  readonly packId: string;
  readonly field: string;
  readonly value: LedgerValue;
  readonly note: string;
  readonly recordedAt: string;
  readonly source: LedgerSource;
  readonly phase: LedgerPhase;
}
export interface LedgerDocument {
  readonly format: "local-source-ledger-v1";
  readonly entries: readonly LedgerStatement[];
}
export type LedgerResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly issue: LedgerIssue };
export interface LedgerPreview {
  readonly added: readonly LedgerStatement[];
  readonly same: readonly string[];
  readonly collisions: readonly string[];
  readonly remaining: number;
}
export interface LedgerFilter {
  readonly packId?: string;
  readonly field?: string;
  readonly value?: LedgerValue;
  readonly phase?: LedgerPhase;
  readonly tier?: LedgerTier;
  readonly search?: string;
}
export interface LedgerConflict {
  readonly packId: string;
  readonly field: string;
  readonly ids: readonly string[];
  readonly distinctValues: readonly LedgerValue[];
  readonly result: "UNKNOWN" | "single" | "disputed";
}
export interface LedgerSummary {
  readonly count: number;
  readonly packs: number;
  readonly unknown: number;
  readonly reviewed: number;
  readonly disputed: number;
  readonly conflictingFields: number;
  readonly missingDates: number;
  readonly distinctSources: number;
}
export interface LedgerChange {
  readonly id: string;
  readonly type: "added" | "removed" | "changed";
  readonly packId: string;
}

export const LEDGER_LIMITS = {
  maxEntries: 300,
  maxBytes: 384 * 1024,
  maxId: 96,
  maxPack: 128,
  maxField: 80,
  maxName: 160,
  maxReference: 256,
  maxNote: 800,
} as const;
export const LEDGER_VALUES: readonly LedgerValue[] = ["UNKNOWN", "present", "absent", "conflicting"];
export const LEDGER_TIERS: readonly LedgerTier[] = ["UNKNOWN", "source-document", "personal-observation", "third-party-report"];
export const LEDGER_PHASES: readonly LedgerPhase[] = ["draft", "reviewed", "disputed"];
export const LEDGER_LICENCES: readonly string[] = ["CC0-1.0", "CC-BY-4.0", "ODbL-1.0", "OGL-Canada-2.0", "OGL-ON-1.0"];
const ID = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const FIELD = /^[A-Za-z][A-Za-z0-9._-]*$/;
const CONTROL = /\p{Cc}/u;
const INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function exactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const actual = Object.keys(value);
  return actual.length === expected.length && actual.every((key) => expected.includes(key));
}
function simpleText(value: unknown, max: number, allowEmpty = false): value is string {
  return typeof value === "string" && value.length <= max &&
    (allowEmpty || value.trim().length > 0) && !CONTROL.test(value) &&
    !value.includes("<") && !value.includes(">");
}
function validId(value: unknown): value is string {
  return simpleText(value, LEDGER_LIMITS.maxId) && ID.test(value) && value !== "." && value !== "..";
}
function validField(value: unknown): value is string {
  return simpleText(value, LEDGER_LIMITS.maxField) && FIELD.test(value);
}
function validInstant(value: unknown): value is string {
  if (typeof value !== "string" || !INSTANT.test(value)) return false;
  const instant = Date.parse(value);
  if (!Number.isFinite(instant)) return false;
  const time = new Date(instant).toISOString();
  return time === (value.includes(".")
    ? value.replace(/\.\d+Z$/, (part) => `.${part.slice(1, -1).padEnd(3, "0")}Z`)
    : value.replace("Z", ".000Z"));
}

export function newLedgerDocument(): LedgerDocument {
  return { format: "local-source-ledger-v1", entries: [] };
}

/** Source licensing and date are checked, never guessed. */
export function sourceIssue(value: unknown): LedgerIssue | null {
  if (!isObject(value) || !exactKeys(value, ["name", "licence", "date", "tier", "reference"])) return "source";
  if (!simpleText(value.name, LEDGER_LIMITS.maxName) ||
    !simpleText(value.reference, LEDGER_LIMITS.maxReference, true)) return "source";
  if (!isOpenLicence(value.licence)) return "licence";
  if (typeof value.date !== "string" || parseCalendarDate(value.date) === null) return "date";
  if (!LEDGER_TIERS.includes(value.tier as LedgerTier)) return "tier";
  return null;
}

export function statementIssue(value: unknown): LedgerIssue | null {
  if (!isObject(value) || !exactKeys(value, [
    "id", "packId", "field", "value", "note", "recordedAt", "source", "phase",
  ])) return "format";
  if (!validId(value.id) || !isSafePackId(value.packId) || !validField(value.field)) return "identifier";
  if (!LEDGER_VALUES.includes(value.value as LedgerValue)) return "value";
  if (!LEDGER_PHASES.includes(value.phase as LedgerPhase)) return "phase";
  if (!simpleText(value.note, LEDGER_LIMITS.maxNote, true)) return "text";
  if (!validInstant(value.recordedAt)) return "date";
  return sourceIssue(value.source);
}

export function parseLedgerDocument(value: unknown): LedgerResult<LedgerDocument> {
  if (!isObject(value) || !exactKeys(value, ["format", "entries"]) ||
    value.format !== "local-source-ledger-v1" || !Array.isArray(value.entries)) {
    return { ok: false, issue: "format" };
  }
  if (value.entries.length > LEDGER_LIMITS.maxEntries) return { ok: false, issue: "limit" };
  const ids = new Set<string>();
  const entries: LedgerStatement[] = [];
  for (const raw of value.entries as unknown[]) {
    const issue = statementIssue(raw);
    if (issue !== null) return { ok: false, issue };
    const entry = raw as LedgerStatement;
    if (ids.has(entry.id)) return { ok: false, issue: "duplicate" };
    ids.add(entry.id);
    entries.push({ ...entry, source: { ...entry.source } });
  }
  return { ok: true, value: { format: "local-source-ledger-v1", entries } };
}

export function loadLedger(raw: string): LedgerResult<LedgerDocument> {
  if (new TextEncoder().encode(raw).byteLength > LEDGER_LIMITS.maxBytes) return { ok: false, issue: "limit" };
  try { return parseLedgerDocument(JSON.parse(raw) as unknown); }
  catch { return { ok: false, issue: "format" }; }
}

export function saveLedger(value: LedgerDocument): LedgerResult<string> {
  const parsed = parseLedgerDocument(value);
  if (!parsed.ok) return parsed;
  const text = `${JSON.stringify(parsed.value, null, 2)}\n`;
  return new TextEncoder().encode(text).byteLength <= LEDGER_LIMITS.maxBytes
    ? { ok: true, value: text } : { ok: false, issue: "limit" };
}

export function appendLedgerStatement(document: LedgerDocument, entry: LedgerStatement): LedgerResult<LedgerDocument> {
  const source = parseLedgerDocument(document);
  if (!source.ok) return source;
  const issue = statementIssue(entry);
  if (issue !== null) return { ok: false, issue };
  if (source.value.entries.some((item) => item.id === entry.id)) return { ok: false, issue: "duplicate" };
  if (source.value.entries.length >= LEDGER_LIMITS.maxEntries) return { ok: false, issue: "limit" };
  return { ok: true, value: {
    ...source.value,
    entries: [...source.value.entries, { ...entry, source: { ...entry.source } }],
  } };
}

/** A review never rewrites an earlier source, value, or note. */
export function reviewLedgerStatement(
  document: LedgerDocument, id: string, phase: LedgerPhase,
): LedgerResult<LedgerDocument> {
  const checked = parseLedgerDocument(document);
  if (!checked.ok) return checked;
  if (!LEDGER_PHASES.includes(phase)) return { ok: false, issue: "phase" };
  const entry = checked.value.entries.find((item) => item.id === id);
  if (!entry) return { ok: false, issue: "identifier" };
  if (entry.phase === phase) return checked;
  if (entry.phase !== "draft" || phase === "draft") return { ok: false, issue: "transition" };
  return { ok: true, value: { ...checked.value,
    entries: checked.value.entries.map((item) => item.id === id ? { ...item, phase } : item),
  } };
}

/** A duplicate ID can be accepted only if the entire entry is unchanged. */
export function previewLedgerMerge(current: LedgerDocument, incoming: LedgerDocument): LedgerResult<LedgerPreview> {
  const a = parseLedgerDocument(current);
  if (!a.ok) return a;
  const b = parseLedgerDocument(incoming);
  if (!b.ok) return b;
  const indexed = new Map(a.value.entries.map((entry) => [entry.id, entry]));
  const added: LedgerStatement[] = [];
  const same: string[] = [];
  const collisions: string[] = [];
  for (const entry of b.value.entries) {
    const prior = indexed.get(entry.id);
    if (!prior) added.push(entry);
    else if (JSON.stringify(prior) === JSON.stringify(entry)) same.push(entry.id);
    else collisions.push(entry.id);
  }
  const remaining = LEDGER_LIMITS.maxEntries - a.value.entries.length - added.length;
  if (remaining < 0) return { ok: false, issue: "limit" };
  return { ok: true, value: { added, same, collisions, remaining } };
}

export function mergeLedgerDocuments(current: LedgerDocument, incoming: LedgerDocument): LedgerResult<LedgerDocument> {
  const preview = previewLedgerMerge(current, incoming);
  if (!preview.ok) return preview;
  if (preview.value.collisions.length > 0) return { ok: false, issue: "conflict" };
  const combined: LedgerDocument = { ...current, entries: [...current.entries, ...preview.value.added] };
  return saveLedger(combined).ok ? { ok: true, value: combined } : { ok: false, issue: "limit" };
}

export function filterLedger(document: LedgerDocument, filter: LedgerFilter): LedgerStatement[] {
  const query = filter.search?.trim().toLocaleLowerCase("en") ?? "";
  return document.entries.filter((entry) => {
    if (filter.packId && entry.packId !== filter.packId) return false;
    if (filter.field && entry.field !== filter.field) return false;
    if (filter.phase && entry.phase !== filter.phase) return false;
    if (filter.value && entry.value !== filter.value) return false;
    if (filter.tier && entry.source.tier !== filter.tier) return false;
    if (!query) return true;
    const words = [entry.packId, entry.field, entry.source.name, entry.source.reference, entry.note];
    return words.some((word) => word.toLocaleLowerCase("en").includes(query));
  });
}

/** Conflicts are not resolved by majority vote or a newer date. */
export function ledgerConflicts(document: LedgerDocument): LedgerConflict[] {
  const groups = new Map<string, LedgerStatement[]>();
  for (const item of document.entries) {
    const key = JSON.stringify([item.packId, item.field]);
    const group = groups.get(key) ?? [];
    group.push(item);
    groups.set(key, group);
  }
  const output: LedgerConflict[] = [];
  for (const statements of groups.values()) {
    const first = statements[0];
    if (!first) continue;
    const values = [...new Set(statements.map((entry) => entry.value))];
    const nonUnknown = values.filter((value) => value !== "UNKNOWN");
    const contested = nonUnknown.length > 1 || nonUnknown.includes("conflicting") ||
      statements.some((item) => item.phase === "disputed");
    output.push({
      packId: first.packId,
      field: first.field,
      ids: statements.map((item) => item.id),
      distinctValues: values,
      result: contested ? "disputed" : nonUnknown.length === 1 ? "single" : "UNKNOWN",
    });
  }
  return output.sort((a, b) => a.packId.localeCompare(b.packId, "en") || a.field.localeCompare(b.field, "en"));
}

export function ledgerSummary(document: LedgerDocument): LedgerSummary {
  const conflicts = ledgerConflicts(document);
  return {
    count: document.entries.length,
    packs: new Set(document.entries.map((item) => item.packId)).size,
    unknown: document.entries.filter((item) => item.value === "UNKNOWN").length,
    reviewed: document.entries.filter((item) => item.phase === "reviewed").length,
    disputed: document.entries.filter((item) => item.phase === "disputed").length,
    conflictingFields: conflicts.filter((item) => item.result === "disputed").length,
    missingDates: document.entries.filter((item) => parseCalendarDate(item.source.date) === null).length,
    distinctSources: new Set(document.entries.map((item) => item.source.name)).size,
  };
}

export function compareLedgers(before: LedgerDocument, after: LedgerDocument): LedgerChange[] {
  const old = new Map(before.entries.map((item) => [item.id, item]));
  const next = new Map(after.entries.map((item) => [item.id, item]));
  const changes: LedgerChange[] = [];
  for (const entry of after.entries) {
    const previous = old.get(entry.id);
    if (!previous) changes.push({ id: entry.id, type: "added", packId: entry.packId });
    else if (JSON.stringify(previous) !== JSON.stringify(entry)) {
      changes.push({ id: entry.id, type: "changed", packId: entry.packId });
    }
  }
  for (const entry of before.entries) {
    if (!next.has(entry.id)) changes.push({ id: entry.id, type: "removed", packId: entry.packId });
  }
  return changes.sort((a, b) => a.id.localeCompare(b.id, "en"));
}

export function ledgerIds(document: LedgerDocument): readonly string[] {
  return [...new Set(document.entries.map((entry) => entry.packId))].sort((a, b) => a.localeCompare(b, "en"));
}

export function nextLedgerId(document: LedgerDocument): string {
  const ids = new Set(document.entries.map((item) => item.id));
  for (let number = 1; number <= LEDGER_LIMITS.maxEntries + 1; number += 1) {
    const candidate = `source-${number}`;
    if (!ids.has(candidate)) return candidate;
  }
  return `source-${LEDGER_LIMITS.maxEntries + 2}`;
}

/** Summarises source coverage, without treating the number of sources as proof. */
export interface LedgerFieldOverview {
  readonly packId: string;
  readonly field: string;
  readonly outcome: "UNKNOWN" | "reported" | "disputed";
  readonly sources: readonly string[];
  readonly licences: readonly string[];
  readonly tiers: readonly LedgerTier[];
  readonly latestSourceDate: string | null;
  readonly reviewedCount: number;
  readonly unknownCount: number;
}

/** No date is assumed for an empty field, and disagreement is never voted away. */
export function fieldOverviews(document: LedgerDocument): LedgerFieldOverview[] {
  const groups = ledgerConflicts(document);
  const result: LedgerFieldOverview[] = [];
  for (const group of groups) {
    const members = document.entries.filter((entry) =>
      entry.packId === group.packId && entry.field === group.field);
    const dates = members.map((entry) => entry.source.date)
      .filter((date) => parseCalendarDate(date) !== null)
      .sort((a, b) => b.localeCompare(a, "en"));
    result.push({
      packId: group.packId,
      field: group.field,
      outcome: group.result === "disputed" ? "disputed"
        : group.result === "single" ? "reported" : "UNKNOWN",
      sources: [...new Set(members.map((entry) => entry.source.name))].sort(),
      licences: [...new Set(members.map((entry) => entry.source.licence))].sort(),
      tiers: [...new Set(members.map((entry) => entry.source.tier))].sort(),
      latestSourceDate: dates[0] ?? null,
      reviewedCount: members.filter((entry) => entry.phase === "reviewed").length,
      unknownCount: members.filter((entry) => entry.value === "UNKNOWN").length,
    });
  }
  return result;
}

/** Missing requested fields are UNKNOWN, even when other fields have reports. */
export interface RequestedLedgerField {
  readonly packId: string;
  readonly field: string;
}
export interface LedgerCoverageRow extends RequestedLedgerField {
  readonly outcome: "UNKNOWN" | "reported" | "disputed";
  readonly sourceCount: number;
  readonly latestSourceDate: string | null;
}
export function requestedFieldCoverage(
  document: LedgerDocument,
  requested: readonly RequestedLedgerField[],
): LedgerResult<readonly LedgerCoverageRow[]> {
  const checked = parseLedgerDocument(document);
  if (!checked.ok) return checked;
  if (requested.length > LEDGER_LIMITS.maxEntries) return { ok: false, issue: "limit" };
  const available = new Map(fieldOverviews(checked.value).map((row) =>
    [JSON.stringify([row.packId, row.field]), row]));
  const found = new Set<string>();
  const result: LedgerCoverageRow[] = [];
  for (const request of requested) {
    if (!isSafePackId(request.packId) || !validField(request.field)) {
      return { ok: false, issue: "identifier" };
    }
    const key = JSON.stringify([request.packId, request.field]);
    if (found.has(key)) return { ok: false, issue: "duplicate" };
    found.add(key);
    const row = available.get(key);
    result.push({
      packId: request.packId, field: request.field,
      outcome: row?.outcome ?? "UNKNOWN",
      sourceCount: row?.sources.length ?? 0,
      latestSourceDate: row?.latestSourceDate ?? null,
    });
  }
  return { ok: true, value: result };
}
