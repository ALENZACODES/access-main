import type { PackFieldValue, PackRecord } from "@access/shared";

/**
 * Turns a place the person named or chose into a point for the journey
 * planner. The point is the record's own `lat` and `lon` fields, each with a
 * source, licence, date and tier. A search hit's coordinate is never used:
 * the search index sets a missing coordinate to 0.
 */

/** What the resolver needs from the data pack. */
export interface ResolveSource {
  search(text: string, opts: { tranches?: Array<"venue" | "washroom" | "transit" | "path">; limit?: number }): Promise<ReadonlyArray<{ id: string; name?: string | null; nameNorm?: string }>>;
  get(id: string): Promise<PackRecord | null>;
}

export interface SourcedPoint {
  lat: number;
  lon: number;
  /** The field the latitude came from. */
  latField: PackFieldValue;
  lonField: PackFieldValue;
}

export type ResolvedPlace =
  | { status: "resolved"; id: string; name: string; point: SourcedPoint }
  | { status: "no-position"; id: string; name: string }
  | { status: "not-found" }
  | { status: "ambiguous"; options: Array<{ id: string; name: string }> };

const PLACE_TRANCHES = ["venue", "washroom", "transit"] as const;

/** Lowercase, accents and punctuation removed, spaces collapsed: the same folding the pack search index uses. */
export function foldName(text: string): string {
  return text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

function sourced(field: PackFieldValue | undefined): field is PackFieldValue {
  if (!field) return false;
  if (typeof field.source_id !== "string" || !field.source_id.trim()) return false;
  if (typeof field.licence !== "string" || !field.licence.trim()) return false;
  if (typeof field.retrieved_at !== "string" || !/^\d{4}-\d{2}-\d{2}/.test(field.retrieved_at)) return false;
  return Number.isInteger(field.tier) && field.tier >= 0 && field.tier <= 4;
}

/** The record's own position, or null when either coordinate is missing, Unknown, out of range or unsourced. */
export function recordPosition(record: PackRecord): SourcedPoint | null {
  const latField = record.fields.lat;
  const lonField = record.fields.lon;
  if (!sourced(latField) || !sourced(lonField)) return null;
  const lat = latField.value;
  const lon = lonField.value;
  if (typeof lat !== "number" || typeof lon !== "number") return null;
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return { lat, lon, latField, lonField };
}

function recordName(record: PackRecord, fallback: string): string {
  const value = record.fields.name?.value;
  return typeof value === "string" && value.trim() && value !== "UNKNOWN" ? value : fallback;
}

/** A place the person chose from the search: the record by its id. */
export async function resolveRecord(source: ResolveSource, id: string, label: string): Promise<ResolvedPlace> {
  const record = await source.get(id);
  if (!record) return { status: "not-found" };
  const name = recordName(record, label);
  const point = recordPosition(record);
  return point ? { status: "resolved", id: record.id, name, point } : { status: "no-position", id: record.id, name };
}

/**
 * Typed text that was not chosen from the search. Only hits whose name equals
 * the text after folding count. Two or more records: the person chooses; the
 * shell never chooses for them.
 */
export async function resolvePoint(source: ResolveSource, label: string): Promise<ResolvedPlace> {
  const wanted = foldName(label);
  if (!wanted) return { status: "not-found" };
  const hits = await source.search(label, { tranches: [...PLACE_TRANCHES], limit: 10 });
  const exact = new Map<string, string>();
  for (const hit of hits) {
    const name = typeof hit.name === "string" ? hit.name : null;
    if (foldName(name ?? hit.nameNorm ?? "") === wanted && !exact.has(hit.id)) exact.set(hit.id, name ?? label);
  }
  if (exact.size === 0) return { status: "not-found" };
  if (exact.size > 1) return { status: "ambiguous", options: [...exact].map(([id, name]) => ({ id, name })) };
  const [id] = [...exact.keys()];
  return resolveRecord(source, id!, label);
}
