/**
 * Review schedule: the day each source reaches its "possibly out of date" setting,
 * counted from its retrieved date. It is a reminder to look again. A source without a
 * readable retrieved date is listed as not scheduled; no date is ever guessed.
 */
import type { AuditResult } from './datasetRegistry';
import type { Locale } from './dataStatus';
import { formatDisplayDate } from './locale';
import { t } from './i18n';
import { tCount } from './plural';
import { escapeHtml } from './sourceList';
import type { DatasetKind } from './freshnessPolicy';

export type DueStatus = 'overdue' | 'today' | 'upcoming' | 'unknown';

export interface DueItem {
  datasetId: string;
  datasetName: string;
  sourceId: string;
  name: string | null;
  kind: DatasetKind;
  retrievedIso: string | null;
  staleAfterDays: number;
  /** YYYY-MM-DD, or null when the retrieved date is Unknown. */
  dueIso: string | null;
  /** Whole UTC days from today to the review date (negative = past due); null when unknown. */
  daysUntil: number | null;
  status: DueStatus;
}

const DAY_MS = 86_400_000;

function dayStart(iso: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}/.test(iso)) return null;
  const ms = Date.parse(`${iso.slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(ms) ? null : ms;
}

export function toIsoDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** YYYY-MM-DD plus whole days (UTC); null for an unreadable date. */
export function addDaysIso(iso: string, days: number): string | null {
  const start = dayStart(iso);
  if (start === null || !Number.isInteger(days)) return null;
  return toIsoDay(start + days * DAY_MS);
}

function utcToday(now: Date): number {
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
}

/** All sources, most urgent first; Unknown dates last. */
export function buildReviewQueue(audit: AuditResult, now: Date): DueItem[] {
  const today = utcToday(now);
  const items = audit.sources.map((s): DueItem => {
    // Each audited source carries the limit that was applied to it, so duplicate dataset ids cannot mix limits up.
    const staleAfterDays = s.limitDays;
    // A date that is missing, unreadable or in the future makes the state Unknown: nothing is scheduled from it.
    const known = s.retrievedIso !== null && s.state !== 'unknown';
    const dueIso = known && s.retrievedIso !== null ? addDaysIso(s.retrievedIso, staleAfterDays) : null;
    const due = dueIso === null ? null : dayStart(dueIso);
    const daysUntil = due === null ? null : Math.round((due - today) / DAY_MS);
    const status: DueStatus = daysUntil === null ? 'unknown' : daysUntil < 0 ? 'overdue' : daysUntil === 0 ? 'today' : 'upcoming';
    return { datasetId: s.datasetId, datasetName: s.datasetName, sourceId: s.sourceId, name: s.name, kind: s.kind, retrievedIso: known ? s.retrievedIso : null, staleAfterDays, dueIso, daysUntil, status };
  });
  return items.sort(
    (a, b) =>
      (a.daysUntil === null ? 1 : 0) - (b.daysUntil === null ? 1 : 0) ||
      (a.daysUntil ?? 0) - (b.daysUntil ?? 0) ||
      a.datasetName.localeCompare(b.datasetName) ||
      a.sourceId.localeCompare(b.sourceId),
  );
}

export function dueText(item: Pick<DueItem, 'status' | 'daysUntil'>, locale: Locale): string {
  const n = item.daysUntil;
  if (n === null) return t(locale, 'due.unknown');
  if (n < 0) return tCount(locale, 'due.overdue', -n, { days: -n });
  if (n === 0) return t(locale, 'due.today');
  return tCount(locale, 'due.in', n, { days: n });
}

export const DEFAULT_DUE_LIMIT = 50;

export function renderReviewHtml(items: readonly DueItem[], locale: Locale, limit: number = DEFAULT_DUE_LIMIT): string {
  const esc = escapeHtml;
  const head = `<h2 id="ds-due-title">${esc(t(locale, 'due.title'))}</h2><p>${esc(t(locale, 'due.intro'))}</p>`;
  if (items.length === 0) return `<section aria-labelledby="ds-due-title">${head}<p>${esc(t(locale, 'due.none'))}</p></section>`;
  const shown = items.slice(0, Math.max(0, limit));
  const rows = shown
    .map((i) => {
      const label = esc(`${i.datasetName} / ${i.name ?? t(locale, 'unknownName')}`);
      const date = i.dueIso === null ? esc(t(locale, 'unknown')) : `<time datetime="${esc(i.dueIso)}">${esc(formatDisplayDate(i.dueIso, locale))}</time>`;
      return `<tr><th scope="row">${label}</th><td>${date}</td><td>${esc(dueText(i, locale))}</td></tr>`;
    })
    .join('');
  const more = items.length > shown.length ? `<p>${esc(t(locale, 'due.more', { count: items.length - shown.length }))}</p>` : '';
  const cap = esc(t(locale, 'due.title'));
  return (
    `<section aria-labelledby="ds-due-title">${head}` +
    `<div class="ds-scroll" role="region" tabindex="0" aria-label="${cap}"><table><caption>${cap}</caption><thead><tr>` +
    `<th scope="col">${esc(t(locale, 'due.source'))}</th><th scope="col">${esc(t(locale, 'due.dueOn'))}</th><th scope="col">${esc(t(locale, 'due.when'))}</th>` +
    `</tr></thead><tbody>${rows}</tbody></table></div>${more}</section>`
  );
}
