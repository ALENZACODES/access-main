import { parseHtml, type HtmlNode } from './htmllint.js';
import { attrOf, inFileOrder, nodeLabel } from './markup.js';
import { clip, t, type CheckResult, type Entry, type EntryStatus } from './types.js';

/**
 * Settings of the document as a whole, read from the markup (WCAG 3.1.1 for
 * language, 1.3.2 for text direction). A dir value the browser does not know
 * and two language declarations that disagree are measured, so they fail. A
 * base element that opens every link in a new tab, a page with no declared
 * character set, and a page that shows nothing until a script runs depend on
 * how the page is served and used, so they are UNKNOWN. A missing or malformed
 * lang, the title and the viewport are static-html rules.
 */

export type DocumentRule = 'dir-invalid' | 'xml-lang-mismatch' | 'base-target' | 'charset-missing' | 'script-only';

export const DOCUMENT_RULES: readonly DocumentRule[] = ['dir-invalid', 'xml-lang-mismatch', 'base-target', 'charset-missing', 'script-only'];

const DIRECTIONS = new Set(['ltr', 'rtl', 'auto']);
const primary = (lang: string): string => (lang.trim().toLowerCase().split('-')[0] ?? '');

export function auditDocument(html: string): CheckResult {
  const { nodes, isDocument } = parseHtml(html);
  const entries: Entry[] = [];
  let checked = 0;
  const add = (n: HtmlNode | null, rule: DocumentRule, status: EntryStatus, en: string, fr: string): void => {
    entries.push({ check: 'document', id: n ? nodeLabel(n) : 'html', status, rule, message: t(en, fr) });
  };

  for (const n of nodes) {
    if (n.attrs['dir'] !== undefined) {
      checked++;
      const value = attrOf(n, 'dir').toLowerCase();
      if (!DIRECTIONS.has(value)) {
        add(
          n,
          'dir-invalid',
          'fail',
          `This ${n.tag} has dir set to “${clip(attrOf(n, 'dir'), 20)}”, which is not a direction. Browsers ignore it, so right-to-left text can come out in the wrong order for readers and screen readers alike. Use ltr, rtl or auto.`,
          `Ce ${n.tag} a dir à «\u202F${clip(attrOf(n, 'dir'), 20)}\u202F», qui n’est pas une direction. Les navigateurs l’ignorent\u00A0: un texte de droite à gauche peut sortir dans le mauvais ordre, à l’écran comme au lecteur d’écran. Utilisez ltr, rtl ou auto.`,
        );
      }
    }

    if (n.tag === 'html' && attrOf(n, 'lang') !== '' && attrOf(n, 'xml:lang') !== '') {
      checked++;
      if (primary(attrOf(n, 'lang')) !== primary(attrOf(n, 'xml:lang'))) {
        add(
          n,
          'xml-lang-mismatch',
          'fail',
          `The page says lang “${clip(attrOf(n, 'lang'), 12)}” and xml:lang “${clip(attrOf(n, 'xml:lang'), 12)}”. Which one a screen reader follows depends on how the page is parsed, so it can read the page with the wrong voice. Make them the same, or remove xml:lang.`,
          `La page indique lang «\u202F${clip(attrOf(n, 'lang'), 12)}\u202F» et xml:lang «\u202F${clip(attrOf(n, 'xml:lang'), 12)}\u202F». Celui que suit un lecteur d’écran dépend de la façon dont la page est analysée\u00A0: il peut donc lire la page avec la mauvaise voix. Rendez-les identiques, ou retirez xml:lang.`,
        );
      }
    }

    if (n.tag === 'base' && attrOf(n, 'target') !== '') {
      checked++;
      const target = attrOf(n, 'target').toLowerCase();
      if (target !== '_self') {
        add(
          n,
          'base-target',
          'unknown',
          `The base element sends every link on the page to “${clip(attrOf(n, 'target'), 16)}”. Each link then opens a new tab or another frame with no warning, and the Back button stops working. Check that this is wanted, and say so on the links.`,
          `L’élément base envoie tous les liens de la page vers «\u202F${clip(attrOf(n, 'target'), 16)}\u202F». Chaque lien ouvre alors un nouvel onglet ou un autre cadre sans prévenir, et le bouton Précédent ne fonctionne plus. Contrôlez que c’est voulu, et dites-le sur les liens.`,
        );
      }
    }
  }

  if (isDocument) {
    const htmlNode = nodes.find((n) => n.tag === 'html') ?? null;
    checked++;
    const declared = nodes.some((n) => n.tag === 'meta' && (n.attrs['charset'] !== undefined || (attrOf(n, 'http-equiv').toLowerCase() === 'content-type' && /charset\s*=/i.test(attrOf(n, 'content')))));
    if (!declared) {
      add(
        htmlNode,
        'charset-missing',
        'unknown',
        'The page does not declare its character set in the markup. If the server does not send one either, accented letters and French punctuation can turn into wrong characters, which a screen reader then reads aloud. Add a meta charset of utf-8 at the top of the head.',
        'La page ne déclare pas son jeu de caractères dans le balisage. Si le serveur n’en envoie pas non plus, les lettres accentuées et la ponctuation française peuvent devenir de mauvais caractères, qu’un lecteur d’écran lit ensuite à voix haute. Ajoutez un meta charset utf-8 en haut du head.',
      );
    }

    const body = nodes.find((n) => n.tag === 'body');
    if (body) {
      checked++;
      const scripts = nodes.some((n) => n.tag === 'script');
      const fallback = nodes.filter((n) => n.tag === 'noscript').map((n) => n.text.trim()).join('');
      const visible = fallback === '' ? body.text.trim() : body.text.replace(fallback, '').trim();
      const pictures = nodes.some((n) => (n.tag === 'img' || n.tag === 'svg' || n.tag === 'video' || n.tag === 'canvas' || n.tag === 'iframe' || n.tag === 'input' || n.tag === 'button') && n.index > body.index);
      if (scripts && visible === '' && fallback === '' && !pictures) {
        add(
          body,
          'script-only',
          'unknown',
          'The markup of this page holds no text: everything is drawn by a script. If the script fails or is slow on a weak connection, people get a blank page with nothing to read or announce. Check what shows before the script runs, and add a noscript message.',
          'Le balisage de cette page ne contient aucun texte\u00A0: tout est dessiné par un script. Si le script échoue ou tarde sur une connexion faible, on obtient une page blanche, sans rien à lire ni à annoncer. Contrôlez ce qui s’affiche avant l’exécution du script, et ajoutez un message noscript.',
        );
      }
    }
  }
  return { checked, entries: inFileOrder(entries) };
}
