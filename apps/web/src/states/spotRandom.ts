/**
 * A small seeded random generator, so a spot-check sample is the same on every device for the
 * same places and the same seed, and can be drawn again by anyone who has both. It is for choosing
 * places to look at, not for anything that needs unpredictability.
 */

/** FNV-1a over the UTF-16 code units of the text: a 32-bit number that is the same everywhere. */
export function hashSeed(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Mulberry32: a number in [0, 1) each call, from a 32-bit seed. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A random generator for a seed text. */
export function randomFor(seedText: string): () => number {
  return mulberry32(hashSeed(seedText));
}

/** The items in a seeded random order (Fisher–Yates). The input is not changed. */
export function shuffleSeeded<T>(items: readonly T[], seedText: string): T[] {
  const out = [...items];
  const next = randomFor(seedText);
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(next() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}
