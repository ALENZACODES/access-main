import { parseHtml, type HtmlNode } from './htmllint.js';
import { ancestorsOf, attrOf, inFileOrder, isHiddenNode, nodeLabel } from './markup.js';
import { clip, t, type CheckResult, type Entry, type EntryStatus } from './types.js';

/**
 * Limits a form puts on what a person may type or choose (WCAG 3.3.2, and
 * 3.2.2 for a form with no button to send it). A pattern, a length limit or a
 * number spinner works silently: the browser blocks or changes the entry and
 * says little about why. The markup shows the limit and not whether the page
 * explains it nearby, so those are UNKNOWN. An option group with no label is
 * measured and fails, because it is announced as a group with no name. Labels,
 * required marks and keyboard types belong to the forms check.
 */

export type ConstraintRule = 'pattern-unexplained' | 'length-silent' | 'number-for-code' | 'multiple-select' | 'reset-button' | 'no-submit' | 'group-no-label';

export const CONSTRAINT_RULES: readonly ConstraintRule[] = [
  'pattern-unexplained', 'length-silent', 'number-for-code', 'multiple-select', 'reset-button', 'no-submit', 'group-no-label',
];

/** Names that mark a value made of digits that is not a quantity. */
export const CODE_NAME = /(?:^|[^a-z])(?:tel|phone|telephone|mobile|fax|postal|postcode|zip|card|cc|cvv|cvc|otp|code|pin|account|compte|carte|nip)(?:[^a-z]|$)/i;
/** Autocomplete tokens for the same kind of value. */
const CODE_TOKENS = new Set(['tel', 'tel-national', 'tel-local', 'postal-code', 'cc-number', 'cc-csc', 'one-time-code']);
/** Input types that take typed text, where a pattern or a length limit applies. */
const TEXT_TYPES = new Set(['text', 'search', 'tel', 'url', 'email', 'password']);
const FIELD_TAGS = new Set(['input', 'select', 'textarea']);
const NOT_FIELDS = new Set(['hidden', 'submit', 'reset', 'button', 'image']);

const inputType = (n: HtmlNode): string => (attrOf(n, 'type') || 'text').toLowerCase();
const fieldName = (n: HtmlNode): string => clip(attrOf(n, 'aria-label') || attrOf(n, 'name') || attrOf(n, 'id') || n.tag, 30);

/** True for a button that sends its form: a button with no type or type submit, and submit or image inputs. */
export function isSubmit(n: HtmlNode): boolean {
  if (n.tag === 'button') return attrOf(n, 'type') === '' || attrOf(n, 'type').toLowerCase() === 'submit';
  return n.tag === 'input' && (inputType(n) === 'submit' || inputType(n) === 'image');
}

