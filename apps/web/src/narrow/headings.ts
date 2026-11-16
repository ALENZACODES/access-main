import { clip, t, type CheckResult, type Entry, type Lang } from './types.js';
import { primary } from './langparts.js';
import type { HeadingFact, ProseFacts } from './prose.js';

/**
 * Headings and the page title that say what the part or page is about (WCAG
 * 2.4.6 for headings, 2.4.2 for titles). A program can see that a heading is
 * the word "Untitled" or a page title shares nothing with its main heading,
 * and cannot see whether the words are good ones. Every finding is UNKNOWN.
 * Empty headings and a missing title are static-html rules and are not
 * repeated here.
 */

export type HeadingRule =
  | 'heading-generic'
  | 'heading-duplicate'
  | 'heading-long'
  | 'heading-sentence'
  | 'heading-caps'
  | 'heading-number'
  | 'title-generic'
  | 'title-h1-differs';

export const HEADING_RULES: readonly HeadingRule[] = [
  'heading-generic',
  'heading-duplicate',
  'heading-long',
  'heading-sentence',
  'heading-caps',
  'heading-number',
  'title-generic',
  'title-h1-differs',
];

/** Headings with more words than this are asked about. */
export const MAX_HEADING_WORDS = 14;
/** A heading that ends in a full stop and has at least this many words reads as a paragraph. */
export const SENTENCE_WORDS = 6;
/** All-capital headings with at least this many words are asked about. */
export const CAPS_WORDS = 3;

const GENERIC_HEADINGS: Readonly<Record<Lang, ReadonlySet<string>>> = {
  en: new Set(['untitled', 'heading', 'title', 'subtitle', 'section', 'new section', 'page', 'page title', 'header', 'text', 'content', 'click here', 'read more', 'more', 'default', 'lorem ipsum', 'heading text']),
  fr: new Set(['sans titre', 'titre', 'sous-titre', 'section', 'nouvelle section', 'page', 'titre de la page', 'en-tête', 'texte', 'contenu', 'cliquez ici', 'en savoir plus', 'plus', 'par défaut', 'texte du titre']),
};
const GENERIC_TITLES: ReadonlySet<string> = new Set([
  'untitled', 'untitled document', 'document', 'new tab', 'index', 'react app', 'vite app', 'page', 'title', 'my app', 'welcome', 'localhost',
  'sans titre', 'document sans titre', 'nouvel onglet', 'accueil page', 'titre', 'mon application', 'bienvenue',
]);
const NUMBERED = /^(?:section|heading|titre|chapter|chapitre|part|partie|step|étape|page)\s*\d+$/iu;
const STOP: ReadonlySet<string> = new Set(['the', 'and', 'for', 'with', 'your', 'our', 'les', 'des', 'pour', 'avec', 'votre', 'notre', 'une', 'dans', 'sur', 'page', 'site']);

