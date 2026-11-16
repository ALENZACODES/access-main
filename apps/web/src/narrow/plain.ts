import { clip, t, type CheckResult, type Entry, type Lang } from './types.js';
import { MIN_WORDS, primary, type TextBlock } from './langparts.js';
import type { ProseFacts } from './prose.js';

/**
 * Plain language (WCAG 3.1.5 and 3.1.4 ask for text a wide range of readers
 * can follow, and for abbreviations to be explained). Everything here is a
 * prompt to look: the numbers come from word counts and a syllable guess, so
 * they are rough, names and quotations can trip them, and every finding is
 * UNKNOWN. A person decides.
 */

export type PlainRule = 'long-sentence' | 'hard-to-read' | 'abbreviation' | 'all-caps' | 'dense-block' | 'jargon';

export const PLAIN_RULES: readonly PlainRule[] = ['long-sentence', 'hard-to-read', 'abbreviation', 'all-caps', 'dense-block', 'jargon'];

/** Longest sentence, in words, before a block is asked about. */
export const MAX_SENTENCE: Readonly<Record<Lang, number>> = { en: 30, fr: 35 };
/** A block with more words than this, in one piece, is asked about. */
export const MAX_BLOCK_WORDS = 120;
/** Blocks with fewer words are not scored for reading level. */
export const MIN_SCORED_WORDS = 40;
/** English grade above this, or French ease below FR_EASE_MIN, is asked about. */
export const EN_GRADE_MAX = 10;
export const FR_EASE_MIN = 40;
/** Consecutive all-capital words that count as a shouted run. */
export const CAPS_RUN = 4;

