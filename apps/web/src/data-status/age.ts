/** "14 days ago" style text for a retrieved date. Future or unreadable dates are Unknown, never guessed. */
import { ageInDays, type Locale } from './dataStatus';
import { t } from './i18n';

/** Whole UTC days between the retrieved day and today; null when unreadable or in the future. */
export function ageDays(iso: string | null | undefined, now: Date): number | null {
  return ageInDays(iso, now);
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
