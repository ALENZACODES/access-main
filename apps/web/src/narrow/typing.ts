import { parseHtml, type HtmlNode } from './htmllint.js';
import { attrOf, inFileOrder, isHiddenNode, nodeLabel } from './markup.js';
import { clip, t, type CheckResult, type Entry, type EntryStatus } from './types.js';

/**
 * Attributes that choose the on-screen keyboard and the typing help of a
 * field (WCAG 1.3.5, and good practice for people who type slowly). A type,
 * an inputmode, an enterkeyhint or an autocapitalize value the browser does
 * not know is ignored, so the person gets the full letter keyboard for a
 * phone number, or capitals in an email address. Those are measured in the
 * markup and fail. An inputmode that disagrees with the type, and spelling
 * correction left on for a name, an email address or a code, depend on the
 * device, so they are UNKNOWN. Missing autocomplete tokens are static-html
 * rules, and a text field that wants an email or phone keyboard belongs to
 * the forms check.
 */

export type TypingRule = 'type-invalid' | 'inputmode-invalid' | 'enterkeyhint-invalid' | 'autocapitalize-invalid' | 'inputmode-conflict' | 'correction-on-code';

export const TYPING_RULES: readonly TypingRule[] = ['type-invalid', 'inputmode-invalid', 'enterkeyhint-invalid', 'autocapitalize-invalid', 'inputmode-conflict', 'correction-on-code'];

export const INPUT_TYPES: ReadonlySet<string> = new Set([
  'button', 'checkbox', 'color', 'date', 'datetime-local', 'email', 'file', 'hidden', 'image', 'month', 'number', 'password', 'radio', 'range', 'reset',
  'search', 'submit', 'tel', 'text', 'time', 'url', 'week',
]);
export const INPUT_MODES: ReadonlySet<string> = new Set(['none', 'text', 'decimal', 'numeric', 'tel', 'search', 'email', 'url']);
export const ENTER_KEY_HINTS: ReadonlySet<string> = new Set(['enter', 'done', 'go', 'next', 'previous', 'search', 'send']);
export const AUTOCAPITALIZE: ReadonlySet<string> = new Set(['off', 'none', 'on', 'sentences', 'words', 'characters']);

/** The inputmode each type already implies. An explicit inputmode outside the list works against the type. */
const MODES_FOR_TYPE: Readonly<Record<string, readonly string[]>> = {
  email: ['email', 'text'],
  tel: ['tel', 'numeric'],
  url: ['url', 'text'],
  number: ['numeric', 'decimal'],
  search: ['search', 'text'],
};

/** Names and autocomplete tokens of values that are not ordinary words. */
const NOT_WORDS_NAME = /(?:^|[^a-z])(?:email|e-mail|courriel|username|user|login|identifiant|postal|postcode|zip|code|otp|pin|nip|coupon|promo|serial|licence|license|plate|iban|url|website|handle)(?:[^a-z]|$)/i;
const NOT_WORDS_TOKEN = new Set(['email', 'username', 'postal-code', 'one-time-code', 'cc-number', 'cc-csc', 'url', 'given-name', 'family-name', 'name', 'additional-name', 'nickname']);
const TYPED = new Set(['text', 'search']);

const list = (set: ReadonlySet<string>): string => [...set].join(', ');
const fieldName = (n: HtmlNode): string => clip(attrOf(n, 'aria-label') || attrOf(n, 'name') || attrOf(n, 'id') || n.tag, 30);

