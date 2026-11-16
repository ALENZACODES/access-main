/**
 * Small on-device history of data-quality totals, one entry per UTC day (newest wins).
 * Stores counts only: no records, no personal data.
 */
import type { AuditResult, AuditTotals } from './datasetRegistry';
import type { Locale } from './dataStatus';
import { t, type MessageKey } from './i18n';
import { escapeHtml } from './sourceList';
import type { StorageLike } from './snapshot';

export const HISTORY_KEY = 'data-status:history:v1';
export const MAX_HISTORY = 30;

export type HistoryTotals = Pick<AuditTotals, 'sources' | 'stale' | 'unknownDate' | 'notOpen' | 'missingDetails'>;

export interface HistoryEntry {
  /** UTC day, YYYY-MM-DD. */
  date: string;
  totals: HistoryTotals;
}

const METRICS: readonly { key: keyof HistoryTotals; label: MessageKey }[] = [
  { key: 'sources', label: 'qa.counts.sources' },
  { key: 'stale', label: 'qa.counts.stale' },
  { key: 'unknownDate', label: 'qa.counts.unknownDate' },
  { key: 'notOpen', label: 'qa.counts.notOpen' },
  { key: 'missingDetails', label: 'qa.counts.missing' },
];

export function entryFromAudit(audit: AuditResult, now: Date): HistoryEntry {
  const tot = audit.totals;
  return {
    date: now.toISOString().slice(0, 10),
    totals: {
      sources: tot.sources,
      stale: tot.stale,
      unknownDate: tot.unknownDate,
      notOpen: tot.notOpen,
      missingDetails: tot.missingDetails,
    },
  };
}

/** Add an entry: replaces the same day, keeps date order, drops the oldest beyond `max`. */
export function addEntry(entries: readonly HistoryEntry[], entry: HistoryEntry, max: number = MAX_HISTORY): HistoryEntry[] {
  const merged = [...entries.filter((e) => e.date !== entry.date), entry].sort((a, b) => a.date.localeCompare(b.date));
  return merged.slice(Math.max(0, merged.length - Math.max(1, max)));
}

const isCount = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0;

export function parseHistory(text: string): HistoryEntry[] | null {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  if (!Array.isArray(raw)) return null;
  const out: HistoryEntry[] = [];
  for (const e of raw as unknown[]) {
    if (e === null || typeof e !== 'object') return null;
    const { date, totals } = e as { date?: unknown; totals?: unknown };
    if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`))) return null;
    if (totals === null || typeof totals !== 'object') return null;
    const tt = totals as Record<string, unknown>;
    if (!METRICS.every((m) => isCount(tt[m.key]))) return null;
    out.push({ date, totals: Object.fromEntries(METRICS.map((m) => [m.key, tt[m.key]])) as unknown as HistoryTotals });
  }
  return out;
}

export interface HistoryStore {
  /** Saved entries; empty when nothing is saved, storage is blocked, or the data is unreadable. */
  load(): HistoryEntry[];
  /** Add today's entry and save; returns the updated list (unsaved if storage failed). */
  record(entry: HistoryEntry): HistoryEntry[];
  clear(): void;
}

export function createHistoryStore(storage: StorageLike | null | undefined, key: string = HISTORY_KEY, max: number = MAX_HISTORY): HistoryStore {
  const load = (): HistoryEntry[] => {
    try {
      const text = storage?.getItem(key);
      return text ? (parseHistory(text) ?? []) : [];
    } catch {
      return [];
    }
  };
  return {
    load,
    record(entry) {
      const next = addEntry(load(), entry, max);
      try {
        storage?.setItem(key, JSON.stringify(next));
      } catch {
        /* storage full or blocked: keep going without saving */
      }
      return next;
    },
    clear() {
      try {
        storage?.removeItem(key);
      } catch {
        /* ignore */
      }
    },
  };
}

export interface TrendLine {
  key: keyof HistoryTotals;
  label: string;
  from: number;
  to: number;
  direction: 'up' | 'down' | 'same';
}

/** Compare the last two entries. Returns [] with fewer than two. Wording stays neutral. */
export function trend(entries: readonly HistoryEntry[], locale: Locale): TrendLine[] {
  if (entries.length < 2) return [];
  const prev = entries[entries.length - 2]!;
  const last = entries[entries.length - 1]!;
  return METRICS.map((m) => {
    const from = prev.totals[m.key];
    const to = last.totals[m.key];
    return { key: m.key, label: t(locale, m.label), from, to, direction: to > from ? 'up' : to < from ? 'down' : 'same' };
  });
}

export function renderHistoryHtml(entries: readonly HistoryEntry[], locale: Locale): string {
  const title = `<h2 id="ds-hist-title">${escapeHtml(t(locale, 'hist.title'))}</h2>`;
  if (entries.length < 2) {
    return `<section aria-labelledby="ds-hist-title">${title}<p>${escapeHtml(t(locale, 'hist.tooFew'))}</p></section>`;
  }
  const deltas = trend(entries, locale)
    .map((l) => `<li>${escapeHtml(t(locale, `hist.${l.direction}`, { label: l.label, from: l.from, to: l.to }))}</li>`)
    .join('');
  const head = METRICS.map((m) => `<th scope="col">${escapeHtml(t(locale, m.label))}</th>`).join('');
  const rows = [...entries]
    .reverse()
    .map(
      (e) =>
        `<tr><th scope="row"><time datetime="${e.date}">${e.date}</time></th>` +
        METRICS.map((m) => `<td>${e.totals[m.key]}</td>`).join('') +
        `</tr>`,
    )
    .join('');
  return (
    `<section aria-labelledby="ds-hist-title">${title}<ul>${deltas}</ul>` +
    `<div class="ds-scroll" role="region" tabindex="0" aria-label="${escapeHtml(t(locale, 'hist.title'))}">` +
    `<table><caption>${escapeHtml(t(locale, 'hist.title'))}</caption><thead><tr><th scope="col">${escapeHtml(t(locale, 'hist.date'))}</th>${head}</tr></thead>` +
    `<tbody>${rows}</tbody></table></div></section>`
  );
}
