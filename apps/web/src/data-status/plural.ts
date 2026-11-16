/** Plural selection for count messages. French treats 0 and 1 as singular; English only 1. */
import type { Locale } from './dataStatus';
import { t, type MessageKey } from './i18n';

export type PluralCategory = 'one' | 'other';
export type PluralBase = 'flt.result' | 'due.overdue' | 'due.in';

const RULES: Readonly<Record<Locale, Intl.PluralRules>> = {
  en: new Intl.PluralRules('en-CA'),
  fr: new Intl.PluralRules('fr-CA'),
};

export function pluralCategory(locale: Locale, n: number): PluralCategory {
  return RULES[locale].select(n) === 'one' ? 'one' : 'other';
}

/** Look up `<base>.one` or `<base>.other` for the count and fill in the params. */
export function tCount(
  locale: Locale,
  base: PluralBase,
  n: number,
  params?: Readonly<Record<string, string | number>>,
): string {
  return t(locale, `${base}.${pluralCategory(locale, n)}` as MessageKey, params);
}