export function auditTyping(html: string): CheckResult {
  const { nodes } = parseHtml(html);
  const entries: Entry[] = [];
  let checked = 0;
  const add = (n: HtmlNode, rule: TypingRule, status: EntryStatus, en: string, fr: string): void => {
    entries.push({ check: 'typing', id: nodeLabel(n), status, rule, message: t(en, fr) });
  };

  for (const n of nodes) {
    const a = n.attrs;
    const isInput = n.tag === 'input';
    const editable = isInput || n.tag === 'textarea' || a['contenteditable'] !== undefined;
    if (!editable && a['inputmode'] === undefined && a['enterkeyhint'] === undefined && a['autocapitalize'] === undefined) continue;
    if (isHiddenNode(nodes, n)) continue;
    checked++;

    const rawType = attrOf(n, 'type');
    const type = rawType.toLowerCase();
    if (isInput && rawType !== '' && !INPUT_TYPES.has(type)) {
      add(
        n,
        'type-invalid',
        'fail',
        `The field “${fieldName(n)}” has the type “${clip(rawType, 20)}”, which is not an input type. Browsers treat it as plain text, so a phone shows the letter keyboard and no help with the format. Use a real type, such as tel, email, url, number or date.`,
        `Le champ «\u202F${fieldName(n)}\u202F» a le type «\u202F${clip(rawType, 20)}\u202F», qui n’est pas un type de champ. Les navigateurs le traitent comme du texte simple\u00A0: un téléphone affiche le clavier des lettres, sans aide pour le format. Utilisez un vrai type, comme tel, email, url, number ou date.`,
      );
    }

    const mode = a['inputmode'];
    if (mode !== undefined && !INPUT_MODES.has(mode.trim().toLowerCase())) {
      add(
        n,
        'inputmode-invalid',
        'fail',
        `inputmode is set to “${clip(mode, 20)}”, which browsers do not know, so the on-screen keyboard stays the default one. Allowed: ${list(INPUT_MODES)}.`,
        `inputmode vaut «\u202F${clip(mode, 20)}\u202F», que les navigateurs ne connaissent pas\u00A0: le clavier à l’écran reste celui par défaut. Valeurs permises\u00A0: ${list(INPUT_MODES)}.`,
      );
    } else if (mode !== undefined && isInput) {
      const fits = MODES_FOR_TYPE[type || 'text'];
      const m = mode.trim().toLowerCase();
      if (fits && m !== 'none' && !fits.includes(m)) {
        add(
          n,
          'inputmode-conflict',
          'unknown',
          `The field “${fieldName(n)}” is of type ${type} and asks for the ${m} keyboard. The two disagree, and phones differ on which one they follow, so some people get a keyboard without the keys they need. Check on a phone, then keep the one that fits the value.`,
          `Le champ «\u202F${fieldName(n)}\u202F» est de type ${type} et demande le clavier ${m}. Les deux se contredisent, et les téléphones ne suivent pas tous le même\u00A0: certaines personnes obtiennent un clavier sans les touches nécessaires. Contrôlez sur un téléphone, puis gardez celui qui convient à la valeur.`,
        );
      }
    }

    const hint = a['enterkeyhint'];
    if (hint !== undefined && !ENTER_KEY_HINTS.has(hint.trim().toLowerCase())) {
      add(
        n,
        'enterkeyhint-invalid',
        'fail',
        `enterkeyhint is set to “${clip(hint, 20)}”, which browsers do not know, so the Enter key of the on-screen keyboard keeps its default label. Allowed: ${list(ENTER_KEY_HINTS)}.`,
        `enterkeyhint vaut «\u202F${clip(hint, 20)}\u202F», que les navigateurs ne connaissent pas\u00A0: la touche Entrée du clavier à l’écran garde son libellé par défaut. Valeurs permises\u00A0: ${list(ENTER_KEY_HINTS)}.`,
      );
    }

    const caps = a['autocapitalize'];
    if (caps !== undefined && !AUTOCAPITALIZE.has(caps.trim().toLowerCase())) {
      add(
        n,
        'autocapitalize-invalid',
        'fail',
        `autocapitalize is set to “${clip(caps, 20)}”, which browsers do not know, so capitals are added by the default rule. Allowed: ${list(AUTOCAPITALIZE)}.`,
        `autocapitalize vaut «\u202F${clip(caps, 20)}\u202F», que les navigateurs ne connaissent pas\u00A0: les majuscules sont ajoutées selon la règle par défaut. Valeurs permises\u00A0: ${list(AUTOCAPITALIZE)}.`,
      );
    }

    if (isInput && TYPED.has(type || 'text')) {
      const hintText = `${attrOf(n, 'name')} ${attrOf(n, 'id')}`;
      const token = attrOf(n, 'autocomplete').toLowerCase().split(/\s+/).pop() ?? '';
      const notWords = NOT_WORDS_NAME.test(hintText) || NOT_WORDS_TOKEN.has(token);
      const spellOff = attrOf(n, 'spellcheck').toLowerCase() === 'false';
      const capsOff = ['off', 'none'].includes(attrOf(n, 'autocapitalize').toLowerCase());
      const correctOff = attrOf(n, 'autocorrect').toLowerCase() === 'off';
      if (notWords && !spellOff && !capsOff && !correctOff) {
        add(
          n,
          'correction-on-code',
          'unknown',
          `The field “${fieldName(n)}” looks like it takes a name, an address or a code, and typing help is left on. A phone can then change the entry to a dictionary word or add a capital, which is easy to miss with a screen reader or with zoom. Check on a phone, and turn the help off with autocapitalize and spellcheck.`,
          `Le champ «\u202F${fieldName(n)}\u202F» semble attendre un nom, une adresse ou un code, et l’aide à la saisie reste active. Un téléphone peut alors remplacer la saisie par un mot du dictionnaire ou ajouter une majuscule, ce qui passe facilement inaperçu au lecteur d’écran ou avec le zoom. Contrôlez sur un téléphone, et coupez cette aide avec autocapitalize et spellcheck.`,
        );
      }
    }
  }
  return { checked, entries: inFileOrder(entries) };
}
