import { parseHtml, type HtmlNode } from './htmllint.js';
import { ancestorsOf, attrOf, inFileOrder, isHiddenNode, nodeLabel, tokensOf } from './markup.js';
import { t, type CheckResult, type Entry } from './types.js';

/**
 * How a page is cut into parts (WCAG 1.3.1 and 2.4.1). Screen reader users
 * move by landmark and by heading. Two page headers or footers, a main area
 * inside another part, a region with no name and a section with no heading
 * all make that map harder to read. None of them is a failure in itself, and
 * a script can add a heading later, so every finding is UNKNOWN. A missing or
 * repeated main and repeated navigation with no names are static-html rules.
 */

export type SectioningRule = 'section-no-heading' | 'duplicate-banner' | 'duplicate-contentinfo' | 'main-nested' | 'region-no-name';

export const SECTIONING_RULES: readonly SectioningRule[] = ['section-no-heading', 'duplicate-banner', 'duplicate-contentinfo', 'main-nested', 'region-no-name'];

/** Inside these, a header or a footer belongs to that part and is not the page banner or footer. */
const SCOPING = new Set(['article', 'aside', 'main', 'nav', 'section']);
const SCOPING_ROLES = new Set(['article', 'complementary', 'main', 'navigation', 'region']);
/** Parts a main area must not sit inside. */
const LANDMARK_TAGS = new Set(['article', 'aside', 'footer', 'header', 'nav', 'section']);
const LANDMARK_ROLES = new Set(['banner', 'complementary', 'contentinfo', 'navigation', 'region', 'search', 'form', 'article']);
const HEADING = /^h[1-6]$/;

const roleOf = (n: HtmlNode): string => tokensOf(attrOf(n, 'role').toLowerCase())[0] ?? '';
const named = (n: HtmlNode): boolean => attrOf(n, 'aria-label') !== '' || attrOf(n, 'aria-labelledby') !== '' || attrOf(n, 'title') !== '';

export function auditSectioning(html: string): CheckResult {
  const { nodes } = parseHtml(html);
  const entries: Entry[] = [];
  let checked = 0;
  const add = (n: HtmlNode, rule: SectioningRule, en: string, fr: string): void => {
    entries.push({ check: 'sectioning', id: nodeLabel(n), status: 'unknown', rule, message: t(en, fr) });
  };
  const scoped = (n: HtmlNode): boolean => ancestorsOf(nodes, n).some((a) => SCOPING.has(a.tag) || SCOPING_ROLES.has(roleOf(a)));
  const hasHeading = (n: HtmlNode): boolean => {
    const stack = [...n.children];
    let guard = 0;
    while (stack.length > 0 && guard++ < 100000) {
      const c = nodes[stack.pop() ?? -1];
      if (!c) continue;
      if (HEADING.test(c.tag) || roleOf(c) === 'heading') return true;
      stack.push(...c.children);
    }
    return false;
  };

  const banners: HtmlNode[] = [];
  const footers: HtmlNode[] = [];
  for (const n of nodes) {
    const role = roleOf(n);
    if (isHiddenNode(nodes, n)) continue;

    if (role === 'banner' || (n.tag === 'header' && role === '' && !scoped(n))) banners.push(n);
    if (role === 'contentinfo' || (n.tag === 'footer' && role === '' && !scoped(n))) footers.push(n);

    if ((n.tag === 'section' || n.tag === 'article') && (role === '' || role === 'region' || role === 'article')) {
      checked++;
      if (!named(n) && n.text.trim() !== '' && !hasHeading(n)) {
        add(
          n,
          'section-no-heading',
          `This ${n.tag} has no heading and no name. People who move by headings skip past it, and nothing says what the part is about. Start it with a heading, or use a div if it is only a box for styling.`,
          `Ce ${n.tag} n’a ni titre ni nom. Les personnes qui naviguent par titres passent à côté, et rien ne dit de quoi traite cette partie. Commencez-le par un titre, ou utilisez un div s’il ne sert qu’à la mise en forme.`,
        );
      }
    }

    if (n.tag === 'main' || role === 'main') {
      checked++;
      const around = ancestorsOf(nodes, n).find((a) => LANDMARK_TAGS.has(a.tag) || LANDMARK_ROLES.has(roleOf(a)));
      if (around) {
        add(
          n,
          'main-nested',
          `The main area sits inside a ${around.tag}${roleOf(around) ? ` with the role ${roleOf(around)}` : ''}. Screen reader users expect main at the top level, beside the page header and footer, and a jump to main can land in the wrong place. Move it out.`,
          `La zone principale se trouve dans un ${around.tag}${roleOf(around) ? ` de rôle ${roleOf(around)}` : ''}. Au lecteur d’écran, on attend main au premier niveau, à côté de l’en-tête et du pied de page, et un saut vers main peut mener au mauvais endroit. Sortez-la de là.`,
        );
      }
    }

    if (role === 'region') {
      checked++;
      if (!named(n)) {
        add(
          n,
          'region-no-name',
          `This ${n.tag} has the role region and no name. Browsers only list a region as a landmark when it has a name, so the role does nothing here. Add aria-labelledby pointing at its heading, or remove the role.`,
          `Ce ${n.tag} a le rôle region sans nom. Les navigateurs ne présentent une région comme repère que si elle a un nom\u00A0: le rôle ne sert donc à rien ici. Ajoutez aria-labelledby vers son titre, ou retirez le rôle.`,
        );
      }
    }
  }

  checked += banners.length + footers.length;
  const second = banners[1];
  if (second) {
    add(
      second,
      'duplicate-banner',
      `The page has ${banners.length} page headers (header at the top level, or role banner). A screen reader lists each one as the banner, and people cannot tell which holds the site name and navigation. Keep one, and put the others inside the part they belong to.`,
      `La page a ${banners.length} en-têtes de page (header au premier niveau, ou rôle banner). Un lecteur d’écran présente chacun comme la bannière, et on ne sait plus lequel contient le nom du site et la navigation. Gardez-en un seul, et placez les autres dans la partie à laquelle ils appartiennent.`,
    );
  }
  const secondFooter = footers[1];
  if (secondFooter) {
    add(
      secondFooter,
      'duplicate-contentinfo',
      `The page has ${footers.length} page footers (footer at the top level, or role contentinfo). A screen reader lists each one as the page footer, and people cannot tell where the help and contact links are. Keep one, and put the others inside the part they belong to.`,
      `La page a ${footers.length} pieds de page (footer au premier niveau, ou rôle contentinfo). Un lecteur d’écran présente chacun comme le pied de page, et on ne sait plus où se trouvent les liens d’aide et de contact. Gardez-en un seul, et placez les autres dans la partie à laquelle ils appartiennent.`,
    );
  }
  return { checked, entries: inFileOrder(entries) };
}
