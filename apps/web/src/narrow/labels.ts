import { parseHtml, type HtmlNode } from './htmllint.js';
import { ancestorsOf, attrOf, idIndex, inFileOrder, isHiddenNode, nodeLabel } from './markup.js';
import { clip, t, type CheckResult, type Entry, type EntryStatus } from './types.js';

/**
 * How label elements are built (WCAG 3.3.2 and 2.4.6). A label names one
 * field. When it wraps two, or sits inside another label, the browser gives
 * the words to the first field only, which is measured in the markup and
 * fails. A label that points one way and wraps another field, one that holds
 * a link or a button, the same words on two different fields and a label that
 * is only a placeholder word need a person to look, so they are UNKNOWN. A
 * field with no label at all is a static-html rule.
 */

export type LabelRule = 'label-two-controls' | 'label-nested' | 'label-for-and-wraps' | 'label-holds-control' | 'label-duplicate' | 'label-generic';

export const LABEL_RULES: readonly LabelRule[] = ['label-two-controls', 'label-nested', 'label-for-and-wraps', 'label-holds-control', 'label-duplicate', 'label-generic'];

/** Words that say nothing about the field, in English and French, compared without accents or punctuation. */
export const GENERIC_LABELS: ReadonlySet<string> = new Set([
  'label', 'input', 'field', 'text', 'value', 'enter', 'type here', 'enter text', 'select', 'choose', 'option', 'untitled',
  'etiquette', 'champ', 'texte', 'valeur', 'saisir', 'entrer', 'choisir', 'selectionner', 'sans titre',
]);

const FIELDS = new Set(['input', 'select', 'textarea', 'meter', 'progress', 'output']);
const isField = (n: HtmlNode): boolean => FIELDS.has(n.tag) && !(n.tag === 'input' && ['hidden', 'submit', 'reset', 'button', 'image'].includes(attrOf(n, 'type').toLowerCase()));
const isChoice = (n: HtmlNode): boolean => n.tag === 'input' && ['checkbox', 'radio'].includes(attrOf(n, 'type').toLowerCase());

