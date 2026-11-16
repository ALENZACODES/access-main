/**
 * iCalendar (RFC 5545) file of review dates. One all-day event per source that has a
 * readable retrieved date; sources with an Unknown date get no event. Nothing is sent
 * or scheduled: the person downloads the file and opens it in their own calendar.
 */
import type { Locale } from './dataStatus';
import { formatDisplayDate } from './locale';
import { t } from './i18n';
import { addDaysIso, type DueItem } from './reviewDue';
import { fnv1a32 } from './snapshot';

const CRLF = '\r\n';
export const ICS_PRODID = '-//The App//Data status review dates//EN';

/** Escape TEXT values: backslash, semicolon, comma and line breaks. */
export function icsEscape(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r\n|\r|\n/g, '\\n');
}

/** Fold a content line to at most 75 octets per line without splitting a character. */
export function foldLine(line: string): string {
  const enc = new TextEncoder();
  if (enc.encode(line).length <= 75) return line;
  const parts: string[] = [];
  let cur = '';
  let curBytes = 0;
  let limit = 75;
  for (const ch of line) {
    const b = enc.encode(ch).length;
    if (curBytes + b > limit) {
      parts.push(cur);
      cur = '';
      curBytes = 0;
      limit = 74; // continuation lines start with one space
    }
    cur += ch;
    curBytes += b;
  }
  parts.push(cur);
  return parts.join(CRLF + ' ');
}

function compactDate(iso: string): string {
  return iso.replace(/-/g, '');
}

function stamp(now: Date): string {
  return now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

/** Stable, ASCII-only event id so re-importing updates events instead of duplicating them. */
export function eventUid(item: Pick<DueItem, 'datasetId' | 'sourceId'>): string {
  const safe = `${item.datasetId}-${item.sourceId}`.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
  return `${safe}-${fnv1a32(`${item.datasetId}\u0000${item.sourceId}`)}@data-status`;
}

export function icsEventCount(items: readonly DueItem[]): number {
  return items.filter((i) => i.dueIso !== null).length;
}

export function buildIcs(items: readonly DueItem[], now: Date, locale: Locale): string {
  const lines: string[] = ['BEGIN:VCALENDAR', 'VERSION:2.0', `PRODID:${ICS_PRODID}`, 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', `X-WR-CALNAME:${icsEscape(t(locale, 'ics.calName'))}`];
  for (const i of items) {
    if (i.dueIso === null || i.retrievedIso === null) continue;
    const next = addDaysIso(i.dueIso, 1);
    if (next === null) continue;
    const name = i.name ?? t(locale, 'unknownName');
    lines.push(
      'BEGIN:VEVENT',
      `UID:${eventUid(i)}`,
      `DTSTAMP:${stamp(now)}`,
      `DTSTART;VALUE=DATE:${compactDate(i.dueIso)}`,
      `DTEND;VALUE=DATE:${compactDate(next)}`,
      `SUMMARY:${icsEscape(t(locale, 'ics.summary', { name: `${i.datasetName} / ${name}` }))}`,
      `DESCRIPTION:${icsEscape(t(locale, 'ics.description', { date: formatDisplayDate(i.retrievedIso, locale), days: i.staleAfterDays }))}`,
      'TRANSP:TRANSPARENT',
      'END:VEVENT',
    );
  }
  lines.push('END:VCALENDAR');
  return lines.map(foldLine).join(CRLF) + CRLF;
}
