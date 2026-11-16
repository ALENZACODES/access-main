import { clip, t, type CheckResult, type Entry, type Lang } from './types.js';
import { MIN_WORDS, primary, type TextBlock } from './langparts.js';
import type { ProseFacts } from './prose.js';

/**
 * Dates, times, numbers and money written the way the other language writes
 * them. A French text with 12/31/2026, 3:00 PM or $1,234.50 reads wrongly to a
 * French reader, and an English text with 1 234,50 reads wrongly to an English
 * reader. The language of a block comes from its lang attribute or the page.
 * A pattern can sit inside a quotation or a name, and a date such as 03/04/2026
 * can be read two ways in either language, so every finding is UNKNOWN.
 */

export type LocaleRule = 'us-date-in-fr' | 'day-first-in-en' | 'ambiguous-date' | 'twelve-hour-in-fr' | 'fr-number-format' | 'en-number-format' | 'fr-currency-position' | 'en-currency-position' | 'month-name-order';

export const LOCALE_RULES: readonly LocaleRule[] = [
  'us-date-in-fr',
  'day-first-in-en',
  'ambiguous-date',
  'twelve-hour-in-fr',
  'fr-number-format',
  'en-number-format',
  'fr-currency-position',
  'en-currency-position',
  'month-name-order',
];

export interface Match {
  readonly text: string;
  readonly index: number;
}

const matches = (re: RegExp, text: string): Match[] => Array.from(text.matchAll(re), (m) => ({ text: m[0], index: m.index ?? 0 }));

/** Slash or dot dates of two numbers and a year: 12/31/2026, 31/12/2026, 03.04.2026. */
const NUMERIC_DATE = /(?<![\d/.-])(\d{1,2})([/.])(\d{1,2})\2(\d{4})(?![\d/-]|[.]\d)/g;

export interface NumericDate {
  readonly text: string;
  readonly first: number;
  readonly second: number;
  readonly year: number;
}

export function numericDates(text: string): NumericDate[] {
  const out: NumericDate[] = [];
  for (const m of text.matchAll(NUMERIC_DATE)) {
    const first = Number(m[1]);
    const second = Number(m[3]);
    const year = Number(m[4]);
    if (first < 1 || second < 1 || first > 31 || second > 31 || year < 1900 || year > 2200) continue;
    if (first > 12 && second > 12) continue;
    out.push({ text: m[0], first, second, year });
  }
  return out;
}

/** What a numeric date can mean: month first (US) or day first (most of the world). */
export function dateOrder(d: NumericDate): 'month-first' | 'day-first' | 'either' | 'same' {
  if (d.first > 12) return 'day-first';
  if (d.second > 12) return 'month-first';
  return d.first === d.second ? 'same' : 'either';
}

/** A 12-hour time with am or pm in any common spelling: 3:00 PM, 3 pm, 3:00 p.m. */
export const TWELVE_HOUR = /(?<![\d:])(1[0-2]|0?[1-9])(?::[0-5]\d)?\s?(?:[ap]\.?m\.?)(?![\p{L}])/giu;

export function twelveHourTimes(text: string): Match[] {
  return matches(TWELVE_HOUR, text);
}

/** A comma used as a thousands separator, as in 1,234 or 12,345,678 or 1,234.50. */
export const COMMA_THOUSANDS = /(?<![\d,.])\d{1,3}(?:,\d{3})+(?:\.\d+)?(?!\d|,\d)/g;
/** A full stop used as a thousands separator, as in 1.234.567 (two or more groups, so a date is not caught). */
export const DOT_THOUSANDS = /(?<![\d,.])\d{1,3}(?:\.\d{3}){2,}(?!\.?\d)/g;
/** A decimal comma, as in 12,50 or 1 234,50, in the part before the comma with two decimals. */
export const DECIMAL_COMMA = /(?<![\p{L}\d,.])\d{1,3}(?:[\u00A0\u202F ]\d{3})*,\d{2}(?!\d|,\d)/gu;

export function commaThousands(text: string): Match[] {
  return matches(COMMA_THOUSANDS, text);
}

export function dotThousands(text: string): Match[] {
  return matches(DOT_THOUSANDS, text);
}

