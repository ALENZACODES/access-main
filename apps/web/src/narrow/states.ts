import { isFocusable, isNativeControl } from './handlers.js';
import { parseHtml, type HtmlNode } from './htmllint.js';
import { ancestorsOf, attrOf, inFileOrder, isHiddenNode, nodeLabel, tokensOf } from './markup.js';
import { t, type CheckResult, type Entry, type EntryStatus } from './types.js';

/**
 * States written twice or in the wrong place (WCAG 4.1.2). HTML has its own
 * disabled, required, readonly, hidden and checked states, and ARIA has a
 * second set. When the two disagree, or when a state sits on an element that
 * cannot have it, what a person sees and what assistive technology announces
 * drift apart. A contradiction in the markup and a disabled attribute on an
 * element that ignores it are measured, so they fail. The rest can be a
 * deliberate pattern, so it is UNKNOWN.
 */

export type StateRule = 'disabled-no-effect' | 'state-conflict' | 'aria-disabled-link' | 'aria-repeats-native' | 'readonly-no-effect' | 'tabindex-removed' | 'state-not-control';

export const STATE_RULES: readonly StateRule[] = [
  'disabled-no-effect', 'state-conflict', 'aria-disabled-link', 'aria-repeats-native', 'readonly-no-effect', 'tabindex-removed', 'state-not-control',
];

/** Elements on which the disabled attribute works. */
const TAKES_DISABLED = new Set(['button', 'input', 'select', 'textarea', 'fieldset', 'optgroup', 'option', 'link', 'style']);
/** Input types that ignore readonly. */
const IGNORES_READONLY = new Set(['checkbox', 'radio', 'range', 'color', 'file', 'button', 'submit', 'reset', 'image', 'hidden']);
/** Native attribute and the ARIA state that says the same thing. */
const PAIRS: ReadonlyArray<readonly [string, string]> = [
  ['disabled', 'aria-disabled'],
  ['required', 'aria-required'],
  ['readonly', 'aria-readonly'],
  ['hidden', 'aria-hidden'],
  ['checked', 'aria-checked'],
];
/** Containers that move focus inside themselves with the arrow keys, where tabindex -1 on a control is the pattern. */
const ROVING = new Set(['tablist', 'toolbar', 'menu', 'menubar', 'listbox', 'grid', 'treegrid', 'tree', 'radiogroup', 'combobox']);
const CONTROL_STATES = ['aria-expanded', 'aria-pressed', 'aria-haspopup'] as const;

const inputType = (n: HtmlNode): string => (attrOf(n, 'type') || 'text').toLowerCase();

