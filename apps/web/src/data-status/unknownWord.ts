/**
 * The word shown where a fact is not known. It is the same token in English and in French, in
 * capitals, so that it reads as a missing value and not as a description, and so that a file
 * saved in one language can be searched in the other.
 */
export const UNKNOWN_WORD = 'UNKNOWN';

const TOKEN_RE = new RegExp(`(?<![\\p{L}\\p{N}])${UNKNOWN_WORD}(?![\\p{L}\\p{N}])`, 'gu');

/**
 * Lower case for use inside a sentence, with the token left in capitals: "Update date UNKNOWN"
 * becomes "update date UNKNOWN". A word that merely contains the letters is lowered as usual.
 */
export function lowerKeepingToken(text: string): string {
  const parts = text.split(TOKEN_RE);
  return parts.map((p) => p.toLowerCase()).join(UNKNOWN_WORD);
}

/** True when the text holds the token as a whole word. */
export function hasUnknownToken(text: string): boolean {
  TOKEN_RE.lastIndex = 0;
  return TOKEN_RE.test(text);
}
