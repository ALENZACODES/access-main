import { parseHtml, type HtmlNode } from './htmllint.js';
import { ancestorsOf, attrOf, inFileOrder, nodeLabel } from './markup.js';
import { t, type CheckResult, type Entry, type EntryStatus } from './types.js';

/**
 * The structure of lists (WCAG 1.3.1). A screen reader announces a list with
 * its number of items, and lets a person jump from item to item. That only
 * works when a ul, ol or menu holds li elements directly and a dl holds dt
 * and dd. Anything else between them breaks the count or the pairing. Those
 * are measured in the markup and fail. A list with no item, and terms with no
 * description, can be filled later by a script, so they are UNKNOWN. An li
 * outside any list is a static-html rule.
 */

export type ListRule = 'list-child' | 'dl-child' | 'term-outside-list' | 'term-without-description' | 'empty-list';

export const LIST_RULES: readonly ListRule[] = ['list-child', 'dl-child', 'term-outside-list', 'term-without-description', 'empty-list'];

const LISTS = new Set(['ul', 'ol', 'menu']);
/** Children every list may hold besides its items. */
const SCRIPTING = new Set(['script', 'template', 'noscript']);
const LIST_ROLES = new Set(['', 'list']);

const descendants = (nodes: readonly HtmlNode[], n: HtmlNode): HtmlNode[] => {
  const out: HtmlNode[] = [];
  const walk = (x: HtmlNode, depth: number): void => {
    if (depth > 200) return;
    for (const c of x.children) {
      const child = nodes[c];
      if (!child) continue;
      out.push(child);
      walk(child, depth + 1);
    }
  };
  walk(n, 0);
  return out;
};

