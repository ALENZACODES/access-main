import type { PageInfo, SiteLink } from './sitepages.js';
import { clip, t, type CheckResult, type Entry, type EntryStatus } from './types.js';

/**
 * Links compared across the pages of one site (WCAG 3.2.4 consistent
 * identification, with 2.4.5 multiple ways and part of 2.4.6). The check
 * reads the pages it is given and nothing else.
 *
 * Measured, so a failure: a link to a place inside another given page that
 * has no element with that id. Also a failure, but only when the caller says
 * the set of pages is the whole site (`complete`): a link to a page that is
 * not in the set.
 *
 * Everything else needs a person, so it is UNKNOWN: the same destination
 * under two names, the same name for two destinations, the same main heading
 * on two pages, a site with neither a search nor a site map and, for a whole
 * site, a page nothing links to. When only some pages are read, links to the
 * other pages are counted in one entry, not listed one by one.
 */

export type SiteLinkRule = 'anchor-missing' | 'page-missing' | 'page-not-given' | 'name-varies' | 'target-varies' | 'orphan' | 'h1-repeat' | 'few-ways';

export const SITE_LINK_RULES: readonly SiteLinkRule[] = ['anchor-missing', 'page-missing', 'page-not-given', 'name-varies', 'target-varies', 'orphan', 'h1-repeat', 'few-ways'];

export interface SiteLinkOptions {
  /** True when the pages given are every page of the site. A link to a page outside the set then fails. */
  readonly complete?: boolean;
  /** Pages below which the site is too small for the `few-ways` rule. */
  readonly minPagesForWays?: number;
}

export const DEFAULT_MIN_PAGES_FOR_WAYS = 3;

/** Names of a link to a site map, in English and French. */
export const SITE_MAP_WORDS = /\b(site ?map|plan du site|all pages|toutes les pages|index of pages)\b/i;

const norm = (s: string): string => s.toLowerCase().replace(/\s+/g, ' ').trim();
const REPEATED_REGIONS = new Set(['header', 'nav', 'footer']);

/** Links that sit in the parts of a page that repeat across a site: the header, the navigation and the footer. */
const repeated = (p: PageInfo): SiteLink[] => p.links.filter((l) => REPEATED_REGIONS.has(l.region) && l.to !== null && l.name !== '');

