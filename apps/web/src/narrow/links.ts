import { clip, t, type CheckResult, type Entry } from './types.js';
import type { AnchorFact } from './structure.js';

/**
 * Links on the rendered page (WCAG 2.4.4 and 3.2.5). Nothing here is a
 * measured failure, because a link can be made clear by its context. Each
 * rule is UNKNOWN and a person decides: two links with the same name that go
 * to different places, a link that opens a new tab with no warning, a web
 * address used as the link text, and a link to a file that does not say so.
 * Generic link text is already a rule of the static-html check.
 */

export type LinkRule = 'same-name-different-target' | 'new-tab-unannounced' | 'url-as-text' | 'file-unannounced';

export const LINK_RULES: readonly LinkRule[] = ['same-name-different-target', 'new-tab-unannounced', 'url-as-text', 'file-unannounced'];

/** Web addresses at least this long, used as link text, are asked about. */
export const URL_TEXT_MIN = 30;

/** The address a link goes to, without the fragment, a trailing slash or the case of the host. */
export function targetKey(href: string): string {
  const h = href.trim().replace(/#.*$/, '');
  return h.replace(/\/+$/, '').toLowerCase();
}

export const looksLikeUrl = (name: string): boolean => /^(https?:\/\/|www\.)\S+$/i.test(name.trim());

export function auditLinks(links: readonly AnchorFact[]): CheckResult {
  const entries: Entry[] = [];
  const add = (id: string, rule: LinkRule, en: string, fr: string): void => {
    entries.push({ check: 'links', id, status: 'unknown', rule, message: t(en, fr) });
  };
  const groups = new Map<string, AnchorFact[]>();
  for (const l of links) {
    const name = l.name.replace(/\s+/g, ' ').trim().toLowerCase();
    if (name === '' || looksLikeUrl(name) || l.href.startsWith('#')) continue;
    const list = groups.get(name);
    if (list) list.push(l);
    else groups.set(name, [l]);
  }
  for (const list of groups.values()) {
    const targets = new Set(list.map((l) => targetKey(l.href)));
    const first = list[0];
    if (first && targets.size > 1) {
      add(
        first.id,
        'same-name-different-target',
        `${list.length} links are named “${clip(first.name, 30)}” and go to ${targets.size} different places. Check that the text around each one tells them apart.`,
        `${list.length} liens se nomment «\u202F${clip(first.name, 30)}\u202F» et mènent à ${targets.size} endroits différents. Contrôlez que le texte autour de chacun permet de les distinguer.`,
      );
    }
  }
  for (const l of links) {
    if (l.newTab && !l.announcesNewTab) {
      add(
        l.id,
        'new-tab-unannounced',
        `The link “${clip(l.name, 30)}” opens a new tab or window and does not say so. Say it in the text or the title.`,
        `Le lien «\u202F${clip(l.name, 30)}\u202F» ouvre un nouvel onglet ou une nouvelle fenêtre sans le dire. Dites-le dans le texte ou le titre.`,
      );
    }
    if (looksLikeUrl(l.name) && l.name.trim().length >= URL_TEXT_MIN) {
      add(
        l.id,
        'url-as-text',
        `The link text is a long web address (${clip(l.name, 36)}). A screen reader reads it letter by letter. Use words about the destination.`,
        `Le texte du lien est une longue adresse web (${clip(l.name, 36)}). Un lecteur d’écran la lit lettre par lettre. Utilisez des mots sur la destination.`,
      );
    }
    if (l.file !== null && !l.announcesFile) {
      add(
        l.id,
        'file-unannounced',
        `The link “${clip(l.name, 30)}” goes to a ${l.file === 'file' ? 'file' : l.file.toUpperCase() + ' file'} and does not say so. People on a metered connection or without the program need to know.`,
        `Le lien «\u202F${clip(l.name, 30)}\u202F» mène à un ${l.file === 'file' ? 'fichier' : 'fichier ' + l.file.toUpperCase()} sans le dire. Les personnes avec une connexion limitée ou sans le logiciel doivent le savoir.`,
      );
    }
  }
  return { checked: links.length, entries };
}
