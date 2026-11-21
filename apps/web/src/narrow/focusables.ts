import { isNativeControl } from './handlers.js';
import { parseHtml, type HtmlNode } from './htmllint.js';
import { attrOf, inFileOrder, isHiddenNode, nodeLabel, tokensOf } from './markup.js';
import { clip, t, type CheckResult, type Entry, type EntryStatus } from './types.js';

/**
 * Attributes that put an element in reach of the keyboard (WCAG 4.1.2 and
 * 2.1.1). A tabindex that is not a whole number is ignored, an access key
 * longer than one character never fires, and a second autofocus on a page is
 * dropped. Those are measured in the markup and fail. A plain element made
 * focusable with tabindex 0 and no role is announced as nothing, and an
 * editable region with no name is announced as "edit text" alone; a script
 * can add what is missing, so they are UNKNOWN. A tabindex above 0 and a
 * repeated access key are static-html rules.
 */

export type FocusableRule = 'tabindex-invalid' | 'accesskey-long' | 'several-autofocus' | 'focusable-no-role' | 'editable-unnamed';

export const FOCUSABLE_RULES: readonly FocusableRule[] = ['tabindex-invalid', 'accesskey-long', 'several-autofocus', 'focusable-no-role', 'editable-unnamed'];

/** Elements that are focusable or meaningful by themselves, where tabindex 0 needs no role. */
const SELF_DESCRIBING = new Set(['a', 'area', 'button', 'input', 'select', 'textarea', 'summary', 'details', 'iframe', 'audio', 'video', 'object', 'embed', 'dialog', 'main', 'pre', 'table', 'canvas', 'svg', 'img']);
const HEADING = /^h[1-6]$/;
const named = (n: HtmlNode): boolean => attrOf(n, 'aria-label') !== '' || attrOf(n, 'aria-labelledby') !== '' || attrOf(n, 'title') !== '';
const length = (s: string): number => [...s].length;

export function auditFocusables(html: string): CheckResult {
  const { nodes } = parseHtml(html);
  const entries: Entry[] = [];
  let checked = 0;
  const add = (n: HtmlNode, rule: FocusableRule, status: EntryStatus, en: string, fr: string): void => {
    entries.push({ check: 'focusables', id: nodeLabel(n), status, rule, message: t(en, fr) });
  };
  const autofocused: HtmlNode[] = [];
  const labelled = new Set(nodes.filter((n) => n.tag === 'label' && attrOf(n, 'for') !== '').map((n) => attrOf(n, 'for')));

  for (const n of nodes) {
    const a = n.attrs;
    const editable = a['contenteditable'] !== undefined && attrOf(n, 'contenteditable').toLowerCase() !== 'false';
    if (a['tabindex'] === undefined && a['accesskey'] === undefined && a['autofocus'] === undefined && !editable) continue;
    if (isHiddenNode(nodes, n)) continue;
    checked++;
    if (a['autofocus'] !== undefined) autofocused.push(n);

    const tab = a['tabindex'];
    if (tab !== undefined && !/^-?\d+$/.test(tab.trim())) {
      add(
        n,
        'tabindex-invalid',
        'fail',
        `tabindex is set to “${clip(tab, 16)}”, which is not a whole number. Browsers ignore it, so the element is ${isNativeControl(n) ? 'in the Tab order whatever was meant' : 'not reachable with the keyboard'}. Use 0 to add it to the Tab order, or -1 to take it out.`,
        `tabindex vaut «\u202F${clip(tab, 16)}\u202F», qui n’est pas un nombre entier. Les navigateurs l’ignorent\u00A0: l’élément ${isNativeControl(n) ? 'reste dans l’ordre de tabulation, quelle que soit l’intention' : 'n’est pas atteignable au clavier'}. Utilisez 0 pour l’ajouter à l’ordre de tabulation, ou -1 pour l’en retirer.`,
      );
    }

    const key = a['accesskey'];
    if (key !== undefined) {
      const long = tokensOf(key).filter((x) => length(x) !== 1);
      if (key.trim() === '' || long.length > 0) {
        add(
          n,
          'accesskey-long',
          'fail',
          key.trim() === ''
            ? `This ${n.tag} has an empty accesskey, which does nothing. Remove it, or give it one character.`
            : `accesskey is set to “${clip(key, 16)}”. Each access key must be a single character, so “${clip(long[0] ?? '', 12)}” never fires. Use one character, or several separated by spaces.`,
          key.trim() === ''
            ? `Ce ${n.tag} a un accesskey vide, qui ne fait rien. Retirez-le, ou donnez-lui un caractère.`
            : `accesskey vaut «\u202F${clip(key, 16)}\u202F». Chaque touche d’accès doit être un seul caractère\u00A0: «\u202F${clip(long[0] ?? '', 12)}\u202F» ne se déclenche donc jamais. Utilisez un caractère, ou plusieurs séparés par des espaces.`,
        );
      }
    }

    const role = attrOf(n, 'role');
    if (tab !== undefined && /^\d+$/.test(tab.trim()) && role === '' && !editable && !SELF_DESCRIBING.has(n.tag) && !HEADING.test(n.tag) && !n.tag.includes('-') && !named(n)) {
      add(
        n,
        'focusable-no-role',
        'unknown',
        `This ${n.tag} takes keyboard focus and has no role and no name. A screen reader stops on it and announces only its text, or nothing, with no word on what it is or what a key press does. If it is a control, give it a role and key handling, or use a button. If it is only a scrolling area, give it a name.`,
        `Ce ${n.tag} reçoit le focus clavier sans rôle ni nom. Un lecteur d’écran s’y arrête et n’annonce que son texte, ou rien, sans dire ce que c’est ni ce que fait une touche. Si c’est une commande, donnez-lui un rôle et une gestion des touches, ou utilisez un bouton. Si ce n’est qu’une zone à faire défiler, donnez-lui un nom.`,
      );
    }

    if (editable && !named(n) && !(attrOf(n, 'id') !== '' && labelled.has(attrOf(n, 'id'))) && n.tag !== 'body' && n.tag !== 'html') {
      add(
        n,
        'editable-unnamed',
        'unknown',
        `This ${n.tag} can be edited and has no name${role === '' ? ' and no role' : ''}. A screen reader announces an edit area with nothing to say what to write there. Add role textbox with aria-multiline where it fits, and a name with aria-label or aria-labelledby.`,
        `Ce ${n.tag} est modifiable sans nom${role === '' ? ' ni rôle' : ''}. Un lecteur d’écran annonce une zone de saisie sans rien dire de ce qu’il faut y écrire. Ajoutez le rôle textbox, avec aria-multiline au besoin, et un nom par aria-label ou aria-labelledby.`,
      );
    }
  }

  const second = autofocused[1];
  if (second) {
    add(
      second,
      'several-autofocus',
      'fail',
      `${autofocused.length} elements on this page have autofocus. Only one takes focus when the page loads and the rest are ignored, so focus may not land where it was meant to, and can skip content people need first. Keep one, or none.`,
      `${autofocused.length} éléments de cette page portent autofocus. Un seul reçoit le focus au chargement et les autres sont ignorés\u00A0: le focus n’arrive pas forcément là où on le voulait, et peut sauter un contenu dont on a besoin d’abord. Gardez-en un seul, ou aucun.`,
    );
  }
  return { checked, entries: inFileOrder(entries) };
}
