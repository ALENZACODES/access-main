import type { PageCounts, PageInfo } from './sitepages.js';
import { t, type CheckResult, type Entry, type EntryStatus } from './types.js';

/**
 * English and French versions of a page, compared. The App is offered in
 * both languages, and a page that exists in one of them only, or that holds
 * less in one of them, leaves people out. This is a rule of the App, not a
 * WCAG criterion.
 *
 * A page names its other-language version with
 * `<link rel="alternate" hreflang="fr" href="...">`. Measured, so a failure:
 * the page named does not name this page back, or the page named is written
 * in another language than the one announced. For a person, so UNKNOWN: a
 * page with no alternate while other pages have one, an alternate that was
 * not among the pages read, no visible link to the other version, and two
 * versions that hold different numbers of headings, links, fields, images,
 * tables, list items or buttons.
 *
 * A count that matches says nothing about the words: nobody has read the
 * translation.
 */

export type LangPairRule = 'alternate-one-way' | 'alternate-lang' | 'alternate-not-given' | 'no-alternate' | 'no-switch-link' | 'structure-differs';

export const LANG_PAIR_RULES: readonly LangPairRule[] = ['alternate-one-way', 'alternate-lang', 'alternate-not-given', 'no-alternate', 'no-switch-link', 'structure-differs'];

const primary = (tag: string): string => tag.toLowerCase().split('-')[0] ?? '';

const PART_NAMES: Readonly<Record<keyof PageCounts, { en: string; fr: string }>> = {
  headings: { en: 'headings', fr: 'titres' },
  links: { en: 'links', fr: 'liens' },
  fields: { en: 'form fields', fr: 'champs de formulaire' },
  images: { en: 'images', fr: 'images' },
  tables: { en: 'tables', fr: 'tableaux' },
  listItems: { en: 'list items', fr: 'éléments de liste' },
  buttons: { en: 'buttons', fr: 'boutons' },
};

/** Parts where a different count is always worth a look. For the others a small difference is common (a link in a sentence). */
const EXACT: ReadonlySet<keyof PageCounts> = new Set<keyof PageCounts>(['headings', 'fields', 'tables', 'buttons']);

export interface CountDifference {
  readonly part: keyof PageCounts;
  readonly a: number;
  readonly b: number;
}

/** The parts two pages differ in. Headings, fields, tables and buttons count on any difference; links, images and list items when they differ by more than `tolerance` of the larger count and by at least two. */
export function countDifferences(a: PageCounts, b: PageCounts, tolerance = 0.2): CountDifference[] {
  const out: CountDifference[] = [];
  for (const part of Object.keys(PART_NAMES) as (keyof PageCounts)[]) {
    const x = a[part];
    const y = b[part];
    if (x === y) continue;
    const gap = Math.abs(x - y);
    if (EXACT.has(part) || (gap >= 2 && gap > Math.max(x, y) * tolerance)) out.push({ part, a: x, b: y });
  }
  return out;
}

export interface LangPair {
  readonly a: PageInfo;
  readonly b: PageInfo;
}

/** Pairs of pages that name each other as alternates, each pair once, in the order of the pages. */
export function reciprocalPairs(pages: readonly PageInfo[]): LangPair[] {
  const byRoute = new Map(pages.map((p) => [p.route, p]));
  const seen = new Set<string>();
  const out: LangPair[] = [];
  for (const a of pages) {
    for (const alt of a.alternates) {
      if (alt.to === null || alt.to === a.route) continue;
      const b = byRoute.get(alt.to);
      if (!b || !b.alternates.some((x) => x.to === a.route)) continue;
      const key = [a.route, b.route].sort().join('\u0000');
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ a, b });
    }
  }
  return out;
}