export function auditLists(html: string): CheckResult {
  const { nodes } = parseHtml(html);
  const entries: Entry[] = [];
  let checked = 0;
  const add = (n: HtmlNode, rule: ListRule, status: EntryStatus, en: string, fr: string): void => {
    entries.push({ check: 'lists', id: nodeLabel(n), status, rule, message: t(en, fr) });
  };
  const kids = (n: HtmlNode): HtmlNode[] => n.children.flatMap((c) => (nodes[c] ? [nodes[c]] : []));

  for (const n of nodes) {
    const role = attrOf(n, 'role').toLowerCase();

    if (LISTS.has(n.tag)) {
      checked++;
      if (!LIST_ROLES.has(role)) continue;
      const children = kids(n);
      const wrong = children.filter((c) => c.tag !== 'li' && !SCRIPTING.has(c.tag) && attrOf(c, 'role').toLowerCase() !== 'listitem');
      const first = wrong[0];
      if (first) {
        const nested = LISTS.has(first.tag);
        add(
          first,
          'list-child',
          'fail',
          nested
            ? `A ${first.tag} sits directly inside a ${n.tag}. A nested list belongs inside the li it expands on, or screen readers lose which item it goes with. ${wrong.length > 1 ? `${wrong.length} children of this list are not li.` : 'Move it into the li before it.'}`
            : `A ${first.tag} sits directly inside a ${n.tag}, where only li is allowed. Screen readers can announce the wrong number of items or skip this content. ${wrong.length > 1 ? `${wrong.length} children of this list are not li.` : 'Wrap it in an li, or move it out of the list.'}`,
          nested
            ? `Un ${first.tag} se trouve directement dans un ${n.tag}. Une liste imbriquée va dans le li qu’elle détaille, sinon les lecteurs d’écran ne savent plus à quel élément elle se rattache. ${wrong.length > 1 ? `${wrong.length} enfants de cette liste ne sont pas des li.` : 'Déplacez-la dans le li qui la précède.'}`
            : `Un ${first.tag} se trouve directement dans un ${n.tag}, où seul li est permis. Les lecteurs d’écran peuvent annoncer un mauvais nombre d’éléments ou sauter ce contenu. ${wrong.length > 1 ? `${wrong.length} enfants de cette liste ne sont pas des li.` : 'Entourez-le d’un li, ou sortez-le de la liste.'}`,
        );
      }
      const hasItem = descendants(nodes, n).some((d) => d.tag === 'li' || attrOf(d, 'role').toLowerCase() === 'listitem');
      if (!hasItem && wrong.length === 0) {
        add(
          n,
          'empty-list',
          'unknown',
          `This ${n.tag} has no item. A screen reader can announce an empty list, which reads as something missing. If a script fills it later, check that it is hidden or left out while it is empty.`,
          `Ce ${n.tag} n’a aucun élément. Un lecteur d’écran peut annoncer une liste vide, ce qui se lit comme un manque. Si un script la remplit plus tard, contrôlez qu’elle est masquée ou absente tant qu’elle est vide.`,
        );
      }
    }

    if (n.tag === 'dl') {
      checked++;
      if (role !== '') continue;
      const children = kids(n);
      const wrong: HtmlNode[] = [];
      for (const c of children) {
        if (c.tag === 'dt' || c.tag === 'dd' || SCRIPTING.has(c.tag)) continue;
        if (c.tag === 'div') {
          const inner = kids(c).find((g) => g.tag !== 'dt' && g.tag !== 'dd' && !SCRIPTING.has(g.tag));
          if (inner) wrong.push(inner);
          continue;
        }
        wrong.push(c);
      }
      const first = wrong[0];
      if (first) {
        add(
          first,
          'dl-child',
          'fail',
          `A ${first.tag} sits inside a dl where only dt and dd, or a div that groups them, are allowed. Screen readers can lose the pairing of each term with its description. Move it into a dd, or out of the list.`,
          `Un ${first.tag} se trouve dans un dl, où seuls dt et dd, ou un div qui les regroupe, sont permis. Les lecteurs d’écran peuvent perdre l’association de chaque terme avec sa description. Déplacez-le dans un dd, ou sortez-le de la liste.`,
        );
      }
      const inside = descendants(nodes, n);
      const terms = inside.filter((d) => d.tag === 'dt').length;
      const descriptions = inside.filter((d) => d.tag === 'dd').length;
      if (terms + descriptions > 0 && (terms === 0 || descriptions === 0)) {
        add(
          n,
          'term-without-description',
          'unknown',
          terms === 0
            ? 'This dl has descriptions (dd) and no term (dt). A description list pairs each term with what it means. Check whether a plain list or paragraphs say it better.'
            : 'This dl has terms (dt) and no description (dd). A description list pairs each term with what it means. Check whether the descriptions are missing, or whether a plain list fits better.',
          terms === 0
            ? 'Ce dl a des descriptions (dd) et aucun terme (dt). Une liste de descriptions associe chaque terme à son sens. Contrôlez si une liste simple ou des paragraphes conviennent mieux.'
            : 'Ce dl a des termes (dt) et aucune description (dd). Une liste de descriptions associe chaque terme à son sens. Contrôlez si les descriptions manquent, ou si une liste simple convient mieux.',
        );
      }
    }

    if ((n.tag === 'dt' || n.tag === 'dd') && role === '') {
      checked++;
      if (!ancestorsOf(nodes, n).some((a) => a.tag === 'dl')) {
        add(
          n,
          'term-outside-list',
          'fail',
          `This ${n.tag} is not inside a dl. Without the list around it, it is announced as plain text and its ${n.tag === 'dt' ? 'description' : 'term'} is not tied to it. Wrap the terms and descriptions in a dl.`,
          `Ce ${n.tag} n’est pas dans un dl. Sans la liste autour, il est annoncé comme du simple texte et ${n.tag === 'dt' ? 'sa description' : 'son terme'} ne lui est pas rattaché. Entourez les termes et les descriptions d’un dl.`,
        );
      }
    }
  }
  return { checked, entries: inFileOrder(entries) };
}
