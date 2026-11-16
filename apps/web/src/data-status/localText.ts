/**
 * Small message-table helper for the round-7 modules. Each module keeps its own EN and FR
 * tables (so it does not touch the shared catalog) and gets the same lookup, parameter
 * filling and plural selection. A missing parameter is left visible as {name} rather than
 * guessed, and the tests fail on it.
 */
import type { Locale } from './dataStatus';
import { pluralCategory } from './plural';

export type MessageTable<K extends string> = Readonly<Record<K, string>>;

export interface Messages<K extends string> {
  readonly en: MessageTable<K>;
  readonly fr: MessageTable<K>;
}

export type TextParams = Readonly<Record<string, string | number>>;

const PLACEHOLDER = /\{([A-Za-z][A-Za-z0-9]*)\}/g;

/** Replace {name} with the matching parameter; unknown names stay as written. */
export function fill(template: string, params: TextParams = {}): string {
  return template.replace(PLACEHOLDER, (whole, name: string) => {
    const v = params[name];
    return v === undefined ? whole : String(v);
  });
}

/** The names used as {placeholders} in a template, in order of first use, without repeats. */
export function placeholders(template: string): string[] {
  const seen: string[] = [];
  for (const m of template.matchAll(PLACEHOLDER)) {
    const name = m[1];
    if (name !== undefined && !seen.includes(name)) seen.push(name);
  }
  return seen;
}

export interface Translator<K extends string> {
  (locale: Locale, key: K, params?: TextParams): string;
  /** Pick `<base>.one` or `<base>.other` by the locale's plural rule. */
  count(locale: Locale, base: string, n: number, params?: TextParams): string;
  keys(): K[];
}

export function createTranslator<K extends string>(messages: Messages<K>): Translator<K> {
  const lookup = (locale: Locale, key: K, params?: TextParams): string => fill(messages[locale][key], params);
  const translator = lookup as Translator<K>;
  translator.count = (locale, base, n, params) => {
    const key = `${base}.${pluralCategory(locale, n)}` as K;
    return fill(messages[locale][key], { n, ...params });
  };
  translator.keys = () => Object.keys(messages.en) as K[];
  return translator;
}

/** Keys ending in .sep, .join or .sentence are separators, so their text may be only spaces. */
export function isSeparatorKey(key: string): boolean {
  return /\.(sep|join|sentence)$/.test(key);
}

/** Every key present in both languages with the same placeholders. Returns a list of problems. */
export function checkParity<K extends string>(messages: Messages<K>): string[] {
  const problems: string[] = [];
  const enKeys = Object.keys(messages.en);
  const frKeys = Object.keys(messages.fr);
  for (const k of enKeys) if (!frKeys.includes(k)) problems.push(`missing fr: ${k}`);
  for (const k of frKeys) if (!enKeys.includes(k)) problems.push(`missing en: ${k}`);
  for (const k of enKeys) {
    const en = (messages.en as Record<string, string>)[k];
    const fr = (messages.fr as Record<string, string>)[k];
    if (en === undefined || fr === undefined) continue;
    const a = placeholders(en).sort().join(',');
    const b = placeholders(fr).sort().join(',');
    if (a !== b) problems.push(`placeholders differ: ${k} (en {${a}} / fr {${b}})`);
    if (!isSeparatorKey(k) && (en.trim() === '' || fr.trim() === '')) problems.push(`empty text: ${k}`);
  }
  return problems;
}
