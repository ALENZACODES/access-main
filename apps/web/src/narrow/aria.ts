import { isFocusable } from './handlers.js';
import { parseHtml, type HtmlNode } from './htmllint.js';
import { ancestorsOf, attrOf, inFileOrder, listBoth, nodeLabel, tokensOf } from './markup.js';
import { clip, t, type CheckResult, type Entry, type EntryStatus } from './types.js';

/**
 * ARIA roles, states and properties written in the markup (WCAG 4.1.2). A role
 * that does not exist, a misspelled aria attribute or a value outside the
 * allowed list is ignored by the browser, so the control is announced as
 * something else or as nothing. Those are measured in the markup and fail.
 * A role that only repeats what the element already is, a role of
 * presentation on something the keyboard reaches and a name on a plain div or
 * span need a person to look, so they are UNKNOWN. The role and attribute
 * lists follow WAI-ARIA 1.2, with the additions of the 1.3 draft accepted.
 */

export type AriaRule =
  | 'unknown-role'
  | 'abstract-role'
  | 'unknown-attribute'
  | 'bad-value'
  | 'missing-required'
  | 'missing-parent'
  | 'hidden-body'
  | 'redundant-role'
  | 'presentation-focusable'
  | 'name-on-generic';

export const ARIA_RULES: readonly AriaRule[] = [
  'unknown-role', 'abstract-role', 'unknown-attribute', 'bad-value', 'missing-required', 'missing-parent',
  'hidden-body', 'redundant-role', 'presentation-focusable', 'name-on-generic',
];

/** Concrete roles of WAI-ARIA 1.2, plus the roles the 1.3 draft adds. */
export const ARIA_ROLES: ReadonlySet<string> = new Set([
  'alert', 'alertdialog', 'application', 'article', 'banner', 'blockquote', 'button', 'caption', 'cell', 'checkbox', 'code',
  'columnheader', 'combobox', 'complementary', 'contentinfo', 'definition', 'deletion', 'dialog', 'directory', 'document',
  'emphasis', 'feed', 'figure', 'form', 'generic', 'grid', 'gridcell', 'group', 'heading', 'img', 'insertion', 'link', 'list',
  'listbox', 'listitem', 'log', 'main', 'marquee', 'math', 'menu', 'menubar', 'menuitem', 'menuitemcheckbox', 'menuitemradio',
  'meter', 'navigation', 'none', 'note', 'option', 'paragraph', 'presentation', 'progressbar', 'radio', 'radiogroup', 'region',
  'row', 'rowgroup', 'rowheader', 'scrollbar', 'search', 'searchbox', 'separator', 'slider', 'spinbutton', 'status', 'strong',
  'subscript', 'superscript', 'switch', 'tab', 'table', 'tablist', 'tabpanel', 'term', 'textbox', 'time', 'timer', 'toolbar',
  'tooltip', 'tree', 'treegrid', 'treeitem',
  'comment', 'image', 'mark', 'suggestion',
]);

/** Roles that exist only to define other roles. Authors must not use them. */
export const ABSTRACT_ROLES: ReadonlySet<string> = new Set([
  'command', 'composite', 'input', 'landmark', 'range', 'roletype', 'section', 'sectionhead', 'select', 'structure', 'widget', 'window',
]);

type ValueKind =
  | { readonly kind: 'tokens'; readonly values: readonly string[] }
  | { readonly kind: 'token-list'; readonly values: readonly string[] }
  | { readonly kind: 'integer'; readonly min: number }
  | { readonly kind: 'number' }
  | { readonly kind: 'free' };

const BOOL: ValueKind = { kind: 'tokens', values: ['true', 'false'] };
const BOOL_UNDEFINED: ValueKind = { kind: 'tokens', values: ['true', 'false', 'undefined'] };
const TRISTATE: ValueKind = { kind: 'tokens', values: ['true', 'false', 'mixed', 'undefined'] };
const FREE: ValueKind = { kind: 'free' };
const POSITIVE: ValueKind = { kind: 'integer', min: 1 };
const COUNT: ValueKind = { kind: 'integer', min: -1 };
const NUMBER: ValueKind = { kind: 'number' };

