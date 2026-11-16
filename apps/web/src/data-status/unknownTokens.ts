/**
 * Placeholder text that stands for "not known". A licence written "N/A", "TBD" or "inconnu"
 * is not a licence, and a source called "unknown" has no name. Such values are treated as not
 * recorded, so every screen shows Unknown instead of a value that looks like data.
 * The list is exact-match after folding; nothing is guessed from similar words.
 */
const TOKENS: ReadonlySet<string> = new Set([
  '', '?', '??', '???', '-', '--', '---', 'n/a', 'na', 'n.a.', 'n.d.', 'nd', 'nil', 'none', 'null', 'undefined', 'tbd', 'tba', 'tbc',
  'unknown', 'unspecified', 'not available', 'not specified', 'not recorded', 'not stated', 'to be determined', 'to be confirmed',
  'inconnu', 'inconnue', 'non disponible', 'non precise', 'non precisee', 'non specifie', 'non specifiee', 'non renseigne', 'non renseignee',
  'aucun', 'aucune', 'a determiner', 'a confirmer', 'sans objet', 's/o',
]);

/** Lower-case, accents removed, dashes unified, spaces collapsed. */
export function foldToken(raw: string): string {
  return raw
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[‐-―−]/g, '-')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export function isUnknownToken(raw: string): boolean {
  return TOKENS.has(foldToken(raw));
}

/** Trimmed text, or null when it is missing, empty or a placeholder for "not known". */
export function cleanValue(v: string | null | undefined): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return isUnknownToken(t) ? null : t;
}

export const UNKNOWN_TOKEN_LIST: readonly string[] = [...TOKENS].filter((t) => t !== '');