export function auditConstraints(html: string): CheckResult {
  const { nodes } = parseHtml(html);
  const entries: Entry[] = [];
  let checked = 0;
  const add = (n: HtmlNode, rule: ConstraintRule, status: EntryStatus, en: string, fr: string): void => {
    entries.push({ check: 'constraints', id: nodeLabel(n), status, rule, message: t(en, fr) });
  };
  const described = (n: HtmlNode): boolean => attrOf(n, 'aria-describedby') !== '' || attrOf(n, 'aria-description') !== '';

  for (const n of nodes) {
    if (isHiddenNode(nodes, n)) continue;
    const type = n.tag === 'input' ? inputType(n) : '';

    if (FIELD_TAGS.has(n.tag) && !NOT_FIELDS.has(type)) {
      checked++;
      const typed = n.tag === 'textarea' || (n.tag === 'input' && TEXT_TYPES.has(type));

      if (n.tag === 'input' && TEXT_TYPES.has(type) && attrOf(n, 'pattern') !== '' && attrOf(n, 'title') === '' && !described(n)) {
        add(
          n,
          'pattern-unexplained',
          'unknown',
          `The field “${fieldName(n)}” has a pattern and no title or linked hint. When the entry does not match, the browser only says the format is wrong, not what it should be. Check that the expected format is written next to the field and linked with aria-describedby.`,
          `Le champ «\u202F${fieldName(n)}\u202F» a un pattern, sans title ni aide associée. Quand la saisie ne correspond pas, le navigateur dit seulement que le format est mauvais, pas ce qu’il doit être. Contrôlez que le format attendu est écrit près du champ et relié par aria-describedby.`,
        );
      }

      const limits = ['maxlength', 'minlength'].filter((a) => /^\d+$/.test(attrOf(n, a)));
      if (typed && limits.length > 0 && !described(n)) {
        const max = attrOf(n, 'maxlength');
        const min = attrOf(n, 'minlength');
        const en = [min !== '' && limits.includes('minlength') ? `at least ${min}` : '', max !== '' && limits.includes('maxlength') ? `at most ${max}` : ''].filter((x) => x !== '').join(' and ');
        const fr = [min !== '' && limits.includes('minlength') ? `au moins ${min}` : '', max !== '' && limits.includes('maxlength') ? `au plus ${max}` : ''].filter((x) => x !== '').join(' et ');
        add(
          n,
          'length-silent',
          'unknown',
          `The field “${fieldName(n)}” accepts ${en} characters and no hint is linked to it. ${limits.includes('maxlength') ? 'Typing past the limit is dropped without a sound, which is easy to miss with a screen reader or when pasting. ' : ''}Check that the limit is written next to the field and linked with aria-describedby.`,
          `Le champ «\u202F${fieldName(n)}\u202F» accepte ${fr} caractères et aucune aide ne lui est associée. ${limits.includes('maxlength') ? 'Ce qui dépasse la limite est écarté sans aucun signal, ce qui passe facilement inaperçu au lecteur d’écran ou lors d’un collage. ' : ''}Contrôlez que la limite est écrite près du champ et reliée par aria-describedby.`,
        );
      }

      if (type === 'number') {
        const hint = `${attrOf(n, 'name')} ${attrOf(n, 'id')}`;
        if (CODE_NAME.test(hint) || CODE_TOKENS.has(attrOf(n, 'autocomplete').toLowerCase())) {
          add(
            n,
            'number-for-code',
            'unknown',
            `The field “${fieldName(n)}” is of type number and looks like it holds a phone number, a postal code or another code. A number field drops leading zeros, changes the value on an arrow key or a scroll, and is announced as a spin button. Use type text with inputmode numeric, or type tel.`,
            `Le champ «\u202F${fieldName(n)}\u202F» est de type number et semble contenir un numéro de téléphone, un code postal ou un autre code. Un champ numérique supprime les zéros de tête, change de valeur avec une flèche ou la molette, et est annoncé comme un bouton rotatif. Utilisez le type text avec inputmode numeric, ou le type tel.`,
          );
        }
      }

      if (n.tag === 'select' && n.attrs['multiple'] !== undefined) {
        add(
          n,
          'multiple-select',
          'unknown',
          `The list “${fieldName(n)}” lets people pick several options. That needs Ctrl or Shift with a click or the arrow keys, which few people know and which is hard with one hand, a switch or a touch screen. Check whether a group of checkboxes works better.`,
          `La liste «\u202F${fieldName(n)}\u202F» permet de choisir plusieurs options. Il faut pour cela tenir Ctrl ou Maj avec un clic ou les flèches, ce que peu de gens savent et qui est difficile d’une seule main, avec un contacteur ou sur un écran tactile. Contrôlez si un groupe de cases à cocher convient mieux.`,
        );
      }
    }

    if ((n.tag === 'button' && attrOf(n, 'type').toLowerCase() === 'reset') || (n.tag === 'input' && type === 'reset')) {
      checked++;
      add(
        n,
        'reset-button',
        'unknown',
        'This button clears the whole form at once, with no way back. It is easy to press by mistake, more so with a tremor, a switch or a small touch screen. Check that it is needed, and that it is not right beside the button that sends the form.',
        'Ce bouton efface tout le formulaire d’un coup, sans retour possible. On l’actionne facilement par erreur, surtout avec des tremblements, un contacteur ou un petit écran tactile. Contrôlez qu’il est nécessaire, et qu’il n’est pas juste à côté du bouton qui envoie le formulaire.',
      );
    }

    if (n.tag === 'optgroup') {
      checked++;
      if (attrOf(n, 'label') === '') {
        add(
          n,
          'group-no-label',
          'fail',
          'This option group has no label. Screen readers announce a group with no name, and sighted people see a gap in the list. Add a label attribute that says what the options have in common.',
          'Ce groupe d’options n’a pas de label. Les lecteurs d’écran annoncent un groupe sans nom, et à l’écran on voit un vide dans la liste. Ajoutez un attribut label qui dit ce que les options ont en commun.',
        );
      }
    }
  }

  for (const form of nodes) {
    if (form.tag !== 'form' || isHiddenNode(nodes, form)) continue;
    checked++;
    const id = attrOf(form, 'id');
    const owned = nodes.filter((n) => {
      const explicit = attrOf(n, 'form');
      if (explicit !== '') return id !== '' && explicit === id;
      return ancestorsOf(nodes, n).some((a) => a.index === form.index);
    });
    const fields = owned.filter((n) => FIELD_TAGS.has(n.tag) && !(n.tag === 'input' && NOT_FIELDS.has(inputType(n))));
    if (fields.length > 0 && !owned.some(isSubmit)) {
      add(
        form,
        'no-submit',
        'unknown',
        `This form has ${fields.length} ${fields.length === 1 ? 'field' : 'fields'} and no button that sends it. If it sends itself when a value changes, people who read slowly or use a keyboard are moved on before they are done. Check how it is sent, and add a button.`,
        `Ce formulaire a ${fields.length} ${fields.length === 1 ? 'champ' : 'champs'} et aucun bouton pour l’envoyer. S’il s’envoie seul dès qu’une valeur change, les personnes qui lisent lentement ou utilisent un clavier sont emmenées ailleurs avant d’avoir fini. Contrôlez comment il est envoyé, et ajoutez un bouton.`,
      );
    }
  }
  return { checked, entries: inFileOrder(entries) };
}
