/**
 * Detects copy that was not translated. Three independent checks:
 *  1. catalogue entries whose French text is identical to the English text;
 *  2. English function words inside French text;
 *  3. "{placeholder}" markers that were never filled in.
 * The checks are heuristics with an explicit allow-list: a hit is a prompt to look, and the lists
 * below are small and exact so that a false alarm is easy to fix and a real leak is hard to hide.
 */
import { CATALOG, EN, FR, type MessageKey } from './i18n';
import { visibleText } from './copyLint';
import { UNKNOWN_WORD } from './unknownWord';

/** Messages that are legitimately the same in both languages (words that are spelled alike). */
export const SAME_IN_BOTH: readonly MessageKey[] = ['qa.counts.sources', 'tbl.sources', 'tbl.sourceCount', 'tbl.source', 'tbl.licence', 'csv.source', 'csv.licence', 'hist.date', 'due.source', 'comp.f.licence',
  // The token UNKNOWN is the same in both languages on purpose.
  'unknown', 'cov.unknown', 'comp.unknown',
];

/**
 * English words that are not French words. Words spelled the same in both languages (source, licence, page, date)
 * and short ambiguous ones (a, as, in, on, or, son) are left out on purpose.
 */
export const ENGLISH_MARKERS: readonly string[] = [
  'the', 'and', 'is', 'are', 'was', 'were', 'not', 'with', 'from', 'this', 'that', 'these', 'those', 'may', 'be', 'been', 'it',
  'its', 'your', 'you', 'has', 'have', 'had', 'before', 'after', 'because', 'when', 'which', 'would', 'should', 'could',
  'there', 'their', 'than', 'then', 'into', 'about', 'over', 'under', 'every', 'each', 'unknown', 'missing', 'recorded', 'update',
  'updated', 'retrieved', 'download', 'saved', 'copy',
];

/** French messages that are the same as the English message (outside the allow-list). */
export function identicalToEnglish(allow: readonly MessageKey[] = SAME_IN_BOTH): MessageKey[] {
  return (Object.keys(EN) as MessageKey[]).filter((k) => !allow.includes(k) && FR[k].trim() === EN[k].trim() && /[A-Za-zÀ-ÿ]{3}/.test(EN[k]));
}

function words(text: string): string[] {
  return text.toLowerCase().normalize('NFC').split(/[^a-zà-öø-ÿ’']+/).filter((w) => w.length > 0);
}

/**
 * English marker words in a piece of text. `ignore` lists words that are data (names, titles)
 * and so are allowed to be English. Words are matched whole and case-insensitively.
 * The token UNKNOWN, written in capitals, is the same in both languages and is not counted;
 * the same word in any other case still is.
 */
const UNKNOWN_TOKEN_RE = new RegExp(`(?<![\\p{L}\\p{N}])${UNKNOWN_WORD}(?![\\p{L}\\p{N}])`, 'gu');

export function englishWordsIn(text: string, ignore: readonly string[] = []): string[] {
  const skip = new Set(ignore.map((w) => w.toLowerCase()));
  const marks = new Set(ENGLISH_MARKERS);
  const hits = new Set<string>();
  for (const w of words(text.replace(UNKNOWN_TOKEN_RE, ' '))) if (marks.has(w) && !skip.has(w)) hits.add(w);
  return [...hits].sort();
}

/** French messages that contain English marker words, as "key: word" strings. */
export function englishInFrenchCatalog(ignoreByKey: Readonly<Partial<Record<MessageKey, readonly string[]>>> = {}): string[] {
  const out: string[] = [];
  for (const k of Object.keys(FR) as MessageKey[]) {
    for (const w of englishWordsIn(FR[k].replace(/\{\w+\}/g, ' '), ignoreByKey[k] ?? [])) out.push(`${k}: ${w}`);
  }
  return out;
}

/** English messages with no English marker word at all (proves the marker list can see English). */
export function englishMessagesWithoutMarkers(minWords = 6): MessageKey[] {
  return (Object.keys(EN) as MessageKey[]).filter((k) => words(EN[k].replace(/\{\w+\}/g, ' ')).length >= minWords && englishWordsIn(EN[k]).length === 0);
}

/** "{name}"-style markers left in rendered output. */
export function unfilledPlaceholders(text: string): string[] {
  return [...new Set(text.match(/\{\w+\}/g) ?? [])].sort();
}

/** Visible text of rendered HTML that is not data: English words found in a French page. */
export function englishInFrenchHtml(html: string, dataText: readonly string[] = []): string[] {
  let text = visibleText(html);
  // Longest first, so a name that contains another name is removed whole.
  for (const d of [...dataText].sort((a, b) => b.length - a.length)) if (d.length >= 3) text = text.split(d).join(' ');
  return englishWordsIn(text);
}

/** Catalogue keys present in only one language. */
export function missingTranslations(): string[] {
  const en = Object.keys(CATALOG.en);
  const fr = new Set(Object.keys(CATALOG.fr));
  const out = en.filter((k) => !fr.has(k)).map((k) => `fr missing: ${k}`);
  const enSet = new Set(en);
  for (const k of fr) if (!enSet.has(k)) out.push(`en missing: ${k}`);
  return out.sort();
}
