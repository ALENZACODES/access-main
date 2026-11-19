/** Column sorting for the sources table. Unknown values always sort last, in both directions. */
import type { AuditedSource } from './datasetRegistry';
import type { Locale } from './dataStatus';

import { TIER_IDS } from './tierValue';
export const SORT_KEYS = ['source', 'licence', 'retrieved', 'status', 'tier'] as const;
export type SortKey = (typeof SORT_KEYS)[number];
export type SortDir = 'asc' | 'desc';
export interface SortSpec {
  key: SortKey;
  dir: SortDir;
}

export function isSortKey(v: unknown): v is SortKey {
  return typeof v === 'string' && (SORT_KEYS as readonly string[]).includes(v);
}

/** `?sort=retrieved&dir=desc`; no valid `sort` means the default order (null). */
export function parseSort(search: string): SortSpec | null {
  const p = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  const key = p.get('sort');
  if (!isSortKey(key)) return null;
  return { key, dir: p.get('dir') === 'desc' ? 'desc' : 'asc' };
}

export function sortParams(spec: SortSpec | null): [string, string][] {
  if (spec === null) return [];
  return spec.dir === 'desc' ? [['sort', spec.key], ['dir', 'desc']] : [['sort', spec.key]];
}

/** Clicking a heading: a new column starts ascending; the same column flips direction. */
export function nextSort(current: SortSpec | null, key: SortKey): SortSpec {
  return current !== null && current.key === key ? { key, dir: current.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' };
}

export function ariaSort(current: SortSpec | null, key: SortKey): 'ascending' | 'descending' | null {
  if (current === null || current.key !== key) return null;
  return current.dir === 'asc' ? 'ascending' : 'descending';
}

const STATE_RANK = { stale: 0, fresh: 1 } as const;

/** Returns a new array; the input is not changed. Ties keep their original order. */
export function applySort(sources: readonly AuditedSource[], spec: SortSpec | null, locale: Locale): AuditedSource[] {
  const list = [...sources];
  if (spec === null) return list;
  const collator = new Intl.Collator(locale === 'fr' ? 'fr-CA' : 'en-CA', { sensitivity: 'base', numeric: true });
  const sign = spec.dir === 'asc' ? 1 : -1;
  const indexed = list.map((s, i) => ({ s, i }));
  indexed.sort((x, y) => {
    let a: string | number | null;
    let b: string | number | null;
    switch (spec.key) {
      case 'source':
        a = `${x.s.datasetName} / ${x.s.name ?? ''}`;
        b = `${y.s.datasetName} / ${y.s.name ?? ''}`;
        break;
      case 'licence':
        a = x.s.licence;
        b = y.s.licence;
        break;
      case 'retrieved':
        a = x.s.retrievedIso;
        b = y.s.retrievedIso;
        break;
      case 'status':
        a = x.s.state === 'unknown' ? null : STATE_RANK[x.s.state];
        b = y.s.state === 'unknown' ? null : STATE_RANK[y.s.state];
        break;
      case 'tier':
        // Fixed tier order: 0, 1, 2, 3, 4, then E.
        a = x.s.tier === null ? null : TIER_IDS.indexOf(x.s.tier);
        b = y.s.tier === null ? null : TIER_IDS.indexOf(y.s.tier);
        break;
    }
    // Unknown (null) is last whichever way the table is sorted.
    if (a === null || b === null) return (a === null ? 1 : 0) - (b === null ? 1 : 0) || x.i - y.i;
    const c = typeof a === 'number' && typeof b === 'number' ? a - b : collator.compare(String(a), String(b));
    return c * sign || x.i - y.i;
  });
  return indexed.map((e) => e.s);
}
