import { isFocusable } from './handlers.js';
import { parseHtml, type HtmlNode } from './htmllint.js';
import { ancestorsOf, attrOf, inFileOrder, isHiddenNode, nodeLabel, tokensOf } from './markup.js';
import { clip, t, type CheckResult, type Entry } from './types.js';

/**
 * Symbols, emoji and icon fonts used as text (WCAG 1.1.1). A screen reader
 * reads a symbol by its character name ("multiplication sign" for a close
 * button), reads an icon font glyph as nothing or as a stray letter, and reads
 * every emoji in a row in full. How each one is spoken depends on the screen
 * reader and its language, which the markup cannot show, so every finding is
 * UNKNOWN. Text that CSS adds is the generated check.
 */

export type SymbolRule = 'symbol-only-name' | 'private-use-glyph' | 'icon-not-hidden' | 'emoji-run';

export const SYMBOL_RULES: readonly SymbolRule[] = ['symbol-only-name', 'private-use-glyph', 'icon-not-hidden', 'emoji-run'];

/** Emoji in a row from which the run is asked about. */
export const EMOJI_RUN = 3;

const PRIVATE_USE = /[\uE000-\uF8FF]/u;
const LETTER_OR_DIGIT = /[\p{L}\p{N}]/u;
const EMOJI_SEQUENCE = /(?:\p{Extended_Pictographic}[\uFE0F\u200D\p{Emoji_Modifier}]*\s*){3,}/u;
const EMOJI = /\p{Extended_Pictographic}/gu;
/** Class names of the common icon fonts. */
export const ICON_CLASS = /^(?:fa|fas|far|fab|fal|fad|fa-[a-z0-9-]+|icon|icon-[a-z0-9-]+|glyphicon|glyphicon-[a-z0-9-]+|material-icons(?:-[a-z]+)?|material-symbols-[a-z]+|bi|bi-[a-z0-9-]+|mdi|mdi-[a-z0-9-]+|oi|ion-[a-z0-9-]+|ti|ti-[a-z0-9-]+)$/i;

const CONTROL_ROLES = new Set(['button', 'link', 'tab', 'menuitem', 'switch', 'checkbox']);

/** True when the text has something to read and none of it is a letter or a digit. */
export function isSymbolOnly(text: string): boolean {
  const s = text.replace(/\s+/g, '');
  return s !== '' && !LETTER_OR_DIGIT.test(s);
}

/** True when one of the classes is an icon font class. */
export function hasIconClass(n: HtmlNode): boolean {
  return tokensOf(attrOf(n, 'class')).some((c) => ICON_CLASS.test(c));
}

