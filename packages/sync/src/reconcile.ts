import { validateCacheEntry, validateProvenance, validateOutboxNote } from "@access/shared";
import type { Provenance } from "@access/shared";
import { assertReport, assertSnapshot } from "./schema.ts";
import type { Conflict, FactValue, ReconcileReport, Resolution, Snapshot, SourcedValue, SyncEntry } from "./types.ts";

const LIVE_KEY = /(elevator.?status|lift.?status|disruption|outage|service.?alert|live.?status|realtime|real.?time|expires_at|feed_timestamp)/i;
const UNKNOWN = "UNKNOWN";
const own = (obj: object, key: string) => Object.prototype.hasOwnProperty.call(obj, key);
const clone = <T>(value: T): T => structuredClone(value);
const isUnknown = (value: unknown): boolean => value === undefined || value === null || value === "unknown" || value === UNKNOWN;

function assertNoLive(value: unknown, path: string): void {
  if (Array.isArray(value)) {
    value.forEach((item, i) => assertNoLive(item, `${path}[${i}]`));
    return;
  }
  if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      if (LIVE_KEY.test(key)) throw new Error(`Live status cannot be cached: ${path}.${key}`);
      assertNoLive(child, `${path}.${key}`);
    }
  }
}

/** Reject unsafe/unsupported inputs before looking at facts or writing cache data. */
export function checkSnapshot(value: unknown): asserts value is Snapshot {
  assertSnapshot(value);
  const seen = new Set<string>();
  for (const record of value.records) {
    if (seen.has(record.id)) throw new Error(`Duplicate record id: ${record.id}`);
    seen.add(record.id);
    const issues = validateCacheEntry(record);
    if (issues.length) throw new Error(`Unsafe record ${record.id}: ${JSON.stringify(issues)}`);
    if (record.field_provenance) {
      for (const [field, source] of Object.entries(record.field_provenance)) {
        if (!own(record.payload, field) || isUnknown(record.payload[field])) {
          throw new Error(`Provenance without a fact: ${record.id}.${field}`);
        }
        const errors = validateProvenance(source, field);
        if (errors.length) throw new Error(`Invalid field provenance: ${JSON.stringify(errors)}`);
      }
    }
    assertNoLive(record.payload, `record ${record.id}`);
    assertNoLive(record.field_provenance, `record ${record.id} provenance`);
  }
  const notes = new Set<string>();
  for (const note of value.outbox) {
    if (notes.has(note.id)) throw new Error(`Duplicate outbox id: ${note.id}`);
    notes.add(note.id);
    if (validateOutboxNote(note.note).length) throw new Error(`Invalid outbox note: ${note.id}`);
  }
}

function fact(record: SyncEntry, field: string): SourcedValue | undefined {
  const value = record.payload[field];
  if (isUnknown(value)) return undefined;
  return { value: clone(value as FactValue), provenance: clone(record.field_provenance?.[field] ?? record.provenance) };
}

function sameValue(a: FactValue, b: FactValue): boolean {
  const normalise = (value: FactValue): FactValue => {
    if (Array.isArray(value)) return value.map(normalise);
    if (value !== null && typeof value === "object") {
      return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b))
        .map(([key, child]) => [key, normalise(child)]));
    }
    return value;
  };
  return JSON.stringify(normalise(a)) === JSON.stringify(normalise(b));
}

function chooseProvenance(a: Provenance, b: Provenance): Provenance {
  return a.retrieved_at >= b.retrieved_at ? clone(a) : clone(b);
}

