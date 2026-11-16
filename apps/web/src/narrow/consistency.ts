import { clip, t, type CheckResult, type Entry } from './types.js';
import type { PageFacts, Region } from './probes.js';

/**
 * Checks across several pages of one site: navigation links keep the same
 * relative order (3.2.3), a help link sits in the same place (3.2.6), and each
 * page has its own title (2.4.2). A fact that exists on only some pages is
 * UNKNOWN, because the criteria only apply to what is repeated.
 */

export interface RouteFacts {
  readonly route: string;
  readonly facts: PageFacts;
}

const norm = (s: string): string => s.toLowerCase().replace(/\s+/g, ' ').trim();

/** The links two lists share, in the order of the first list. */
function shared(a: readonly string[], b: readonly string[]): string[] {
  const inB = new Set(b.map(norm));
  const seen = new Set<string>();
  const out: string[] = [];
  for (const x of a) {
    const k = norm(x);
    if (inB.has(k) && !seen.has(k)) {
      seen.add(k);
      out.push(k);
    }
  }
  return out;
}

function firstOrder(list: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const x of list) {
    const k = norm(x);
    if (!seen.has(k)) {
      seen.add(k);
      out.push(k);
    }
  }
  return out;
}

/** True when the common items appear in the same order in both lists. */
export function sameRelativeOrder(a: readonly string[], b: readonly string[]): boolean {
  const common = shared(a, b);
  const orderB = shared(b, a);
  return common.length === orderB.length && common.every((x, i) => x === orderB[i]);
}

const PLACE: Readonly<Record<Region, { en: string; fr: string }>> = {
  header: { en: 'the header', fr: 'l’en-tête' },
  nav: { en: 'the navigation', fr: 'la navigation' },
  main: { en: 'the main content', fr: 'le contenu principal' },
  aside: { en: 'a side region', fr: 'une région latérale' },
  footer: { en: 'the footer', fr: 'le pied de page' },
  body: { en: 'the page body', fr: 'le corps de la page' },
};

export function auditConsistency(pages: readonly RouteFacts[]): CheckResult {
  const entries: Entry[] = [];
  const add = (id: string, status: 'fail' | 'unknown', rule: string, en: string, fr: string): void => {
    entries.push({ check: 'consistency', id, status, rule, message: t(en, fr) });
  };
  if (pages.length < 2) return { checked: pages.length, entries: [] };
  const first = pages[0] as RouteFacts;

  // 3.2.3 navigation order, each page against the first page that shares links with it.
  for (let i = 1; i < pages.length; i++) {
    const p = pages[i] as RouteFacts;
    const base = pages.slice(0, i).find((q) => shared(q.facts.nav, p.facts.nav).length >= 2);
    if (!base) continue;
    if (!sameRelativeOrder(base.facts.nav, p.facts.nav)) {
      const a = firstOrder(shared(base.facts.nav, p.facts.nav)).slice(0, 4).join(', ');
      add(
        p.route,
        'fail',
        'nav-order',
        `The navigation links shared with ${base.route} are in a different order (${clip(a, 60)}).`,
        `Les liens de navigation communs avec ${base.route} sont dans un ordre différent (${clip(a, 60)}).`,
      );
    }
  }

  // 3.2.6 help placement.
  const withHelp = pages.filter((p) => p.facts.help !== null);
  const ref = withHelp[0];
  if (ref && ref.facts.help) {
    const where = ref.facts.help.region;
    for (const p of withHelp.slice(1)) {
      const h = p.facts.help;
      if (h && h.region !== where) {
        add(
          p.route,
          'fail',
          'help-place',
          `The help link is in ${PLACE[h.region].en} here and in ${PLACE[where].en} on ${ref.route}.`,
          `Le lien d’aide est dans ${PLACE[h.region].fr} ici et dans ${PLACE[where].fr} sur ${ref.route}.`,
        );
      }
    }
    for (const p of pages) {
      if (p.facts.help === null) {
        add(
          p.route,
          'unknown',
          'help-missing',
          `No help or contact link was found here, but ${ref.route} has one. Check that this is intended.`,
          `Aucun lien d’aide ou de contact n’a été trouvé ici, alors que ${ref.route} en a un. Contrôlez que c’est voulu.`,
        );
      }
    }
  }

  // 2.4.2 titles that are empty or repeated.
  const titles = new Map<string, string[]>();
  for (const p of pages) {
    const k = norm(p.facts.title);
    titles.set(k, [...(titles.get(k) ?? []), p.route]);
  }
  for (const [title, routes] of titles) {
    if (title === '') continue;
    if (routes.length > 1) {
      for (const r of routes.slice(1)) {
        add(
          r,
          'unknown',
          'title-repeat',
          `The page title "${clip(title, 40)}" is the same as on ${routes[0] ?? ''}. Check that it tells the pages apart.`,
          `Le titre «\u202F${clip(title, 40)}\u202F» est le même que sur ${routes[0] ?? ''}. Contrôlez qu’il distingue les pages.`,
        );
      }
    }
  }
  // 3.1.1 one language per page set: a page in a different language from the first is worth a look.
  for (const p of pages.slice(1)) {
    const a = first.facts.lang.toLowerCase().split('-')[0] ?? '';
    const b = p.facts.lang.toLowerCase().split('-')[0] ?? '';
    if (a && b && a !== b) {
      add(
        p.route,
        'unknown',
        'lang-differs',
        `This page is in "${b}" and ${first.route} is in "${a}". Check that the language switch is meant to work this way.`,
        `Cette page est en «\u202F${b}\u202F» et ${first.route} est en «\u202F${a}\u202F». Contrôlez que le changement de langue est voulu.`,
      );
    }
  }
  return { checked: pages.length, entries };
}
