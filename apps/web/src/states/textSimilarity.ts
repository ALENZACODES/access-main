/**
 * Plain text-similarity measures for comparing two names or two streets. All of them work on text
 * already folded to lower case without accents (see `foldPlaceName`). They give a number from 0 (nothing
 * alike) to 1 (the same), and never fail on empty or odd text.
 */

/** Edit distance (insert, delete, change one letter). Stops early and returns max+1 once it is certain to exceed `max`. */
export function editDistance(a: string, b: string, max = Infinity): number {
  const x = [...a];
  const y = [...b];
  if (x.length === 0) return Math.min(y.length, max + 1);
  if (y.length === 0) return Math.min(x.length, max + 1);
  if (Math.abs(x.length - y.length) > max) return max + 1;
  let prev = Array.from({ length: y.length + 1 }, (_, i) => i);
  for (let i = 1; i <= x.length; i += 1) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= y.length; j += 1) {
      const cost = x[i - 1] === y[j - 1] ? 0 : 1;
      const v = Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + cost);
      cur.push(v);
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return max + 1;
    prev = cur;
  }
  return prev[y.length]!;
}

/** 1 minus the edit distance over the longer length. Two empty texts are not alike (0), so blanks never match. */
export function editSimilarity(a: string, b: string): number {
  const len = Math.max([...a].length, [...b].length);
  if (len === 0) return 0;
  return 1 - editDistance(a, b) / len;
}

/** Jaro-Winkler similarity: rewards a shared start, which suits names. */
export function jaroWinkler(a: string, b: string): number {
  const x = [...a];
  const y = [...b];
  if (x.length === 0 || y.length === 0) return 0;
  if (a === b) return 1;
  const window = Math.max(0, Math.floor(Math.max(x.length, y.length) / 2) - 1);
  const xm = new Array<boolean>(x.length).fill(false);
  const ym = new Array<boolean>(y.length).fill(false);
  let matches = 0;
  for (let i = 0; i < x.length; i += 1) {
    const lo = Math.max(0, i - window);
    const hi = Math.min(y.length - 1, i + window);
    for (let j = lo; j <= hi; j += 1) {
      if (ym[j] || x[i] !== y[j]) continue;
      xm[i] = true;
      ym[j] = true;
      matches += 1;
      break;
    }
  }
  if (matches === 0) return 0;
  let k = 0;
  let transpositions = 0;
  for (let i = 0; i < x.length; i += 1) {
    if (!xm[i]) continue;
    while (!ym[k]) k += 1;
    if (x[i] !== y[k]) transpositions += 1;
    k += 1;
  }
  const m = matches;
  const jaro = (m / x.length + m / y.length + (m - transpositions / 2) / m) / 3;
  let prefix = 0;
  while (prefix < Math.min(4, x.length, y.length) && x[prefix] === y[prefix]) prefix += 1;
  return jaro + prefix * 0.1 * (1 - jaro);
}

/** Words of the text, each once, in order. */
export function wordSet(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const w of text.split(/\s+/)) {
    if (w !== "" && !seen.has(w)) {
      seen.add(w);
      out.push(w);
    }
  }
  return out;
}

/** The share of words the two texts have in common, out of all the words either has. Word order does not matter. */
export function wordOverlap(a: string, b: string): number {
  const x = new Set(wordSet(a));
  const y = new Set(wordSet(b));
  if (x.size === 0 || y.size === 0) return 0;
  let both = 0;
  for (const w of x) if (y.has(w)) both += 1;
  return both / (x.size + y.size - both);
}

/** The best of the measures that suit names: a name written in a different word order, or with a letter off, still scores high. */
export function nameSimilarity(a: string, b: string): number {
  if (a === "" || b === "") return 0;
  return Math.max(jaroWinkler(a, b), wordOverlap(a, b), editSimilarity(a, b));
}
