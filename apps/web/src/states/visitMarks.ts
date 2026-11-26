/**
 * The person's own marks on places: to visit, been there, ruled out. A mark is the person's note to
 * themselves. It is not a fact about the place and nothing here reads it as one: it never changes
 * what the pack says, never ranks a place and never says a place is good or bad to visit.
 *
 * Marks hold an id, a status and the day it was set, nothing else, so no copy of a place's details
 * can go stale. Whatever is read back from storage is checked, because storage can hold anything.
 */
import type { PackPlaceRecord } from "./packPlaces";
import { isIsoDate } from "./provenance";
import { isShortlistId } from "./shortlist";
import type { KeyValueStore } from "./submissionQueue";

export const VISIT_MARKS_KEY = "app.visit-marks.v1";
export const MAX_VISIT_MARKS = 200;

export const VISIT_STATUSES = ["to-visit", "been", "ruled-out"] as const;
export type VisitStatus = (typeof VISIT_STATUSES)[number];

export function isVisitStatus(value: unknown): value is VisitStatus {
  return typeof value === "string" && (VISIT_STATUSES as readonly string[]).includes(value);
}

export interface VisitMark {
  readonly id: string;
  readonly status: VisitStatus;
  /** ISO day the mark was set, or null when the stored day was not a real day. */
  readonly markedOn: string | null;
}

/**
 * Read stored marks from JSON text or a parsed value. Entries with an unusable id or an unknown
 * status are dropped, a repeated id keeps its first entry, and the list is cut at MAX_VISIT_MARKS.
 * Only own keys are read, so nothing is taken from a prototype.
 */
export function parseVisitMarks(raw: unknown): VisitMark[] {
  let value = raw;
  if (typeof raw === "string") {
    try {
      value = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: VisitMark[] = [];
  for (const item of value as unknown[]) {
    if (out.length >= MAX_VISIT_MARKS) break;
    if (typeof item !== "object" || item === null || Array.isArray(item)) continue;
    const own = (k: string): unknown => (Object.prototype.hasOwnProperty.call(item, k) ? (item as Record<string, unknown>)[k] : undefined);
    const id = own("id");
    const status = own("status");
    if (!isShortlistId(id) || !isVisitStatus(status) || seen.has(id)) continue;
    seen.add(id);
    const day = own("markedOn");
    out.push({ id, status, markedOn: isIsoDate(day) ? day : null });
  }
  return out;
}

export function serializeVisitMarks(marks: readonly VisitMark[]): string {
  return JSON.stringify(marks.map((m) => ({ id: m.id, status: m.status, markedOn: m.markedOn })));
}

export function markFor(marks: readonly VisitMark[], id: string): VisitMark | null {
  return marks.find((m) => m.id === id) ?? null;
}

export type SetResult = "set" | "same" | "full" | "invalid";

/**
 * A new list with the place marked. Setting the status a place already has changes nothing and
 * keeps the day it was first set. A new status replaces the old one and takes today's day.
 */
export function setVisitMark(marks: readonly VisitMark[], id: string, status: VisitStatus, today: string): { readonly marks: readonly VisitMark[]; readonly result: SetResult } {
  if (!isShortlistId(id) || !isVisitStatus(status)) return { marks, result: "invalid" };
  const day = isIsoDate(today) ? today : null;
  const old = markFor(marks, id);
  if (old !== null) {
    if (old.status === status) return { marks, result: "same" };
    return { marks: marks.map((m) => (m.id === id ? { id, status, markedOn: day } : m)), result: "set" };
  }
  if (marks.length >= MAX_VISIT_MARKS) return { marks, result: "full" };
  return { marks: [...marks, { id, status, markedOn: day }], result: "set" };
}

export function clearVisitMark(marks: readonly VisitMark[], id: string): readonly VisitMark[] {
  return marks.some((m) => m.id === id) ? marks.filter((m) => m.id !== id) : marks;
}

/** Remove every mark whose id is not in the given set, for marks left behind by places no longer listed. */
export function keepMarksFor(marks: readonly VisitMark[], ids: ReadonlySet<string>): readonly VisitMark[] {
  return marks.some((m) => !ids.has(m.id)) ? marks.filter((m) => ids.has(m.id)) : marks;
}

export interface MarkSummary {
  readonly counts: Readonly<Record<VisitStatus, number>>;
  readonly unmarked: number;
  /** Marks on ids that are not among the listed places. */
  readonly elsewhere: number;
}

export function summariseMarks(marks: readonly VisitMark[], listedIds: readonly string[]): MarkSummary {
  const listed = new Set(listedIds);
  const counts: Record<VisitStatus, number> = { "to-visit": 0, been: 0, "ruled-out": 0 };
  let elsewhere = 0;
  let marked = 0;
  for (const m of marks) {
    if (listed.has(m.id)) {
      counts[m.status] += 1;
      marked += 1;
    } else elsewhere += 1;
  }
  return { counts, unmarked: listed.size - marked, elsewhere };
}

export interface MarkedPlace {
  readonly place: PackPlaceRecord;
  readonly mark: VisitMark | null;
}

/** Listed places in the order they were listed, each with its mark. Nothing is sorted by status. */
export function marksForPlaces(marks: readonly VisitMark[], places: readonly PackPlaceRecord[]): MarkedPlace[] {
  const byId = new Map(marks.map((m) => [m.id, m] as const));
  return places.map((place) => ({ place, mark: byId.get(place.id) ?? null }));
}

export function loadVisitMarks(store: KeyValueStore | null): { readonly marks: readonly VisitMark[]; readonly ok: boolean } {
  if (store === null) return { marks: [], ok: false };
  try {
    return { marks: parseVisitMarks(store.getItem(VISIT_MARKS_KEY)), ok: true };
  } catch {
    return { marks: [], ok: false };
  }
}

/** Save to a store. False when the store refuses, so the page can say the marks will not be kept. */
export function saveVisitMarks(store: KeyValueStore | null, marks: readonly VisitMark[]): boolean {
  if (store === null) return false;
  try {
    if (marks.length === 0) store.removeItem(VISIT_MARKS_KEY);
    else store.setItem(VISIT_MARKS_KEY, serializeVisitMarks(marks));
    return true;
  } catch {
    return false;
  }
}
