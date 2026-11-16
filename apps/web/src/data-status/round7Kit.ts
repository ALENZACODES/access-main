/** Test helpers for the round-7 modules (seeded random registries, not exported from any barrel). */
import type { DatasetRecord } from './datasetRegistry';
import { DATASET_KINDS } from './freshnessPolicy';
import type { SourceInput } from './sourceList';

/** Small deterministic generator, so a failing case can be replayed from its seed. */
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

export function pick<T>(rand: () => number, items: readonly T[]): T {
  if (items.length === 0) throw new Error('pick from an empty list');
  return items[Math.floor(rand() * items.length)] as T;
}

export function isoDayOffset(base: Date, days: number): string {
  return new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate() + days)).toISOString().slice(0, 10);
}

const NAMES = ['Alpha', 'Beta | Gamma', 'Delta <b>', 'Eps`ilon', '[Zeta](https://example.org)', '# Eta', 'Théta', '', '  '] as const;
const LICENCES = ['OGL-Ontario', 'CC-BY-4.0', 'Proprietary', '', null, 'N/A', undefined] as const;

export function randomSource(rand: () => number, now: Date, id: string): SourceInput {
  const kind = rand();
  let retrievedAt: string | null | undefined;
  if (kind < 0.15) retrievedAt = null;
  else if (kind < 0.25) retrievedAt = 'soon';
  else if (kind < 0.3) retrievedAt = 'TBD';
  else if (kind < 0.4) retrievedAt = isoDayOffset(now, 1 + Math.floor(rand() * 400));
  else retrievedAt = isoDayOffset(now, -Math.floor(rand() * 900));
  return { id, name: pick(rand, NAMES), source: rand() < 0.8 ? 'Publisher' : null, licence: pick(rand, LICENCES), retrievedAt, url: rand() < 0.5 ? 'https://example.org/x' : null };
}

export function randomRegistry(seed: number, now: Date): DatasetRecord[] {
  const rand = mulberry32(seed);
  const count = 1 + Math.floor(rand() * 6);
  const records: DatasetRecord[] = [];
  for (let i = 0; i < count; i++) {
    const sourceCount = Math.floor(rand() * 5);
    const sources: SourceInput[] = [];
    for (let j = 0; j < sourceCount; j++) sources.push(randomSource(rand, now, `s${i}-${j}`));
    records.push({ id: rand() < 0.1 ? 'dup' : `d${i}`, name: pick(rand, NAMES), kind: pick(rand, DATASET_KINDS), sources });
  }
  return records;
}
