import { parseHtml, type HtmlNode } from './htmllint.js';
import { ancestorsOf, attrOf, idIndex, inFileOrder, nodeLabel, tokensOf } from './markup.js';
import { clip, t, type CheckResult, type Entry, type EntryStatus } from './types.js';

/**
 * References from one element to another by id or name (WCAG 1.3.1 and
 * 4.1.2): a link to a place on the same page, the headers of a table cell, the
 * suggestion list of a field, the form a control belongs to, an image map, and
 * the ARIA relations that static-html does not read. A reference to something
 * that is not in the markup does nothing, and the relation is lost without
 * any visible sign. That is measured, so it fails. aria-controls often points
 * at a panel that is only added when it opens, so it is UNKNOWN. Skip links
 * belong to the bypass check and are left out here.
 */

export type ReferenceRule =
  | 'fragment-missing'
  | 'headers-missing'
  | 'list-missing'
  | 'form-missing'
  | 'usemap-missing'
  | 'aria-idref-missing'
  | 'controls-missing'
  | 'label-not-field'
  | 'several-labels';

export const REFERENCE_RULES: readonly ReferenceRule[] = [
  'fragment-missing', 'headers-missing', 'list-missing', 'form-missing', 'usemap-missing', 'aria-idref-missing',
  'controls-missing', 'label-not-field', 'several-labels',
];

/** ARIA relations that must resolve whenever they are written. aria-labelledby and aria-describedby are read by static-html. */
export const ARIA_IDREF_ATTRIBUTES: readonly string[] = ['aria-activedescendant', 'aria-owns', 'aria-flowto', 'aria-details', 'aria-errormessage'];

const SKIP_LINK = /\bskip\b|\bjump to\b|aller au|passer au|sauter/iu;
const LABELABLE = new Set(['button', 'input', 'meter', 'output', 'progress', 'select', 'textarea']);
const FORM_OWNED = new Set(['button', 'input', 'select', 'textarea', 'fieldset', 'output', 'object']);
const CELL = new Set(['td', 'th']);