/** Label text without accents, case, punctuation or a required mark, for comparing. */
export function plainLabel(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

export function auditLabels(html: string): CheckResult {
  const { nodes } = parseHtml(html);
  const byId = idIndex(nodes);
  const entries: Entry[] = [];
  let checked = 0;
  const add = (n: HtmlNode, rule: LabelRule, status: EntryStatus, en: string, fr: string): void => {
    entries.push({ check: 'labels', id: nodeLabel(n), status, rule, message: t(en, fr) });
  };
  const inside = (n: HtmlNode): HtmlNode[] => {
    const out: HtmlNode[] = [];
    const stack = [...n.children].reverse();
    let guard = 0;
    while (stack.length > 0 && guard++ < 20000) {
      const c = nodes[stack.pop() ?? -1];
      if (!c) continue;
      out.push(c);
      for (let i = c.children.length - 1; i >= 0; i--) stack.push(c.children[i] ?? -1);
    }
    return out;
  };
  const seenText = new Map<string, { label: HtmlNode; field: number }>();
  const reported = new Set<string>();

  for (const n of nodes) {
    if (n.tag !== 'label' || isHiddenNode(nodes, n)) continue;
    checked++;
    const within = inside(n);
    const fields = within.filter(isField);
    const forId = attrOf(n, 'for');
    const text = clip(n.text, 36);

    if (ancestorsOf(nodes, n).some((a) => a.tag === 'label')) {
      add(
        n,
        'label-nested',
        'fail',
        `The label “${text}” sits inside another label. HTML does not allow that, and browsers tie the field to one of the two only, so part of the words is never announced with it. Use one label, and put the extra words in a hint.`,
        `L’étiquette «\u202F${text}\u202F» se trouve dans une autre étiquette. HTML ne le permet pas, et les navigateurs ne rattachent le champ qu’à l’une des deux\u00A0: une partie des mots n’est jamais annoncée avec lui. Utilisez une seule étiquette, et placez les mots en plus dans une aide.`,
      );
    }

    if (forId === '' && fields.length >= 2) {
      add(
        n,
        'label-two-controls',
        'fail',
        `The label “${text}” wraps ${fields.length} fields. A label names only the first field inside it, so the others are announced with no name. Give each field its own label, and group them with fieldset and legend.`,
        `L’étiquette «\u202F${text}\u202F» entoure ${fields.length} champs. Une étiquette ne nomme que le premier champ qu’elle contient\u00A0: les autres sont annoncés sans nom. Donnez à chaque champ sa propre étiquette, et regroupez-les avec fieldset et legend.`,
      );
    }

    const wrapped = fields[0];
    if (forId !== '' && wrapped && attrOf(wrapped, 'id') !== forId) {
      add(
        n,
        'label-for-and-wraps',
        'unknown',
        `The label “${text}” points to “${clip(forId, 24)}” with its for attribute and wraps a different field. The for attribute wins, so the field inside gets no name from this label. Check which field the words belong to.`,
        `L’étiquette «\u202F${text}\u202F» pointe vers «\u202F${clip(forId, 24)}\u202F» par son attribut for et entoure un autre champ. L’attribut for l’emporte\u00A0: le champ à l’intérieur ne reçoit aucun nom de cette étiquette. Contrôlez à quel champ les mots se rapportent.`,
      );
    }

    const control = within.find((c) => (c.tag === 'a' && c.attrs['href'] !== undefined) || c.tag === 'button');
    if (control) {
      add(
        n,
        'label-holds-control',
        'unknown',
        `The label “${text}” holds a ${control.tag === 'a' ? 'link' : 'button'}. A click or a tap on the label then has two meanings, and the words of the ${control.tag === 'a' ? 'link' : 'button'} are read as part of the name of the field. Move it out of the label, next to the field.`,
        `L’étiquette «\u202F${text}\u202F» contient un ${control.tag === 'a' ? 'lien' : 'bouton'}. Un clic ou un toucher sur l’étiquette a alors deux sens, et les mots du ${control.tag === 'a' ? 'lien' : 'bouton'} sont lus dans le nom du champ. Sortez-le de l’étiquette, à côté du champ.`,
      );
    }

    const plain = plainLabel(n.text);
    const hasPicture = within.some((c) => c.tag === 'img' && attrOf(c, 'alt') !== '');
    if (!hasPicture && n.text.trim() !== '' && (plain === '' || GENERIC_LABELS.has(plain))) {
      add(
        n,
        'label-generic',
        'unknown',
        `The label “${text}” does not say what to enter. It reads like a placeholder left from a template, or it is only a symbol. Replace it with the name of the information, such as “Postal code”.`,
        `L’étiquette «\u202F${text}\u202F» ne dit pas quoi saisir. Elle ressemble à un texte provisoire resté d’un gabarit, ou n’est qu’un symbole. Remplacez-la par le nom de l’information, par exemple «\u202FCode postal\u202F».`,
      );
    }

    const target = forId !== '' ? byId.get(forId) : wrapped;
    if (target && isField(target) && !isChoice(target) && plain !== '' && !GENERIC_LABELS.has(plain)) {
      const earlier = seenText.get(plain);
      if (!earlier) seenText.set(plain, { label: n, field: target.index });
      else if (earlier.field !== target.index && !reported.has(plain)) {
        reported.add(plain);
        add(
          n,
          'label-duplicate',
          'unknown',
          `Two different fields are both labelled “${text}” (the first on line ${earlier.label.line}). In a list of form fields, or with voice control, people cannot tell them apart. Check whether each needs its own words, such as “Home phone” and “Work phone”.`,
          `Deux champs différents portent tous deux l’étiquette «\u202F${text}\u202F» (le premier à la ligne ${earlier.label.line}). Dans une liste de champs de formulaire, ou en commande vocale, on ne peut pas les distinguer. Contrôlez si chacun a besoin de ses propres mots, par exemple «\u202FTéléphone à la maison\u202F» et «\u202FTéléphone au travail\u202F».`,
        );
      }
    }
  }
  return { checked, entries: inFileOrder(entries) };
}