export function auditSiteLinks(pages: readonly PageInfo[], options: SiteLinkOptions = {}): CheckResult {
  const entries: Entry[] = [];
  const add = (id: string, rule: SiteLinkRule, status: EntryStatus, en: string, fr: string): void => {
    entries.push({ check: 'site-links', id, status, rule, message: t(en, fr) });
  };
  if (pages.length < 2) return { checked: 0, entries };
  const byRoute = new Map(pages.map((p) => [p.route, p]));
  let checked = 0;

  // Links between the pages given: missing pages and missing places inside a page.
  const linkedFrom = new Map<string, Set<string>>();
  const missing = new Map<string, { from: string[]; link: SiteLink }>();
  for (const p of pages) {
    for (const l of p.links) {
      if (l.to === null) continue;
      checked++;
      const target = byRoute.get(l.to);
      if (!target) {
        const m = missing.get(l.to) ?? { from: [], link: l };
        if (!m.from.includes(p.route)) m.from.push(p.route);
        missing.set(l.to, m);
        continue;
      }
      if (target.route !== p.route) linkedFrom.set(target.route, (linkedFrom.get(target.route) ?? new Set<string>()).add(p.route));
      if (l.fragment !== '' && l.fragment !== 'top' && target.route !== p.route && !target.ids.has(l.fragment)) {
        add(
          `${p.route} ${l.id}`,
          'anchor-missing',
          'fail',
          `This link goes to #${clip(l.fragment, 40)} on ${target.route}, and that page has no element with this id. The link opens the page at the top instead of the place it names.`,
          `Ce lien mène à #${clip(l.fragment, 40)} sur ${target.route}, et cette page n’a aucun élément avec cet identifiant. Le lien ouvre la page en haut au lieu de l’endroit annoncé.`,
        );
      }
    }
  }
  if (options.complete) {
    for (const [route, m] of missing) {
      const from = m.from.slice(0, 3).join(', ');
      add(
        route,
        'page-missing',
        'fail',
        `${m.from.length === 1 ? 'A page links' : `${m.from.length} pages link`} to ${route} (${from}), and the site has no such page.`,
        `${m.from.length === 1 ? 'Une page mène' : `${m.from.length} pages mènent`} à ${route} (${from}), et le site n’a pas de page à cette adresse.`,
      );
    }
  } else if (missing.size > 0) {
    // One entry for all of them: when only some pages of a large site are read, most links go to pages that were not read.
    const some = [...missing.keys()].slice(0, 3).join(', ');
    add(
      'site',
      'page-not-given',
      'unknown',
      `Links on the pages read go to ${missing.size} ${missing.size === 1 ? 'page that was' : 'pages that were'} not read (${some}${missing.size > 3 ? ', ...' : ''}). Whether they exist was not looked at.`,
      `Des liens des pages lues mènent à ${missing.size} ${missing.size === 1 ? 'page qui n’a pas été lue' : 'pages qui n’ont pas été lues'} (${some}${missing.size > 3 ? ', ...' : ''}). Leur existence n’a pas été regardée.`,
    );
  }

  // 3.2.4: one destination under several names, and one name for several destinations, in the repeated regions of pages of one language.
  const langs = [...new Set(pages.map((p) => p.lang))];
  for (const lang of langs) {
    const group = pages.filter((p) => p.lang === lang);
    if (group.length < 2) continue;
    const namesOf = new Map<string, Map<string, { name: string; route: string }>>();
    const targetsOf = new Map<string, Map<string, { name: string; route: string }>>();
    for (const p of group) {
      for (const l of repeated(p)) {
        const to = l.to as string;
        const key = norm(l.name);
        const names = namesOf.get(to) ?? new Map<string, { name: string; route: string }>();
        if (!names.has(key)) names.set(key, { name: l.name, route: p.route });
        namesOf.set(to, names);
        const targets = targetsOf.get(key) ?? new Map<string, { name: string; route: string }>();
        if (!targets.has(to)) targets.set(to, { name: l.name, route: p.route });
        targetsOf.set(key, targets);
      }
    }
    for (const [to, names] of namesOf) {
      checked++;
      if (names.size < 2) continue;
      const list = [...names.values()];
      const shown = list.slice(0, 3).map((x) => `“${clip(x.name, 30)}” (${x.route})`).join(', ');
      const montre = list.slice(0, 3).map((x) => `«\u202F${clip(x.name, 30)}\u202F» (${x.route})`).join(', ');
      add(
        to,
        'name-varies',
        'unknown',
        `Links to ${to} in the header, navigation or footer carry ${list.length} different names: ${shown}. A person has to say whether they are the same function under two names.`,
        `Les liens vers ${to} dans l’en-tête, la navigation ou le pied de page portent ${list.length} noms différents\u00A0: ${montre}. Une personne doit dire s’il s’agit de la même fonction sous deux noms.`,
      );
    }
    for (const [, targets] of targetsOf) {
      if (targets.size < 2) continue;
      const list = [...targets.entries()];
      const name = list[0]?.[1].name ?? '';
      const shown = list.slice(0, 3).map(([to, x]) => `${to} (${x.route})`).join(', ');
      add(
        `“${clip(name, 30)}”`,
        'target-varies',
        'unknown',
        `The link name “${clip(name, 30)}” in the header, navigation or footer goes to ${list.length} different pages: ${shown}. A person has to say whether one name should mean one place.`,
        `Le nom de lien «\u202F${clip(name, 30)}\u202F» dans l’en-tête, la navigation ou le pied de page mène à ${list.length} pages différentes\u00A0: ${shown}. Une personne doit dire si un nom devrait désigner un seul endroit.`,
      );
    }

    // The same main heading on two pages of one language.
    const h1s = new Map<string, { text: string; routes: string[] }>();
    for (const p of group) {
      const first = p.h1[0] ?? '';
      if (norm(first) === '') continue;
      const seen = h1s.get(norm(first)) ?? { text: first, routes: [] };
      seen.routes.push(p.route);
      h1s.set(norm(first), seen);
    }
    for (const { text, routes } of h1s.values()) {
      if (routes.length < 2) continue;
      for (const r of routes.slice(1)) {
        add(
          r,
          'h1-repeat',
          'unknown',
          `The main heading “${clip(text, 40)}” is the same as on ${routes[0] ?? ''}. A person has to say whether it tells the pages apart.`,
          `Le titre principal «\u202F${clip(text, 40)}\u202F» est le même que sur ${routes[0] ?? ''}. Une personne doit dire s’il distingue les pages.`,
        );
      }
    }
  }

  // A page nothing links to, when the set is the whole site. The first page given is taken as the entry page.
  const entry = pages[0]?.route ?? '';
  for (const p of options.complete ? pages : []) {
    checked++;
    if (p.route === entry || linkedFrom.has(p.route)) continue;
    add(
      p.route,
      'orphan',
      'unknown',
      'No other page of the site links to this page. It may be reached another way, such as a link a script adds.',
      'Aucune autre page du site ne mène à cette page. Elle est peut-être atteinte autrement, par exemple par un lien qu’un script ajoute.',
    );
  }

  // 2.4.5: more than one way to find a page.
  const minPages = Math.max(2, Math.floor(options.minPagesForWays ?? DEFAULT_MIN_PAGES_FOR_WAYS));
  if (pages.length >= minPages) {
    checked++;
    const hasSearch = pages.some((p) => p.hasSearch);
    const hasMap = pages.some((p) => p.links.some((l) => SITE_MAP_WORDS.test(l.name)));
    if (!hasSearch && !hasMap) {
      add(
        'site',
        'few-ways',
        'unknown',
        `None of the ${pages.length} pages read has a search field or a link to a site map. A person has to say whether there is a second way to find a page besides the navigation.`,
        `Aucune des ${pages.length} pages lues n’a de champ de recherche ni de lien vers un plan du site. Une personne doit dire s’il existe un deuxième moyen de trouver une page en plus de la navigation.`,
      );
    }
  }
  return { checked, entries };
}