function joinRecord(left: SyncEntry, right: SyncEntry, report: ReconcileReport): SyncEntry {
  if (left.kind !== right.kind || left.title !== right.title) {
    throw new Error(`Identity metadata mismatch for ${left.id}; re-key before reconciling`);
  }
  const winner = left.stored_at >= right.stored_at ? "left" : "right";
  if (left.stored_at !== right.stored_at) {
    report.metadata_lww.push({ record_id: left.id, field: "stored_at", chosen: winner });
  }
  const merged = clone(winner === "left" ? left : right);
  merged.payload = {};
  merged.field_provenance = {};
  const fields = new Set([...Object.keys(left.payload), ...Object.keys(right.payload)]);
  for (const field of [...fields].sort()) {
    const l = fact(left, field);
    const r = fact(right, field);
    if (!l || !r) {
      merged.payload[field] = clone((l ?? r)?.value ?? UNKNOWN);
      if (l || r) merged.field_provenance[field] = (l ?? r)!.provenance;
      if (!l) report.unknown_observations.push({ record_id: left.id, field, side: "left" });
      if (!r) report.unknown_observations.push({ record_id: left.id, field, side: "right" });
    } else if (sameValue(l.value, r.value)) {
      merged.payload[field] = clone(l.value);
      merged.field_provenance[field] = chooseProvenance(l.provenance, r.provenance);
    } else {
      const conflict: Conflict = { record_id: left.id, field, left: l, right: r };
      report.conflicts.push(conflict);
      merged.payload[field] = UNKNOWN;
    }
  }
  return merged;
}

/** Entirely local, pure reconciliation of two labelled snapshots. No upload or transport. */
export function reconcile(left: Snapshot, right: Snapshot): ReconcileReport {
  checkSnapshot(left);
  checkSnapshot(right);
  const report: ReconcileReport = {
    left_label: left.label, right_label: right.label,
    merged: { label: `${left.label} + ${right.label}`, as_of: left.as_of >= right.as_of ? left.as_of : right.as_of, records: [], outbox: [] },
    conflicts: [], unknown_observations: [], metadata_lww: [],
  };
  const l = new Map(left.records.map((record) => [record.id, record]));
  const r = new Map(right.records.map((record) => [record.id, record]));
  for (const id of [...new Set([...l.keys(), ...r.keys()])].sort()) {
    const first = l.get(id);
    const second = r.get(id);
    report.merged.records.push(first && second ? joinRecord(first, second, report) : clone((first ?? second)!));
  }
  const notes = new Map(left.outbox.map((item) => [item.id, item]));
  for (const item of right.outbox) {
    const existing = notes.get(item.id);
    if (existing && JSON.stringify(existing) !== JSON.stringify(item)) {
      throw new Error(`Conflicting on-device note id: ${item.id}`);
    }
    notes.set(item.id, item);
  }
  report.merged.outbox = [...notes.values()].sort((a, b) => a.id.localeCompare(b.id)).map(clone);
  checkSnapshot(report.merged);
  assertReport(report);
  return report;
}

/** Explicit field resolution; does not mutate the original report or choose on the caller's behalf. */
export function applyResolutions(report: ReconcileReport, resolutions: Resolution[]): ReconcileReport {
  assertReport(report);
  const result = clone(report);
  const applied = new Set<string>();
  for (const selection of resolutions) {
    const key = JSON.stringify([selection.record_id, selection.field]);
    if (applied.has(key)) throw new Error(`Duplicate resolution: ${key}`);
    applied.add(key);
    const conflict = result.conflicts.find((item) => item.record_id === selection.record_id && item.field === selection.field);
    if (!conflict) throw new Error(`Conflict not found: ${key}`);
    const record = result.merged.records.find((item) => item.id === selection.record_id);
    if (!record) throw new Error(`Record not found: ${selection.record_id}`);
    if (!["left", "right", "unknown"].includes(selection.choice)) throw new Error("Invalid resolution choice");
    if (selection.choice === "unknown") {
      record.payload[selection.field] = UNKNOWN;
      delete record.field_provenance?.[selection.field];
    } else {
      const selected = conflict[selection.choice];
      record.payload[selection.field] = clone(selected.value);
      record.field_provenance ??= {};
      record.field_provenance[selection.field] = clone(selected.provenance);
    }
    result.conflicts = result.conflicts.filter((item) => item !== conflict);
  }
  checkSnapshot(result.merged);
  assertReport(result);
  return result;
}
