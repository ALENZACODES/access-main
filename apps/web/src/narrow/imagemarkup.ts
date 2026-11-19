import { parseHtml, type HtmlNode } from './htmllint.js';
import { ancestorsOf, attrOf, inFileOrder, isHiddenNode, nodeLabel } from './markup.js';
import { clip, t, type CheckResult, type Entry, type EntryStatus } from './types.js';

/**
 * How images are built in the markup (WCAG 1.1.1). A picture element with no
 * img inside shows nothing and has no text alternative. A clickable area of
 * an image map with no alt is a link with no name. A figure with two
 * captions, or a caption in the middle, is not read as a caption. Those are
 * measured and fail. An image marked as decoration that also carries a name,
 * and the obsolete longdesc attribute, are read differently by different
 * screen readers, so they are UNKNOWN. A missing alt is a static-html rule,
 * and the quality of alt text belongs to the images check.
 */

export type ImageMarkupRule = 'picture-no-img' | 'area-no-alt' | 'figcaption-misplaced' | 'decorative-conflict' | 'longdesc';

export const IMAGE_MARKUP_RULES: readonly ImageMarkupRule[] = ['picture-no-img', 'area-no-alt', 'figcaption-misplaced', 'decorative-conflict', 'longdesc'];

const SCRIPTING = new Set(['script', 'template', 'noscript']);

export function auditImageMarkup(html: string): CheckResult {
  const { nodes } = parseHtml(html);
  const entries: Entry[] = [];
  let checked = 0;
  const add = (n: HtmlNode, rule: ImageMarkupRule, status: EntryStatus, en: string, fr: string): void => {
    entries.push({ check: 'image-markup', id: nodeLabel(n), status, rule, message: t(en, fr) });
  };
  const kids = (n: HtmlNode): HtmlNode[] => n.children.flatMap((c) => (nodes[c] ? [nodes[c]] : []));

  for (const n of nodes) {
    if (n.tag !== 'picture' && n.tag !== 'area' && n.tag !== 'figure' && n.tag !== 'img') continue;
    if (isHiddenNode(nodes, n)) continue;
    checked++;

    if (n.tag === 'picture' && !kids(n).some((c) => c.tag === 'img')) {
      add(
        n,
        'picture-no-img',
        'fail',
        'This picture element has no img inside. The source elements only choose a file for an img, so nothing is shown and there is nowhere to put the text alternative. Add an img with an alt as the last child.',
        'Cet élément picture ne contient pas de img. Les éléments source ne font que choisir un fichier pour un img\u00A0: rien n’est donc affiché, et le texte de remplacement n’a nulle part où aller. Ajoutez un img avec un alt comme dernier enfant.',
      );
    }

    if (n.tag === 'area' && n.attrs['href'] !== undefined && attrOf(n, 'alt') === '' && attrOf(n, 'aria-label') === '' && attrOf(n, 'aria-labelledby') === '') {
      add(
        n,
        'area-no-alt',
        'fail',
        `This area of an image map links to “${clip(attrOf(n, 'href'), 30)}” and has no alt. It is a link with no name: a screen reader announces only “link” or the address. Add an alt that says where it goes.`,
        `Cette zone d’image cliquable mène à «\u202F${clip(attrOf(n, 'href'), 30)}\u202F» et n’a pas de alt. C’est un lien sans nom\u00A0: un lecteur d’écran n’annonce que «\u202Flien\u202F» ou l’adresse. Ajoutez un alt qui dit où elle mène.`,
      );
    }

    if (n.tag === 'figure') {
      const children = kids(n).filter((c) => !SCRIPTING.has(c.tag));
      const captions = children.filter((c) => c.tag === 'figcaption');
      const second = captions[1];
      if (second) {
        add(
          second,
          'figcaption-misplaced',
          'fail',
          `This figure has ${captions.length} captions. A figure takes one, and browsers tie only the first to the figure, so the rest is read as loose text. Merge them into one figcaption.`,
          `Cette figure a ${captions.length} légendes. Une figure n’en accepte qu’une, et les navigateurs ne rattachent que la première à la figure\u00A0: le reste est lu comme du texte isolé. Fusionnez-les en un seul figcaption.`,
        );
      } else if (captions[0] && children.length > 2 && children[0] !== captions[0] && children[children.length - 1] !== captions[0]) {
        add(
          captions[0],
          'figcaption-misplaced',
          'fail',
          'This caption sits in the middle of its figure. A figcaption must be the first or the last child, or browsers do not treat it as the caption of the figure. Move it to the start or the end.',
          'Cette légende se trouve au milieu de sa figure. Un figcaption doit être le premier ou le dernier enfant, sinon les navigateurs ne le traitent pas comme la légende de la figure. Déplacez-la au début ou à la fin.',
        );
      }
    }

    if (n.tag === 'img') {
      const role = attrOf(n, 'role').toLowerCase();
      const decorative = role === 'presentation' || role === 'none' || (n.attrs['alt'] !== undefined && attrOf(n, 'alt') === '');
      const names = [
        ...(attrOf(n, 'aria-label') !== '' ? ['aria-label'] : []),
        ...(attrOf(n, 'aria-labelledby') !== '' ? ['aria-labelledby'] : []),
        ...(attrOf(n, 'title') !== '' ? ['title'] : []),
        ...((role === 'presentation' || role === 'none') && attrOf(n, 'alt') !== '' ? ['alt'] : []),
      ];
      if (decorative && names.length > 0 && !ancestorsOf(nodes, n).some((x) => x.tag === 'svg')) {
        add(
          n,
          'decorative-conflict',
          'unknown',
          `This image is marked as decoration (${role === 'presentation' || role === 'none' ? `role ${role}` : 'an empty alt'}) and also has ${names.join(' and ')}. Some screen readers skip it and others read the name. Check which is meant: give it a real alt, or remove the name.`,
          `Cette image est marquée comme décorative (${role === 'presentation' || role === 'none' ? `rôle ${role}` : 'un alt vide'}) et porte aussi ${names.join(' et ')}. Certains lecteurs d’écran la sautent et d’autres lisent le nom. Contrôlez ce qui est voulu\u202F; donnez-lui un vrai alt, ou retirez le nom.`,
        );
      }
      if (attrOf(n, 'longdesc') !== '') {
        add(
          n,
          'longdesc',
          'unknown',
          'This image has a longdesc attribute, which is obsolete. Most browsers and screen readers give no way to open it, and sighted people never see it. Put the long description in the page, or link to it next to the image.',
          'Cette image a un attribut longdesc, qui est obsolète. La plupart des navigateurs et des lecteurs d’écran n’offrent aucun moyen de l’ouvrir, et on ne le voit jamais à l’écran. Placez la description longue dans la page, ou ajoutez un lien vers elle à côté de l’image.',
        );
      }
    }
  }
  return { checked, entries: inFileOrder(entries) };
}
