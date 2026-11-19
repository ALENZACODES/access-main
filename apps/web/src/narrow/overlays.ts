import { parseHtml, type HtmlNode } from './htmllint.js';
import { attrOf, idIndex, inFileOrder, nodeLabel, tokensOf } from './markup.js';
import { clip, t, type CheckResult, type Entry, type EntryStatus } from './types.js';

/**
 * Dialogs and popovers written in the markup (WCAG 4.1.2 and 2.1.2). A
 * button that names a popover that is not there, or is not a popover, does
 * nothing. A popover value the browser does not know is read as the manual
 * kind, which does not close with Escape or an outside click. aria-modal on something that is
 * not a dialog hides the rest of the page from some screen readers and not
 * from others. Those are measured in the markup and fail. A dialog with no
 * button to close it can still close with Escape or a script, so it is
 * UNKNOWN. A dialog with no name is a static-html rule.
 */

export type OverlayRule = 'popovertarget-missing' | 'popovertarget-not-popover' | 'popover-invalid' | 'modal-not-dialog' | 'dialog-no-close';

export const OVERLAY_RULES: readonly OverlayRule[] = ['popovertarget-missing', 'popovertarget-not-popover', 'popover-invalid', 'modal-not-dialog', 'dialog-no-close'];

export const POPOVER_VALUES: ReadonlySet<string> = new Set(['', 'auto', 'manual', 'hint']);
const DIALOG_ROLES = new Set(['dialog', 'alertdialog']);
const CLOSE_WORDS = /\b(?:close|dismiss|cancel|done|ok|fermer|annuler|terminer|quitter)\b|[×✕✖]/iu;

export function auditOverlays(html: string): CheckResult {
  const { nodes } = parseHtml(html);
  const byId = idIndex(nodes);
  const entries: Entry[] = [];
  let checked = 0;
  const add = (n: HtmlNode, rule: OverlayRule, status: EntryStatus, en: string, fr: string): void => {
    entries.push({ check: 'overlays', id: nodeLabel(n), status, rule, message: t(en, fr) });
  };
  const inside = (n: HtmlNode): HtmlNode[] => {
    const out: HtmlNode[] = [];
    const stack = [...n.children];
    let guard = 0;
    while (stack.length > 0 && guard++ < 20000) {
      const c = nodes[stack.pop() ?? -1];
      if (!c) continue;
      out.push(c);
      stack.push(...c.children);
    }
    return out;
  };

  for (const n of nodes) {
    const role = tokensOf(attrOf(n, 'role').toLowerCase())[0] ?? '';

    const target = attrOf(n, 'popovertarget');
    if (n.attrs['popovertarget'] !== undefined && target !== '') {
      checked++;
      const found = byId.get(target);
      if (!found) {
        add(
          n,
          'popovertarget-missing',
          'fail',
          `This ${n.tag} opens the popover “${clip(target, 30)}”, and nothing on the page has that id. Pressing it does nothing, with no message. Add the id to the popover, or fix the name.`,
          `Ce ${n.tag} ouvre le popover «\u202F${clip(target, 30)}\u202F», et rien dans la page ne porte cet identifiant. L’actionner ne fait rien, sans aucun message. Ajoutez l’identifiant au popover, ou corrigez le nom.`,
        );
      } else if (found.attrs['popover'] === undefined) {
        add(
          n,
          'popovertarget-not-popover',
          'fail',
          `This ${n.tag} names “${clip(target, 30)}” as its popover, and that ${found.tag} has no popover attribute. Pressing the control does nothing. Add the popover attribute to the ${found.tag}.`,
          `Ce ${n.tag} désigne «\u202F${clip(target, 30)}\u202F» comme son popover, et ce ${found.tag} n’a pas d’attribut popover. Actionner la commande ne fait rien. Ajoutez l’attribut popover au ${found.tag}.`,
        );
      }
    }

    const popover = n.attrs['popover'];
    if (popover !== undefined) {
      checked++;
      if (!POPOVER_VALUES.has(popover.trim().toLowerCase())) {
        add(
          n,
          'popover-invalid',
          'fail',
          `popover is set to “${clip(popover, 20)}”, which browsers do not know. They fall back to the manual kind, which does not close with Escape or an outside click, so people can be left with a panel they cannot dismiss. Use auto, manual or hint.`,
          `popover vaut «\u202F${clip(popover, 20)}\u202F», que les navigateurs ne connaissent pas. Ils reviennent au type manual, qui ne se ferme ni avec Échap ni par un clic à l’extérieur\u00A0: on peut rester avec un panneau impossible à fermer. Utilisez auto, manual ou hint.`,
        );
      }
    }

    if (attrOf(n, 'aria-modal').toLowerCase() === 'true') {
      checked++;
      if (n.tag !== 'dialog' && !DIALOG_ROLES.has(role)) {
        add(
          n,
          'modal-not-dialog',
          'fail',
          `This ${n.tag} has aria-modal set to true and is not a dialog. Some screen readers then hide the rest of the page and others ignore the attribute, so what people can reach differs from one to the next. Add the role dialog with a name, or remove aria-modal.`,
          `Ce ${n.tag} porte aria-modal à true sans être une boîte de dialogue. Certains lecteurs d’écran cachent alors le reste de la page et d’autres ignorent l’attribut\u00A0: ce qu’on peut atteindre varie de l’un à l’autre. Ajoutez le rôle dialog avec un nom, ou retirez aria-modal.`,
        );
      }
    }

    if (n.tag === 'dialog' || DIALOG_ROLES.has(role)) {
      checked++;
      const within = inside(n);
      const controls = within.filter((c) => c.tag === 'button' || (c.tag === 'input' && ['button', 'submit', 'reset'].includes(attrOf(c, 'type').toLowerCase())) || (c.tag === 'a' && c.attrs['href'] !== undefined) || attrOf(c, 'role').toLowerCase() === 'button');
      const closes = controls.some((c) => CLOSE_WORDS.test(`${c.text} ${attrOf(c, 'aria-label')} ${attrOf(c, 'value')} ${attrOf(c, 'title')}`) || attrOf(c, 'formmethod').toLowerCase() === 'dialog' || attrOf(c, 'popovertargetaction').toLowerCase() === 'hide');
      const dialogForm = within.some((c) => c.tag === 'form' && attrOf(c, 'method').toLowerCase() === 'dialog');
      if (within.length > 0 && !closes && !(dialogForm && controls.length > 0)) {
        add(
          n,
          'dialog-no-close',
          'unknown',
          'No control inside this dialog reads as a way to close it. Escape may close it, but touch, switch and voice control users need a button they can see. Check how the dialog closes, and add a button named Close.',
          'Aucune commande de cette boîte de dialogue ne se lit comme un moyen de la fermer. La touche Échap la ferme peut-être, mais au toucher, au contacteur ou à la voix, il faut un bouton visible. Contrôlez comment la boîte se ferme, et ajoutez un bouton nommé Fermer.',
        );
      }
    }
  }
  return { checked, entries: inFileOrder(entries) };
}