export const normalise = (s: string): string =>
  s
    .toLowerCase()
    .replace(/[’']/g, '’')
    .replace(/[\s\u00A0\u202F]+/g, ' ')
    .trim()
    .replace(/[.:!?]+$/u, '')
    .trim();

const wordCount = (s: string): number => (s.match(/[\p{L}\p{N}][\p{L}\p{N}’'-]*/gu) ?? []).length;
const keyWords = (s: string): Set<string> => new Set((s.toLowerCase().match(/[\p{L}]{3,}/gu) ?? []).filter((w) => !STOP.has(w)));

const langOf = (pageLang: string): Lang => (primary(pageLang) === 'fr' ? 'fr' : 'en');

export function auditHeadings(f: ProseFacts): CheckResult {
  const entries: Entry[] = [];
  const lang = langOf(f.pageLang);
  const add = (id: string, rule: HeadingRule, en: string, fr: string): void => {
    entries.push({ check: 'headings', id, status: 'unknown', rule, message: t(en, fr) });
  };
  const seen = new Map<string, HeadingFact>();
  let checked = 0;
  for (const h of f.headings) {
    const text = h.text.trim();
    if (text === '') continue;
    checked++;
    const norm = normalise(text);
    const shown = clip(text, 36);
    const words = wordCount(text);
    if (GENERIC_HEADINGS[lang].has(norm) || NUMBERED.test(norm)) {
      add(
        h.id,
        'heading-generic',
        `The heading “${shown}” does not say what its section is about. Name the topic.`,
        `Le titre «\u202F${shown}\u202F» ne dit pas de quoi parle sa section. Nommez le sujet.`,
      );
    } else if (/^[\d\s.,:;/()%$€£-]+$/u.test(text)) {
      add(
        h.id,
        'heading-number',
        `The heading “${shown}” is only numbers. Add words that say what the number is.`,
        `Le titre «\u202F${shown}\u202F» ne contient que des chiffres. Ajoutez des mots qui disent ce que le nombre représente.`,
      );
    }
    const first = seen.get(norm);
    if (first && norm !== '') {
      add(
        h.id,
        'heading-duplicate',
        `The heading “${shown}” is used more than once on this page (first at ${first.id}). Headings that repeat do not tell sections apart.`,
        `Le titre «\u202F${shown}\u202F» est utilisé plus d’une fois sur cette page (la première fois à ${first.id}). Des titres répétés ne distinguent pas les sections.`,
      );
    } else {
      seen.set(norm, h);
    }
    if (words > MAX_HEADING_WORDS) {
      add(
        h.id,
        'heading-long',
        `The heading “${shown}” has ${words} words. A heading is easier to scan at ${MAX_HEADING_WORDS} words or fewer.`,
        `Le titre «\u202F${shown}\u202F» compte ${words} mots. Un titre se parcourt plus facilement à ${MAX_HEADING_WORDS} mots ou moins.`,
      );
    } else if (words >= SENTENCE_WORDS && /[.]$/u.test(text)) {
      add(
        h.id,
        'heading-sentence',
        `The heading “${shown}” ends with a full stop and reads like a paragraph. If it is not a heading, use a paragraph; if it is, shorten it.`,
        `Le titre «\u202F${shown}\u202F» se termine par un point et se lit comme un paragraphe. Si ce n’est pas un titre, utilisez un paragraphe\u202F; sinon, raccourcissez-le.`,
      );
    }
    const letters = text.replace(/[^\p{L}]/gu, '');
    if (words >= CAPS_WORDS && letters.length >= 6 && letters === letters.toUpperCase()) {
      add(
        h.id,
        'heading-caps',
        `The heading “${shown}” is in capitals. Capitals are harder to read and some screen readers spell them out.`,
        `Le titre «\u202F${shown}\u202F» est en majuscules. Les majuscules sont plus difficiles à lire et certains lecteurs d’écran les épellent.`,
      );
    }
  }
  const title = f.title.trim();
  if (title !== '') {
    checked++;
    if (GENERIC_TITLES.has(normalise(title))) {
      add(
        'title',
        'title-generic',
        `The page title “${clip(title, 36)}” is a placeholder. A title that names the page helps people who have several tabs open.`,
        `Le titre de page «\u202F${clip(title, 36)}\u202F» est générique. Un titre qui nomme la page aide les personnes qui ont plusieurs onglets ouverts.`,
      );
    } else {
      const h1 = f.headings.find((h) => h.level === 1 && h.text.trim() !== '');
      if (h1) {
        const a = keyWords(title);
        const b = keyWords(h1.text);
        if (a.size > 0 && b.size > 0 && ![...a].some((w) => b.has(w))) {
          add(
            'title',
            'title-h1-differs',
            `The page title “${clip(title, 30)}” and the main heading “${clip(h1.text, 30)}” share no words. Check that both name the same page.`,
            `Le titre de page «\u202F${clip(title, 30)}\u202F» et le titre principal «\u202F${clip(h1.text, 30)}\u202F» n’ont aucun mot en commun. Contrôlez qu’ils nomment bien la même page.`,
          );
        }
      }
    }
  }
  return { checked, entries };
}
