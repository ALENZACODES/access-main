// A small seeded random number generator for the robustness checks. The same seed always gives the
// same run, so a failure can be repeated exactly from the seed printed in the failure message.
// This is test tooling only: it is never used for anything a person sees.

export interface Rng {
  /** A number from 0 up to, but not including, 1 */
  next(): number;
  /** A whole number from `min` to `max`, both included */
  int(min: number, max: number): number;
  bool(chance?: number): boolean;
  pick<T>(items: readonly T[]): T;
  /** A new generator whose numbers do not depend on how many this one has handed out */
  fork(label: string): Rng;
  readonly seed: number;
}

/** Turns any text into a 32-bit number, so a label can seed a generator. */
export function hashText(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** mulberry32: small, fast and the same on every machine. */
export function createRng(seed: number): Rng {
  let a = seed >>> 0;
  const next = (): number => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (min: number, max: number): number => {
    if (!Number.isInteger(min) || !Number.isInteger(max) || max < min) throw new RangeError(`int(${min}, ${max})`);
    return min + Math.floor(next() * (max - min + 1));
  };
  return {
    seed: seed >>> 0,
    next,
    int,
    bool: (chance = 0.5) => next() < chance,
    pick: <T>(items: readonly T[]): T => {
      if (items.length === 0) throw new RangeError("pick from an empty list");
      return items[int(0, items.length - 1)] as T;
    },
    fork: (label: string): Rng => createRng((hashText(label) ^ (seed >>> 0)) >>> 0),
  };
}

/** The seed for a run: the run number mixed into the base seed, so every run differs but is repeatable. */
export function seedFor(base: number, run: number): number {
  return (Math.imul(base >>> 0, 2654435761) ^ Math.imul(run + 1, 40503)) >>> 0;
}