/** Every state and property of WAI-ARIA 1.2 and the 1.3 draft, with the kind of value it takes. */
export const ARIA_ATTRIBUTES: Readonly<Record<string, ValueKind>> = {
  'aria-activedescendant': FREE,
  'aria-atomic': BOOL,
  'aria-autocomplete': { kind: 'tokens', values: ['inline', 'list', 'both', 'none'] },
  'aria-braillelabel': FREE,
  'aria-brailleroledescription': FREE,
  'aria-busy': BOOL,
  'aria-checked': TRISTATE,
  'aria-colcount': COUNT,
  'aria-colindex': POSITIVE,
  'aria-colindextext': FREE,
  'aria-colspan': POSITIVE,
  'aria-controls': FREE,
  'aria-current': { kind: 'tokens', values: ['page', 'step', 'location', 'date', 'time', 'true', 'false'] },
  'aria-describedby': FREE,
  'aria-description': FREE,
  'aria-details': FREE,
  'aria-disabled': BOOL,
  'aria-dropeffect': { kind: 'token-list', values: ['copy', 'execute', 'link', 'move', 'none', 'popup'] },
  'aria-errormessage': FREE,
  'aria-expanded': BOOL_UNDEFINED,
  'aria-flowto': FREE,
  'aria-grabbed': BOOL_UNDEFINED,
  'aria-haspopup': { kind: 'tokens', values: ['false', 'true', 'menu', 'listbox', 'tree', 'grid', 'dialog'] },
  'aria-hidden': BOOL_UNDEFINED,
  'aria-invalid': { kind: 'tokens', values: ['true', 'false', 'grammar', 'spelling'] },
  'aria-keyshortcuts': FREE,
  'aria-label': FREE,
  'aria-labelledby': FREE,
  'aria-level': POSITIVE,
  'aria-live': { kind: 'tokens', values: ['off', 'polite', 'assertive'] },
  'aria-modal': BOOL,
  'aria-multiline': BOOL,
  'aria-multiselectable': BOOL,
  'aria-orientation': { kind: 'tokens', values: ['horizontal', 'vertical', 'undefined'] },
  'aria-owns': FREE,
  'aria-placeholder': FREE,
  'aria-posinset': POSITIVE,
  'aria-pressed': TRISTATE,
  'aria-readonly': BOOL,
  'aria-relevant': { kind: 'token-list', values: ['additions', 'removals', 'text', 'all'] },
  'aria-required': BOOL,
  'aria-roledescription': FREE,
  'aria-rowcount': COUNT,
  'aria-rowindex': POSITIVE,
  'aria-rowindextext': FREE,
  'aria-rowspan': { kind: 'integer', min: 0 },
  'aria-selected': BOOL_UNDEFINED,
  'aria-setsize': COUNT,
  'aria-sort': { kind: 'tokens', values: ['ascending', 'descending', 'none', 'other'] },
  'aria-valuemax': NUMBER,
  'aria-valuemin': NUMBER,
  'aria-valuenow': NUMBER,
  'aria-valuetext': FREE,
};

/** States a role must carry, because the browser cannot work them out. */
export const REQUIRED_STATES: Readonly<Record<string, readonly string[]>> = {
  checkbox: ['aria-checked'],
  radio: ['aria-checked'],
  switch: ['aria-checked'],
  menuitemcheckbox: ['aria-checked'],
  menuitemradio: ['aria-checked'],
  combobox: ['aria-expanded'],
  heading: ['aria-level'],
  slider: ['aria-valuenow'],
  meter: ['aria-valuenow'],
  scrollbar: ['aria-controls', 'aria-valuenow'],
};

/** Roles that only mean something inside another role. */
export const REQUIRED_PARENTS: Readonly<Record<string, readonly string[]>> = {
  tab: ['tablist'],
  option: ['listbox', 'group'],
  menuitem: ['menu', 'menubar', 'group'],
  menuitemcheckbox: ['menu', 'menubar', 'group'],
  menuitemradio: ['menu', 'menubar', 'group'],
  row: ['table', 'grid', 'treegrid', 'rowgroup'],
  rowgroup: ['table', 'grid', 'treegrid'],
  cell: ['row'],
  gridcell: ['row'],
  columnheader: ['row'],
  rowheader: ['row'],
  listitem: ['list'],
  treeitem: ['tree', 'group'],
};

