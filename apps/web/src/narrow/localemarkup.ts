import { parseHtml, type HtmlNode } from './htmllint.js';
import { attrOf, inFileOrder, nodeLabel } from './markup.js';
import { clip, t, type CheckResult, type Entry, type EntryStatus } from './types.js';

/**
 * Language settings in the markup beyond the lang of the page (WCAG 3.1.1 and
 * 3.1.2). A bdo element with no direction does nothing, which is measured and
 * fails. An empty lang attribute tells a screen reader that the language is
 * not known, a content-language meta that names another language than the
 * html element can pick the wrong voice or dictionary, and switching
 * translation off for the whole page shuts out people who read neither
 * English nor French. Whether each is a problem depends on the content, so
 * they are UNKNOWN. A lang that is missing or not a language code is a
 * static-html rule, and an invalid dir belongs to the document check.
 */

export type LocaleMarkupRule = 'bdo-no-dir' | 'lang-empty' | 'content-language-mismatch' | 'translate-off-page' | 'translate-invalid';

export const LOCALE_MARKUP_RULES: readonly LocaleMarkupRule[] = ['bdo-no-dir', 'lang-empty', 'content-language-mismatch', 'translate-off-page', 'translate-invalid'];

const primary = (lang: string): string => (lang.trim().toLowerCase().split(/[-_]/)[0] ?? '');
/** Elements that hold all or most of a page. */
const WHOLE_PAGE = new Set(['html', 'body', 'main']);

export function auditLocaleMarkup(html: string): CheckResult {
  const { nodes } = parseHtml(html);
  const entries: Entry[] = [];
  let checked = 0;
  const add = (n: HtmlNode, rule: LocaleMarkupRule, status: EntryStatus, en: string, fr: string): void => {
    entries.push({ check: 'locale-markup', id: nodeLabel(n), status, rule, message: t(en, fr) });
  };
  const htmlNode = nodes.find((n) => n.tag === 'html');
  const pageLang = htmlNode ? primary(attrOf(htmlNode, 'lang')) : '';

  for (const n of nodes) {
    if (n.tag === 'bdo') {
      checked++;
      if (attrOf(n, 'dir') === '') {
        add(
          n,
          'bdo-no-dir',
          'fail',
          `This bdo element (“${clip(n.text, 24)}”) has no dir attribute. bdo exists to force a direction, and without dir it does nothing, so text meant to run the other way is shown and read in the usual order. Add dir with rtl or ltr.`,
          `Cet élément bdo («\u202F${clip(n.text, 24)}\u202F») n’a pas d’attribut dir. bdo sert à imposer une direction, et sans dir il ne fait rien\u00A0: un texte prévu dans l’autre sens est affiché et lu dans l’ordre habituel. Ajoutez dir avec rtl ou ltr.`,
        );
      }
    }

    if (n.attrs['lang'] !== undefined && attrOf(n, 'lang') === '' && n.tag !== 'html') {
      checked++;
      add(
        n,
        'lang-empty',
        'unknown',
        `This ${n.tag} has an empty lang attribute, which says its language is not known. A screen reader then guesses, or keeps the voice of the text before it. If the language is known, name it. If the content really has none, such as a product code, leave it.`,
        `Ce ${n.tag} a un attribut lang vide, ce qui indique que sa langue est inconnue. Un lecteur d’écran devine alors, ou garde la voix du texte précédent. Si la langue est connue, nommez-la. Si le contenu n’en a vraiment pas, comme un code de produit, laissez-le ainsi.`,
      );
    }

    if (n.tag === 'meta' && attrOf(n, 'http-equiv').toLowerCase() === 'content-language') {
      checked++;
      const declared = attrOf(n, 'content').split(',').map(primary).filter((x) => x !== '');
      if (pageLang !== '' && declared.length > 0 && !declared.includes(pageLang)) {
        add(
          n,
          'content-language-mismatch',
          'unknown',
          `The content-language meta says “${clip(attrOf(n, 'content'), 20)}” and the html element says “${clip(attrOf(htmlNode as HtmlNode, 'lang'), 12)}”. Browsers follow the html element, but some tools read the meta, so translation and spelling tools can pick the wrong language. Make them agree, or remove the meta.`,
          `Le meta content-language indique «\u202F${clip(attrOf(n, 'content'), 20)}\u202F» et l’élément html indique «\u202F${clip(attrOf(htmlNode as HtmlNode, 'lang'), 12)}\u202F». Les navigateurs suivent l’élément html, mais certains outils lisent le meta\u00A0: les outils de traduction et d’orthographe peuvent choisir la mauvaise langue. Accordez-les, ou retirez le meta.`,
        );
      }
    }

    const translate = n.attrs['translate'];
    const googleOff = n.tag === 'meta' && attrOf(n, 'name').toLowerCase() === 'google' && attrOf(n, 'content').toLowerCase().includes('notranslate');
    if (translate !== undefined || googleOff) {
      checked++;
      const value = (translate ?? '').trim().toLowerCase();
      if (translate !== undefined && value !== '' && value !== 'yes' && value !== 'no') {
        add(
          n,
          'translate-invalid',
          'fail',
          `translate is set to “${clip(translate, 16)}”, which is not yes or no. Browsers ignore it, so the element is translated or not according to its parent, whatever was meant. Use yes or no.`,
          `translate vaut «\u202F${clip(translate, 16)}\u202F», qui n’est ni yes ni no. Les navigateurs l’ignorent\u00A0: l’élément est traduit ou non selon son parent, quelle que soit l’intention. Utilisez yes ou no.`,
        );
      } else if ((value === 'no' && WHOLE_PAGE.has(n.tag)) || googleOff) {
        add(
          n,
          'translate-off-page',
          'unknown',
          `Translation is switched off for the whole page (${googleOff ? 'a notranslate meta' : `translate="no" on ${n.tag}`}). People who read neither English nor French rely on the translation of their browser. Check that this is needed, and switch it off only on names, addresses and codes.`,
          `La traduction est désactivée pour toute la page (${googleOff ? 'un meta notranslate' : `translate="no" sur ${n.tag}`}). Les personnes qui ne lisent ni l’anglais ni le français comptent sur la traduction de leur navigateur. Contrôlez que c’est nécessaire, et ne la désactivez que sur les noms, les adresses et les codes.`,
        );
      }
    }
  }
  return { checked, entries: inFileOrder(entries) };
}
