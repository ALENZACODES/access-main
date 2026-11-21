import { parseHtml, type HtmlNode } from './htmllint.js';
import { ancestorsOf, inFileOrder, isHiddenNode, listBoth, nodeLabel } from './markup.js';
import { clip, t, type CheckResult, type Entry, type EntryStatus } from './types.js';

/**
 * Old presentational markup (WCAG 1.3.1, and 2.1.1 for image maps read by the
 * server). Elements such as font and center and attributes such as align and
 * bgcolor put the look in the markup, where a person's own colours, text size
 * and spacing cannot reach it. Underlined text that is not a link looks like
 * one. Struck-out, inserted and highlighted text is silent in most screen
 * readers. A server-side image map cannot be used without a pointer, which is
 * measured in the markup and fails. Everything else is UNKNOWN: the markup
 * still renders, and a person has to judge what is lost.
 */

export type ObsoleteRule = 'presentational-element' | 'frameset' | 'layout-attribute' | 'underline-not-link' | 'silent-semantics' | 'server-image-map';

export const OBSOLETE_RULES: readonly ObsoleteRule[] = [
  'presentational-element', 'frameset', 'layout-attribute', 'underline-not-link', 'silent-semantics', 'server-image-map',
];

/** Obsolete elements and what to write now. Moving and blinking text belongs to the timing check. */
export const OBSOLETE_ELEMENTS: Readonly<Record<string, { en: string; fr: string }>> = {
  font: { en: 'CSS for the typeface, size and colour', fr: 'le CSS pour la police, la taille et la couleur' },
  basefont: { en: 'CSS on the body', fr: 'le CSS sur le body' },
  center: { en: 'text-align or a layout rule in CSS', fr: 'text-align ou une règle de mise en page en CSS' },
  big: { en: 'a font-size rule in CSS', fr: 'une règle font-size en CSS' },
  strike: { en: 'del for removed text, or s for text that no longer applies', fr: 'del pour un texte supprimé, ou s pour un texte qui ne s’applique plus' },
  tt: { en: 'code, kbd or samp', fr: 'code, kbd ou samp' },
  acronym: { en: 'abbr', fr: 'abbr' },
  dir: { en: 'ul', fr: 'ul' },
  xmp: { en: 'pre with code', fr: 'pre avec code' },
  listing: { en: 'pre with code', fr: 'pre avec code' },
  plaintext: { en: 'pre', fr: 'pre' },
  nobr: { en: 'white-space in CSS, and only where a break would mislead', fr: 'white-space en CSS, et seulement là où une coupure induirait en erreur' },
  spacer: { en: 'margin or padding in CSS', fr: 'une marge ou un remplissage en CSS' },
};

const FRAMESET = new Set(['frameset', 'frame', 'noframes']);

/** Attributes that set the look on any element. */
const LOOK_ATTRIBUTES = ['align', 'valign', 'bgcolor', 'background', 'cellpadding', 'cellspacing', 'nowrap', 'hspace', 'vspace'] as const;
/** Elements where a width or height attribute fixes a layout size. On images, video, canvas and frames those attributes reserve space and are good practice. */
const SIZED_BY_ATTRIBUTE = new Set(['table', 'td', 'th', 'tr', 'col', 'colgroup', 'thead', 'tbody', 'tfoot', 'hr', 'pre']);
const SILENT: Readonly<Record<string, { en: string; fr: string }>> = {
  del: { en: 'removed', fr: 'supprimé' },
  s: { en: 'no longer current', fr: 'plus à jour' },
  ins: { en: 'added', fr: 'ajouté' },
  mark: { en: 'highlighted', fr: 'surligné' },
};