const WORD = /[\p{L}][\p{L}’'-]*/gu;

export const wordsOf = (text: string): string[] => text.match(WORD) ?? [];

/** Sentences, split after . ! ? or an ellipsis that is followed by a capital letter, an opening quote or a line break. */
export function sentencesOf(text: string): string[] {
  return text
    .split(/(?<=[.!?…])\s+(?=[\p{Lu}«"“(])|\n+/u)
    .map((s) => s.trim())
    .filter((s) => wordsOf(s).length > 0);
}

/** A guess at the syllables of a word. Silent endings are removed, and a word has at least one. */
export function syllables(word: string, lang: Lang): number {
  const w = word.toLowerCase().replace(/[’'-]/g, '');
  if (w === '') return 0;
  const groups = lang === 'en' ? /[aeiouy]+/g : /[aeiouyàâäéèêëîïôöûùüœæ]+/g;
  let n = (w.match(groups) ?? []).length;
  if (lang === 'en') {
    if (/[^aeiouy]e$/.test(w) && !/[^aeiouy]le$/.test(w) && n > 1) n--;
    if (/[^aeiouy]es$|[^aeiouy]ed$/.test(w) && n > 1 && !/(ses|ces|ges|zes|xes|ted|ded)$/.test(w)) n--;
  } else if (w.length > 3 && /[^aeiouyàâäéèêëîïôöûùüœæ](e|es|ent)$/.test(w) && n > 1) {
    n--;
  }
  return Math.max(1, n);
}

export interface Reading {
  readonly words: number;
  readonly sentences: number;
  readonly syllables: number;
  /** Flesch-Kincaid grade for English, Kandel-Moles ease for French. */
  readonly score: number;
}

/** Reading figures for a text, or null when it has no words. */
export function reading(text: string, lang: Lang): Reading | null {
  const words = wordsOf(text);
  const sentences = sentencesOf(text).length;
  if (words.length === 0 || sentences === 0) return null;
  const syl = words.reduce((n, w) => n + syllables(w, lang), 0);
  const wps = words.length / sentences;
  const spw = syl / words.length;
  const score = lang === 'en' ? 0.39 * wps + 11.8 * spw - 15.59 : 207 - 1.015 * wps - 73.6 * spw;
  return { words: words.length, sentences, syllables: syl, score: Math.round(score * 10) / 10 };
}

/** Longer words and phrases that have a plainer one. The first alternative is what the message offers. */
export const JARGON: Readonly<Record<Lang, ReadonlyArray<readonly [string, string]>>> = {
  en: [
    ['utilize', 'use'],
    ['utilise', 'use'],
    ['in order to', 'to'],
    ['prior to', 'before'],
    ['subsequent to', 'after'],
    ['commence', 'start'],
    ['terminate', 'end'],
    ['endeavour', 'try'],
    ['endeavor', 'try'],
    ['ascertain', 'find out'],
    ['facilitate', 'help'],
    ['numerous', 'many'],
    ['approximately', 'about'],
    ['in the event that', 'if'],
    ['with regard to', 'about'],
    ['due to the fact that', 'because'],
    ['at this point in time', 'now'],
    ['demonstrate', 'show'],
    ['purchase', 'buy'],
    ['remuneration', 'pay'],
  ],
  fr: [
    ['afin de', 'pour'],
    ['à l’heure actuelle', 'maintenant'],
    ['au sein de', 'dans'],
    ['néanmoins', 'mais'],
    ['toutefois', 'mais'],
    ['effectuer', 'faire'],
    ['procéder à', 'faire'],
    ['dans le cadre de', 'pour'],
    ['en vue de', 'pour'],
    ['ultérieurement', 'plus tard'],
    ['préalablement', 'avant'],
    ['au moyen de', 'avec'],
    ['bénéficier de', 'avoir'],
    ['disposer de', 'avoir'],
    ['nonobstant', 'malgré'],
    ['subséquemment', 'ensuite'],
    ['dorénavant', 'à partir de maintenant'],
    ['rémunération', 'paie'],
  ],
};

const apos = (s: string): string => s.replace(/’/g, '[’\']');
const JARGON_RE: Readonly<Record<Lang, ReadonlyArray<{ re: RegExp; term: string; plain: string }>>> = {
  en: JARGON.en.map(([term, plain]) => ({ re: new RegExp(`(?<![\\p{L}])${apos(term)}(?![\\p{L}])`, 'iu'), term, plain })),
  fr: JARGON.fr.map(([term, plain]) => ({ re: new RegExp(`(?<![\\p{L}])${apos(term)}(?![\\p{L}])`, 'iu'), term, plain })),
};

/** The jargon found in a text, once each, in the order of the list. */
export function jargonIn(text: string, lang: Lang): Array<{ term: string; plain: string }> {
  return JARGON_RE[lang].filter((j) => j.re.test(text)).map(({ term, plain }) => ({ term, plain }));
}

/** Short capital-letter words that readers meet everywhere, so they are not asked about. */
export const KNOWN_ABBREVIATIONS: ReadonlySet<string> = new Set([
  'OK', 'ID', 'PDF', 'URL', 'FAQ', 'AM', 'PM', 'EN', 'FR', 'GPS', 'USA', 'UK', 'ON', 'CA', 'QC', 'BC', 'AB', 'TTY', 'ATM', 'SMS', 'HTML', 'CSS', 'USB', 'WIFI', 'TV', 'ER', 'ICU', 'CD', 'DVD', 'VIP', 'TPS', 'TVH', 'NAS', 'CPU', 'RAM',
]);

/** Everyday words that show up in capitals when someone shouts them. They are not abbreviations. */
const SHOUTED: ReadonlySet<string> = new Set([
  'DO', 'NOT', 'NO', 'YES', 'STOP', 'THE', 'AND', 'FOR', 'ALL', 'NOW', 'ONLY', 'OPEN', 'CLOSED', 'ENTER', 'EXIT', 'THIS', 'THAT', 'ROOM', 'WARNING', 'DANGER', 'FREE', 'NEW', 'SALE', 'CALL', 'HERE', 'YOU', 'OUR', 'ARE', 'NOTE', 'PLEASE',
  'NE', 'PAS', 'NON', 'OUI', 'LE', 'LA', 'LES', 'ET', 'POUR', 'TOUS', 'TOUT', 'ICI', 'ENTRÉE', 'SORTIE', 'OUVERT', 'FERMÉ', 'ATTENTION', 'DANGER', 'GRATUIT', 'NOUVEAU', 'VOUS', 'NOTRE', 'SONT', 'DE', 'DU', 'DES', 'UN', 'UNE',
]);

/** Capital-letter words of two to six letters that are not everyday words, once each, in the order they appear. */
export function abbreviationsIn(text: string): string[] {
  const found: string[] = [];
  for (const m of text.matchAll(/(?<![\p{L}\d])[\p{Lu}]{2,6}(?![\p{L}\d])/gu)) {
    if (SHOUTED.has(m[0])) continue;
    if (!found.includes(m[0])) found.push(m[0]);
  }
  return found;
}

/** True when the text explains the abbreviation next to it, as in "Occupational therapy (OT)" or "OT (occupational therapy)". */
export function explained(text: string, abbr: string): boolean {
  const a = abbr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`\\(\\s*${a}\\s*\\)|${a}\\s*\\(|${a}\\s*[:–—-]\\s*\\p{L}|\\p{L}\\s*[–—-]\\s*${a}`, 'u').test(text);
}

/** Longest run of consecutive words that are all capitals, each of two or more letters. */
export function capsRun(text: string): { length: number; sample: string } {
  let best = { length: 0, sample: '' };
  let cur: string[] = [];
  const flush = (): void => {
    if (cur.length > best.length) best = { length: cur.length, sample: cur.join(' ') };
    cur = [];
  };
  for (const w of wordsOf(text)) {
    if (w.length >= 2 && w === w.toUpperCase() && w !== w.toLowerCase()) cur.push(w);
    else flush();
  }
  flush();
  return best;
}

const langOf = (b: TextBlock, pageLang: string): Lang | null => {
  const p = primary(b.lang || pageLang);
  return p === 'en' || p === 'fr' ? p : null;
};

export function auditPlain(f: ProseFacts): CheckResult {
  const entries: Entry[] = [];
  const add = (b: TextBlock, rule: PlainRule, en: string, fr: string): void => {
    entries.push({ check: 'plain', id: b.id, status: 'unknown', rule, message: t(en, fr) });
  };
  let checked = 0;
  const askedAbbr = new Set(f.abbrs.map((a) => a.toUpperCase()));
  for (const b of f.blocks) {
    const lang = langOf(b, f.pageLang);
    if (!lang) continue;
    const n = wordsOf(b.text).length;
    if (n < MIN_WORDS) continue;
    checked++;
    const sample = clip(b.text, 40);

    let longest = { words: 0, text: '' };
    for (const s of sentencesOf(b.text)) {
      const w = wordsOf(s).length;
      if (w > longest.words) longest = { words: w, text: s };
    }
    if (longest.words > MAX_SENTENCE[lang]) {
      add(
        b,
        'long-sentence',
        `This text has a sentence of ${longest.words} words (“${clip(longest.text, 40)}”). Sentences over ${MAX_SENTENCE[lang]} words are hard to follow. Try two shorter ones.`,
        `Ce texte a une phrase de ${longest.words} mots («\u202F${clip(longest.text, 40)}\u202F»). Les phrases de plus de ${MAX_SENTENCE[lang]} mots sont difficiles à suivre. Essayez deux phrases plus courtes.`,
      );
    }
    if (n > MAX_BLOCK_WORDS) {
      add(
        b,
        'dense-block',
        `This block of text has ${n} words with no break (“${sample}”). Headings, short paragraphs or a list help people who read slowly or with a screen reader.`,
        `Ce bloc de texte a ${n} mots sans coupure («\u202F${sample}\u202F»). Des titres, de courts paragraphes ou une liste aident les personnes qui lisent lentement ou avec un lecteur d’écran.`,
      );
    }
    if (n >= MIN_SCORED_WORDS) {
      const r = reading(b.text, lang);
      if (r && lang === 'en' && r.score > EN_GRADE_MAX) {
        add(
          b,
          'hard-to-read',
          `This text reads at about grade ${Math.round(r.score)} (by word and syllable counts, so only a rough guide). Shorter words and sentences would reach more people.`,
          `Ce texte se lit à peu près au niveau ${Math.round(r.score)} (selon les nombres de mots et de syllabes, ce n’est donc qu’un repère). Des mots et des phrases plus courts toucheraient plus de gens.`,
        );
      } else if (r && lang === 'fr' && r.score < FR_EASE_MIN) {
        add(
          b,
          'hard-to-read',
          `This text scores ${Math.round(r.score)} on the Kandel-Moles ease scale, where 40 or less is difficult (by word and syllable counts, so only a rough guide). Shorter words and sentences would reach more people.`,
          `Ce texte obtient ${Math.round(r.score)} sur l’échelle de facilité de Kandel et Moles, où 40 ou moins est difficile (selon les nombres de mots et de syllabes, ce n’est donc qu’un repère). Des mots et des phrases plus courts toucheraient plus de gens.`,
        );
      }
    }
    const caps = capsRun(b.text);
    if (caps.length >= CAPS_RUN) {
      add(
        b,
        'all-caps',
        `This text has ${caps.length} words in capitals in a row (“${clip(caps.sample, 36)}”). Capitals are harder to read and some screen readers spell them out.`,
        `Ce texte a ${caps.length} mots en majuscules à la suite («\u202F${clip(caps.sample, 36)}\u202F»). Les majuscules sont plus difficiles à lire et certains lecteurs d’écran les épellent.`,
      );
    }
    const unexplained = abbreviationsIn(b.text).filter((a) => !KNOWN_ABBREVIATIONS.has(a) && !askedAbbr.has(a) && !explained(b.text, a));
    if (unexplained.length > 0) {
      for (const a of unexplained) askedAbbr.add(a);
      const shown = unexplained.slice(0, 3).join(', ');
      add(
        b,
        'abbreviation',
        `This text uses ${unexplained.length === 1 ? 'an abbreviation' : 'abbreviations'} that ${unexplained.length === 1 ? 'is' : 'are'} not explained here (${shown}). Spell ${unexplained.length === 1 ? 'it' : 'them'} out the first time.`,
        `Ce texte utilise ${unexplained.length === 1 ? 'une abréviation' : 'des abréviations'} non expliquée${unexplained.length === 1 ? '' : 's'} ici (${shown}). Écrivez-${unexplained.length === 1 ? 'la' : 'les'} en toutes lettres la première fois.`,
      );
    }
    const jargon = jargonIn(b.text, lang);
    if (jargon.length > 0) {
      const shown = jargon.slice(0, 3).map((j) => `“${j.term}” → “${j.plain}”`);
      const shownFr = jargon.slice(0, 3).map((j) => `«\u202F${j.term}\u202F» → «\u202F${j.plain}\u202F»`);
      add(
        b,
        'jargon',
        `This text uses longer words where a plain one would do (${shown.join(', ')}).`,
        `Ce texte emploie des mots plus longs là où un mot simple suffirait (${shownFr.join(', ')}).`,
      );
    }
  }
  return { checked, entries };
}
