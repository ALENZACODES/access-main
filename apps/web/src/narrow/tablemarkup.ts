import { parseHtml, type HtmlNode } from './htmllint.js';
import { attrOf, inFileOrder, isHiddenNode, nodeLabel } from './markup.js';
import { clip, t, type CheckResult, type Entry, type EntryStatus } from './types.js';

/**
 * Table attributes written in the markup (WCAG 1.3.1). A scope the browser
 * does not know and a span that is not a number are ignored, so a header is
 * tied to the wrong cells or to none. Those are measured and fail. A scope on
 * a data cell, a caption that is not the first thing in its table and a
 * summary attribute still work in some browsers and screen readers and not in
 * others, so they are UNKNOWN. Missing headers and captions are static-html
 * rules, and empty headers and layout tables belong to the tables check.
 */

export type TableMarkupRule = 'scope-invalid' | 'span-invalid' | 'scope-on-td' | 'caption-not-first' | 'summary-attribute';

export const TABLE_MARKUP_RULES: readonly TableMarkupRule[] = ['scope-invalid', 'span-invalid', 'scope-on-td', 'caption-not-first', 'summary-attribute'];

export const SCOPES: ReadonlySet<string> = new Set(['row', 'col', 'rowgroup', 'colgroup']);
/** Largest colspan browsers honour. A larger rowspan limit exists, and nothing real comes near either. */
export const MAX_SPAN = 1000;

/** True for a span the browser will use: a whole number from 1 (0 is allowed for rowspan and means "to the end"). */
export function validSpan(name: 'colspan' | 'rowspan', raw: string): boolean {
  const v = raw.trim();
  if (!/^\d+$/.test(v)) return false;
  const n = Number(v);
  return n <= MAX_SPAN && (n >= 1 || name === 'rowspan');
}

export function auditTableMarkup(html: string): CheckResult {
  const { nodes } = parseHtml(html);
  const entries: Entry[] = [];
  let checked = 0;
  const add = (n: HtmlNode, rule: TableMarkupRule, status: EntryStatus, en: string, fr: string): void => {
    entries.push({ check: 'table-markup', id: nodeLabel(n), status, rule, message: t(en, fr) });
  };

  for (const n of nodes) {
    if (n.tag !== 'table' && n.tag !== 'td' && n.tag !== 'th') continue;
    if (isHiddenNode(nodes, n)) continue;

    if (n.tag === 'table') {
      checked++;
      const role = attrOf(n, 'role').toLowerCase();
      if (role === 'presentation' || role === 'none') continue;
      const kids = n.children.flatMap((c) => (nodes[c] ? [nodes[c]] : []));
      const captionAt = kids.findIndex((k) => k.tag === 'caption');
      if (captionAt > 0) {
        add(
          kids[captionAt] ?? n,
          'caption-not-first',
          'unknown',
          `The caption of this table comes after a ${kids[0]?.tag ?? 'row'}. A caption must be the first thing inside its table, and when it is not, some screen readers do not announce it as the name of the table. Move it to the top.`,
          `La légende de ce tableau vient après un ${kids[0]?.tag ?? 'rang'}. Une légende doit être le premier élément de son tableau\u202F; sinon, certains lecteurs d’écran ne l’annoncent pas comme le nom du tableau. Déplacez-la tout en haut.`,
        );
      }
      if (attrOf(n, 'summary') !== '') {
        add(
          n,
          'summary-attribute',
          'unknown',
          `This table has a summary attribute (“${clip(attrOf(n, 'summary'), 30)}”). It is obsolete: sighted people never see it and not every screen reader reads it. Put the explanation in the caption, or in a paragraph linked with aria-describedby.`,
          `Ce tableau a un attribut summary («\u202F${clip(attrOf(n, 'summary'), 30)}\u202F»). Il est obsolète\u00A0: on ne le voit jamais à l’écran et tous les lecteurs d’écran ne le lisent pas. Placez l’explication dans la légende, ou dans un paragraphe relié par aria-describedby.`,
        );
      }
      continue;
    }

    const scope = n.attrs['scope'];
    const spans = (['colspan', 'rowspan'] as const).filter((s) => n.attrs[s] !== undefined);
    if (scope === undefined && spans.length === 0) continue;
    checked++;

    if (scope !== undefined) {
      const value = scope.trim().toLowerCase();
      if (!SCOPES.has(value)) {
        add(
          n,
          'scope-invalid',
          'fail',
          `This ${n.tag} has scope set to “${clip(scope, 20)}”, which is not a scope. Browsers ignore it and guess which cells the header belongs to. Use row, col, rowgroup or colgroup.`,
          `Ce ${n.tag} a scope à «\u202F${clip(scope, 20)}\u202F», qui n’est pas une portée. Les navigateurs l’ignorent et devinent à quelles cellules l’en-tête se rapporte. Utilisez row, col, rowgroup ou colgroup.`,
        );
      } else if (n.tag === 'td') {
        add(
          n,
          'scope-on-td',
          'unknown',
          'This data cell (td) has a scope. Scope on td is obsolete, and screen readers differ on whether they treat the cell as a header. If it heads a row or a column, make it a th.',
          'Cette cellule de données (td) a un scope. Le scope sur td est obsolète, et les lecteurs d’écran ne traitent pas tous la cellule comme un en-tête. Si elle coiffe une ligne ou une colonne, faites-en un th.',
        );
      }
    }

    for (const s of spans) {
      const raw = n.attrs[s] ?? '';
      if (validSpan(s, raw)) continue;
      add(
        n,
        'span-invalid',
        'fail',
        `This ${n.tag} has ${s} set to “${clip(raw, 16)}”, which browsers do not accept. They fall back to 1, so the cells after it line up under the wrong headers. Use a whole number${s === 'colspan' ? ' from 1' : ''} up to ${MAX_SPAN}.`,
        `Ce ${n.tag} a ${s} à «\u202F${clip(raw, 16)}\u202F», que les navigateurs n’acceptent pas. Ils reviennent à 1\u00A0: les cellules suivantes s’alignent sous les mauvais en-têtes. Utilisez un nombre entier${s === 'colspan' ? ' à partir de 1' : ''}, jusqu’à ${MAX_SPAN}.`,
      );
    }
  }
  return { checked, entries: inFileOrder(entries) };
}
