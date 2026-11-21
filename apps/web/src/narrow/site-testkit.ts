import type { SitePage } from './sitepages.js';

/** Test support: small pages of markup for the checks that compare pages. */

export interface PageParts {
  readonly lang?: string;
  readonly title?: string;
  /** Markup placed in the head, such as alternate links. */
  readonly head?: string;
  /** Links of the main navigation as [href, name]. */
  readonly nav?: readonly (readonly [string, string])[];
  /** Markup of the main region. A heading is added from the title when this holds no h1. */
  readonly main?: string;
  /** Markup of the footer. */
  readonly footer?: string;
}

export function pageHtml(parts: PageParts = {}): string {
  const title = parts.title ?? 'Page';
  const nav = parts.nav ? `<header><nav aria-label="Main">${parts.nav.map(([href, name]) => `<a href="${href}">${name}</a>`).join('')}</nav></header>` : '';
  const main = parts.main ?? '';
  const h1 = main.includes('<h1') ? '' : `<h1>${title}</h1>`;
  const footer = parts.footer !== undefined ? `<footer>${parts.footer}</footer>` : '';
  return `<!doctype html><html lang="${parts.lang ?? 'en'}"><head><meta charset="utf-8"><title>${title}</title>${parts.head ?? ''}</head><body>${nav}<main>${h1}${main}</main>${footer}</body></html>`;
}

export const sitePage = (route: string, parts: PageParts = {}): SitePage => ({ route, html: pageHtml(parts) });

/** An alternate link for the head of a page. */
export const alternate = (hreflang: string, href: string): string => `<link rel="alternate" hreflang="${hreflang}" href="${href}">`;

const NAV_EN: readonly (readonly [string, string])[] = [['/', 'Home'], ['/places', 'Places'], ['/help', 'Help']];
const NAV_FR: readonly (readonly [string, string])[] = [['/fr', 'Accueil'], ['/fr/lieux', 'Lieux'], ['/fr/aide', 'Aide']];

/** Six pages, three in each language, that name each other correctly and link to each other. The checks find nothing to fail on it. */
export function tidySite(): SitePage[] {
  const pair = (en: string, fr: string, titleEn: string, titleFr: string, body: string, corps: string): SitePage[] => [
    sitePage(en, { title: titleEn, head: alternate('fr', fr), nav: NAV_EN, main: `${body}<p><a href="${fr}" lang="fr">Français</a></p>`, footer: '<a href="/sitemap">Site map</a>' }),
    sitePage(fr, { lang: 'fr', title: titleFr, head: alternate('en', en), nav: NAV_FR, main: `${corps}<p><a href="${en}" lang="en">English</a></p>`, footer: '<a href="/sitemap">Plan du site</a>' }),
  ];
  return [
    ...pair('/', '/fr', 'Home', 'Accueil', '<p>Find a place.</p>', '<p>Trouvez un lieu.</p>'),
    ...pair('/places', '/fr/lieux', 'Places', 'Lieux', '<ul id="list"><li>One</li><li>Two</li></ul>', '<ul id="liste"><li>Un</li><li>Deux</li></ul>'),
    ...pair('/help', '/fr/aide', 'Help', 'Aide', '<p>Write to us.</p>', '<p>Écrivez-nous.</p>'),
    sitePage('/sitemap', { title: 'Site map', nav: NAV_EN, main: '<ul><li><a href="/fr">Accueil</a></li><li><a href="/fr/lieux">Lieux</a></li><li><a href="/fr/aide">Aide</a></li></ul>' }),
  ];
}