/** Role an ancestor gives without a role attribute. */
const CONTAINER_TAG_ROLE: Readonly<Record<string, string>> = {
  ul: 'list', ol: 'list', menu: 'list', table: 'table', tr: 'row', thead: 'rowgroup', tbody: 'rowgroup', tfoot: 'rowgroup',
  select: 'listbox', datalist: 'listbox', optgroup: 'group', fieldset: 'group',
};

const HEADING = /^h[1-6]$/;

/** The role the element already has, for the cases where writing it again adds nothing. Lists and tables are left out: writing the role again on ul, table, tr or td restores semantics that some browsers drop when CSS changes the display. */
export function implicitRole(n: HtmlNode): string | null {
  const type = attrOf(n, 'type').toLowerCase();
  switch (n.tag) {
    case 'button': return 'button';
    case 'a': return n.attrs['href'] !== undefined ? 'link' : null;
    case 'nav': return 'navigation';
    case 'main': return 'main';
    case 'aside': return 'complementary';
    case 'article': return 'article';
    case 'dialog': return 'dialog';
    case 'textarea': return 'textbox';
    case 'progress': return 'progressbar';
    case 'hr': return 'separator';
    case 'option': return 'option';
    case 'fieldset': return 'group';
    case 'output': return 'status';
    case 'input':
      if (type === 'checkbox') return 'checkbox';
      if (type === 'radio') return 'radio';
      if (type === 'range') return 'slider';
      if (type === 'button' || type === 'submit' || type === 'reset' || type === 'image') return 'button';
      return null;
    default:
      return HEADING.test(n.tag) ? 'heading' : null;
  }
}

/** True when the element itself supplies the state, so the attribute is not needed. */
function nativeSupplies(n: HtmlNode, role: string): boolean {
  const type = attrOf(n, 'type').toLowerCase();
  if (role === 'checkbox' || role === 'switch' || role === 'menuitemcheckbox') return n.tag === 'input' && type === 'checkbox';
  if (role === 'radio' || role === 'menuitemradio') return n.tag === 'input' && type === 'radio';
  if (role === 'slider') return n.tag === 'input' && type === 'range';
  if (role === 'combobox') return n.tag === 'select' || n.tag === 'input';
  if (role === 'heading') return HEADING.test(n.tag);
  if (role === 'meter') return n.tag === 'meter';
  return false;
}

/** True when the value fits the kind. An empty value is left to the browser default and is not judged. */
export function validAriaValue(name: string, raw: string): boolean {
  const spec = ARIA_ATTRIBUTES[name];
  const value = raw.trim().toLowerCase();
  if (!spec || spec.kind === 'free' || value === '') return true;
  if (spec.kind === 'tokens') return spec.values.includes(value);
  if (spec.kind === 'token-list') return tokensOf(value).every((x) => spec.values.includes(x));
  if (spec.kind === 'integer') return /^-?\d+$/.test(value) && Number(value) >= spec.min;
  return /^-?(?:\d+\.?\d*|\.\d+)$/.test(value);
}

function allowedText(name: string): { en: string; fr: string } {
  const spec = ARIA_ATTRIBUTES[name];
  if (!spec || spec.kind === 'free') return { en: 'any text', fr: 'tout texte' };
  if (spec.kind === 'tokens' || spec.kind === 'token-list') {
    const both = listBoth(spec.values);
    return { en: both.en.replace(/ and (?=[^ ]+$)/, ' or '), fr: both.fr.replace(/ et (?=[^ ]+$)/, ' ou ') };
  }
  if (spec.kind === 'integer') return { en: `a whole number of ${spec.min} or more`, fr: `un nombre entier de ${spec.min} ou plus` };
  return { en: 'a number', fr: 'un nombre' };
}

/** The first role token the browser would use, or null when none is known. */
export function effectiveRole(value: string): string | null {
  for (const x of tokensOf(value.toLowerCase())) if (isKnownRole(x)) return x;
  return null;
}

/** Concrete roles, and the digital publishing and graphics roles, which have their own modules. */
export function isKnownRole(role: string): boolean {
  return ARIA_ROLES.has(role) || /^doc-[a-z]+$/.test(role) || /^graphics-[a-z]+$/.test(role);
}

