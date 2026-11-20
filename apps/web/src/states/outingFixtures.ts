/** Shared builders for the outing tests. Not used by the App. */
import type { OutingInput } from "./outingPlan";
import type { WheelchairTag } from "./packPlaces";

/** A place on the line of latitude 43.65, `east` hundredths of a degree east of -79.40. Each step is about 800 m. */
export function onLine(id: string, east: number | null, over: Partial<OutingInput> = {}): OutingInput {
  return {
    id,
    name: `Place ${id}`,
    tag: "yes",
    category: "cafe",
    address: "1 Main Street",
    point: east === null ? null : { lat: 43.65, lon: -79.4 + east / 100 },
    ...over,
  };
}

export const START_WEST = { lat: 43.65, lon: -79.41 } as const;
export const START_EAST = { lat: 43.65, lon: -79.3 } as const;

/** A seeded generator, so a failing set can be rebuilt from its seed. */
export function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

const TAGS: readonly WheelchairTag[] = ["yes", "limited", "no", "designated", "unknown"];

/** `n` places scattered over part of Toronto; about one in five has no map point. */
export function scattered(seed: number, n: number): OutingInput[] {
  const next = lcg(seed);
  return Array.from({ length: n }, (_, i) => {
    const located = next() >= 0.2;
    return {
      id: `p${String(i).padStart(3, "0")}`,
      name: next() < 0.1 ? null : `Place ${i}`,
      tag: TAGS[Math.floor(next() * TAGS.length)]!,
      category: next() < 0.2 ? null : "cafe",
      address: next() < 0.3 ? null : `${i} Main Street`,
      point: located ? { lat: 43.6 + next() * 0.1, lon: -79.45 + next() * 0.15 } : null,
    };
  });
}
