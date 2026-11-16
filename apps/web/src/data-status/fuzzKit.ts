/** Seeded random registries with messy values, for tests only (not exported from index.ts). */
import type { DatasetRecord } from './datasetRegistry';
import type { SourceInput } from './sourceList';
import { DATASET_KINDS } from './freshnessPolicy';

/** Small deterministic PRNG so a failing seed can be replayed. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type Rand = () => number;

export function pick<T>(r: Rand, items: readonly T[]): T {
  return items[Math.floor(r() * items.length)] as T;
}

const NAMES = ['Alpha', 'Beta', 'City portal', 'Transit feed', '  Spaced  ', 'Évaluation', '', ' ', 'N/A', 'TBD', 'unknown', 'inconnu', 'Quote "q", comma', '=SUM(A1)', '<b>x</b>', null, undefined] as const;
const LICENCES = ['OGL-Ontario', 'Open Government Licence – Ontario', 'CC-BY-4.0', 'Metrolinx AUA', 'Proprietary', 'N/A', 'unknown', 'TBD', '', '   ', null, undefined, 'Custom terms 2024'] as const;
const URLS = ['https://example.org/a', 'http://example.org/b', 'javascript:alert(1)', 'ftp://example.org', 'not a url', '', null, undefined, 'https://exa mple.org'] as const;

function day(r: Rand, now: Date, minBack: number, maxBack: number): string {
  const ms = now.getTime() - (minBack + Math.floor(r() * (maxBack - minBack))) * 86_400_000;
  return new Date(ms).toISOString().slice(0, 10);
}

/** A retrieved value drawn from valid, borderline, impossible, future and placeholder dates. */
export function randomRetrieved(r: Rand, now: Date): string | null | undefined {
  const n = r();
  if (n < 0.3) return day(r, now, 0, 100);
  if (n < 0.45) return day(r, now, 100, 800);
  if (n < 0.5) return `${day(r, now, 0, 300)}T${pick(r, ['00:00:00Z', '23:59:59Z', '12:30:00+05:30', '08:00:00-05:00', '23:30:00-12:00'])}`;
  if (n < 0.58) return `${day(r, now, 0, 300)}T10:00:00`; // no offset
  if (n < 0.66) return pick(r, ['2026-02-31', '2025-02-29', '2026-13-01', '2026-00-00', '1850-01-01', 'yesterday', '11/16/2026', '2026-11']);
  if (n < 0.74) return day(r, now, -400, 0); // future
  if (n < 0.84) return pick(r, ['N/A', 'TBD', 'unknown', 'inconnu', '', '  ']);
  return pick(r, [null, undefined]);
}

export function randomRecords(seed: number, now: Date): DatasetRecord[] {
  const r = mulberry32(seed);
  const datasets = Math.floor(r() * 5);
  const out: DatasetRecord[] = [];
  for (let d = 0; d < datasets; d++) {
    const sources: SourceInput[] = [];
    const count = Math.floor(r() * 5);
    for (let s = 0; s < count; s++) {
      sources.push({
        id: r() < 0.08 ? 's0' : `s${s}`,
        name: pick(r, NAMES),
        source: pick(r, NAMES),
        licence: pick(r, LICENCES),
        retrievedAt: randomRetrieved(r, now),
        url: pick(r, URLS),
      });
    }
    out.push({ id: r() < 0.06 ? 'd0' : `d${d}`, name: pick(r, NAMES) ?? 'x', kind: pick(r, DATASET_KINDS), sources });
  }
  return out;
}
