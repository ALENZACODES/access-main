/** Splitting a note into sentences and words for the reading score. The note is read as written and never changed. */

/** Notes are short; text past this is not read, never rejected. */
export const MAX_READ_CHARS = 5000;

/** Short forms whose full stop does not end a sentence. Compared in lower case without the stop. */
const ABBREVIATIONS = new Set(["st", "ave", "rd", "blvd", "dr", "no", "nos", "ste", "mr", "mrs", "ms", "mt", "ft", "e", "w", "n", "s", "approx", "etc", "boul", "av", "ch", "m", "mme", "apt", "unit", "fl", "bldg"]);

export type Token = { readonly kind: "word"; readonly text: string } | { readonly kind: "number"; readonly text: string };

/** Sentences in order, trimmed. A stop after a short form, between digits, or inside a run of dots does not end one. */
export function splitSentences(text: string): string[] {
  const src = text.slice(0, MAX_READ_CHARS).replace(/\s+/g, " ").trim();
  if (src === "") return [];
  const out: string[] = [];
  let start = 0;
  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i]!;
    if (ch !== "." && ch !== "!" && ch !== "?" && ch !== "…" && ch !== ";") continue;
    // swallow a run of end marks and closing quotes or brackets
    let j = i;
    while (j + 1 < src.length && /[.!?…"”’)\]]/.test(src[j + 1]!)) j += 1;
    const next = src[j + 1];
    if (next !== undefined && next !== " ") {
      i = j;
      continue;
    }
    if (ch === ".") {
      const before = /([\p{L}]+)$/u.exec(src.slice(start, i))?.[1]?.toLowerCase();
      if (before !== undefined && ABBREVIATIONS.has(before) && j === i) continue;
    }
    if (ch === ";") {
      // a semicolon only ends a sentence for scoring when what follows is long enough to stand alone
      const rest = src.slice(j + 1).trim();
      if (rest.split(" ").length < 4) continue;
    }
    const piece = src.slice(start, j + 1).trim();
    if (piece !== "") out.push(piece);
    start = j + 1;
    i = j;
  }
  const tail = src.slice(start).trim();
  if (tail !== "") out.push(tail);
  return out;
}

/** Words and numbers of one sentence. A word keeps inner apostrophes and hyphens; a number keeps its digits. */
export function tokensOf(sentence: string): Token[] {
  const out: Token[] = [];
  for (const m of sentence.matchAll(/[\p{L}\p{M}]+(?:['’-][\p{L}\p{M}]+)*|\p{N}+(?:[.,:]\p{N}+)*/gu)) {
    const text = m[0];
    out.push(/^\p{N}/u.test(text) ? { kind: "number", text } : { kind: "word", text });
  }
  return out;
}