export function auditLangPairs(pages: readonly PageInfo[]): CheckResult {
  const entries: Entry[] = [];
  const add = (id: string, rule: LangPairRule, status: EntryStatus, en: string, fr: string): void => {
    entries.push({ check: 'lang-pairs', id, status, rule, message: t(en, fr) });
  };
  if (pages.length === 0) return { checked: 0, entries };
  const byRoute = new Map(pages.map((p) => [p.route, p]));
  const anyAlternate = pages.some((p) => p.alternates.some((a) => a.to !== p.route));
  let checked = 0;

  for (const p of pages) {
    checked++;
    const others = p.alternates.filter((a) => a.to !== p.route && a.hreflang !== 'x-default');
    if (others.length === 0) {
      if (anyAlternate) {
        add(
          p.route,
          'no-alternate',
          'unknown',
          'This page names no version in another language, and other pages read do. A person has to say whether the page exists in both languages.',
          'Cette page ne nomme aucune version dans une autre langue, alors que d’autres pages lues le font. Une personne doit dire si la page existe dans les deux langues.',
        );
      }
      continue;
    }
    for (const alt of others) {
      if (alt.to === null) continue;
      const target = byRoute.get(alt.to);
      if (!target) {
        add(
          `${p.route} hreflang=${alt.hreflang}`,
          'alternate-not-given',
          'unknown',
          `The ${alt.hreflang} version named here, ${alt.to}, is not among the pages read, so the pair was not compared.`,
          `La version ${alt.hreflang} nommée ici, ${alt.to}, ne fait pas partie des pages lues\u00A0: la paire n’a donc pas été comparée.`,
        );
        continue;
      }
      if (target.lang !== '' && primary(alt.hreflang) !== target.lang) {
        add(
          `${p.route} hreflang=${alt.hreflang}`,
          'alternate-lang',
          'fail',
          `This page announces ${alt.to} as its ${alt.hreflang} version, and that page is marked lang="${target.lang}".`,
          `Cette page annonce ${alt.to} comme sa version ${alt.hreflang}, et cette page est marquée lang="${target.lang}".`,
        );
      }
      if (!target.alternates.some((x) => x.to === p.route)) {
        add(
          `${p.route} hreflang=${alt.hreflang}`,
          'alternate-one-way',
          'fail',
          `This page names ${alt.to} as its ${alt.hreflang} version, and ${alt.to} does not name this page back. Search engines may ignore an alternate that is not returned.`,
          `Cette page nomme ${alt.to} comme sa version ${alt.hreflang}, et ${alt.to} ne nomme pas cette page en retour. Les moteurs de recherche peuvent ignorer une version qui n’est pas réciproque.`,
        );
      }
      if (!p.links.some((l) => l.to === alt.to)) {
        add(
          `${p.route} hreflang=${alt.hreflang}`,
          'no-switch-link',
          'unknown',
          `The markup names ${alt.to} as the ${alt.hreflang} version, and no link on the page goes there. A person has to say how someone switches language from this page.`,
          `Le balisage nomme ${alt.to} comme version ${alt.hreflang}, et aucun lien de la page n’y mène. Une personne doit dire comment on change de langue depuis cette page.`,
        );
      }
    }
  }

  for (const { a, b } of reciprocalPairs(pages)) {
    checked++;
    const diffs = countDifferences(a.counts, b.counts);
    if (diffs.length === 0) continue;
    const en = diffs.map((d) => `${PART_NAMES[d.part].en} ${d.a} and ${d.b}`).join(', ');
    const fr = diffs.map((d) => `${PART_NAMES[d.part].fr} ${d.a} et ${d.b}`).join(', ');
    add(
      `${a.route} | ${b.route}`,
      'structure-differs',
      'unknown',
      `The two versions do not hold the same parts (${a.route} and ${b.route}): ${en}. A person has to say whether something is missing in one language.`,
      `Les deux versions ne contiennent pas les mêmes parties (${a.route} et ${b.route})\u00A0: ${fr}. Une personne doit dire s’il manque quelque chose dans une langue.`,
    );
  }
  return { checked, entries };
}
