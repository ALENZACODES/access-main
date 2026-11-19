/**
 * Coarsening. A report keeps a month and a region code from the region table. Days, times and
 * precise places are dropped before a report is stored, and are refused if they arrive anyway.
 */
import { isRealDate } from "../dates.ts";
import { UNKNOWN, type PeriodGrain } from "./types.ts";

const MONTH = /^(\d{4})-(0[1-9]|1[0-2])$/;
const DAY_PREFIX = /^(\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01]))(?:$|[T ])/;

/**
 * Reduce a date, a date and time, or a month to a month, YYYY-MM. The calendar date is read as
 * written; no time-zone shift is applied. "UNKNOWN" stays "UNKNOWN".
 */
export function monthOf(value: string): string {
  if (value === UNKNOWN) return UNKNOWN;
  if (MONTH.test(value)) return value;
  const day = DAY_PREFIX.exec(value)?.[1];
  if (!day || !isRealDate(day)) throw new RangeError("not a date, a date and time, or a month");
  return day.slice(0, 7);
}

/** Period label for a month at the chosen grain: 2026-10, 2026-Q4 or 2026. */
export function periodKey(month: string, grain: PeriodGrain): string {
  if (month === UNKNOWN) return UNKNOWN;
  const match = MONTH.exec(month);
  if (!match) throw new RangeError("period must be YYYY-MM or UNKNOWN");
  const year = match[1] ?? "";
  if (grain === "year") return year;
  if (grain === "quarter") return `${year}-Q${Math.ceil(Number(match[2]) / 3)}`;
  return month;
}

/** True for a period label no finer than a month. */
export function isCoarsePeriod(value: string): boolean {
  return value === UNKNOWN || /^\d{4}(-(0[1-9]|1[0-2])|-Q[1-4])?$/.test(value);
}

const POSTAL_CODE = /^[a-z]\d[a-z][ -]?\d[a-z]\d$/i;
const LONG_NUMBER = /\d{5,}/;
const COORDINATE = /-?\d{1,3}[.,]\d{2,}/;

/**
 * True when a region code is shaped like a postal code, a long number or a coordinate. Such a
 * code could point at a street or a building, so it is refused as a region code.
 */
export function looksLikePrecisePlace(code: string): boolean {
  return POSTAL_CODE.test(code) || LONG_NUMBER.test(code) || COORDINATE.test(code);
}
