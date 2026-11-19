import { parseHtml, type HtmlNode } from './htmllint.js';
import { attrOf, inFileOrder, tokensOf } from './markup.js';
import { clip, t, type CheckResult, type Entry, type EntryStatus } from './types.js';

/**
 * Ids and the attributes that refer to them, as they are written (WCAG
 * 4.1.2). An id with a space in it can never be referred to, because a
 * reference list is split on spaces. A reference written like a CSS selector
 * or a link (with # or a comma) names an id that does not exist. An image map
 * reference without # is not followed. Those are measured in the markup and
 * fail. An empty id and two ids that differ only in upper and lower case work
 * and invite mistakes, so they are UNKNOWN. Whether a well-formed reference
 * finds its target is the references check, and a repeated id is a
 * static-html rule.
 */

export type IdentifierRule = 'id-space' | 'idref-syntax' | 'usemap-no-hash' | 'id-empty' | 'id-case-collision';

export const IDENTIFIER_RULES: readonly IdentifierRule[] = ['id-space', 'idref-syntax', 'usemap-no-hash', 'id-empty', 'id-case-collision'];

/** Attributes whose value is one id or a list of ids separated by spaces. */
export const IDREF_ATTRIBUTES: readonly string[] = [
  'for', 'headers', 'list', 'form', 'aria-labelledby', 'aria-describedby', 'aria-controls', 'aria-owns', 'aria-activedescendant',
  'aria-errormessage', 'aria-details', 'aria-flowto',
];

/** Why a reference value is not a list of ids, or null when it is one. */
export function idrefProblem(value: string): 'hash' | 'comma' | 'dot' | null {
  const tokens = tokensOf(value);
  if (tokens.some((x) => x.startsWith('#'))) return 'hash';
  if (value.includes(',')) return 'comma';
  if (tokens.some((x) => x.startsWith('.'))) return 'dot';
  return null;
}

export function auditIdentifiers(html: string): CheckResult {
  const { nodes } = parseHtml(html);
  const entries: Entry[] = [];
  let checked = 0;
  const add = (n: HtmlNode, rule: IdentifierRule, status: EntryStatus, en: string, fr: string): void => {
    entries.push({ check: 'identifiers', id: `${n.tag}@L${n.line}`, status, rule, message: t(en, fr) });
  };
  const byLower = new Map<string, { id: string; node: HtmlNode }>();
  const collided = new Set<string>();

  for (const n of nodes) {
    const id = n.attrs['id'];
    if (id !== undefined) {
      checked++;
      if (id.trim() === '') {
        add(
          n,
          'id-empty',
          'unknown',
          `This ${n.tag} has an empty id. It does nothing, and it is often a sign that a value was meant to be filled in and was not, so a label or a link that should point here may be pointing nowhere. Check, then give it a value or remove it.`,
          `Ce ${n.tag} a un id vide. Il ne sert à rien, et c’est souvent le signe qu’une valeur devait être remplie et ne l’a pas été\u00A0: une étiquette ou un lien qui devrait pointer ici pointe peut-être dans le vide. Contrôlez, puis donnez-lui une valeur ou retirez-le.`,
        );
      } else if (/\s/.test(id)) {
        add(
          n,
          'id-space',
          'fail',
          `The id “${clip(id, 30)}” has a space in it. References such as for and aria-labelledby are split on spaces, so nothing can ever point to this element, and a link to it only works in some browsers. Use a hyphen in place of the space.`,
          `L’id «\u202F${clip(id, 30)}\u202F» contient une espace. Les références comme for et aria-labelledby sont découpées sur les espaces\u00A0: rien ne pourra jamais pointer vers cet élément, et un lien vers lui ne fonctionne que dans certains navigateurs. Remplacez l’espace par un trait d’union.`,
        );
      } else {
        const lower = id.toLowerCase();
        const earlier = byLower.get(lower);
        if (!earlier) byLower.set(lower, { id, node: n });
        else if (earlier.id !== id && !collided.has(lower)) {
          collided.add(lower);
          add(
            n,
            'id-case-collision',
            'unknown',
            `The ids “${clip(earlier.id, 24)}” (line ${earlier.node.line}) and “${clip(id, 24)}” differ only in upper and lower case. Ids are case-sensitive, so a reference with the wrong case silently points to the other element or to none. Check each reference, or rename one.`,
            `Les id «\u202F${clip(earlier.id, 24)}\u202F» (ligne ${earlier.node.line}) et «\u202F${clip(id, 24)}\u202F» ne diffèrent que par les majuscules et minuscules. Les id sont sensibles à la casse\u00A0: une référence à la mauvaise casse pointe en silence vers l’autre élément ou vers aucun. Contrôlez chaque référence, ou renommez-en un.`,
          );
        }
      }
    }

    for (const a of IDREF_ATTRIBUTES) {
      const value = n.attrs[a];
      if (value === undefined || value.trim() === '') continue;
      if (a === 'for' && n.tag !== 'label' && n.tag !== 'output') continue;
      if (a === 'list' && n.tag !== 'input') continue;
      if (a === 'headers' && n.tag !== 'td' && n.tag !== 'th') continue;
      checked++;
      const problem = idrefProblem(value);
      if (problem === null) continue;
      const why = {
        hash: { en: 'starts with #, as a link or a CSS selector would', fr: 'commence par #, comme le ferait un lien ou un sélecteur CSS' },
        comma: { en: 'separates ids with a comma, where only spaces are allowed', fr: 'sépare les id par une virgule, alors que seules les espaces sont permises' },
        dot: { en: 'starts with a dot, as a CSS class selector would', fr: 'commence par un point, comme le ferait un sélecteur de classe CSS' },
      }[problem];
      add(
        n,
        'idref-syntax',
        'fail',
        `${a} is set to “${clip(value, 30)}”, which ${why.en}. The attribute takes bare ids, so this names an id that does not exist and the relation is dropped. Write the id alone.`,
        `${a} vaut «\u202F${clip(value, 30)}\u202F», qui ${why.fr}. L’attribut attend des id nus\u00A0: ceci nomme un id qui n’existe pas, et la relation est abandonnée. Écrivez l’id seul.`,
      );
    }

    if ((n.tag === 'img' || n.tag === 'object') && attrOf(n, 'usemap') !== '') {
      checked++;
      if (!attrOf(n, 'usemap').startsWith('#')) {
        add(
          n,
          'usemap-no-hash',
          'fail',
          `usemap is set to “${clip(attrOf(n, 'usemap'), 30)}” with no # in front. Browsers only follow a map reference that starts with #, so the clickable areas of the image are not there. Write #${clip(attrOf(n, 'usemap'), 30)}.`,
          `usemap vaut «\u202F${clip(attrOf(n, 'usemap'), 30)}\u202F», sans # devant. Les navigateurs ne suivent une référence de carte que si elle commence par #\u00A0: les zones cliquables de l’image n’existent donc pas. Écrivez #${clip(attrOf(n, 'usemap'), 30)}.`,
        );
      }
    }
  }
  return { checked, entries: inFileOrder(entries) };
}
