import { NBSP, NNBSP, clip, type CheckResult, type Entry } from './types.js';

export type Dict = Readonly<Record<string, string>>;

export type ParityKind =
  | 'missing-fr'
  | 'missing-en'
  | 'empty'
  | 'placeholder-mismatch'
  | 'fr-typography'
  | 'same-text';

export interface ParityIssue {
  readonly key: string;
  readonly kind: ParityKind;
  readonly detail?: string;
}

export interface ParityOptions {
  /** Identical EN and FR strings shorter than this are not reported. */
  readonly sameTextMinLength?: number;
  /** Keys whose text is the same in both languages on purpose (brand names, codes). */
  readonly allowSame?: ReadonlySet<string>;
}

/** Turns nested JSON message files into dotted keys. Non-string leaves are ignored. */
export function flattenDict(value: unknown, prefix = ''): Record<string, string> {
  const out: Record<string, string> = {};
  if (typeof value === 'string') {
    if (prefix) out[prefix] = value;
    return out;
  }
  if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      Object.assign(out, flattenDict(v, prefix ? `${prefix}.${k}` : k));
    }
  }
  return out;
}

/** Names of {name} and {{name}} placeholders, sorted and unique. */
export function placeholders(s: string): string[] {
  const names = new Set<string>();
  for (const m of s.matchAll(/\{\{?\s*([A-Za-z0-9_.]+)\s*\}?\}/g)) if (m[1]) names.add(m[1]);
  return [...names].sort();
}

/** Which French typography rules a string breaks. Mirrors the rules of the help-fr-polish package. */
export function frTypographyIssues(s: string): string[] {
  const rules: string[] = [];
  if (/\p{L}'\p{L}/u.test(s)) rules.push('apostrophe');
  for (const m of s.matchAll(/([\p{L}\p{N})»])[ \u00A0\u202F]?:(?=\s|$)/gu)) {
    if (m[0] !== `${m[1] ?? ''}${NBSP}:`) {
      rules.push('colon');
      break;
    }
  }
  for (const m of s.matchAll(/([\p{L}\p{N})»%’…])[ \u00A0\u202F]?([;!?])(?=[\s)»"”]|[;!?]|$)/gu)) {
    if (m[0] !== `${m[1] ?? ''}${NNBSP}${m[2] ?? ''}`) {
      rules.push('high-punctuation');
      break;
    }
  }
  if (/«(?!\u202F|$)/.test(s) || /(?<!\u202F|^)»/.test(s)) rules.push('guillemets');
  return rules;
}

export function checkParity(en: Dict, fr: Dict, opts: ParityOptions = {}): ParityIssue[] {
  const minSame = opts.sameTextMinLength ?? 24;
  const issues: ParityIssue[] = [];
  for (const key of Object.keys(en).sort()) {
    const e = en[key] ?? '';
    if (!e.trim()) issues.push({ key, kind: 'empty', detail: 'en' });
    if (!(key in fr)) {
      issues.push({ key, kind: 'missing-fr' });
      continue;
    }
    const f = fr[key] ?? '';
    if (!f.trim()) {
      issues.push({ key, kind: 'empty', detail: 'fr' });
      continue;
    }
    if (placeholders(e).join('|') !== placeholders(f).join('|')) issues.push({ key, kind: 'placeholder-mismatch' });
    const rules = frTypographyIssues(f);
    if (rules.length > 0) issues.push({ key, kind: 'fr-typography', detail: rules.join(', ') });
    if (e.trim() === f.trim() && e.trim().length >= minSame && !opts.allowSame?.has(key)) {
      issues.push({ key, kind: 'same-text' });
    }
  }
  for (const key of Object.keys(fr).sort()) if (!(key in en)) issues.push({ key, kind: 'missing-en' });
  return issues;
}

function issueEntry(i: ParityIssue): Entry {
  const base = { check: 'i18n' as const, id: i.key, status: 'fail' as const };
  switch (i.kind) {
    case 'missing-fr':
      return { ...base, message: { en: 'Missing French string.', fr: 'Chaîne française manquante.' } };
    case 'missing-en':
      return { ...base, message: { en: 'Missing English string.', fr: 'Chaîne anglaise manquante.' } };
    case 'empty':
      return { ...base, message: { en: `Empty string (${i.detail ?? ''}).`, fr: `Chaîne vide (${i.detail ?? ''}).` } };
    case 'placeholder-mismatch':
      return {
        ...base,
        message: {
          en: 'Placeholders differ between English and French.',
          fr: 'Les variables diffèrent entre l’anglais et le français.',
        },
      };
    case 'fr-typography':
      return {
        ...base,
        message: {
          en: `French typography rules not followed (${clip(i.detail ?? '')}).`,
          fr: `Typographie française non respectée (${clip(i.detail ?? '')}).`,
        },
      };
    case 'same-text':
      return {
        ...base,
        status: 'unknown',
        message: {
          en: 'French text is identical to English, so it may be untranslated.',
          fr: 'Le texte français est identique au texte anglais, il n’est peut-être pas traduit.',
        },
      };
  }
}

export function auditI18n(en: Dict, fr: Dict, opts: ParityOptions = {}): CheckResult {
  const keys = new Set([...Object.keys(en), ...Object.keys(fr)]);
  return { checked: keys.size, entries: checkParity(en, fr, opts).map(issueEntry) };
}
