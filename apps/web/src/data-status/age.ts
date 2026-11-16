/** "14 days ago" style text for a retrieved date. Future or unreadable dates are Unknown, never guessed. */
import { parseIsoDate, type Locale } from './dataStatus';
import { t } from './i18n';

const DAY_MS = 86_400_000;

/** Whole UTC days between the retrieved date and today; null when unreadable or in the future. */
export function ageDays(iso: string | null | undefined, now: Date): number | null {
  if (parseIsoDate(iso) === null) return null;
  const then = Date.parse(`${(iso as string).trim().slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(then)) return null;
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const days = Math.floor((today - then) / DAY_MS);
  return days < 0 ? null : days;
}

const FORMATTERS: Readonly<Record<Locale, Intl.RelativeTimeFormat>> = {
  en: new Intl.RelativeTimeFormat('en-CA', { numeric: 'auto' }),
  fr: new Intl.RelativeTimeFormat('fr-CA', { numeric: 'auto' }),
};

export function ageLabel(iso: string | null | undefined, now: Date, locale: Locale): string {
  const d = ageDays(iso, now);
  if (d === null) return t(locale, 'unknown');
  const f = FORMATTERS[locale];
  const text =
    d <= 45 ? f.format(-d, 'day') : d <= 730 ? f.format(-Math.floor(d / 30.44), 'month') : f.format(-Math.floor(d / 365.25), 'year');
  return text.replace(/'/g, '\u2019'); // typographic apostrophe in every locale
}