export function auditObsolete(html: string): CheckResult {
  const { nodes } = parseHtml(html);
  const entries: Entry[] = [];
  const add = (n: HtmlNode, rule: ObsoleteRule, status: EntryStatus, en: string, fr: string): void => {
    entries.push({ check: 'obsolete', id: nodeLabel(n), status, rule, message: t(en, fr) });
  };
  const inSvg = (n: HtmlNode): boolean => n.tag === 'svg' || ancestorsOf(nodes, n).some((a) => a.tag === 'svg' || a.tag === 'math');

  for (const n of nodes) {
    if (inSvg(n)) continue;

    const now = OBSOLETE_ELEMENTS[n.tag];
    if (now) {
      add(
        n,
        'presentational-element',
        'unknown',
        `The ${n.tag} element is obsolete and only sets the look. A person's own colours, text size or spacing may not reach what it styles. Use ${now.en}.`,
        `L’élément ${n.tag} est obsolète et ne règle que l’apparence. Les couleurs, la taille de texte ou l’espacement choisis par une personne risquent de ne pas atteindre ce qu’il met en forme. Utilisez ${now.fr}.`,
      );
    }

    if (FRAMESET.has(n.tag)) {
      add(
        n,
        'frameset',
        'unknown',
        `The ${n.tag} element belongs to frame sets, which are obsolete. Each frame is a separate page with no shared heading or landmark structure, and zoom and reflow break across them. Build one page, or use iframe with a title.`,
        `L’élément ${n.tag} relève des jeux de cadres, qui sont obsolètes. Chaque cadre est une page à part, sans structure commune de titres ou de repères, et le zoom et la réorganisation se brisent entre eux. Construisez une seule page, ou utilisez iframe avec un title.`,
      );
    }

    const look: string[] = LOOK_ATTRIBUTES.filter((a) => n.attrs[a] !== undefined);
    if (SIZED_BY_ATTRIBUTE.has(n.tag)) {
      if (n.attrs['width'] !== undefined) look.push('width');
      if (n.attrs['height'] !== undefined && n.tag !== 'hr') look.push('height');
    }
    if (look.length > 0) {
      const names = listBoth(look);
      const fixesSize = look.includes('nowrap') || look.includes('width');
      add(
        n,
        'layout-attribute',
        'unknown',
        `This ${n.tag} sets its look with ${look.length === 1 ? 'the attribute' : 'the attributes'} ${names.en}. ${fixesSize ? 'A fixed width or no wrapping can force sideways scrolling on a narrow screen or at high zoom. ' : ''}Move the styling to CSS, where a person's own settings can change it.`,
        `Ce ${n.tag} règle son apparence avec ${look.length === 1 ? 'l’attribut' : 'les attributs'} ${names.fr}. ${fixesSize ? 'Une largeur fixe ou l’absence de retour à la ligne peut imposer un défilement horizontal sur un écran étroit ou à fort zoom. ' : ''}Déplacez la mise en forme vers le CSS, où les réglages d’une personne peuvent la modifier.`,
      );
    }

    if (n.tag === 'u' && n.text.trim() !== '' && !isHiddenNode(nodes, n) && !ancestorsOf(nodes, n).some((a) => a.tag === 'a' || a.tag === 'button')) {
      add(
        n,
        'underline-not-link',
        'unknown',
        `The text “${clip(n.text, 36)}” is underlined and is not a link. On the web an underline means a link, so people try to activate it. Use strong or em for emphasis.`,
        `Le texte «\u202F${clip(n.text, 36)}\u202F» est souligné sans être un lien. Sur le Web, un soulignement signale un lien\u00A0: on essaie donc de l’activer. Utilisez strong ou em pour l’emphase.`,
      );
    }

    const silent = SILENT[n.tag];
    if (silent && n.text.trim() !== '' && !isHiddenNode(nodes, n)) {
      add(
        n,
        'silent-semantics',
        'unknown',
        `The text “${clip(n.text, 36)}” is marked as ${silent.en} with ${n.tag}. Most screen readers read it like any other text, so the meaning is lost: an old price sounds like the price. Check that the words around it carry the meaning, or add text that is hidden from view only.`,
        `Le texte «\u202F${clip(n.text, 36)}\u202F» est marqué comme ${silent.fr} avec ${n.tag}. La plupart des lecteurs d’écran le lisent comme n’importe quel texte\u00A0: le sens se perd, et un ancien prix passe pour le prix. Contrôlez que les mots voisins portent ce sens, ou ajoutez un texte masqué seulement à l’écran.`,
      );
    }

    if ((n.tag === 'img' || n.tag === 'input') && n.attrs['ismap'] !== undefined) {
      add(
        n,
        'server-image-map',
        'fail',
        'This image is a server-side image map: the server gets the coordinates of the click. A keyboard, a switch or a voice command cannot choose a point, so the links inside cannot be used. Use a map element with area links, or separate links.',
        'Cette image est une image cliquable côté serveur\u00A0: le serveur reçoit les coordonnées du clic. Un clavier, un contacteur ou une commande vocale ne peuvent pas choisir un point, et les liens qu’elle contient sont inutilisables. Utilisez un élément map avec des liens area, ou des liens séparés.',
      );
    }
  }
  return { checked: nodes.length, entries: inFileOrder(entries) };
}
