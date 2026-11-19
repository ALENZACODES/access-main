import { parseHtml, type HtmlNode } from './htmllint.js';
import { clip, t, type CheckResult, type Entry } from './types.js';

/**
 * Inline event handlers that tie an action to one kind of input (WCAG 2.1.1
 * keyboard, 2.5.2 pointer cancellation, 1.4.13 content on hover). It reads the
 * markup only: a handler added by a script is not seen, so a clean result says
 * nothing about those. A handler on an element can be fine when the page also
 * wires a key handler somewhere else, so every finding is UNKNOWN.
 */

export type HandlerRule = 'click-not-focusable' | 'click-no-key' | 'down-event' | 'hover-only' | 'double-click' | 'title-extra';

export const HANDLER_RULES: readonly HandlerRule[] = ['click-not-focusable', 'click-no-key', 'down-event', 'hover-only', 'double-click', 'title-extra'];

/** Elements a keyboard reaches and activates without help. */
const NATIVE = new Set(['button', 'select', 'textarea', 'summary', 'option']);
const INTERACTIVE_ROLES = new Set(['button', 'link', 'checkbox', 'radio', 'menuitem', 'menuitemcheckbox', 'menuitemradio', 'tab', 'switch', 'option', 'treeitem']);
const DOWN = ['onmousedown', 'onpointerdown', 'ontouchstart'];
const HOVER = ['onmouseover', 'onmouseenter', 'onmouseout', 'onmouseleave'];
const FOCUS = ['onfocus', 'onfocusin', 'onblur', 'onfocusout'];
const KEYS = ['onkeydown', 'onkeyup', 'onkeypress'];
const CLICK = ['onclick', 'onmouseup', 'onpointerup'];
/** Elements where a title is not extra information shown on hover. */
const TITLE_SKIP = new Set(['html', 'head', 'meta', 'link', 'style', 'script', 'title', 'iframe', 'svg', 'img', 'input', 'abbr', 'dfn', 'object', 'embed', 'area', 'th', 'td']);

const has = (n: HtmlNode, names: readonly string[]): string | null => {
  for (const x of names) if (n.attrs[x] !== undefined) return x;
  return null;
};

/** True when the keyboard reaches the element: a native control, or an element with tabindex 0 or more. */
export function isFocusable(n: HtmlNode): boolean {
  const ti = n.attrs['tabindex'];
  if (ti !== undefined && ti.trim() !== '' && Number(ti) >= 0) return true;
  if (n.attrs['disabled'] !== undefined) return false;
  if (NATIVE.has(n.tag)) return true;
  if (n.tag === 'a' || n.tag === 'area') return n.attrs['href'] !== undefined;
  if (n.tag === 'input') return (n.attrs['type'] ?? 'text').toLowerCase() !== 'hidden';
  return false;
}

/** True when the element is a control that handles Enter and Space itself. */
export function isNativeControl(n: HtmlNode): boolean {
  if (n.tag === 'a' || n.tag === 'area') return n.attrs['href'] !== undefined;
  if (n.tag === 'input') return (n.attrs['type'] ?? 'text').toLowerCase() !== 'hidden';
  return NATIVE.has(n.tag);
}

const words = (s: string): string[] => s.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];

const idOf = (n: HtmlNode): string => `${n.tag}${n.attrs['id'] ? '#' + n.attrs['id'] : ''}@L${n.line}`;

export function auditHandlers(html: string): CheckResult {
  const { nodes } = parseHtml(html);
  const entries: Entry[] = [];
  let checked = 0;
  const add = (n: HtmlNode, rule: HandlerRule, en: string, fr: string): void => {
    entries.push({ check: 'handlers', id: idOf(n), status: 'unknown', rule, message: t(en, fr) });
  };
  for (const n of nodes) {
    if (n.tag === 'script' || n.tag === 'style') continue;
    const click = has(n, CLICK);
    const down = has(n, DOWN);
    const hover = has(n, HOVER);
    const dbl = n.attrs['ondblclick'] !== undefined;
    const title = (n.attrs['title'] ?? '').trim();
    const titled = title !== '' && !TITLE_SKIP.has(n.tag) && n.text.trim() !== '';
    const touched = click || down || hover || dbl || titled || has(n, KEYS) || has(n, FOCUS);
    if (!touched) continue;
    checked++;
    const tag = `<${n.tag}>`;
    if (click && !isNativeControl(n)) {
      const role = (n.attrs['role'] ?? '').toLowerCase();
      if (!isFocusable(n)) {
        add(
          n,
          'click-not-focusable',
          `${tag} has an ${click} handler but the keyboard cannot reach it. Use a button or link, or add tabindex="0" and key handling.`,
          `${tag} a un gestionnaire ${click} mais le clavier ne peut pas l’atteindre. Utilisez un bouton ou un lien, ou ajoutez tabindex="0" et la gestion des touches.`,
        );
      } else if (!has(n, KEYS)) {
        add(
          n,
          'click-no-key',
          `${tag}${INTERACTIVE_ROLES.has(role) ? ` (role ${role})` : ''} has an ${click} handler and no key handler on the element. Enter and Space must also work.`,
          `${tag}${INTERACTIVE_ROLES.has(role) ? ` (rôle ${role})` : ''} a un gestionnaire ${click} et aucun gestionnaire de touche sur l’élément. Entrée et Espace doivent aussi fonctionner.`,
        );
      }
    }
    if (down && !(n.tag === 'input' || n.tag === 'textarea' || n.tag === 'select')) {
      add(
        n,
        'down-event',
        `${tag} acts on ${down}, the moment a finger or button goes down. A person cannot cancel by moving away. Act on the up event, or allow an undo.`,
        `${tag} agit sur ${down}, dès que le doigt ou le bouton s’abaisse. La personne ne peut pas annuler en s’éloignant. Agissez à la levée, ou permettez d’annuler.`,
      );
    }
    if (hover && !has(n, FOCUS)) {
      add(
        n,
        'hover-only',
        `${tag} reacts to ${hover} and has no focus handler. Keyboard and touch users never see what appears or changes.`,
        `${tag} réagit à ${hover} et n’a aucun gestionnaire de focus. Les utilisatrices et utilisateurs du clavier ou du tactile ne voient jamais ce qui apparaît ou change.`,
      );
    }
    if (dbl) {
      add(
        n,
        'double-click',
        `${tag} needs a double click. Offer a way to do the same with one click, a key or a button.`,
        `${tag} demande un double clic. Offrez un moyen de faire la même chose avec un clic, une touche ou un bouton.`,
      );
    }
    if (titled) {
      const own = new Set(words(n.text));
      const extra = words(title).filter((w) => !own.has(w));
      if (extra.length >= 3) {
        add(
          n,
          'title-extra',
          `${tag} has a title (“${clip(title, 40)}”) with words its text does not have. A title shows only on hover, so keyboard, touch and many screen reader users miss it. Put the information in the page.`,
          `${tag} a un titre («\u202F${clip(title, 40)}\u202F») avec des mots absents de son texte. Un titre ne s’affiche qu’au survol, donc les personnes au clavier, au tactile et plusieurs au lecteur d’écran le manquent. Mettez l’information dans la page.`,
        );
      }
    }
  }
  return { checked, entries };
}