function decodeFragment(href: string): string {
  const raw = href.slice(1);
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

/** True for a link that stays on the page and names a place: `#hours`. `#`, `#top` and router paths such as `#/map` are not. */
export function isFragmentLink(href: string): boolean {
  const h = href.trim();
  if (!h.startsWith('#') || h.length < 2) return false;
  if (h.startsWith('#/') || h.startsWith('#!')) return false;
  return h.toLowerCase() !== '#top';
}

export function auditReferences(html: string): CheckResult {
  const { nodes } = parseHtml(html);
  const byId = idIndex(nodes);
  const anchorNames = new Set(nodes.filter((n) => n.tag === 'a' && attrOf(n, 'name') !== '').map((n) => attrOf(n, 'name')));
  const mapNames = new Set(nodes.filter((n) => n.tag === 'map').flatMap((n) => [attrOf(n, 'name'), attrOf(n, 'id')]).filter((x) => x !== ''));
  const entries: Entry[] = [];
  let checked = 0;
  const add = (n: HtmlNode, rule: ReferenceRule, status: EntryStatus, en: string, fr: string): void => {
    entries.push({ check: 'references', id: nodeLabel(n), status, rule, message: t(en, fr) });
  };
  const labelsFor = new Map<string, HtmlNode[]>();

  for (const n of nodes) {
    if ((n.tag === 'a' || n.tag === 'area') && isFragmentLink(n.attrs['href'] ?? '') && !SKIP_LINK.test(n.text)) {
      checked++;
      const target = decodeFragment(attrOf(n, 'href'));
      if (!byId.has(target) && !anchorNames.has(target)) {
        add(
          n,
          'fragment-missing',
          'fail',
          `This link goes to “#${clip(target, 30)}” and nothing on the page has that id. Activating it does nothing, and a screen reader user gets no feedback. Add the id to the target, or fix the link.`,
          `Ce lien mène à «\u202F#${clip(target, 30)}\u202F» et rien dans la page ne porte cet identifiant. L’activer ne fait rien, et une personne au lecteur d’écran n’a aucun retour. Ajoutez l’identifiant à la cible, ou corrigez le lien.`,
        );
      }
    }

    if (CELL.has(n.tag) && attrOf(n, 'headers') !== '') {
      checked++;
      const table = ancestorsOf(nodes, n).find((a) => a.tag === 'table');
      const bad = tokensOf(attrOf(n, 'headers')).filter((id) => {
        const target = byId.get(id);
        if (!target || !CELL.has(target.tag) || target.index === n.index) return true;
        return ancestorsOf(nodes, target).find((a) => a.tag === 'table')?.index !== table?.index;
      });
      if (bad.length > 0) {
        add(
          n,
          'headers-missing',
          'fail',
          `The headers attribute of this cell names “${clip(bad.join(' '), 40)}”, which is not another cell of the same table. Screen readers then read the cell with no header, or with the wrong one.`,
          `L’attribut headers de cette cellule nomme «\u202F${clip(bad.join(' '), 40)}\u202F», qui n’est pas une autre cellule du même tableau. Les lecteurs d’écran lisent alors la cellule sans en-tête, ou avec le mauvais.`,
        );
      }
    }

    if (n.tag === 'input' && attrOf(n, 'list') !== '') {
      checked++;
      const target = byId.get(attrOf(n, 'list'));
      if (!target || target.tag !== 'datalist') {
        add(
          n,
          'list-missing',
          'fail',
          `The list attribute of this field names “${clip(attrOf(n, 'list'), 30)}”, and no datalist has that id. The suggestions never appear.`,
          `L’attribut list de ce champ nomme «\u202F${clip(attrOf(n, 'list'), 30)}\u202F», et aucun datalist ne porte cet identifiant. Les suggestions n’apparaissent jamais.`,
        );
      }
    }

    if (FORM_OWNED.has(n.tag) && attrOf(n, 'form') !== '') {
      checked++;
      const target = byId.get(attrOf(n, 'form'));
      if (!target || target.tag !== 'form') {
        add(
          n,
          'form-missing',
          'fail',
          `The form attribute of this ${n.tag} names “${clip(attrOf(n, 'form'), 30)}”, and no form has that id. The control is not sent with any form, and a submit button there does nothing.`,
          `L’attribut form de ce ${n.tag} nomme «\u202F${clip(attrOf(n, 'form'), 30)}\u202F», et aucun form ne porte cet identifiant. La commande n’est envoyée avec aucun formulaire, et un bouton d’envoi placé là ne fait rien.`,
        );
      }
    }

    if ((n.tag === 'img' || n.tag === 'object') && attrOf(n, 'usemap') !== '') {
      checked++;
      const name = attrOf(n, 'usemap').replace(/^#/, '');
      if (!mapNames.has(name)) {
        add(
          n,
          'usemap-missing',
          'fail',
          `The usemap attribute names “${clip(name, 30)}”, and no map has that name. The clickable areas of the image do not exist, for the mouse or for the keyboard.`,
          `L’attribut usemap nomme «\u202F${clip(name, 30)}\u202F», et aucun map ne porte ce nom. Les zones cliquables de l’image n’existent pas, ni à la souris ni au clavier.`,
        );
      }
    }

    for (const a of ARIA_IDREF_ATTRIBUTES) {
      const value = attrOf(n, a);
      if (value === '') continue;
      if (a === 'aria-errormessage' && attrOf(n, 'aria-invalid').toLowerCase() !== 'true') continue;
      checked++;
      const bad = tokensOf(value).filter((id) => !byId.has(id));
      if (bad.length > 0) {
        add(
          n,
          'aria-idref-missing',
          'fail',
          `${a} names “${clip(bad.join(' '), 40)}”, and nothing on the page has that id. The relation is dropped without any sign, so assistive technology never learns of it.`,
          `${a} nomme «\u202F${clip(bad.join(' '), 40)}\u202F», et rien dans la page ne porte cet identifiant. La relation est abandonnée sans aucun signe\u00A0: les technologies d’assistance n’en savent rien.`,
        );
      }
    }

    const controls = attrOf(n, 'aria-controls');
    if (controls !== '') {
      const closed = attrOf(n, 'aria-expanded').toLowerCase() === 'false';
      const restingTab = tokensOf((n.attrs['role'] ?? '').toLowerCase()).includes('tab') && attrOf(n, 'aria-selected').toLowerCase() !== 'true';
      if (!closed && !restingTab) {
        checked++;
        const bad = tokensOf(controls).filter((id) => !byId.has(id));
        if (bad.length > 0) {
          add(
            n,
            'controls-missing',
            'unknown',
            `aria-controls names “${clip(bad.join(' '), 40)}”, and nothing on the page has that id right now. If the panel is only added when it opens, that is fine. Check that it exists once this control is used.`,
            `aria-controls nomme «\u202F${clip(bad.join(' '), 40)}\u202F», et rien dans la page ne porte cet identifiant pour l’instant. Si le panneau n’est ajouté qu’à l’ouverture, tout va bien. Contrôlez qu’il existe une fois cette commande utilisée.`,
          );
        }
      }
    }

    if (n.tag === 'label' && attrOf(n, 'for') !== '') {
      const target = byId.get(attrOf(n, 'for'));
      if (target) {
        checked++;
        const hiddenInput = target.tag === 'input' && attrOf(target, 'type').toLowerCase() === 'hidden';
        if (!target.tag.includes('-') && (!LABELABLE.has(target.tag) || hiddenInput)) {
          add(
            n,
            'label-not-field',
            'fail',
            `This label points to a ${target.tag}${hiddenInput ? ' of type hidden' : ''}, which cannot take a label. The words are not announced with the control, and a click on them does not move focus. Point the label at the real field, or name the element with aria-labelledby.`,
            `Cette étiquette pointe vers un ${target.tag}${hiddenInput ? ' de type hidden' : ''}, qui ne peut pas recevoir d’étiquette. Les mots ne sont pas annoncés avec la commande, et un clic dessus ne déplace pas le focus. Pointez l’étiquette vers le vrai champ, ou nommez l’élément avec aria-labelledby.`,
          );
        }
        if (n.text.trim() !== '') labelsFor.set(attrOf(n, 'for'), [...(labelsFor.get(attrOf(n, 'for')) ?? []), n]);
      }
    }
  }

  for (const [id, labels] of labelsFor) {
    const second = labels[1];
    if (!second) continue;
    add(
      second,
      'several-labels',
      'unknown',
      `${labels.length} labels point to the field “${clip(id, 30)}”. Screen readers differ: some read all of them, some only the first. Check what is announced, or merge them into one label and move the rest to a hint.`,
      `${labels.length} étiquettes pointent vers le champ «\u202F${clip(id, 30)}\u202F». Les lecteurs d’écran diffèrent\u00A0: certains les lisent toutes, d’autres seulement la première. Contrôlez ce qui est annoncé, ou fusionnez-les en une seule étiquette et placez le reste dans une aide.`,
    );
  }
  return { checked, entries: inFileOrder(entries) };
}
