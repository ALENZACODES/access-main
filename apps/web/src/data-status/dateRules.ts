/**
 * One reading of a "retrieved" date for every screen and route.
 *
 * - Accepted: YYYY-MM-DD, or a date-time that states its own offset (Z or +hh:mm).
 *   A date-time without an offset is ambiguous (it would depend on the reader's time
 *   zone), so it is not accepted.
 * - Impossible dates (February 31) are rejected, never rolled over to another day.
 * - The shown date is the calendar date as the source wrote it (its own offset is not shifted
 *   to another day). Ages count whole calendar days from that date to today's UTC date, so a
 *   record written in a zone ahead of UTC is never given a negative age.
 * - A date-time is "future" when its instant is after now; a plain date is "future" when it is
 *   after today's UTC date. Either way the status stays Unknown and the issue is reported.
 * - Dates before EARLIEST_RETRIEVED_DAY are rejected as typing errors.
 */
import { cleanValue } from './unknownTokens';

export const EARLIEST_RETRIEVED_DAY = '1990-01-01';
const DAY_MS = 86_400_000;
const EARLIEST_MS = Date.parse(`${EARLIEST_RETRIEVED_DAY}T00:00:00Z`);

const ISO = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,9})?)?(Z|[+-]\d{2}:\d{2}))$|^(\d{4})-(\d{2})-(\d{2})$/;

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export interface ParsedRetrieved {
  /** Instant in epoch ms (a plain date counts as 00:00 UTC). */
  ms: number;
  /** Calendar date as written, YYYY-MM-DD. */
  day: string;
  /** True when the text had a time part. */
  hadTime: boolean;
}

/** Strict parse; null for anything that is not a real, unambiguous date. */
export function parseRetrieved(raw: string | null | undefined): ParsedRetrieved | null {
  const v = cleanValue(raw);
  if (v === null) return null;
  const m = ISO.exec(v);
  if (!m) return null;
  const dateOnly = m[8] !== undefined;
  const y = Number(dateOnly ? m[8] : m[1]);
  const mo = Number(dateOnly ? m[9] : m[2]);
  const d = Number(dateOnly ? m[10] : m[3]);
  if (mo < 1 || mo > 12 || d < 1 || d > daysInMonth(y, mo)) return null;
  let ms = Date.UTC(y, mo - 1, d);
  if (!dateOnly) {
    const hh = Number(m[4]);
    const mm = Number(m[5]);
    const ss = Number(m[6] ?? '0');
    if (hh > 23 || mm > 59 || ss > 59) return null;
    ms += ((hh * 60 + mm) * 60 + ss) * 1000;
    const zone = m[7] ?? 'Z';
    if (zone !== 'Z') {
      const zh = Number(zone.slice(1, 3));
      const zm = Number(zone.slice(4, 6));
      if (zh > 23 || zm > 59) return null;
      const offset = ((zh * 60 + zm) * 60) * 1000;
      ms -= zone.startsWith('-') ? -offset : offset;
    }
    const frac = /\.(\d{1,9})/.exec(v);
    if (frac) ms += Math.floor(Number(`0.${frac[1]}`) * 1000);
  }
  if (ms < EARLIEST_MS) return null;
  const day = `${String(y).padStart(4, '0')}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  return { ms, day, hadTime: !dateOnly };
}

export function utcDayStart(now: Date): number {
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
}

export type RetrievedReading =
  | { kind: 'missing' }
  | { kind: 'invalid' }
  | { kind: 'future'; day: string; daysAhead: number }
  | { kind: 'ok'; day: string; ageDays: number };

export function readRetrieved(raw: string | null | undefined, now: Date): RetrievedReading {
  if (cleanValue(raw) === null) return { kind: 'missing' };
  const p = parseRetrieved(raw);
  if (p === null) return { kind: 'invalid' };
  const today = utcDayStart(now);
  const dayMs = Date.parse(`${p.day}T00:00:00Z`);
  const future = p.hadTime ? p.ms > now.getTime() : dayMs > today;
  if (future) return { kind: 'future', day: p.day, daysAhead: Math.max(1, Math.ceil((p.hadTime ? p.ms - now.getTime() : dayMs - today) / DAY_MS)) };
  return { kind: 'ok', day: p.day, ageDays: Math.max(0, Math.round((today - dayMs) / DAY_MS)) };
}
