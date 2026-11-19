import { parseHtml, type HtmlNode } from './htmllint.js';
import { attrOf, inFileOrder, isHiddenNode, nodeLabel, tokensOf } from './markup.js';
import { clip, t, type CheckResult, type Entry, type EntryStatus } from './types.js';

/**
 * The words put in naming attributes (WCAG 4.1.2 and 2.5.3). An alt attribute
 * on an element that does not take one is ignored, which is measured and
 * fails. A name that repeats the role ("Close button" on a button is read
 * "Close button, button"), a very long name, an aria-label that only repeats
 * the visible text or is empty, and a long placeholder are for a person to
 * judge, so they are UNKNOWN. Whether a control has a name at all is a
 * static-html rule, and alt text quality belongs to the images check.
 */

export type NameWordRule = 'alt-no-effect' | 'name-says-role' | 'name-too-long' | 'label-repeats-text' | 'aria-label-blank' | 'placeholder-long';

export const NAME_WORD_RULES: readonly NameWordRule[] = ['alt-no-effect', 'name-says-role', 'name-too-long', 'label-repeats-text', 'aria-label-blank', 'placeholder-long'];

/** Longest aria-label that is not asked about, in characters. */
export const MAX_NAME_CHARS = 100;
/** Longest placeholder that is not asked about, in characters. */
export const MAX_PLACEHOLDER_CHARS = 50;

const TAKES_ALT = new Set(['img', 'area']);
const BUTTON_WORD = /(?:^|\s)(?:button|bouton|btn)(?:\s|$)/iu;
const LINK_WORD = /(?:^|\s)(?:link|lien|hyperlink|hyperlien)(?:\s|$)/iu;

const squash = (s: string): string => s.replace(/\s+/g, ' ').trim().toLowerCase();

/** `button`, `link` or null: what a screen reader will add after the name. */
export function announcedRole(n: HtmlNode): 'button' | 'link' | null {
  const role = tokensOf(attrOf(n, 'role').toLowerCase())[0] ?? '';
  if (role === 'button' || role === 'link') return role;
  if (role !== '') return null;
  if (n.tag === 'button' || n.tag === 'summary') return 'button';
  if (n.tag === 'input' && ['button', 'submit', 'reset'].includes(attrOf(n, 'type').toLowerCase())) return 'button';
  if (n.tag === 'a' && n.attrs['href'] !== undefined) return 'link';
  return null;
}

export function auditNameWords(html: string): CheckResult {
  const { nodes } = parseHtml(html);
  const entries: Entry[] = [];
  let checked = 0;
  const add = (n: HtmlNode, rule: NameWordRule, status: EntryStatus, en: string, fr: string): void => {
    entries.push({ check: 'name-words', id: nodeLabel(n), status, rule, message: t(en, fr) });
  };

  for (const n of nodes) {
    const a = n.attrs;
    const role = announcedRole(n);
    if (a['alt'] === undefined && a['aria-label'] === undefined && a['placeholder'] === undefined && role === null) continue;
    if (isHiddenNode(nodes, n)) continue;
    checked++;

    const imageInput = n.tag === 'input' && attrOf(n, 'type').toLowerCase() === 'image';
    if (a['alt'] !== undefined && !TAKES_ALT.has(n.tag) && !imageInput && !n.tag.includes('-')) {
      add(
        n,
        'alt-no-effect',
        'fail',
        `This ${n.tag} has an alt attribute${attrOf(n, 'alt') ? ` (“${clip(attrOf(n, 'alt'), 30)}”)` : ''}. Alt only works on img, area and image inputs, so the words are never announced here. Use aria-label on a control, or put the words in the text.`,
        `Ce ${n.tag} a un attribut alt${attrOf(n, 'alt') ? ` («\u202F${clip(attrOf(n, 'alt'), 30)}\u202F»)` : ''}. Alt ne fonctionne que sur img, area et les champs de type image\u00A0: les mots ne sont donc jamais annoncés ici. Utilisez aria-label sur une commande, ou mettez les mots dans le texte.`,
      );
    }

    const label = a['aria-label'];
    if (label !== undefined && label.trim() === '') {
      add(
        n,
        'aria-label-blank',
        'unknown',
        `This ${n.tag} has an empty aria-label. An empty name does nothing, and it is often a sign that a value was meant to be filled in. Check that the element still has a name from its text or its label, then remove the attribute.`,
        `Ce ${n.tag} a un aria-label vide. Un nom vide ne sert à rien, et c’est souvent le signe qu’une valeur devait être remplie. Contrôlez que l’élément a tout de même un nom par son texte ou son étiquette, puis retirez l’attribut.`,
      );
    }

    const name = label !== undefined && label.trim() !== '' ? label : role !== null ? (n.tag === 'input' ? attrOf(n, 'value') : n.text) : '';
    if (role !== null && name.trim() !== '') {
      const says = role === 'button' ? BUTTON_WORD.test(name) : LINK_WORD.test(name);
      if (says && squash(name).split(' ').length > 1) {
        add(
          n,
          'name-says-role',
          'unknown',
          `The name “${clip(name, 36)}” includes the word for a ${role}. Screen readers already announce the role after the name, so people hear it twice. Remove the word from the name.`,
          `Le nom «\u202F${clip(name, 36)}\u202F» contient le mot qui désigne un ${role === 'button' ? 'bouton' : 'lien'}. Les lecteurs d’écran annoncent déjà le rôle après le nom\u00A0: on l’entend donc deux fois. Retirez ce mot du nom.`,
        );
      }
    }

    if (label !== undefined && label.trim().length > MAX_NAME_CHARS) {
      add(
        n,
        'name-too-long',
        'unknown',
        `The aria-label of this ${n.tag} is ${label.trim().length} characters long. A name is read in one go each time the element gets focus, and it cannot be paused or read word by word. Keep the name short, and move the rest to a description with aria-describedby.`,
        `L’aria-label de ce ${n.tag} compte ${label.trim().length} caractères. Un nom est lu d’un seul trait chaque fois que l’élément reçoit le focus, sans pause ni lecture mot à mot. Gardez un nom court, et déplacez le reste dans une description avec aria-describedby.`,
      );
    }

    if (label !== undefined && label.trim() !== '' && n.text.trim() !== '' && squash(label) === squash(n.text)) {
      add(
        n,
        'label-repeats-text',
        'unknown',
        `The aria-label of this ${n.tag} says the same as its visible text (“${clip(n.text, 30)}”). It adds nothing, and it will go stale or stay in one language when the text changes. Remove the aria-label.`,
        `L’aria-label de ce ${n.tag} dit la même chose que son texte visible («\u202F${clip(n.text, 30)}\u202F»). Il n’apporte rien, et il deviendra faux ou restera dans une seule langue quand le texte changera. Retirez l’aria-label.`,
      );
    }

    const placeholder = a['placeholder'];
    if (placeholder !== undefined && placeholder.trim().length > MAX_PLACEHOLDER_CHARS) {
      add(
        n,
        'placeholder-long',
        'unknown',
        `The placeholder of this ${n.tag} is ${placeholder.trim().length} characters long, which reads like instructions. It disappears as soon as a person types, and it is cut off on a narrow screen. Move the instructions to a hint below the label, linked with aria-describedby.`,
        `Le texte indicatif de ce ${n.tag} compte ${placeholder.trim().length} caractères, ce qui ressemble à des consignes. Il disparaît dès qu’on commence à écrire, et il est coupé sur un écran étroit. Déplacez les consignes dans une aide sous l’étiquette, reliée par aria-describedby.`,
      );
    }
  }
  return { checked, entries: inFileOrder(entries) };
}
