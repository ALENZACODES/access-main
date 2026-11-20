/** Shared builders for the place sheet tests. Not used by the App. */
import { parsePackPlaces, type PackPlaceRecord } from "./packPlaces";

export const PROV = { source_name: "OpenStreetMap, Geofabrik Ontario extract", source_url: "https://www.openstreetmap.org/way/42", licence: "ODbL-1.0", retrieved_at: "2026-11-10", tier: 0 };

/** One pack place, parsed the way the App parses the pack. Pass `null` to drop a field. */
export function place(id: string, over: Record<string, unknown> = {}): PackPlaceRecord {
  const raw: Record<string, unknown> = { id, name: `Place ${id}`, wheelchair: "yes", category: "cafe", address: "1 Main Street", lat: 43.65, lon: -79.38, provenance: PROV, ...over };
  for (const [k, v] of Object.entries(raw)) if (v === null) delete raw[k];
  const parsed = parsePackPlaces([raw]).places[0];
  if (!parsed) throw new Error(`fixture ${id} did not parse`);
  return parsed;
}

/** A place the pack tells almost nothing about. */
export const bare = (id: string): PackPlaceRecord => place(id, { name: null, wheelchair: null, category: null, address: null, lat: null, lon: null, provenance: null });

export function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

const TAGS = ["yes", "limited", "no", "designated", "UNKNOWN", "weird", null];
const NAMES = ["Café Un", 'Tom & Jerry\'s <b>"Place"</b>', "東京カフェ", "Name; with, punctuation\\", "A".repeat(120), null, "Line\nbreak", "  spaced   out  "];

/** `n` places with varied, sometimes awkward, fields. About one in five has no map point. */
export function varied(seed: number, n: number): PackPlaceRecord[] {
  const next = lcg(seed);
  const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(next() * xs.length)]!;
  return Array.from({ length: n }, (_, i) => {
    const located = next() >= 0.2;
    return place(`p${String(i).padStart(3, "0")}`, {
      name: pick(NAMES),
      wheelchair: pick(TAGS),
      category: next() < 0.2 ? null : pick(["cafe", "museum", "library"]),
      address: next() < 0.3 ? null : `${i} Main Street, Unit 2; rear`,
      lat: located ? 43.6 + next() * 0.1 : null,
      lon: located ? -79.45 + next() * 0.15 : null,
      provenance: next() < 0.15 ? null : PROV,
    });
  });
}
