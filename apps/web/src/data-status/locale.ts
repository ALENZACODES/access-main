/** Locale resolution and date display helpers (EN / FR). */
import { parseRetrieved } from './dateRules';
import type { Locale } from './dataStatus';
import { t } from './i18n';

/** First language tag wins; `fr`, `fr-CA`, `FR_ca` -> fr; `en-US` -> en; anything else -> fallback. */
export function resolveLocale(input: string | null | undefined, fallback: Locale = 'en'): Locale {
  if (typeof input !== 'string') return fallback;
  const first = input.split(/[,;]/)[0]?.trim().toLowerCase() ?? '';
  const primary = first.split(/[-_]/)[0];
  return primary === 'fr' ? 'fr' : primary === 'en' ? 'en' : fallback;
}

/** `/fr`, `/fr/x` -> fr; `/en`, `/en/x` -> en; otherwise null (no locale prefix). */
export function localeFromPath(pathname: string): Locale | null {
  const m = /^\/(fr|en)(?:\/|$)/.exec(pathname);
  return m ? (m[1] as Locale) : null;
}

/** Swap or add the locale prefix: `/fr/a` + en -> `/en/a`; `/a` + fr -> `/fr/a`. */
export function switchLocalePath(pathname: string, to: Locale): string {
  const rest = pathname.replace(/^\/(fr|en)(?=\/|$)/, '');
  const tail = rest === '' || rest === '/' ? '' : rest.startsWith('/') ? rest : `/${rest}`;
  return `/${to}${tail}`;
}

export function otherLocale(l: Locale): Locale {
  return l === 'fr' ? 'en' : 'fr';
}

/** Long date for display ("November 1, 2026" / "1 novembre 2026"); Unknown when not a valid ISO date. */
export function formatDisplayDate(iso: string | null | undefined, locale: Locale): string {
  const parsed = parseRetrieved(iso);
  if (parsed === null) return t(locale, 'unknown');
  const d = new Date(`${parsed.day}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return t(locale, 'unknown');
  return new Intl.DateTimeFormat(locale === 'fr' ? 'fr-CA' : 'en-CA', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(d);
}
