/**
 * Places from the offline pack stored on this device (schema "offline-pack-1.0.0").
 *
 * The pack carries one OpenStreetMap `wheelchair` tag per place. That tag is
 * kept as a report with its source. It is not mapped onto the App's specific
 * details (step-free entrance, elevator and so on) because the tag does not say
 * which of them is true. A tag with no usable source, an unrecognised value or
 * no value stays UNKNOWN.
 *
 * Everything here treats the pack as untrusted input: bad records are dropped
 * and counted, never repaired.
 */
import { type Provenance, isIsoDate, validateProvenance } from "./provenance";
import { type Point, isPoint } from "./packGeo";

export const WHEELCHAIR_TAGS = ["yes", "limited", "no", "designated"] as const;
export type ReportedTag = (typeof WHEELCHAIR_TAGS)[number];
export type WheelchairTag = ReportedTag | "unknown";
export type TagUnknownReason = "not-recorded" | "unrecognised-value" | "missing-provenance";

export interface PackPlaceRecord {
  readonly id: string;
  /** null when the pack gives no name. */
  readonly name: string | null;
  readonly tag: WheelchairTag;
  readonly tagUnknownReason: TagUnknownReason | null;
  readonly provenance: Provenance | null;
  readonly category: string | null;
  readonly address: string | null;
  readonly note: string | null;
  readonly location: Point | null;
}

export interface ParsedPackPlaces {
  readonly places: readonly PackPlaceRecord[];
  /** Records that could not be used at all (no safe id, not an object, duplicate id). */
  readonly dropped: number;
}

const MAX_TEXT = 500;
const MAX_ID = 200;
/** Control characters and bidirectional overrides have no place in a name or note. */
// eslint-disable-next-line no-control-regex -- the point is to match control characters
const UNSAFE_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F‪-‮⁦-⁩]/g;

/** Text as the pack gives it: trimmed, cleaned and capped. The pack's "UNKNOWN" and blanks become null. */
export function cleanText(value: unknown, max = MAX_TEXT): string | null {
  if (typeof value !== "string") return null;
  const s = value.replace(UNSAFE_CHARS, "").replace(/\s+/g, " ").trim();
  if (s === "" || s.toUpperCase() === "UNKNOWN") return null;
  return s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s;
}

export function normaliseTag(value: unknown): { tag: WheelchairTag; reason: TagUnknownReason | null } {
  if (typeof value !== "string" || value.trim() === "" || value.trim().toUpperCase() === "UNKNOWN") {
    return { tag: "unknown", reason: "not-recorded" };
  }
  const v = value.trim().toLowerCase();
  return (WHEELCHAIR_TAGS as readonly string[]).includes(v)
    ? { tag: v as ReportedTag, reason: null }
    : { tag: "unknown", reason: "unrecognised-value" };
}

/** The pack's provenance object, read into the App's own provenance. Any gap makes it null. */
export function readPackProvenance(input: unknown): Provenance | null {
  if (typeof input !== "object" || input === null) return null;
  const p = input as Record<string, unknown>;
  const retrieved = typeof p.retrieved_at === "string" ? p.retrieved_at.slice(0, 10) : "";
  if (!isIsoDate(retrieved)) return null;
  const url = typeof p.source_url === "string" && /^https:\/\/\S+$/.test(p.source_url) ? p.source_url : undefined;
  const result = validateProvenance({ source: p.source_name, licence: p.licence, retrievedOn: retrieved, ...(url ? { url } : {}) });
  return result.ok ? result.value : null;
}

function readPoint(lat: unknown, lon: unknown): Point | null {
  const p = { lat, lon };
  return isPoint(p) ? p : null;
}

export function parsePackPlace(input: unknown): PackPlaceRecord | null {
  if (typeof input !== "object" || input === null || Array.isArray(input)) return null;
  const r = input as Record<string, unknown>;
  // eslint-disable-next-line no-control-regex -- ids may not hold control characters or spaces
  if (typeof r.id !== "string" || r.id.length === 0 || r.id.length > MAX_ID || /[\u0000-\u001F\u007F\s]/.test(r.id)) return null;

  const provenance = readPackProvenance(r.provenance);
  const raw = normaliseTag(r.wheelchair);
  // A tag only counts as reported when it has a usable source.
  const tag: WheelchairTag = raw.tag !== "unknown" && provenance === null ? "unknown" : raw.tag;
  const reason: TagUnknownReason | null = tag !== "unknown" ? null : raw.tag !== "unknown" ? "missing-provenance" : raw.reason;

  return {
    id: r.id,
    name: cleanText(r.name, 200),
    tag,
    tagUnknownReason: reason,
    provenance,
    category: cleanText(r.category, 100),
    address: cleanText(r.address, 200),
    note: cleanText(r.wheelchair_description),
    location: readPoint(r.lat, r.lon),
  };
}

/** Parse the `places` array of a stored pack. Anything that is not an array yields no places. */
export function parsePackPlaces(input: unknown): ParsedPackPlaces {
  if (!Array.isArray(input)) return { places: [], dropped: 0 };
  const seen = new Set<string>();
  const places: PackPlaceRecord[] = [];
  let dropped = 0;
  for (const item of input) {
    const place = parsePackPlace(item);
    if (!place || seen.has(place.id)) {
      dropped += 1;
      continue;
    }
    seen.add(place.id);
    places.push(place);
  }
  return { places, dropped };
}

export function countByTag(places: readonly PackPlaceRecord[]): Record<WheelchairTag, number> {
  const counts: Record<WheelchairTag, number> = { yes: 0, limited: 0, no: 0, designated: 0, unknown: 0 };
  for (const p of places) counts[p.tag] += 1;
  return counts;
}
