import { clip, t, type CheckResult, type Entry } from './types.js';
import type { PictureFact } from './structure.js';

/**
 * Images on the rendered page (WCAG 1.1.1). An image the browser could not
 * load and an alt text that is a file name are measured failures. An alt text
 * that is a generic word, starts with “image of”, repeats the text of the link
 * around it or is very long need a person to read them, so they are UNKNOWN.
 * An image with no alt attribute is already a rule of the static-html check.
 */

export type ImageRule = 'broken' | 'alt-filename' | 'alt-generic' | 'alt-prefix' | 'alt-redundant' | 'alt-long';

export const IMAGE_RULES: readonly ImageRule[] = ['broken', 'alt-filename', 'alt-generic', 'alt-prefix', 'alt-redundant', 'alt-long'];

/** Alt texts longer than this many characters are asked about. */
export const ALT_LONG = 150;

const GENERIC = new Set(['image', 'photo', 'picture', 'graphic', 'icon', 'illustration', 'banner', 'img', 'figure', 'logo', 'pic', 'photographie', 'dessin', 'bannière', 'icône', 'graphique']);

export const isFilename = (alt: string): boolean => /\.(png|jpe?g|gif|webp|svg|avif|bmp|tiff?)$/i.test(alt.trim()) || /^(img|dsc|image|photo|screenshot|capture)[-_ ]?\d{2,}/i.test(alt.trim());

export const hasPrefix = (alt: string): boolean => /^(an? )?(image|picture|photo|graphic|screenshot)s? (of|showing)\b|^(une? )?(image|photo|capture|illustration) (de |d['’]|du |des |montrant )/i.test(alt.trim());

const norm = (s: string): string => s.replace(/\s+/g, ' ').trim().toLowerCase();

export function auditImages(images: readonly PictureFact[]): CheckResult {
  const entries: Entry[] = [];
  const add = (f: PictureFact, status: 'fail' | 'unknown', rule: ImageRule, en: string, fr: string): void => {
    entries.push({ check: 'images', id: f.id, status, rule, message: t(en, fr) });
  };
  for (const f of images) {
    const label = clip(f.alt ?? '', 30);
    if (f.broken) {
      add(f, 'fail', 'broken', 'This image did not load, so people see a broken box or only its alt text.', 'Cette image ne s’est pas chargée, les personnes voient donc une case cassée ou seulement son texte alternatif.');
    }
    if (f.alt === null || f.alt.trim() === '') continue;
    if (isFilename(f.alt)) {
      add(
        f,
        'fail',
        'alt-filename',
        `The alt text “${label}” is a file name. It says nothing about the image. Describe what it shows, or use an empty alt if it is decoration.`,
        `Le texte alternatif «\u202F${label}\u202F» est un nom de fichier. Il ne dit rien de l’image. Décrivez ce qu’elle montre, ou utilisez un alt vide si elle est décorative.`,
      );
      continue;
    }
    if (GENERIC.has(norm(f.alt))) {
      add(
        f,
        'unknown',
        'alt-generic',
        `The alt text “${label}” is a generic word. Check that it says what this image shows.`,
        `Le texte alternatif «\u202F${label}\u202F» est un mot générique. Contrôlez qu’il dit ce que montre cette image.`,
      );
    } else if (hasPrefix(f.alt)) {
      add(
        f,
        'unknown',
        'alt-prefix',
        `The alt text “${label}” starts by naming the kind of picture. A screen reader already says it is an image. Start with what it shows.`,
        `Le texte alternatif «\u202F${label}\u202F» commence par nommer le type d’image. Un lecteur d’écran dit déjà que c’est une image. Commencez par ce qu’elle montre.`,
      );
    }
    if (f.linkText !== '' && norm(f.linkText) === norm(f.alt)) {
      add(
        f,
        'unknown',
        'alt-redundant',
        `The alt text “${label}” repeats the text of the link around the image, so a screen reader says it twice. Use an empty alt for the image.`,
        `Le texte alternatif «\u202F${label}\u202F» répète le texte du lien autour de l’image, un lecteur d’écran le dit donc deux fois. Utilisez un alt vide pour l’image.`,
      );
    }
    if (f.alt.length > ALT_LONG) {
      add(
        f,
        'unknown',
        'alt-long',
        `The alt text is ${f.alt.length} characters long. Check that a long description is not better placed in the page text.`,
        `Le texte alternatif fait ${f.alt.length} caractères. Contrôlez qu’une longue description ne serait pas mieux placée dans le texte de la page.`,
      );
    }
  }
  return { checked: images.length, entries };
}
