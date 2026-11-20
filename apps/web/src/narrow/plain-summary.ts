import { PRINCIPLES } from './criteria.js';
import { totals, type AuditReport } from './report.js';
import { CHECK_SC, NBSP, type Entry, type Lang } from './types.js';

/**
 * What an audit of the current page found, in words for the person using
 * the App, not for the people who build it. Findings are grouped by the kind
 * of difficulty they may cause, and each group shows a few of them.
 *
 * The summary never says a page works. When the checks find nothing it says
 * exactly that, and that checks look at part of what makes a page usable.
 */

export type Theme = 'see' | 'use' | 'understand' | 'assistive' | 'other';

export const THEME_ORDER: readonly Theme[] = ['see', 'use', 'understand', 'assistive', 'other'];

export const THEME_LABELS: Readonly<Record<Theme, { readonly en: string; readonly fr: string }>> = {
  see: { en: 'Seeing and hearing the content', fr: 'Voir et entendre le contenu' },
  use: { en: 'Moving around and pressing things', fr: 'Se déplacer et activer les commandes' },
  understand: { en: 'Reading and understanding', fr: 'Lire et comprendre' },
  assistive: { en: 'Working with a screen reader or voice control', fr: 'Fonctionner avec un lecteur d’écran ou la commande vocale' },
  other: { en: 'Other checks of the App', fr: 'Autres contrôles de l’App' },
};

/** The WCAG principle behind each theme, for people who want the term. Null for checks outside WCAG. */
export const THEME_PRINCIPLE: Readonly<Record<Theme, 1 | 2 | 3 | 4 | null>> = { see: 1, use: 2, understand: 3, assistive: 4, other: null };

/** The theme of a check, from the first digit of the criterion it relates to. */
export function themeOf(check: string): Theme {
  const sc = (CHECK_SC as Readonly<Record<string, string | null | undefined>>)[check];
  switch (typeof sc === 'string' ? sc.charAt(0) : '') {
    case '1':
      return 'see';
    case '2':
      return 'use';
    case '3':
      return 'understand';
    case '4':
      return 'assistive';
    default:
      return 'other';
  }
}

export interface ThemeGroup {
  readonly theme: Theme;
  readonly failed: number;
  readonly unknown: number;
  /** The first findings of the group, failures first. */
  readonly examples: readonly Entry[];
}

export interface PlainSummary {
  readonly failed: number;
  readonly unknown: number;
  readonly checked: number;
  /** Groups that hold at least one finding, in the order of `THEME_ORDER`. */
  readonly groups: readonly ThemeGroup[];
}

export const DEFAULT_EXAMPLES = 3;

export function summarisePlainly(report: AuditReport, maxExamples = DEFAULT_EXAMPLES): PlainSummary {
  const t = totals(report.routes);
  const by = new Map<Theme, Entry[]>();
  for (const r of report.routes) {
    for (const e of r.entries) by.set(themeOf(e.check), [...(by.get(themeOf(e.check)) ?? []), e]);
  }
  const groups: ThemeGroup[] = [];
  for (const theme of THEME_ORDER) {
    const entries = by.get(theme);
    if (!entries || entries.length === 0) continue;
    const ordered = [...entries].sort((a, b) => Number(b.status === 'fail') - Number(a.status === 'fail'));
    groups.push({
      theme,
      failed: entries.filter((e) => e.status === 'fail').length,
      unknown: entries.filter((e) => e.status === 'unknown').length,
      examples: ordered.slice(0, Math.max(0, Math.floor(maxExamples))),
    });
  }
  return { failed: t.failed, unknown: t.unknown, checked: t.checked, groups };
}

const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;
const pluriel = (n: number, un: string, plusieurs: string): string => `${n} ${n < 2 ? un : plusieurs}`;

/** The headline: how many things the checks found, in one sentence. */
export function plainHeadline(s: PlainSummary, lang: Lang): string {
  const fr = lang === 'fr';
  if (s.failed + s.unknown === 0) {
    return fr
      ? 'Les contrôles exécutés n’ont rien trouvé sur cette page à cette taille.'
      : 'The checks that ran found nothing on this page at this size.';
  }
  const fail = fr ? pluriel(s.failed, 'point à corriger', 'points à corriger') : plural(s.failed, 'thing to fix', 'things to fix');
  const unk = fr
    ? `${pluriel(s.unknown, 'point', 'points')} UNKNOWN, qu’une personne doit regarder`
    : `${plural(s.unknown, 'thing', 'things')} UNKNOWN, for a person to look at`;
  return fr ? `Sur cette page, à cette taille${NBSP}: ${fail} et ${unk}.` : `On this page, at this size: ${fail} and ${unk}.`;
}

/** What the result does not say. Shown with every summary, whatever the counts. */
export function plainLimit(lang: Lang): string {
  return lang === 'fr'
    ? 'Les contrôles regardent une partie de ce qui rend une page utilisable. Un résultat sans rien à signaler ne veut pas dire que la page convient à tout le monde. Si quelque chose vous gêne, dites-le avec le formulaire.'
    : 'The checks look at part of what makes a page usable. A result with nothing to report does not mean the page suits everyone. If something is in your way, say so with the form.';
}

/** One line for a group: `Moving around and pressing things: 2 to fix, 1 UNKNOWN`. */
export function groupLine(g: ThemeGroup, lang: Lang): string {
  const fr = lang === 'fr';
  return fr
    ? `${THEME_LABELS[g.theme].fr}${NBSP}: ${g.failed} à corriger, ${g.unknown} UNKNOWN`
    : `${THEME_LABELS[g.theme].en}: ${g.failed} to fix, ${g.unknown} UNKNOWN`;
}

/** The term WCAG uses for a theme, or an empty string for checks outside WCAG. */
export function principleName(theme: Theme, lang: Lang): string {
  const p = THEME_PRINCIPLE[theme];
  return p === null ? '' : PRINCIPLES[p][lang];
}

/** The summary as plain text, for a report a person shares. */
export function plainSummaryText(s: PlainSummary, lang: Lang): string {
  const lines: string[] = [plainHeadline(s, lang)];
  for (const g of s.groups) {
    lines.push(`- ${groupLine(g, lang)}`);
    for (const e of g.examples) lines.push(`    ${e.status === 'fail' ? (lang === 'fr' ? 'À CORRIGER' : 'FAIL') : 'UNKNOWN'} ${e.message[lang]}`);
    const more = g.failed + g.unknown - g.examples.length;
    if (more > 0) lines.push(lang === 'fr' ? `    … et ${more} de plus` : `    … and ${more} more`);
  }
  return lines.join('\n');
}