export function decimalCommas(text: string): Match[] {
  return matches(DECIMAL_COMMA, text);
}

/** A decimal full stop with two decimals, such as 12.50. Dates and versions are not caught. */
export const DECIMAL_POINT = /(?<![\p{L}\d,.])\d{1,3}(?:[\u00A0\u202F ]\d{3})*\.\d{2}(?!\d|[.,]\d)/gu;

export function decimalPoints(text: string): Match[] {
  return matches(DECIMAL_POINT, text);
}

/** A dollar or euro amount with the symbol before the number: $50, $1,234.50, €20. */
export const SYMBOL_FIRST = /[$€£]\s?\d[\d,.\u00A0\u202F ]*\d|[$€£]\s?\d/g;
/** An amount with the symbol after the number: 50 $, 1 234,50 $, 20 €. */
export const SYMBOL_LAST = /\d[\d,.\u00A0\u202F]*\s?[$€£]/g;

export function symbolFirst(text: string): Match[] {
  return matches(SYMBOL_FIRST, text);
}

export function symbolLast(text: string): Match[] {
  return matches(SYMBOL_LAST, text);
}

const EN_MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const FR_MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

const monthAlt = (months: readonly string[]): string => months.map((m) => m.replace(/é/g, '[eé]').replace(/û/g, '[uû]')).join('|');

/** "November 16, 2026" and "Nov 16" style: a month name followed by a day number. Only English month names. */
const EN_MONTH_FIRST = new RegExp(`(?<![\\p{L}])(?:${monthAlt(EN_MONTHS)})\\s+\\d{1,2}(?:st|nd|rd|th)?(?:,\\s*\\d{4})?(?![\\d\\p{L}])`, 'giu');
/** "16 novembre 2026" style in French is right. A French month name after a month-first order is wrong: "novembre 16". */
const FR_MONTH_FIRST = new RegExp(`(?<![\\p{L}])(?:${monthAlt(FR_MONTHS)})\\s+\\d{1,2}(?:er)?(?![\\d\\p{L}])`, 'giu');
/** "16 November 2026" in English is acceptable and common in Canada. Only month-first French is asked about. */

export function frMonthFirst(text: string): Match[] {
  return matches(FR_MONTH_FIRST, text);
}

/** English month name before a day in a French text: "November 16" where French writes "16 novembre". */
export function enMonthInFrench(text: string): Match[] {
  return matches(EN_MONTH_FIRST, text);
}

const langOf = (b: TextBlock, pageLang: string): Lang | null => {
  const p = primary(b.lang || pageLang);
  return p === 'en' || p === 'fr' ? p : null;
};