export function auditStates(html: string): CheckResult {
  const { nodes } = parseHtml(html);
  const entries: Entry[] = [];
  let checked = 0;
  const add = (n: HtmlNode, rule: StateRule, status: EntryStatus, en: string, fr: string): void => {
    entries.push({ check: 'states', id: nodeLabel(n), status, rule, message: t(en, fr) });
  };

  for (const n of nodes) {
    const a = n.attrs;
    const stateful = PAIRS.some(([native, aria]) => a[native] !== undefined || a[aria] !== undefined) || a['tabindex'] !== undefined ||
      CONTROL_STATES.some((s) => a[s] !== undefined) || a['aria-selected'] !== undefined;
    if (!stateful) continue;
    checked++;

    if (a['disabled'] !== undefined && !TAKES_DISABLED.has(n.tag) && !n.tag.includes('-')) {
      add(
        n,
        'disabled-no-effect',
        'fail',
        `The disabled attribute does nothing on a ${n.tag}. The element still works with the keyboard and the mouse and is not announced as unavailable, whatever a style sheet makes it look like. Use a button, or aria-disabled with a script that blocks the action.`,
        `L’attribut disabled n’a aucun effet sur un ${n.tag}. L’élément fonctionne toujours au clavier et à la souris et n’est pas annoncé comme indisponible, quelle que soit l’apparence que lui donne une feuille de style. Utilisez un bouton, ou aria-disabled avec un script qui bloque l’action.`,
      );
    }

    for (const [native, aria] of PAIRS) {
      if (a[native] === undefined || attrOf(n, aria).toLowerCase() !== 'false') continue;
      if (native === 'disabled' && !TAKES_DISABLED.has(n.tag)) continue;
      add(
        n,
        'state-conflict',
        'fail',
        `This ${n.tag} has the attribute ${native} and also ${aria} set to false. The two say opposite things, and browsers and screen readers do not agree on which one wins. Keep the HTML attribute and remove ${aria}.`,
        `Ce ${n.tag} porte l’attribut ${native} et aussi ${aria} à false. Les deux disent le contraire, et navigateurs et lecteurs d’écran ne s’accordent pas sur celui qui l’emporte. Gardez l’attribut HTML et retirez ${aria}.`,
      );
    }

    if (n.tag === 'a' && a['href'] !== undefined && attrOf(n, 'aria-disabled').toLowerCase() === 'true') {
      add(
        n,
        'aria-disabled-link',
        'unknown',
        'This link is announced as unavailable through aria-disabled and still has its href, so Enter or a click follows it. Check that a script blocks it, or remove the href while the link is off.',
        'Ce lien est annoncé comme indisponible par aria-disabled et garde son href\u00A0: la touche Entrée ou un clic le suit. Contrôlez qu’un script le bloque, ou retirez le href tant que le lien est inactif.',
      );
    }

    const nativeToggle = n.tag === 'input' && (inputType(n) === 'checkbox' || inputType(n) === 'radio') && a['role'] === undefined;
    if ((nativeToggle && a['aria-checked'] !== undefined) || (n.tag === 'option' && a['aria-selected'] !== undefined)) {
      const which = n.tag === 'option' ? 'aria-selected' : 'aria-checked';
      add(
        n,
        'aria-repeats-native',
        'unknown',
        `This ${n.tag === 'option' ? 'option' : inputType(n)} already tells assistive technology its state, and it also has ${which}. Browsers ignore the ARIA copy, and it goes stale as soon as a person changes the control. Remove ${which}.`,
        `Ce ${n.tag === 'option' ? 'option' : inputType(n)} indique déjà son état aux technologies d’assistance, et porte en plus ${which}. Les navigateurs ignorent la copie ARIA, qui devient fausse dès qu’une personne modifie la commande. Retirez ${which}.`,
      );
    }

    if (a['readonly'] !== undefined && ((n.tag === 'input' && IGNORES_READONLY.has(inputType(n))) || n.tag === 'select')) {
      const what = n.tag === 'select' ? 'select' : `input of type ${inputType(n)}`;
      const quoi = n.tag === 'select' ? 'select' : `input de type ${inputType(n)}`;
      add(
        n,
        'readonly-no-effect',
        'unknown',
        `The readonly attribute is ignored on a ${what}: a person can still change it. If the value must not change, check how that is enforced, and say in text that it is fixed.`,
        `L’attribut readonly est ignoré sur un ${quoi}\u00A0: une personne peut toujours le modifier. Si la valeur ne doit pas changer, contrôlez comment cela est assuré, et dites dans le texte qu’elle est fixe.`,
      );
    }

    if (attrOf(n, 'tabindex') === '-1' && isNativeControl(n) && a['disabled'] === undefined && !isHiddenNode(nodes, n)) {
      const roving = [n, ...ancestorsOf(nodes, n)].some((x) => tokensOf((x.attrs['role'] ?? '').toLowerCase()).some((r) => ROVING.has(r) || r === 'tab' || r === 'option' || r === 'menuitem' || r === 'gridcell' || r === 'treeitem' || r === 'radio'));
      if (!roving) {
        add(
          n,
          'tabindex-removed',
          'unknown',
          `This ${n.tag} has tabindex -1, which takes it out of the Tab order. Unless arrow keys or another control reach it, keyboard users cannot use it. Check with the keyboard.`,
          `Ce ${n.tag} porte tabindex -1, ce qui le retire de l’ordre de tabulation. Si ni les flèches ni une autre commande n’y mènent, on ne peut pas l’utiliser au clavier. Contrôlez au clavier.`,
        );
      }
    }

    const states = CONTROL_STATES.filter((s) => a[s] !== undefined && attrOf(n, s).toLowerCase() !== 'false');
    if (states.length > 0 && !isFocusable(n) && a['role'] === undefined && !n.tag.includes('-') && n.tag !== 'details' && n.tag !== 'summary') {
      add(
        n,
        'state-not-control',
        'unknown',
        `This ${n.tag} has ${states.join(', ')}, a state of a control, and the keyboard cannot reach it. If it opens or toggles something, make it a button. If a button inside it does, move the state to that button.`,
        `Ce ${n.tag} porte ${states.join(', ')}, un état de commande, et le clavier ne peut pas l’atteindre. S’il ouvre ou bascule quelque chose, faites-en un bouton. Si c’est un bouton à l’intérieur qui le fait, déplacez l’état sur ce bouton.`,
      );
    }
  }
  return { checked, entries: inFileOrder(entries) };
}