export function auditSymbols(html: string): CheckResult {
  const { nodes } = parseHtml(html);
  const entries: Entry[] = [];
  let checked = 0;
  const add = (n: HtmlNode, rule: SymbolRule, en: string, fr: string): void => {
    entries.push({ check: 'symbols', id: nodeLabel(n), status: 'unknown', rule, message: t(en, fr) });
  };
  const named = (n: HtmlNode): boolean => attrOf(n, 'aria-label') !== '' || attrOf(n, 'aria-labelledby') !== '' || attrOf(n, 'title') !== '';
  const altInside = (n: HtmlNode): boolean => {
    const stack = [...n.children];
    let guard = 0;
    while (stack.length > 0 && guard++ < 10000) {
      const c = nodes[stack.pop() ?? -1];
      if (!c) continue;
      if ((c.tag === 'img' && attrOf(c, 'alt') !== '') || named(c)) return true;
      stack.push(...c.children);
    }
    return false;
  };

  for (const n of nodes) {
    if (n.tag === 'script' || n.tag === 'style' || n.tag === 'head' || n.tag === 'title' || n.tag === 'html' || n.tag === 'body') continue;
    if (isHiddenNode(nodes, n)) continue;
    const role = tokensOf(attrOf(n, 'role').toLowerCase())[0] ?? '';
    const control = n.tag === 'button' || n.tag === 'summary' || (n.tag === 'a' && n.attrs['href'] !== undefined) || CONTROL_ROLES.has(role);

    if (control) {
      checked++;
      if (!named(n) && !altInside(n) && isSymbolOnly(n.text) && !PRIVATE_USE.test(n.text)) {
        add(
          n,
          'symbol-only-name',
          `The only name of this ${n.tag} is the symbol “${clip(n.text, 12)}”. A screen reader reads the name of the character, which may say nothing about what the control does, and voice control users cannot say it. Add words, in the text or with aria-label.`,
          `Le seul nom de ce ${n.tag} est le symbole «\u202F${clip(n.text, 12)}\u202F». Un lecteur d’écran lit le nom du caractère, qui peut ne rien dire de ce que fait la commande, et on ne peut pas le prononcer en commande vocale. Ajoutez des mots, dans le texte ou avec aria-label.`,
        );
      }
    }

    if (n.own !== '') {
      checked++;
      if (PRIVATE_USE.test(n.own)) {
        add(
          n,
          'private-use-glyph',
          `The text of this ${n.tag} holds a private use character, which only an icon font can draw. Screen readers skip it or read a stray sound, and it turns into an empty box when a person replaces the fonts. Hide it with aria-hidden and add real words.`,
          `Le texte de ce ${n.tag} contient un caractère à usage privé, que seule une police d’icônes sait dessiner. Les lecteurs d’écran le sautent ou lisent un son parasite, et il devient un carré vide quand une personne remplace les polices. Masquez-le avec aria-hidden et ajoutez de vrais mots.`,
        );
      }
      if (EMOJI_SEQUENCE.test(n.own)) {
        const count = (n.own.match(EMOJI) ?? []).length;
        add(
          n,
          'emoji-run',
          `The text of this ${n.tag} has ${count} emoji, several of them in a row. A screen reader reads the full name of each one, which can bury the message. Keep one, at the end of the sentence.`,
          `Le texte de ce ${n.tag} compte ${count} émojis, dont plusieurs de suite. Un lecteur d’écran lit le nom complet de chacun, ce qui peut noyer le message. Gardez-en un seul, en fin de phrase.`,
        );
      }
    }

    if ((n.tag === 'i' || n.tag === 'span') && hasIconClass(n) && n.children.length === 0 && !named(n) && role !== 'img' && !isFocusable(n)) {
      checked++;
      const ligature = n.own.trim() !== '' && LETTER_OR_DIGIT.test(n.own);
      const inNamedControl = ancestorsOf(nodes, n).some((a) => a.tag === 'button' || a.tag === 'a' || CONTROL_ROLES.has(tokensOf(attrOf(a, 'role').toLowerCase())[0] ?? ''));
      if (ligature || !PRIVATE_USE.test(n.own)) {
        add(
          n,
          'icon-not-hidden',
          ligature
            ? `This icon is drawn from the word “${clip(n.own, 20)}” by an icon font, and it is not hidden from assistive technology. A screen reader reads that word aloud${inNamedControl ? ', next to the name of the control' : ''}. Add aria-hidden to the icon, and give its meaning in real text if it has one.`
            : `This ${n.tag} is an icon from an icon font and is not hidden from assistive technology. Depending on the font, a screen reader reads nothing or a stray character${inNamedControl ? ' inside the control' : ''}. Add aria-hidden to the icon, and give its meaning in real text if it has one.`,
          ligature
            ? `Cette icône est dessinée à partir du mot «\u202F${clip(n.own, 20)}\u202F» par une police d’icônes, et elle n’est pas masquée aux technologies d’assistance. Un lecteur d’écran lit ce mot à voix haute${inNamedControl ? ', à côté du nom de la commande' : ''}. Ajoutez aria-hidden à l’icône, et donnez son sens en vrai texte si elle en a un.`
            : `Ce ${n.tag} est une icône d’une police d’icônes et n’est pas masqué aux technologies d’assistance. Selon la police, un lecteur d’écran ne lit rien ou lit un caractère parasite${inNamedControl ? ' dans la commande' : ''}. Ajoutez aria-hidden à l’icône, et donnez son sens en vrai texte si elle en a un.`,
        );
      }
    }
  }
  return { checked, entries: inFileOrder(entries) };
}