export function auditLocale(f: ProseFacts): CheckResult {
  const entries: Entry[] = [];
  let checked = 0;
  const add = (b: TextBlock, rule: LocaleRule, en: string, fr: string): void => {
    entries.push({ check: 'locale', id: b.id, status: 'unknown', rule, message: t(en, fr) });
  };
  for (const b of f.blocks) {
    const lang = langOf(b, f.pageLang);
    if (!lang) continue;
    if (b.text.split(/\s+/).length < MIN_WORDS) continue;
    checked++;
    const isFr = lang === 'fr';
    const seen = new Set<LocaleRule>();
    const once = (rule: LocaleRule, en: string, fr: string): void => {
      if (seen.has(rule)) return;
      seen.add(rule);
      add(b, rule, en, fr);
    };

    for (const d of numericDates(b.text)) {
      const order = dateOrder(d);
      if (order === 'month-first' && isFr) {
        once(
          'us-date-in-fr',
          `The date “${d.text}” is written month first, which French readers do not expect. Write it as day, month, year, or spell the month out.`,
          `La date «\u202F${d.text}\u202F» est écrite avec le mois en premier, ce qui n’est pas l’usage en français. Écrivez-la jour, mois, année, ou écrivez le mois en toutes lettres.`,
        );
      } else if (order === 'day-first' && !isFr && d.first > 12) {
        once(
          'day-first-in-en',
          `The date “${d.text}” is written day first, which many English readers in Canada read the other way. Spell the month out or use 2026-11-16 order.`,
          `La date «\u202F${d.text}\u202F» est écrite avec le jour en premier, ce que beaucoup de lecteurs anglophones du Canada lisent à l’inverse. Écrivez le mois en toutes lettres ou utilisez l’ordre 2026-11-16.`,
        );
      } else if (order === 'either') {
        once(
          'ambiguous-date',
          `The date “${d.text}” can be read two ways (day first or month first). Spell the month out, for example 3 April 2026, or use year-month-day.`,
          `La date «\u202F${d.text}\u202F» peut se lire de deux façons (jour d’abord ou mois d’abord). Écrivez le mois en toutes lettres, par exemple 3 avril 2026, ou utilisez année-mois-jour.`,
        );
      }
    }

    if (isFr) {
      for (const m of twelveHourTimes(b.text)) {
        once(
          'twelve-hour-in-fr',
          `The time “${m.text}” uses am or pm. French text writes times on 24 hours, for example 15\u202Fh\u202F00.`,
          `L’heure «\u202F${m.text}\u202F» emploie am ou pm. Un texte français écrit l’heure sur 24 heures, par exemple 15\u202Fh\u202F00.`,
        );
        break;
      }
      const commas = commaThousands(b.text);
      if (commas.length > 0 && commas[0]) {
        const m = commas[0];
        once(
          'fr-number-format',
          `The number “${m.text}” uses commas to group digits. French text groups with a narrow space and puts the decimal after a comma, as in 1\u202F234,50.`,
          `Le nombre «\u202F${m.text}\u202F» groupe les chiffres avec des virgules. Un texte français groupe avec une espace fine et place la décimale après une virgule, comme dans 1\u202F234,50.`,
        );
      } else {
        const pts = decimalPoints(b.text);
        if (pts[0]) {
          once(
            'fr-number-format',
            `The number “${pts[0].text}” uses a full stop as the decimal mark. French text uses a comma, as in 12,50.`,
            `Le nombre «\u202F${pts[0].text}\u202F» emploie un point comme séparateur décimal. Un texte français emploie la virgule, comme dans 12,50.`,
          );
        }
      }
      const first = symbolFirst(b.text);
      if (first[0]) {
        once(
          'fr-currency-position',
          `The amount “${first[0].text}” has the currency symbol first. French text puts it after the number with a non-breaking space, as in 50\u00A0$.`,
          `Le montant «\u202F${first[0].text}\u202F» place le symbole de la devise avant le nombre. Un texte français le place après le nombre, avec une espace insécable, comme dans 50\u00A0$.`,
        );
      }
      const named = enMonthInFrench(b.text);
      if (named[0]) {
        once(
          'month-name-order',
          `“${clip(named[0].text, 24)}” is an English month name before the day. French writes the day first, as in 16 novembre.`,
          `«\u202F${clip(named[0].text, 24)}\u202F» est un nom de mois anglais placé avant le jour. Le français place le jour en premier, comme dans 16 novembre.`,
        );
      } else {
        const fr = frMonthFirst(b.text);
        if (fr[0]) {
          once(
            'month-name-order',
            `“${clip(fr[0].text, 24)}” puts the month before the day. French writes the day first, as in 16 novembre.`,
            `«\u202F${clip(fr[0].text, 24)}\u202F» place le mois avant le jour. Le français place le jour en premier, comme dans 16 novembre.`,
          );
        }
      }
    } else {
      const dec = decimalCommas(b.text);
      const dots = dotThousands(b.text);
      const bad = dec[0] ?? dots[0];
      if (bad) {
        once(
          'en-number-format',
          `The number “${bad.text}” uses a comma as the decimal mark or full stops to group digits. English text writes 1,234.50.`,
          `Le nombre «\u202F${bad.text}\u202F» emploie une virgule comme séparateur décimal ou des points pour grouper les chiffres. Un texte anglais écrit 1,234.50.`,
        );
      }
      const last = symbolLast(b.text);
      if (last[0]) {
        once(
          'en-currency-position',
          `The amount “${last[0].text}” has the currency symbol after the number. English text puts it first, as in $50.`,
          `Le montant «\u202F${last[0].text}\u202F» place le symbole de la devise après le nombre. Un texte anglais le place avant, comme dans $50.`,
        );
      }
    }
  }
  return { checked, entries };
}
