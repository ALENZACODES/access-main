/**
 * Text folding for the source search. Accents, ligatures and curly apostrophes are
 * ignored so "elevation" finds "Élévation" and "l'Ontario" finds "l’Ontario".
 * Every word typed must be found (any order); nothing is guessed or expanded.
 */
const LIGATURES: Readonly<Record<string, string>> = { œ: 'oe', Œ: 'oe', æ: 'ae', Æ: 'ae', ß: 'ss' };

export function foldText(raw: string): string {
  return raw
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[œŒæÆß]/g, (c) => LIGATURES[c] ?? c)
    .replace(/[‘’ʼ`´]/g, "'")
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Words of a query, folded; empty query gives no words. */
export function queryWords(query: string): string[] {
  const folded = foldText(query);
  return folded === '' ? [] : folded.split(' ');
}

/** True when every word of the query appears in the text. An empty query matches everything. */
export function matchesQuery(text: string, query: string): boolean {
  const words = queryWords(query);
  if (words.length === 0) return true;
  const hay = foldText(text);
  return words.every((w) => hay.includes(w));
}