export function auditAria(html: string): CheckResult {
  const { nodes } = parseHtml(html);
  const entries: Entry[] = [];
  let checked = 0;
  const add = (n: HtmlNode, rule: AriaRule, status: EntryStatus, en: string, fr: string): void => {
    entries.push({ check: 'aria', id: nodeLabel(n), status, rule, message: t(en, fr) });
  };
  const anyOwns = nodes.some((n) => attrOf(n, 'aria-owns') !== '');

  for (const n of nodes) {
    const ariaNames = Object.keys(n.attrs).filter((a) => a.startsWith('aria-'));
    const roleRaw = n.attrs['role'];
    if (roleRaw === undefined && ariaNames.length === 0) continue;
    checked++;

    let role: string | null = null;
    if (roleRaw !== undefined && roleRaw.trim() !== '') {
      const tokens = tokensOf(roleRaw.toLowerCase());
      role = effectiveRole(roleRaw);
      const abstract = tokens.filter((x) => ABSTRACT_ROLES.has(x));
      if (role === null && abstract.length > 0) {
        add(
          n,
          'abstract-role',
          'fail',
          `The role “${clip(abstract[0] ?? '', 24)}” is an abstract role. It exists to define other roles and browsers ignore it. Use a concrete role, or the HTML element that already has the meaning.`,
          `Le rôle «\u202F${clip(abstract[0] ?? '', 24)}\u202F» est un rôle abstrait. Il sert à définir d’autres rôles et les navigateurs l’ignorent. Utilisez un rôle concret, ou l’élément HTML qui porte déjà ce sens.`,
        );
      } else if (role === null) {
        add(
          n,
          'unknown-role',
          'fail',
          `The role “${clip(roleRaw, 24)}” is not an ARIA role, so browsers ignore it and the element keeps the meaning of ${n.tag}. Look for a typing mistake.`,
          `Le rôle «\u202F${clip(roleRaw, 24)}\u202F» n’est pas un rôle ARIA\u00A0: les navigateurs l’ignorent et l’élément garde le sens de ${n.tag}. Cherchez une faute de frappe.`,
        );
      }
    }

    const unknownAttrs = ariaNames.filter((a) => !(a in ARIA_ATTRIBUTES));
    if (unknownAttrs.length > 0) {
      const names = listBoth(unknownAttrs.map((a) => clip(a, 28)));
      add(
        n,
        'unknown-attribute',
        'fail',
        `${names.en} ${unknownAttrs.length === 1 ? 'is not an ARIA attribute' : 'are not ARIA attributes'}. Browsers ignore what they do not know, so the information never reaches assistive technology. Look for a typing mistake, for example aria-labeledby for aria-labelledby.`,
        `${names.fr} ${unknownAttrs.length === 1 ? 'n’est pas un attribut ARIA' : 'ne sont pas des attributs ARIA'}. Les navigateurs ignorent ce qu’ils ne connaissent pas\u00A0: l’information n’arrive jamais aux technologies d’assistance. Cherchez une faute de frappe, par exemple aria-labeledby pour aria-labelledby.`,
      );
    }

    for (const a of ariaNames) {
      if (!(a in ARIA_ATTRIBUTES)) continue;
      const value = n.attrs[a] ?? '';
      if (validAriaValue(a, value)) continue;
      const allowed = allowedText(a);
      add(
        n,
        'bad-value',
        'fail',
        `${a} has the value “${clip(value, 24)}”, which is not allowed. Allowed: ${allowed.en}. Browsers fall back to the default, so the state is not announced.`,
        `${a} a la valeur «\u202F${clip(value, 24)}\u202F», qui n’est pas permise. Valeurs permises\u00A0: ${allowed.fr}. Les navigateurs reviennent à la valeur par défaut\u00A0: l’état n’est pas annoncé.`,
      );
    }

    if (n.tag === 'body' && attrOf(n, 'aria-hidden').toLowerCase() === 'true') {
      add(
        n,
        'hidden-body',
        'fail',
        'The body has aria-hidden set to true, which hides the whole page from screen readers. Remove it, or hide only the part behind an open dialog.',
        'Le body porte aria-hidden à true, ce qui cache toute la page aux lecteurs d’écran. Retirez-le, ou cachez seulement la partie située derrière une boîte de dialogue ouverte.',
      );
    }

    if (role !== null) {
      const missing = (REQUIRED_STATES[role] ?? []).filter((a) => attrOf(n, a) === '');
      if (missing.length > 0 && !nativeSupplies(n, role)) {
        const names = listBoth(missing);
        add(
          n,
          'missing-required',
          'fail',
          `The role ${role} needs ${names.en}, and it is missing. Without it a screen reader cannot say what state the control is in.`,
          `Le rôle ${role} exige ${names.fr}, qui manque. Sans cela, un lecteur d’écran ne peut pas dire dans quel état se trouve la commande.`,
        );
      }

      const parents = REQUIRED_PARENTS[role];
      if (parents) {
        const found = ancestorsOf(nodes, n).some((a) => {
          const r = a.attrs['role'] !== undefined ? effectiveRole(a.attrs['role']) : (CONTAINER_TAG_ROLE[a.tag] ?? null);
          return r !== null && parents.includes(r);
        });
        if (!found) {
          const names = listBoth(parents);
          const or = { en: names.en.replace(/ and (?=[^ ]+$)/, ' or '), fr: names.fr.replace(/ et (?=[^ ]+$)/, ' ou ') };
          if (anyOwns) {
            add(
              n,
              'missing-parent',
              'unknown',
              `The role ${role} has no ancestor with the role ${or.en}. The page uses aria-owns, which can supply the parent from elsewhere and cannot be followed here. Check that this element is owned by one.`,
              `Le rôle ${role} n’a aucun ancêtre de rôle ${or.fr}. La page utilise aria-owns, qui peut fournir le parent depuis un autre endroit et ne peut pas être suivi ici. Contrôlez que cet élément appartient bien à l’un d’eux.`,
            );
          } else {
            add(
              n,
              'missing-parent',
              'fail',
              `The role ${role} only works inside an element with the role ${or.en}, and none of its ancestors has one. Screen readers cannot say how many items there are or where this one sits.`,
              `Le rôle ${role} ne fonctionne qu’à l’intérieur d’un élément de rôle ${or.fr}, et aucun de ses ancêtres n’en a. Les lecteurs d’écran ne peuvent dire ni le nombre d’éléments ni la place de celui-ci.`,
            );
          }
        }
      }

      if (implicitRole(n) === role) {
        add(
          n,
          'redundant-role',
          'unknown',
          `The ${n.tag} element already has the role ${role}. Writing it again does no harm, yet it is often a sign that the role was meant for another element. Check, then remove it.`,
          `L’élément ${n.tag} a déjà le rôle ${role}. Le répéter ne nuit pas, mais c’est souvent le signe que le rôle visait un autre élément. Contrôlez, puis retirez-le.`,
        );
      }

      if ((role === 'presentation' || role === 'none') && isFocusable(n)) {
        add(
          n,
          'presentation-focusable',
          'unknown',
          `This ${n.tag} takes keyboard focus and has the role ${role}. Browsers ignore that role on something focusable, so the result differs from what was written. Remove the role, or take the element out of the tab order.`,
          `Ce ${n.tag} reçoit le focus clavier et porte le rôle ${role}. Les navigateurs ignorent ce rôle sur un élément focalisable\u00A0: le résultat diffère de ce qui est écrit. Retirez le rôle, ou sortez l’élément de l’ordre de tabulation.`,
        );
      }
    }

    if ((n.tag === 'div' || n.tag === 'span') && roleRaw === undefined && (attrOf(n, 'aria-label') !== '' || attrOf(n, 'aria-labelledby') !== '')) {
      const which = attrOf(n, 'aria-label') !== '' ? 'aria-label' : 'aria-labelledby';
      add(
        n,
        'name-on-generic',
        'unknown',
        `This ${n.tag} has ${which} and no role. Most screen readers do not read a name on a plain ${n.tag}. Give it a role that takes a name, or put the words in the text.`,
        `Ce ${n.tag} porte ${which} sans rôle. La plupart des lecteurs d’écran ne lisent pas un nom posé sur un simple ${n.tag}. Donnez-lui un rôle qui accepte un nom, ou mettez les mots dans le texte.`,
      );
    }
  }
  return { checked, entries: inFileOrder(entries) };
}
